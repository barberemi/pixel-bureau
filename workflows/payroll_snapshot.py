"""Fiche de paie des agents du Bureau : tokens, runs et échecs par workflow, aujourd'hui et sur 7 jours glissants.

Sortie (stdout) : {generated_at, rate_usd_per_mtok, rate_source, agents[{wf, name, today{tok,runs,fail}, week{tok,runs,fail}, days[7 tok]}]}
- Seuls les runs de premier niveau comptent : les tokens d'un parent incluent déjà ceux de ses sous-runs.
- Kronn ne mesure pas le coût en $ des workflows ; il le mesure pour les discussions. Le tarif moyen observé
  ($ / million de tokens) sert à donner un coût ESTIMÉ, affiché comme tel par la page.
"""
import json, urllib.request
from zoneinfo import ZoneInfo
from datetime import datetime, timedelta, timezone
# config d'installation : injectée par tools/publish.py (étape Kronn « python3 -c ») ; en local, lue dans bureau.config.json
import os as _os
_CFG = r"""__BUREAU_CONFIG__"""
CFG = json.loads(_CFG) if not _CFG.startswith("__") else json.load(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), _os.pardir, "bureau.config.json")))

API = CFG["kronn"]["api"]
TZ = ZoneInfo(CFG["rhythm"]["timezone"])


def get(path):
    with urllib.request.urlopen(API + path, timeout=120) as r:
        body = json.load(r)
    return body.get("data", body)


now = datetime.now(TZ)
today0 = now.replace(hour=0, minute=0, second=0, microsecond=0)
days = [(today0 - timedelta(days=6 - i)) for i in range(7)]          # J-6 … aujourd'hui (Paris)
since = days[0].astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def day_index(iso):
    t = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(TZ)
    k = (t.date() - days[0].date()).days
    return k if 0 <= k < 7 else None


agents = []
for wf in get("/workflows"):
    if wf["name"].startswith("Le Bureau"):
        continue
    lr = wf.get("last_run") or {}
    if (lr.get("started_at") or "") < since:
        continue  # rien sur la semaine
    per_day = [0] * 7
    week = {"tok": 0, "runs": 0, "fail": 0}
    today = {"tok": 0, "runs": 0, "fail": 0}
    off = 0
    while True:
        batch = get(f"/workflows/{wf['id']}/runs?limit=25&offset={off}")
        for r in batch:
            if r.get("parent_run_id") or not r.get("started_at") or r["started_at"] < since:
                continue
            k = day_index(r["started_at"])
            if k is None:
                continue
            tok = int(r.get("tokens_used") or 0)
            failed = r.get("status") == "Failed"
            per_day[k] += tok
            for agg in ([week, today] if k == 6 else [week]):
                agg["tok"] += tok
                agg["runs"] += 1
                agg["fail"] += failed
        off += 25
        if len(batch) < 25 or min((b.get("started_at") or "") for b in batch) < since:
            break
    if week["runs"]:
        agents.append({"wf": wf["id"], "name": wf["name"], "today": today, "week": week, "days": per_day})

# tarif moyen observé par Kronn sur les discussions (coût réellement mesuré)
rate, src = None, ""
try:
    st = get("/stats/tokens")
    usd = (st.get("total_cost") or {}).get("recorded_usd") or 0
    tok = st.get("discussion_tokens") or 0
    if usd and tok:
        rate = round(usd / tok * 1e6, 2)
        src = f"{usd:.2f} $ mesurés pour {tok/1e6:.1f} M tokens de discussions"
except Exception:
    pass

agents.sort(key=lambda a: -a["week"]["tok"])
print(json.dumps({"generated_at": datetime.now(timezone.utc).isoformat(), "days": [d.strftime("%Y-%m-%d") for d in days],
                  "rate_usd_per_mtok": rate, "rate_source": src, "agents": agents}, ensure_ascii=False, separators=(",", ":")))
