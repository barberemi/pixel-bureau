"""Page « Retours · bilan » : l'historique des corrections de commentaires de PR (3e étage, modèle « corriger les
commentaires d'une PR », actions.fix_pr), 0 token (cron retours_bilan, toutes les 15 min). Deux étapes, chacune relançable
seule :

  python3 -c <ce script> releve          # 1. l'API Kronn : chaque run du modèle et l'état de sa PR, en cache
  python3 -c <ce script> bilan           # 2. cache -> stdout JSON du dataset retours_bilan

Par run, ce que seul Kronn sait : durée, jetons, coût et modèle de l'agent de correction (le seul poste qui coûte ; il ne
lance aucun sous-agent, le coût de Kronn est donc complet), attente à ta validation et ta décision, résultat (poussée,
panne d'un poste, coupée par un garde-fou, refusée, rien à pousser), déroulé. Ce que sait l'état du run
(~/.cache/pixel-bureau/pr/runs/<run>.json, écrit par pr_update.py) : PR, titre, auteur, fils et leur colonne, réponse prévue,
verdict des contrôles. Un run fini n'est relu qu'une fois (~/.cache/pixel-bureau/retours_bilan/<run>.json, l'état de la PR
compris) ; Kronn finit par oublier les vieux runs, le cache les garde.

  {generated_at, periode_jours, error, corrections: [ligne], fiches: {run: fiche}, kpi: {value, label, short}}

Une ligne par run, le plus récent d'abord (90 jours, 200 au plus) ; une fiche (fils, contrôles, déroulé) pour les plus
récents, tant que le dataset tient sous MAX_OUT.
"""
import datetime, glob, json, os, re, sys
from _lib import ACTIVE, CFG, FIL_COLS, get, read_json, write_json

MAX_OUT = 90_000
JOURS, MAX_LIGNES, MAX_FICHES = 90, 200, 12
CACHE = os.path.expanduser("~/.cache/pixel-bureau/retours_bilan")
ETATS = os.path.expanduser("~/.cache/pixel-bureau/pr/runs")
COLS = [c for c in FIL_COLS if c != "a_traiter"]  # corrige, test, laisse, reponse


def when(s):
    m = re.match(r"(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.\d+)?(Z|[+-]\d\d:?\d\d)?", str(s or ""))
    if not m:
        return None
    tz = (m.group(2) or "+00:00").replace("Z", "+00:00")
    tz = tz if ":" in tz else tz[:3] + ":" + tz[3:]
    return datetime.datetime.fromisoformat(m.group(1) + tz)


def cout(s):
    """Coût d'une étape d'agent : la somme de ses tentatives (relances comprises)."""
    return round(sum(float(a.get("cost_usd") or 0) for a in ((s.get("agent_provenance") or {}).get("attempts") or [])), 4)


def etat(run_id):
    try:
        return read_json(os.path.join(ETATS, re.sub(r"[^\w-]", "", str(run_id)) + ".json"))
    except (OSError, ValueError):
        return {}


def resultat(status, steps):
    """poussee, panne (et le poste), coupee (garde-fou de Kronn), refusee (ta validation), rien (rien à pousser), en_cours."""
    by = {s.get("step_name"): s for s in steps}
    if (by.get("push") or {}).get("status") == "Success":
        return "poussee", None
    if status in ACTIVE:
        return "en_cours", None
    if status == "StoppedByGuard" or any(str(s.get("step_name") or "").startswith("__guard") for s in steps):
        return "coupee", next((s.get("step_name") for s in reversed(steps) if not str(s.get("step_name") or "").startswith("__guard")), None)
    if (by.get("gate") or {}).get("status") == "Failed" or (by.get("abort") or {}).get("status") == "Success":
        return "refusee", None
    failed = next((s.get("step_name") for s in steps if s.get("status") == "Failed"), None)
    if failed == "diff":
        return "rien", None  # l'agent n'a rien changé ni rien répondu (code 9 de pr_update.py)
    if failed:
        return "panne", failed
    return "rien", None


