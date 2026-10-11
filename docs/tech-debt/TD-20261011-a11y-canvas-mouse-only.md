---
name: td-20261011-a11y-canvas-mouse-only
description: Les zones cliquables du plan (canvas) et ses infobulles ne sont accessibles qu'à la souris.
metadata:
  type: tech-debt
  audit_history:
    - date: 2026-10-11
      status: Verified in source
      reviewer: Accessibility audit 0.8.2
    - date: 2026-10-11
      status: Accepted decision
      reviewer: Kronn audit validation card
      note: "Accepted as an intentional decision and recorded in docs/decisions.md."
---

# TD-20261011-a11y-canvas-mouse-only

- **Category**: accessibility
- **WCAG**: 2.1.1 Keyboard
- **Area**: Clavier
- **Severity**: Medium
- **Status**: Accepted decision
- **Effort**: M (demi-journée)
- **Blast radius**: local (1-2 files)

## Problem (fact)
Le `<canvas id="cv">` n'a pas de `tabindex` [src: file: page/office_template.html:30]. Ses interactions sont des écouteurs souris : `mousemove` pour l'infobulle `#tip` (zones et piles de tickets des bureaux) [src: file: page/src/80-input.js:10] et `click` qui ouvre une personne, une zone ou la modale des pages du boss [src: file: page/src/80-input.js:48]. Zones concernées : `duck`, `bosspages`, `paie`, `tv`, `kanban`, `planning`, `calendar`, `emp` [src: file: page/src/80-input.js:47]. Les personnes ont un équivalent clavier (liste du panneau, `page/src/50-panel.js:136` ; « Qui fait quoi », `page/src/72-whoboard.js:80`). `openBossPages` n'a pas d'autre appelant que le clic sur le canvas. Les tuiles KPI qui mènent à `tv` et `paie` ne sont pas focalisables non plus (voir TD-20261011-a11y-clickable-divs).

## Impact
Utilisateurs clavier seul et lecteurs d'écran : pas d'accès aux fiches Kanban, planning des crons, calendrier, canard, employé du mois, pages du boss, ni aux comptes de tickets par pile.

## Suggested direction
Ajouter dans le panneau latéral (vue « Toute l'équipe ») une rangée de boutons vers ces zones, appelant `select(z)` / `openBossPages()`.

## Next step
`create ticket`
