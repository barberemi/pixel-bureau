---
name: td-20261011-page-dead-functions
description: Deux fonctions de la page ne sont appelées nulle part (setTeam, toggleStandup).
metadata:
  type: tech-debt
  audit_history:
    - date: 2026-10-11
      status: Verified in source
      reviewer: Code-quality audit
    - date: 2026-10-11
      status: Confirmed by user
      reviewer: Kronn audit validation card
      note: "Confirmed through an audit validation card."
---

# TD-20261011-page-dead-functions

- **Category**: code-quality
- **Area**: Frontend
- **Severity**: Low
- **Status**: Confirmed by user
- **Effort**: XS (< 15 min)
- **Blast radius**: local (1-2 files)

## Problem (fact)
Recherche de chaque `function` / `const` / `let` de premier niveau de `page/src/*.js` dans toute la page, le gabarit, `tests/` et `tools/` : deux noms n'apparaissent qu'à leur définition.
- `setTeam` [src: file: page/src/30-data.js:184] (le chargement passe par d'autres chemins ; `setTeamAvatars` est un autre nom)
- `toggleStandup` [src: file: page/src/76-tvscenes.js:189] (les raccourcis passent par `SCENE_KEYS` et `toggleScenes`)

Les fonctions Python de `workflows/` et `tools/` sont toutes référencées (même recherche).

## Impact
Code concaténé à portée globale : un nom mort reste visible de tous les fichiers et laisse croire à un point d'entrée encore utilisé.

## Where (pointers)
- `page/src/30-data.js:184`
- `page/src/76-tvscenes.js:189`

## Suggested direction
Supprimer les deux définitions.

## Next step
`create ticket`
