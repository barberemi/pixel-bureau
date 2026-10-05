# Développer Le Bureau

## Dossiers

| Dossier | Contenu |
| --- | --- |
| `page/office_template.html` | Squelette : en-tête, canvas, barre de lecture, panneau, les 4 blocs `kronn-action` (Kronn les lit dans le HTML statique), marqueurs `/*__STYLES__*/` et `/*__SCRIPTS__*/` |
| `page/src/styles.css` | Toute la feuille de style |
| `page/src/NN-*.js` | Le script, concaténé **dans l'ordre des noms** en un seul `<script>` (une portée globale, pas de modules) : config `00`, plan `10`, sprites `20`, données `30-33`, états `35`, dessin `40-45`, panneau, actions, fiches et éditeur `50-65`, À traiter et récap `68-69`, tuiles, fil et « Qui fait quoi » `70-72`, mode TV `75-76`, visite `78`, souris `80`, boucle et démarrage `90` |
| `workflows/` | Scripts Python des étapes Exec ; `_lib.py` = socle commun et `_plan.py` = règles des plans (aussi utilisées par `tools/plan.py`), recopiés dans chaque script qui les importe au rendu (Kronn lance `python3 -c` sans fichier voisin) ; `templates/` = modèles des workflows et du Quick Prompt |
| `layouts/` | Plans de bureau (format `bureau-layout/1`) ; `open-space.json` = le plan type (équipe neuve), `equipe.json` = celui de l'équipe equipe, `exemple-startup.json` = un autre bureau (30 x 16, sans plateau TV) |
| `team/` | `defaults.json` : valeurs communes proposées à l'installation (Kronn, rythme, Jira et GitHub vides) |
| `teams/<équipe>/` | Profil d'équipe : `team.json` (nom, organisation GitHub requise, plan), `roster.json` (l'équipe), `defaults.json` (Jira, GitHub, titre), `music/` (morceaux des collègues), `cast.json` (recettes de leurs avatars), `sprites/` et `sprites.json` (sprites fournis et leurs planches, `sprites/build_sprites.py`). `teams/equipe/` = l'équipe de Rémi, réservée aux membres d'acme |
| `sprites/` | Recettes d'avatars communes `cast.json` (agents, intérimaires, visiteurs, équipe de démo), calques LPC `layers.json` ; `custom/` et `sprites.json` = sprites fournis d'une installation, jamais commités |
| `data/` | Instantanés de démo, équipe fictive Dunder Mifflin (aperçu local, captures et tests seulement, jamais dans la page publiée) |
| `tools/` | `install.py`, `uninstall.py`, `publish.py`, `templates.py`, `assemble.py`, `smoke.py`, `test.sh`, `shots.py` |
| `tests/` | `node --test` (sans npm) et `unittest` : logique de la page, états, installateur, modèles, scripts contre un faux Kronn et un faux `gh` |

## Configuration

