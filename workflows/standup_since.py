"""Heure du dernier daily (jour ouvré précédent, heure du bureau) au format JQL « yyyy/MM/dd HH:mm », sans retour à la ligne.

Lu par les requêtes du testeur du cron équipe : tickets passés en test et réouverts depuis le dernier daily
(sortie de l'étape « since »). Jira interprète la date dans le fuseau du compte qui appelle (celui du boss).
"""
import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
# config d'installation : injectée par tools/publish.py (étape Kronn « python3 -c ») ; en local, lue dans bureau.config.json
import os as _os
_CFG = r"""__BUREAU_CONFIG__"""
CFG = json.loads(_CFG) if not _CFG.startswith("__") else json.load(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), _os.pardir, "bureau.config.json")))

R = CFG["rhythm"]
TZ = ZoneInfo(R.get("timezone", "Europe/Paris"))
h, m = (int(x) for x in str(R.get("daily", "09:40")).split(":"))
weekend = set(R.get("weekend") or ["Sat", "Sun"])
d = datetime.now(TZ).date()
for _ in range(8):
    d -= timedelta(days=1)
    if d.strftime("%a") not in weekend:
        break
print(datetime(d.year, d.month, d.day, h, m, tzinfo=TZ).strftime("%Y/%m/%d %H:%M"), end="")
