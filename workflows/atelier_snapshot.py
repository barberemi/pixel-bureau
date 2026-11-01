"""Relevé de l'atelier d'implémentation (1er étage, #125) : les runs de la chaîne (models.impl_chain) et de ses postes,
lus dans l'API Kronn, 0 token ; stdout JSON du dataset atelier (cron live).

  {generated_at, rooms: [{run, ticket, title, repo, status, poste, gate, states: {poste: ok|run|bloq|avis|skip|wait|err},
                          tour, tok, since, lot, note, url}], queue: [{run, since}], pannes: [{run, ticket, repo, title,
                          poste, since, url}], postes: [clé],
   events: [{t, k: arrive|gate|back|panne|sort, run, ticket, repo, title, gate?, poste?}], livres}

Un bureau = un run actif de la chaîne (4 au plus, concurrency_limit) ; la file = les runs en attente d'un bureau libre ;
les pannes = les runs en échec des dernières 24 h qu'aucun run plus récent du même ticket et du même dépôt n'a repris
(relancer le ticket les reprend là où ils se sont arrêtés).
L'état d'un poste vient de l'étape du parent (cadrage, schema, patterns, code…), de celle du sous-workflow des contrôles
(regles…revue, avec le statut de leur rapport : « a_corriger » = bloquant, « non_concerne » = sauté) et de celle du poste
PR (pr, revue, retours). Le ticket, le dépôt et le tour se lisent dans les sorties des étapes prepare, ticket et aiguillage.
Les événements, pour le fil du RDC : un ticket arrive (première étape), une gate s'ouvre, un retour au Code (un passage de
plus à l'étape code), une étape en panne, la PR ouverte (livraison réussie), datés par les étapes des runs des dernières
24 h ; livres = PR ouvertes depuis minuit (fuseau du bureau).
"""
import datetime, json, re, sys
from _lib import ACTIVE, CFG, TZ, get

POSTES = ["cadrage", "schema", "patterns", "gate", "code", "regles", "securite", "tests", "perf", "revue", "besoin", "doc", "pr", "revue_pr", "retours"]
PARENT = {"cadrage": "cadrage", "schema": "schema", "patterns": "patterns", "gate_plan": "gate", "code": "code"}
LIVRAISON = {"pr": "pr", "revue": "revue_pr", "retours": "retours"}
CONTROLES = ("regles", "securite", "tests", "perf", "revue", "besoin", "doc")
GATES = {"gate_questions": "❓ questions du cadrage", "gate_plan": "✋ ton plan", "gate_escalade": "🧑‍⚖️ la chaîne demande un humain",
         "gate_pr": "👀 relire la PR brouillon"}
KEY = re.compile(r"\b([A-Z][A-Z0-9]+-\d+) sur ([\w.-]+/[\w.-]+)")


def st_of(step):
    s = (step or {}).get("status")
    return {"Success": "ok", "Running": "run", "WaitingApproval": "wait", "Failed": "err", "Pending": "run", "WaitingQuota": "run"}.get(s)


def last_steps(run):
    """Dernier passage de chaque étape (une étape revisitée par un Goto garde son dernier résultat)."""
    out = {}
    for s in run.get("step_results") or []:
        out[s.get("step_name")] = s
    return out


def envelope(out):
    """data de l'enveloppe ---STEP_OUTPUT--- d'une sortie d'étape, ou None."""
    m = re.search(r"---STEP_OUTPUT---\s*(\{.*\})\s*---END_STEP_OUTPUT---", out or "", re.S)
    try:
        return json.loads(m.group(1)).get("data") if m else None
    except ValueError:
        return None


def rapport_statut(out):
    m = re.search(r'\\?"statut\\?":\s*\\?"(\w+)', out or "")
    return m.group(1) if m else None


def children(wf, run_id, cache):
    """Dernier run d'un poste lancé par ce run (parent_run_id)."""
    if not wf:
        return None
    if wf not in cache:
        cache[wf] = get(f"/workflows/{wf}/runs?limit=60") or []
    kids = [r for r in cache[wf] if r.get("parent_run_id") == run_id]
    if not kids:
        return None
    return get(f"/workflows/{wf}/runs/{kids[0]['id']}")


