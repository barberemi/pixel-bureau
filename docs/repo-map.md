# Repository map (where things live)

> **TEMPLATE FILE.** If sections below are empty or contain `{{...}}`, say `NOT_FOUND`: never invent folder names or file paths.

- Focus: *where* code/config/tests live.
- For *how to run checks*: see [testing-quality](testing-quality.md).

## Stack overview

Live Page Kronn autonome : un seul fichier HTML (`dist/office.html`, moins de 1 Mo, sans `import` ni ressource externe) assemblé par `tools/assemble.py` à partir du squelette `page/office_template.html`, des CSS `page/src/*.css` et des scripts JS vanilla `page/src/NN-*.js` concaténés dans l'ordre des noms en un seul `<script>` à portée globale [src: file: tools/assemble.py:1] [src: file: tools/assemble.py:317]. La page lit des datasets Kronn publiés par des crons Kronn à 0 token : ***REDACTED*** faits d'étapes Exec qui lancent les scripts Python 3 de `workflows/` (stdlib, `_lib.py` et `_plan.py` recopiés au rendu) et étapes ApiCall Jira/GitHub/Graph, décrites par les modèles `workflows/templates/*.json` et rendus par `tools/templates.py` [src: file: guide/developpement.md:10] [src: file: tools/templates.py:3]. L'installation, la publication et les contrôles passent par les scripts Python de `tools/` ; les tests sont `node --test` (sans npm) pour la page et `unittest` pour les scripts [src: file: tools/test.sh:7]. Les avatars sont composés dans le navigateur à partir des calques LPC de `sprites/layers.json` et des recettes `cast.json` [src: file: tools/assemble.py:7].

## Key folders

```
pixel-bureau/
├── page/                      # sources de la page (seul endroit à éditer pour la page)
│   ├── office_template.html   # squelette : canvas, panneau, blocs kronn-action, marqueurs /*__STYLES__*/ et /*__SCRIPTS__*/
│   ├── fonts/                 # PressStart2P (woff2 + licence OFL), intégrée en base64 à l'assemblage
│   └── src/
│       ├── NN-*.js            # 00 config, 10 plan, 20 sprites, 30-39 données/états/scènes/canard, 40-47 dessin,
│       │                      # 50-65 panneau/actions/fiches/éditeur, 69-72 récap/fil/Qui fait quoi, 75-76 TV, 80 souris, 90 boucle
│       ├── styles.css         # feuille de style principale
│       ├── pixel.css          # habillage pixel commun à tous les thèmes
│       └── theme-*.css        # thème (couleurs seulement) : classique ; les autres viennent du pack d'équipe
├── workflows/                 # scripts Python des étapes Exec des crons Kronn
│   ├── _lib.py, _plan.py      # socle commun et règles des plans, recopiés dans chaque script au rendu
│   ├── *_snapshot.py          # producteurs des datasets (office, live, gates, payroll, duck, absences, pages, github, gitfut, actions)
│   ├── *.py                   # autres étapes (team_shape, planning_jql, duck_start, gate_decide, question_answer, relaunch, layout_save…)
│   └── templates/*.json       # modèles des workflows et Quick Prompts (team, live, office, canard, absences, duck, gate…)
├── tools/                     # outillage local (lancé à la main, jamais par Kronn)
│   ├── assemble.py            # page -> dist/office.html
│   ├── install.py, uninstall.py, publish.py, templates.py
│   ├── plan.py, plan_prompt.md  # vérif/aperçu/partage des plans, brouillon depuis une image (CLI claude)
│   ├── test.sh, smoke.py, cdp.py  # tests + contrôle de fumée (Chrome headless) ; theme.py : contrastes d'un thème
│   └── shots.py               # captures de la doc -> guide/img/
├── tests/                     # *.test.js (node --test), test_*.py (unittest), fixtures/, helpers/page.js
├── layouts/                   # plans de bureau bureau-layout/1 : open-space (type), exemple-startup
├── team/                      # defaults.json (valeurs proposées à l'installation), guests.json (invités communs)
├── teams/                     # (absent du dépôt) profils d'équipe locaux ; une équipe vit dans son pack (tests/fixtures/pack-exemple)
├── sprites/                   # build_sprites.py, build_layers.py, credits.py (CREDITS.md), heralds.py (recettes des hérauts), cast.json, layers.json, lpc_used.json, common/ (Gandalf, Yoda), common.json
├── data/                      # instantanés de démo (équipe fictive) : aperçu local, captures, tests
├── guide/                     # doc HUMAINE (ne pas réécrire) : developpement.md, fonctionnalites/NN-*.md, img/, exemples/
├── docs/                      # doc pour agents (ce dossier)
└── dist/                      # SORTIE générée, non versionnée (office.html, aperçus, brouillons de plan)
```

