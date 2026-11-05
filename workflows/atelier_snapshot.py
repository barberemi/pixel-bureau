"""Relevé de l'atelier d'implémentation (1er étage, #125) : les runs de la chaîne (models.impl_chain) et de ses postes,
lus dans l'API Kronn, 0 token ; stdout JSON du dataset atelier (cron live).

  {generated_at, rooms: [{run, ticket, title, repo, status, poste, gate, states: {poste: ok|run|bloq|avis|skip|wait|err|rep},
                          tour, tok, since, lot, note, url, reprise?: {poste, de, panne, cause, cause_type, url}}],
   queue: [{run, since}], pannes: [{run, ticket, repo, title, poste, since, url, cause, cause_type, docs_ok}], postes: [clé],
   events: [{t, k: arrive|poste|gate|back|panne|sort, run, ticket, repo, title, gate?, poste?, cause?, cause_type?}], livres}

Un bureau = un run actif de la chaîne (4 au plus, concurrency_limit) ; la file = les runs en attente d'un bureau libre ;
les pannes = les runs en échec des dernières 24 h qu'aucun run plus récent du même ticket et du même dépôt n'a repris
(relancer le ticket les reprend là où ils se sont arrêtés).
L'état d'un poste vient de l'étape du parent (cadrage = le poste 📋 Plan, gate_plan, code…), de celle du sous-workflow
des contrôles (regles…doc, avec le statut de leur rapport : « a_corriger » = bloquant, « non_concerne » = sauté) et de celle du poste
PR (pr, revue, retours). Le ticket, le dépôt et le tour se lisent dans les sorties des étapes prepare, ticket et aiguillage.
Les événements, pour le fil du RDC : un ticket arrive (première étape), une gate s'ouvre, un retour au Code (un passage de
plus à l'étape code), une étape en panne, la PR ouverte (livraison réussie), datés par les étapes des runs des dernières
24 h ; livres = PR ouvertes depuis minuit (fuseau du bureau).
La cause d'une panne : l'étape en échec du sous-run le plus profond (la sortie d'une étape SubWorkflow donne child_run_id et
child_workflow_id), en une ligne et classée (garde_fou_docs, delai, agent, script, autre) ; le lien mène à ce run-là. Un run
fini ne change plus : sa cause est gardée dans ~/.cache/pixel-bureau/atelier_causes.json (le cron tourne chaque minute).
Un run repris (prepare saute au Code, aux contrôles ou à la PR) : les postes d'avant la reprise sont « rep » (faits par le run
d'avant), et reprise dit après quelle panne.
"""
import datetime, json, os, re, sys
from _lib import ACTIVE, CFG, TZ, get, read_json, write_json

# cadrage = le poste 📋 Plan ; les étapes schema, patterns, gate_questions et le contrôle revue des runs d'avant sont
# ignorées, ou ramenées au poste Plan pour le carton
POSTES = ["cadrage", "gate", "code", "regles", "securite", "tests", "perf", "besoin", "doc", "pr", "revue_pr", "retours"]
PARENT = {"cadrage": "cadrage", "gate_plan": "gate", "code": "code"}
LIVRAISON = {"pr": "pr", "revue": "revue_pr", "retours": "retours"}
CONTROLES = ("regles", "securite", "tests", "perf", "besoin", "doc")
# étape du parent -> poste où est le carton (rejeu du 1er étage : le carton au bon poste à l'heure du curseur)
POSTE_DE = {"cadrage": "cadrage", "schema": "cadrage", "patterns": "cadrage", "code": "code", "controles": "regles",
            "livraison": "pr", "publication": "pr"}
GATES = {"gate_questions": "❓ ce que j'ai compris", "gate_plan": "✋ ton plan", "gate_escalade": "🧑‍⚖️ la chaîne demande un humain",
         "gate_pr": "👀 relire la PR brouillon"}
KEY = re.compile(r"\b([A-Z][A-Z0-9]+-\d+) sur ([\w.-]+/[\w.-]+)")
# reprise : l'étape où prepare saute (Goto) -> les postes déjà faits par le run d'avant
REPRIS = {"code": ("cadrage", "gate"), "controles": ("cadrage", "gate", "code"),
          "livraison": ("cadrage", "gate", "code") + CONTROLES}
