---
name: td-20261011-community-scaffolding
description: Pas de CONTRIBUTING.md, CODE_OF_CONDUCT.md, modèle d'issue ni modèle de PR.
metadata:
  type: tech-debt
  audit_history:
    - date: 2026-10-11
      status: Verified in source
      reviewer: Full audit
      note: regroupe 4 manques Low de la checklist « community standards » ; dépôt privé
    - date: 2026-10-11
      status: Confirmed by user
      reviewer: Kronn audit validation card
      note: "Confirmed through an audit validation card."
    - date: 2026-10-12
      status: Resolved
      reviewer: KT-30
      note: "CONTRIBUTING.md, CODE_OF_CONDUCT.md (Contributor Covenant 2.1 en français), .github/pull_request_template.md, formulaires d'issue bug / idée / dette, config.yml (pas d'issue vierge, sécurité en privé), CODEOWNERS ; section Contribuer du README."
---

# TD-20261011-community-scaffolding

- **Area**: Docs
- **Severity**: Low
- **Status**: Resolved (KT-30, 2026-10-12)
- **Effort**: S (< 1h)
- **Blast radius**: local (1-2 files)

## Problem (fact)
Aucun `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `.github/ISSUE_TEMPLATE/` ni `.github/pull_request_template.md` (pas de dossier `.github/`). Les règles de contribution (doc + captures dans le même commit, un commit par changement, tests Chrome) ne vivent que dans `guide/developpement.md` et `docs/`.

## Impact
Sans effet tant qu'un seul humain contribue ; à l'ouverture du dépôt ou à l'arrivée d'un contributeur, les règles du projet ne sont pas visibles là où GitHub les cherche.

## Where (pointers)
- `guide/developpement.md:45-48` : règles de développement actuelles
- racine du dépôt : fichiers absents

## Suggested direction
`CONTRIBUTING.md` qui renvoie vers `guide/developpement.md` ; modèle de PR avec la case « page du guide + ligne du README + captures » ; code de conduite standard (Contributor Covenant).

## Next step
`create ticket`
