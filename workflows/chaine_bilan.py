"""Page « Chaîne · bilan » : l'historique des runs de la chaîne d'implémentation (models.impl_chain), 0 token ; stdout JSON
du dataset bilan de la page (cron chaine_bilan, toutes les 15 min).

Sources : les bilans écrits par workflows/chaine.py après chaque étape (impl.historique, sinon
~/.local/share/pixel-bureau/historique/<ticket>/<dépôt>/<run>.json), complétés par l'API Kronn : jetons et durée de chaque
étape du run et de ses sous-workflows (postes), attente aux gates, issue finale (panne, rejet à une gate). Un run de la
chaîne encore dans l'API sans bilan (avant l'historique, ou aucune étape Exec) est repris en bilan partiel.
Un run fini n'est relu qu'une fois : sa consommation est gardée dans ~/.cache/pixel-bureau/chaine_bilan/<run>.json.

  {generated_at, periode_jours, versions: [{hash, commit, sujet, debut}], tickets: [ligne], fiches: {run: fiche},
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
KEY = re.compile(r"\b([A-Z][A-Z0-9]+-\d+) sur ([\w.-]+/[\w.-]+)")
# sous-workflow -> poste dont il porte les jetons ; une étape Agent du parent porte le sien
POSTE_DE = {"impl_cadrage": "cadrage", "impl_schema": "schema", "impl_patterns": "patterns", "impl_code": "code",
            "impl_tests": "tests", "impl_revue": "revue", "impl_livraison": "pr", "impl_revue_pr": "revue_pr",
            "impl_retours": "retours", "impl_publication": "pr", "impl_controles": "controles"}
ETAPE_DE = {"orchestrateur_plan": "plan", "orchestrateur": "orchestrateur", "parallele": "paralleles"}
GATES = ("gate_questions", "gate_plan", "gate_escalade", "gate_pr")


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


class Arbre:
    """Les runs des sous-workflows de la chaîne, lus une fois par passage (parent_run_id)."""

    def __init__(self, models):
        self.models = models
        self.wf_poste = {models[k]: p for k, p in POSTE_DE.items() if models.get(k)}
        self.runs = {}  # wf -> runs (liste)

    def enfants(self, run_id):
        out = []
        for wf in list(self.wf_poste) + ([self.models["review_child"]] if self.models.get("review_child") else []):
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
    postes, perdu, gates, deroule = {}, {"echec": 0, "panne": 0}, {}, []
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

    def descend(run_id, poste_parent, depth=0):
        for wf, r in arbre.enfants(run_id):
            poste = arbre.wf_poste.get(wf, poste_parent)
            try:
                rd = get(f"/workflows/{wf}/runs/{r['id']}") or {}
            except Exception:  # noqa: BLE001
                continue
            for s in rd.get("step_results") or []:
                ajoute(ETAPE_DE.get(s.get("step_name")) if poste == "controles" and s.get("step_name") in ETAPE_DE else poste, s,
                       failed_run)
            if depth < 3:
                descend(r["id"], poste, depth + 1)
    descend(run["id"], "autre")
    postes.pop(None, None)
    return {"status": d.get("status") or run.get("status"), "debut": d.get("started_at") or run.get("started_at"),
            "fin": d.get("finished_at") or run.get("finished_at"), "tok": sum(postes.values()), "postes": postes,
            "perdu": perdu, "gates": gates, "deroule": deroule[-40:], "steps": d.get("step_results") or []}


def conso_cachee(chain, run, arbre):
    path = os.path.join(CACHE, re.sub(r"[^\w.-]", "_", str(run["id"])) + ".json")
    if run.get("status") not in ACTIVE:
        try:
            return read_json(path)
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
    if run.get("status") not in ACTIVE:
        os.makedirs(CACHE, exist_ok=True)
        write_json(path, c)
    return c


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
        "tok": c.get("tok") or 0, "postes": c.get("postes") or {}, "perdu": c.get("perdu") or {},
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
            "retours": (b.get("retours") or {}).get("liste") or [], "deroule": c.get("deroule") or []}


def kpi(tickets, versions):
    """Le chiffre projeté : jetons par ticket (runs finis, hors essais) ; l'écart avec la version d'avant dans le libellé."""
    vus = [t for t in tickets if not t["essai"] and t["issue"] not in ("en_cours",) and t["tok"]]
    if not vus:
        return None
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
    arbre = Arbre(models)
    rows = []
    for r in sorted(runs, key=lambda r: r.get("started_at") or "", reverse=True):
        if r.get("status") == "Pending" or (when(r.get("started_at")) or now) < limit:
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
