"""Relevé de l'atelier d'implémentation (1er étage, #125) : les runs de la chaîne (models.impl_chain) et de ses postes,
lus dans l'API Kronn, 0 token ; stdout JSON du dataset atelier (cron live).

  {generated_at, rooms: [{run, ticket, title, repo, status, poste, gate, states: {poste: ok|run|bloq|avis|skip|wait|err},
                          tour, tok, since, lot, note, url}], queue: [{run, since}], pannes: [{run, ticket, repo, title,
                          poste, since, url}], postes: [clé]}

Un bureau = un run actif de la chaîne (4 au plus, concurrency_limit) ; la file = les runs en attente d'un bureau libre ;
les pannes = les runs en échec des dernières 24 h qu'aucun run plus récent du même ticket et du même dépôt n'a repris
(relancer le ticket les reprend là où ils se sont arrêtés).
L'état d'un poste vient de l'étape du parent (cadrage, schema, patterns, code…), de celle du sous-workflow des contrôles
(regles…revue, avec le statut de leur rapport : « a_corriger » = bloquant, « non_concerne » = sauté) et de celle du poste
PR (pr, revue, retours). Le ticket, le dépôt et le tour se lisent dans les sorties des étapes prepare, ticket et aiguillage.
"""
import datetime, json, re, sys
from _lib import ACTIVE, CFG, get

POSTES = ["cadrage", "schema", "patterns", "gate", "code", "regles", "securite", "tests", "perf", "revue", "besoin", "pr", "revue_pr", "retours"]
PARENT = {"cadrage": "cadrage", "schema": "schema", "patterns": "patterns", "gate_plan": "gate", "code": "code"}
LIVRAISON = {"pr": "pr", "revue": "revue_pr", "retours": "retours"}
CONTROLES = ("regles", "securite", "tests", "perf", "revue", "besoin")
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
        c = children(models.get("impl_controles"), run["id"], cache)
        for k, s in last_steps(c or {}).items():
            if k in CONTROLES:
                st = st_of(s)
                rs = rapport_statut(s.get("output"))
                states[k] = "bloq" if rs == "a_corriger" else "skip" if rs == "non_concerne" else st
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
    if poste == "code":
        c = children(models.get("impl_code"), run["id"], cache)
        lo = (last_steps(c or {}).get("lot") or {}).get("output") or ""
        n, e, r = (re.search(p, lo) for p in (r'\\?"n\\?":\s*(\d+)', r'\\?"essai\\?":\s*(\d+)', r'\\?"reste\\?":\s*(\d+)'))
        if n:
            lot = f"lot {n.group(1)}/{int(n.group(1)) + int(r.group(1) if r else 0)}" + (f" · essai {e.group(1)}" if e else "")
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


def snapshot(now_iso=None):
    models = CFG.get("models") or {}
    chain = models.get("impl_chain")
    out = {"generated_at": now_iso, "postes": POSTES, "rooms": [], "queue": [], "pannes": []}
    if not chain:
        return out
    runs = get(f"/workflows/{chain}/runs?limit=40") or []
    cache, seen = {}, set()
    for r in sorted(runs, key=lambda r: r.get("started_at") or ""):
        if r.get("status") == "Pending":
            out["queue"].append({"run": r["id"], "since": r.get("started_at")})
        elif r.get("status") in ACTIVE:
            out["rooms"].append(room(get(f"/workflows/{chain}/runs/{r['id']}"), models, cache))
    # pannes : du plus récent au plus ancien (24 h, 12 runs lus au plus), une par ticket et dépôt, si aucun run plus
    # récent du même ticket et du même dépôt ne l'a reprise
    limit = day_before(now_iso) if now_iso else ""
    for r in sorted(runs, key=lambda r: r.get("started_at") or "", reverse=True)[:12]:
        if len(out["pannes"]) >= 3 or (r.get("started_at") or "") < limit:
            break
        full = get(f"/workflows/{chain}/runs/{r['id']}") or {}
        m = KEY.search((last_steps(full).get("prepare") or {}).get("output") or "")
        if not m:
            continue
        last = (full.get("step_results") or [{}])[-1]
        rejete = str(last.get("step_name") or "").startswith("gate_")  # gate refusée : finit en Failed, mais pas une panne
        if r.get("status") == "Failed" and not rejete and m.groups() not in seen:
            out["pannes"].append(panne(full, models, cache))
        seen.add(m.groups())
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
        data = {"generated_at": None, "postes": POSTES, "rooms": [], "queue": [], "pannes": [], "error": str(e)[:300]}
    sys.stdout.write(json.dumps(data, ensure_ascii=False))
