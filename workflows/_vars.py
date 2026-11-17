# Variables de lancement d'un run (jira_ticket_key, pr, repo, project, message_id), reconstituées pour la page.
#
# Kronn ne les rend plus : trigger_context ne porte que type, triggered_at, variables_resolved_at et execution_snapshot_id
# (variables rangées dans un instantané que l'API n'expose pas ; constat du 2026-11-17, plus aucun run lancé à la main
# n'en a, la mise en prod depuis le 19/10 au moins). Seuls les items d'un BatchWorkflow gardent current_task.*.
# Sources, dans l'ordre, jamais inventé (sans source fiable, vars reste vide) :
#   a. trigger_context s'il les porte encore (run_row de _lib.py, compatibilité) ;
#   b. le cache local qu'écrit le workflow lui-même : mise en prod (mep/runs/<run>.json, étape resolve de mep.py),
#      investigation du Support (support.json › runs, étape open de support.py) ;
#   c. la sortie d'une étape de résolution connue, lue dans le détail du run (la liste n'a pas les sorties) : resolve de
#      la mise en prod (la clé seule), réponse Jira de l'étape ticket (implémenter, réestimer, me l'affecter / désaffecter),
#      réponse GitHub de fetch_meta (relire une PR à la demande). Lue une fois, gardée dans vars/<run>.json.
# Recopié au rendu dans les seuls relevés qui l'importent (live_snapshot.py, office_snapshot.py).
import json
import os
import re
from _lib import CFG, get, read_json, write_json

CACHE = os.path.join(os.path.expanduser("~"), ".cache", "pixel-bureau")
_CHECK = {"jira_ticket_key": re.compile(r"[A-Z][A-Z0-9]+-\d+"), "pr": re.compile(r"\d{1,7}"),
          "repo": re.compile(r"[\w.-]+/[\w.-]+"), "project": re.compile(r"[\w.-]+/[\w.-]+"), "message_id": re.compile(r"[^\s]{1,79}")}
_M = CFG.get("models") or {}
# (c) modèle -> (étape, forme de sa sortie)
_STEPS = {_M[k]: (s, f) for k, s, f in (("impl", "ticket", "jira"), ("estimate", "get_ticket", "jira"), ("assign", "ticket", "jira"),
                                        ("unassign", "ticket", "jira"), ("review_one", "fetch_meta", "github")) if _M.get(k)}
_SUPPORT = []


def _clean(v):
    """Seulement les valeurs bien formées (clé Jira, n° de PR, owner/dépôt…) ; le reste n'est pas une source fiable."""
    out = {k: str(x) for k, x in v.items() if x not in (None, "") and _CHECK[k].fullmatch(str(x))}
    return out if out.get("jira_ticket_key") or out.get("pr") or out.get("message_id") else {}


def _read(*p):
    try:
        d = read_json(os.path.join(CACHE, *p))
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def _step(wid, r, rid, step, kind):
    if not any(s.get("step_name") == step and s.get("status") == "Success" for s in r.get("step_results") or []):
        return {}
    memo = _read("vars", rid + ".json")
    if memo:
        return _clean(memo)
    try:
        full = get(f"/workflows/{wid}/runs/{r['id']}") or {}
        out = next((s.get("output") or "" for s in full.get("step_results") or [] if s.get("step_name") == step), "")
        d = json.loads(out.split("---STEP_OUTPUT---")[1].split("---END_STEP_OUTPUT---")[0], strict=False).get("data") or {}
    except Exception:
        return {}
    if kind == "stdout":
        v = {"jira_ticket_key": str(d.get("stdout") or "").strip()}
    elif kind == "jira":
        v = {"jira_ticket_key": d.get("key")}
    else:
        v = {"pr": d.get("number"), "repo": ((d.get("base") or {}).get("repo") or {}).get("full_name")}
    v = _clean(v)
    if v:
        try:
            os.makedirs(os.path.join(CACHE, "vars"), exist_ok=True)
            write_json(os.path.join(CACHE, "vars", rid + ".json"), v)
        except OSError:
            pass
    return v


def run_vars(wf, r, kept):
    """vars d'un run de la page : kept (trigger_context, filtré par run_row) s'il en a, sinon reconstituées, sinon {}."""
    if kept:
        return kept
    wid, rid = wf.get("id") or "", re.sub(r"[^\w-]", "", str(r.get("id") or ""))
    if not rid:
        return {}
    mep = CFG.get("mep_workflow")
    if mep and wid.startswith(mep):
        st = _read("mep", "runs", rid + ".json")
        return _clean({"jira_ticket_key": st.get("ticket"), "pr": st.get("pr"), "repo": st.get("repo"),
                       "project": st.get("repo")}) or _step(wid, r, rid, "resolve", "stdout")
    if wid and wid == _M.get("support"):
        if not _SUPPORT:
            _SUPPORT.append(_read("support.json").get("runs") or {})
        return _clean({"message_id": (_SUPPORT[0].get(r.get("id")) or {}).get("msg")})
    if wid in _STEPS:
        return _step(wid, r, rid, *_STEPS[wid])
    return {}
