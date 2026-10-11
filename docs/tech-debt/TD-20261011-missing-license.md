---
name: td-20261011-missing-license
description: Aucun fichier LICENSE à la racine alors que le dépôt embarque des sprites LPC sous CC-BY-SA 3.0 / GPL 3.0.
metadata:
  type: tech-debt
  audit_history:
    - date: 2026-10-11
      status: Verified in source
      reviewer: Full audit
      note: dépôt GitHub privé (`gh repo view` : visibility PRIVATE, licenseInfo null)
    - date: 2026-10-11
      status: Confirmed by user
      reviewer: Kronn audit validation card
      note: "Confirmed through an audit validation card."
---

# TD-20261011-missing-license

- **Area**: Other
- **Severity**: Medium
- **Status**: Confirmed by user
- **Effort**: S (< 1h)
- **Blast radius**: local (1-2 files)

## Problem (fact)
Pas de `LICENSE`, `LICENSE.md` ni `LICENSE.txt`. Le README crédite les sprites LPC (CC-BY-SA 3.0 / GPL 3.0) et la police Press Start 2P (OFL 1.1, fichier `page/fonts/OFL-PressStart2P.txt`), mais le code lui-même n'a pas de licence.

## Impact
Sans licence, personne d'autre que l'auteur n'a le droit d'utiliser le code (installation par une autre équipe, ouverture du dépôt). Le mélange avec des assets copyleft rend le choix de licence non trivial : à trancher avant tout partage.

## Where (pointers)
- `README.md:63` : crédit de la police (OFL)
- `README.md:65` : crédit des sprites LPC (CC-BY-SA 3.0 / GPL 3.0)

## Suggested direction
Choisir une licence pour le code compatible avec la redistribution des sprites (ex. GPL-3.0 pour l'ensemble, ou une licence permissive pour le code avec un `ASSETS-LICENSE` séparé) et l'ajouter à la racine.

## Next step
`create ticket`
