"""Page « Support · bilan » : l'historique des demandes du canal Support et de leurs investigations (models.support), 0 token
(cron support_bilan, toutes les 15 min). Trois étapes, chacune relançable seule :

  python3 -c <support.py> archive        # 1. les fils du relevé dans l'historique (support.py, seul à l'écrire)
  python3 -c <ce script> releve          # 2. l'API Kronn : chaque run d'investigation et ceux de ses postes, en cache
  python3 -c <ce script> bilan           # 3. historique + cache -> stdout JSON du dataset support_bilan

Sources : l'historique (support.historique, sinon ~/.local/share/pixel-bureau/historique/support/<message>.json : le fil,
ses investigations, ce qu'a rendu chaque poste, tes retours, la réponse postée) et, par run, ce que seul Kronn sait :
durée, jetons, coût et modèle de chaque agent (étapes du parent et runs des sous-workflows de postes), passages à la gate,
attente et décision. Un run fini n'est relu qu'une fois (~/.cache/pixel-bureau/support_bilan/<run>.json) ; Kronn finit
par oublier les vieux runs, le cache les garde.

  {generated_at, periode_jours, heures: {debut, fin, weekend}, error, demandes: [ligne], fiches: {message: fiche},
   kpi: {value, label, short}}

Une ligne par demande, la plus récente d'abord (90 jours, 200 au plus) ; une fiche (déroulé, postes, retours, réponse)
pour les plus récentes investiguées, tant que le dataset tient sous MAX_OUT. Temps de réponse en heures ouvrées
(rhythm.office_hours, rhythm.weekend, rhythm.timezone) : un message du dimanche soir ne compte qu'à partir du lundi matin.
"""
import datetime, glob, json, os, re, sys
from _lib import ACTIVE, CFG, TZ, get, read_json, write_json

MAX_OUT = 90_000
JOURS, MAX_DEMANDES, MAX_FICHES = 90, 200, 12
CACHE = os.path.expanduser("~/.cache/pixel-bureau/support_bilan")
POSTES = ("tri", "logs", "cause", "reponse", "relecture")
S = CFG.get("support") or {}
R = CFG.get("rhythm") or {}
JOURS_SEMAINE = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
# causes de tes « Changements » à la gate : mots-clés, 0 token (la première trouvée, dans cet ordre)
CAUSES = (("longueur", ("trop long", "plus court", "concis", "verbeux", "résum", "resum", "simplifi", "trop technique", "trop de détails")),
          ("exactitude", ("faux", "erreur", "inexact", "pas ça", "pas ca", "vérifi", "verifi", "pas sûr", "pas sur", "en fait", "plutôt", "plutot")),
          ("action", ("action", "manque", "ajoute", "précise", "precise", "oubli", "lien", "ticket", "suivi", "qui fait")),
          ("ton", ("ton ", "formul", "poli", "tutoi", "vouvoi", "anglais", "français", "francais", "langue")))
ROW_OF = {"open": "ouverture", "investigate": "investigation", "gate": "gate", "post": "post", **{p: p for p in POSTES}}


def historique():
    return os.path.expanduser(S.get("historique") or "~/.local/share/pixel-bureau/historique/support")


def when(s):
    m = re.match(r"(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.\d+)?(Z|[+-]\d\d:?\d\d)?", str(s or ""))
    if not m:
        return None
    tz = (m.group(2) or "+00:00").replace("Z", "+00:00")
    tz = tz if ":" in tz else tz[:3] + ":" + tz[3:]
    return datetime.datetime.fromisoformat(m.group(1) + tz)


def ouvrees(a, b):
    """Secondes ouvrées entre deux instants : heures de bureau (rhythm.office_hours, heure locale), hors week-end."""
    if not a or not b or b <= a:
        return 0 if a and b else None
    h0, h1 = (R.get("office_hours") or [8, 20])[:2]
    off = set(R.get("weekend") or ["Sat", "Sun"])
    la, lb = a.astimezone(TZ), b.astimezone(TZ)
    day, total = la.date(), 0.0
    while day <= lb.date():
        if JOURS_SEMAINE[day.weekday()] not in off:
            d0 = datetime.datetime(day.year, day.month, day.day, int(h0), tzinfo=TZ)
            d1 = datetime.datetime(day.year, day.month, day.day, int(h1) % 24, tzinfo=TZ) if h1 < 24 else \
                datetime.datetime(day.year, day.month, day.day, tzinfo=TZ) + datetime.timedelta(days=1)
            lo, hi = max(d0, la), min(d1, lb)
            if hi > lo:
                total += (hi - lo).total_seconds()
        day += datetime.timedelta(days=1)
    return int(total)


