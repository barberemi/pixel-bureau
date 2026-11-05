"""Page « Rédaction · bilan » : l'historique des intentions de la salle de rédaction (2e étage, models.ticket) et des
tickets créés, 0 token (cron redaction_bilan, toutes les 15 min). Deux étapes, chacune relançable seule :

  python3 -c <ce script> releve          # 1. l'API Kronn : chaque run du modèle ticket et ceux de ses postes, en cache
  python3 -c <ce script> bilan           # 2. historique + cache -> stdout JSON du dataset redaction_bilan

Sources : l'historique (jira.create.historique, sinon ~/.local/share/pixel-bureau/historique/ticket/<run>.json, écrit par
ticket.py : la demande, chaque version des tickets, chaque critique, tes retours, les tickets créés) ; sans historique (runs
d'avant), le dossier du run (~/.cache/pixel-bureau/ticket/<run>/, dernière version seulement : ligne « partielle »). Par run,
ce que seul Kronn sait : durée, jetons, coût et modèle de chaque agent, poste par poste et passage par passage (runs des
sous-workflows de postes, par parent_run_id ; les postes ne lancent aucun sous-agent, le coût de Kronn est donc complet), passages au tampon (étape relire), attente et décision, créations en échec, déroulé. Un run fini n'est relu
qu'une fois (~/.cache/pixel-bureau/redaction_bilan/<run>.json) ; Kronn finit par oublier les vieux runs, le cache les garde.

  {generated_at, periode_jours, jira_site, error, intentions: [ligne], fiches: {run: fiche}, kpi: {value, label, short}}

Une ligne par intention, la plus récente d'abord (90 jours, 200 au plus) ; une fiche (déroulé, recherche, versions,
critiques, retours, tickets créés, postes) pour les plus récentes, tant que le dataset tient sous MAX_OUT. Les notes de la
critique et tes retours sont classés par mots-clés (0 token).
"""
import datetime, glob, json, os, re, sys
from _lib import ACTIVE, CFG, get, read_json, write_json

MAX_OUT = 90_000
JOURS, MAX_LIGNES, MAX_FICHES = 90, 200, 12
CACHE = os.path.expanduser("~/.cache/pixel-bureau/redaction_bilan")
DOSSIERS = os.path.expanduser("~/.cache/pixel-bureau/ticket")
POSTES = ("recherche", "redaction", "critique")
# ce que relève la critique : mots-clés, 0 token (la première classe trouvée, dans cet ordre)
NOTES = (("langue", ("anglais", "français", "francais", "langue", "english", "french")),
         ("criteres", ("critère", "critere", "accept", "comment tester", "testable", "se teste", "vérifiable", "verifiable")),
         ("decoupage", ("découp", "decoup", "scind", "fusion", "trop large", "sépar", "separ", "plusieurs tickets", "un seul ticket")),
         ("invente", ("invent", "n'existe pas", "introuvable", "chemin", "hallucin", "inexistant")),
         ("doublon", ("doublon", "existe déjà", "existe deja", "déjà un ticket", "deja un ticket", "redondant")),
         ("points", ("point", "estimation", "fibonacci", "sous-estim", "surestim")),
         ("composant", ("composant", "mauvais projet", "mauvais dépôt", "mauvais depot")))
# tes « Changements » au tampon, et le poste à régler
CAUSES = (("decoupage", ("découp", "decoup", "fusion", "retire", "sépar", "separ", "scind", "un seul", "regroupe")),
          ("projet", ("composant", "projet", "dépôt", "depot", "repo")),
          ("longueur", ("trop long", "plus court", "concis", "verbeux", "simplifi", "trop de détails")),
          ("titre", ("titre", "summary", "anglais", "français", "francais", "langue")),
          ("points", ("point", "estimation", " pts")))


def historique():
    return os.path.expanduser((((CFG.get("jira") or {}).get("create")) or {}).get("historique") or "~/.local/share/pixel-bureau/historique/ticket")


