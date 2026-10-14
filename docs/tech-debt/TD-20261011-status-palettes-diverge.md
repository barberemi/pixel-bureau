---
name: td-20261011-status-palettes-diverge
description: Les couleurs des statuts de ticket existent en deux tables qui ne concordent pas (TCAT, CAT_COLOR), plus deux tables d'états tenues à la main (ST_COLOR, ST_CSS) et des hex recopiés dans le gabarit et le CSS.
metadata:
  type: tech-debt
  audit_history:
    - date: 2026-10-11
      status: Verified in source
      reviewer: Code-quality audit
    - date: 2026-10-12
      status: Partially resolved
      reviewer: mainteneur
    - date: 2026-10-11
      status: Confirmed by user
      reviewer: Kronn audit validation card
      note: "Confirmed through an audit validation card."
    - date: 2026-10-15
      status: Resolved
      reviewer: mainteneur
      note: "#10 : une seule table d'états (ST_PALETTE, d'où ST_COLOR et ST_CSS), #7a5cc8 en une seule copie (MEP_COLOR, var(--mep) en CSS), légende du gabarit peinte depuis les tables ; test tests/palettes.test.js."
---

# TD-20261011-status-palettes-diverge

- **Category**: code-quality
- **Area**: Frontend
- **Severity**: Medium
- **Status**: Resolved (2026-10-15, #10)
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
Fait le 2026-10-12 [src: user:mainteneur:2026-10-11: KT-19] : une seule palette des statuts de ticket, `TCAT` [src: file: page/src/30-data.js:10] (« en cours » vert `#2e9e5b`, « en review » bleu `#4a7fe0`, « déployé » ardoise `#647282`, contraste >= 3:1 sur les deux thèmes) ; `CAT_COLOR` en est dérivée [src: file: page/src/41-bubbles.js:4] ; légende du gabarit, chiffre « en cours » de la fiche et tuile KPI alignés. Un test vérifie que les deux tables concordent [src: file: tests/tickets-fiche.test.js:89].

Reste : les tables d'états des personnages `ST_COLOR` / `ST_CSS` tenues à la main, et `#7a5cc8` recopié dans le fil et le CSS.

Fait le 2026-10-15 (#10), sans changement visuel :
- une seule table d'états, `ST_PALETTE` [src: file: page/src/35-state.js:426] : chaque état y est soit un jeton du thème (`ok`, `info`, `warn`, `err`, `idle`), soit une couleur fixe. `ST_COLOR` (canvas) et `ST_CSS` (HTML) en sont dérivées [src: file: page/src/35-state.js:453] [src: file: page/src/35-state.js:454]. Le canvas prend la valeur figée du jeton dans `ST_TOKEN` [src: file: page/src/35-state.js:425], le HTML garde `var(--jeton)` et suit le thème (Classique, clair, sombre, thèmes de pack) : c'est la seule différence entre les deux vues, voulue. `absent` et `gone` restent sans couleur sur le canvas et `transparent` en HTML, comme avant ;
- `#7a5cc8` n'existe plus qu'une fois, `MEP_COLOR` [src: file: page/src/30-data.js:10], posé en `--mep` sur la racine pour le CSS [src: file: page/src/styles.css:286] ;
- la légende du gabarit n'a plus de couleur en dur : pastilles `data-st` / `data-cat` peintes au démarrage par `paintLegend()` [src: file: page/src/35-state.js:457] [src: file: page/src/90-boot.js:30] ;
- `tests/palettes.test.js` vérifie que chaque état a sa couleur, que les deux vues concordent, qu'il n'y a qu'une copie de `#7a5cc8` et que la légende garde ses couleurs d'avant.