FINIS = ("Failed", "StoppedByGuard", "Cancelled")
CAUSES = os.path.expanduser("~/.cache/pixel-bureau/atelier_causes.json")  # cause d'un run fini, par run


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


def run_url(wf, rid):
    """Le run dans l'interface de Kronn (/workflows/<id>/runs/<run>), pas seulement la liste des runs du workflow."""
    ui = (CFG.get("kronn") or {}).get("ui") or ""
    return f"{ui.rstrip('/')}/workflows/{wf}/runs/{rid}" if ui and wf and rid else None


def failed_step(run):
    """La dernière étape en échec d'un run ; un code de sortie aiguillé par un Goto (prepare en reprise, entree, aiguillage)
    est marqué Failed par Kronn mais n'est pas un échec."""
    for s in reversed(run.get("step_results") or []):
        if s.get("status") in ("Failed", "StoppedByGuard") and not str(s.get("condition_result") or "").startswith("Goto"):
            return s
    return None


def deepest(run, wf, hint="", depth=0):
    """(run, workflow, étape en échec, indice) au plus profond : on descend dans le sous-run d'une étape SubWorkflow."""
    s = failed_step(run)
    if not s:
        return run, wf, None, hint
    d = envelope(s.get("output")) or {}
    cw, cr = d.get("child_workflow_id"), d.get("child_run_id") or s.get("child_run_id")
    if cw and cr and depth < 4:
        child = get(f"/workflows/{cw}/runs/{cr}") or {}
        if child.get("step_results"):
            return deepest(child, cw, str(d.get("last_output") or ""), depth + 1)
    return run, wf, s, hint


def hm_s(sec):
    sec = int(sec)
    return f"{sec // 3600} h {sec % 3600 // 60:02d}" if sec >= 3600 else f"{sec // 60} min"


def first_line(txt):
    """La première ligne qui dit quelque chose (ni enveloppe, ni signal, ni JSON)."""
    for ln in (txt or "").splitlines():
        ln = ln.strip()
        if ln and not ln.startswith(("---", "{", "}", "[SIGNAL", "exit ")):
            return ln[:160]
    return ""


AGENT_KO = re.compile(r"rate.?limit|quota|overloaded|\b429\b|\b5\d\d\b|api error|econn|etimedout|network|connection (?:reset|refused|closed)"
                      r"|timed? ?out|unavailable|indisponible|injoignable", re.I)


def cause(step, run=None, hint=""):
    """La cause en une ligne, son type et, pour le garde-fou docs, si l'agent avait fini (status OK) : {cause, cause_type, docs_ok}."""
    if not step:
        st = (run or {}).get("status")
        return {"cause": "run annulé" if st == "Cancelled" else "arrêté sans étape en échec", "cause_type": "autre"}
    out, name = step.get("output") or "", step.get("step_name") or ""
    txt = hint + "\n" + out
    g = re.search(r"Stopped by (\w+) guard:?\s*([^\n]*)", txt)
    if name.startswith("__guard") or step.get("status") == "StoppedByGuard" or g:
        kind, rest = (g.group(1), g.group(2)) if g else ("", "")
        t = re.search(r"(\d+)s elapsed \(limit (\d+)s\)", rest)
        if kind.lower() == "timeout" or name == "__guard_timeout__":
            return {"cause": "délai dépassé, arrêté par Kronn" + (f" ({hm_s(t.group(1))} pour {hm_s(t.group(2))} permises)" if t else ""),
                    "cause_type": "delai"}
        return {"cause": f"garde-fou de Kronn ({kind or name}) : {rest}".strip()[:160], "cause_type": "autre"}
    if out.startswith("Document audit failed"):
        rej = re.findall(r"^(\S+): write rejected: ([^\n]+)$", out, re.M)
        raison = lambda w: ("ressemble à un extrait d'un fichier sensible" if "sensitive file" in w else  # noqa: E731
                         "une suite de caractères qui ressemble à un secret" if "high-entropy" in w else w[:60])
        txt = (f"garde-fou docs de Kronn : {rej[0][0]} refusé ({raison(rej[0][1])})" + (f", et {len(rej) - 1} autre(s)" if len(rej) > 1 else "")
               if rej else "garde-fou docs de Kronn : un fichier de doc refusé")
        return {"cause": txt, "cause_type": "garde_fou_docs", "docs_ok": bool(re.search(r'"status":\s*"OK"', out))}
    kind = step.get("step_kind")
    d = envelope(out) or {}
    if kind == "Exec" or "exit_code" in d:
        lines = [x for x in str(d.get("stderr") or "").splitlines() if x.strip()] or [x for x in str(d.get("stdout") or "").splitlines() if x.strip()]
        code = d.get("exit_code")
        return {"cause": f"script en erreur (exit {code})" + (f" : {lines[-1].strip()[:140]}" if lines else ""), "cause_type": "script"}
    line = first_line(out) or first_line(hint)
    ko = AGENT_KO.search(out[:4000])
    if kind == "ApiCall" or ko:
        return {"cause": ("agent ou API indisponible : " if kind != "ApiCall" else "appel d'API en échec : ") + (line or ko.group(0)), "cause_type": "agent"}
    return {"cause": line or f"étape {name} en échec", "cause_type": "autre"}