def when(s):
    m = re.match(r"(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.\d+)?(Z|[+-]\d\d:?\d\d)?", str(s or ""))
    if not m:
        return None
    tz = (m.group(2) or "+00:00").replace("Z", "+00:00")
    tz = tz if ":" in tz else tz[:3] + ":" + tz[3:]
    return datetime.datetime.fromisoformat(m.group(1) + tz)


def classe(texte, table):
    low = " " + " ".join(str(texte or "").lower().split()) + " "
    return next((c for c, kws in table if any(k in low for k in kws)), "autre")


# ---------- 1. relevé de l'API Kronn ----------
def cout(s):
    """Coût d'une étape d'agent : la somme de ses tentatives (relances comprises)."""
    return round(sum(float(a.get("cost_usd") or 0) for a in ((s.get("agent_provenance") or {}).get("attempts") or [])), 4)


def conso(parent, run, enfants, crea):
    """Ce que seul Kronn sait d'un run : agents de chaque poste (durée, jetons, coût, modèle), passages au tampon, créations,
    déroulé (étapes du parent)."""
    d = get(f"/workflows/{parent}/runs/{run['id']}") or {}
    steps = d.get("step_results") or []
    postes, passages = {}, []
    for poste, wf, r in enfants:
        try:
            rd = get(f"/workflows/{wf}/runs/{r['id']}") or {}
        except Exception:  # noqa: BLE001  un poste illisible : ses chiffres manquent, le reste tient
            continue
        for s in rd.get("step_results") or []:
            if str(s.get("step_kind") or "").lower() == "agent":
                p = postes.setdefault(poste, {"ms": 0, "tok": 0, "cout": 0.0, "modele": None, "passages": 0})
                p["ms"] += int(s.get("duration_ms") or 0)
                p["tok"] += int(s.get("tokens_used") or 0)
                p["cout"] = round(p["cout"] + cout(s), 4)
                p["modele"] = s.get("step_model") or p["modele"]
                p["passages"] += 1
                passages.append({"n": poste, "at": s.get("started_at"), "ms": int(s.get("duration_ms") or 0), "tok": int(s.get("tokens_used") or 0),
                                 "cout": cout(s), "modele": s.get("step_model"), "s": s.get("status")})
    gates = [s for s in steps if s.get("step_name") == "relire"]
    status = d.get("status") or run.get("status")
    ok = sum(r.get("status") == "Success" for r in crea)
    if status == "WaitingApproval":
        decision = "en_attente"
    elif gates and gates[-1].get("status") == "Failed":
        decision = "rejetee"
    elif gates and gates[-1].get("status") == "Success":
        decision = "approuvee"
    else:
        decision = None  # pas arrivé au tampon
    panne = next((s.get("step_name") for s in steps if s.get("status") == "Failed" and s.get("step_name") != "aiguillage"), None)
    return {"run": run["id"], "status": status, "debut": d.get("started_at") or run.get("started_at"),
            "fin": d.get("finished_at") or run.get("finished_at"), "postes": postes,
            "passages": sorted(passages, key=lambda x: x["at"] or ""),
            "gate": {"visites": len(gates), "changements": max(0, len(gates) - 1), "attente_ms": sum(int(s.get("duration_ms") or 0) for s in gates),
                     "decision": decision, "at": gates[0].get("started_at") if gates else None},
            "creations": {"ok": ok, "echecs": len(crea) - ok}, "panne": panne,
            "deroule": [{"n": s.get("step_name"), "at": s.get("started_at"), "ms": int(s.get("duration_ms") or 0), "s": s.get("status")}
                        for s in steps if s.get("step_name") in (*POSTES, "relire", "chaque")][-40:]}


def cache_path(run_id):
    return os.path.join(CACHE, re.sub(r"[^\w.-]", "_", str(run_id)) + ".json")