def first_name(name):
    """« Nom, Prénom » (annuaire) -> « Prénom » ; sinon le premier mot."""
    name = str(name or "")
    return (name.split(",", 1)[1].strip().split(" ")[0] if "," in name else name.split(" ")[0]) or None


def cause_of(texte):
    low = " " + " ".join(str(texte or "").lower().split()) + " "
    return next((c for c, kws in CAUSES if any(k in low for k in kws)), "autre")


# ---------- 2. relevé de l'API Kronn ----------
def cout(s):
    """Coût d'une étape d'agent : la somme de ses tentatives (relances comprises)."""
    return round(sum(float(a.get("cost_usd") or 0) for a in ((s.get("agent_provenance") or {}).get("attempts") or [])), 4)


def is_agent(s):
    return str(s.get("step_kind") or "").lower() == "agent"


def conso(parent, run, enfants):
    """Ce que seul Kronn sait d'un run : agents (durée, jetons, coût, modèle) par poste, passages à la gate, déroulé."""
    d = get(f"/workflows/{parent}/runs/{run['id']}") or {}
    steps = d.get("step_results") or []
    postes = {}

    def ajoute(poste, s):
        p = postes.setdefault(poste, {"ms": 0, "tok": 0, "cout": 0.0, "modele": None, "passages": 0, "echecs": 0})
        p["ms"] += int(s.get("duration_ms") or 0)
        p["tok"] += int(s.get("tokens_used") or 0)
        p["cout"] = round(p["cout"] + cout(s), 4)
        p["modele"] = s.get("step_model") or p["modele"]
        p["passages"] += 1
        p["echecs"] += s.get("status") == "Failed"

    for s in steps:
        if is_agent(s):  # ancien modèle : une seule étape « investigate »
            ajoute(ROW_OF.get(s.get("step_name"), s.get("step_name") or "autre"), s)
    for poste, wf, r in enfants:
        try:
            rd = get(f"/workflows/{wf}/runs/{r['id']}") or {}
        except Exception:  # noqa: BLE001  un poste illisible : ses chiffres manquent, le reste tient
            continue
        for s in rd.get("step_results") or []:
            if is_agent(s):
                ajoute(poste, s)
    gates = [s for s in steps if s.get("step_name") == "gate"]
    last = steps[-1] if steps else {}
    status = d.get("status") or run.get("status")
    if status == "WaitingApproval":
        decision = "en_attente"
    elif last.get("step_name") == "gate" and last.get("status") == "Failed":
        decision = "refusee"
    elif any(s.get("step_name") == "post" and s.get("status") == "Success" for s in steps):
        decision = "approuvee"
    else:
        decision = None  # pas arrivé à la gate, ou en panne après
    return {"run": run["id"], "status": status, "debut": d.get("started_at") or run.get("started_at"),
            "fin": d.get("finished_at") or run.get("finished_at"),
            "msg": str(((d.get("trigger_context") or {}) if isinstance(d.get("trigger_context"), dict) else {}).get("message_id") or ""),
            "postes": postes,
            "gate": {"visites": len(gates), "changements": max(0, len(gates) - 1), "attente_ms": sum(int(s.get("duration_ms") or 0) for s in gates),
                     "decision": decision},
            "deroule": [{"n": s.get("step_name"), "at": s.get("started_at"), "ms": int(s.get("duration_ms") or 0), "s": s.get("status")}
                        for s in steps if s.get("step_name") in ROW_OF][-40:]}


def cache_path(run_id):
    return os.path.join(CACHE, re.sub(r"[^\w.-]", "_", str(run_id)) + ".json")


