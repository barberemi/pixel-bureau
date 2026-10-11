---
name: td-20261011-office-cron-defs-per-pass
description: office_snapshot relit la définition de chaque workflow cron (un GET par cron) toutes les 10 minutes, sans le cache que gates_snapshot utilise déjà.
metadata:
  type: tech-debt
  audit_history:
    - date: 2026-10-11
      status: Verified in source
      reviewer: Performance audit 0.8.2
---

# TD-20261011-office-cron-defs-per-pass

- **Category**: performance
- **Area**: Backend (crons)
- **Severity**: Low
- **Status**: Verified in source
- **Effort**: S (< 1h)
- **Blast radius**: local (1-2 files)

## Problem (fact)
Pour lister les crons, `office_snapshot.py` fait un `GET /workflows/{id}` par workflow cron actif hors Bureau, à chaque passage [src: file: workflows/office_snapshot.py:116]. Le cron tourne toutes les 10 minutes [src: file: workflows/templates/office.json:9]. La planification d'un workflow change rarement. `gates_snapshot.py` lit les mêmes définitions avec un cache de 600 s [src: file: workflows/gates_snapshot.py:23] [src: file: workflows/gates_snapshot.py:30].

## Impact
N requêtes séquentielles de plus par passage (N = nombre de workflows cron), soit 6 N par heure d'ouverture, pour une donnée quasi statique. Allonge la durée du cron (API Kronn locale, coût unitaire non mesuré).

## Where (pointers)
- `workflows/office_snapshot.py:114-118` : boucle `for w in WFS` + `get("/workflows/" + w["id"])`
- `workflows/gates_snapshot.py:30-37` : `definition(wid)` avec cache

## Suggested direction
Mutualiser `definition(wid)` dans `workflows/_lib.py` (cache disque avec TTL, invalidé par `updated_at` du workflow si l'API le donne) et l'utiliser dans les deux scripts.

## Next step
`create ticket`
