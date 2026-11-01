# CI/CD pipeline

> **TEMPLATE FILE.** Fill `{{...}}` with the actual project convention. If it isn't formalized yet, write `Not formalized: ask before assuming.` instead of guessing.

## Pipeline stages

<!-- Fill: build → test → deploy stages, the provider (GitHub Actions, GitLab CI, etc.), and where the config lives -->
GitHub Actions, workflow « Tests » (`.github/workflows/tests.yml`, KT-37) sur chaque PR et chaque push sur `main` : Ubuntu 24.04, Node 20 et Python 3.9 (versions minimales du README), `pillow` et `websocket-client`, puis `sh tools/test.sh --chrome` avec le Chrome du runner (`BUREAU_CHROME=google-chrome`, `BUREAU_CHROME_ARGS=--no-sandbox`) [src: file: .github/workflows/tests.yml:1]. Tests relancés par `visual-refs.yml` (`workflow_dispatch`) : GitHub ne les compte pas dans les contrôles de la PR, alors leur dernière étape publie le résultat en statut de commit « tests » (le contrôle obligatoire de `main`), sans quoi le merge restait bloqué [src: file: .github/workflows/tests.yml:1]. Les autres étapes restent sur le poste :

1. Tests en local avant de pousser : `sh tools/test.sh --chrome` (`node --test`, `unittest`, smoke de la page assemblée dans Chrome headless) [src: file: tools/test.sh:7]. Deux tests Python se sautent en CI, faute d'installation locale (`tests/test_templates.py`, export des modèles) et de `.venv` du dépôt.
2. Contrôle des modèles : `python3 tools/templates.py check` (les workflows du Kronn = le rendu des modèles) [src: file: guide/developpement.md:45].
3. Publication : `python3 tools/publish.py page|workflows|all` vers l'API du Kronn local [src: file: tools/publish.py:1].

## Quality gates

<!-- Fill: what blocks a merge/deploy (tests, lint, security scan, manual approval) -->
La CI « Tests » doit être verte (exigée par la protection de `main`, KT-58). Pas de linter ni de hook. Garde manuelle avant publication : `sh tools/test.sh --chrome` vert avec zéro `console.error` [src: file: docs/briefing.md:22]. `tools/publish.py page` refuse de publier un plan de bureau invalide [src: file: tools/publish.py:28] ; le smoke vérifie une page publiée de moins de 24 Mio, garde-fou de Kronn (`assemble.KRONN_LIMIT`) [src: file: tools/smoke.py:9].

## Deployment targets

<!-- Fill: which environment each branch/tag deploys to. Full environment detail lives in ../environments.md: do not duplicate it here. -->
Une seule cible : la Live Page et les workflows du Kronn local (voir [environments](../environments.md)). Pas de déploiement par branche ni par tag ; `tools/publish.py` et `git push` sont lancés par l'humain seul [src: file: docs/briefing.md:23].
