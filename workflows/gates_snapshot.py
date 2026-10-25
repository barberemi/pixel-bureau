"""Gates en attente de validation, pour que la page Le Bureau puisse les décider (page action « bureau-gate »).

Sortie (stdout, JSON parsé par l'étape CollectApiData) :
  {generated_at, gates: [{run, wf, wf_name, gate, message, since}], workflows: [{wf, name, trigger, bureau?, params}], askable: [{wf, name}],
   projects: [{id, name}], ducks: [{id, title, project, updated, created, awaiting}],
   questions: [{id, disc, title, agent, bureau, since, question, context, options, rec, multiple, items, more_items}], qrows: [{id, q, disc}],
   grows: [{id, run, decision}], warnings: [texte]}
`workflows` = ceux que la page peut relancer (page action « bureau-relaunch ») : actifs, hors Bureau, pas
sous-workflow d'un autre, sans variable obligatoire à saisir ; plus les crons du Bureau, avec la clé de leur source (bureau) ;
chaque ligne porte params = "" (liée au bouton, pour que la carte ne demande rien).
`projects` = les projets Kronn, « Sans projet » (id « none ») en tête : un bouton « parler au canard » chacun (page action
« bureau-duck », find(id)). `ducks` = les discussions du canard (titre « 🦆 … », duck_start.py) des 14 derniers jours,
15 au plus, les plus récentes d'abord ; awaiting = des questions attendent ta réponse (pending_question_count, comme
« Attend ta réponse » des visiteurs).
`warnings` (#8) = lectures en échec dont la partie reste vide (projets, canard, questions) : le dataset est publié
quand même, chaque échec est écrit sur stderr (visible dans le run Kronn) et affiché par le panneau Fraîcheur.
Le dataset doit être un vrai objet : Kronn y retrouve la ligne cliquée (find(run)) côté serveur.
Avec notify_mac (config), une notification du Mac par osascript pour chaque nouvelle validation ou question en attente.
"""
import json, os as _os, shutil, subprocess, sys
from datetime import datetime, timedelta, timezone
from _lib import CFG, get, get_all, is_bureau, is_bureau_disc, read_json, write_json



# définitions complètes en cache 10 min (la liste n'a pas de date de modification) : sans cache, un GET par
# workflow actif chaque minute. Fichier hors du dépôt ; illisible ou absent : relecture de l'API.
CACHE = _os.path.join(_os.path.expanduser("~"), ".cache", "pixel-bureau", "workflow_defs.json")
CACHE_TTL = 600
try:
    _cache = read_json(CACHE)
except Exception:
    _cache = {}
_now = datetime.now(timezone.utc).timestamp()
warnings = []


def warn(what, e):
    """Échec avalé qui laisse une partie du dataset vide : sur stderr et dans warnings (#8)."""
    msg = f"{what} ({str(e)[:120] or type(e).__name__})"
    print("gates : " + msg, file=sys.stderr)
    warnings.append(msg)


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
    relaunch.append({"wf": wid, "name": wf["name"], "trigger": wf.get("trigger_type"), "params": ""})
# params : toujours vide, lié à la variable params du workflow de relance par le bouton « ↻ » (bureau-relaunch) : la carte
# Kronn n'a plus de champ « Paramètres » à montrer (réservé à « ▶ Lancer… », bureau-launch)
# les crons du Bureau aussi (#44), clé de leur source (bureau) : « ↻ Relancer » sur leur ligne en échec ou en retard du
# panneau Fraîcheur ; jamais comptés comme des agents pour autant (is_bureau)
for key, wid in (CFG.get("workflows") or {}).items():
    if wid in defs:
        relaunch.append({"wf": wid, "name": defs[wid][0]["name"], "trigger": defs[wid][0].get("trigger_type"), "bureau": key, "params": ""})

# workflows qui demandent une saisie (« ▶ Lancer… » des fiches d'agents, #64) : leurs variables à saisir, dont la page
# fait un champ chacune (#67 : exemple, zone de texte ou liste, motif) puis la ligne « nom=valeur ; … » que relaunch.py
# revérifie (même règle que l'exclusion de « Relancer » ci-dessus)


def field(v):
    out = {"name": v["name"], "label": v.get("label") or v["name"], "required": bool(v.get("required", True))}
    ctl = v.get("control") or {}
    if v.get("placeholder"):
        out["placeholder"] = str(v["placeholder"])[:120]
    if v.get("pattern"):
        out["pattern"] = v["pattern"]
    if ctl.get("type") == "textarea":
        out["multiline"] = True
    if ctl.get("type") == "select":
        out["options"] = [{"value": o["value"], "label": o.get("label") or o["value"]} for o in ctl.get("options") or [] if o.get("enabled", True)]
        if ctl.get("default_value"):
            out["default"] = ctl["default_value"]
    return out


launchable = []
for wid, (wf, full) in defs.items():
    if is_bureau(wf) or wid in children or not full:
        continue
    asked = [v for v in full.get("variables") or [] if v.get("name") and v.get("source") in (None, "", "user_input")]
    if any(v.get("required", True) for v in asked):
        launchable.append({"wf": wid, "name": wf["name"], "vars": [field(v) for v in asked]})
# agents qu'on peut interroger sur leurs runs (page action « bureau-ask ») : tout workflow actif hors Bureau
askable = [{"wf": wid, "name": wf["name"]} for wid, (wf, full) in defs.items() if not is_bureau(wf)]
# le canard : un bouton par projet, et ses discussions
names = {}
try:
    names = {p["id"]: p.get("name") or p["id"] for p in get("/projects")}
