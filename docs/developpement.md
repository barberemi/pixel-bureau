# Développer Le Bureau

## Dossiers

| Dossier | Contenu |
| --- | --- |
| `page/office_template.html` | Squelette : en-tête, canvas, barre de lecture, panneau, les 4 blocs `kronn-action` (Kronn les lit dans le HTML statique), marqueurs `/*__STYLES__*/` et `/*__SCRIPTS__*/` |
| `page/src/styles.css` | Toute la feuille de style |
| `page/src/NN-*.js` | Le script, concaténé **dans l'ordre des noms** en un seul `<script>` (une portée globale, pas de modules) : config `00`, plan `10`, sprites `20`, données `30-33`, états `35`, dessin `40-45`, panneau, actions, fiches et éditeur `50-65`, À traiter et récap `68-69`, tuiles, fil et « Qui fait quoi » `70-72`, mode TV `75-76`, visite `78`, souris `80`, boucle et démarrage `90` |
| `workflows/` | Scripts Python des étapes Exec ; `_lib.py` = socle commun, recopié dans chaque script au rendu (Kronn lance `python3 -c` sans fichier voisin) ; `templates/` = modèles des workflows et du Quick Prompt |
| `layouts/` | Plans de bureau (format `bureau-layout/1`) ; `equipe.json` = le plan par défaut |
| `team/` | `roster.json` (l'équipe, identique pour tous), `defaults.json` (valeurs proposées à l'installation) |
| `sprites/` | Recettes d'avatars `cast.json`, calques LPC `layers.json`, sprites fournis `custom/` |
| `data/` | Instantanés de démo (aperçu local et tests seulement, jamais dans la page publiée) |
| `tools/` | `install.py`, `uninstall.py`, `publish.py`, `templates.py`, `assemble.py`, `smoke.py`, `test.sh`, `shots.py` |
| `tests/` | `node --test` (sans npm) et `unittest` : logique de la page, états, installateur, modèles, scripts contre un faux Kronn et un faux `gh` |

## Configuration

- `bureau.config.json` : **propre à chaque installation**, jamais commité. Toutes les valeurs de l'installation : `kronn` (API, interface, projet), `page_id`, `workflows` (crons), `actions` (boutons), `own` (workflows gardés tels quels), `jira`, `github`, `rhythm` (fuseau, daily, heures de bureau, gel des MEP), `mep_workflow`, `agents`.
- `owner` = clé du roster de qui a installé la page : cette personne prend le bureau du boss.
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

`workflows/templates/*.json` sont la source des 7 workflows et du Quick Prompt : `publish.py workflows` pousse leur rendu dans les ids de la config, en gardant les ids des étapes.

- Emplacements remplacés au rendu : `@@page_id@@`, `@@kronn.project_id@@`, `@@jira.*@@`, `@@owner_name@@`, `@@script:workflows/x.py@@`. Les variables Kronn (`{{steps.x}}`) restent intactes : jamais de `{{` ni de `@@` dans un script.
- Une étape `"_requires": "jira"` disparaît sans connexion Jira.
- `templates.py export` régénère les modèles après une modification faite dans l'interface de Kronn.
- Toute sortie d'étape Exec reste sous 100 Ko (limite de Kronn) : les scripts raccourcissent leurs listes au besoin.

## Installateur

Questions : Kronn, qui tu es, projet, Jira (testé à travers Kronn), GitHub, agent IA, tes agents (un personnage par workflow actif), avatar, musique. Il crée la page et ses 6 datasets, les workflows et le Quick Prompt, écrit la config, publie et lance un premier rafraîchissement. Relançable sans doublon.

- Réutiliser plutôt que créer (question `reuse`) : homonymes orphelins repris, ou id donné élément par élément, mis à jour ou gardé tel quel (`own`). Un workflow qui sert une autre page encore présente n'est jamais repris d'office.
- `uninstall.py` ne touche ni aux éléments `own`, ni aux connexions, ni aux autres workflows.

## Plan du bureau (`layouts/*.json`)

Le plan n'est plus codé en dur : `10-world.js` construit grille, sols, portes, sièges, places et cases bloquées depuis le plan embarqué par `assemble.py` (marqueur `__LAYOUT__` ; `layout` dans `bureau.config.json`, sinon `layouts/equipe.json`).

- `tiles` : le sol en texte, une chaîne par rangée, un caractère par case ; `legend` dit ce que vaut chaque caractère (`#` mur, `=` vitre, `.` moquette, `c` carrelage, `s` serveurs, `r` réunion, `p` plateau, `w` toilettes, `b` parquet, `E` paillasson).
- `doors` (seuils dessinés), `exit`, `closable` (porte du plateau fermée le vendredi et le week-end), `islands` (colonnes des tables et rangs des sièges), `boss` (place et bureau), `blocked` (décor infranchissable), `plants`, `windows`.
- `spots` : places de chaque zone (`[x, y, orientation]`) ; `free_seats` : places des intérimaires ; `light_rooms` : pièces éclairées la nuit ; `objects` : rectangles cliquables (TV, Kanban, planning, paie, employé du sprint).
- Vérifier un plan, voir ses sièges, son rendu :
  ```sh
  python3 tools/plan.py check [plan.json] [--json]   # erreurs bloquantes et avertissements, avec les coordonnées
  python3 tools/plan.py seats [plan.json]            # sièges numérotés (I2.R2 = îlot 2, côté droit, rang 2) et qui s'y assoit
  .venv/bin/python tools/plan.py preview [plan.json] # capture du plan dans dist/plan.png
  ```
  Le vérificateur contrôle la forme (taille, rangées, légende, murs du bord et du fond), la sortie et les portes, les meubles et sièges sur du sol, l'accès depuis la sortie à chaque siège (par son allée) et à chaque place, les zones dont la machine à états a besoin, les places libres, les objets cliquables. `publish.py page` refuse un plan invalide.
- Les seuils de porte et le bord du plateau se déduisent du plan (murs voisins, sol de plateau), plus de rangées écrites en dur.
- Encore dans le code (lot 7, phase 3) : le dessin et la position des meubles, des libellés de pièces et du décor mural.
- `tests/layout.test.js` vérifie que le plan redonne exactement l'ancien monde (`tests/fixtures/world_equipe.json`).

## Repères

- Plan : grille 40 x 20 cases de 32 px (canvas 1280 x 640). Crons Kronn en UTC (4h-20h59), page et scripts en heure de Paris.
- Rendu à 30 images par seconde ; meubles immobiles cuits une fois (`bakeFurniture`).
- Installation de référence : page `4f38f114` du Kronn de Rémi ; feuille de route : https://claude.ai/code/artifact/56db95ed-d247-4574-aeef-9990cd9360bc
