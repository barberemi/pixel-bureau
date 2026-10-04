"""Socle commun des scripts du Bureau : config d'installation, API Kronn, filtre des workflows du Bureau, runs.

Kronn lance chaque script avec « python3 -c <code> », sans fichier voisin : tools/templates.py recopie ce
fichier à la place de la ligne qui importe le socle, au rendu. En local (tests, essais), l'import est réel.
Config : injectée au rendu dans _CFG ; en local, le fichier de la variable
d'environnement BUREAU_CONFIG, sinon bureau.config.json à la racine du dépôt.
"""
import json, os as _os, re, urllib.request
from zoneinfo import ZoneInfo

_CFG = r"""__BUREAU_CONFIG__"""
CFG = json.loads(_CFG) if not _CFG.startswith("__") else json.load(open(
    _os.environ.get("BUREAU_CONFIG") or _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), _os.pardir, "bureau.config.json")))

API = (CFG.get("kronn") or {}).get("api", "")
TZ = ZoneInfo((CFG.get("rhythm") or {}).get("timezone") or "Europe/Paris")  # fuseau du bureau, été comme hiver
ACTIVE = ("Running", "WaitingApproval", "Pending")
# variables de lancement recopiées dans la page : seulement celles qu'elle lit (jamais un token passé en variable)
VARS_KEPT = ("jira_ticket_key", "current_task.number", "current_task.author", "current_task.repo", "pr", "repo")
# workflows et Quick Prompt du Bureau, par id (un nom se renomme) : jamais comptés comme des agents
BUREAU_IDS = {v for part in ("workflows", "actions") for v in (CFG.get(part) or {}).values() if v}


def get(path, timeout=120):
    with urllib.request.urlopen(API + path, timeout=timeout) as r:
        body = json.load(r)
    return body.get("data", body) if isinstance(body, dict) else body


def is_bureau(wf):
    return wf.get("id") in BUREAU_IDS


def is_bureau_disc(d):
    """Discussions ouvertes par le bouton « interroger » (Quick Prompt du Bureau) : pas des visiteurs.
    Une discussion ne porte pas l'id de son Quick Prompt, seulement son nom en titre."""
    return str(d.get("title") or "").startswith("Le Bureau")


def model_short(m):
    m = (m or "").lower()
    for k, v in (("opus", "Opus"), ("sonnet", "Sonnet"), ("haiku", "Haiku"), ("gpt", "GPT"), ("gemini", "Gemini"), ("codex", "Codex")):
        if k in m:
            return v
    return (m.split(" ")[0][:14]) if m else None


def _dig(v):
    if isinstance(v, str):
        t = v.strip()
        if t.startswith("{"):
            try:
                return _dig(json.loads(t))
            except ValueError:
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
    """Message d'erreur lisible d'une étape : le JSON de sa sortie (error, message, stderr…), sinon sa première ligne."""
    out = step.get("output") or ""
    head = out.split("---STEP_OUTPUT---")[0].strip()
    body = out.split("---STEP_OUTPUT---")[1].split("---END_STEP_OUTPUT---")[0] if "---STEP_OUTPUT---" in out else ""
    msg = _dig(body) if body.strip() else ""
    if not msg or msg.startswith("exit "):
        msg = (msg + " " if msg else "") + head.splitlines()[0] if head else msg
    msg = re.split(r"\s+[—-]\s+\{", msg)[0]
    return re.sub(r"\s+—\s+", " · ", msg).strip()[:240]


def step_row(s):
    """Étape d'un run, au format de la page : nom, type, statut, début, durée, tokens, erreur, agent, modèle, outil."""
    st = {"n": s["step_name"], "k": s.get("step_kind"), "s": s["status"], "at": s.get("started_at"),
          "ms": int(s.get("duration_ms") or 0), "tok": int(s.get("tokens_used") or 0)}
    if s["status"] not in ("Success", "Skipped"):
        st["err"] = err_of(s)
    if s.get("step_agent"):
        st["ag"] = s["step_agent"]
    if s.get("step_model"):
        st["md"] = model_short(s["step_model"])
    la = s.get("last_activity") or {}
    if la.get("tool"):
        st["act"] = {"t": la["tool"], "x": (la.get("target") or "")[-70:], "at": la.get("at")}
    return st


def run_row(wf, r):
    """Run au format de la page (même forme dans les instantanés office et live, que la page superpose)."""
    tc = r.get("trigger_context") if isinstance(r.get("trigger_context"), dict) else {}
    return {"wf": wf["id"], "wf_name": wf["name"], "project": wf.get("project_name"), "trigger": wf.get("trigger_type"),
            "run": r["id"], "status": r["status"], "start": r.get("started_at"), "end": r.get("finished_at"),
            "tok": r.get("tokens_used") or 0, "parent": r.get("parent_run_id"), "tby": r.get("triggered_by_run_id"),
            "vars": {k: v for k, v in tc.items() if k in VARS_KEPT and isinstance(v, str) and len(v) < 80},
            "batch": [r.get("batch_total") or 0, r.get("batch_completed") or 0, r.get("batch_failed") or 0],
            "steps": [step_row(s) for s in r.get("step_results") or []]}


def important_count(did):
    try:
        return int((get(f"/discussions/{did}/important") or {}).get("total") or 0)
    except Exception:
        return 0


def disc_row(d, projects=None):
    row = {"id": d["id"], "title": d["title"][:160], "agent": d.get("agent"), "participants": d.get("participants"),
           "msgs": d.get("non_system_message_count") or d.get("message_count"), "start": d["created_at"], "end": d["updated_at"],
           "awaiting": bool(d.get("awaiting_agent")), "pending": d.get("pending_question_count") or 0,
           "run": d.get("workflow_run_id"), "imp": important_count(d["id"])}
    if projects is not None:
        row["project"] = projects.get(d.get("project_id"))
    return row


def dumps(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
