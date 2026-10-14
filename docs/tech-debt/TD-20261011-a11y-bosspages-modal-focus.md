---
name: td-20261011-a11y-bosspages-modal-focus
description: La modale « Mes pages Kronn » ne piège pas le focus et ne le rend pas à la fermeture.
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
      note: "#1 : le reste de la page est inerte pendant l'ouverture, Tab et Maj+Tab bouclent dans la fenêtre, Échap et Fermer rendent le focus à l'élément d'avant ou, ouverte depuis le canvas, au plan (tabindex -1)."
---

# TD-20261011-a11y-bosspages-modal-focus

- **Category**: accessibility
- **WCAG**: 2.4.3 Focus Order
- **Area**: Focus
- **Severity**: Low
- **Status**: Resolved (2026-10-15, #1)
- **Effort**: S (< 1h)
- **Blast radius**: local (1-2 files)

## Problem (fact)
`openBossPages` crée un `role="dialog"` `aria-modal="true"` et place le focus sur la première carte [src: file: page/src/47-bosspages.js:52-56]. Aucun gestionnaire `Tab` ne retient le focus dans la boîte ; le reste de la page n'est pas rendu `inert`. `closeBossPages` supprime les nœuds sans rendre le focus à un déclencheur [src: file: page/src/47-bosspages.js:58] (le déclencheur est le canvas, non focalisable, voir TD-20261011-a11y-canvas-mouse-only).

## Impact
Clavier seul et lecteurs d'écran : Tab sort de la modale vers la page masquée par le fond ; après Échap le focus retombe sur `<body>`.

## Suggested direction
Mémoriser `document.activeElement` à l'ouverture, poser `inert` sur `.wrap` pendant l'ouverture, et rendre le focus à la fermeture.

## Next step
`create ticket`
