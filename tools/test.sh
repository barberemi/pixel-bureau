#!/bin/sh
# Tests de la page : logique JS (node --test, sans dépendance npm) puis contrôle de fumée de la page assemblée.
#   sh tools/test.sh            # tests + smoke statique
#   sh tools/test.sh --chrome   # + chargement dans Chrome headless et régression visuelle (websocket-client et pillow : .venv/bin/python)
set -e
cd "$(dirname "$0")/.."
node --test tests/*.test.js
python3 -m unittest -q tests/test_templates.py tests/test_install.py tests/test_scripts.py tests/test_plan.py tests/test_theme.py tests/test_compact.py tests/test_visual.py tests/test_pack.py tests/test_mail.py tests/test_public.py tests/test_release.py
PY=python3
[ -x .venv/bin/python ] && PY=.venv/bin/python
"$PY" tools/smoke.py "$@"
"$PY" tools/smoke.py --empty "$@"   # installation neuve : équipe neuve, plan type, sans démo
case " $* " in *" --chrome "*) "$PY" tools/visual.py ;; esac   # régression visuelle (KT-57) : stricte sur la plateforme des références