def releve():
    """Les runs du modèle ticket encore dans l'API Kronn, lus dans le cache s'ils sont finis et déjà relus."""
    models = CFG.get("models") or {}
    parent = models.get("ticket")
    if not parent:
        return {"lus": 0, "en_cache": 0, "error": None}
    wf_poste = {models[f"ticket_{p}"]: p for p in POSTES if models.get(f"ticket_{p}")}
    if models.get("ticket_un"):
        wf_poste[models["ticket_un"]] = "un"
    sous = {}
    lus = en_cache = 0
    for run in get(f"/workflows/{parent}/runs?limit=100") or []:
        if run.get("status") == "Pending":
            continue
        path = cache_path(run["id"])
        if run.get("status") not in ACTIVE and os.path.exists(path):
            try:
                if "passages" in read_json(path):  # un cache d'avant le coût par passage est relu une fois
                    en_cache += 1
                    continue
            except (OSError, ValueError):
                pass
        enfants = []
        for wf, poste in wf_poste.items():
            if wf not in sous:
                try:
                    sous[wf] = get(f"/workflows/{wf}/runs?limit=200") or []
                except Exception:  # noqa: BLE001
                    sous[wf] = []
            enfants += [(poste, wf, r) for r in sous[wf] if r.get("parent_run_id") == run["id"]]
        c = conso(parent, run, [e for e in enfants if e[0] != "un"], [r for p, _, r in enfants if p == "un"])
        os.makedirs(CACHE, exist_ok=True)
        write_json(path, c)  # un run en cours est réécrit au passage suivant
        lus += 1
    return {"lus": lus, "en_cache": en_cache, "error": None}


# ---------- 2. le dataset de la page ----------
def lire(pattern):
    out = []
    for path in glob.glob(pattern):
        try:
            x = read_json(path)
        except (OSError, ValueError):
            continue
        if isinstance(x, dict):
            out.append(x)
    return out


def depuis_dossier(run, c):
    """Un run d'avant l'historique : son dossier (dernière version, dernière critique), daté par Kronn."""
    base = os.path.join(DOSSIERS, re.sub(r"[^\w-]", "", run))
    lit = lambda n, dflt=None: (lambda p: read_json(p) if os.path.exists(p) else dflt)(os.path.join(base, n))
    try:
        d = lit("demande.json") or {}
        t, cr, rec = lit("tickets.json") or {}, lit("critique.json") or {}, lit("recherche.json")
    except (OSError, ValueError):
        return None
    if not d and not c:
        return None
    h = {"run": run, "at": c.get("debut"), "partiel": True, **{k: d[k] for k in ("intention", "type", "points", "composants", "sprint", "parent", "tour") if k in d}}
    h["essai"] = bool(re.match(r"\s*\[\s*essai", str(d.get("intention") or ""), re.I))
    if rec:
        h["recherche"] = {"composants": rec.get("composants") or [], "texte": str(rec.get("texte") or "")[:4000]}
    if t.get("tickets"):
        h["versions"] = [{"v": t.get("version"), "tickets": [{"summary": x.get("summary"), "composant": x.get("composant"), "points": x.get("points")}
                                                           for x in t["tickets"]]}]
    if cr:
        h["critiques"] = [{"v": cr.get("version"), "verdict": cr.get("verdict"), "notes": cr.get("notes") or []}]
    h["retours"] = [{"texte": x} for x in (lit("retours.json") or [])]
    h["crees"] = lit("crees.json") or []
    return h


def issue(h, c):
    """cree, rejetee, panne, annulee, en_cours, attente (au tampon)."""
    st, g = c.get("status"), c.get("gate") or {}
    if st in ACTIVE:
        return "attente" if g.get("decision") == "en_attente" else "en_cours"
    if h.get("crees"):
        return "cree"
    if g.get("decision") == "rejetee":
        return "rejetee"
    if st == "Cancelled":
        return "annulee"
    return "panne" if c else "en_cours"


