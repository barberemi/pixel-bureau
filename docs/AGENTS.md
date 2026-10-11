<!-- kronn:doc-version="1.0" -->
<!-- kronn:spec="https://github.com/DocRoms/Kronn/blob/main/docs/conventions/agents-md-format-v1.md" local="docs/conventions/agents-md-format-v1.md" -->
# AI agent context: Entry point

**Project:** Le Bureau (kronn-bureau) : Live Page Kronn en pixel art (HTML/CSS/JS vanilla assemblé en un seul fichier) alimentée par des crons Kronn à 0 token (scripts Python 3 de `workflows/`).

## Project parameters

Set once during audit; apply to every `docs/` file.

- Working language: français pour les commentaires, les messages de commit et les textes de la page ; identifiants en anglais ou en français selon le fichier voisin [src: file: page/src/36-absences.js:1] [src: file: tools/assemble.py:150].
- Documentation language: français (doc humaine `guide/` et nouvelle doc agents `docs/`) [src: file: guide/developpement.md:1]. This governs new documentation only; preserve every existing document in its current language.
- Ticket language: français [src: user:mainteneur:2026-10-11: KT-19].
- Ticket IDs in code comments: autorisés en tête de fichier ou de bloc de fonctionnalité, au format `KT-<n>` [src: file: page/src/39-duckgame.js:1] [src: file: tools/templates.py:31] ; aussi cités dans le corps des messages de commit (ex. « KT-1, étape 4. »).
- Test policy: tout changement de code vient avec un test (`tests/*.test.js` pour la page, `tests/test_*.py` pour les scripts et outils) ; `sh tools/test.sh --chrome` doit passer avec zéro `console.error` avant toute publication [src: file: tools/test.sh:7] [src: file: tools/smoke.py:135].

> **Rules:** Use the project parameters above; never force-translate an existing document. Update `docs/` after learning something new.
> **MCP:** Before calling any MCP tool, read [operations/mcp-servers/<name>.md](operations/mcp-servers/) if it exists.
> **Skills and Kronn resources index:** `kronn/INDEX.md` (no-op if the project has none published yet).

---

<!-- kronn:section name="anti-hallu" curated="ai" owner="audit" audit="2026-10-11" -->
## 0. Anti-Hallucination Protocol

Never state a non-trivial technical fact (paths, APIs, config, versions, behaviour) without proof: read the code, then `docs/`, then official docs, then ask; never guess. Cite every assertion as `[src: file: <path>:<line>]` or `[src: url: <url>]`; a citation that doesn't resolve is rejected as fabricated.

Full grammar and cascade: [`docs/conventions/agents-md-format-v1.md`](conventions/agents-md-format-v1.md).
<!-- kronn:section:end -->

---

## 1. Context loading (mandatory)

**T0: Router (always loaded):** [docs/AGENTS.md](AGENTS.md) (this file). Sufficient for trivial tasks.

**T1: Routed context:** for a matching common task, load exactly the listed files.

| Task | Files |
|------|-------|
| Modifier la page (`page/src/NN-*.js`, `styles.css`, thèmes) [src: file: guide/developpement.md:9] | [repo-map](repo-map.md), [coding-rules](coding-rules.md) |
| Modifier un cron (script `workflows/*.py` ou modèle `workflows/templates/*.json`) [src: file: guide/developpement.md:71] | [repo-map](repo-map.md), [architecture/overview](architecture/overview.md) |
| Ajouter un dataset de page ou un workflow / cron du Bureau [src: file: tools/templates.py:24] | [conventions/ajouter-dataset-ou-workflow](conventions/ajouter-dataset-ou-workflow.md), [architecture/overview](architecture/overview.md) |
| Corriger ou ajouter un test (`tests/`) [src: file: tools/test.sh:7] | [testing-quality](testing-quality.md) |
| Nouvelle fonctionnalité visible (page + `guide/fonctionnalites/NN-*.md` + ligne du README + captures) [src: file: README.md:9] | [architecture/overview](architecture/overview.md), [repo-map](repo-map.md) |
| Plan du bureau (`layouts/*.json`, `tools/plan.py`) [src: file: guide/developpement.md:85] | [repo-map](repo-map.md) |
| Installation, publication, débogage (`tools/install.py`, `tools/publish.py`) [src: file: tools/publish.py:66] | [operations/debug-operations](operations/debug-operations.md) |

**T2: Search:** if T1 does not cover the task, search `docs/` first and load at most 3 relevant files.

| Need | File |
|------|------|
| Repo structure | [repo-map](repo-map.md) |
| Testing | [testing-quality](testing-quality.md) |
| Coding rules | [coding-rules](coding-rules.md) |
| Known issues | [inconsistencies-tech-debt](inconsistencies-tech-debt.md) |
| Architecture decisions | [decisions](decisions.md) |
| Glossary | [glossary](glossary.md) |
| Workflow overview | [workflow/](workflow/README.md) |
| Commit conventions | [workflow/commits](workflow/commits.md) |
| Pull request conventions | [workflow/pull-requests](workflow/pull-requests.md) |
| Ticket/tracker conventions | [workflow/tickets](workflow/tickets.md) |
| CI/CD pipeline | [workflow/ci-cd](workflow/ci-cd.md) |
| Environments (staging, prod, …) | [environments](environments.md) |
| Worked examples | [examples/](examples/README.md) |

