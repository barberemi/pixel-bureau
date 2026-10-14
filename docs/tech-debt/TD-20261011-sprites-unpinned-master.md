---
name: td-20261011-sprites-unpinned-master
description: build_sprites.py télécharge des PNG depuis la branche master d'un dépôt tiers, sans version figée.
metadata:
  type: tech-debt
  audit_history:
    - date: 2026-10-11
      status: Verified in source
      reviewer: Security audit 0.8.2
    - date: 2026-10-11
      status: Confirmed by user
      reviewer: Kronn audit validation card
      note: "Confirmed through an audit validation card."
    - date: 2026-10-15
      status: Resolved
      reviewer: mainteneur
      note: "#9 : sprites/build_sprites.py et sprites/credits.py lisent le générateur LPC au commit 9bf06be (master du 2026-10-14), constante LPC_COMMIT vérifiée par tests/test_public.py. Pas de sha256 par fichier : une URL raw sur un SHA de commit est déjà figée. Sprites non régénérés : l'API GitHub montre que spritesheets/ et CREDITS.csv n'ont pas changé en amont depuis le 2026-08-16, avant le premier commit des sprites (2026-10-04) ; les fichiers lus sont donc les mêmes et aucune capture ne change."
---

# TD-20261011-sprites-unpinned-master

- **Category**: security
- **Area**: Supply chain
- **Severity**: Low
- **Status**: Resolved (2026-10-15, #9)
- **Effort**: S (< 1h)
- **Blast radius**: local (1-2 files)

## Problem (fact)
`BASE` pointe sur `raw.githubusercontent.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/master/spritesheets` [src: file: sprites/build_sprites.py:11], lu par `urllib.request.urlopen` [src: file: sprites/build_sprites.py:22]. Pas de commit figé ni de contrôle d'empreinte.

## Impact
Un changement ou une compromission du dépôt amont modifie silencieusement les sprites générés (contenu image seulement, pas de code exécuté).

## Suggested direction
Remplacer `master` par un SHA de commit et, au besoin, vérifier un sha256 des fichiers téléchargés.

## Next step
`create ticket`
