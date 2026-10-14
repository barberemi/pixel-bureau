# Coding rules (AI contract)

> **TEMPLATE FILE.** Sections marked `{{...}}` must be filled by the AI audit.
> If you see unfilled `{{...}}`, say `NOT_FOUND`: **never invent tool names, conventions, or commands**.

> Glossary: [glossary](glossary.md).

## Global

- Prefer smallest diffs. Avoid drive-by refactors.
- Follow existing naming in adjacent code. Avoid generic names (`Helper`, `Utils`).
- **Follow the test policy**: see [testing-quality](testing-quality.md) and [AGENTS](AGENTS.md) § Project parameters.
- **Comment sparingly: explain *why*, never *what*.** A comment earns its place only if it adds what the code can't say: a non-obvious rationale or a real gotcha. Do NOT narrate what the code does, restate the line above, or leave "this is now loaded from X: see Y" pointers the code/ticket already makes obvious. Match the file's existing comment density; a clear name beats a paragraph. Ticket-reference policy: see [workflow/tickets](workflow/tickets.md).

## JavaScript (la page, `page/src/NN-*.js`)

### Tools

- Linter : Non configuré (aucun fichier ESLint, Biome ou `package.json` dans le dépôt).
- Formatter : Non configuré.
- Type checker : Non configuré (JavaScript vanilla, sans TypeScript ni `jsconfig.json`).
- Contrôles réels : `node --test tests/*.test.js`, puis contrôle de fumée de la page assemblée `tools/smoke.py` (`--chrome` : chargement dans Chrome headless, zéro `console.error`), le tout lancé par `sh tools/test.sh --chrome` [src: file: tools/test.sh:7] [src: file: tools/test.sh:11].

### Conventions

- Une seule portée globale, pas de modules : les fichiers sont concaténés dans l'ordre de leur nom en un seul `<script>` ; un nouveau fichier prend sa place par son préfixe `NN-` [src: file: guide/developpement.md:9].
- Chaque fichier (et chaque grand bloc) s'ouvre sur un bandeau `// ---------- sujet ----------` en français [src: file: page/src/36-absences.js:1] [src: file: page/src/39-duck.js:1] [src: file: page/src/43-fx.js:1].
- Lecture d'un dataset Kronn par une fonction `readXxx(src)` : `src.datasets.<nom>`, déballage de `.current`, `JSON.parse` si c'est une chaîne, contrôle de forme, le tout dans un `try{}catch(e){return null;}` [src: file: page/src/00-config.js:5] [src: file: page/src/39-duckgame.js:7] [src: file: page/src/38-passions.js:78].
- Constantes globales en `MAJUSCULES_SNAKE` (`SPR`, `LAYERS`, `ROSTER`, `ACTIONS`…), petites fonctions en flèche camelCase sur une ligne [src: file: page/src/00-config.js:16] [src: file: page/src/00-config.js:23] [src: file: page/src/10-world.js:10] [src: file: page/src/10-world.js:11].
- `localStorage` toujours sous `try{}catch(e){}`, clés préfixées `bureau:` [src: file: page/src/01-skin.js:5] [src: file: page/src/01-skin.js:8] [src: file: page/src/20-sprites.js:75] [src: file: page/src/20-sprites.js:77].

### Common mistakes to avoid

- Lien vers une page ou une discussion de Kronn écrit sur sa propre adresse : Kronn l'ouvre dans l'onglet courant ; passer par `/index.html` (`kronnTab()`) [src: commit: 42c3b15] [src: file: page/src/60-fiches.js:4].
- Clés de `data-kronn-bindings` nommées d'après le champ lu au lieu du nom de la variable liée (`jira_ticket_key`, `pr_number`…) : « Preflight failed: unknown dynamic action binding » ; passer par `ACTION_BINDS` / `bindsFor()` [src: commit: 68ce026] [src: file: page/src/62-ticket.js:43].
- Supposer que les personnages ont fini de marcher en rejeu accéléré : à x480 une scène de 3 min dure 0,4 s, la loupe ne s'ouvrait jamais [src: commit: 7a04af1].