def room(run, models, cache):
    steps = last_steps(run)
    prep = (steps.get("prepare") or {}).get("output") or ""
    m = KEY.search(prep)
    tk = envelope((steps.get("ticket") or {}).get("output")) or {}
    title = ((tk.get("fields") or {}) if isinstance(tk, dict) else {}).get("summary")
    states = {}
    for name, poste in PARENT.items():
        if name in steps:
            states[poste] = st_of(steps[name])
    if "gate_plan" in steps and states.get("gate") == "ok":
        states["gate"] = "ok"
    poste = None
    if "controles" in steps:
        c = last_steps(children(models.get("impl_controles"), run["id"], cache) or {})
        for k, s in c.items():
            if k in CONTROLES:  # tests et revue : un sous-workflow chacun
                st = st_of(s)
                rs = rapport_statut(s.get("output"))
                states[k] = "bloq" if rs == "a_corriger" else "skip" if rs == "non_concerne" else st
        # règles, sécurité, perf, besoin et doc : sous-agents d'une même étape ; lancés = « Postes à lancer » de missions,
        # verdicts = sortie de range
        lances = re.search(r"## Postes à lancer\\{0,2}n\\{0,2}n([a-z, ]+)", (c.get("missions") or {}).get("output") or "")
        if lances and st_of(c.get("parallele")) in ("run", "err"):
            for k in [x.strip() for x in lances.group(1).split(",") if x.strip() in CONTROLES]:
                states[k] = st_of(c.get("parallele"))
        for k, v in re.findall(r'\\?"(regles|securite|perf|besoin|doc)\\?":\s*\\?"(\w+)', (c.get("range") or {}).get("output") or ""):
            states[k] = {"a_corriger": "bloq", "non_concerne": "skip", "en_panne": "err"}.get(v, "ok")
    if "livraison" in steps:
        c = children(models.get("impl_livraison"), run["id"], cache)
        for k, s in last_steps(c or {}).items():
            if k in LIVRAISON:
                states[LIVRAISON[k]] = st_of(s)
    for k in POSTES:  # poste en cours : le dernier qui tourne ou attend
        if states.get(k) in ("run", "wait"):
            poste = k
    tour = None
    t = re.search(r"Tour (\d+)", (steps.get("aiguillage") or {}).get("output") or "")
    if t:
        tour = f"{t.group(1)}/{(CFG.get('impl') or {}).get('max_tours') or 3}"
    gate = next((n for n, s in steps.items() if s.get("status") == "WaitingApproval" and n in GATES), None)
    if gate == "gate_plan":
        states["gate"], poste = "wait", "gate"
    lot = None
    if poste == "code":  # le Code écrit tout en une session : on montre son essai à partir du 2e (vérifs ou relecture)
        c = children(models.get("impl_code"), run["id"], cache)
        n = sum(1 for x in (c or {}).get("step_results") or [] if x.get("step_name") == "code")
        if n > 1:
            lot = f"essai {n}/3"
    back = any(v == "bloq" for v in states.values()) and poste in ("code", None)
    note = GATES.get(gate) or ("🔒 bloquant → retour au code" if back else None)
    ui = (CFG.get("kronn") or {}).get("ui") or ""
    return {"run": run["id"], "ticket": m.group(1) if m else None, "repo": m.group(2) if m else None,
            "title": title, "status": run.get("status"), "poste": poste,
            "gate": gate, "states": {k: v for k, v in states.items() if v}, "tour": tour, "tok": run.get("tokens_used") or 0,
            "since": run.get("started_at"), "lot": lot, "note": note, "back": back,
            "url": f"{ui.rstrip('/')}/#workflows/{run.get('workflow_id')}" if ui else None}


def panne(run, models, cache):
    """Un run en échec : son bureau (ticket, dépôt) et le poste où il s'est arrêté."""
    r = room(run, models, cache)
    steps = last_steps(run)
    failed = next((k for k in POSTES if r["states"].get(k) == "err"), None)
    if not failed:  # étape du parent hors postes (prepare, orchestrateur…), ou poste PR (livraison)
        failed = next((n for n, s in reversed(list(steps.items())) if s.get("status") == "Failed"), None)
    return {**{k: r[k] for k in ("run", "ticket", "repo", "title", "since", "url")}, "poste": failed}


def when(iso):
    try:
        return datetime.datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except ValueError:
        return None


def step_end(s):
    t = when(s.get("started_at"))
    return t + datetime.timedelta(milliseconds=int(s.get("duration_ms") or 0)) if t else None