def releve():
    """Les runs du modèle d'investigation encore dans l'API Kronn, lus dans le cache s'ils sont finis et déjà relus."""
    models = CFG.get("models") or {}
    parent = models.get("support")
    if not parent:
        return {"lus": 0, "en_cache": 0, "error": None}
    wf_poste = {models[f"support_{p}"]: p for p in POSTES if models.get(f"support_{p}")}
    sous = {}
    lus = en_cache = 0
    for run in get(f"/workflows/{parent}/runs?limit=100") or []:
        if run.get("status") == "Pending":
            continue
        path = cache_path(run["id"])
        if run.get("status") not in ACTIVE and os.path.exists(path):
            en_cache += 1
            continue
        enfants = []
        for wf, poste in wf_poste.items():
            if wf not in sous:
                try:
                    sous[wf] = get(f"/workflows/{wf}/runs?limit=200") or []
                except Exception:  # noqa: BLE001
                    sous[wf] = []
            enfants += [(poste, wf, r) for r in sous[wf] if r.get("parent_run_id") == run["id"]]
        c = conso(parent, run, enfants)
        os.makedirs(CACHE, exist_ok=True)
        write_json(path, c)  # un run en cours est réécrit au passage suivant
        lus += 1
    return {"lus": lus, "en_cache": en_cache, "error": None}


# ---------- 3. le dataset de la page ----------
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


def projets():
    """Nom de chaque projet Kronn (les vieux runs n'ont gardé que l'id) ; Kronn injoignable : les ids."""
    try:
        return {p.get("id"): p.get("name") for p in get("/projects", timeout=20) or []}
    except Exception:  # noqa: BLE001
        return {}


def sujet(h):
    """Le sujet du message, sinon sa première ligne (celle d'un message transféré plutôt que « ↪ Message transféré : »)."""
    lines = [ln.strip() for ln in str(h.get("extrait") or "").splitlines() if ln.strip() and not ln.strip().startswith("↪")]
    return (h.get("subject") or (lines[0] if lines else ""))[:90]


def ligne(h, consos, noms):
    """Une ligne du tableau : ce que la page agrège (entonnoir, postes, gate, projet × catégorie)."""
    runs = sorted((h.get("runs") or {}).items(), key=lambda kv: kv[1].get("at") or "")
    last_id, last = runs[-1] if runs else (None, {})
    tri = ((last.get("postes") or {}).get("tri")) or {}
    cause = ((last.get("postes") or {}).get("cause")) or {}
    logs = ((last.get("postes") or {}).get("logs")) or {}
    rep = h.get("reponse") or {}
    debut, poste_at = when(h.get("at")), when(rep.get("at"))
    postes, gate = {}, {"visites": 0, "changements": 0, "refus": 0, "attente_ms": 0, "decision": None}
    for rid, _ in runs:
        c = consos.get(rid) or {}
        for k, v in (c.get("postes") or {}).items():
            p = postes.setdefault(k, {"ms": 0, "tok": 0, "cout": 0.0, "modele": None, "passages": 0})
            for f in ("ms", "tok", "passages"):
                p[f] += int(v.get(f) or 0)
            p["cout"] = round(p["cout"] + float(v.get("cout") or 0), 4)
            p["modele"] = v.get("modele") or p["modele"]
        g = c.get("gate") or {}
        gate["visites"] += g.get("visites") or 0
        gate["changements"] += g.get("changements") or 0
        gate["refus"] += g.get("decision") == "refusee"
        gate["attente_ms"] += g.get("attente_ms") or 0
        gate["decision"] = g.get("decision") or gate["decision"]
    retours = [r for _, x in runs for r in (x.get("retours") or [])]
    pid = last.get("project")
    return {
        "msg": h.get("msg"), "at": h.get("at"), "from": first_name(h.get("from")),
        "subject": sujet(h), "url": h.get("url"),
        "state": h.get("state"), "by": first_name(h.get("by")), "relance": bool(h.get("relance")),
        "resolu": h.get("state") == "resolved" or "✅" in (h.get("reactions") or []),
        "projet": last.get("project_name") or noms.get(pid) or (pid[:8] if pid and pid != "none" else None),
        "categorie": tri.get("categorie"), "urgence": tri.get("urgence"), "deja_traite": tri.get("deja_traite"),
        "certitude": cause.get("certitude"), "piste": cause.get("piste"), "verifs": logs.get("verifs"), "outils": logs.get("outils") or [],
        "runs": len(runs), "run": last_id, "disc": last.get("disc"), "poste_at": rep.get("at"),
        "reponse_s": ouvrees(debut, poste_at) if poste_at else None,
        "reponse_brut_s": int((poste_at - debut).total_seconds()) if poste_at and debut else None,
        "cout": round(sum(p["cout"] for p in postes.values()), 4), "postes": postes, "gate": gate,
        "renvois": sum(int(x.get("renvois") or 0) for _, x in runs),
        "causes": [cause_of(r.get("texte")) for r in retours],
    }


