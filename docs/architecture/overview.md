# Architecture

> Folder structure: [repo-map](../repo-map.md).

## Services

Pas de serveur propre : tout tourne dans un Kronn local. Le dépôt fournit une page HTML autonome, des scripts de cron et des outils lancés à la main.

| Service | Port | Tech | Rôle |
|---|---|---|---|
| Kronn (API locale) | 3140 (`http://127.0.0.1:3140/api`, valeur proposée) [src: file: team/defaults.json:5] | Kronn 0.14.1+ [src: file: tools/install.py:20] | Héberge la Live Page et ses datasets, exécute workflows, crons, gates et Quick Prompts ; appelée par les scripts (`_lib.get`) et les outils [src: file: workflows/_lib.py:27] |
| Kronn (interface) | 5173 (`http://localhost:5173/`) [src: file: team/defaults.json:6] | Kronn | Affiche la page (sandbox inline), rend les boutons `kronn-action` ; liens de la page vers l'interface (`KRONN_BASE`) [src: file: page/src/00-config.js:53] |
| Live Page « Le Bureau » | N/A (servie par Kronn) | HTML + CSS + JS vanilla + Canvas, un seul fichier `dist/office.html` [src: file: tools/assemble.py:283] | Plan pixel art, panneau, fil, rejeu, mode TV ; lit `window.KronnPageData` et l'événement `kronn:page-data` [src: file: page/src/90-boot.js:143] |
| Crons du Bureau (6) | N/A | Workflows Kronn : étapes Exec / CollectApiData (Python 3 stdlib), ApiCall Jira/Graph, PublishPageData | `live` (1 min), `office` et `team` (10 min), `payroll`, `canard`, `absences` (1 h) ; publient les datasets de la page [src: file: workflows/templates/live.json:9] [src: file: workflows/templates/office.json:9] [src: file: workflows/templates/team.json:9] [src: file: workflows/templates/payroll.json:9] [src: file: workflows/templates/canard.json:9] [src: file: workflows/templates/absences.json:9] |
| Workflows manuels du Bureau (6) + 2 Quick Prompts | N/A | Workflows Kronn `Manual` | `gate`, `relaunch`, `avatar`, `comment`, `duck`, `layout` (avec une étape Gate) ; QP `ask` et `sketch` ; déclenchés par les boutons de la page ou `tools/plan.py share` [src: file: workflows/templates/gate.json:8] [src: file: workflows/templates/layout.json:50] |
| Workflows d'agents de l'équipe | N/A | Workflows Kronn hors dépôt | Cibles des boutons `bureau-impl`, `bureau-mep`, `bureau-review`, `bureau-fix` (ids dans `bureau.config.json` › `actions`) [src: file: tools/assemble.py:17] |
| Outils locaux (`tools/`) | N/A | Python 3, `sh`, Chrome headless | Assemblage, installation, publication (humain seul), tests, captures, plans [src: file: tools/publish.py:1] |
| Sources externes | N/A | Jira Cloud (connexion Kronn), GitHub (CLI `gh`), Microsoft Graph (connexion Kronn « Microsoft 365 ») | Sprint, tickets, vélocité ; PR et déploiements ; planning des absences [src: file: workflows/github_snapshot.py:29] [src: file: guide/developpement.md:34] |

## Key patterns

- **Crons à 0 token → datasets → page.** Aucune étape n'appelle un modèle : les crons enchaînent appels Kronn, ApiCall et scripts Python, puis une étape `PublishPageData` remplace un dataset nommé de la page (`operation: replace`) [src: file: workflows/templates/office.json:50] [src: file: workflows/templates/live.json:85]. La page ne fait aucun appel réseau : elle relit `KronnPageData.datasets.<nom>` au démarrage et à chaque événement `kronn:page-data` [src: file: page/src/90-boot.js:122] [src: file: page/src/90-boot.js:143].
- **Superposition instantané complet + live.** `office` et `team` (toutes les 10 min) donnent l'état complet ; `live` (chaque minute) n'apporte que runs en cours, discussions récentes et déploiements du jour. `mergedOffice()` / `mergedTeam()` fusionnent les deux, la date la plus récente l'emporte [src: file: page/src/90-boot.js:45] [src: file: page/src/90-boot.js:94]. Les déploiements GitHub sont lus par requête conditionnelle (ETag, cache `~/.cache/pixel-bureau/deploys.json`) [src: file: workflows/live_snapshot.py:39].
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
    ds[(Datasets - office, team, live, gates, actions, payroll, bosspages, gitfut, duck, absences, avatars, layout)]
    crons[Crons du Bureau - live, office, team, payroll, canard, absences]
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