def events(run):
    """Les moments d'un run de la chaîne, dans l'ordre : arrivée, gates, retours au Code, pannes, PR ouverte."""
    steps, last = run.get("step_results") or [], last_steps(run)
    m = KEY.search((last.get("prepare") or {}).get("output") or "")
    if not m:
        return []
    tk = envelope((last.get("ticket") or {}).get("output")) or {}
    base = {"run": run["id"], "ticket": m.group(1), "repo": m.group(2),
            "title": ((tk.get("fields") or {}) if isinstance(tk, dict) else {}).get("summary")}
    out, codes = [{"t": when((steps[0] if steps else {}).get("started_at")) or when(run.get("started_at")), "k": "arrive"}], 0
    for s in steps:
        n, st = s.get("step_name"), s.get("status")
        if n in GATES:
            out.append({"t": when(s.get("started_at")), "k": "gate", "gate": n})
        if n == "code":
            codes += 1
            if codes > 1:
                out.append({"t": when(s.get("started_at")), "k": "back"})
        if st == "Failed" and n not in GATES:  # une gate refusée finit en Failed : pas une panne
            out.append({"t": step_end(s), "k": "panne", "poste": PARENT.get(n, n)})
        if n == "livraison" and st == "Success":
            out.append({"t": step_end(s), "k": "sort"})
    return [{**base, **e, "t": e["t"].isoformat(timespec="seconds")} for e in out if e["t"]]


def snapshot(now_iso=None):
    models = CFG.get("models") or {}
    chain = models.get("impl_chain")
    out = {"generated_at": now_iso, "postes": POSTES, "rooms": [], "queue": [], "pannes": []}
    if not chain:
        return out
    runs = get(f"/workflows/{chain}/runs?limit=40") or []
    cache, seen, fulls = {}, set(), {}

    def full_of(rid):  # un run lu une fois pour les bureaux, les pannes et les événements
        if rid not in fulls:
            fulls[rid] = get(f"/workflows/{chain}/runs/{rid}") or {}
        return fulls[rid]
    for r in sorted(runs, key=lambda r: r.get("started_at") or ""):
        if r.get("status") == "Pending":
            out["queue"].append({"run": r["id"], "since": r.get("started_at")})
        elif r.get("status") in ACTIVE:
            out["rooms"].append(room(full_of(r["id"]), models, cache))
    # pannes : du plus récent au plus ancien (24 h, 12 runs lus au plus), une par ticket et dépôt, si aucun run plus
    # récent du même ticket et du même dépôt ne l'a reprise
    limit = day_before(now_iso) if now_iso else ""
    for r in sorted(runs, key=lambda r: r.get("started_at") or "", reverse=True)[:12]:
        if len(out["pannes"]) >= 3 or (r.get("started_at") or "") < limit:
            break
        full = full_of(r["id"])
        m = KEY.search((last_steps(full).get("prepare") or {}).get("output") or "")
        if not m:
            continue
        last = (full.get("step_results") or [{}])[-1]
        rejete = str(last.get("step_name") or "").startswith("gate_")  # gate refusée : finit en Failed, mais pas une panne
        if r.get("status") == "Failed" and not rejete and m.groups() not in seen:
            out["pannes"].append(panne(full, models, cache))
        seen.add(m.groups())
    # fil du RDC : les runs des dernières 24 h (12 au plus), leurs moments dans l'ordre
    ev = []
    for r in sorted(runs, key=lambda r: r.get("started_at") or "", reverse=True)[:12]:
        if r.get("status") != "Pending" and (r.get("started_at") or "") >= limit:
            ev += events(full_of(r["id"]))
    out["events"] = sorted(ev, key=lambda e: e["t"])
    now = when(now_iso)
    midnight = now.astimezone(TZ).replace(hour=0, minute=0, second=0, microsecond=0) if now else None
    out["livres"] = sum(1 for e in ev if e["k"] == "sort" and (not midnight or when(e["t"]) >= midnight))
    return out


def day_before(iso):
    try:
        t = datetime.datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return ""
    return (t - datetime.timedelta(hours=24)).isoformat(timespec="seconds")


if __name__ == "__main__":
    try:
        data = snapshot(datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"))
    except Exception as e:  # Kronn injoignable : un dataset vide plutôt qu'un cron en échec
        data = {"generated_at": None, "postes": POSTES, "rooms": [], "queue": [], "pannes": [], "events": [], "livres": 0, "error": str(e)[:300]}
    sys.stdout.write(json.dumps(data, ensure_ascii=False))
