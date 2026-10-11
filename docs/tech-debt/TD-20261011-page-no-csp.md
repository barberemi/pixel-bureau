---
name: td-20261011-page-no-csp
description: Le gabarit de la page ne déclare pas de Content-Security-Policy.
metadata:
  type: tech-debt
  audit_history:
    - date: 2026-10-11
      status: Verified in source
      reviewer: Security audit 0.8.2
---

# TD-20261011-page-no-csp

- **Category**: security
- **Area**: Headers
- **Severity**: Low
- **Status**: Verified in source
- **Effort**: S (< 1h)
- **Blast radius**: local (1-2 files)

## Problem (fact)
Le `<head>` ne contient que `charset`, `viewport` et `title` [src: file: page/office_template.html:3-10]. Pas de `<meta http-equiv="Content-Security-Policy">`. Les en-têtes HTTP de la Live Page sont posés par Kronn, hors dépôt.

## Impact
Si un `esc()` manque un jour dans un des puits `innerHTML`, aucune seconde barrière ne bloque un script injecté via un titre de PR ou de ticket.

## Suggested direction
Ajouter une meta CSP compatible avec le JS inline (par exemple `script-src 'self' 'unsafe-inline'` + `object-src 'none'` + `base-uri 'none'`), puis la tester avec `sh tools/test.sh --chrome`.

## Next step
`create ticket`
