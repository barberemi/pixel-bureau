---
name: td-20261011-run-pagination-copypaste
description: La boucle « lire les runs d'un workflow page par page jusqu'à since » est recopiée 4 fois dans 3 crons, avec des tailles de page différentes, alors que _lib.py n'a pas de helper.
metadata:
  type: tech-debt
  audit_history:
    - date: 2026-10-11
      status: Verified in source
      reviewer: Code-quality audit
    - date: 2026-10-11
      status: Deferred
      reviewer: Kronn audit validation card
      note: "Deferred through an audit validation card."
---

# TD-20261011-run-pagination-copypaste

- **Category**: code-quality
- **Area**: Backend
- **Severity**: Low
- **Status**: Deferred
- **Effort**: S (< 1h)
- **Blast radius**: module (3-4 files)

## Problem (fact)
Quatre copies de la même boucle `limit`/`offset` qui s'arrête quand la page est courte ou remonte avant `since` :
- `workflows/office_snapshot.py:24` (pages de 15)
- `workflows/office_snapshot.py:82` (pages de 50)
- `workflows/duck_snapshot.py:120` (pages de 25)
- `workflows/payroll_snapshot.py:37` (pages de 25, condition d'arrêt dans le corps)

`workflows/_lib.py` (copié dans chaque script au rendu) a `get`, `run_row`, `step_row` mais aucune fonction de pagination des runs [src: file: workflows/_lib.py:27].

## Impact
Un changement de l'API des runs Kronn (pagination, champ `started_at`) se corrige en quatre endroits ; les tailles de page divergent déjà sans raison écrite.

## Where (pointers)
- `workflows/office_snapshot.py:24`, `workflows/office_snapshot.py:82`
- `workflows/duck_snapshot.py:120`
- `workflows/payroll_snapshot.py:37`

## Suggested direction
Un générateur `runs_since(wid, since, page=25)` dans `_lib.py`, réutilisé par les trois crons ; voir aussi [TD-20261011-crons-rescan-run-history](TD-20261011-crons-rescan-run-history.md) pour le coût de ces relectures.

## Next step
`create ticket`
