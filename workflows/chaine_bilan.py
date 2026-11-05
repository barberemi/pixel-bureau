"""Page « Chaîne · bilan » : l'historique des runs de la chaîne d'implémentation (models.impl_chain), 0 token ; stdout JSON
du dataset bilan de la page (cron chaine_bilan, toutes les 15 min).

Sources : les bilans écrits par workflows/chaine.py après chaque étape (impl.historique, sinon
~/.local/share/pixel-bureau/historique/<ticket>/<dépôt>/<run>.json), complétés par l'API Kronn : jetons et durée de chaque
étape du run et de ses sous-workflows (postes), attente aux gates, issue finale (panne, rejet à une gate). Un run de la
chaîne encore dans l'API sans bilan (avant l'historique, ou aucune étape Exec) est repris en bilan partiel.
Un run fini n'est relu qu'une fois : sa consommation est gardée dans ~/.cache/pixel-bureau/chaine_bilan/<run>.json.
Le coût réel vient des journaux Claude Code de chaque run (~/.claude/projects/<copie de travail du run>/, sous-agents
compris) : le compteur de Kronn ne compte que la sortie, pas l'entrée ni le contexte relu en cache, l'essentiel d'une longue
session. Chaque session est rattachée à l'étape Agent qui l'a lancée (la dernière démarrée avant elle), puis chiffrée au
prix de son modèle (réglage impl.prix, $ par million de jetons : entrée, écriture du cache, relecture du cache, sortie) :
un équivalent prix API, pour comparer. Runs écartés du rapport : impl.bilan_depuis (date ISO) et impl.bilan_exclus (débuts
d'ids de runs), pour les essais de la chaîne qui ne sont pas marqués comme tels.

  {generated_at, periode_jours, versions: [{hash, commit, sujet, debut}], tickets: [ligne], fiches: {run: fiche},
   (ligne.cout : {usd, cache, sortie, modeles: {famille: usd}, postes: {poste: usd}} ; fiche.blocs : [{n, rows: [{n, m, r,
   c, o, usd, subs}]}], Plan, Tour 1…, Livraison)
   kpi: {value, label, short}}

Une ligne par run, la plus récente d'abord (30 jours, 50 au plus) ; une fiche (déroulé, schéma, exigences, doc, résumé)
pour les plus récentes, tant que le dataset tient sous MAX_OUT. Les essais restent dans les lignes (marqués) ; le chiffre
clé les écarte.
"""
import datetime, glob, json, os, re, sys
from _lib import ACTIVE, CFG, get, read_json, write_json

MAX_OUT = 90_000
JOURS, MAX_TICKETS = 30, 50
CACHE = os.path.expanduser("~/.cache/pixel-bureau/chaine_bilan")
CACHE_V = 2  # 2 : les étapes Agent et le coût des journaux ; un cache d'avant est relu une fois
PROJETS = os.path.expanduser("~/.claude/projects")
# $ par million de jetons : entrée, écriture du cache, relecture du cache, sortie (prix API, 2026-06) ; impl.prix les remplace
PRIX = {"opus": [4, 5, 0.2, 20], "sonnet": [2, 2.5, 0.2, 10], "haiku": [1, 1.25, 0.1, 5]}
# (modèle du sous-workflow, étape Agent) -> (libellé, poste) ; None : le parent (la chaîne)
LIB = {("impl_cadrage", "propose"): ("📋 Plan", "Plan"), (None, "orchestrateur_plan"): ("🧠 Plan de l'orchestrateur", "Plan de l'orchestrateur"),
       (None, "orchestrateur"): ("🧭 Orchestrateur", "Orchestrateur"), ("impl_code", "code"): ("⌨ Code", "Code"),
       ("impl_code", "relecture"): ("⌨ Code · relecture", "Code"), ("impl_tests", "propose"): ("🧪 Tests", "Tests"),
       ("impl_controles", "parallele"): ("🔎 Contrôles", "Contrôles"), ("impl_livraison", "redige"): ("📤 Rédaction de la PR", "PR"),
       ("review_contexte", "agent"): ("👀 Revue · contexte", "Revue PR"), ("review_docs", "agent"): ("👀 Revue · docs", "Revue PR"),
       ("review_lecture", "agent"): ("👀 Revue · lecture", "Revue PR"), ("review_securite", "agent"): ("👀 Revue · sécurité", "Revue PR"),
       ("review_child", "avis"): ("👀 Revue · avis", "Revue PR"), ("impl_revue_pr", "locale"): ("👀 Revue locale", "Revue PR"),
       ("impl_retours", "corrige"): ("💬 Retours", "Retours"), ("impl_retours", "corrige_local"): ("💬 Retours", "Retours")}
