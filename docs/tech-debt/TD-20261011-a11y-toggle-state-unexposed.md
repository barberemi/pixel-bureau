---
name: td-20261011-a11y-toggle-state-unexposed
description: Plusieurs boutons bascule n'exposent leur état que par la classe CSS on.
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
---

# TD-20261011-a11y-toggle-state-unexposed

- **Category**: accessibility
- **WCAG**: 4.1.2 Name, Role, Value
- **Area**: ARIA
- **Severity**: Low
- **Status**: Confirmed by user
- **Effort**: S (< 1h)
- **Blast radius**: local (3-4 files)

## Problem (fact)
- « ● Direct » / « ▶ Rejouer » : `classList.toggle('on', ...)` seulement [src: file: page/src/80-input.js:52-53].
- « 🔍 Loupe » : `classList.toggle('on', on)` seulement [src: file: page/src/44-loupe.js:137].
- Filtre du fil « Important / Tout » : `classList.toggle('on', ...)` seulement [src: file: page/src/70-kpis-feed.js:385], alors que les types du fil voisins ont `aria-pressed` [src: file: page/src/70-kpis-feed.js:388].
- « ☀ Récap » ouvre/ferme `#recap` sans `aria-expanded` ni `aria-controls` [src: file: page/src/69-recap.js:50].

Les autres bascules du projet le font déjà (`page/src/50-panel.js:103`, `page/src/65-editor.js:155`).

## Impact
Lecteurs d'écran : l'état (actif, ouvert) n'est pas annoncé ; seul le rendu visuel le montre.

## Suggested direction
Poser `aria-pressed` sur Direct, Rejouer, Loupe et Important/Tout, et `aria-expanded` + `aria-controls="recap"` sur le bouton Récap, aux mêmes endroits que le `classList.toggle`.

## Next step
`create ticket`