def critique_stats(h):
    """Les notes de chaque tour classées ; « revenues » : une classe notée à un tour et encore au suivant."""
    tours = [sorted({classe(n.get("note"), NOTES) for n in (k.get("notes") or [])}) for k in sorted(h.get("critiques") or [], key=lambda k: k.get("v") or 0)]
    notes = [classe(n.get("note"), NOTES) for k in h.get("critiques") or [] for n in k.get("notes") or []]
    revenues = sorted({x for a, b in zip(tours, tours[1:]) for x in a if x in b})
    last = max(h.get("critiques") or [{}], key=lambda k: k.get("v") or 0)
    vmax = max([v.get("v") or 0 for v in h.get("versions") or []] or [0])
    return {"notes": notes, "revenues": revenues, "tours": len(h.get("critiques") or []),
            "reserves": last.get("verdict") == "a_retoucher" and (last.get("v") or 0) >= vmax}


def ligne(h, c):
    vs = sorted(h.get("versions") or [], key=lambda v: v.get("v") or 0)
    last = vs[-1]["tickets"] if vs else []
    debut, fin = when(c.get("debut") or h.get("at")), when(c.get("fin"))
    g = c.get("gate") or {}
    tampon = when(g.get("at"))
    crees = [{"key": x.get("key"), "title": x.get("title"), "composant": x.get("composant"),
              "points": x.get("points") if x.get("points") is not None else ((last[x["i"]] if isinstance(x.get("i"), int) and x["i"] < len(last) else {}).get("points"))}
             for x in h.get("crees") or []]
    return {"run": h.get("run"), "at": c.get("debut") or h.get("at"), "intention": str(h.get("intention") or "")[:200],
            "type": h.get("type"), "points": h.get("points"), "parent": h.get("parent"), "sprint": h.get("sprint"),
            "essai": bool(h.get("essai")), "partiel": bool(h.get("partiel")) or not c,
            "composants": ((h.get("recherche") or {}).get("composants") or h.get("composants") or [])[:6],
            "proposes": len(last), "versions": len(vs), "tours": int(h.get("tour") or len(vs) or 1),
            "crees": crees, "issue": issue(h, c), "panne": c.get("panne"),
            "creations_ko": (c.get("creations") or {}).get("echecs") or 0,
            "duree_ms": int((fin - debut).total_seconds() * 1000) if fin and debut else None,
            "avant_tampon_ms": int((tampon - debut).total_seconds() * 1000) if tampon and debut else None,
            "postes": c.get("postes") or {}, "gate": {k: g.get(k) for k in ("visites", "changements", "attente_ms", "decision")},
            "cout": round(sum(float(p.get("cout") or 0) for p in (c.get("postes") or {}).values()), 4),
            "tok": sum(int(p.get("tok") or 0) for p in (c.get("postes") or {}).values()),
            "critique": critique_stats(h), "causes": [classe(r.get("texte"), CAUSES) for r in h.get("retours") or []]}


def fiche(h, c):
    texte = str((h.get("recherche") or {}).get("texte") or "")
    pistes = [re.sub(r"^[\s*•-]+", "", ln).replace("`", "").strip() for ln in texte.splitlines() if re.match(r"^\s*[*•-]\s+\S", ln)]
    return {"intention": str(h.get("intention") or "")[:1500], "parent_de": h.get("parent_de"),
            "recherche": {"composants": (h.get("recherche") or {}).get("composants") or [], "pistes": [p[:220] for p in pistes[:8]]},
            "versions": [{"v": v.get("v"), "tickets": [{"summary": str(x.get("summary") or "")[:160], "composant": x.get("composant"), "points": x.get("points")}
                                                       for x in (v.get("tickets") or [])[:8]]} for v in sorted(h.get("versions") or [], key=lambda v: v.get("v") or 0)[-4:]],
            "critiques": [{"v": k.get("v"), "verdict": k.get("verdict"), "notes": [{"ticket": n.get("ticket"), "gravite": n.get("gravite"), "note": str(n.get("note") or "")[:300]}
                                                                                  for n in (k.get("notes") or [])[:8]]} for k in sorted(h.get("critiques") or [], key=lambda k: k.get("v") or 0)[-4:]],
            "retours": [{"at": r.get("at"), "texte": str(r.get("texte") or "")[:300], "cause": classe(r.get("texte"), CAUSES)} for r in (h.get("retours") or [])[-6:]],
            "deroule": c.get("deroule") or [], "passages": c.get("passages") or []}


