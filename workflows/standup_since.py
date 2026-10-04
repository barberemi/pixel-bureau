"""Heure du dernier daily (jour ouvré précédent, heure du bureau) au format JQL « yyyy/MM/dd HH:mm », sans retour à la ligne.

Lu par les requêtes du testeur du cron équipe : tickets passés en test et réouverts depuis le dernier daily
(sortie de l'étape « since »). Jira interprète la date dans le fuseau du compte qui appelle (celui du boss).
"""
from datetime import datetime, timedelta
from _lib import CFG, TZ

R = CFG["rhythm"]
h, m = (int(x) for x in str(R.get("daily", "09:40")).split(":"))
weekend = set(R.get("weekend") or ["Sat", "Sun"])
d = datetime.now(TZ).date()
for _ in range(8):
    d -= timedelta(days=1)
    if d.strftime("%a") not in weekend:
        break
print(datetime(d.year, d.month, d.day, h, m, tzinfo=TZ).strftime("%Y/%m/%d %H:%M"), end="")
