# Architecture

> Folder structure: [repo-map](../repo-map.md).

## Services

Pas de serveur propre : tout tourne dans un Kronn local. Le dépôt fournit une page HTML autonome, des scripts de cron et des outils lancés à la main.

| Service | Port | Tech | Rôle |
|---|---|---|---|
| Kronn (API locale) | 3140 (`http://127.0.0.1:3140/api`, valeur proposée) [src: file: team/defaults.json:5] | Kronn 0.15.2+ [src: file: tools/install.py:20] | Héberge la Live Page et ses datasets, exécute workflows, crons, gates et Quick Prompts ; appelée par les scripts (`_lib.get`) et les outils [src: file: workflows/_lib.py:27] |
| Kronn (interface) | 5173 (`http://localhost:5173/`) [src: file: team/defaults.json:6] | Kronn | Affiche la page (sandbox inline), rend les boutons `kronn-action` ; liens de la page vers l'interface (`KRONN_BASE`) [src: file: page/src/00-config.js:53] |
| Live Page « Le Bureau » | N/A (servie par Kronn) | HTML + CSS + JS vanilla + Canvas, un seul fichier `dist/office.html` [src: file: tools/assemble.py:283] | Plan pixel art, panneau, fil, rejeu, mode TV ; lit `window.KronnPageData` et l'événement `kronn:page-data` [src: file: page/src/90-boot.js:143] |
| Crons du Bureau | N/A | Workflows Kronn : étapes Exec / CollectApiData (Python 3 stdlib), ApiCall Jira/Graph, PublishPageData | `live` (1 min), `office` et `team` (10 min), `payroll`, `canard`, `absences` (1 h) ; publient les datasets de la page [src: file: workflows/templates/live.json:9] [src: file: workflows/templates/office.json:9] [src: file: workflows/templates/team.json:9] [src: file: workflows/templates/payroll.json:9] [src: file: workflows/templates/canard.json:9] [src: file: workflows/templates/absences.json:9] |
| Console Support (#62) | N/A | Cron `support_poll` (15 min, Exec qui lance la CLI `claude` et son connecteur Microsoft 365) et modèle `support` (Agent dans une discussion Kronn, gate, réponse en fil par Graph) | Dataset `support` ; seule exception aux crons à 0 token (voir [decisions](../decisions.md)) [src: file: workflows/support.py:1] |
| Workflows manuels du Bureau + 2 Quick Prompts | N/A | Workflows Kronn `Manual` | `gate`, `relaunch`, `avatar`, `comment`, `duck`, `layout` (avec une étape Gate) ; QP `ask` et `sketch` ; déclenchés par les boutons de la page ou `tools/plan.py share` [src: file: workflows/templates/gate.json:8] [src: file: workflows/templates/layout.json:50] |
| Workflows d'agents de l'équipe | N/A | Workflows Kronn hors dépôt | Cibles des boutons `bureau-impl`, `bureau-mep`, `bureau-review`, `bureau-fix` (ids dans `bureau.config.json` › `actions`) [src: file: tools/assemble.py:17] |
| Outils locaux (`tools/`) | N/A | Python 3, `sh`, Chrome headless | Assemblage, installation, publication (humain seul), tests, captures, plans [src: file: tools/publish.py:1] |
| Sources externes | N/A | Jira Cloud (connexion Kronn), GitHub (CLI `gh`), Microsoft Graph (connexion Kronn « Microsoft 365 ») | Sprint, tickets, vélocité ; PR et déploiements ; planning des absences [src: file: workflows/github_snapshot.py:29] [src: file: guide/developpement.md:34] |

## Key patterns

- **Crons à 0 token → datasets → page.** Aucune étape n'appelle un modèle : les crons enchaînent appels Kronn, ApiCall et scripts Python, puis une étape `PublishPageData` remplace un dataset nommé de la page (`operation: replace`) [src: file: workflows/templates/office.json:50] [src: file: workflows/templates/live.json:85]. La page ne fait aucun appel réseau : elle relit `KronnPageData.datasets.<nom>` au démarrage et à chaque événement `kronn:page-data` [src: file: page/src/90-boot.js:122] [src: file: page/src/90-boot.js:143].
- **Superposition instantané complet + live.** `office` et `team` (toutes les 10 min) donnent l'état complet ; `live` (chaque minute) n'apporte que runs en cours, discussions récentes et déploiements du jour. `mergedOffice()` / `mergedTeam()` fusionnent les deux, la date la plus récente l'emporte [src: file: page/src/90-boot.js:45] [src: file: page/src/90-boot.js:94]. Les déploiements GitHub sont lus par requête conditionnelle (ETag, cache `~/.cache/pixel-bureau/deploys.json`) [src: file: workflows/live_snapshot.py:39]. Avec le modèle `deploy`, `live` publie aussi `envs` : l'occupant de chaque env hors prod du réglage `deploy` (dernier run dont le titre nomme l'env, branche ou version), lu par la carte « 🚀 Déployer la branche » (`page/src/62-deploy.js`).
- **Étages.** La page a des étages en plus de l'open space (`FLOOR`) : le 1er (`page/src/68-atelier.js`, dataset `atelier`), le -1 (`page/src/68-caserne.js`, dataset `support`) le 2e, la rédaction et la revue (`page/src/68-redaction.js`, dataset `redaction` du cron `live` via `workflows/redaction_snapshot.py` ; le modèle ticket en postes et un sous-workflow par ticket, dossier `~/.cache/pixel-bureau/ticket/<run>/` ; la revue d'une PR en postes aussi, voir [revue-pr](revue-pr.md)) et le 3e, les retours de PR (`page/src/68-retours.js`, vu du RDC par `page/src/69-retours-rdc.js` : tuile et « Qui fait quoi », comme le 1er par `69-atelier-rdc.js` ; dataset `retours` publié par le cron `live` via `workflows/retours_snapshot.py`). Au 3e, le Kanban des fils vient de l'état du run que garde `workflows/pr_update.py` (`~/.cache/pixel-bureau/pr/runs/<run>.json` : `fils`, `cols`, `author`) et de l'avancement que l'agent écrit dans `.bureau-fix-progress.json` (`{current, done}`, consigne de `tools/fix_prompt.md`) [src: file: workflows/retours_snapshot.py:1] [src: file: tools/fix_prompt.md:19]. La page à part « Rédaction · bilan » (`page/redaction-bilan.html`, dataset `redaction_bilan` du cron `redaction_bilan` via `workflows/redaction_bilan.py`) lit l'historique que `workflows/ticket.py` écrit à chaque étape (`~/.local/share/pixel-bureau/historique/ticket/<run>.json`) et l'API Kronn ; le tableau TICKETS DU JOUR du 2e lit `crees` et `tok_jour` du dataset `redaction` [src: file: workflows/redaction_bilan.py:1] [src: file: workflows/ticket.py:35]. De même, la page à part « Retours · bilan » (`page/retours-bilan.html`, dataset `retours_bilan` du cron `retours_bilan` via `workflows/retours_bilan.py`) joint l'API Kronn à l'état de chaque PR que garde `pr_update.py`, et le tableau RETOURS DU JOUR du 3e lit `jour` du dataset `retours` [src: file: workflows/retours_bilan.py:1].
- **Agents des étages au RDC.** Un agent dont la config ou le pack porte `metier` (`support`, `ticket`, `revue`, `retours`, `impl`) est l'agent de cet étage au RDC (`page/src/69-metiers.js`) : `mtState` le garde à sa place sans run du jour, `drawChar0` le dessine sans hologramme et `mtKit` lui met la tenue de son étage, `labelText` affiche son métier, `mtBlock` met en tête de sa fiche ce qu'il peut lancer, et `mtBar` tient la barre « AGENTS » au-dessus des onglets d'étage. `metierOf` ne vaut que pour le personnage du RDC (`byKey[c.key]===c`) : les copies dessinées aux étages (`atWorker`, `rdAgent`) gardent le champ `metier` sans en prendre la tenue [src: file: page/src/69-metiers.js:1].
- **Modèles rendus, scripts autonomes.** `workflows/templates/*.json` est la source des workflows ; `tools/templates.py render` remplace les emplacements `@@…@@` (ids, cron, Jira) et recopie chaque script avec `_lib.py` / `_plan.py` et la config d'installation injectée à la place de `__BUREAU_CONFIG__`, car Kronn lance `python3 -c` sans fichier voisin [src: file: tools/templates.py:68] [src: file: workflows/_lib.py:11]. Les étapes `_requires` disparaissent sans la connexion voulue [src: file: guide/developpement.md:74].
- **Actions de page déclaratives.** Les boutons sont des blocs `application/kronn-action` du squelette (workflow ou Quick Prompt cible, variables `dynamic_binding` relues dans un dataset ou `user_input`) ; la page pose `data-kronn-action` et `data-kronn-bindings` sur ses éléments, Kronn ouvre sa carte et lance le workflow [src: file: page/office_template.html:95] [src: file: page/src/55-actions.js:96]. Un script côté workflow revalide la ligne dans le dataset avant d'agir (ex. `gate_decide.py`) [src: file: workflows/gate_decide.py:27].
- **Page pure fonction des données et du temps.** Tout est daté par les données (`generated_at`, dates des runs) : la même donnée redonne la même scène, d'où le rejeu et le mode `play` de la boucle [src: file: page/src/90-boot.js:9] ; les animations aléatoires sont tirées d'une graine déterministe (canard : `keySeed('duck')` × jour) [src: file: guide/developpement.md:32]. Sans données, la page tourne sur un bureau vide ; la démo `data/*.json` n'est embarquée qu'en local [src: file: page/src/90-boot.js:116] [src: file: tools/publish.py:29].

## Code organisation

Organisation par couche puis par fonctionnalité : `page/` (squelette + `src/NN-*.js` numérotés par couche : config, monde, sprites, données, états, dessin, panneau, TV, boucle, concaténés en une portée globale), `workflows/` (un script Python par étape de cron, plus le socle `_lib.py` / `_plan.py`) et `workflows/templates/` (un JSON par workflow), `tools/` (outillage local), `layouts/` et `teams/` (données de configuration), `tests/` (miroir des deux langages) [src: file: guide/developpement.md:9] [src: file: guide/developpement.md:10]. Voir [repo-map](../repo-map.md).

## Architecture diagram

```mermaid
flowchart LR
  subgraph Person
    human[Humain - boss de la page]
    team[Equipe - navigateur ou ecran TV]
  end
  subgraph Repo[Depot pixel-bureau]
    src[page/src + office_template.html]
    tpl[workflows/templates + workflows/*.py]
    tools[tools - assemble, publish, install, plan]
  end
  subgraph Kronn[Kronn local]
    api[API locale port 3140]
    ui[Interface port 5173]
    page[Live Page Le Bureau]
    ds[(Datasets - office, team, live, gates, actions, payroll, bosspages, pagelist, gitfut, duck, absences, avatars, layout, mails, support)]
    crons[Crons du Bureau - live, office, team, payroll, canard, absences, courrier, support_poll]
    manual[Workflows manuels - gate, relaunch, avatar, comment, duck, layout]
    agents[Workflows d agents de l equipe]
  end
  subgraph Ext[Systemes externes]
    jira[Jira Cloud]
    gh[GitHub via gh]
    graph[Microsoft Graph]
  end
  human -->|tools/publish.py| tools
  src --> tools
  tpl --> tools
  tools -->|PUT /pages/id/html| api
  tools -->|PUT /workflows/id| api
  api --> page
  api --> crons
  crons -->|GET /workflows, /discussions| api
  crons -->|ApiCall| jira
  crons -->|gh api| gh
  crons -->|ApiCall| graph
  crons -->|PublishPageData| ds
  manual -->|PublishPageData| ds
  ds -->|"KronnPageData + evenement kronn page-data"| page
  ui --> page
  team --> ui
  page -->|kronn-action| manual
  page -->|kronn-action| agents
  manual -->|POST decide, run, discussions| api
```

## Data flow

Les crons Kronn interrogent l'API locale (runs, discussions, workflows), Jira, GitHub et Microsoft Graph, mettent les réponses en forme dans des scripts Python (sortie stdout JSON sous 100 Ko) puis remplacent chacun un ou plusieurs datasets de la page par `PublishPageData` [src: file: workflows/templates/team.json:491] [src: file: guide/developpement.md:76]. Kronn pousse les datasets dans la page (`window.KronnPageData`, événement `kronn:page-data`), qui fusionne instantané complet et live puis recalcule personnages, fil et tuiles à partir des seules dates des données [src: file: page/src/90-boot.js:143]. En retour, les boutons de la page lancent des workflows (gate, relance, commentaire, avatar, agents) dont certains republient un dataset (`avatars`, `layout`) [src: file: workflows/templates/avatar.json:47] [src: file: workflows/templates/layout.json:66].

## Sequence diagrams


Fichiers `sequenceDiagram` par flux dans [`sequences/`](sequences/) :

- [rafraichissement-datasets](sequences/rafraichissement-datasets.md) : cron live, publication du dataset, mise à jour de la page.
- [decision-gate](sequences/decision-gate.md) : décider une gate depuis la page.
- [publication](sequences/publication.md) : `tools/publish.py page` et `workflows`.

## Legacy / planned migrations

| Zone | État actuel | Cible |
|---|---|---|
| Plan du bureau | Construit depuis `layouts/*.json` (format `bureau-layout/1`) ; plus de rangées codées en dur [src: file: guide/developpement.md:87] | Fait ; `tests/layout.test.js` garde l'équivalence avec l'ancien monde (`tests/fixtures/world_open-space.json`) [src: file: guide/developpement.md:112] |
| Places dans le plan | Place `seat` du roster ou d'un agent par numéro de siège seulement (`"I2.R2"`) ; une place `[x, y]` est ignorée [src: file: page/src/10-world.js:10] [src: file: workflows/_plan.py:36]. `free_seats` reste en cases `[x, y]` (places d'intérimaires) | Fait (2026-10-12) |
| Avatar du boss en local | Ancienne clé `boss` migrée vers `p_remi` au chargement [src: file: page/src/20-sprites.js:76] | Clés du roster seulement |
| Date de création des PR | Champ `created` seul, sans repli sur `updated` (réécrit par les pushs) [src: file: page/src/30-data.js:289] ; données de démo complétées | Fait (2026-10-12) |
| Feuille de route | Externe : https://claude.ai/code/artifact/56db95ed-d247-4574-aeef-9990cd9360bc [src: file: guide/developpement.md:119] | N/A dans le dépôt |
