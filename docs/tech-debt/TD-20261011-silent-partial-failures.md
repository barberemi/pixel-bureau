---
name: td-20261011-silent-partial-failures
description: Plusieurs crons avalent les erreurs d'API ou d'écriture (except Exception: pass) et publient des listes vides comme si tout allait bien.
metadata:
  type: tech-debt
  audit_history:
    - date: 2026-10-11
      status: Verified in source
      reviewer: Full audit
    - date: 2026-10-11
      status: Verified in source
      reviewer: Code-quality audit (gates_snapshot.py:92 toujours `except Exception: pass` sur /discussions)
    - date: 2026-10-11
      status: Confirmed by user
      reviewer: Kronn audit validation card
      note: "Confirmed through an audit validation card."
    - date: 2026-10-15
      status: Resolved
      reviewer: mainteneur
      note: "#8 : chaque échec avalé qui laisse un dataset incomplet écrit sur stderr et alimente une liste warnings du dataset (gates, payroll, office, live, bosspages, gitfut, actions, duck, mails, avatars) ; la page les lit (readWarnings, 33-freshness.js) et les affiche dans le diagnostic du panneau Fraîcheur ; les except qui protègent un cache restent silencieux ; tests tests/test_scripts.py (faux Kronn en échec, contrat crons -> page) et tests/lot4.test.js."
---

# TD-20261011-silent-partial-failures

- **Area**: Observability
- **Severity**: Low
- **Status**: Resolved (2026-10-15, #8)
- **Effort**: M (1-4h)
- **Blast radius**: module (5-10 files)

## Problem (fact)
14 blocs `except ...: pass` dans `workflows/`. Certains protègent des caches (acceptable), d'autres des lectures d'API dont l'échec produit un dataset partiel sans trace : projets et discussions du canard dans `gates_snapshot.py`, tarif mesuré dans `payroll_snapshot.py`.

## Impact
L'indicateur de fraîcheur de la page ne voit que les crons en retard ou en échec ; un cron qui réussit avec une partie vide (« aucun canard », pas de tarif) passe inaperçu et le diagnostic demande de relancer le script à la main.

## Where (pointers)
- `workflows/gates_snapshot.py:79-83` : `/projects` en échec → noms de projets vides
- `workflows/gates_snapshot.py:86-93` : `/discussions` en échec → aucun canard
- `workflows/payroll_snapshot.py:59-67` : `/stats/tokens` en échec → tarif absent
- `workflows/office_snapshot.py:101-108` : bilan de purge non écrit ou non relu
- `workflows/_lib.py:58`, `workflows/_lib.py:154`, `workflows/_lib.py:165`

## Suggested direction
Garder le comportement dégradé mais l'écrire sur stderr (visible dans le run Kronn) et ajouter au dataset une liste `warnings` que `33-freshness.js` peut afficher.

## Next step
`create ticket`