def kpi(rows, now):
    """Le chiffre projeté : les tickets créés sur 30 jours (hors essais), et le coût par ticket dans le libellé."""
    lim = now - datetime.timedelta(days=30)
    vus = [r for r in rows if not r["essai"] and (when(r["at"]) or now) >= lim]
    n = sum(len(r["crees"]) for r in vus)
    if not vus:
        return None
    c = sum(r["cout"] for r in vus)
    return {"value": str(n), "label": "tickets créés (30 j)" + (f" · {c / n:.2f} $ / ticket".replace(".", ",") if n and c else ""),
            "short": "Rédaction · bilan"}


def bilan(now=None):
    now = now or datetime.datetime.now(datetime.timezone.utc)
    out = {"generated_at": now.isoformat(timespec="seconds"), "periode_jours": JOURS, "jira_site": ((CFG.get("jira") or {}).get("site") or "").rstrip("/"),
           "error": None, "intentions": [], "fiches": {}}
    try:
        out["error"] = (read_json(os.path.join(CACHE, "_releve.json")) or {}).get("error")
    except (OSError, ValueError):
        pass
    consos = {str(c.get("run")): c for c in lire(os.path.join(CACHE, "*.json")) if c.get("run")}
    hist = {str(h.get("run")): h for h in lire(os.path.join(historique(), "*.json")) if h.get("run")}
    for run, c in consos.items():  # les runs d'avant l'historique, depuis leur dossier
        if run not in hist:
            h = depuis_dossier(run, c)
            if h:
                hist[run] = h
    lim = now - datetime.timedelta(days=JOURS)
    rows = []
    for run, h in hist.items():
        c = consos.get(run) or {}
        if (when(c.get("debut") or h.get("at")) or now) >= lim:
            rows.append((h, c))
    rows.sort(key=lambda hc: hc[1].get("debut") or hc[0].get("at") or "", reverse=True)
    rows = rows[:MAX_LIGNES]
    out["intentions"] = [ligne(h, c) for h, c in rows]
    out["fiches"] = {h["run"]: fiche(h, c) for h, c in rows[:MAX_FICHES]}
    k = kpi(out["intentions"], now)
    if k:
        out["kpi"] = k
    return borne(out)


def borne(out):
    """Sous MAX_OUT : fiches les plus anciennes retirées d'abord, puis les lignes les plus anciennes."""
    while len(json.dumps(out, ensure_ascii=False).encode()) > MAX_OUT:
        if out["fiches"]:
            del out["fiches"][list(out["fiches"])[-1]]
        elif len(out["intentions"]) > 5:
            out["intentions"].pop()
        else:
            break
    return out


if __name__ == "__main__":
    cmd = (sys.argv[1:] or ["bilan"])[0]
    if cmd == "releve":
        try:
            res = releve()
        except Exception as e:  # noqa: BLE001  Kronn injoignable : le bilan publie l'historique et dit pourquoi
            res = {"lus": 0, "en_cache": 0, "error": f"API Kronn : {str(e)[:200]}"}
        os.makedirs(CACHE, exist_ok=True)
        write_json(os.path.join(CACHE, "_releve.json"), {**res, "at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")})
        print(res["error"] or f"{res['lus']} run(s) relu(s) dans Kronn, {res['en_cache']} déjà en cache")
    else:
        try:
            data = bilan()
        except Exception as e:  # noqa: BLE001  un historique illisible : un dataset vide plutôt qu'un cron en échec
            data = {"generated_at": None, "intentions": [], "fiches": {}, "error": str(e)[:300]}
        sys.stdout.write(json.dumps(data, ensure_ascii=False))
