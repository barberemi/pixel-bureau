---
name: td-20261011-href-scheme-unchecked
description: Les URL des datasets sont échappées dans href mais leur schéma n'est pas vérifié.
metadata:
  type: tech-debt
  audit_history:
    - date: 2026-10-11
      status: Verified in source
      reviewer: Security audit 0.8.2
---

# TD-20261011-href-scheme-unchecked

- **Category**: security
- **Area**: XSS
- **Severity**: Low
- **Status**: Verified in source
- **Effort**: S (< 1h)
- **Blast radius**: module (several files in page/src)

## Problem (fact)
`href="${esc(url)}"` sans contrôle du schéma : `page/src/60-fiches.js:59`, `page/src/60-fiches.js:219`, `page/src/60-fiches.js:334`, `page/src/62-ticket.js:87`, `page/src/70-kpis-feed.js:103`. Seul `page/src/38-passions.js:111` vérifie `^https://`. Les URL viennent des API GitHub (`html_url`, `url`) via les crons [src: file: workflows/live_snapshot.py:68] [src: file: workflows/team_shape.py:113].

## Impact
Une URL `javascript:` dans un dataset (source amont altérée) s'exécuterait au clic dans l'origine de la page. Risque faible : les sources sont les API GitHub/Kronn.

## Suggested direction
Un helper `safeUrl(u)` qui ne garde que `https:` (comme `38-passions.js`), appliqué dans `extA` et les autres `href` dynamiques.

## Next step
`create ticket`
