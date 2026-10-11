---
name: td-20261011-a11y-skip-link-main-landmark
description: Pas de lien d'évitement ni de repère main dans la page.
metadata:
  type: tech-debt
  audit_history:
    - date: 2026-10-11
      status: Verified in source
      reviewer: Accessibility audit 0.8.2
---

# TD-20261011-a11y-skip-link-main-landmark

- **Category**: accessibility
- **WCAG**: 2.4.1 Bypass Blocks ; 1.3.1 Info and Relationships
- **Area**: Sémantique
- **Severity**: Low
- **Status**: Verified in source
- **Effort**: S (< 1h)
- **Blast radius**: local (1-2 files)

## Problem (fact)
La zone principale est `<div class="main">` [src: file: page/office_template.html:27] ; aucun `<main>` ni `role="main"` dans le gabarit. `<header>`, `<aside>` et `<footer>` existent [src: file: page/office_template.html:13] [src: file: page/office_template.html:85] [src: file: page/office_template.html:87]. Pas de lien « Aller au contenu » (aucune occurrence de `skip` dans `page/`). Avant le fil, la tabulation traverse l'en-tête, les KPI, la barre du rejeu et « Qui fait quoi ».

## Impact
Clavier seul et lecteurs d'écran : pas de saut direct vers le plan, le fil ou le panneau.

## Suggested direction
Remplacer `<div class="main">` par `<main class="main">` et ajouter en tête de `<body>` un lien d'évitement visible au focus.

## Next step
`create ticket`