## CSS (`page/src/styles.css`, `pixel.css`, `theme-*.css`)

### Tools

- Linter : Non configuré (pas de Stylelint).
- Formatter : Non configuré.
- Contrôle : `tests/test_theme.py` vérifie les contrastes WCAG des thèmes (texte >= 4,5:1) [src: file: tests/test_theme.py:2] [src: file: tests/test_theme.py:50].

### Conventions

- Un thème = `page/src/theme-<id>.css` qui ne contient que des couleurs ; l'habillage pixel commun vit dans `pixel.css` [src: file: guide/developpement.md:54].
- Première ligne d'un thème : `/* @nom: Nom affiché */` [src: file: guide/developpement.md:57] [src: file: page/src/theme-classique.css:1].

### Common mistakes to avoid

- Cacher un `<canvas>` par l'attribut `hidden` seul : `canvas{display:block}` l'emporte ; ajouter `[hidden]{display:none}` sur le sélecteur [src: commit: 5bf83db] [src: file: page/src/styles.css:39].

## Python (`workflows/*.py`, `tools/*.py`)

### Tools

- Linter : Non configuré (ni `pyproject.toml`, ni `setup.cfg`, ni Ruff, Flake8 ou Pylint).
- Formatter : Non configuré.
- Type checker : Non configuré (pas de mypy).
- Contrôles réels : `python3 -m unittest -q tests/test_templates.py tests/test_install.py tests/test_scripts.py tests/test_plan.py tests/test_theme.py` (dans `tools/test.sh`) et `python3 tools/templates.py check` [src: file: tools/test.sh:8] [src: file: guide/developpement.md:45].

### Conventions

- Chaque script de cron s'ouvre sur une docstring en français qui décrit l'entrée (stdin, arguments) et la sortie [src: file: workflows/absences_snapshot.py:1] [src: file: workflows/duck_start.py:1] [src: file: workflows/gates_snapshot.py:1].
- Socle commun importé seulement par `from _lib import …` (recopié au rendu) [src: file: workflows/absences_snapshot.py:18] [src: file: workflows/actions_snapshot.py:14] [src: file: workflows/duck_snapshot.py:14].
- Sortie JSON compacte par `dumps()` de `_lib.py` (`ensure_ascii=False`, sans espaces) sur stdout [src: file: workflows/_lib.py:128] [src: file: workflows/absences_snapshot.py:97] [src: file: workflows/actions_snapshot.py:37] [src: file: workflows/layout_save.py:65].
- Une source en échec ne fait pas tomber le dataset : l'échec est écrit sur stderr (visible dans le run Kronn) et ajouté à une liste `warnings` (textes courts en français) publiée avec le reste, que le panneau Fraîcheur affiche par source (`WARN_SRC`, `readWarnings`) ; un nouveau dataset qui en porte doit être ajouté à `WARN_SRC`, sinon le contrat crons -> page échoue (#8) [src: file: workflows/duck_snapshot.py:130] [src: file: workflows/payroll_snapshot.py:69] [src: file: page/src/33-freshness.js:52] [src: file: tests/helpers/contract.js:44]. Un `except` qui ne protège qu'un cache (`~/.cache/pixel-bureau`) reste silencieux, avec un commentaire qui le dit.
- Blocs d'un long script séparés par `# ---------- sujet ----------` [src: file: workflows/team_shape.py:153] [src: file: workflows/team_shape.py:194] [src: file: workflows/team_shape.py:218].

### Common mistakes to avoid

- Tester une valeur Jira par sa vérité (`if f.get(k)`) : un 0 posé est ignoré ; tester `is not None` [src: commit: 62bc808] [src: file: workflows/team_shape.py:60].
- Modèle `workflows/templates/*.json` qui diverge du workflow tel que Kronn l'enregistre (ex. `api_extract: null` en trop) : `tools/templates.py check` signale une dérive [src: commit: 34c5ec1].
