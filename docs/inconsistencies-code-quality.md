# Qualité du code (audit ciblé, 2026-10-11)

Périmètre : page monofichier (`page/office_template.html`, `page/src/*.js`, `page/src/*.css`, concaténés par `tools/assemble.py`), crons Python stdlib (`workflows/*.py`), outils (`tools/*.py`). Pas de `TODO` / `FIXME` / `HACK` dans le code (recherche sur tous les fichiers suivis hors `guide/` et `docs/`).

| ID | Problem | Area | Severity |
|----|---------|------|----------|
| [TD-20261011-status-palettes-diverge](tech-debt/TD-20261011-status-palettes-diverge.md) | **Résolu le 2026-10-15 (#10).** Deux tables de couleurs de ticket qui ne concordent pas : « en cours » bleu dans `TCAT`, vert dans `CAT_COLOR` (`page/src/30-data.js:9`, `page/src/41-bubbles.js:4`) ; `ST_COLOR` / `ST_CSS` en double (`page/src/35-state.js:401`) | Frontend | Medium |
| [TD-20261011-localstorage-try-catch-copypaste](tech-debt/TD-20261011-localstorage-try-catch-copypaste.md) | 17 accès `localStorage` avec leur `try/catch` recopié ; `bureau:collapsed` écrit à l'identique dans 3 fichiers (`page/src/50-panel.js:120`) | Frontend | Low |
| [TD-20261011-run-pagination-copypaste](tech-debt/TD-20261011-run-pagination-copypaste.md) | Boucle de pagination des runs recopiée 4 fois dans 3 crons, sans helper dans `_lib.py` (`workflows/office_snapshot.py:24`) | Backend | Low |
| [TD-20261011-page-dead-functions](tech-debt/TD-20261011-page-dead-functions.md) | `setTeam` et `toggleStandup` jamais appelées (`page/src/30-data.js:184`, `page/src/76-tvscenes.js:189`) | Frontend | Low |
| [TD-20261011-install-god-file](tech-debt/TD-20261011-install-god-file.md) | `tools/install.py` de 710 lignes (repris, inchangé) (`tools/install.py:549`) | Other | Low |
| [TD-20261011-silent-partial-failures](tech-debt/TD-20261011-silent-partial-failures.md) | `except Exception: pass` sur des lectures d'API (repris, inchangé) (`workflows/gates_snapshot.py:92`) | Observability | Low |

## Checklist

| Point | Résultat |
|-------|----------|
| Gabarits : duplication, gabarits morts | Vérifié, rien à signaler : un seul gabarit HTML (`page/office_template.html`, 108 lignes), le reste du DOM est construit en JS |
| Gabarits : `style=` / `<script>` inline | 9 `style=` de pastilles de légende (`page/office_template.html:48`), comptés dans TD-20261011-status-palettes-diverge. Script inline unique imposé par les Live Pages (voir `docs/inconsistencies-tech-debt.md`) |
| Gabarits : taille, logique | Vérifié, rien à signaler |
| CSS : convention | Vérifié, rien à signaler : jetons `--…` dans `:root` (`page/src/styles.css:3`, 247 `var(--`), habillage pixel et thèmes dans des fichiers séparés (`page/src/pixel.css`, `page/src/theme-*.css`) |
| CSS : hex répétés | Finding : `#7a5cc8`, `#2f6fd6` (TD-20261011-status-palettes-diverge) |
| CSS : feuille globale > 1500 lignes | Vérifié, rien à signaler : `page/src/styles.css` fait 554 lignes |
| Fichiers dieux | `tools/install.py` (710 lignes, TD existant). `page/src/35-state.js` (544 lignes) et `page/src/70-kpis-feed.js` (422 lignes, 31 Ko) sont découpés en sections commentées sur un seul sujet : pas de nouveau finding |
| Code mort | Finding JS (TD-20261011-page-dead-functions). Python vérifié, rien à signaler : chaque `def` de `workflows/` et `tools/` est référencée |
| Erreurs avalées | JS : 19 `catch(e){}`, tous autour de `localStorage` ou du plein écran (voulu). Python : TD-20261011-silent-partial-failures |
| Copier-coller | 2 findings (localStorage, pagination des runs). `fail(msg)` en 3 lignes recopié dans 5 scripts d'action (`workflows/gate_decide.py:18`) : trop petit pour un finding |
| Typage | N/A : JS sans TypeScript et Python stdlib sans annotations, choix du projet (pas d'outillage, page monofichier) |
| TODO / FIXME / HACK | Vérifié, rien à signaler : 0 |
| Assets > 300 Ko | Vérifié, rien à signaler pour la page. 6 captures PNG > 300 Ko dans `guide/img/`, qui ne sont pas servies par la page |
| Requêtes en boucle | Déjà suivi par TD-20261011-office-cron-defs-per-pass et TD-20261011-crons-rescan-run-history (audit performance) |
| Mémoïsation | Déjà suivi par TD-20261011-side-panel-rebuilt-every-second (audit performance) |
