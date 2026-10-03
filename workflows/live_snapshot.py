"""Instantané « live » (toutes les minutes) : runs en cours ou récents, discussions récentes, déploiements du jour.

Entrée : aucune (déploiements lus avec `gh run list`)
Sortie (stdout) : {generated_at, day, runs[], discussions[], deploys{staging{tag:run}, prod{tag:run}}}
Même format de runs et de discussions que office_snapshot.py, pour que la page les superpose.
"""
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
TZ = ZoneInfo(CFG["rhythm"]["timezone"])
ACTIVE = ("Running", "WaitingApproval", "Pending")


def get(path):
    with urllib.request.urlopen(API + path, timeout=60) as r:
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
day_start = now.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
since = day_start.isoformat().replace("+00:00", "Z")
recent = (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat().replace("+00:00", "Z")


def err_of(step):
    out = (step.get("output") or "").replace("---STEP_OUTPUT---", " ").replace("---END_STEP_OUTPUT---", " ")
    m = re.search(r'"(?:error|message)"\s*:\s*"([^"]{3,200})', out)
    return (m.group(1) if m else out.strip().splitlines()[0] if out.strip() else "")[:200]


runs = []
for wf in get("/workflows"):
    if not wf.get("enabled") or wf["name"].startswith("Le Bureau"):
        continue
    lr = wf.get("last_run") or {}
    if lr.get("status") not in ACTIVE and (lr.get("started_at") or "") < recent and (lr.get("finished_at") or "") < recent:
        continue
    for r in get(f"/workflows/{wf['id']}/runs?limit=5"):
        if (r.get("started_at") or "") < since:
            continue
        if r.get("status") not in ACTIVE and (r.get("finished_at") or "") < recent:
            continue
        steps = []
        for s in r.get("step_results") or []:
            st = {"n": s["step_name"], "k": s.get("step_kind"), "s": s["status"], "at": s.get("started_at"),
                  "ms": int(s.get("duration_ms") or 0), "tok": int(s.get("tokens_used") or 0)}
            if s["status"] not in ("Success", "Skipped"):
                st["err"] = err_of(s)
            step_extra(s, st)
            steps.append(st)
        tc = r.get("trigger_context") if isinstance(r.get("trigger_context"), dict) else {}
        runs.append({"wf": wf["id"], "wf_name": wf["name"], "project": wf.get("project_name"), "trigger": wf.get("trigger_type"),
                     "run": r["id"], "status": r["status"], "start": r.get("started_at"), "end": r.get("finished_at"),
                     "tok": r.get("tokens_used") or 0, "parent": r.get("parent_run_id"), "tby": r.get("triggered_by_run_id"),
                     "vars": {k: v for k, v in tc.items() if k in VARS_KEPT and isinstance(v, str) and len(v) < 80},
                     "batch": [r.get("batch_total") or 0, r.get("batch_completed") or 0, r.get("batch_failed") or 0], "steps": steps})

discs = [
    {"id": d["id"], "title": d["title"][:160], "agent": d.get("agent"), "participants": d.get("participants"),
     "msgs": d.get("non_system_message_count") or d.get("message_count"), "start": d["created_at"], "end": d["updated_at"],
     "awaiting": bool(d.get("awaiting_agent")), "pending": d.get("pending_question_count") or 0, "run": d.get("workflow_run_id"), "imp": important_count(d["id"])}
    for d in get("/discussions?page=1&per_page=20") if d["updated_at"] >= since and not d.get("archived") and not d["title"].startswith("Le Bureau")
]

VER = re.compile(r"(\d+\.\d+\.\d+)")
def gh_runs(workflow):
    import subprocess
    try:
        out = subprocess.run(["gh", "run", "list", "--repo", CFG["github"]["repo"], "--workflow", workflow, "--limit", "5",
                              "--json", "status,conclusion,createdAt,updatedAt,displayTitle,url"], capture_output=True, text=True, timeout=60)
        return json.loads(out.stdout or "[]")
    except Exception:
        return []


# déploiements staging/prod : lus ici avec gh (le script tourne dans une étape CollectApiData, sans stdin)
D = {"staging": gh_runs(CFG["github"]["staging_workflow"]), "prod": gh_runs(CFG["github"]["prod_workflow"])}


def by_tag(lst):
    out = {}
    for r in sorted(lst or [], key=lambda x: x.get("createdAt") or ""):
        m = VER.search(r.get("displayTitle") or "")
        if m and (r.get("createdAt") or "") >= since:
            out[m.group(1)] = {"status": r.get("status"), "conclusion": r.get("conclusion"), "start": r.get("createdAt"),
                               "end": r.get("updatedAt") if r.get("status") == "completed" else None, "url": r.get("url")}
    return out


print(json.dumps({"generated_at": datetime.now(timezone.utc).isoformat(), "day": now.strftime("%Y-%m-%d"),
                  "runs": runs, "discussions": discs,
                  "deploys": {"staging": by_tag(D.get("staging")), "prod": by_tag(D.get("prod"))}},
                 ensure_ascii=False, separators=(",", ":")))