PLAN_STEPS = ("ticket", "prepare", "cadrage", "compris", "dossier", "orchestrateur_plan", "gate_questions", "gate_plan", "mode")
KEY = re.compile(r"\b([A-Z][A-Z0-9]+-\d+) sur ([\w.-]+/[\w.-]+)")
# sous-workflow -> poste dont il porte les jetons ; une étape Agent du parent porte le sien. impl_cadrage est le poste 📋 Plan.
# Schéma, patterns et revue croisée ne sont plus appelés : leurs ids restent dans la config des installations d'avant, leurs
# runs des 30 derniers jours gardent leurs jetons (ANCIENS) ; une installation neuve ne les a pas
POSTE_DE = {"impl_cadrage": "cadrage", "impl_code": "code", "impl_tests": "tests", "impl_livraison": "pr",
            "impl_revue_pr": "revue_pr", "impl_retours": "retours", "impl_publication": "pr", "impl_controles": "controles"}
ANCIENS = {"impl_schema": "schema", "impl_patterns": "patterns", "impl_revue": "revue"}
ETAPE_DE = {"orchestrateur_plan": "plan", "orchestrateur": "orchestrateur", "parallele": "paralleles"}
GATES = ("gate_questions", "gate_plan", "gate_escalade", "gate_pr")  # gate_questions : runs d'avant le poste Plan


def historique():
    return os.path.expanduser((CFG.get("impl") or {}).get("historique") or "~/.local/share/pixel-bureau/historique")


def when(s):
    m = re.match(r"(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.\d+)?(Z|[+-]\d\d:?\d\d)?", str(s or ""))
    if not m:
        return None
    tz = (m.group(2) or "+00:00").replace("Z", "+00:00")
    tz = tz if ":" in tz else tz[:3] + ":" + tz[3:]
    return datetime.datetime.fromisoformat(m.group(1) + tz)


def bilans():
    """Les bilans de l'historique, par run."""
    out = {}
    for path in glob.glob(os.path.join(historique(), "*", "*", "*.json")):
        try:
            b = read_json(path)
        except (OSError, ValueError):
            continue
        if isinstance(b, dict) and b.get("run"):
            out[str(b["run"])] = b
    return out


REVUE = ("review_child", "review_contexte", "review_docs", "review_lecture", "review_securite")


class Arbre:
    """Les runs des sous-workflows de la chaîne, lus une fois par passage (parent_run_id)."""

    def __init__(self, models):
        self.models = models
        self.wf_poste = {models[k]: p for k, p in {**ANCIENS, **POSTE_DE}.items() if models.get(k)}
        self.wf_key = {v: k for k, v in models.items() if isinstance(v, str)}
        self.runs = {}  # wf -> runs (liste)

    def enfants(self, run_id):
        out = []
        # la revue du Bureau (review_child) et ses postes (review_<poste>, un niveau plus bas) : comptés avec la revue de la PR
        for wf in list(self.wf_poste) + [self.models[k] for k in REVUE if self.models.get(k)]:
            if wf not in self.runs:
                try:
                    self.runs[wf] = get(f"/workflows/{wf}/runs?limit=200") or []
                except Exception:  # noqa: BLE001  un sous-workflow illisible : ses jetons manquent, le reste tient
                    self.runs[wf] = []
            out += [(wf, r) for r in self.runs[wf] if r.get("parent_run_id") == run_id or r.get("triggered_by_run_id") == run_id]
        return out


