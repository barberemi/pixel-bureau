---
name: td-20261011-page-size-near-kronn-limit
description: La page assemblée pèse 961 621 octets pour une limite Kronn de 1 000 000 ; il reste environ 38 Ko de marge.
metadata:
  type: tech-debt
  audit_history:
    - date: 2026-10-11
      status: Verified in source
      reviewer: Full audit
      note: taille mesurée en lançant `python3 tools/smoke.py` (démo) ; 782 805 caractères de script en installation neuve (`--empty`)
    - date: 2026-10-11
      status: Verified in source
      reviewer: Performance audit 0.8.2
      note: repris comme constat de poids de page (tout est inliné dans un seul HTML, pas de découpage possible dans la sandbox Live Pages) ; pas de nouvelle mesure
    - date: 2026-10-11
      status: Confirmed by user
      reviewer: Kronn audit validation card
      note: "Confirmed through an audit validation card."
    - date: 2026-10-12
      status: Partially fixed
      reviewer: KT-28
      note: "page publiée 980 079 -> 852 934 octets : JS et CSS compactés à l'assemblage (tools/compact.py, environ 91 Ko), sprites inutilisés non embarqués (environ 36 Ko), alerte du smoke à 90 %. Reste : calques LPC de l'éditeur (330 Ko) et sprites fournis (115 Ko) dans le HTML ; piste dataset en attente de la raison de la limite Kronn."
---

# TD-20261011-page-size-near-kronn-limit

- **Area**: Frontend
- **Severity**: Medium
- **Status**: Partially fixed (KT-28, 2026-10-12)
- **Effort**: M (1-4h)
- **Blast radius**: module (5-10 files)

## Problem (fact)
`dist/office.html` de démo fait 961 621 octets ; le smoke refuse au-delà de 1 000 000, limite imposée par la sandbox des Live Pages Kronn. Tout (JS, CSS, sprites et polices en `data:`, snapshots de démo) est inliné.

## Impact
Au rythme d'un lot de fonctionnalités par semaine, quelques lots suffisent pour dépasser la limite : le smoke passe au rouge et la page ne peut plus être publiée tant qu'on n'a pas trouvé de place.

## Where (pointers)
- `tools/smoke.py:20` : `LIMIT = 1_000_000`
- `tools/smoke.py:35` : contrôle de taille
- `tools/assemble.py:304-305` : snapshots de démo `data/*.json` inlinés dans la page de démo
- `tools/assemble.py:318` : rappel « limite Kronn : 1 000 000 »
- `guide/developpement.md:48` : sandbox inline seulement, HTML de moins de 1 Mo

## Suggested direction
Mesurer la part de chaque bloc (JS, CSS, sprites, polices, données de démo) dans `assemble.py`, l'afficher dans le smoke avec un seuil d'alerte (ex. 90 %), puis réduire le plus gros poste (sprites dédupliqués ou recompressés, minification légère du JS).

## Next step
`create ticket`
