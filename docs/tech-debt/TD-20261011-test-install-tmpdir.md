---
name: td-20261011-test-install-tmpdir
description: test_own_layout_file échoue quand TMPDIR est dans le dépôt (cas des agents sous Kronn) ; set -e coupe alors tools/test.sh avant les smoke.
metadata:
  type: tech-debt
  audit_history:
    - date: 2026-10-11
      status: Verified in source
      reviewer: Full audit
      note: reproduit en lançant `sh tools/test.sh` avec TMPDIR=<dépôt>/.kronn/tmp (96 tests, 1 échec)
    - date: 2026-10-11
      status: Confirmed by user
      reviewer: Kronn audit validation card
      note: "Confirmed through an audit validation card."
    - date: 2026-10-12
      status: Resolved
      reviewer: mainteneur
      note: "KT-42 : le test pose explicitement un plan hors du dépôt (chemin absolu) et un plan dans le dépôt (chemin relatif)."
---

# TD-20261011-test-install-tmpdir

- **Area**: Backend
- **Severity**: Medium
- **Status**: Resolved (2026-10-12, KT-42)
- **Effort**: S (< 1h)
- **Blast radius**: local (1-2 files)

## Problem (fact)
`tools/install.py` rend relatif un chemin de plan situé sous la racine du dépôt ; `test_own_layout_file` crée son plan dans `tempfile` et attend le chemin absolu. Avec `TMPDIR=<dépôt>/.kronn/tmp` (environnement des agents lancés par Kronn), le test échoue.

## Impact
`sh tools/test.sh` est rouge pour tout agent qui tourne sous Kronn ; avec `set -e`, les smoke (dont `--chrome`) ne tournent pas. Le contrôle exigé avant publication n'est donc pas exécutable tel quel, et un vrai échec peut se cacher derrière celui-ci.

## Where (pointers)
- `tools/install.py:147-148` : `os.path.relpath` quand le plan est sous `ROOT`
- `tests/test_install.py:227-232` : `test_own_layout_file`, assertion sur le chemin absolu
- `tools/test.sh:5` : `set -e`
- `docs/gotchas/tmpdir-dans-le-depot.md` : contournement `TMPDIR=/tmp` (note retirée à la résolution)

## Suggested direction
Rendre le test indépendant de `TMPDIR` : créer le plan dans un dossier temporaire explicitement hors du dépôt (`tempfile.mkdtemp(dir="/tmp")`), ou faire attendre au test le chemin relatif quand le fichier tombe sous la racine. Alternative : forcer `TMPDIR=/tmp` dans `tools/test.sh`.

## Next step
`create ticket`