def conso(chain, run, arbre):
    """Jetons par poste, jetons perdus, attente aux gates et déroulé d'un run (étapes du parent) et de ses sous-runs."""
    d = get(f"/workflows/{chain}/runs/{run['id']}") or {}
    postes, perdu, gates, deroule, agents = {}, {"echec": 0, "panne": 0}, {}, [], []
    failed_run = d.get("status") == "Failed"

    def ajoute(poste, s, en_panne):
        tok = int(s.get("tokens_used") or 0)
        if not tok or "subworkflow" in str(s.get("step_kind") or "").lower():
            return
        postes[poste] = postes.get(poste, 0) + tok
        if s.get("status") == "Failed":
            perdu["panne" if en_panne else "echec"] += tok

    for s in d.get("step_results") or []:
        n = s.get("step_name") or ""
        if n in ETAPE_DE:
            ajoute(ETAPE_DE[n], s, failed_run)
        if n in GATES:
            gates[n] = gates.get(n, 0) + int(s.get("duration_ms") or 0)
        deroule.append({"n": n, "at": s.get("started_at"), "ms": int(s.get("duration_ms") or 0), "s": s.get("status")})
        if str(s.get("step_kind") or "") == "Agent":
            agents.append({"k": None, "n": n, "at": s.get("started_at"), "ms": int(s.get("duration_ms") or 0)})

    def descend(run_id, poste_parent, depth=0):
        for wf, r in arbre.enfants(run_id):
            poste = arbre.wf_poste.get(wf, poste_parent)
            try:
                rd = get(f"/workflows/{wf}/runs/{r['id']}") or {}
            except Exception:  # noqa: BLE001
                continue
            for s in rd.get("step_results") or []:
                if str(s.get("step_kind") or "") == "Agent":
                    agents.append({"k": arbre.wf_key.get(wf), "n": s.get("step_name"), "at": s.get("started_at"), "ms": int(s.get("duration_ms") or 0)})
                ajoute(ETAPE_DE.get(s.get("step_name")) if poste == "controles" and s.get("step_name") in ETAPE_DE else poste, s,
                       failed_run)
            if depth < 3:
                descend(r["id"], poste, depth + 1)
    descend(run["id"], "autre")
    postes.pop(None, None)
    return {"status": d.get("status") or run.get("status"), "debut": d.get("started_at") or run.get("started_at"),
            "fin": d.get("finished_at") or run.get("finished_at"), "tok": sum(postes.values()), "postes": postes,
            "perdu": perdu, "gates": gates, "deroule": deroule[-40:], "agents": agents,
            "parent": [{"n": x["n"], "at": x["at"]} for x in deroule], "steps": d.get("step_results") or []}


def conso_cachee(chain, run, arbre):
    path = os.path.join(CACHE, re.sub(r"[^\w.-]", "_", str(run["id"])) + ".json")
    if run.get("status") not in ACTIVE:
        try:
            c = read_json(path)
            if c.get("v") == CACHE_V:
                return c
        except (OSError, ValueError):
            pass
    c = conso(chain, run, arbre)
    steps = c.pop("steps")
    last = steps[-1] if steps else {}
    c["rejete"] = str(last.get("step_name") or "").startswith("gate_") and last.get("status") == "Failed"
    prep = next((s.get("output") or "" for s in steps if s.get("step_name") == "prepare"), "")
    m = KEY.search(prep)
    c["ticket"], c["repo"] = (m.group(1), m.group(2)) if m else (None, None)
    t = re.findall(r"Tour (\d+)", " ".join(s.get("output") or "" for s in steps if s.get("step_name") == "aiguillage"))
    c["tours_controles"] = max(map(int, t)) if t else 0
    tk = next((s.get("output") or "" for s in steps if s.get("step_name") == "ticket"), "")
    m = re.search(r'\\?"summary\\?":\s*\\?"((?:[^"\\]|\\.){1,200}?)\\?"', tk)
    c["titre"] = m.group(1).replace('\\"', '"') if m else ""
    c["cout"], c["blocs"] = cout(run["id"], c.pop("agents"), c.pop("parent"))
    c["v"] = CACHE_V
    if run.get("status") not in ACTIVE:
        os.makedirs(CACHE, exist_ok=True)
        write_json(path, c)
    return c


