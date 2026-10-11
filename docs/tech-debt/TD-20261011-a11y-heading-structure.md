---
name: td-20261011-a11y-heading-structure
description: Saut de niveau h1 vers h4 et titres h2 transformés en boutons.
metadata:
  type: tech-debt
  audit_history:
    - date: 2026-10-11
      status: Verified in source
      reviewer: Accessibility audit 0.8.2
---

# TD-20261011-a11y-heading-structure

- **Category**: accessibility
- **WCAG**: 1.3.1 Info and Relationships ; 2.4.6 Headings and Labels
- **Area**: Sémantique
- **Severity**: Low
- **Status**: Verified in source
- **Effort**: S (< 1h)
- **Blast radius**: local (3 files)

## Problem (fact)
- Le premier titre après `<h1>Le Bureau</h1>` est un `<h4>` (« Qui », « Où », « États », « Enveloppes ») dans l'aide de la légende [src: file: page/office_template.html:15] [src: file: page/office_template.html:57] ; le `<h2>` du fil vient après [src: file: page/office_template.html:80].
- Les en-têtes de groupe repliables sont des `<h2 role="button">` [src: file: page/src/50-panel.js:115-117] [src: file: page/src/72-whoboard.js:76] ; le rôle `button` remplace le rôle `heading`, ces titres disparaissent de la navigation par titres.

## Impact
Lecteurs d'écran : plan des titres incohérent, sections « L'équipe », « Les agents », « Qui fait quoi » introuvables au raccourci de titres.

## Suggested direction
Passer les `<h4>` de la légende en `<h3>` et mettre un `<button aria-expanded>` à l'intérieur des `<h2>` au lieu de `role="button"` sur le titre.

## Next step
`create ticket`
