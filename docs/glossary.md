# Glossary

Terms marked `<!-- TODO: ask user -->` need human confirmation.

| Category | Term | Definition | Reference |
|----------|------|-----------|-----------|
| Architecture | Le Bureau | La Live Page Kronn en pixel art de ce dépôt : l'équipe et ses agents IA dans un open space [src: file: README.md:3] | [architecture/overview](architecture/overview.md) |
| Architecture | Page assemblée | `dist/office.html`, produit par `tools/assemble.py` à partir de `page/office_template.html` et `page/src/*` ; jamais édité à la main [src: file: tools/assemble.py:316] [src: file: guide/developpement.md:48] | [repo-map](repo-map.md) |
| Architecture | `page/src/NN-*.js` | Script de la page, concaténé dans l'ordre des noms en un seul `<script>` à portée globale, sans modules [src: file: guide/developpement.md:9] | [repo-map](repo-map.md) |
| Architecture | Marqueurs d'assemblage (`__LAYOUT__`, `__LAYERS__`, `/*__SCRIPTS__*/`…) | Emplacements de `office_template.html` / `00-config.js` remplacés par `assemble.py` (plan, calques LPC, styles, scripts) [src: file: page/src/00-config.js:1] [src: file: tools/assemble.py:298] [src: file: guide/developpement.md:7] | |
| Architecture | `page_config()` | Partie de `bureau.config.json` transmise à la page par `assemble.py` [src: file: guide/developpement.md:36] | |
| Architecture | Dataset | Données JSON d'une Live Page, publiées par un cron ; Le Bureau en crée 12 : `office`, `live`, `team`, `gates`, `payroll`, `avatars`, `bosspages`, `gitfut`, `layout`, `actions`, `duck`, `absences` [src: file: tools/install.py:27] | |
| Architecture | Cron du Bureau | Workflow Kronn « Le Bureau · … » à 0 token dont les étapes Exec lancent un script de `workflows/` et publient un dataset [src: file: workflows/templates/office.json:9] [src: file: workflows/templates/office.json:50] | [repo-map](repo-map.md) |
| Architecture | Modèle de workflow | `workflows/templates/*.json` : source des 13 workflows et 2 Quick Prompts (15 fichiers), rendue et poussée par `tools/templates.py` / `publish.py workflows` [src: file: tools/templates.py:24] | |
| Architecture | Emplacements `@@…@@` | Variables remplacées au rendu des modèles (`@@page_id@@`, `@@jira.*@@`, `@@script:workflows/x.py@@`, `@@cron_hours@@`…) ; interdites dans un script de cron [src: file: guide/developpement.md:73] | |
| Architecture | `_lib.py` / `_plan.py` | Socle commun des scripts de cron et règles des plans, recopiés dans chaque script au rendu (Kronn lance `python3 -c`) [src: file: guide/developpement.md:10] | |
| Architecture | `bureau.config.json` | Config propre à chaque installation (Kronn, ids de page et de workflows, Jira, GitHub, `rhythm`, `owner`, `team`…), jamais commitée [src: file: guide/developpement.md:21] | |
| Architecture | Profil d'équipe | Dossier de l'équipe, pack hors du dépôt ou `teams/<équipe>/` local (aucun livré) : `team.json`, `roster.json`, `defaults.json`, `music/`, `cast.json`, `sprites/` [src: file: guide/developpement.md:13] | |
| Architecture | Roster | Liste des personnes de l'équipe : celle du profil puis `people` de la config, lue par `roster()` de `assemble.py` [src: file: guide/developpement.md:23] | |
| Architecture | Plan (`bureau-layout/1`) | Format JSON des plans de bureau `layouts/*.json` (`tiles`, `legend`, `furniture`, `spots`, `seating`…), vérifié par `tools/plan.py check` [src: file: tools/plan.py:1] [src: file: guide/developpement.md:89] | |
| Architecture | Plan type | `layouts/open-space.json`, plan par défaut d'une équipe neuve [src: file: tools/assemble.py:127] | |
| Architecture | Plan embarqué / plan d'équipe partagé | Plan intégré à l'assemblage, remplacé au démarrage par le dataset `layout` s'il est publié (workflow « Le Bureau · plan », validé par le boss) [src: file: guide/developpement.md:104] | |
| Architecture | Zone | Lieu logique où se rend un personnage (`desk`, `srv`, `meet`, `gate`, `stage`, `coffee`, `visit`…) ; le type d'étape Kronn en cours donne la zone d'un agent (`KIND_ZONE`), avec repli `ZONE_FALLBACK` si le plan n'a pas la zone [src: file: page/src/35-state.js:2] [src: file: page/src/35-state.js:453] | |
| Architecture | Machine à états | Calcul de l'état et de la zone de chaque personnage à un instant `t` (`35-state.js`) [src: file: page/src/35-state.js:1] | |
| Architecture | Famille | Catégorie d'un personnage : `team` (humains), `wf` (agents IA), `vis` (visiteurs) [src: file: page/src/41-people.js:3] | |
| Architecture | Thème de page (skin) | Fichier `page/src/theme-<id>.css` de couleurs seules (le Classique, sombre ; les autres viennent du pack d'équipe), choisi au bouton 🎨 (masqué s'il n'y a qu'un thème) ; habillage commun dans `pixel.css` [src: file: guide/developpement.md:54] | |
| Architecture | Démo | Aperçu local, captures et tests sur l'équipe fictive Dunder Mifflin (`data/*.json`, `tests/fixtures/bureau.config.json`) ; jamais dans la page publiée [src: file: guide/developpement.md:118] | [testing-quality](testing-quality.md) |
| Domain | Collègue | Personne de l'équipe (roster ou ajoutée à l'installation), dessinée en couleur à sa place [src: file: guide/fonctionnalites/01-plan.md:11] | |
| Domain | Agent | Workflow Kronn représenté par un personnage en hologramme bleu, son étape dans un nuage [src: file: guide/fonctionnalites/01-plan.md:12] | |
| Domain | Visiteur | Discussion Kronn du jour, en salle de réunion puis au café [src: file: guide/fonctionnalites/01-plan.md:13] | |
| Domain | Boss | Personne qui a installé la page (`owner`) ; occupe le bureau du boss, décide les gates [src: file: guide/fonctionnalites/01-plan.md:14] | |
| Domain | Invité de passage / héraut | Personnage de la clé `guests` (communs : Gandalf, Yoda) qui passe une fois par jour ouvré ; le héraut (`on: "reopen"`) annonce un ticket réouvert [src: file: guide/fonctionnalites/01-plan.md:15] [src: file: guide/developpement.md:28] [src: file: guide/developpement.md:31] | |
| Domain | Intérimaire | Personne présente dans les données mais hors roster, sprite `temp`, assise sur les `free_seats` [src: file: page/src/30-data.js:55] [src: file: page/src/10-world.js:42] | |
| Domain | Gate | Étape de validation d'un workflow Kronn en attente d'une décision humaine ; décidée depuis la page (action `bureau-gate`) [src: file: workflows/gates_snapshot.py:1] | |
| Domain | MEP | Mise en production, suivie par les runs de déploiement GitHub (`github.repo`, `github.deploys`) ; fêtée sur le plateau TV [src: file: guide/developpement.md:24] [src: file: page/src/35-state.js:53] | |
| Domain | Gel des MEP | Jours sans mise en prod (`rhythm.mep_freeze`, défaut vendredi au dimanche), plateau fermé [src: file: page/src/00-config.js:35] [src: file: page/src/30-data.js:135] | |
| Domain | Rythme (`rhythm`) | Réglages horaires de l'équipe : fuseau, daily, heures de bureau, gel des MEP, planning, rétro [src: file: page/src/00-config.js:35] [src: file: guide/developpement.md:30] | |
| Domain | Daily / stand-up | Point quotidien de l'équipe (`rhythm.daily`, défaut 09:40, 15 min), joué en salle de réunion et en mode TV [src: file: page/src/00-config.js:35] [src: file: page/src/76-tvscenes.js:1] | |
| Domain | Cérémonies | Sprint planning (vendredi 10h, animé par la facilitatrice) et rétrospective (jeudi 15h, une semaine sur deux, animateur tiré au sort) [src: file: guide/developpement.md:30] | |
| Domain | Facilitatrice | Rôle de l'équipe qui anime le sprint planning et le stand-up [src: file: page/src/30-data.js:155] | |
| Domain | Plateau (TV) | Zone `p` du plan où l'on monte pour une MEP ; porte fermée pendant le gel (`closable`) [src: file: guide/developpement.md:89] [src: file: guide/developpement.md:90] | |
| Domain | Fiche | Panneau latéral d'un personnage ou d'un objet (agent, collègue, Kanban, planning, paie, canard…) [src: file: page/src/60-fiches.js:1] [src: file: page/src/50-panel.js:86] | |
| Domain | Fiche de paie | Tokens, runs et échecs par agent, aujourd'hui et sur 7 jours, avec un coût en $ estimé (dataset `payroll`) [src: file: workflows/payroll_snapshot.py:1] | |
| Domain | Employé du sprint | Cadre au mur de la cafétéria, objet cliquable avec sa fiche [src: file: page/src/40-furniture.js:281] | |
| Domain | Écran du boss | Pages Kronn de l'installation montrées en miniatures (`boss_pages`, dataset `bosspages`) [src: file: guide/developpement.md:21] [src: file: workflows/pages_snapshot.py:7] | |
| Domain | Le canard | Canard en plastique qui se promène (`duckAt(t)`, fonction pure du temps) et grandit avec le sprint : stades, canetons, succès (dataset `duck`) [src: file: guide/developpement.md:32] [src: file: guide/developpement.md:33] | |
| Domain | Succès (trophée) | Objectif d'équipe du canard (ex. « Zéro panne » : aucun agent avec 3 échecs d'affilée la semaine dernière) qui lui donne un accessoire [src: file: page/src/39-duckgame.js:20] [src: file: workflows/duck_snapshot.py:111] | |
| Domain | Passions | Cartes de fiche personnelles (GitFut, Smash Bros, top 3 dramas) et objets dessinés au bureau [src: file: page/src/38-passions.js:4] | |
| Domain | Rejouer | Relecture accélérée de la journée de minuit à maintenant ; tout est daté par les données [src: file: README.md:14] [src: file: docs/briefing.md:33] | |
| Domain | Mode TV | Affichage d'open space lisible à 3 m (`?tv=1`), scènes `daily`, `planning`, `retro` [src: file: guide/fonctionnalites/06-mode-tv.md:8] [src: file: guide/developpement.md:30] | |
| Domain | Loupe | Mise en avant des événements forts sur le plan (réouverture, MEP, visite, cérémonies) [src: file: README.md:11] | |
| Domain | Pile | Barres de tickets sur un bureau (`pileOf`) et feuilles ou dossiers sur le caisson (`rolePile`) [src: file: guide/developpement.md:27] | |
| Domain | Catégorie de statut Jira (`jira.flow`) | Correspondance des statuts du board vers les étapes connues de la page (défaut `JIRA_FLOW` : `Proposed`, `To Test`, `To Deploy`, `Reopen`) [src: file: tools/assemble.py:126] | |
| Domain | Absences et télétravail | Dataset `absences` lu dans le planning Excel SharePoint de l'équipe par Microsoft Graph [src: file: guide/developpement.md:34] | |
| Environment | Kronn local | Instance Kronn lancée sur la machine, interface par défaut `http://localhost:5173/` (`kronn_ui`) [src: file: page/src/00-config.js:53] | [environments](environments.md) |
| Environment | Heure du bureau / UTC | Page et scripts en heure du bureau (`rhythm.timezone`, défaut Europe/Paris) ; crons Kronn en UTC, heures calculées par `cron_hours()` [src: file: guide/developpement.md:116] | |
| Environment | Chrome headless | Navigateur piloté (via websocket-client) pour `test.sh --chrome`, captures et miniatures [src: file: tools/smoke.py:96] [src: file: workflows/pages_snapshot.py:7] | [testing-quality](testing-quality.md) |
| Environment | venv du dépôt | `.venv` avec Pillow et websocket-client pour les outils [src: file: guide/developpement.md:42] | |
| External | Kronn | Plateforme hôte : Live Pages, datasets, workflows, crons, Quick Prompts, API locale [src: file: README.md:3] [src: file: tools/install.py:1] | |
| External | Live Page | Page HTML hébergée par Kronn, sandbox inline seulement, moins de 1 Mo [src: file: guide/developpement.md:48] | |
| External | Étape Exec | Étape de workflow Kronn qui lance un script ; sortie limitée à 100 Ko [src: file: guide/developpement.md:76] | |
| External | `PublishPageData`, `CollectApiData`, `ApiCall`, `Gate`, `SubWorkflow` | Types d'étapes de workflow Kronn [src: file: page/src/35-state.js:2] | |
| External | Quick Prompt | Prompt Kronn réutilisable, lancé depuis la page (ex. « interroger un agent », « plan vers brouillon ») [src: file: page/src/55-actions.js:136] [src: file: tools/plan.py:24] | |
| External | Action de page (`kronn-action`) | Bloc `<script type="application/kronn-action">` lu par Kronn dans le HTML statique, qui lie un bouton à un workflow ou Quick Prompt (`bureau-ask`, `bureau-relaunch`, `bureau-gate`, `bureau-mep`…) [src: file: page/office_template.html:93] | |
| External | Jira | Sprint, tickets, Kanban, changelog, vélocité, lus via la connexion Atlassian de Kronn [src: file: README.md:35] [src: file: workflows/templates/canard.json:56] | |
| External | GitHub (`gh`) | PR et runs de déploiement, lus avec `gh api` et ETag (304 gratuit) [src: file: workflows/live_snapshot.py:3] | |
| External | Microsoft Graph / SharePoint | Lecture du planning Excel des absences via la connexion Kronn « Microsoft 365 » [src: file: guide/developpement.md:34] | |
| External | LPC | Universal LPC Spritesheet Character Generator : calques des avatars pixel art [src: file: page/src/20-sprites.js:2] [src: file: README.md:65] | |
| External | GitFut | Service externe `gitfut.com` de cartes de joueur à partir d'un login GitHub (dataset `gitfut`) [src: file: page/src/38-passions.js:102] | |
| External | CLI `claude` | Utilisée par `tools/plan.py from-image` (`claude -p`), remplaçable par `BUREAU_CLAUDE` [src: file: guide/developpement.md:105] | |

