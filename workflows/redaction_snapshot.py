"""Relevé de la salle de rédaction (2e étage) : les runs du modèle « créer un ticket » (models.ticket) et de chaque
ticket (models.ticket_un), lus dans l'API Kronn, et le dossier de chaque run (~/.cache/pixel-bureau/ticket/<run>/,
écrit par ticket.py) ; 0 token ; stdout JSON du dataset redaction (cron live).

  {generated_at, tables: [{run, status, since, intention, poste, tour, composants, tickets: [{i, summary, composant,
                           points, etat: wait|run|gate|ok|ecarte|err}], url}], events: [{t, k: arrive|gate|cree|fin, run}], crees}

Une table = une intention en cours (trois au plus) ; poste = recherche, redaction, critique, ou valider quand les
tickets attendent ton tampon, puis sont créés un par un. Chaque ticket : son sous-workflow (le n-ième lancé par le run est le ticket n).

La file de la salle de revue : revue = {batches: {run du cron: [[repo, n°, auteur], …]}, verdicts: {run d'une revue:
approve|comment|request_changes}}. Les PR que chaque passage du cron des revues (models.review_cron, 24 h) a retenues,
dans l'ordre, lues dans la sortie de son étape finalize (ligne PRS=) ; le verdict de chaque revue finie de ces passages,
lu dans la sortie de son avis. Un run fini n'est lu qu'une fois (~/.cache/pixel-bureau/revue/<run>.json).
"""
import datetime, json, os, re, sys
from _lib import ACTIVE, CFG, TZ, get, read_json

HOME = os.path.expanduser("~/.cache/pixel-bureau/ticket")
RV_HOME = os.path.expanduser("~/.cache/pixel-bureau/revue")
POSTES = {"recherche": "recherche", "redaction": "redaction", "critique": "critique", "aiguillage": "critique", "apercu": "valider", "relire": "valider", "chaque": "valider"}


def dget(run, name, default=None):
    try:
        return read_json(os.path.join(HOME, re.sub(r"[^\w-]", "", run), name))
    except (OSError, ValueError):
        return default


def when(iso):
    try:
        return datetime.datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except ValueError:
        return None


def child_st(c):
    steps = {s.get("step_name"): s.get("status") for s in c.get("step_results") or []}
    if c.get("status") == "WaitingApproval":
        return "gate"
    if steps.get("ecarte") == "Success":
        return "ecarte"
    if steps.get("resultat") == "Success" or c.get("status") == "Success":
        return "ok"
    return "err" if c.get("status") == "Failed" else "run"


def table(run, kids):
    d, t = dget(run["id"], "demande.json", {}), dget(run["id"], "tickets.json", {})
    steps = [s.get("step_name") for s in run.get("step_results") or []]
    poste = next((POSTES[n] for n in reversed(steps) if n in POSTES), "recherche")
    mine = sorted([k for k in kids if k.get("parent_run_id") == run["id"]], key=lambda k: k.get("started_at") or "")
    ts = [{"i": i, "summary": str(x.get("summary") or "")[:120], "composant": x.get("composant"), "points": x.get("points"),
           "etat": child_st(mine[i]) if i < len(mine) else "gate" if run.get("status") == "WaitingApproval" else "wait"} for i, x in enumerate(t.get("tickets") or [])]
    ui = (CFG.get("kronn") or {}).get("ui") or ""
    return {"run": run["id"], "status": run.get("status"), "since": run.get("started_at"), "intention": str(d.get("intention") or "")[:200],
            "poste": poste, "tour": d.get("tour") or 1, "composants": (dget(run["id"], "recherche.json", {}) or {}).get("composants") or d.get("composants") or [],
            "tickets": ts, "url": f"{ui.rstrip('/')}/#workflows/{run.get('workflow_id')}" if ui else None}


def step_data(run, names):
    """La sortie d'une étape du run (la première des noms donnés) : son objet data, ou {}."""
    out = next((st.get("output") or "" for n in names for st in run.get("step_results") or [] if st.get("step_name") == n), "")
    try:
        return json.loads(out.split("---STEP_OUTPUT---")[1].split("---END_STEP_OUTPUT---")[0], strict=False).get("data") or {}
    except (IndexError, ValueError, AttributeError):
        return {}


