# Environments

> **TEMPLATE FILE.** Matrix only: **never write a secret value here** (token, password, connection string). Name the variable and where it is sourced from, never its value. If an environment isn't formalized yet, write `Not formalized: ask before assuming.` in its row instead of guessing.

| Environment | Purpose | URL | Deploy trigger | Secrets source |
|-------------|---------|-----|-----------------|-----------------|
| Aperçu local (démo) | Page assemblée avec les instantanés de démo `data/*.json` (équipe fictive Dunder Mifflin), pour les tests, le smoke Chrome et les captures [src: file: guide/developpement.md:118] | Fichier local `dist/office.html` (aucune URL) | `python3 tools/assemble.py`, `sh tools/test.sh --chrome`, `tools/shots.py` | Aucun secret ; config de test `tests/fixtures/bureau.config.json` |
| Kronn local (production de l'équipe) | Live Page « Le Bureau » et ses workflows, servis par le Kronn de la machine de l'installateur [src: file: README.md:33] | API `kronn.api` de `bureau.config.json` (défaut `http://127.0.0.1:3140/api`), interface `kronn.ui` (défaut `http://localhost:5173/`) [src: file: team/defaults.json:5] | Manuel, par l'humain seul : `python3 tools/publish.py page\|workflows\|all` [src: file: tools/publish.py:1] [src: file: docs/briefing.md:23] | Connexions Kronn (Atlassian pour Jira, Microsoft 365 pour Graph) et `gh auth login` sur le poste [src: file: README.md:35] [src: file: README.md:36] ; rien dans le dépôt |

Pas d'environnement de recette ni de staging pour la page elle-même : la page publiée est construite sans démo (`assemble.build(demo=False)`) et attend ses propres datasets [src: file: tools/publish.py:29].
