# Le Bureau (Kronn)

Page Live Kronn façon *The Office* : les agents, workflows, collègues et mises en prod de la journée dans un bureau en pixel art.

## Démarrage rapide (installer chez soi)

Prérequis :
- Kronn 0.14.1 ou plus, lancé sur ta machine (API sur `127.0.0.1:3140`) ;
- Python 3 ;
- pour les tickets du sprint : une connexion Atlassian dans Kronn (MCP > Atlassian) ;
- pour les PR et les mises en prod : `gh` connecté (`gh auth login`) avec accès au dépôt suivi.

```sh
git clone https://github.com/barberemi/kronn-bureau.git
cd kronn-bureau
python3 tools/install.py --dry-run   # voir ce qui serait créé, sans rien toucher
python3 tools/install.py             # installation interactive (relançable sans doublon)
```

L'installateur pose ses questions (Kronn, qui tu es dans l'équipe, projet Kronn, Jira, GitHub, tes agents, ton avatar), puis crée la page, ses datasets, les workflows et le Quick Prompt dans **ton** Kronn, écrit `bureau.config.json` (propre à ton installation, jamais commité) et lance un premier rafraîchissement. Détail plus bas, section « Installer Le Bureau dans son Kronn ».

Ensuite :
- ouvre Kronn > Pages > « Le Bureau » : les crons la remplissent dans les minutes qui suivent (crons de 4h à 20h59 UTC : 6h-23h l'été, 5h-22h l'hiver, heure de Paris) ;
- mise à jour : `git pull`, puis `python3 tools/publish.py all` (page + workflows, avec ta config) ;
- tests avant de publier une modification : `sh tools/test.sh` (Node 20 ou plus, aucune dépendance npm).

Rien de secret n'est stocké : les connexions sont référencées par leur id Kronn. Les tests utilisent leur propre copie de configuration (`tests/fixtures/bureau.config.json`).

## L'installation de référence (Rémi)