except Exception as e:
    warn("projets Kronn illisibles : canard sans bouton par projet", e)
projects = [{"id": "none", "name": "Sans projet"}] + [{"id": k, "name": v[:60]} for k, v in sorted(names.items(), key=lambda x: str(x[1]).lower())]
since = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
# discussions des 14 derniers jours, toutes pages lues (#5) : le canard et les questions en attente
discs = []
try:
    discs = get_all("/discussions", since=since)
except Exception as e:
    warn("discussions Kronn illisibles : canard et questions en attente absents", e)
ducks = []
try:
    ducks = [{"id": d["id"], "title": str(d.get("title") or "")[:100], "project": names.get(d.get("project_id")), "updated": d.get("updated_at"), "created": d.get("created_at"),
              "awaiting": (d.get("pending_question_count") or 0) > 0}
             for d in discs if str(d.get("title") or "").startswith("🦆") and not d.get("archived")
             and str(d.get("updated_at") or "") >= since]
except Exception as e:
    warn("discussions du canard illisibles", e)
ducks = sorted(ducks, key=lambda d: str(d["updated"] or ""), reverse=True)[:15]
# questions de discussion en attente (bloc kronn-question) : 14 jours, comme le canard, 15 au plus, les plus anciennes
# d'abord. Décidées depuis la page (page action « bureau-answer ») par la ligne cliquée de `qrows` :
#   « q|option » = cette option (question simple) ; « q|all:option » = cette option pour chaque item (formulaire) ;
#   « q|_text » = réponse libre (question simple) ; « q|_decline » = refus. question_answer.py relit la question
# dans Kronn avant de répondre (déjà décidée : refus). bureau = discussion ouverte par le Bureau (canard, interroger).
questions, qrows = [], []
try:
    pend = sorted((d for d in discs if (d.get("pending_question_count") or 0) > 0
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
except Exception as e:
    warn("questions en attente illisibles", e)
try:  # cache seulement : un échec coûte une relecture de l'API au passage suivant, rien de faux n'est publié
    _os.makedirs(_os.path.dirname(CACHE), exist_ok=True)
    write_json(CACHE, {k: v for k, v in _cache.items() if k in defs})
except Exception:
    pass
# ---------- notification du Mac ----------
# Réglage notify_mac (installateur, sur Mac) : une notification quand une validation ou une question t'attend, même page
# fermée. Une seule fois par attente : celles déjà signalées sont retenues dans le cache. Le cache est écrit d'abord :
# s'il ne s'écrit pas, rien n'est envoyé (sinon la même notification reviendrait chaque minute). Textes passés en
# arguments à osascript, jamais dans le script AppleScript (ils viennent des agents).
NOTIFIED = _os.path.join(_os.path.dirname(CACHE), "notified.json")


def first_line(s):
    return next((x.strip().lstrip("#>*- ").strip() for x in str(s or "").splitlines() if x.strip().lstrip("#>*- ").strip()), "")[:200]


def notify_mac():
    if not CFG.get("notify_mac") or not shutil.which("osascript"):
        return
    waiting = {f"g:{g['run']}|{g['gate']}": ("✋", g["wf_name"], first_line(g["message"]) or "attend ta validation") for g in gates}
    waiting.update({f"q:{q['id']}": ("❓", q["title"], first_line(q["question"])) for q in questions})
    try:
        seen = set(read_json(NOTIFIED))
    except Exception:  # pas encore de cache (ou illisible) : tout ce qui attend est nouveau
        seen = set()
    new = [v for k, v in waiting.items() if k not in seen]
    try:
        write_json(NOTIFIED, sorted(set(waiting) | (seen if warnings else set())))  # lecture en échec : on n'oublie rien
    except Exception as e:
        print("gates : notification du Mac sautée, cache non écrit (" + str(e)[:120] + ")", file=sys.stderr)
        return
    if not new:
        return
    if len(new) == 1:
        ico, who, what = new[0]
        title, sub, text = f"Le Bureau · {ico} " + ("validation" if ico == "✋" else "question"), who, what
    else:
        title, sub, text = (f"Le Bureau · ✋ {len(new)} décisions t'attendent", ", ".join(w for _, w, _ in new[:3]) + (" …" if len(new) > 3 else ""),
                            "Décide-les depuis ta fiche de boss.")
    try:
        r = subprocess.run(["osascript", "-e", "on run argv", "-e",
                            'display notification (item 1 of argv) with title (item 2 of argv) subtitle (item 3 of argv) sound name "Glass"',
                            "-e", "end run", text, title, str(sub)[:120]], capture_output=True, text=True, timeout=15)
        if r.returncode:
            raise RuntimeError((r.stderr or "osascript a échoué").strip()[:120])
    except Exception as e:
        warn("notification du Mac non envoyée", e)


notify_mac()
# une ligne par décision possible de chaque gate (#45) : les boutons directs de la page (approuver, rejeter, changements)
# en désignent une, Kronn y relit run_id et decision (page action « bureau-gate »), jamais saisis
grows = [{"id": f"{g['run']}|{d}", "run": g["run"], "decision": d} for g in gates for d in ("approve", "reject", "request_changes")]
print(json.dumps({"generated_at": datetime.now(timezone.utc).isoformat(), "gates": gates, "workflows": relaunch, "launchable": launchable, "askable": askable,
                  "projects": projects, "ducks": ducks, "questions": questions, "qrows": qrows, "grows": grows,
                  "warnings": warnings}, ensure_ascii=False))
