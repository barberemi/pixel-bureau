---
name: td-20261011-no-automated-gate
description: Ni CI, ni linter, ni hook : tools/test.sh n'est lancé qu'à la main, et rien n'empêche un commit qui casse les tests.
metadata:
  type: tech-debt
  audit_history:
    - date: 2026-10-11
      status: Verified in source
      reviewer: Full audit
    - date: 2026-10-11
      status: Confirmed by user
      reviewer: Kronn audit validation card
      note: "Confirmed through an audit validation card."
    - date: 2026-10-12
      status: Partially resolved
      reviewer: mainteneur
      note: "KT-37 : CI GitHub Actions (.github/workflows/tests.yml) verte sur main et sur la PR #1. Reste : l'exiger par la protection de main (KT-58). Pas de linter."
    - date: 2026-10-12
      status: Resolved
      reviewer: KT-37 / KT-57
      note: "CI sur chaque PR et push sur main, avec contrat crons -> page, installation de zéro, régression visuelle et règle du guide (KT-57) ; hook pre-push contre le push direct sur main (KT-58). L'exigence de la CI par une règle de branche attend le dépôt public (KT-64). Pas de linter (choix assumé)."
---

# TD-20261011-no-automated-gate

- **Area**: CI
- **Severity**: Low
- **Status**: Resolved (2026-10-12, KT-37 et KT-57 ; règle de branche exigeant la CI : KT-64)
- **Effort**: M (1-4h)
- **Blast radius**: local (1-2 files)

## Problem (fact)
Pas de dossier `.github/`, de `.pre-commit-config.yaml`, ni de config de linter JS ou Python. Le seul contrôle est `sh tools/test.sh`, à lancer à la main avant `tools/publish.py`.

## Impact
Avec des commits fréquents écrits en partie par des agents, une régression (ou un test rouge, cf. TD-20261011-test-install-tmpdir) peut rester sur `main` jusqu'au prochain lancement manuel. Le dépôt est privé et la publication reste manuelle, d'où la sévérité basse.

## Where (pointers)
- `tools/test.sh:1-12` : unique point d'entrée des contrôles
- `docs/coding-rules.md:59` : linter Python non configuré
- `docs/coding-rules.md:42` : linter CSS non configuré

## Suggested direction
Un workflow GitHub Actions minimal (`node --test`, `unittest`, `tools/smoke.py` sans Chrome) sur chaque push, ou un hook `pre-push` local qui lance `tools/test.sh`.

## Next step
`create ticket`
