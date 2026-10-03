"""Snapshot of today's Kronn activity -> office_events dataset shape."""
import json, re, sys, urllib.request
from zoneinfo import ZoneInfo
from datetime import datetime, timedelta, timezone
# config d'installation : injectée par tools/publish.py (étape Kronn « python3 -c ») ; en local, lue dans bureau.config.json
import os as _os
_CFG = r"""__BUREAU_CONFIG__"""
CFG = json.loads(_CFG) if not _CFG.startswith("__") else json.load(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), _os.pardir, "bureau.config.json")))

# variables de lancement recopiées dans la page : seulement celles qu'elle lit (jamais un token passé en variable)
VARS_KEPT = ("jira_ticket_key", "current_task.number", "current_task.author", "current_task.repo", "pr", "repo")
API = CFG["kronn"]["api"]
TZ = ZoneInfo(CFG["rhythm"]["timezone"])  # fuseau du bureau, été comme hiver


def get(path):
    with urllib.request.urlopen(API + path, timeout=120) as r:
        body = json.load(r)
    return body.get("data", body)

def model_short(m):
    m = (m or "").lower()
    for k, v in (("opus", "Opus"), ("sonnet", "Sonnet"), ("haiku", "Haiku"), ("gpt", "GPT"), ("gemini", "Gemini"), ("codex", "Codex")):
        if k in m:
            return v
    return (m.split(" ")[0][:14]) if m else None


def step_extra(s, st):
    """Agent, modèle et outil en cours d'une étape (données §5 du Bureau)."""
    if s.get("step_agent"):
        st["ag"] = s["step_agent"]
    if s.get("step_model"):
        st["md"] = model_short(s["step_model"])
    la = s.get("last_activity") or {}
    if la.get("tool"):
        st["act"] = {"t": la["tool"], "x": (la.get("target") or "")[-70:], "at": la.get("at")}
    return st


def important_count(did):
    try:
        return int((get(f"/discussions/{did}/important") or {}).get("total") or 0)
    except Exception:
        return 0



now = datetime.now(TZ)
PURGE_HOURS = (7, 13)  # heures de Paris du nettoyage des vieux runs (premier passage de l'heure)
PURGE_LOG = _os.path.join(_os.path.expanduser("~"), ".cache", "kronn-bureau", "purge.json")
day_start = now.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
since = day_start.isoformat().replace("+00:00", "Z")


def _dig(v):
    if isinstance(v, str):
        t = v.strip()
        if t.startswith("{"):
            try:
                return _dig(json.loads(t))
            except Exception:
                pass
        return t.splitlines()[-1] if t else ""
    if isinstance(v, dict):
        d = v.get("data") if isinstance(v.get("data"), dict) else v
        for k in ("error", "message", "stderr", "stdout"):
            if d.get(k):
                r = _dig(d[k])
                if r:
                    return r
        return v.get("summary") or ""
    return ""


def err_of(step):
    out = step.get("output") or ""
    head = out.split("---STEP_OUTPUT---")[0].strip()
    body = out.split("---STEP_OUTPUT---")[1].split("---END_STEP_OUTPUT---")[0] if "---STEP_OUTPUT---" in out else ""
    msg = _dig(body) if body.strip() else ""
    if not msg or msg.startswith("exit "):
        msg = (msg + " " if msg else "") + head.splitlines()[0] if head else msg
    msg = re.split(r"\s+[\u2014-]\s+\{", msg)[0]
    return re.sub(r"\s+\u2014\s+", " · ", msg).strip()[:240]


runs = []
for wf in get("/workflows"):
    if not wf.get("enabled") or wf["name"].startswith("Le Bureau"):
        continue
    lr = wf.get("last_run") or {}
    if (lr.get("started_at") or "") < since and lr.get("status") not in ("Running", "WaitingApproval", "Pending"):
        continue
    page, off = [], 0
    while True:
        batch = get(f"/workflows/{wf['id']}/runs?limit=15&offset={off}")
        page += batch
        off += 15
        if len(batch) < 15 or min((b.get("started_at") or "") for b in batch) < since:
            break
    for r in page:
        if (r.get("started_at") or "") < since and r.get("status") not in ("Running", "WaitingApproval", "Pending"):
            continue
        steps = []
        for s in r.get("step_results") or []:
            st = {"n": s["step_name"], "k": s.get("step_kind"), "s": s["status"], "at": s.get("started_at"),
                  "ms": int(s.get("duration_ms") or 0), "tok": int(s.get("tokens_used") or 0)}
            if s["status"] not in ("Success", "Skipped"):
                st["err"] = err_of(s)
            step_extra(s, st)
            steps.append(st)
        runs.append({
            "wf": wf["id"], "wf_name": wf["name"], "project": wf.get("project_name"), "trigger": wf.get("trigger_type"),
            "run": r["id"], "status": r["status"], "start": r.get("started_at"), "end": r.get("finished_at"),
            "tok": r.get("tokens_used") or 0, "parent": r.get("parent_run_id"), "tby": r.get("triggered_by_run_id"),
            "vars": {k: v for k, v in (r.get("trigger_context") or {}).items() if k in VARS_KEPT and isinstance(v, str) and len(v) < 80} if isinstance(r.get("trigger_context"), dict) else {},
            "batch": [r.get("batch_total") or 0, r.get("batch_completed") or 0, r.get("batch_failed") or 0],
            "steps": steps,
        })

