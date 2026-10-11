---
name: td-20261011-status-palettes-diverge
description: Les couleurs des statuts de ticket existent en deux tables qui ne concordent pas (TCAT, CAT_COLOR), plus deux tables d'états tenues à la main (ST_COLOR, ST_CSS) et des hex recopiés dans le gabarit et le CSS.
metadata:
  type: tech-debt
  audit_history:
    - date: 2026-10-11
      status: Verified in source
      reviewer: Code-quality audit
---

# TD-20261011-status-palettes-diverge

- **Category**: code-quality
- **Area**: Frontend
- **Severity**: Medium
- **Status**: Verified in source
- **Effort**: M (1-4h)
- **Blast radius**: module (5-10 files)

## Problem (fact)
Deux tables donnent la couleur d'une catégorie de ticket, avec des valeurs différentes :
- `TCAT` [src: file: page/src/30-data.js:9] : `doing` `#2f6fd6` (bleu), `review` `#e0a020`, `todo` `#9a9284`. Utilisée par les bureaux et les fiches (`page/src/40-furniture.js:304`, `page/src/60-fiches.js:118`).
- `CAT_COLOR` [src: file: page/src/41-bubbles.js:4] : `doing` `#2e9e5b` (vert), `review` `#4a7fe0`, `todo` `#8a8478`. Utilisée par les bulles, la tuile KPI, le fil, « Qui fait quoi » et la TV (`page/src/70-kpis-feed.js:53`, `page/src/72-whoboard.js:25`, `page/src/76-tvscenes.js:33`).

La légende du gabarit annonce « en cours » en `#2f6fd6` [src: file: page/office_template.html:61], alors que la tuile KPI écrit « en cours » en vert.

Les états des personnages ont aussi deux tables parallèles de 22 clés tenues à la main : `ST_COLOR` (hex pour le canvas) [src: file: page/src/35-state.js:401] et `ST_CSS` (mêmes valeurs, en `var(--…)` quand un jeton existe) [src: file: page/src/35-state.js:425].

`#7a5cc8` (test / mise en prod) apparaît 16 fois dans `page/src/*.js`, 4 fois dans `page/src/styles.css` et dans le gabarit ; `#2f6fd6` 12 fois dans le JS alors que `--accent` le porte déjà [src: file: page/src/styles.css:3]. Le gabarit a 9 pastilles de légende en `style="background:…"` [src: file: page/office_template.html:48].

## Impact
Un même ticket « en cours » change de couleur selon la vue, et changer une couleur de statut demande de retrouver chaque copie (tables JS, CSS, légende HTML) sans qu'aucun test ne signale un oubli.

## Where (pointers)
- `page/src/30-data.js:9` : `TCAT`
- `page/src/41-bubbles.js:4` : `CAT_COLOR`
- `page/src/35-state.js:401` et `page/src/35-state.js:425` : `ST_COLOR` / `ST_CSS`
- `page/office_template.html:61` : légende en hex
- `page/src/70-kpis-feed.js:133`, `page/src/70-kpis-feed.js:292` : `#7a5cc8` en dur dans le HTML du fil

## Suggested direction
Une seule table de catégories (couleur + libellé) et une seule table d'états, `ST_CSS` dérivée de `ST_COLOR` ; légende du gabarit générée depuis ces tables ou passée en classes.

## Next step
Différence non voulue : « en cours » doit être **vert** partout [src: user:mainteneur:2026-10-11: KT-19]. Harmoniser les tables vers le vert dans la même passe que l'unification des tables.