# ---------- coût réel : les journaux Claude Code du run ----------
def ts(s):
    d = when(s)
    return d.timestamp() if d else None


def prix(model):
    p = {**PRIX, **((CFG.get("impl") or {}).get("prix") or {})}
    return next((v for k, v in p.items() if k in str(model or "")), p.get("sonnet") or [0, 0, 0, 0])


def session(path):
    """Une session : début, modèle, réponses (dédoublonnées : une réponse s'écrit sur plusieurs lignes), jetons et coût."""
    msgs, t0, first = {}, None, None
    with open(path, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            try:
                e = json.loads(line)
            except ValueError:
                continue
            t0 = t0 or e.get("timestamp")
            m = e.get("message") or {}
            if e.get("type") == "user" and first is None:
                c = m.get("content")
                first = c if isinstance(c, str) else " ".join(x.get("text", "") for x in c or [] if isinstance(x, dict))
            if e.get("type") == "assistant" and m.get("usage") and not str(m.get("model") or "").startswith("<"):  # <synthetic> : une erreur, sans appel
                msgs[m.get("id") or e.get("uuid")] = (m["usage"], m.get("model") or "")
    if not msgs or not ts(t0):
        return None
    S = lambda k: sum(int(u.get(k) or 0) for u, _ in msgs.values())  # noqa: E731
    usd = sum((int(u.get("input_tokens") or 0) * p[0] + int(u.get("cache_creation_input_tokens") or 0) * p[1]
               + int(u.get("cache_read_input_tokens") or 0) * p[2] + int(u.get("output_tokens") or 0) * p[3]) / 1e6
              for u, mod in msgs.values() for p in [prix(mod)])
    model = next(iter(msgs.values()))[1]
    lab = re.search(r"poste\s+(\S+\s[^\s.,:]+)", first or "")
    lab = lab.group(1).strip("«» ") if lab else ""
    lab = SOUS.get(lab.split()[-1].lower(), lab) if lab else "sous-agent"
    return {"t": ts(t0), "m": next((k for k in PRIX if k in model), re.sub(r"^claude-|-\d{8}$", "", model)), "r": len(msgs),
            "c": S("cache_read_input_tokens"), "o": S("output_tokens"), "usd": usd, "n": lab}


def sessions(run_id):
    """Les sessions des copies de travail du run (dossier qui finit par les 8 premiers caractères de l'id), sous-agents dans subs."""
    out = []
    for d in glob.glob(os.path.join(PROJETS, "*--" + str(run_id)[:8])):
        for f in glob.glob(os.path.join(d, "*.jsonl")):
            x = session(f)
            if x:
                x["subs"] = [y for y in (session(g) for g in sorted(glob.glob(os.path.join(f[:-6], "subagents", "*.jsonl")))) if y]
                out.append(x)
    return sorted(out, key=lambda x: x["t"])


def bloc_de(parent):
    """Le bloc de chaque étape du parent : le plan, puis un tour par passage au Code, puis la livraison."""
    out, tour, cur = [], 0, "Plan"
    for x in parent:
        if x["n"] == "code":
            tour += 1
            cur = f"Tour {tour}"
        elif x["n"] in ("livraison", "gate_pr", "publication"):
            cur = "Livraison"
        elif x["n"] in PLAN_STEPS and not tour:
            cur = "Plan"
        out.append((ts(x["at"]), cur))
    return out


# contrôleur (sous-agent du poste Contrôles) -> libellé
SOUS = {"regles": "📏 Règles", "règles": "📏 Règles", "securite": "🔒 Sécurité", "sécurité": "🔒 Sécurité", "doc": "📚 Doc",
        "besoin": "🎯 Besoin", "perf": "⚡ Perf·a11y", "perf·a11y": "⚡ Perf·a11y", "tests": "🧪 Tests"}
TITRES = {"Plan": "Plan : comprendre le ticket et écrire le plan", "Tour 1": "Tour 1 : Code, contrôles, décision",
          "Livraison": "Livraison : la PR, sa revue et ses retours"}


def cout(run_id, agents, parent):
    """Coût de chaque étape Agent (les sessions qu'elle a lancées), rangé par bloc ; None sans journaux."""
    ss = sessions(run_id)
    if not ss:
        return None, []
    ags = sorted(({**a, "t": ts(a["at"]), "ss": []} for a in agents if ts(a.get("at"))), key=lambda a: a["t"])
    for x in ss:  # la dernière étape Agent démarrée avant la session (et pas finie depuis plus d'une minute)
        cand = [a for a in ags if a["t"] - 3 <= x["t"] <= a["t"] + a["ms"] / 1000 + 60]
        if cand:
            cand[-1]["ss"].append(x)
    blocs_t, blocs, tot = bloc_de(parent), {}, {"usd": 0.0, "cache": 0, "sortie": 0, "modeles": {}, "postes": {}, "postes_m": {}}
    for a in ags:
        if not a["ss"]:
            continue
        lib, poste = LIB.get((a["k"], a["n"]), (a["n"], "autre"))
        b = next((n for t, n in reversed(blocs_t) if t and t <= a["t"] + 1), "Plan")
        subs = [y for x in a["ss"] for y in x["subs"]]
        allx = a["ss"] + subs
        row = {"n": lib, "m": "/".join(sorted({x["m"] for x in a["ss"]})), "r": sum(x["r"] for x in a["ss"]),
               "c": sum(x["c"] for x in a["ss"]), "o": sum(x["o"] for x in a["ss"]), "usd": round(sum(x["usd"] for x in a["ss"]), 2),
               "subs": [{k: (round(y[k], 2) if k == "usd" else y[k]) for k in ("n", "m", "r", "c", "o", "usd")} for y in subs]}
        blocs.setdefault(b, []).append(row)
        for x in allx:
            tot["usd"] += x["usd"]; tot["cache"] += x["c"]; tot["sortie"] += x["o"]  # noqa: E702
            tot["modeles"][x["m"]] = tot["modeles"].get(x["m"], 0) + x["usd"]
            tot["postes"][poste] = tot["postes"].get(poste, 0) + x["usd"]
            pm = tot["postes_m"].setdefault(poste, {})
            pm[x["m"]] = pm.get(x["m"], 0) + x["usd"]
    for rows in blocs.values():  # une revue ou des retours passés deux fois : passe 1, passe 2
        vus = {}
        for r in rows:
            vus[r["n"]] = vus.get(r["n"], 0) + 1
        k = {}
        for r in rows:
            if vus[r["n"]] > 1:
                k[r["n"]] = k.get(r["n"], 0) + 1
                r["n"] += f" · passe {k[r['n']]}"
    tot = {**tot, "usd": round(tot["usd"], 2), "modeles": {k: round(v, 2) for k, v in tot["modeles"].items()},
           "postes": {k: round(v, 2) for k, v in tot["postes"].items()},
           "postes_m": {p: {k: round(v, 2) for k, v in m.items()} for p, m in tot["postes_m"].items()}}
    return tot, [{"n": TITRES.get(n, f"{n} : correction des bloquants" if n.startswith("Tour") else n), "rows": rows} for n, rows in blocs.items()]


def issue(b, c):
    st = c.get("status")
    if st == "Failed":
        return "rejete" if c.get("rejete") else "panne"
    if st == "Cancelled":
        return "annule"
    if st in ACTIVE:
        return "en_cours"
    return (b or {}).get("issue") or ("termine" if st == "Success" else "en_cours")


def somme(d):
    return sum(v for v in (d or {}).values() if isinstance(v, (int, float)))


def ligne(b, c):
    """Une ligne du tableau : ce que la page agrège (jetons par poste, tours, contrôles, schéma, doc)."""
    b = b or {}
    debut, fin = when(c.get("debut") or b.get("debut")), when(c.get("fin"))
    t = b.get("tours") or {}
    sch = b.get("schema") or {}
    ex = (b.get("exigences") or {}).get("compte") or {}
    doc = b.get("doc") or {}
    df = b.get("diff") or {}
    return {
        "run": b.get("run") or c.get("run"), "ticket": b.get("ticket") or c.get("ticket"), "titre": (b.get("titre") or c.get("titre") or "")[:120],
        "repo": b.get("repo") or c.get("repo"), "essai": bool(b.get("essai")), "partiel": not b, "reprise": bool(b.get("reprise")),
        "debut": (c.get("debut") or b.get("debut")), "duree": int((fin - debut).total_seconds()) if fin and debut else None,
        "issue": issue(b, c), "pr": b.get("pr"), "version": (b.get("version") or {}).get("hash"),
        "tok": c.get("tok") or 0, "postes": c.get("postes") or {}, "perdu": c.get("perdu") or {}, "cout": c.get("cout"),
        "gates": {k.replace("gate_", ""): v for k, v in (c.get("gates") or {}).items()},
        "tours": {"cadrage": (t.get("propositions") or {}).get("cadrage", 0), "essais_code": t.get("essais_code", 0),
                  "controles": t.get("controles", c.get("tours_controles", 0)), "escalades": t.get("escalades", 0),
                  "propositions": somme(t.get("propositions"))},
        "retours": {k: (b.get("retours") or {}).get(k) or {} for k in ("par_gate", "par_cause")},
        "schema": {k: (len(sch[k]) if isinstance(sch.get(k), list) else sch.get(k) or 0)
                   for k in ("prevus", "prevus_touches", "touches_non_prevus", "prevus_non_touches")} if sch else None,
        "exig": ex, "doc": {"plus": (df.get("doc") or {}).get("plus", 0), "moins": (df.get("doc") or {}).get("moins", 0),
                            "fichiers": (df.get("doc") or {}).get("fichiers", 0), "a_maj": len(doc.get("a_mettre_a_jour") or [])} if b else None,
        "diff": {k: [v.get("plus", 0), v.get("moins", 0)] for k, v in df.items()} if df else None,
        "controles": {p: {k: [v[k]["trouves"], v[k]["corriges"], v[k]["restes"]] for k in ("bloquants", "avis") if k in v}
                      for p, v in (b.get("controles") or {}).items()},
    }


def fiche(b, c):
    b = b or {}
    sch = b.get("schema") or {}
    return {"resume": b.get("resume") or {}, "mermaid": sch.get("mermaid") or "", "plan": b.get("plan") or {},
            "touches_non_prevus": sch.get("touches_non_prevus") or [], "prevus_non_touches": sch.get("prevus_non_touches") or [],
            "exigences": (b.get("exigences") or {}).get("liste") or [], "doc": {k: (b.get("doc") or {}).get(k) or []
                                                                             for k in ("fichiers", "a_mettre_a_jour")},
            "retours": (b.get("retours") or {}).get("liste") or [], "deroule": c.get("deroule") or [], "blocs": c.get("blocs") or []}


def kpi(tickets, versions):
    """Le chiffre projeté : coût par ticket s'il est relevé, sinon jetons par ticket (runs finis, hors essais) avec l'écart
    avec la version d'avant dans le libellé."""
    vus = [t for t in tickets if not t["essai"] and t["issue"] not in ("en_cours",) and t["tok"]]
    if not vus:
        return None
    usd = [t["cout"]["usd"] for t in vus if t.get("cout")]
    if usd:  # le coût réel (journaux Claude Code) quand il est relevé : les jetons de Kronn ne comptent que la sortie
        return {"value": f"{round(sum(usd) / len(usd))} $", "label": "par ticket · équivalent prix API", "short": "Chaîne · bilan"}
    moy = sum(t["tok"] for t in vus) / len(vus)
    label = "jetons par ticket"
    order = [v["hash"] for v in versions]
    par = {}
    for t in vus:
        par.setdefault(t["version"], []).append(t["tok"])
    known = [h for h in order if h in par]
    if len(known) >= 2:
        prev, cur = (sum(par[h]) / len(par[h]) for h in known[-2:])
        if prev:
            label += f" · {round((cur - prev) / prev * 100):+d} % / version"
    return {"value": f"{round(moy / 1000)} k", "label": label.replace("-", "−")[:40], "short": "Chaîne · bilan"}


def snapshot(now=None):
    now = now or datetime.datetime.now(datetime.timezone.utc)
    models = CFG.get("models") or {}
    chain = models.get("impl_chain")
    out = {"generated_at": now.isoformat(timespec="seconds"), "periode_jours": JOURS, "versions": [], "tickets": [], "fiches": {}}
    if not chain:
        return out
    hist = bilans()
    runs = get(f"/workflows/{chain}/runs?limit=100") or []
    limit = now - datetime.timedelta(days=JOURS)
    imp = CFG.get("impl") or {}
    dep = str(imp.get("bilan_depuis") or "")
    depuis, exclus = when(dep if "T" in dep or not dep else dep + "T00:00:00"), [str(x) for x in imp.get("bilan_exclus") or [] if str(x)]
    if depuis and depuis > limit:
        limit = depuis
    arbre = Arbre(models)
    rows = []
    for r in sorted(runs, key=lambda r: r.get("started_at") or "", reverse=True):
        if r.get("status") == "Pending" or (when(r.get("started_at")) or now) < limit or any(str(r["id"]).startswith(x) for x in exclus):
            continue
        b = hist.get(str(r["id"]))
        c = conso_cachee(chain, r, arbre)
        c["run"] = r["id"]
        if not b and not c.get("ticket"):
            continue  # pas encore préparé : ni ticket ni dépôt
        rows.append((ligne(b, c), fiche(b, c), b))
        if len(rows) >= MAX_TICKETS:
            break
    versions = {}
    for row, _, b in sorted(rows, key=lambda x: x[0]["debut"] or ""):
        v = (b or {}).get("version") or {}
        if v.get("hash") and v["hash"] not in versions:
            versions[v["hash"]] = {"hash": v["hash"], "commit": v.get("commit"), "sujet": v.get("sujet"), "debut": row["debut"]}
    out["versions"] = list(versions.values())
    out["tickets"] = [r for r, _, _ in rows]
    out["fiches"] = {r["run"]: f for r, f, _ in rows[:12]}
    k = kpi(out["tickets"], out["versions"])
    if k:
        out["kpi"] = k
    return borne(out)


def borne(out):
    """Sous MAX_OUT : fiches les plus anciennes retirées d'abord, puis les lignes les plus anciennes."""
    while len(json.dumps(out, ensure_ascii=False).encode()) > MAX_OUT:
        if out["fiches"]:
            del out["fiches"][list(out["fiches"])[-1]]
        elif len(out["tickets"]) > 5:
            out["tickets"].pop()
        else:
            break
    return out


if __name__ == "__main__":
    try:
        data = snapshot()
    except Exception as e:  # noqa: BLE001  Kronn injoignable : un dataset vide plutôt qu'un cron en échec
        data = {"generated_at": None, "tickets": [], "versions": [], "fiches": {}, "error": str(e)[:300]}
    sys.stdout.write(json.dumps(data, ensure_ascii=False))
