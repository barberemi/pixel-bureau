"""Gates en attente de validation, pour que la page Le Bureau puisse les décider (page action « bureau-gate »).

Sortie (stdout, JSON parsé par l'étape CollectApiData) :
  {generated_at, gates: [{run, wf, wf_name, gate, message, since}], workflows: [{wf, name, trigger}]}
`workflows` = ceux que la page peut relancer (page action « bureau-relaunch ») : actifs, hors Bureau, pas
sous-workflow d'un autre, sans variable obligatoire à saisir.
Le dataset doit être un vrai objet : Kronn y retrouve la ligne cliquée (find(run)) côté serveur.
"""
import json, os as _os
from datetime import datetime, timezone
from _lib import get, is_bureau



# définitions complètes en cache 10 min (la liste n'a pas de date de modification) : sans cache, un GET par
# workflow actif chaque minute. Fichier hors du dépôt ; illisible ou absent : relecture de l'API.
CACHE = _os.path.join(_os.path.expanduser("~"), ".cache", "kronn-bureau", "workflow_defs.json")
CACHE_TTL = 600
try:
    _cache = json.load(open(CACHE))
except Exception:
    _cache = {}
_now = datetime.now(timezone.utc).timestamp()


def definition(wid):
    c = _cache.get(wid)
    if c and _now - c.get("at", 0) < CACHE_TTL:
        return c["def"]
    full = get(f"/workflows/{wid}")
    _cache[wid] = {"at": _now, "def": {k: full.get(k) for k in ("steps", "variables")}}
    return _cache[wid]["def"]


gates, defs = [], {}
for wf in get("/workflows"):
    if not wf.get("enabled"):
        continue
    defs[wf["id"]] = (wf, None)
    # seuls les workflows qui ont une étape Gate peuvent attendre une validation ; on ne se fie pas au
    # dernier run (un run plus ancien peut attendre pendant qu'un plus récent est déjà fini)
    full = definition(wf["id"])
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
        msg = (s.get("output") or "").strip()
        if not msg:  # la liste des runs ne porte pas les sorties : le message rendu de la gate est dans le détail du run
            detail = get(f"/workflows/{wf['id']}/runs/{r['id']}")
            msg = next((x.get("output") or "" for x in detail.get("step_results") or [] if x.get("step_name") == s["step_name"]), "").strip()
        msg = msg or (steps_def.get(s["step_name"], {}).get("gate_message") or "")
        gates.append({"run": r["id"], "wf": wf["id"], "wf_name": wf["name"], "gate": s["step_name"],
                      "message": msg[:400], "since": s.get("started_at") or r.get("started_at")})

children = {s.get("sub_workflow_id") for _, full in defs.values() if full for s in full.get("steps", []) if s.get("sub_workflow_id")}
relaunch = []
for wid, (wf, full) in defs.items():
    if is_bureau(wf) or wid in children or not full:
        continue
    if any(v.get("required", True) and not v.get("source") for v in full.get("variables") or []):
        continue
    relaunch.append({"wf": wid, "name": wf["name"], "trigger": wf.get("trigger_type")})

# agents qu'on peut interroger sur leurs runs (page action « bureau-ask ») : tout workflow actif hors Bureau
askable = [{"wf": wid, "name": wf["name"]} for wid, (wf, full) in defs.items() if not is_bureau(wf)]
try:
    _os.makedirs(_os.path.dirname(CACHE), exist_ok=True)
    json.dump({k: v for k, v in _cache.items() if k in defs}, open(CACHE, "w"))
except Exception:
    pass
print(json.dumps({"generated_at": datetime.now(timezone.utc).isoformat(), "gates": gates, "workflows": relaunch, "askable": askable}, ensure_ascii=False))
