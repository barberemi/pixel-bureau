# Performance (audit ciblé 0.8.2, 2026-10-11)

Périmètre : page unique en canvas (`page/src/*.js`, boucle à 30 images/s `page/src/90-boot.js:3`) servie par Kronn Live Pages, et crons Python stdlib (`workflows/*.py`) qui lisent l'API Kronn locale. Pas de base de données (N+1 SQL, index, pool : N/A), pas de serveur propre (en-têtes de cache, CDN : gérés par Kronn, N/A), pas d'APM ni de RUM (page interne servie par Kronn ; seul compteur interne : `composeMs`, `page/src/20-sprites.js:54`).

Déjà en place, non signalé : fond et meubles cuits une fois (`page/src/90-boot.js:29-31`), voile de nuit recalculé toutes les 200 ms en basse résolution (`page/src/42-light.js:86`), planches de sprites composées sous budget de 8 ms par image (`page/src/20-sprites.js:56`), fil paginé (`FEED_N`, `page/src/70-kpis-feed.js:378`), signatures HTML sur fil, KPI, récap et « Qui fait quoi », cache de 600 s des définitions dans `workflows/gates_snapshot.py:23`, purge des runs limitée à deux passages par jour (`workflows/office_snapshot.py:8`).

| ID | Problem | Area | Severity |
|----|---------|------|----------|
| [TD-20261011-page-size-near-kronn-limit](tech-debt/TD-20261011-page-size-near-kronn-limit.md) | Page démo de 961 621 octets pour une limite de 1 000 000 ; tout est inliné dans un seul HTML (`tools/smoke.py:20`) | Frontend (poids) | Medium |
| [TD-20261011-side-panel-rebuilt-every-second](tech-debt/TD-20261011-side-panel-rebuilt-every-second.md) | Panneau latéral vidé et reconstruit chaque seconde, une toile de portrait par personnage, sans signature (`page/src/50-panel.js:47`) | Frontend (DOM) | Low |
| [TD-20261011-office-cron-defs-per-pass](tech-debt/TD-20261011-office-cron-defs-per-pass.md) | Un `GET /workflows/{id}` par cron toutes les 10 min pour lire la planification, sans cache (`workflows/office_snapshot.py:116`) | Backend (crons) | Low |
| [TD-20261011-crons-rescan-run-history](tech-debt/TD-20261011-crons-rescan-run-history.md) | Crons horaires qui relisent tout l'historique des runs de la semaine par pages de 25, en séquentiel (`workflows/payroll_snapshot.py:37`, `workflows/duck_snapshot.py:120`) | Backend (crons) | Low |