## Abbreviations

| Abbr | Full form | Context |
|------|-----------|---------|
| MEP | Mise en production | Déploiements suivis, plateau TV, gel des MEP [src: file: page/src/30-data.js:74] |
| KT-&lt;n&gt; | Identifiant de ticket du projet | En tête de fichier ou de bloc de fonctionnalité (ex. KT-1 absences) [src: file: guide/developpement.md:34] ; tâche de la planification Kronn du projet [src: user:mainteneur:2026-10-11: KT-19] |
| JQL | Jira Query Language | Requêtes des étapes Jira des crons (`planning_jql.py`, `new_tickets`) [src: file: guide/developpement.md:25] |
| LPC | Liberated Pixel Cup | Sprites des avatars [src: file: page/office_template.html:87] |
| QP | Quick Prompt | Cibles `__ASK_QP__` des actions de page [src: file: page/office_template.html:93] |
| wf | Workflow (Kronn) | Famille des agents, champs `wf`, `wf_name` [src: file: page/src/41-people.js:5] [src: file: workflows/gates_snapshot.py:4] |
| TV | Mode TV | Écran mural, `?tv=1` [src: file: guide/fonctionnalites/06-mode-tv.md:8] |
| rétro | Rétrospective | Cérémonie de sprint [src: file: guide/developpement.md:30] |
| DM | Dunder Mifflin | Préfixe des tickets de la démo (ex. DM-6717) [src: file: tools/shots.py:169] |
