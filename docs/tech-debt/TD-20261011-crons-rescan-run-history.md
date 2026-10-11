---
name: td-20261011-crons-rescan-run-history
description: payroll_snapshot et duck_snapshot relisent à chaque passage horaire tout l'historique des runs de la semaine, par pages de 25 et en requêtes séquentielles.
metadata:
  type: tech-debt
  audit_history:
    - date: 2026-10-11
      status: Verified in source
      reviewer: Performance audit 0.8.2
    - date: 2026-10-11
      status: Deferred
      reviewer: Kronn audit validation card
      note: "Deferred through an audit validation card."
---

# TD-20261011-crons-rescan-run-history

- **Category**: performance
- **Area**: Backend (crons)
- **Severity**: Low
- **Status**: Deferred
- **Effort**: M (1-4h)
- **Blast radius**: module (3-5 files)

## Problem (fact)
- `payroll_snapshot.py` (cron horaire, minute 7) [src: file: workflows/templates/payroll.json:9] pagine les runs des 7 derniers jours de chaque agent actif, 25 par page [src: file: workflows/payroll_snapshot.py:37], alors que seuls les runs du jour changent d'un passage à l'autre.
- `duck_snapshot.py` (cron horaire « canard », minute 23) [src: file: workflows/templates/canard.json:9] pagine, pour le trophée « Zéro panne », tous les runs de la semaine précédente de chaque agent, 25 par page [src: file: workflows/duck_snapshot.py:120] ; ce résultat est figé jusqu'au lundi suivant.
- `office_snapshot.py` pagine les runs du jour par 15 [src: file: workflows/office_snapshot.py:24].
- Toutes les lectures passent par `get()` (`urllib`, séquentiel, timeout 120 s) [src: file: workflows/_lib.py:27].

## Impact
Le nombre de GET par passage croît avec le volume de runs de la semaine (environ runs_semaine / 25 + nombre d'agents), répété chaque heure pour un résultat identique à plus de 6/7 (payroll) ou à 100 % (trophée de la semaine passée). Durée des crons et charge de l'API Kronn non mesurées.

## Where (pointers)
- `workflows/payroll_snapshot.py:26-50`
- `workflows/duck_snapshot.py:112-127`
- `workflows/office_snapshot.py:22-28`
- `workflows/_lib.py:27-30`

## Suggested direction
Garder hors du dépôt (comme `~/.cache/kronn-bureau/purge.json`, `workflows/office_snapshot.py:9`) les agrégats des jours clos et le trophée de la semaine passée, ne relire que les runs du jour ; monter `limit` à la taille maximale acceptée par l'API.

## Next step
`create ticket`