projects = {p["id"]: p.get("name") for p in get("/projects")}
discs = [
    {"id": d["id"], "title": d["title"][:160], "agent": d.get("agent"), "participants": d.get("participants"),
     "msgs": d.get("non_system_message_count") or d.get("message_count"), "start": d["created_at"],
     "end": d["updated_at"], "awaiting": bool(d.get("awaiting_agent")), "pending": d.get("pending_question_count") or 0,
     "run": d.get("workflow_run_id"), "imp": important_count(d["id"]), "project": projects.get(d.get("project_id"))}
    for d in get("/discussions?per_page=200") if d["updated_at"] >= since and not d.get("archived") and not d["title"].startswith("Le Bureau")
]


# Nettoyage : uniquement les runs des crons du Bureau, terminés depuis plus de 7 jours.
# (Kronn n'a qu'une purge globale ; on ne touche ici à aucun autre workflow.)
# Kronn ne sait pas lister « les runs de plus de 7 jours » : il faut relire tous les runs (~6 000, ~120 GET).
# On ne le fait donc qu'au premier passage de 7h et de 13h (heure de Paris), pas toutes les 10 min ;
# 13h rattrape une matinée où le Mac dormait.
BUREAU_WORKFLOWS = [w for w in (CFG.get("workflows") or {}).values() if w]
cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat().replace("+00:00", "Z")
purge = {"at": None, "deleted": 0, "errors": 0, "last_error": None}
if now.hour in PURGE_HOURS and now.minute < 10:
    purge["at"] = datetime.now(timezone.utc).isoformat()
    for wid in BUREAU_WORKFLOWS:
        try:
            old = []
            off = 0
            while True:
                batch = get(f"/workflows/{wid}/runs?limit=50&offset={off}")
                old += [r["id"] for r in batch if r.get("finished_at") and r["finished_at"] < cutoff
                        and r.get("status") in ("Success", "Failed", "Cancelled", "Partial", "Interrupted")]
                off += 50
                if len(batch) < 50:
                    break
        except Exception as e:
            purge["errors"] += 1
            purge["last_error"] = f"liste des runs de {wid[:8]} : {e}"[:200]
            continue
        for rid in old:
            try:
                urllib.request.urlopen(urllib.request.Request(f"{API}/workflows/{wid}/runs/{rid}", method="DELETE"), timeout=30)
                purge["deleted"] += 1
            except Exception as e:
                purge["errors"] += 1
                purge["last_error"] = f"suppression du run {rid[:8]} : {e}"[:200]
    try:  # bilan gardé hors du dépôt : la page l'affiche jusqu'au nettoyage suivant
        _os.makedirs(_os.path.dirname(PURGE_LOG), exist_ok=True)
        json.dump(purge, open(PURGE_LOG, "w"))
    except Exception:
        pass
else:
    try:
        purge = json.load(open(PURGE_LOG))
    except Exception:
        pass

runs.sort(key=lambda x: x["start"] or "")
crons = []
for w in get("/workflows"):
    if w.get("enabled") and w.get("trigger_type") == "cron" and not w["name"].startswith("Le Bureau"):
        tr = (get("/workflows/" + w["id"]).get("trigger") or {})
        if tr.get("schedule"):
            crons.append({"wf": w["id"], "name": w["name"], "schedule": tr["schedule"]})
snap = {"generated_at": datetime.now(timezone.utc).isoformat(), "day": now.strftime("%Y-%m-%d"), "runs": runs, "discussions": discs, "crons": crons, "purge": purge}
out = json.dumps(snap, separators=(",", ":"), ensure_ascii=False)
cut = datetime.now(timezone.utc) - timedelta(hours=3)
for r in runs:
    if len(out.encode()) < 90000:
        break
    if r["status"] == "Success" and (r["end"] or "") < cut.isoformat():
        r["steps"] = []
        out = json.dumps(snap, separators=(",", ":"), ensure_ascii=False)
print(out)
