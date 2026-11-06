"""Relevé de la salle de rédaction (2e étage) : les runs du modèle « créer un ticket » (models.ticket) et de chaque
ticket (models.ticket_un), lus dans l'API Kronn, et le dossier de chaque run (~/.cache/pixel-bureau/ticket/<run>/,
écrit par ticket.py) ; 0 token ; stdout JSON du dataset redaction (cron live).

  {generated_at, tables: [{run, status, since, intention, type, parent, poste, tour, composants, tickets: [{i, summary,
                           composant, points, etat: wait|run|gate|ok|ecarte|err, detail, key}], url, recherche, redaction, critique}],
   events: [{t, k: arrive|gate|cree|fin, run}], crees, crees_l: [{key, title, run}], tok_jour}

detail : la description du ticket en texte lisible (readable de _lib : ▸ titres, │ panneaux, • puces), pour la fiche du
ticket au clic au 2e ; DETAIL_MAX caractères chacun, DETAIL_BUDGET en tout (la sortie d'une étape Exec reste sous 100 Ko).

Une table = une intention en cours (trois au plus) ; poste = recherche, redaction, critique, ou valider quand les
tickets attendent ton tampon, puis sont créés un par un. Chaque ticket : son sous-workflow (le n-ième lancé par le run est le ticket n).

La file de la salle de revue : revue = {batches: {run du cron: [[repo, n°, auteur], …]}, verdicts: {run d'une revue:
approve|comment|request_changes}}. Les PR que chaque passage du cron des revues (models.review_cron, 24 h) a retenues,
dans l'ordre, lues dans la sortie de son étape finalize (ligne PRS=) ; le verdict de chaque revue finie de ces passages,
lu dans la sortie de son avis. Un run fini n'est lu qu'une fois (~/.cache/pixel-bureau/revue/<run>.json).
"""
import datetime, json, os, re, sys
from _lib import ACTIVE, CFG, TZ, get, read_json, readable

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


DETAIL_MAX, DETAIL_BUDGET = 3000, 40000


def table(run, kids, budget):
    d, t = dget(run["id"], "demande.json", {}), dget(run["id"], "tickets.json", {})
    steps = [s.get("step_name") for s in run.get("step_results") or []]
    poste = next((POSTES[n] for n in reversed(steps) if n in POSTES), "recherche")
    mine = sorted([k for k in kids if k.get("parent_run_id") == run["id"]], key=lambda k: k.get("started_at") or "")
    ts = [{"i": i, "summary": str(x.get("summary") or "")[:120], "composant": x.get("composant"), "points": x.get("points"),
           "etat": child_st(mine[i]) if i < len(mine) else "gate" if run.get("status") == "WaitingApproval" else "wait"} for i, x in enumerate(t.get("tickets") or [])]
    for x, src in zip(ts, t.get("tickets") or []):
        txt = readable(str(src.get("description") or ""))
        if len(txt) > DETAIL_MAX:
            txt = txt[:DETAIL_MAX - 1].rstrip() + "…"
        if txt and budget[0] >= len(txt):
            x["detail"], budget[0] = txt, budget[0] - len(txt)
    made = made_keys(run["id"])
    for x in ts:
        if made.get(x["i"]):
            x["key"] = made[x["i"]]
    ui = (CFG.get("kronn") or {}).get("ui") or ""
    rech = dget(run["id"], "recherche.json", {}) or {}
    return {"run": run["id"], "status": run.get("status"), "since": run.get("started_at"), "intention": str(d.get("intention") or "")[:200],
            "type": d.get("type") or "", "parent": d.get("parent") or "",
            "poste": poste, "tour": d.get("tour") or 1, "composants": rech.get("composants") or d.get("composants") or [],
            "tickets": ts, "url": f"{ui.rstrip('/')}/#workflows/{run.get('workflow_id')}" if ui else None, **postes(run["id"], t, rech)}


def made_keys(run_id):
    """Les tickets déjà créés dans Jira (crees.json, écrit par ticket.py) : {rang du ticket: clé}."""
    out = {}
    for m in dget(run_id, "crees.json", []) or []:
        try:
            if isinstance(m, dict) and m.get("key"):
                out[int(m["i"])] = str(m["key"])
        except (KeyError, TypeError, ValueError):
            pass
    return out


def postes(run_id, t, rech):
    """Ce que chaque poste a produit, pour sa fiche au clic : les tickets Jira voisins lus par la recherche (doublons.json),
    la dernière version de la rédaction et ses réponses à la critique, les remarques du dernier tour de la critique."""
    clip = lambda v, n: str(v or "").strip()[:n]  # noqa: E731
    dbl = [x for x in dget(run_id, "doublons.json", []) or [] if isinstance(x, dict) and x.get("key")]
    hist = [x for x in dget(run_id, "critiques.json", []) or [] if isinstance(x, dict)]
    c = hist[-1] if hist else {}
    return {"recherche": {"doublons": [{"key": str(x["key"]), "summary": clip(x.get("summary"), 120), "status": clip(x.get("status"), 40)} for x in dbl[:8]],
                          "resume": clip(rech.get("texte"), 600)},
            "redaction": {"version": t.get("version") or 0, "reponses": [clip(x, 240) for x in (t.get("reponses") or [])[:6]],
                          "hors_liste": len(t.get("hors_liste") or [])},
            "critique": {"version": c.get("version"), "verdict": c.get("verdict") or "",
                         "notes": [{"ticket": n.get("ticket"), "gravite": clip(n.get("gravite"), 20), "note": clip(n.get("note"), 240)}
                                   for n in (c.get("notes") or [])[:8] if isinstance(n, dict)]}}


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
    now, ev, budget = when(now_iso), [], [DETAIL_BUDGET]
    limit = (now - datetime.timedelta(hours=24)).isoformat() if now else ""
    for r in sorted(runs, key=lambda r: r.get("started_at") or ""):
        if (r.get("started_at") or "") < limit:
            continue
        full = get(f"/workflows/{m['ticket']}/runs/{r['id']}") or r
        if r.get("status") in ACTIVE and r.get("status") != "Pending":
            out["tables"].append(table(full, kids, budget))
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
    # la boîte Jira : les tickets créés par les intentions du jour, avec leur clé (clic au 2e)
    today = [r for r in sorted(runs, key=lambda r: r.get("started_at") or "") if not midnight or (when(r.get("started_at")) or midnight) >= midnight]
    out["crees_l"] = [{"key": str(m["key"]), "title": str(m.get("title") or "")[:120], "run": r["id"]}
                      for r in today for m in dget(r["id"], "crees.json", []) or [] if isinstance(m, dict) and m.get("key")][-20:]
    # le tableau des tickets du jour : les jetons des intentions lancées depuis minuit (le run parent compte ceux de ses postes)
    out["tok_jour"] = sum(int(r.get("tokens_used") or 0) for r in runs if not midnight or (when(r.get("started_at")) or midnight) >= midnight)
    return out


if __name__ == "__main__":
    try:
        data = snapshot(datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"))
    except Exception as e:  # Kronn injoignable : un dataset vide plutôt qu'un cron en échec
        data = {"generated_at": None, "tables": [], "events": [], "crees": 0, "revue": {"batches": {}, "verdicts": {}}, "error": str(e)[:300]}
    sys.stdout.write(json.dumps(data, ensure_ascii=False))