# ---------- 1. relevé de l'API Kronn ----------
def conso(wf, run):
    """Ce que seul Kronn sait d'un run, et l'état de sa PR à cet instant."""
    d = get(f"/workflows/{wf}/runs/{run['id']}") or {}
    steps = d.get("step_results") or []
    agent = {"ms": 0, "tok": 0, "cout": 0.0, "modele": None, "passages": 0}
    for s in steps:
        if str(s.get("step_kind") or "").lower() == "agent":
            agent["ms"] += int(s.get("duration_ms") or 0)
            agent["tok"] += int(s.get("tokens_used") or 0)
            agent["cout"] = round(agent["cout"] + cout(s), 4)
            agent["modele"] = s.get("step_model") or agent["modele"]
            agent["passages"] += 1
    gate = next((s for s in steps if s.get("step_name") == "gate"), None)
    status = d.get("status") or run.get("status")
    res, poste = resultat(status, steps)
    tc = d.get("trigger_context") if isinstance(d.get("trigger_context"), dict) else {}
    st = etat(run["id"])
    chk = st.get("check") if isinstance(st.get("check"), dict) else {}
    return {"run": run["id"], "status": status, "debut": d.get("started_at") or run.get("started_at"),
            "fin": d.get("finished_at") or run.get("finished_at"), "agent": agent,
            "gate": {"attente_ms": int((gate or {}).get("duration_ms") or 0) if (gate or {}).get("status") != "WaitingApproval" else None,
                     "s": (gate or {}).get("status")},
            "resultat": res, "poste": poste,
            "pr": {"repo": st.get("repo") or tc.get("repo"), "n": str(st.get("pr") or tc.get("pr") or ""), "titre": st.get("title"),
                   "auteur": st.get("author"), "url": f"https://github.com/{st.get('repo') or tc.get('repo')}/pull/{st.get('pr') or tc.get('pr')}"},
            "fils": [{"path": f.get("path"), "line": f.get("line"), "who": f.get("who"), "text": str(f.get("text") or "")[:400],
                      "url": f.get("url"), "col": (st.get("cols") or {}).get(f.get("id")),
                      "reponse": (st.get("reponses") or {}).get(f.get("id"))} for f in st.get("fils") or []],
            "controles": {"verdict": chk.get("verdict"), "cmd": chk.get("cmd")} if chk else None,
            "ecartes": len(st.get("ecartes") or []),
            "deroule": [{"n": s.get("step_name"), "at": s.get("started_at"), "ms": int(s.get("duration_ms") or 0), "s": s.get("status")}
                        for s in steps][-30:]}


def cache_path(run_id):
    return os.path.join(CACHE, re.sub(r"[^\w.-]", "_", str(run_id)) + ".json")


def releve():
    """Les runs du modèle encore dans l'API Kronn, lus dans le cache s'ils sont finis et déjà relus."""
    wf = (CFG.get("actions") or {}).get("fix_pr")
    if not wf:
        return {"lus": 0, "en_cache": 0, "error": None}
    lus = en_cache = 0
    for run in get(f"/workflows/{wf}/runs?limit=100") or []:
        if run.get("status") == "Pending":
            continue
        path = cache_path(run["id"])
        if run.get("status") not in ACTIVE and os.path.exists(path):
            en_cache += 1
            continue
        c = conso(wf, run)
        os.makedirs(CACHE, exist_ok=True)
        write_json(path, c)
        lus += 1
    return {"lus": lus, "en_cache": en_cache, "error": None}


