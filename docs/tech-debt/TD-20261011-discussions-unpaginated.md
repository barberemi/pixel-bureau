---
name: td-20261011-discussions-unpaginated
description: Les crons lisent /discussions?per_page=200 sans pagination ; au-delà de 200 discussions, canards, trophée « bavard » et fil sont incomplets.
metadata:
  type: tech-debt
  audit_history:
    - date: 2026-10-11
      status: Verified in source
      reviewer: Full audit
---

# TD-20261011-discussions-unpaginated

- **Area**: Backend
- **Severity**: Medium
- **Status**: Verified in source
- **Effort**: S (< 1h)
- **Blast radius**: local (1-2 files)

## Problem (fact)
Trois scripts lisent une seule page de 200 discussions Kronn. Les runs, eux, sont paginés (`limit`/`offset`).

## Impact
Une fois le Kronn au-delà de 200 discussions, les données deviennent fausses sans erreur : le trophée « bavard » (compté « depuis toujours ») plafonne, des discussions du canard ou du jour disparaissent du fil selon l'ordre renvoyé par l'API.

## Where (pointers)
- `workflows/office_snapshot.py:35` : `ALL_DISCS = get("/discussions?per_page=200")`
- `workflows/duck_snapshot.py:139` : trophée « bavard », 10 discussions « depuis toujours »
- `workflows/gates_snapshot.py:90` : discussions du canard des 14 derniers jours

## Suggested direction
Un helper `get_all("/discussions", per_page=200)` dans `workflows/_lib.py` qui suit les pages jusqu'à une page incomplète (ou jusqu'à `since` quand le tri est par date), réutilisé par les trois scripts.

## Next step
`create ticket`
