---
name: td-20261011-no-automated-gate
description: Ni CI, ni linter, ni hook : tools/test.sh n'est lancé qu'à la main, et rien n'empêche un commit qui casse les tests.
metadata:
  type: tech-debt
  audit_history:
    - date: 2026-10-11
      status: Verified in source
      reviewer: Full audit
---

# TD-20261011-no-automated-gate

- **Area**: CI
- **Severity**: Low
- **Status**: Verified in source
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
