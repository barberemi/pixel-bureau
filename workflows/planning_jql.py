"""JQL des tickets à estimer au sprint planning : ceux des 2 prochains sprints du board sans story points, sans retour à la ligne.

Entrée (stdin) : les sprints futurs du board (étape « future_sprints », /rest/agile/1.0/board/<board>/sprint?state=future),
dans l'ordre du board. Lu par l'étape « planning_tickets ». Sans sprint futur, une requête valide qui ne renvoie rien.
"""
import json, re, sys
from _lib import CFG

J = CFG["jira"]
NEXT = 2

try:
    sprints = json.loads(sys.stdin.read() or "null")
except ValueError:
    sprints = None
ids = [int(s["id"]) for s in (sprints if isinstance(sprints, list) else [])
       if isinstance(s, dict) and str(s.get("id", "")).isdigit()][:NEXT]
project = J["project"]
if not ids:
    print(f"project = {project} AND sprint in futureSprints() AND sprint is EMPTY", end="")
    sys.exit(0)
# un ticket est estimé dès qu'un des champs de points est rempli (comme dans team_shape.py)
empty = " AND ".join(f"cf[{m.group(1)}] is EMPTY" for f in J.get("points_fields") or []
                     if (m := re.fullmatch(r"customfield_(\d+)", str(f))))
print(f"project = {project} AND sprint in ({','.join(map(str, ids))})" + (f" AND {empty}" if empty else "") +
      " AND statusCategory != Done ORDER BY rank", end="")