If T0–T2 are insufficient, state which additional file you need and why. Never load every file.

`docs/reports/`: [dated snapshots](reports/README.md), excluded from T0–T2 routing; read one only when a task names it.

---

## 2. DO NOT (critical)

- **Lancer `tools/publish.py` ou `git push`** : réservé à l'humain [src: file: docs/briefing.md:23].
- **Toucher à `.gitignore`**, ni commiter `bureau.config.json` (propre à chaque installation) [src: file: .gitignore:2] [src: file: docs/briefing.md:23].
- **Éditer `dist/`** : on édite `page/src/*` et `page/office_template.html` ; `dist/office.html` est produit par `tools/assemble.py` [src: file: guide/developpement.md:48] [src: file: tools/assemble.py:316].
- **Ajouter un `import`, un module ou une ressource externe** dans la page : sandbox inline seulement (images et polices en `data:`), HTML de moins de 1 Mo [src: file: guide/developpement.md:48].
- **Écrire `{{` ou `@@` dans un script de `workflows/`** (emplacements de rendu et variables Kronn) ; sortie d'étape Exec sous 100 Ko [src: file: guide/developpement.md:73] [src: file: guide/developpement.md:76].
- **Importer un fichier voisin dans un script de cron** autrement que par `_lib.py` / `_plan.py`, recopiés au rendu (Kronn lance `python3 -c`) [src: file: guide/developpement.md:10].
- **Réécrire `guide/`** (doc humaine) : `docs/` = doc pour agents [src: file: docs/briefing.md:27].
- **Mettre des données réelles dans la démo** (`data/`, équipe fictive Dunder Mifflin), ni rien d'individuel ou de vanne visant une personne dans la page [src: file: guide/developpement.md:118] [src: file: docs/briefing.md:32].
- **Dater par l'heure de calcul** : tout est rejouable et daté par les données [src: file: docs/briefing.md:33].
- **Utiliser le tiret cadratin** dans les textes produits [src: file: docs/briefing.md:31].
- **Guess** when info is missing: say `NOT_FOUND` and ask the user.
- **Invent file paths**: if you don't know where code goes, check [repo-map](repo-map.md) or ask.
- **Guess tool versions**: if prerequisites are not filled below, ask.
- **Guess languages or frameworks**: check § 6 Stack.
- **Edit auto-generated files**: if a file is marked as generated (e.g., types exported from another language), never edit it by hand.
- **Load all T2 files at once**: max 3, pick what you need.
- **Modify business code** when the task is only about project documentation: edit `docs/` only.
- **Skip the test policy**: see § Project parameters above and § 4.

---

## 3. Prerequisites

| Outil | Version / commande |
|-------|--------------------|
| Kronn (lancé en local) | 0.14.1 ou plus, vérifié par l'installateur [src: file: tools/install.py:20] |
| Python | 3.9 ou plus (`python3` du `PATH` de Kronn) [src: file: README.md:34] |
| venv du dépôt | `python3 -m venv .venv && .venv/bin/pip install pillow websocket-client` [src: file: guide/developpement.md:42] |
| Node | 20 ou plus, sans dépendance npm (`node --test`) [src: file: README.md:57] |
| Chrome ou Chromium | tests `--chrome` et captures `tools/shots.py` [src: file: tools/test.sh:4] |
| CLI `claude` | `tools/plan.py from-image` (remplaçable par `BUREAU_CLAUDE`) [src: file: guide/developpement.md:105] |
| Tests | `sh tools/test.sh --chrome` [src: file: guide/developpement.md:43] |
| Vérifier les modèles | `python3 tools/templates.py check` [src: file: guide/developpement.md:45] |
| Captures | `.venv/bin/python tools/shots.py [nom...]` [src: file: guide/developpement.md:50] |
| Shell | préfixer les commandes par `rtk` [src: file: docs/briefing.md:24] |

---

## 4. Constraints

- If no command output: ask user to paste it.
- Changement visible = dans le même commit : la page `guide/fonctionnalites/NN-*.md`, la ligne du tableau du README et les captures `tools/shots.py` ; ne commiter que les captures qui changent vraiment (le rendu fait du bruit) [src: file: README.md:9] [src: file: guide/developpement.md:50].
- Un commit par changement, format `type(portée): sujet` en français (`feat`, `fix`, `style`, `docs`…), trailer `Co-Authored-By` ; DCO non requis [src: file: docs/briefing.md:21].
- Modifier `bureau.config.json` fait apparaître tous les workflows en DIFF dans le contrôle des modèles : attendu, pas une dérive [src: file: docs/briefing.md:25].
- Chrome headless : l'option `--timeout` coupe le chargement de la page [src: file: docs/briefing.md:26].

