"""Relevé de l'étage des retours de PR (3e étage) : les runs du modèle « corriger les commentaires d'une PR »
(actions.fix_pr, fix.json), lus dans l'API Kronn, et le Kanban de leurs fils, lu dans l'état de chaque run
(~/.cache/pixel-bureau/pr/runs/<run>.json, écrit par pr_update.py) et dans l'avancement de l'agent
(.bureau-fix-progress.json du dossier de travail) ; 0 token ; stdout JSON du dataset retours (cron live).

  {generated_at, rooms: [{run, repo, pr, title, author, status, poste, gate, states: {poste: ok|run|gate|err},
                          since, url, fils: [{id, path, line, who, text, col, cur}]}],
   queue: [{run, repo, pr, since}], pannes: [{run, repo, pr, title, poste, since, url}],
   events: [{t, k: arrive|gate|push|panne|fin, run, repo, pr, poste?}], pousses,
   jour: {pousses, fils, tok, cours, pannes, semaine}}

Un bureau = un run actif (6 au plus sur la page) ; la file = les runs en attente ; les pannes = les runs en échec des
dernières 24 h qu'aucun run plus récent de la même PR n'a repris. Le jour (tableau RETOURS DU JOUR du couloir) : PR poussées
depuis minuit et leurs fils, jetons des runs du jour, et PR poussées sur 7 jours ; un run fini n'est relu qu'une fois
(~/.cache/pixel-bureau/pr/jour.json). Colonne d'un fil : celle de la réponse prévue
(fil_col de _lib.py) une fois l'agent fini, sinon celle que l'agent a notée dans son avancement, sinon « à traiter ».
"""
import datetime, json, os, re, stat, sys
from _lib import ACTIVE, CFG, FIL_COLS, TZ, get, read_json, write_json

HOME = os.path.expanduser("~/.cache/pixel-bureau/pr")
POSTES = ["prepare", "fix", "check", "diff", "gate", "push"]


def st_of(step):
    s = (step or {}).get("status")
    return {"Success": "ok", "Skipped": "ok", "Running": "run", "WaitingApproval": "gate", "Failed": "err",
            "Pending": "run", "WaitingQuota": "run"}.get(s)


def last_steps(run):
    out = {}
    for s in run.get("step_results") or []:
        out[s.get("step_name")] = s
    return out


def state(run_id):
    """L'état du run écrit par pr_update.py (repo, pr, titre, auteur, fils, colonnes, dossier de travail), ou {}."""
    try:
        return read_json(os.path.join(HOME, "runs", re.sub(r"[^\w-]", "", run_id) + ".json"))
    except (OSError, ValueError):
        return {}