def fiche(h, consos):
    runs = sorted((h.get("runs") or {}).items(), key=lambda kv: kv[1].get("at") or "")
    last_id, last = runs[-1] if runs else (None, {})
    return {"extrait": h.get("extrait"), "reactions": h.get("reactions") or [], "replies": h.get("replies") or 0,
            "comment": last.get("comment"), "versions": last.get("version") or 0, "postes": last.get("postes") or {},
            "retours": [{"at": r.get("at"), "cause": cause_of(r.get("texte")), "texte": str(r.get("texte") or "")[:300]}
                        for _, x in runs for r in (x.get("retours") or [])][-8:],
            "reponse": ((h.get("reponse") or {}).get("texte") or "")[:1500],
            "deroule": (consos.get(last_id) or {}).get("deroule") or []}


def kpi(rows, now):
    """Le chiffre projeté : la médiane du temps de réponse ouvré sur 30 jours (réponses postées)."""
    lim = now - datetime.timedelta(days=30)
    t = sorted(r["reponse_s"] for r in rows if r["reponse_s"] is not None and (when(r["at"]) or now) >= lim)
    if not t:
        return None
    m = t[len(t) // 2] if len(t) % 2 else (t[len(t) // 2 - 1] + t[len(t) // 2]) / 2
    mn = round(m / 60)
    return {"value": f"{mn} min" if mn < 60 else f"{mn // 60} h {mn % 60:02d}", "label": "médiane avant réponse (h. ouvrées)",
            "short": "Support · bilan"}


def bilan(now=None):
    now = now or datetime.datetime.now(datetime.timezone.utc)
    h0, h1 = (R.get("office_hours") or [8, 20])[:2]
    out = {"generated_at": now.isoformat(timespec="seconds"), "periode_jours": JOURS, "canal": S.get("name") or "Support",
           "kronn_ui": CFG.get("kronn_ui") or "http://localhost:5173/",  # liens vers les discussions des investigations
           "heures": {"debut": h0, "fin": h1, "weekend": R.get("weekend") or ["Sat", "Sun"]},
           "error": None, "demandes": [], "fiches": {}}
    try:
        st = read_json(os.path.join(CACHE, "_releve.json"))
        out["error"] = (st or {}).get("error")
    except (OSError, ValueError):
        pass
    hist = lire(os.path.join(historique(), "*.json"))
    consos = {str(c.get("run")): c for c in lire(os.path.join(CACHE, "*.json")) if c.get("run")}
    lim = now - datetime.timedelta(days=JOURS)
    hist = sorted((h for h in hist if h.get("msg") and (when(h.get("at")) or now) >= lim), key=lambda h: h.get("at") or "", reverse=True)
    hist = hist[:MAX_DEMANDES]
    noms = projets() if any(not r.get("project_name") and r.get("project") for h in hist for r in (h.get("runs") or {}).values()) else {}
    out["demandes"] = [ligne(h, consos, noms) for h in hist]
    out["fiches"] = {h["msg"]: fiche(h, consos) for h in [h for h in hist if h.get("runs")][:MAX_FICHES]}
    k = kpi(out["demandes"], now)
    if k:
        out["kpi"] = k
    return borne(out)


def borne(out):
    """Sous MAX_OUT : fiches les plus anciennes retirées d'abord, puis les lignes les plus anciennes."""
    while len(json.dumps(out, ensure_ascii=False).encode()) > MAX_OUT:
        if out["fiches"]:
            del out["fiches"][list(out["fiches"])[-1]]
        elif len(out["demandes"]) > 5:
            out["demandes"].pop()
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
            data = {"generated_at": None, "demandes": [], "fiches": {}, "error": str(e)[:300]}
        sys.stdout.write(json.dumps(data, ensure_ascii=False))