def why(run, wf, causes=None):
    """Cause d'un run en échec, lien vers le run en échec le plus profond ; gardée par run une fois le run fini."""
    rid = run.get("id")
    if causes is not None and rid in causes:
        return causes[rid]
    r, w, s, hint = deepest(run, wf)
    res = {**cause(s, r, hint), "url": run_url(w, r.get("id"))}
    if causes is not None and run.get("status") in FINIS:
        causes[rid] = res
    return res


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
            if k in CONTROLES:  # tests : un sous-workflow
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
    reprise = str((steps.get("prepare") or {}).get("condition_result") or "").partition("Goto:")[2]
    for k in REPRIS.get(reprise, ()):  # repris : faits par le run d'avant (pas « attend son tour »)
        states.setdefault(k, "rep")
    return {"run": run["id"], "ticket": m.group(1) if m else None, "repo": m.group(2) if m else None,
            "title": title, "status": run.get("status"), "poste": poste,
            "gate": gate, "states": {k: v for k, v in states.items() if v}, "tour": tour, "tok": run.get("tokens_used") or 0,
            "since": run.get("started_at"), "lot": lot, "note": note, "back": back,
            "url": run_url(run.get("workflow_id") or (CFG.get("models") or {}).get("impl_chain"), run["id"]),
            **({"repris_a": reprise} if reprise in REPRIS else {})}


def panne(run, models, cache, causes=None):
    """Un run en échec : son bureau (ticket, dépôt), le poste où il s'est arrêté, la cause et le lien vers l'étape en échec."""
    r = room(run, models, cache)
    failed = next((k for k in POSTES if r["states"].get(k) == "err"), None)
    if not failed:  # étape du parent hors postes (prepare, orchestrateur…), ou poste PR (livraison)
        failed = (failed_step(run) or {}).get("step_name")
    c = why(run, run.get("workflow_id") or models.get("impl_chain"), causes)
    return {**{k: r[k] for k in ("run", "ticket", "repo", "title", "since")}, "poste": failed, **c, "url": c.get("url") or r["url"]}


def when(iso):
    try:
        return datetime.datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except ValueError:
        return None


def step_end(s):
    t = when(s.get("started_at"))
    return t + datetime.timedelta(milliseconds=int(s.get("duration_ms") or 0)) if t else None


