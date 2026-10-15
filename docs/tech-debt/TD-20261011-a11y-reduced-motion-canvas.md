---
name: td-20261011-a11y-reduced-motion-canvas
description: prefers-reduced-motion est respecté en CSS seulement ; les animations du plan et la loupe l'ignorent.
metadata:
  type: tech-debt
  audit_history:
    - date: 2026-10-11
      status: Verified in source
      reviewer: Accessibility audit 0.8.2
    - date: 2026-10-11
      status: Confirmed by user
      reviewer: Kronn audit validation card
      note: "Confirmed through an audit validation card."
    - date: 2026-10-15
      status: Resolved
      reviewer: mainteneur
      note: "#3 : prefers-reduced-motion lu une fois par matchMedia (REDUCED_MOTION, 00-config.js) : themeOverlay ne dessine rien, loupe automatique éteinte par défaut (un choix du bouton passe avant), défilements en behavior auto ; guide (thèmes, loupe) mis à jour."
---

# TD-20261011-a11y-reduced-motion-canvas

- **Category**: accessibility
- **WCAG**: 2.2.2 Pause, Stop, Hide ; 2.3.3 Animation from Interactions (AAA, indicatif)
- **Area**: Mouvement
- **Severity**: Low
- **Status**: Resolved (2026-10-15, #3)
- **Effort**: M (demi-journée)
- **Blast radius**: local (3-4 files)

## Problem (fact)
`prefers-reduced-motion` n'apparaît que dans deux règles CSS : bandeau TV et flash de la tuile sprint [src: file: page/src/styles.css:257] [src: file: page/src/styles.css:355]. Aucun `matchMedia` dans `page/src/`. Restent animés sans condition : effets de thème au-dessus du plan (chauves-souris, flocons, confettis, feux d'artifice, éclairs) [src: file: page/src/46-themes.js:197-215], ouverture automatique de la loupe sur un événement fort [src: file: page/src/44-loupe.js:1-8], défilement `behavior:'smooth'` [src: file: page/src/70-kpis-feed.js:400]. En direct, le plan n'a pas de bouton pause (« ▶ Rejouer » ne vaut que pour le rejeu, `page/src/80-input.js:58`). La loupe se coupe avec son bouton.

## Impact
Utilisateurs sensibles au mouvement (troubles vestibulaires) et attention (cognitif) : animation de fond continue qu'on ne peut ni réduire ni arrêter.

## Suggested direction
Lire `matchMedia('(prefers-reduced-motion: reduce)')` une fois : couper `themeOverlay`, désactiver la loupe automatique par défaut et utiliser `behavior:'auto'`.

## Next step
`create ticket`
