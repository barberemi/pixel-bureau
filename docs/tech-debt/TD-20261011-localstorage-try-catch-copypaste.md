---
name: td-20261011-localstorage-try-catch-copypaste
description: 17 accès à localStorage recopient chacun leur try/catch vide ; la clé bureau:collapsed est sérialisée à l'identique dans 3 fichiers.
metadata:
  type: tech-debt
  audit_history:
    - date: 2026-10-11
      status: Verified in source
      reviewer: Code-quality audit
    - date: 2026-10-11
      status: Deferred
      reviewer: Kronn audit validation card
      note: "Deferred through an audit validation card."
    - date: 2026-11-21
      status: Resolved
      reviewer: fix/a11y-prefs-crons
      note: "#16"
---

# TD-20261011-localstorage-try-catch-copypaste

- **Category**: code-quality
- **Area**: Frontend
- **Severity**: Low
- **Status**: Resolved
- **Effort**: S (< 1h)
- **Blast radius**: module (5-10 files)

## Problem (fact)
`page/src/*.js` compte 19 `catch(e){}` vides, dont 17 autour de `localStorage.getItem` / `setItem` dans 10 fichiers, sans fonction commune. Le `catch` vide est voulu (navigation privée), c'est la recopie qui pose problème. La même écriture `localStorage.setItem('bureau:collapsed',JSON.stringify(COLLAPSED))` est recopiée dans trois fichiers :
- `page/src/50-panel.js:120`
- `page/src/60-fiches.js:178`
- `page/src/72-whoboard.js:93`

Autres copies : `page/src/01-skin.js:5`, `page/src/20-sprites.js:77`, `page/src/39-duck.js:200`, `page/src/44-loupe.js:14`, `page/src/55-actions.js:58`, `page/src/70-kpis-feed.js:335`, `page/src/75-tv.js:2`.

## Impact
Le préfixe `bureau:`, la sérialisation JSON et la tolérance aux erreurs sont redits à chaque préférence ; une nouvelle préférence recopie le motif, et un renommage de clé se fait à la main dans plusieurs fichiers.

## Where (pointers)
- `page/src/50-panel.js:120`, `page/src/60-fiches.js:178`, `page/src/72-whoboard.js:93` : même clé, même code
- `page/src/70-kpis-feed.js:335-339`, `page/src/70-kpis-feed.js:414-420` : 4 accès dans un fichier

## Suggested direction
Deux petites fonctions `pref(key, def)` / `setPref(key, v)` (JSON + try/catch) dans un fichier chargé tôt (`01-*.js`), et une `saveCollapsed()` unique.

## Next step
`create ticket`

## Resolution (2026-11-21, #16)
`pref`, `prefStr`, `setPref`, `dropPref` (`page/src/00-prefs.js`) et `saveCollapsed` : plus aucun `localStorage` direct hors de 00-prefs.js, sauf le sondage de `47-todos.js` ; les valeurs gardées en texte (thème, étage, fil, TV, loupe) se relisent telles quelles.
