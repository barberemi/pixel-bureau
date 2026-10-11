---
name: td-20261011-side-panel-rebuilt-every-second
description: Le panneau latéral est vidé puis reconstruit en entier chaque seconde (une toile de portrait par personnage), sans comparaison avec le rendu précédent.
metadata:
  type: tech-debt
  audit_history:
    - date: 2026-10-11
      status: Verified in source
      reviewer: Performance audit 0.8.2
---

# TD-20261011-side-panel-rebuilt-every-second

- **Category**: performance
- **Area**: Frontend
- **Severity**: Low
- **Status**: Verified in source
- **Effort**: M (1-4h)
- **Blast radius**: local (1-2 files)

## Problem (fact)
La boucle appelle `renderSide()` une fois par seconde [src: file: page/src/90-boot.js:19]. `renderSide` fait `side.innerHTML=''` puis `drawSide(side)` [src: file: page/src/50-panel.js:47] : tous les éléments du panneau (boutons de filtre, groupes « L'équipe », « Les agents », « Les visiteurs du jour », une carte par personnage) sont recréés [src: file: page/src/50-panel.js:108], et chaque carte crée une nouvelle `<canvas>` de portrait 40×40 [src: file: page/src/50-panel.js:23]. Le fil, les KPI, le récap et « Qui fait quoi » comparent leur HTML à une signature avant d'écrire (`FEED_SIG`, `KPI_SIG`, `RECAP_SIG`, `WHO_SIG`) [src: file: page/src/70-kpis-feed.js:390] ; le panneau n'a pas cette garde (seule la ligne d'état en a une, `refreshStatus`) [src: file: page/src/50-panel.js:66]. Même écriture sans garde, plus légère : badge de fraîcheur [src: file: page/src/33-freshness.js:87] et barre du mode TV [src: file: page/src/75-tv.js:73].

## Impact
Une destruction et reconstruction du DOM du panneau par seconde, même quand rien n'a changé : recalcul de style et de mise en page, quelques dizaines de toiles allouées puis jetées, survol et sélection de texte perdus dans le panneau (le focus clavier est restauré à la main par `refocus`). Coût CPU continu sur un écran TV allumé toute la journée ; non mesuré.

## Where (pointers)
- `page/src/90-boot.js:19` : `renderSide()` dans le bloc « toutes les secondes »
- `page/src/50-panel.js:40-52` : `renderSide`, `side.innerHTML=''`
- `page/src/50-panel.js:22-28` : `portrait()`, une toile par appel
- `page/src/20-sprites.js:66` : `renderSide()` aussi appelé quand la file des planches se vide

## Suggested direction
Construire le HTML (ou une clé d'état : sélection, filtre, repli, états affichés) et ne remplacer le panneau que si la clé change, comme `FEED_SIG` ; garder les portraits en cache par personnage et apparence.

## Next step
`create ticket`
