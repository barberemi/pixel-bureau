---
name: td-20261011-a11y-clickable-divs
description: Tuiles KPI, lignes du fil et légende de la loupe sont cliquables mais pas focalisables au clavier.
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
      note: "#2 : tuiles KPI cliquables, lignes du fil qui ouvrent quelque chose et titre de la légende de la loupe en tabindex 0 + role button, activés par Entrée ou Espace (keyClick) ; focus rendu après redessin des tuiles et du fil."
---

# TD-20261011-a11y-clickable-divs

- **Category**: accessibility
- **WCAG**: 2.1.1 Keyboard ; 4.1.2 Name, Role, Value
- **Area**: Clavier
- **Severity**: Medium
- **Status**: Resolved (2026-10-15, #2)
- **Effort**: S (< 1h par élément)
- **Blast radius**: local (1-2 files)

## Problem (fact)
- Tuiles KPI « La prod aujourd'hui » et « Les agents » : `<section class="dash ... click" data-open="tv|paie">`, ouvertes par un `click` délégué [src: file: page/src/70-kpis-feed.js:67] [src: file: page/src/70-kpis-feed.js:72] [src: file: page/src/70-kpis-feed.js:3]. Ni `tabindex`, ni `role="button"`, ni gestion Entrée/Espace.
- Lignes du fil : `<div class="ev" data-i>` et `<div class="ev" data-pin>` avec `cursor:pointer` [src: file: page/src/70-kpis-feed.js:379] [src: file: page/src/70-kpis-feed.js:373] [src: file: page/src/styles.css:149] ; le clic ouvre la personne, le plateau TV ou le canard [src: file: page/src/70-kpis-feed.js:404-407]. Les liens `.lk` internes à certaines lignes restent accessibles, la ligne entière non (lignes du canard épinglées : aucune alternative).
- Loupe : `<div class="lh" title="Ouvrir sa fiche">` avec `onclick` [src: file: page/src/44-loupe.js:110-113].

## Impact
Utilisateurs clavier seul : pas d'ouverture de la fiche de paie, du plateau TV ni des fiches depuis le fil ou la loupe. Lecteurs d'écran : ces éléments ne sont pas annoncés comme interactifs.

## Suggested direction
Rendre ces cibles en `<button>` (ou ajouter `role="button" tabindex="0"` + Entrée/Espace comme `page/src/50-panel.js:121`).

## Next step
`create ticket`
