---
name: td-20261011-sprites-unpinned-master
description: build_sprites.py télécharge des PNG depuis la branche master d'un dépôt tiers, sans version figée.
metadata:
  type: tech-debt
  audit_history:
    - date: 2026-10-11
      status: Verified in source
      reviewer: Security audit 0.8.2
---

# TD-20261011-sprites-unpinned-master

- **Category**: security
- **Area**: Supply chain
- **Severity**: Low
- **Status**: Verified in source
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
