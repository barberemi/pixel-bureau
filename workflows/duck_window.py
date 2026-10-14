"""Fenêtre du sprint précédent pour le cron du canard d'équipe : « "2026/09/18 16:30", "2026/10/02 16:30" » (JQL DURING).

Entrée (stdin) : le sprint actif (étape sprint_info, startDate et endDate). Le sprint précédent est supposé de même durée,
fini au début de celui-ci. Sans sprint lisible : les 14 jours avant maintenant, et un avertissement sur stderr (#8) ;
la sortie est un morceau de JQL, sans place pour une liste warnings.
"""
import json, sys
from datetime import datetime, timedelta
from _lib import TZ

try:
    sp = json.load(sys.stdin) or {}
    start = datetime.fromisoformat(sp["startDate"].replace("Z", "+00:00"))
    end = datetime.fromisoformat(sp["endDate"].replace("Z", "+00:00"))
    length = end - start
except Exception as e:
    start, length = datetime.now(TZ), timedelta(days=14)
    print(f"canard : sprint actif illisible ({str(e)[:120] or type(e).__name__}), sprint précédent pris sur les 14 derniers jours",
          file=sys.stderr)
fmt = lambda d: d.astimezone(TZ).strftime('"%Y/%m/%d %H:%M"')  # noqa: E731
print(f"{fmt(start - length)}, {fmt(start)}", end="")
