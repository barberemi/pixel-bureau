# Debug & operations (AI reference)

> **TEMPLATE FILE.** If commands below contain `{{...}}`, say `NOT_FOUND`: never invent commands or ports.

Pas de Makefile, de `package.json` ni de `docker-compose` dans le dépôt : tout passe par `tools/*.py` et `tools/test.sh`. Le Bureau n'a pas de serveur à démarrer ou arrêter : la page et les crons tournent dans le Kronn local (API locale lue dans `bureau.config.json`) [src: file: tools/publish.py:10]. Préfixer les commandes shell par `rtk` [src: file: docs/briefing.md:24].

## Common commands

| Action | Commande |
|--------|----------|
| Préparer le venv (une fois) | `python3 -m venv .venv && .venv/bin/pip install pillow websocket-client` [src: file: guide/developpement.md:42] |
| Installer dans Kronn (start) | `python3 tools/install.py` ; `--dry-run` pour voir sans rien créer, `--disabled` pour créer les crons désactivés, `--answers rep.json` pour des réponses données d'avance [src: file: tools/install.py:4] |
| Désinstaller (stop) | `python3 tools/uninstall.py --dry-run`, puis sans `--dry-run` (ou `--yes`) ; ne touche ni aux éléments `own`, ni aux connexions [src: file: tools/uninstall.py:4] |
| Tests | `sh tools/test.sh` (node --test + unittest + smoke statique) ; `sh tools/test.sh --chrome` ajoute le chargement dans Chrome headless, obligatoire avant publication, zéro `console.error` [src: file: tools/test.sh:3] [src: file: tools/smoke.py:135] |
| Build (assembler la page de démo) | `python3 tools/smoke.py` → `dist/office.html` + contrôles statiques (taille < 1 000 000 octets, scripts qui se parsent, blocs `kronn-action`) [src: file: tools/smoke.py:3] [src: file: tools/smoke.py:19] |
| Voir la page dans Chrome (debug) | `.venv/bin/python tools/smoke.py --chrome --shot dist/map.png --js "<JS>"` ; `--empty` = installation neuve, `--team <pack>` = la démo avec ce pack d'équipe, `--port` (défaut 9334), `--wait`, `--size` [src: file: tools/smoke.py:5] [src: file: tools/smoke.py:155] |
| Captures de la doc | `.venv/bin/python tools/shots.py [nom...]` (page de démo, dans `guide/img/`) [src: file: tools/shots.py:3] |
| Deploy (publier) | `python3 tools/publish.py page`, `workflows` ou `all` (défaut `all`) : **lancé par l'humain seul** [src: file: tools/publish.py:3] [src: file: tools/publish.py:66] [src: file: docs/briefing.md:23] |
| Mettre à jour une installation | `git pull && python3 tools/publish.py all` (humain seul) [src: file: README.md:55] |
| Vérifier les workflows du Kronn | `python3 tools/templates.py check` (`ok` / `DIFF` par modèle, code de sortie 1 si un `DIFF`) [src: file: tools/templates.py:4] [src: file: tools/templates.py:299] |
| Rendu d'un modèle de workflow | `python3 tools/templates.py render <clé>` [src: file: tools/templates.py:5] |
| Réimporter un workflow modifié dans l'UI Kronn | `python3 tools/templates.py export` [src: file: tools/templates.py:3] |
| Vérifier un plan de bureau | `python3 tools/plan.py check [plan.json] [--json]` ; `seats`, `.venv/bin/python tools/plan.py preview` (→ `dist/plan.png`) [src: file: tools/plan.py:3] [src: file: guide/developpement.md:99] |
| Logs | Pas de fichier de log local : les runs des crons et leurs sorties d'étapes se lisent dans Kronn (workflows) ; côté page, `smoke.py --chrome` affiche les `EXC` et `console.error` [src: file: tools/smoke.py:128] |

## Docker services

N/A: not used in this project. Aucun `Dockerfile` ni `docker-compose` ; seul processus annexe : Chrome headless lancé à la demande par `tools/smoke.py` (port de débogage 9334 par défaut) et `tools/shots.py`, puis arrêté [src: file: tools/smoke.py:83] [src: file: tools/smoke.py:155].

| Service | Port | Rôle | Health check |
|---------|------|------|--------------|
| Kronn (hors dépôt, lancé en local) | lu dans `bureau.config.json` (`kronn`) | Page, datasets, workflows et crons | `python3 tools/templates.py check` [src: file: tools/templates.py:4] |
| Chrome headless (éphémère) | 9334 (`--port`) | Smoke test et captures | `ok page démarrée` dans la sortie de `smoke.py --chrome` [src: file: tools/smoke.py:117] |

## Troubleshooting

| Symptôme | Cause | Correctif |
|----------|-------|-----------|
| `FAIL websocket-client manquant` au test `--chrome` | `python3` système sans le venv | Créer `.venv` (commande ci-dessus) ; `test.sh` prend `.venv/bin/python` s'il existe [src: file: tools/smoke.py:75] [src: file: tools/test.sh:10] |
| `FAIL port 9334 déjà occupé` | Un Chrome headless précédent tourne encore | Le fermer, ou passer `--port <autre>` [src: file: tools/smoke.py:78] |
| Page qui ne charge pas en Chrome headless | Option `--timeout` de Chrome : elle coupe le chargement de la page | Ne pas passer `--timeout` à Chrome [src: file: docs/briefing.md:26] |
| `templates.py check` affiche `DIFF` sur tous les workflows | `bureau.config.json` modifié : le rendu change partout | Attendu, pas une dérive ; republier les workflows (humain) [src: file: docs/briefing.md:25] |
| `publish.py page` s'arrête sur `plan invalide` | Le plan de bureau ne passe pas les règles de `_plan.py` | `python3 tools/plan.py check` puis corriger aux coordonnées indiquées [src: file: tools/publish.py:28] |
| Cron « Le Bureau · absences » en échec | La connexion Microsoft 365 de Kronn emprunte le `az login` du Mac, expiré | `az login --allow-no-subscriptions` [src: file: guide/developpement.md:34] [src: file: README.md:41] |
| Étape Exec d'un cron tronquée ou refusée | Sortie d'étape au-delà de 100 Ko (limite Kronn) | Raccourcir les listes dans le script `workflows/*.py` [src: file: guide/developpement.md:76] |