def progress(st):
    try:
        # SRV-02 : lu sans suivre de lien (un lien posé par la PR ou l'agent ferait lire hors du dossier de travail)
        fd = os.open(os.path.join(st["work"], ".bureau-fix-progress.json"), os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with open(fd, encoding="utf-8") as f:
            p = json.load(f) if stat.S_ISREG(os.fstat(fd).st_mode) else {}
    except (KeyError, OSError, ValueError, TypeError):
        return {}
    return p if isinstance(p, dict) else {}


def fils(st):
    """Les fils de la PR et leur colonne : la réponse prévue (cols, après l'agent), sinon l'avancement de l'agent."""
    cols, p = st.get("cols") or {}, progress(st) if not st.get("cols") else {}
    done, cur = p.get("done") if isinstance(p.get("done"), dict) else {}, p.get("current")
    out = []
    for f in st.get("fils") or []:
        c = cols.get(f["id"]) or done.get(f["id"])
        out.append({**f, "col": c if c in FIL_COLS else "a_traiter", "cur": not cols and f["id"] == cur})
    return out


def vars_of(run):
    tc = run.get("trigger_context") if isinstance(run.get("trigger_context"), dict) else {}
    return str(tc.get("repo") or ""), str(tc.get("pr") or "")


def room(run):
    steps, st = last_steps(run), state(run["id"])
    states = {k: st_of(steps[k]) for k in POSTES if k in steps and st_of(steps[k])}
    if (steps.get("abort") or {}).get("status") in ("Running", "Success"):
        states["gate"] = "err"  # changements demandés : rien poussé
    poste = next((k for k in reversed(POSTES) if states.get(k) in ("run", "gate")), None)
    repo, pr = vars_of(run)
    ui = (CFG.get("kronn") or {}).get("ui") or ""
    return {"run": run["id"], "repo": st.get("repo") or repo, "pr": str(st.get("pr") or pr), "title": st.get("title"),
            "author": st.get("author"), "status": run.get("status"), "poste": poste, "gate": states.get("gate") == "gate",
            "states": states, "since": run.get("started_at"), "fils": fils(st),
            "url": f"{ui.rstrip('/')}/#workflows/{run.get('workflow_id')}" if ui else None}


def when(iso):
    try:
        return datetime.datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except ValueError:
        return None


def step_end(s):
    t = when(s.get("started_at"))
    return t + datetime.timedelta(milliseconds=int(s.get("duration_ms") or 0)) if t else None


def events(run):
    """Les moments d'un run, pour le fil du RDC et le rejeu : arrivée, gate, push réussi, panne ; fin (run fini autrement :
    rien à corriger, changements demandés) pour que le rejeu libère son bureau."""
    repo, pr = vars_of(run)
    st = state(run["id"])
    base = {"run": run["id"], "repo": st.get("repo") or repo, "pr": str(st.get("pr") or pr)}
    steps = run.get("step_results") or []
    out = [{"t": when((steps[0] if steps else {}).get("started_at")) or when(run.get("started_at")), "k": "arrive"}]
    for s in steps:
        n, stt = s.get("step_name"), s.get("status")
        if n == "gate":
            out.append({"t": when(s.get("started_at")), "k": "gate"})
        if n == "push" and stt == "Success":
            out.append({"t": step_end(s), "k": "push"})
        if stt == "Failed" and n != "gate":
            out.append({"t": step_end(s), "k": "panne", "poste": n})
    if run.get("status") not in ACTIVE and not any(e["k"] in ("push", "panne") for e in out):
        out.append({"t": when(run.get("finished_at")) or step_end(steps[-1] if steps else {}), "k": "fin"})
    return [{**base, **e, "t": e["t"].isoformat(timespec="seconds")} for e in out if e["t"]]


def day_before(iso):
    t = when(iso)
    return (t - datetime.timedelta(hours=24)).isoformat(timespec="seconds") if t else ""


def push_end(run):
    """La fin du push réussi d'un run (sa PR poussée), sinon None."""
    s = next((s for s in run.get("step_results") or [] if s.get("step_name") == "push" and s.get("status") == "Success"), None)
    t = step_end(s) if s else None
    return t.isoformat(timespec="seconds") if t else None


def jour(runs, full_of, now, out):
    """Le tableau du couloir : PR poussées depuis minuit et leurs fils, jetons des runs du jour, PR poussées sur 7 jours."""
    path = os.path.join(HOME, "jour.json")
    try:
        cache = read_json(path)
    except (OSError, ValueError):
        cache = {}
    midnight = now.astimezone(TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    week = (now - datetime.timedelta(days=7)).isoformat(timespec="seconds")
    j = {"pousses": 0, "fils": 0, "tok": 0, "cours": len(out["rooms"]), "pannes": len(out["pannes"]), "semaine": 0}
    seen = {}
    for r in runs:
        t0 = when(r.get("started_at") or "")
        if not t0 or r.get("status") == "Pending" or t0.isoformat() < week:
            continue
        if t0 >= midnight:
            j["tok"] += int(r.get("tokens_used") or 0)
        if r.get("status") in ACTIVE:
            continue
        c = cache.get(r["id"])
        if not isinstance(c, dict):
            c = {"push": push_end(full_of(r["id"])), "fils": len((state(r["id"]).get("cols") or {}))}
        seen[r["id"]] = c
        if c.get("push"):
            j["semaine"] += 1
            if when(c["push"]) >= midnight:
                j["pousses"] += 1
                j["fils"] += int(c.get("fils") or 0)
    if seen != cache:
        try:
            write_json(path, seen)  # les runs de la semaine seulement : le cache ne grossit pas
        except OSError:
            pass
    return j


def snapshot(now_iso=None):
    wf = (CFG.get("actions") or {}).get("fix_pr")
    out = {"generated_at": now_iso, "postes": POSTES, "rooms": [], "queue": [], "pannes": [], "events": [], "pousses": 0}
    if not wf:
        return out
    runs = get(f"/workflows/{wf}/runs?limit=40") or []
    fulls = {}

    def full_of(rid):
        if rid not in fulls:
            fulls[rid] = get(f"/workflows/{wf}/runs/{rid}") or {}
        return fulls[rid]
    for r in sorted(runs, key=lambda r: r.get("started_at") or ""):
        if r.get("status") == "Pending":
            repo, pr = vars_of(r)
            out["queue"].append({"run": r["id"], "repo": repo, "pr": pr, "since": r.get("started_at")})
        elif r.get("status") in ACTIVE:
            out["rooms"].append(room(full_of(r["id"])))
    limit, seen, ev = day_before(now_iso), set(), []
    for r in sorted(runs, key=lambda r: r.get("started_at") or "", reverse=True)[:12]:
        if (r.get("started_at") or "") < limit or r.get("status") == "Pending":
            continue
        full = full_of(r["id"])
        ev += events(full)
        key = vars_of(full)
        if r.get("status") == "Failed" and key not in seen and len(out["pannes"]) < 3:
            x = room(full)
            failed = next((s.get("step_name") for s in reversed(full.get("step_results") or []) if s.get("status") == "Failed"), None)
            if failed != "gate":  # une gate refusée n'est pas une panne
                out["pannes"].append({**{k: x[k] for k in ("run", "repo", "pr", "title", "since", "url")}, "poste": failed})
        seen.add(key)
    out["events"] = sorted(ev, key=lambda e: e["t"])
    now = when(now_iso)
    midnight = now.astimezone(TZ).replace(hour=0, minute=0, second=0, microsecond=0) if now else None
    out["pousses"] = sum(1 for e in ev if e["k"] == "push" and (not midnight or when(e["t"]) >= midnight))
    if now:
        out["jour"] = jour(runs, full_of, now, out)
    return out


if __name__ == "__main__":
    try:
        data = snapshot(datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"))
    except Exception as e:  # Kronn injoignable : un dataset vide plutôt qu'un cron en échec
        data = {"generated_at": None, "postes": POSTES, "rooms": [], "queue": [], "pannes": [], "events": [], "pousses": 0, "error": str(e)[:300]}
    sys.stdout.write(json.dumps(data, ensure_ascii=False))