def events(run, why_=None):
    """Les moments d'un run de la chaîne, dans l'ordre : arrivée, gates, retours au Code, pannes, PR ouverte ; why_ : la cause
    de l'échec du run, posée sur sa dernière panne."""
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
        if n in POSTE_DE:  # le carton arrive à ce poste (rejeu de la page)
            out.append({"t": when(s.get("started_at")), "k": "poste", "poste": POSTE_DE[n]})
        if n in GATES:
            out.append({"t": when(s.get("started_at")), "k": "gate", "gate": n})
        if n == "code":
            codes += 1
            if codes > 1:
                out.append({"t": when(s.get("started_at")), "k": "back"})
        # une gate refusée finit en Failed : pas une panne ; ni un code de sortie aiguillé (prepare en reprise, aiguillage)
        if st in ("Failed", "StoppedByGuard") and n not in GATES and not str(s.get("condition_result") or "").startswith("Goto"):
            out.append({"t": step_end(s), "k": "panne", "poste": PARENT.get(n, n)})
        if n == "livraison" and st == "Success":
            out.append({"t": step_end(s), "k": "sort"})
    pn = [e for e in out if e["k"] == "panne"]
    if pn and why_ and run.get("status") in FINIS:
        pn[-1].update({k: why_[k] for k in ("cause", "cause_type") if why_.get(k)})
    return [{**base, **e, "t": e["t"].isoformat(timespec="seconds")} for e in out if e["t"]]


def snapshot(now_iso=None):
    models = CFG.get("models") or {}
    chain = models.get("impl_chain")
    out = {"generated_at": now_iso, "postes": POSTES, "rooms": [], "queue": [], "pannes": []}
    if not chain:
        return out
    runs = get(f"/workflows/{chain}/runs?limit=40") or []
    cache, seen, fulls = {}, set(), {}
    try:
        causes = read_json(CAUSES) if os.path.exists(CAUSES) else {}
    except (OSError, ValueError):
        causes = {}
    known = len(causes)

    def full_of(rid):  # un run lu une fois pour les bureaux, les pannes et les événements
        if rid not in fulls:
            fulls[rid] = get(f"/workflows/{chain}/runs/{rid}") or {}
        return fulls[rid]
    for r in sorted(runs, key=lambda r: r.get("started_at") or ""):
        if r.get("status") == "Pending":
            out["queue"].append({"run": r["id"], "since": r.get("started_at")})
        elif r.get("status") in ACTIVE:
            out["rooms"].append(room(full_of(r["id"]), models, cache))
    # un bureau repris : après quelle panne (le run d'avant du même ticket et du même dépôt, 12 runs lus au plus)
    for rm in out["rooms"]:
        if not rm.get("repris_a"):
            continue
        for r in sorted((x for x in runs if (x.get("started_at") or "") < (rm.get("since") or "")),
                        key=lambda x: x.get("started_at") or "", reverse=True)[:12]:
            full = full_of(r["id"])
            m = KEY.search((last_steps(full).get("prepare") or {}).get("output") or "")
            if m and m.groups() == (rm["ticket"], rm["repo"]):
                if r.get("status") in FINIS:
                    c = why(full, chain, causes)
                    rm["reprise"] = {"poste": rm["repris_a"], "de": r["id"], "panne": (failed_step(full) or {}).get("step_name"),
                                     **{k: c.get(k) for k in ("cause", "cause_type", "url")}}
                break
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
        if r.get("status") in ("Failed", "StoppedByGuard") and not rejete and m.groups() not in seen:
            out["pannes"].append(panne(full, models, cache, causes))
        seen.add(m.groups())
    # fil du RDC : les runs des dernières 24 h (12 au plus), leurs moments dans l'ordre
    ev = []
    for r in sorted(runs, key=lambda r: r.get("started_at") or "", reverse=True)[:12]:
        if r.get("status") != "Pending" and (r.get("started_at") or "") >= limit:
            full = full_of(r["id"])
            ev += events(full, why(full, chain, causes) if r.get("status") in ("Failed", "StoppedByGuard") else None)
    out["events"] = sorted(ev, key=lambda e: e["t"])
    now = when(now_iso)
    midnight = now.astimezone(TZ).replace(hour=0, minute=0, second=0, microsecond=0) if now else None
    out["livres"] = sum(1 for e in ev if e["k"] == "sort" and (not midnight or when(e["t"]) >= midnight))
    if len(causes) != known:  # 200 runs au plus, les plus récents (ordre d'insertion)
        try:
            os.makedirs(os.path.dirname(CAUSES), exist_ok=True)
            write_json(CAUSES, dict(list(causes.items())[-200:]))
        except OSError:
            pass
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