### Test policy

See the Test policy parameter above (§ Project parameters). Checklist: [testing-quality](testing-quality.md).

---

## 5. Source of truth

| What | File(s) |
|------|---------|
| Project documentation | `docs/` |
| Cross-repo context (companion repos) | `docs/linked-repos.md`: read ONLY when your task references something not in this repo |
| Squelette de la page | `page/office_template.html` [src: file: guide/developpement.md:7] |
| Script de la page (concaténé dans l'ordre des noms) | `page/src/NN-*.js` [src: file: guide/developpement.md:9] |
| Assemblage, config de la page, roster, heures des crons | `tools/assemble.py` (`page_config`, `roster`, `defaults`, `cron_hours`, `JIRA_FLOW`) [src: file: tools/assemble.py:107] [src: file: tools/assemble.py:150] [src: file: tools/assemble.py:79] [src: file: tools/assemble.py:126] |
| Modèles des 13 workflows (6 crons, 7 manuels) et 2 Quick Prompts | `workflows/templates/*.json`, rendus par `tools/templates.py` [src: file: tools/templates.py:24] [src: file: tools/templates.py:251] |
| Socle des scripts de cron / règles des plans | `workflows/_lib.py`, `workflows/_plan.py` [src: file: guide/developpement.md:10] |
| Format des plans de bureau (`bureau-layout/1`) | `layouts/*.json`, vérifiés par `tools/plan.py check` [src: file: guide/developpement.md:11] [src: file: guide/developpement.md:97] |
| Profils d'équipe | `teams/<équipe>/` (`team.json`, `roster.json`, `defaults.json`) [src: file: guide/developpement.md:13] |
| Config d'installation (jamais commitée) | `bureau.config.json` ; copie de test `tests/fixtures/bureau.config.json` [src: file: guide/developpement.md:21] [src: file: guide/developpement.md:118] |
| Données de démo | `data/*.json` [src: file: guide/developpement.md:15] |
| Doc humaine des fonctionnalités | `guide/fonctionnalites/NN-*.md`, `guide/developpement.md` [src: file: README.md:9] |

---

## 6. Stack

| Technologie | Version | Rôle |
|-------------|---------|------|
| Kronn | 0.14.1 minimum [src: file: tools/install.py:20] | Live Pages, datasets, workflows et crons, API locale |
| JavaScript vanilla + Canvas | sans version, sans module [src: file: guide/developpement.md:9] | La page (un seul `<script>`, rendu à 30 i/s) |
| CSS (`styles.css`, `pixel.css`, `theme-*.css`) | sans version [src: file: guide/developpement.md:54] | Feuille de style et thèmes de page |
| Python 3 | 3.9 minimum [src: file: README.md:34] | Scripts des crons (`workflows/`), installateur et outils (`tools/`) |
| Pillow (venv) | non épinglée [src: file: guide/developpement.md:42] | Miniatures, cartes, sprites |
| websocket-client (venv) | non épinglée [src: file: guide/developpement.md:42] | Pilotage de Chrome headless (smoke, captures) [src: file: tools/smoke.py:96] |
| Node (`node --test`) | 20 minimum [src: file: README.md:57] | Tests de la logique de la page |
| unittest (Python) | stdlib [src: file: tools/test.sh:8] | Tests de l'installateur, des modèles, des scripts, des plans, des thèmes |
| Sprites LPC | CC-BY-SA 3.0 / GPL 3.0 [src: file: README.md:65] | Avatars pixel art |
| Jira, GitHub (`gh`), Microsoft Graph | via les connexions Kronn [src: file: README.md:35] [src: file: README.md:36] [src: file: README.md:41] | Sources des datasets (sprint, PR, MEP, absences) |

---

## 7. Code placement

New code placement: see [repo-map](repo-map.md).

---

## 8. Code generation

- Search repo for similar implementations first.
- Use [repo-map](repo-map.md) for file placement.
- Missing/ambiguous info → say `NOT_FOUND`, ask. Never guess.
- Large refactor needed → add entry to [inconsistencies-tech-debt](inconsistencies-tech-debt.md).
- **Follow the test policy**: see § 4.
- After task: update `docs/` if you learned something non-obvious. Prefer the agent-writable subfolders: `docs/conventions/`, `docs/gotchas/`, `docs/architecture/`, `docs/operations/`.
- `docs/AGENTS.md` sections use `owner="audit"` or `owner="human"` (legacy `curated="human"` remains protected). Never rewrite a human-owned section in a full or partial audit; re-audits put the proposed change in a dated diff under `docs/reports/`.

---

## 9. Multi-agent config

Redirectors at the project root: `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.kiro/steering/instructions.md`, `.vibe/instructions.md`, `.cursorrules`, `.cursor/rules/repo-instructions.mdc`, `.github/copilot-instructions.md`, `.windsurfrules`, `.clinerules`.

Redirectors are stubs pointing to [docs/AGENTS.md](AGENTS.md); all content lives in `docs/`.

---

## 10. Last updated

Project documentation last reviewed: **2026-10-11**.