def rv_cached(wf, run, read):
    """read(détail du run), gardé en cache une fois le run fini ; None si illisible."""
    path = os.path.join(RV_HOME, re.sub(r"[^\w-]", "", run["id"]) + ".json")
    if run.get("status") not in ACTIVE:
        try:
            return read_json(path)["v"]
        except (OSError, ValueError, KeyError):
            pass
    d = get(f"/workflows/{wf}/runs/{run['id']}")
    if not d:
        return None
    v = read(d)
    if run.get("status") not in ACTIVE:
        os.makedirs(RV_HOME, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"v": v}, f)
    return v


def prs_of(d):
    for line in str(step_data(d, ["finalize"]).get("stdout") or "").splitlines():
        if line.startswith("PRS="):
            try:
                return [[str(p[0]), int(p[1]), str(p[2] or "")] for p in json.loads(line[4:])][:30]
            except (ValueError, TypeError, IndexError):
                return []
    return []


def revue(m, limit):
    """La file de la salle de revue : les PR retenues par chaque passage du cron, les verdicts des revues finies."""
    out = {"batches": {}, "verdicts": {}}
    if not (m.get("review_cron") and m.get("review_child")):
        return out
    for r in get(f"/workflows/{m['review_cron']}/runs?limit=8") or []:
        if (r.get("started_at") or "") >= limit:
            prs = rv_cached(m["review_cron"], r, prs_of)
            if prs:
                out["batches"][r["id"]] = prs
    if out["batches"]:
        for k in get(f"/workflows/{m['review_child']}/runs?limit=60") or []:
            if k.get("parent_run_id") in out["batches"] and k.get("status") not in ACTIVE:
                v = rv_cached(m["review_child"], k, lambda d: str(step_data(d, ["avis", "reason"]).get("verdict") or ""))
                if v:
                    out["verdicts"][k["id"]] = v
    return out


def snapshot(now_iso=None):
    m = CFG.get("models") or {}
    out = {"generated_at": now_iso, "tables": [], "events": [], "crees": 0}
    now0 = when(now_iso)
    out["revue"] = revue(m, (now0 - datetime.timedelta(hours=24)).isoformat() if now0 else "")
    if not m.get("ticket"):
        return out
    runs = get(f"/workflows/{m['ticket']}/runs?limit=20") or []
    kids = [get(f"/workflows/{m['ticket_un']}/runs/{k['id']}") or k for k in (get(f"/workflows/{m['ticket_un']}/runs?limit=40") or [])] if m.get("ticket_un") else []
    now, ev = when(now_iso), []
    limit = (now - datetime.timedelta(hours=24)).isoformat() if now else ""
    for r in sorted(runs, key=lambda r: r.get("started_at") or ""):
        if (r.get("started_at") or "") < limit:
            continue
        full = get(f"/workflows/{m['ticket']}/runs/{r['id']}") or r
        if r.get("status") in ACTIVE and r.get("status") != "Pending":
            out["tables"].append(table(full, kids))
        ev.append({"t": r.get("started_at"), "k": "arrive", "run": r["id"]})
        for k in kids:
            if k.get("parent_run_id") != r["id"]:
                continue
            if child_st(k) == "ok" and k.get("finished_at"):
                ev.append({"t": k["finished_at"], "k": "cree", "run": r["id"]})
        g = next((s for s in full.get("step_results") or [] if s.get("step_name") == "relire"), None)
        if g and g.get("started_at"):
            ev.append({"t": g["started_at"], "k": "gate", "run": r["id"]})
        if r.get("status") not in ACTIVE and r.get("finished_at"):
            ev.append({"t": r["finished_at"], "k": "fin", "run": r["id"]})
    out["events"] = sorted([e for e in ev if e["t"]], key=lambda e: e["t"])
    midnight = now.astimezone(TZ).replace(hour=0, minute=0, second=0, microsecond=0) if now else None
    out["crees"] = sum(1 for e in out["events"] if e["k"] == "cree" and (not midnight or when(e["t"]) >= midnight))
    return out


if __name__ == "__main__":
    try:
        data = snapshot(datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"))
    except Exception as e:  # Kronn injoignable : un dataset vide plutôt qu'un cron en échec
        data = {"generated_at": None, "tables": [], "events": [], "crees": 0, "revue": {"batches": {}, "verdicts": {}}, "error": str(e)[:300]}
    sys.stdout.write(json.dumps(data, ensure_ascii=False))
