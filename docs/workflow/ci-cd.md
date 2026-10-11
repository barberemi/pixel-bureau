# CI/CD pipeline

> **TEMPLATE FILE.** Fill `{{...}}` with the actual project convention. If it isn't formalized yet, write `Not formalized: ask before assuming.` instead of guessing.

## Pipeline stages

<!-- Fill: build → test → deploy stages, the provider (GitHub Actions, GitLab CI, etc.), and where the config lives -->
Pas de CI : aucun `.github/workflows/` ni `.gitlab-ci.yml` dans le dépôt (suivi dans [TD-20261011-no-automated-gate](../tech-debt/TD-20261011-no-automated-gate.md)). Les étapes sont lancées à la main sur le poste :

1. Tests : `sh tools/test.sh --chrome` (`node --test`, `unittest`, smoke de la page assemblée dans Chrome headless) [src: file: tools/test.sh:7].
2. Contrôle des modèles : `python3 tools/templates.py check` (les workflows du Kronn = le rendu des modèles) [src: file: guide/developpement.md:45].
3. Publication : `python3 tools/publish.py page|workflows|all` vers l'API du Kronn local [src: file: tools/publish.py:1].

## Quality gates

<!-- Fill: what blocks a merge/deploy (tests, lint, security scan, manual approval) -->
Aucun garde automatique (ni hook, ni linter). Garde manuelle avant publication : `sh tools/test.sh --chrome` vert avec zéro `console.error` [src: file: docs/briefing.md:22]. `tools/publish.py page` refuse de publier un plan de bureau invalide [src: file: tools/publish.py:28] ; le smoke vérifie une page de moins de 1 000 000 octets [src: file: tools/smoke.py:20].

## Deployment targets

<!-- Fill: which environment each branch/tag deploys to. Full environment detail lives in ../environments.md: do not duplicate it here. -->
Une seule cible : la Live Page et les workflows du Kronn local (voir [environments](../environments.md)). Pas de déploiement par branche ni par tag ; `tools/publish.py` et `git push` sont lancés par l'humain seul [src: file: docs/briefing.md:23].
