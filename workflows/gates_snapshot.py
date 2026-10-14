"""Gates en attente de validation, pour que la page Le Bureau puisse les décider (page action « bureau-gate »).

Sortie (stdout, JSON parsé par l'étape CollectApiData) :
  {generated_at, gates: [{run, wf, wf_name, gate, message, since}], workflows: [{wf, name, trigger}], askable: [{wf, name}],
   projects: [{id, name}], ducks: [{id, title, project, updated, created, awaiting}],
   questions: [{id, disc, title, agent, bureau, since, question, context, options, rec, multiple, items, more_items}], qrows: [{id, q, disc}]}
`workflows` = ceux que la page peut relancer (page action « bureau-relaunch ») : actifs, hors Bureau, pas
sous-workflow d'un autre, sans variable obligatoire à saisir.
`projects` = les projets Kronn, « Sans projet » (id « none ») en tête : un bouton « parler au canard » chacun (page action
« bureau-duck », find(id)). `ducks` = les discussions du canard (titre « 🦆 … », duck_start.py) des 14 derniers jours,
15 au plus, les plus récentes d'abord ; awaiting = des questions attendent ta réponse (pending_question_count, comme
« Attend ta réponse » des visiteurs).
Le dataset doit être un vrai objet : Kronn y retrouve la ligne cliquée (find(run)) côté serveur.
"""
import json, os as _os
from datetime import datetime, timedelta, timezone
from _lib import get, is_bureau, is_bureau_disc



# définitions complètes en cache 10 min (la liste n'a pas de date de modification) : sans cache, un GET par
# workflow actif chaque minute. Fichier hors du dépôt ; illisible ou absent : relecture de l'API.
CACHE = _os.path.join(_os.path.expanduser("~"), ".cache", "pixel-bureau", "workflow_defs.json")
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
                      "message": msg[:1500], "since": s.get("started_at") or r.get("started_at")})

children = {s.get("sub_workflow_id") for _, full in defs.values() if full for s in full.get("steps", []) if s.get("sub_workflow_id")}
relaunch = []
for wid, (wf, full) in defs.items():
    if is_bureau(wf) or wid in children or not full:
        continue
    # « Relancer » envoie variables: {} : on écarte tout workflow qui attend une saisie obligatoire, sans source ou à saisir
    # au lancement (source user_input, comme Réestimer : sinon le run partirait sans ticket)
    if any(v.get("required", True) and v.get("source") in (None, "", "user_input") for v in full.get("variables") or []):
        continue
    relaunch.append({"wf": wid, "name": wf["name"], "trigger": wf.get("trigger_type")})

# agents qu'on peut interroger sur leurs runs (page action « bureau-ask ») : tout workflow actif hors Bureau
askable = [{"wf": wid, "name": wf["name"]} for wid, (wf, full) in defs.items() if not is_bureau(wf)]
# le canard : un bouton par projet, et ses discussions
names = {}
try:
    names = {p["id"]: p.get("name") or p["id"] for p in get("/projects")}
except Exception:
    pass
projects = [{"id": "none", "name": "Sans projet"}] + [{"id": k, "name": v[:60]} for k, v in sorted(names.items(), key=lambda x: str(x[1]).lower())]
since = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
ducks = []
try:
    ducks = [{"id": d["id"], "title": str(d.get("title") or "")[:100], "project": names.get(d.get("project_id")), "updated": d.get("updated_at"), "created": d.get("created_at"),
              "awaiting": (d.get("pending_question_count") or 0) > 0}
             for d in get("/discussions?per_page=200") if str(d.get("title") or "").startswith("🦆") and not d.get("archived")
             and str(d.get("updated_at") or "") >= since]
except Exception:
    pass
ducks = sorted(ducks, key=lambda d: str(d["updated"] or ""), reverse=True)[:15]
# questions de discussion en attente (bloc kronn-question) : 14 jours, comme le canard, 15 au plus, les plus anciennes
# d'abord. Décidées depuis la page (page action « bureau-answer ») par la ligne cliquée de `qrows` :
#   « q|option » = cette option (question simple) ; « q|all:option » = cette option pour chaque item (formulaire) ;
#   « q|_text » = réponse libre (question simple) ; « q|_decline » = refus. question_answer.py relit la question
# dans Kronn avant de répondre (déjà décidée : refus). bureau = discussion ouverte par le Bureau (canard, interroger).
questions, qrows = [], []
try:
    pend = sorted((d for d in get("/discussions?per_page=200") if (d.get("pending_question_count") or 0) > 0
                   and not d.get("archived") and str(d.get("updated_at") or "") >= since), key=lambda d: str(d.get("updated_at") or ""))
    for d in pend:
        for q in (get(f"/discussions/{d['id']}/questions") or {}).get("questions") or []:
            if q.get("state") != "pending" or len(questions) >= 15:
                continue
            opts = [{"id": o["id"], "label": str(o.get("label") or o["id"])[:80], "desc": str(o.get("description") or "")[:120]}
                    for o in (q.get("options") or [])[:8]]
            items = [{"id": i["id"], "label": str(i.get("label") or i["id"])[:120]} for i in (q.get("items") or [])[:20]]
            form = bool(q.get("items"))
            questions.append({"id": q["id"], "disc": d["id"], "title": str(d.get("title") or "")[:100], "agent": d.get("agent"),
                              "bureau": is_bureau_disc(d), "since": q.get("created_at"), "question": str(q.get("question") or "")[:400],
                              "context": str(q.get("context") or "")[:400], "options": opts, "rec": q.get("recommended_option_ids") or [],
                              "multiple": bool(q.get("multiple")), "items": items, "more_items": len(q.get("items") or []) > len(items)})
            qrows += [{"id": f"{q['id']}|{'all:' if form else ''}{o['id']}", "q": q["id"], "disc": d["id"]} for o in opts]
            qrows += [{"id": f"{q['id']}|{k}", "q": q["id"], "disc": d["id"]} for k in ((["_text"] if not form else []) + ["_decline"])]
except Exception:
    pass
try:
    _os.makedirs(_os.path.dirname(CACHE), exist_ok=True)
    json.dump({k: v for k, v in _cache.items() if k in defs}, open(CACHE, "w"))
except Exception:
    pass
print(json.dumps({"generated_at": datetime.now(timezone.utc).isoformat(), "gates": gates, "workflows": relaunch, "askable": askable,
                  "projects": projects, "ducks": ducks, "questions": questions, "qrows": qrows}, ensure_ascii=False))