- Page Kronn : `4f38f114-e010-41ba-b34e-832ff9a72672` (http://localhost:5173/#page/4f38f114-e010-41ba-b34e-832ff9a72672)
- Cron « Le Bureau · refresh (page) » : `622338c5-f4f7-4e01-a3b8-749f6c9b8c71` (dataset `office`, toutes les 10 min, 4h-20h59 UTC, au moins 7h-22h Paris toute l'année)
- Cron « Le Bureau · équipe (Jira + GitHub) » : `60fd6c69-2afc-4467-b202-5887c943b85c` (dataset `team`, toutes les 10 min, 4h-20h59 UTC, au moins 7h-22h Paris toute l'année, semaine)
- Cron « Le Bureau · live (1 min) » : `d1128ffe-beca-4580-8fb1-1db644f7c659` (dataset `live` : runs en cours, discussions récentes, déploiements staging/prod du jour ; toutes les minutes, 4h-20h59 UTC, au moins 7h-22h Paris toute l'année). La page le superpose aux deux instantanés.
- Workflow « Le Bureau · avatars » : `6261fa8b-9e95-471e-ac23-c333031eaf86` (manuel, 0 token) : lancé depuis la page (bouton « Enregistrer pour l'équipe » = page action `bureau-avatar`), valide le code collé et le fusionne dans le dataset `avatars`.
- Workflow « Le Bureau · décision gate » : `8f4c4b5f-143b-4759-9b2e-6a10e9f3add2` (manuel, 0 token) : lancé depuis la carte « Validation demandée » (page action `bureau-gate`) ; run/workflow/étape relus par Kronn dans le dataset `gates` (publié chaque minute par l'étape CollectApiData `gates` du cron live), décision choisie dans la carte, appel `POST /api/workflows/{id}/runs/{run}/decide`.
- Purge : `office_snapshot.py` supprime les runs de plus de 7 jours des 3 crons du Bureau uniquement.
- Feuille de route : https://claude.ai/code/artifact/56db95ed-d247-4574-aeef-9990cd9360bc

## Dossiers

| Dossier | Contenu |
| --- | --- |
| `page/office_template.html` | Squelette HTML de la page : en-tête, canvas, barre de lecture, panneau, les 4 blocs `kronn-action` (gardés tels quels, Kronn les lit dans le HTML statique) et deux marqueurs `/*__STYLES__*/` et `/*__SCRIPTS__*/` |
| `page/src/styles.css` | Toute la feuille de style (inlinée à la place de `/*__STYLES__*/`) |
| `page/src/NN-*.js` | Le script de la page, découpé par responsabilité et concaténé **dans l'ordre des noms** en un seul `<script>` inline (une seule portée globale, pas de modules) : `00-config` (marqueurs de données `__SPRITES__`, `__CAST__`, `__SNAP__`..., casting `CAST`), `10-world` (grille, plan, `findPath`), `20-sprites` (calques LPC, planches, avatars personnalisés), `30-data` (équipe, MEP, heure de Paris, cron, `setData`), `35-state` (`stateAt`, déplacements), `40-render` (sol, mobilier, personnages, `render`), `50-panel` (liste du panneau), `55-actions` (fenêtre des cartes Kronn, gate, paie, relancer / interroger, musique), `60-fiches` (fiches visiteur, TV, planning, kanban, collègue), `65-editor` (éditeur d'avatar), `70-kpis-feed` (tuiles et fil), `75-tv` (mode TV), `80-input` (souris, lecture), `90-boot` (boucle, lecture des datasets Kronn, démarrage) |
| `tests/` | Tests `node --test` (sans dépendance npm) : `helpers/page.js` charge `page/src/*.js` dans un contexte `vm` avec des bouchons DOM / canvas ; `logic.test.js` (cron, heure de Paris, MEP, paie, outils, places, KPI, éditeur), `state.test.js` (`stateAt`), `boot.test.js` (démarrage sur la démo, blocs `kronn-action`), `visuals.test.js` (enveloppes, double bulle, écrans) ; configuration de test dans `fixtures/` |
| `sprites/` | `cast.json` (recette de chaque avatar), `build_layers.py` → `layers.json` (bibliothèque de calques LPC, assemblés dans le navigateur), `build_sprites.py` → `sprites.json` (planches ; seuls les sprites fournis de `custom/` sont embarqués), `lpc_cache/` (calques téléchargés) |
| `workflows/` | Scripts Python exécutés par les steps Exec des deux crons |
| `data/` | Instantanés de démo embarqués dans la page (utilisés tant que les crons n'ont rien publié) |
| `tools/` | `assemble.py` (assemblage), `smoke.py` (contrôle de la page assemblée), `test.sh` (tests + smoke), `publish.py`, `cdp.py` (capture d'écran via Chrome headless) |

## Installer Le Bureau dans son Kronn

```sh
python3 tools/install.py              # interactif ; --dry-run pour voir sans rien créer ; relançable
```

Prérequis : Kronn 0.14.1 ou plus lancé ; pour les tickets, une connexion Atlassian dans Kronn (MCP > Atlassian) ; pour les PR et MEP, `gh` connecté (`gh auth login`) ; Python 3.

Questions, dans l'ordre : Kronn (adresse, version), qui es-tu (roster ou « quelqu'un d'autre »), projet Kronn, connexion Jira (testée à travers Kronn, adresse du site déduite), GitHub (`gh`, accès au dépôt), agent IA du bouton « interroger », tes agents (un personnage de The Office par workflow actif, les plus récents d'abord), avatar (éditeur de la page, sprite du [générateur LPC](https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator) ou défaut) et musique (lien Suno), puis récapitulatif et confirmation.

Il crée la page et ses 6 datasets, les 7 workflows et le QP depuis les modèles, écrit `bureau.config.json`, publie la page et lance un premier rafraîchissement. Valeurs proposées par défaut : `team/defaults.json`. Rien n'est stocké en clair : les connexions sont référencées par leur id Kronn.

Tests : `tests/test_install.py` (faux Kronn : installation complète, sans Jira, relance sans recréation, dry-run).

## Équipe et installation

- `team/roster.json` : l'équipe, **identique pour tous** (clé stable, prénom, nom Jira `person`, rôle, place `seat`, `roleKind` po / sm / qa, apprenti, sprite fourni, `boss_sprite` porté seulement quand la personne est le boss). La recette d'avatar de chaque clé est dans `sprites/cast.json`.
- `bureau.config.json` : **propre à chaque installation**, jamais partagé. `owner` = clé du roster de qui a installé la page : cette personne prend le bureau du boss (zone « À traiter », validations, routine du boss) ; les autres gardent leur place. Sans `owner`, personne n'est au bureau du boss.
- Exemple : `owner: p_coll2` met Darryl au bureau du boss et Rémi à sa place `[12,15]`, avec son avatar classique (sans saxophone).
- `bureau.config.json` porte aussi `actions` : ids des workflows et du Quick Prompt des boutons (`avatar`, `gate`, `relaunch`, `ask`). Un id vide : la carte `kronn-action` est retirée à l'assemblage et le bouton masqué.
- **Page robuste** : chaque source est facultative. Sans dataset `office`, bureau vide (« En attente du premier rafraîchissement ») ; sans `team`, l'équipe du roster sans tickets et un bloc « Pas encore de données Jira ni GitHub ». Les instantanés de démo (`data/`) ne sont embarqués que dans l'aperçu local et les tests (`assemble.build(demo=True)`), jamais dans la page publiée (`publish.py` assemble avec `demo=False`).
- `sh tools/test.sh` contrôle aussi une installation neuve (`smoke.py --empty` : sans démo, sans propriétaire, sans boutons).
- Cron équipe : GitHub passe par une seule étape `github` (`workflows/github_snapshot.py`) qui ne fait jamais échouer le run (sans `gh` : listes vides, erreurs dans `sources.github_errors`) et reste sous la limite de 100 Ko de sortie d'une étape Exec de Kronn.
- `bureau.config.json` contient **toutes** les valeurs propres à l'installation : `kronn` (adresses de l'API et de l'interface, projet), `page_id`, `workflows` (office, live, team, payroll), `actions`, `jira` (connexion Kronn, site, projet, board, champs points et sprint, statuts), `github` (dépôt, workflows de déploiement), `rhythm` (fuseau, position du soleil, daily, heures de bureau, gel des MEP), `mep_workflow`, `agents` (personnages des workflows : clé, nom, rôle, préfixes d'ids, place).
- La page en reçoit une partie (`page_config()` dans `assemble.py`, marqueur `__CONFIG__`) ; chaque valeur a un défaut. Les scripts de `workflows/` ont un en-tête qui lit `CFG` : en local depuis `bureau.config.json`, dans Kronn depuis la config injectée par `publish.py workflows` à la place de `__BUREAU_CONFIG__`.

## Modifier puis publier

On édite les sources (`page/src/*.js`, `page/src/styles.css`, le squelette `page/office_template.html`), jamais `dist/`. Le script reste un seul script classique : tout ce qui est déclaré au niveau haut d'un fichier est visible des fichiers suivants, et l'ordre des noms (`00-` à `90-`) est l'ordre d'exécution. Un nouveau fichier `page/src/NN-nom.js` est pris automatiquement à sa place dans l'ordre. Pas d'`import`, pas de ressource externe (la sandbox n'accepte que du inline).

```sh
# 1. (si on change un avatar) Pillow requis : python3 -m venv .venv && .venv/bin/pip install pillow websocket-client
.venv/bin/python sprites/build_sprites.py   # sprites fournis (custom/) + aperçu cast_preview.png
.venv/bin/python sprites/build_layers.py    # bibliothèque de calques (nouvelle coupe, nouveau vêtement...)
# 2. tester : logique JS (node >= 20, aucune dépendance) + assemblage et contrôles de la page
sh tools/test.sh                     # = node --test tests/*.test.js && python3 tools/smoke.py
sh tools/test.sh --chrome            # + chargement dans Chrome headless (muet, port 9334, profil jetable) : aucune exception JS
python3 tools/smoke.py --chrome --shot dist/map.png --js "setMode('pause');T=DAY0+11*3600e3;needTeleport=true;"   # capture du plan à 11h
# 3. assembler la page (smoke.py l'a déjà fait)
python3 tools/assemble.py            # -> dist/office.html (< 1 Mo)
# 4. publier dans Kronn (API locale 127.0.0.1:3140)
python3 tools/publish.py page        # ou: workflows | all
```

Assemblage (`tools/assemble.py`) : le squelette reçoit `styles.css` à la place de `/*__STYLES__*/` et la concaténation de `page/src/*.js` à la place de `/*__SCRIPTS__*/`, puis les marqueurs de données sont remplacés comme avant (`__SPRITES__`, `__LAYERS__`, `__CAST__`, `__MUSIC__`, `__SNAP__`, `__TEAM__`, ids `__AVATAR_WF__`, `__GATE_WF__`, `__RELAUNCH_WF__`, `__ASK_QP__`). `smoke.py` vérifie la taille (< 1 000 000 octets), que le `<script>` se parse, que les 4 blocs `kronn-action` sont présents à l'identique et qu'aucun marqueur ne reste.

## Modèles de workflows

`workflows/templates/*.json` : un modèle par workflow du Bureau (office, live, team, payroll, avatar, gate, relaunch) et pour le Quick Prompt « interroger un agent » (ask). Ce sont **la source** : `publish.py workflows` pousse leur rendu (étapes, scripts avec la config injectée, déclencheur, programmes autorisés) dans les workflows dont les ids sont dans `bureau.config.json`, en gardant les ids des étapes.

- Emplacements remplacés au rendu : `@@page_id@@`, `@@kronn.project_id@@`, `@@jira.config_id@@`, `@@jira.project@@`, `@@jira.board@@`, `@@jira.sprint_field@@`, `@@jira.points_fields@@`, `@@owner_name@@`, `@@script:workflows/x.py@@`. Les variables Kronn (`{{steps.x}}`, `{{run_id}}`) restent intactes.
- Une étape `"_requires": "jira"` disparaît si l'installation n'a pas de connexion Jira ; les étapes suivantes reçoivent `null` à sa place.
- `python3 tools/templates.py check` : le rendu avec la config redonne exactement les workflows du Kronn ; `export` régénère les modèles depuis le Kronn (après une modification faite dans l'interface) ; `render <clé>` affiche un rendu.
- Tests hors ligne : `tests/test_templates.py` (rendu pour une autre installation, sans Jira, aucun id de l'installation d'origine dans les modèles).

## Avatars personnalisés

- Sprite fourni par quelqu'un : un dossier `sprites/custom/<nom>/` contenant soit la planche PNG exportée telle quelle du générateur LPC (832 px de large), soit `*walk*.png` (576x256) + `*idle*.png` (128x256) + `*emote*.png` facultatif (192x64). Puis `sprite:'<nom>'` sur le personnage dans `CAST` (`page/src/00-config.js`), `build_sprites.py`, `assemble.py`, `publish.py page`. Exemples : `boss_sax` (Rémi), `coll6_basket` (Andy). Un personnage à sprite fourni ne peut changer que son nom dans l'éditeur.

- La page assemble chaque avatar dans le navigateur : calques de `layers.json` + recette de `cast.json` (~3 ms par avatar).
- Surcharges, de la plus faible à la plus forte : dataset `avatars` (toute l'équipe) < retouche locale (`localStorage`, plus récente) < éditeur ouvert. Format : `{updated_at, avatars{clé: {name?, look?, at}}}`.
- Éditeur : fiche d'un personnage → « ✎ Personnaliser » (nom + apparence ; Rémi et son sprite fourni : nom seulement ; visiteurs : rien).
- « Enregistrer pour l'équipe » copie un code `BUREAU1:…` et ouvre la carte Kronn du workflow avatars : on y colle le code puis on lance. La page ne peut pas passer de valeur libre à une page action (seulement des sélecteurs de lignes), d'où le copier-coller. À simplifier si `KronnPageActions.trigger` (branche `feat/live-page-workflow-interaction`) arrive sur main.

## Repères

- Plan : grille 40 x 20 cases de 32 px (canvas 1280 x 640), d'après le croquis du 2 octobre 2026.
- Crons Kronn en UTC ; scripts et page en heure de Paris (`Europe/Paris`).
- Sprites : Universal LPC Spritesheet Character Generator (CC-BY-SA 3.0 / GPL 3.0), crédit dans le pied de page.
- La sandbox des pages n'accepte que les images `data:` et les liens http(s) absolus.