- `bureau.config.json` : **propre à chaque installation**, jamais commité. Toutes les valeurs de l'installation : `kronn` (API, interface, projet), `page_id`, `workflows` (crons), `actions` (boutons), `own` (workflows gardés tels quels), `jira`, `github`, `rhythm` (fuseau, daily, heures de bureau, gel des MEP), `mep_workflow`, `agents`.
- `owner` = clé de qui a installé la page : cette personne prend le bureau du boss. `team` = le profil d'équipe (absent : équipe neuve). `people` = les personnes ajoutées à cette installation (jamais dans le roster partagé), `music` = leurs morceaux. `layout` = le plan du bureau (défaut : celui du profil, sinon `layouts/open-space.json`).
- Le roster vu par la page et les scripts = celui du profil, puis `people` (`roster()` dans `assemble.py`, seul point d'accès, comme `defaults()` et `music()`).
- Mises en prod suivies : `github.repo` avec `staging_workflow` et `prod_workflow` (le dépôt principal : ses MEP portent ticket et release, cron équipe), puis `github.deploys` = d'autres dépôts, `[{repo, label?, staging_workflow?, prod_workflow}]` (`label` par défaut : le nom du dépôt sans `front_`). Le cron live relit leurs runs chaque minute, en parallèle et par requête conditionnelle (ETag, `304` gratuit) ; un run du jour dont le titre contient une version est une MEP, nommée « label version » hors dépôt principal (`live_snapshot.py`). Profil equipe : les 8 autres dépôts de la revue de PR multi-dépôt.
- Tickets créés : étape `new_tickets` du cron équipe (JQL `created >= <dernier daily>`, auteur compris), mise en forme par `team_shape.py` (`team.new_tickets` : key, summary, type, status, cat, created, by, by_name). La page ne garde que les auteurs de l'équipe (`teamCreated`, par compte Jira ou par nom) : stand-up de la facilitatrice depuis `prevDaily`, fil du jour (« X crée »), pile de documents sur son bureau depuis `lastDaily` (`docPile`, 20 feuilles au plus).
- Étiquettes des agents (`41-people.js`) : icône (`agents[].icon`, sinon devinée du rôle par `AGENT_ICONS`) et métier court (`agents[].short`, sinon le rôle avant son premier « — », sans « Cron » ni cadence, 24 caractères). Réglage `ui.agent_label` : `both` (défaut, « 🔎 Dwight · Reviewer de PR »), `office` (prénom seul) ou `metier` (défaut du mode TV).
- Scènes d'équipe (`37-scenes.js`, `teamScene`) : événements `move` du jour (`team.events`) vers les statuts de `jira.flow` (`jira_flow` dans la config de la page, défauts `assemble.JIRA_FLOW`). Réouvert : avec un invité `on: "reopen"` (le héraut, ex. Gandalf chez equipe, sprite `teams/equipe/sprites/mage`, composé des calques LPC), face-à-face de 3 min en salle de réunion (places `meet` : l'assigné d'un côté de la table, l'auteur et le héraut en face, bulle du héraut agrandie ; places `gate` à défaut, `heraldScene`), puis le héraut repart ; sans héraut, l'auteur va voir l'assigné 2 min. À tester : l'assigné porte le dossier au testeur (`deliver`), pile de dossiers sur le bureau du testeur (`folderPile`). Validé : pouce du testeur (`thumbs`), bras levés de l'assigné (`cheer`). Sprint : `kickoff` devant le Kanban 5 min après le daily du premier jour, `pizza` de 12h à 12h40 le dernier jour (boîtes sur la table de la cuisine, `sceneFurniture`). Priorité : après le daily et la MEP ; pour le boss, après ses validations.
- Invités de passage : clé `guests` du roster du profil, puis de la config (`guests()` dans `assemble.py`, embarqués avec le roster). Chacun : `key`, `name`, `sprite` (sprite fourni) ou une recette dans `cast.json`, `role`, `stay` ([min, max] en minutes, défaut [20, 40]), `chance` (de passer, défaut 1), `at` (« HH:MM », heure fixe, avec `jitter` minutes de flottement), `days` (`all` = aussi le week-end), `tour` (le tour des salles dans l'ordre de `GUEST_TOUR` au lieu de saluer les collègues), `shout` (sa bulle). Au plus une visite par jour ouvré, à une heure tirée au sort pour la date (la même pour tous), entre une heure après l'ouverture et une heure avant la fermeture (`rhythm.office_hours`) ; toutes les 3 min il change d'endroit : un collègue à son bureau ou un coin du bureau (`guestState`, `35-state.js`). Jamais un collègue (`person` ignoré) : hors équipe, Qui fait quoi, À traiter, compteurs et fil. Exemples : Bob et le tour de minuit de Hank (`teams/equipe/`), David Wallace dans la démo. Un sprite fourni peut n'être qu'une planche de marche (`*walk*.png`) : `build_sprites.py` en tire la pose d'attente.
- La page en reçoit une partie (`page_config()` dans `assemble.py`) ; les scripts la reçoivent injectée au rendu. Un id d'action vide retire le bouton.
- Chaque source est facultative : sans Jira ni GitHub, les blocs concernés sont masqués.

## Modifier puis publier

```sh
python3 -m venv .venv && .venv/bin/pip install pillow websocket-client   # une fois
sh tools/test.sh --chrome              # tests + page assemblée chargée dans Chrome headless
python3 tools/publish.py page          # ou workflows, ou all
python3 tools/templates.py check       # les workflows du Kronn = le rendu des modèles
```

- On édite `page/src/*` et `page/office_template.html`, jamais `dist/`. Pas d'`import` ni de ressource externe : la sandbox des pages n'accepte que du inline (images en `data:`), HTML de moins de 1 Mo.
- Un nouveau fichier `page/src/NN-nom.js` est pris à sa place dans l'ordre.
- Captures de la documentation : `.venv/bin/python tools/shots.py [nom...]` (page de démo, dans `docs/img/`).

## Modèles de workflows

`workflows/templates/*.json` sont la source des 8 workflows et du Quick Prompt : `publish.py workflows` pousse leur rendu dans les ids de la config, en gardant les ids des étapes.

- Emplacements remplacés au rendu : `@@page_id@@`, `@@kronn.project_id@@`, `@@jira.*@@`, `@@owner_name@@`, `@@script:workflows/x.py@@`. Les variables Kronn (`{{steps.x}}`) restent intactes : jamais de `{{` ni de `@@` dans un script.
- Une étape `"_requires": "jira"` disparaît sans connexion Jira.
- `templates.py export` régénère les modèles après une modification faite dans l'interface de Kronn.
- Toute sortie d'étape Exec reste sous 100 Ko (limite de Kronn) : les scripts raccourcissent leurs listes au besoin.

## Installateur

Questions : Kronn, ton équipe (une équipe neuve par défaut, ou un profil de `teams/` : un profil qui nomme une organisation GitHub n'est installable que par ses membres actifs, vérifié avec `gh api user/memberships/orgs/<org>`, droit `read:org`), qui tu es (le champ `github` du roster propose la bonne personne ; « quelqu'un d'autre » reste dans ta config), le plan du bureau (un de `layouts/` ou ton propre fichier, refusé s'il ne passe pas `plan.py check` ; écrit dans la clé `layout` de la config), projet, Jira (testé à travers Kronn), GitHub, agent IA, tes agents (un personnage par workflow actif, placé par le plan), avatar, musique. Il crée la page et ses 7 datasets (et ajoute ceux qui manquent à une page existante), les workflows et le Quick Prompt, écrit la config, publie et lance un premier rafraîchissement. Relançable sans doublon.

- Réutiliser plutôt que créer (question `reuse`) : homonymes orphelins repris, ou id donné élément par élément, mis à jour ou gardé tel quel (`own`). Un workflow qui sert une autre page encore présente n'est jamais repris d'office.
- `uninstall.py` ne touche ni aux éléments `own`, ni aux connexions, ni aux autres workflows, et refuse une installation marquée `"protect": true` dans sa config (gardé par l'installateur).

## Plan du bureau (`layouts/*.json`)

Le plan n'est plus codé en dur : `10-world.js` construit grille, sols, portes, sièges, places et cases bloquées depuis le plan embarqué par `assemble.py` (marqueur `__LAYOUT__` ; `layout` dans `bureau.config.json`, sinon celui du profil d'équipe, sinon `layouts/open-space.json`).

- `tiles` : le sol en texte, une chaîne par rangée, un caractère par case ; `legend` dit ce que vaut chaque caractère (`#` mur, `=` vitre, `.` moquette, `c` carrelage, `s` serveurs, `r` réunion, `p` plateau, `w` toilettes, `b` parquet, `E` paillasson).
- `doors` (seuils dessinés), `exit`, `closable` (porte du plateau fermée le vendredi et le week-end), `islands` (colonnes des tables et rangs des sièges), `boss` (place et bureau), `plants`, `windows`, `blocked` (facultatif : cases bloquées en plus des meubles).
- `furniture` : meubles du catalogue (`boss_desk`, `meeting_table`, `server_rack`, `counter`, `fridge`, `kitchen_table`, `sofa`, `water_cooler`, `copier`, `toilets`, `stage_closure`), chacun posé par `at` ; il bloque son emprise (`FURN_TYPES` de `40-furniture.js`, `FURNITURE` de `tools/plan.py`, tenus identiques par un test).
- `wall` (décor mural : `whiteboard`, `mirror`, `sign` avec `text`), `clock`, `labels` (noms des pièces, position en cases).
- `spots` : places de chaque zone (`[x, y, orientation]`) ; `free_seats` : places des intérimaires ; `light_rooms` : pièces éclairées la nuit ; `objects` : rectangles cliquables (TV, Kanban, planning, paie, employé du sprint).
- `seating` : qui s'assoit où, par numéro de siège (`{"I2.R2": "p_pam"}` = îlot 2, côté droit, rang 2). Le plan est maître : la place `seat` du roster ou d'un agent (`"I2.R2"` ou l'ancien `[x, y]`) ne sert que s'il ne place pas la personne. Les autres reçoivent un siège libre, toujours le même tant que le plan ne change pas : collègues, puis agents, puis intérimaires (`free_seats` d'abord). La place du boss revient aux intérimaires.
- Vérifier un plan, voir ses sièges, son rendu :
  ```sh
  python3 tools/plan.py check [plan.json] [--json]   # erreurs bloquantes et avertissements, avec les coordonnées
  python3 tools/plan.py seats [plan.json]            # sièges numérotés, qui s'y assoit, et qui change de place par rapport au plan actuel
  .venv/bin/python tools/plan.py preview [plan.json] # capture du plan dans dist/plan.png
  python3 tools/plan.py share plan.json              # le proposer à toute l'équipe (share defaut : retour au plan embarqué)
  python3 tools/plan.py from-image croquis.jpg       # brouillon depuis un croquis ou une photo (CLI claude), vérifié et corrigé
  ```
  Le vérificateur contrôle la forme (taille, rangées, légende, murs du bord et du fond), la sortie et les portes, les meubles et sièges sur du sol, l'accès depuis la sortie à chaque siège (par son allée) et à chaque place, les zones dont la machine à états a besoin, les places libres, les objets cliquables. `publish.py page` refuse un plan invalide.
- Plan d'équipe partagé : `plan.py share` lance le workflow « Le Bureau · plan » (`layout_save.py` revérifie avec les règles de `_plan.py`, une gate attend le boss, puis `PublishPageData` remplace le dataset `layout` : `{updated_at, layout}`, `layout` null = plan embarqué). La page le lit au démarrage (`readLayout`, 00-config) et à chaque rafraîchissement : `applyLayout` refait monde, toile, fond, meubles, lumières (`buildWorld`, `sizeCanvas`, `buildFurniture`, `buildBg`, `bakeFurniture`, `buildRooms`) et téléporte chacun à sa place. Sans dataset lisible, le plan embarqué reste.
- Brouillon depuis une image : `tools/plan_prompt.md` décrit le format et les règles au modèle ; c'est aussi le début du Quick Prompt « Le Bureau · plan vers brouillon » (`workflows/templates/sketch.json`, emplacements `@@text:tools/plan_prompt.md@@` et `@@root@@` = dossier du dépôt, pour les commandes). `plan.py from-image` lance `claude -p` (outil Read seul, `--resume` d'un tour à l'autre) : un brouillon, puis jusqu'à trois corrections avec les erreurs de `validate`. La clé `_notes` (suppositions) est affichée puis retirée ; `{"_error": …}` = pas un plan. `BUREAU_CLAUDE` remplace le CLI (tests : un faux `claude`). Le Quick Prompt n'a pas de variable : seul un QP sans variable s'enchaîne dans une discussion, après l'image jointe. Exemple : `docs/img/croquis.png` → `docs/exemples/plan-croquis.json`.
- Obligatoires pour la page : `boss` (`seat`, `desk`), `spots`, `objects`, `islands`. Les listes `closable`, `plants`, `windows`, `furniture`, `light_rooms`, `wall`, `labels`, `free_seats` sont facultatives (la page s'en passe, test dans `tests/layout.test.js`).
- Les seuils de porte et le bord du plateau se déduisent du plan (murs voisins, sol de plateau), plus de rangées écrites en dur.
- Zones facultatives (plateau TV, canapé, table, fontaine, copieur…) : sans elles, les personnages se replient ailleurs (`ZONE_FALLBACK` de `35-state.js`). La toile prend la taille du plan.
- Décor des thèmes saisonniers (`46-themes.js`) ancré sur le plan : ce qui décore un meuble suit ce meuble (`onF`, absent du plan = pas de décor), l'open space suit les îlots, ce qui flotte (ballons, nœuds) est placé en proportion du plan.

![Le plan d'exemple exemple-startup.json](img/plan-exemple-startup.png)
- `tests/layout.test.js` vérifie que le plan redonne exactement l'ancien monde (`tests/fixtures/world_equipe.json`).

## Repères

- Plan : grille 40 x 20 cases de 32 px (canvas 1280 x 640). Crons Kronn en UTC (4h-20h59), page et scripts en heure de Paris.
- Rendu à 30 images par seconde ; meubles immobiles cuits une fois (`bakeFurniture`).
- Démo (aperçu local, captures, tests) : équipe fictive Dunder Mifflin, `data/*.json` et `tests/fixtures/bureau.config.json` (`assemble.demo_config()`), sur le plan type. Rien de réel : une vraie installation lit ses données dans Kronn.
- Feuille de route : https://claude.ai/code/artifact/56db95ed-d247-4574-aeef-9990cd9360bc