# ---------- 2. le bilan ----------
def ligne(c):
    cols = {k: 0 for k in COLS}
    for f in c.get("fils") or []:
        if f.get("col") in cols:
            cols[f["col"]] += 1
    t0, t1 = when(c.get("debut")), when(c.get("fin"))
    a, p = c.get("agent") or {}, c.get("pr") or {}
    return {"run": c["run"], "debut": c.get("debut"), "ms": int((t1 - t0).total_seconds() * 1000) if t0 and t1 else None,
            "repo": p.get("repo"), "pr": p.get("n"), "titre": p.get("titre"), "auteur": p.get("auteur"), "url": p.get("url"),
            "fils": len(c.get("fils") or []), "cols": cols, "controles": ((c.get("controles") or {}).get("verdict")),
            "attente_ms": (c.get("gate") or {}).get("attente_ms"), "resultat": c.get("resultat"), "poste": c.get("poste"),
            "tok": a.get("tok") or 0, "cout": a.get("cout") or 0, "modele": a.get("modele"), "agent_ms": a.get("ms") or 0}


def fiche(c):
    return {"fils": c.get("fils") or [], "controles": c.get("controles"), "ecartes": c.get("ecartes") or 0, "deroule": c.get("deroule") or []}


def kpi(rows):
    fini = [r for r in rows if r["resultat"] != "en_cours"]
    ok = sum(r["resultat"] == "poussee" for r in fini)
    return {"value": f"{ok} / {len(fini)}", "label": "PR poussées sur les corrections lancées", "short": f"{ok} poussées"}


def bilan(now=None):
    now = now or datetime.datetime.now(datetime.timezone.utc)
    limite = now - datetime.timedelta(days=JOURS)
    cs = []
    for path in glob.glob(os.path.join(CACHE, "*.json")):
        if os.path.basename(path).startswith("_"):
            continue
        try:
            c = read_json(path)
        except (OSError, ValueError):
            continue
        t = when(c.get("debut"))
        if isinstance(c, dict) and c.get("run") and t and t >= limite:
            cs.append(c)
    cs.sort(key=lambda c: c.get("debut") or "", reverse=True)
    cs = cs[:MAX_LIGNES]
    try:
        rel = read_json(os.path.join(CACHE, "_releve.json"))
    except (OSError, ValueError):
        rel = {}
    out = {"generated_at": now.isoformat(timespec="seconds"), "periode_jours": JOURS, "error": rel.get("error"),
           "corrections": [ligne(c) for c in cs], "fiches": {c["run"]: fiche(c) for c in cs[:MAX_FICHES]}}
    if out["corrections"]:
        out["kpi"] = kpi(out["corrections"])
    return borne(out)


def borne(out):
    """Sous MAX_OUT : fiches les plus anciennes retirées d'abord, puis les lignes les plus anciennes."""
    while len(json.dumps(out, ensure_ascii=False).encode()) > MAX_OUT:
        if out["fiches"]:
            last = next(r["run"] for r in reversed(out["corrections"]) if r["run"] in out["fiches"])
            out["fiches"].pop(last)
        elif out["corrections"]:
            out["corrections"].pop()
        else:
            break
    return out


if __name__ == "__main__":
    cmd = (sys.argv[1:] or ["bilan"])[0]
    if cmd == "releve":
        try:
            res = releve()
        except Exception as e:  # noqa: BLE001  Kronn injoignable : le bilan publie le cache et dit pourquoi
            res = {"lus": 0, "en_cache": 0, "error": f"API Kronn : {str(e)[:200]}"}
        os.makedirs(CACHE, exist_ok=True)
        write_json(os.path.join(CACHE, "_releve.json"), {**res, "at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")})
        print(res["error"] or f"{res['lus']} run(s) relu(s) dans Kronn, {res['en_cache']} déjà en cache")
    else:
        try:
            data = bilan()
        except Exception as e:  # noqa: BLE001  un cache illisible : un dataset vide plutôt qu'un cron en échec
            data = {"generated_at": None, "corrections": [], "fiches": {}, "error": str(e)[:300]}
        sys.stdout.write(json.dumps(data, ensure_ascii=False))