Sources : [src: file: guide/developpement.md:5] [src: file: .gitignore:2].

## Primary entrypoints

| Fichier | Rôle |
|---|---|
| `tools/assemble.py` | Assemble la page (modèle + CSS + JS + calques + recettes + plan + démo) dans `dist/office.html` ; `page_config()`, `roster()`, `guests()`, `defaults()` = seuls points d'accès à la config pour la page [src: file: tools/assemble.py:1] [src: file: tools/assemble.py:316] |
| `page/office_template.html` | Squelette HTML de la page et blocs `kronn-action` des boutons [src: file: guide/developpement.md:7] |
| `page/src/00-config.js` / `page/src/90-boot.js` | Premier script (plan embarqué `__LAYOUT__`, `readLayout`) et dernier (boucle `loop` et démarrage) [src: file: page/src/00-config.js:1] [src: file: page/src/90-boot.js:1] |
| `bureau.config.json` | Config propre à chaque installation (non versionnée, créée par `tools/install.py`) ; copie de test dans `tests/fixtures/bureau.config.json` [src: file: .gitignore:1] |
| `workflows/templates/*.json` + `tools/templates.py` | Source des workflows Kronn et leur rendu (`@@…@@` remplacés), `check` et `export` [src: file: tools/templates.py:3] |
| `tools/publish.py` | Publication `page`, `workflows` ou `all` (réservé à l'humain) [src: file: tools/publish.py:66] |
| `tools/test.sh` | Point d'entrée des tests : `node --test`, `unittest`, `smoke.py` (normal et `--empty`) [src: file: tools/test.sh:7] |

## Auto-generated files (do NOT edit manually)

| Fichier | Généré par |
|---|---|
| `dist/office.html` (et tout `dist/`) | `tools/assemble.py` [src: file: tools/assemble.py:317] ; `tools/shots.py` y écrit aussi ses variantes `office-*.html` [src: file: tools/shots.py:184] ; `tools/plan.py preview` y écrit `dist/plan.png` [src: file: guide/developpement.md:99] |
| `sprites/layers.json`, `sprites/lpc_used.json` | `sprites/build_layers.py` [src: file: sprites/build_layers.py:132] |
| `CREDITS.md` | `sprites/credits.py` (fichiers LPC de `lpc_used.json` croisés avec le `CREDITS.csv` du générateur) [src: file: sprites/credits.py:1] |
| `sprites/common.json`, `teams/<équipe>/sprites.json`, `sprites/sprites.json` (local), `sprites/cast_preview.png` (local) | `sprites/build_sprites.py` [src: file: sprites/build_sprites.py:193] [src: file: sprites/build_sprites.py:196] |
| `sprites/lpc_cache/` | cache des téléchargements LPC de `build_sprites.py`, non versionné [src: file: .gitignore:9] |
| `guide/img/*.png` | `tools/shots.py` (ne commiter que les captures qui changent vraiment) [src: file: tools/shots.py:1] |
| `workflows/templates/*.json` | éditables à la main, mais régénérables par `python3 tools/templates.py export` après une modification dans l'interface de Kronn [src: file: tools/templates.py:3] |

## Notes
- `README.md` is not guaranteed to be up-to-date; prefer actual config files as source of truth.
