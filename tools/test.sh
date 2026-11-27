#!/bin/sh
# Tests de la page : logique JS (node --test, sans dépendance npm), tests Python (tools/unittests.py) puis contrôle de fumée de la page assemblée.
#   sh tools/test.sh            # tests + smoke statique
#   sh tools/test.sh --chrome   # + chargement dans Chrome headless et régression visuelle (websocket-client et pillow : .venv/bin/python)
set -e
cd "$(dirname "$0")/.."
node --test tests/*.test.js
python3 -W error::ResourceWarning tools/unittests.py   # tous les tests/test_*.py, en parallèle (un processus par cœur)
PY=python3
[ -x .venv/bin/python ] && PY=.venv/bin/python
"$PY" tools/smoke.py "$@"
"$PY" tools/smoke.py --empty "$@"   # installation neuve : équipe neuve, plan type, sans démo
case " $* " in *" --chrome "*) "$PY" tools/visual.py ;; esac   # régression visuelle (KT-57) : stricte sur la plateforme des références
