---
name: td-20261011-install-god-file
description: tools/install.py fait 710 lignes (questions, Jira, GitHub, plan, upsert des workflows, config) dans un seul fichier.
metadata:
  type: tech-debt
  audit_history:
    - date: 2026-10-11
      status: Verified in source
      reviewer: Full audit
    - date: 2026-10-11
      status: Verified in source
      reviewer: Code-quality audit (toujours 710 lignes ; jira:231, github:327, reuse:437, upsert_all:549 inchangés)
    - date: 2026-10-11
      status: Deferred
      reviewer: Kronn audit validation card
      note: "Deferred through an audit validation card."
---

# TD-20261011-install-god-file

- **Area**: Other
- **Severity**: Low
- **Status**: Deferred
- **Effort**: L (1+ day)
- **Blast radius**: local (1-2 files)

## Problem (fact)
`tools/install.py` (710 lignes) mêle l'interface de questions, la détection Jira (`jira`, ligne 231), GitHub (`github`, ligne 327), la réutilisation d'une installation (`reuse`, ligne 437), le choix du plan et la création des workflows (`upsert_all`, ligne 549). `page/src/35-state.js` (544 lignes) est le second fichier au-dessus de 500 lignes.

## Impact
Chaque évolution de l'installateur touche le même fichier ; les 24 tests de `tests/test_install.py` passent par un faux Kronn complet faute de pouvoir tester une étape isolée.

## Where (pointers)
- `tools/install.py:231` : `jira(ask, ...)`
- `tools/install.py:327` : `github(ask, ...)`
- `tools/install.py:437` : `reuse(ask, ...)`
- `tools/install.py:549` : `upsert_all(k, ...)`

## Suggested direction
Sortir les étapes Jira, GitHub et plan dans des modules `tools/install_*.py`, `install.py` ne gardant que l'enchaînement.

## Next step
`create ticket`
