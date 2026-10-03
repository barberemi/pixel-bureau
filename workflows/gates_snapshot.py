"""Gates en attente de validation, pour que la page Le Bureau puisse les décider (page action « bureau-gate »).

Sortie (stdout, JSON parsé par l'étape CollectApiData) :
  {generated_at, gates: [{run, wf, wf_name, gate, message, since}], workflows: [{wf, name, trigger}]}
`workflows` = ceux que la page peut relancer (page action « bureau-relaunch ») : actifs, hors Bureau, pas
sous-workflow d'un autre, sans variable obligatoire à saisir.
Le dataset doit être un vrai objet : Kronn y retrouve la ligne cliquée (find(run)) côté serveur.
"""
import json, urllib.request
from datetime import datetime, timezone
# config d'installation : injectée par tools/publish.py (étape Kronn « python3 -c ») ; en local, lue dans bureau.config.json
import os as _os
_CFG = r"""__BUREAU_CONFIG__"""
CFG = json.loads(_CFG) if not _CFG.startswith("__") else json.load(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), _os.pardir, "bureau.config.json")))

API = CFG["kronn"]["api"]


def get(path):
    with urllib.request.urlopen(API + path, timeout=30) as r:
        body = json.load(r)
    return body.get("data", body)


gates, defs = [], {}
for wf in get("/workflows"):
    if not wf.get("enabled"):
        continue
    defs[wf["id"]] = (wf, None)
    # seuls les workflows qui ont une étape Gate peuvent attendre une validation ; on ne se fie pas au
    # dernier run (un run plus ancien peut attendre pendant qu'un plus récent est déjà fini)
    full = get(f"/workflows/{wf['id']}")
    defs[wf["id"]] = (wf, full)
    steps_def = {x["name"]: x for x in full.get("steps", [])}
    if not any((x.get("step_type") or {}).get("type") == "Gate" for x in steps_def.values()):
        continue  # (la définition reste connue pour la liste des workflows relançables)
    for r in get(f"/workflows/{wf['id']}/runs?limit=10"):
        if r.get("status") != "WaitingApproval":
            continue
        waiting = [s for s in (r.get("step_results") or []) if s.get("status") == "WaitingApproval"]
        if not waiting:
            continue
        s = waiting[-1]
        msg = (s.get("output") or "").strip() or (steps_def.get(s["step_name"], {}).get("gate_message") or "")
        gates.append({"run": r["id"], "wf": wf["id"], "wf_name": wf["name"], "gate": s["step_name"],
                      "message": msg[:400], "since": s.get("started_at") or r.get("started_at")})

children = {s.get("sub_workflow_id") for _, full in defs.values() if full for s in full.get("steps", []) if s.get("sub_workflow_id")}
relaunch = []
for wid, (wf, full) in defs.items():
    if wf["name"].startswith("Le Bureau") or wid in children or not full:
        continue
    if any(v.get("required", True) and not v.get("source") for v in full.get("variables") or []):
        continue
    relaunch.append({"wf": wid, "name": wf["name"], "trigger": wf.get("trigger_type")})

# agents qu'on peut interroger sur leurs runs (page action « bureau-ask ») : tout workflow actif hors Bureau
askable = [{"wf": wid, "name": wf["name"]} for wid, (wf, full) in defs.items() if not wf["name"].startswith("Le Bureau")]
print(json.dumps({"generated_at": datetime.now(timezone.utc).isoformat(), "gates": gates, "workflows": relaunch, "askable": askable}, ensure_ascii=False))
