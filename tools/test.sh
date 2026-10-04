#!/bin/sh
# Tests de la page : logique JS (node --test, sans dépendance npm) puis contrôle de fumée de la page assemblée.
#   sh tools/test.sh            # tests + smoke statique
#   sh tools/test.sh --chrome   # + chargement dans Chrome headless (websocket-client requis : .venv/bin/python)
set -e
cd "$(dirname "$0")/.."
node --test tests/*.test.js
python3 -m unittest -q tests/test_templates.py tests/test_install.py tests/test_scripts.py
PY=python3
[ -x .venv/bin/python ] && PY=.venv/bin/python
"$PY" tools/smoke.py "$@"
"$PY" tools/smoke.py --empty "$@"   # installation neuve : sans démo, sans config
