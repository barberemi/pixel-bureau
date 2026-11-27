"""Page « Rejeu · bilan » : ce que disent les rejeux de Palpatine (workflows/rejeu.py), 0 token (cron rejeu_bilan, toutes les
heures). Trois étapes, chacune relançable seule :

  python3 -c <ce script> releve   # 1. l'API Kronn : durée et coût de chaque run d'impl_rejeu (ses postes compris), en cache ;
                                  #    et si la proposition de leçons du rejeu attend encore à sa gate (mémoire du soir)
  python3 -c <ce script> bilan    # 2. stdout JSON du dataset rejeu_bilan (page « Rejeu · bilan »)
  python3 -c <ce script> resume   # 3. stdout JSON du dataset rejeu_resume (page du Bureau, fiche de Palpatine)

Sources : les rejeux rangés par rejeu.py range (<rejeu.dossier>/<ticket>/<run>.json : note, parts, juge, version de la chaîne)
et les leçons du rejeu (<rejeu.dossier>/lecons.json, écrit par la mémoire du soir ; absent : aucune). Un run fini n'est relu
dans Kronn qu'une fois (~/.cache/pixel-bureau/rejeu_bilan/<run>.json). Le coût est celui de Kronn (étapes Agent du run et de
ses sous-workflows).

  {generated_at, error, depot, cible, temoin: [n° de PR], version: {hash, commit, sujet}, rejeux: [ligne],
   versions: [{hash, commit, sujet, debut, moyenne, n, lecons}], temoins: [{pr, ticket, titre, passages: [{note, version,
   fini_le, run}]}], lecons: {a_valider, validees}, resume, kpi}
"""
import datetime, glob, json, math, os, re, sys
from _lib import ACTIVE, CFG, get, read_json, write_json

MAX_OUT = 90_000
JOURS, MAX_LIGNES, PASSAGES = 90, 200, 6
CIBLE = 80  # rejeu.py : 80 sur 100, cible atteinte
CACHE = os.path.expanduser("~/.cache/pixel-bureau/rejeu_bilan")


def conf():
    return CFG.get("rejeu") or {}


def dossier():
    return os.path.expanduser(conf().get("dossier") or "~/.local/share/pixel-bureau/rejeu")


def lit(path, default=None):
    try:
        return read_json(path)
    except (OSError, ValueError):
        return default


def when(s):
    m = re.match(r"(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.\d+)?(Z|[+-]\d\d:?\d\d)?", str(s or ""))
    if not m:
        return None
    tz = (m.group(2) or "+00:00").replace("Z", "+00:00")
    tz = tz if ":" in tz else tz[:3] + ":" + tz[3:]
    return datetime.datetime.fromisoformat(m.group(1) + tz)


def cache_path(run_id):
    return os.path.join(CACHE, re.sub(r"[^\w.-]", "_", str(run_id)) + ".json")


# ---------- 1. relevé de l'API Kronn ----------
def cout(steps):
    """Coût des étapes Agent : la somme de leurs tentatives (relances comprises)."""
    return sum(float(a.get("cost_usd") or 0) for s in steps if str(s.get("step_kind") or "").lower() == "agent"
               for a in ((s.get("agent_provenance") or {}).get("attempts") or []))


def releve():
    models, rel = CFG.get("models") or {}, {"lus": 0, "en_cache": 0, "error": None}
    wf = models.get("impl_rejeu")
    if wf:
        postes = [v for k, v in models.items() if isinstance(v, str) and k.startswith(("impl_", "review_")) and k not in ("impl_rejeu", "impl_chain")]
        runs = {}

        def enfants(run_id):
            for p in postes:
                if p not in runs:
                    try:
                        runs[p] = get(f"/workflows/{p}/runs?limit=200") or []
                    except Exception:  # noqa: BLE001  un poste illisible : son coût manque, le reste tient
                        runs[p] = []
                yield from ((p, r) for r in runs[p] if run_id in (r.get("parent_run_id"), r.get("triggered_by_run_id")))

        def somme(w, run_id, depth=0):
            total = cout((get(f"/workflows/{w}/runs/{run_id}") or {}).get("step_results") or [])
            return total + (sum(somme(p, r["id"], depth + 1) for p, r in enfants(run_id)) if depth < 3 else 0)

        for run in get(f"/workflows/{wf}/runs?limit=100") or []:
            if run.get("status") in ACTIVE:
                continue  # le coût d'un run fini seulement
            if os.path.exists(cache_path(run["id"])):
                rel["en_cache"] += 1
                continue
            t0, t1 = when(run.get("started_at")), when(run.get("finished_at"))
            os.makedirs(CACHE, exist_ok=True)
            write_json(cache_path(run["id"]), {"run": run["id"], "status": run.get("status"), "cout": round(somme(wf, run["id"]), 4),
                                               "ms": int((t1 - t0).total_seconds() * 1000) if t0 and t1 else None})
            rel["lus"] += 1
    # la proposition de leçons du rejeu ne compte « à valider » que si son run de la mémoire du soir attend encore
    av = (lit(os.path.join(dossier(), "lecons.json"), {}) or {}).get("a_valider") or {}
    mem = (CFG.get("workflows") or {}).get("memoire")
    if av.get("run") and mem:
        rel["a_valider_run"] = av["run"]
        rel["a_valider_actif"] = ((get(f"/workflows/{mem}/runs/{av['run']}") or {}).get("status") in ACTIVE)
    return rel


# ---------- 2. le bilan ----------
def version_de(v):
    return (v.get("hash") if isinstance(v, dict) else v) or None


def ligne(r, c):
    j, parts = r.get("juge") or {}, r.get("parts") or {}
    return {"run": r.get("run"), "ticket": r.get("ticket"), "pr": r.get("pr"), "url": r.get("url"), "titre": r.get("titre"),
            "jeu": r.get("jeu") or "rotation", "genre": r.get("genre"), "zone": r.get("zone"), "fini_le": r.get("fini_le"),
            "note": r.get("note_sur_100"), "atteint": bool(r.get("atteint")), "escalade": bool(r.get("escalade")),
            "parts": {k: parts.get(k) for k in ("tests", "fichiers", "lignes", "juge")}, "version": version_de(r.get("version")),
            "resume": j.get("resume"), "echecs_tests": j.get("echecs_tests"),
            "ecarts": [{"cause": e.get("cause"), "lecon": e.get("lecon")} for e in j.get("ecarts") or [] if isinstance(e, dict)],
            "ms": c.get("ms"), "cout": c.get("cout")}


def rejeux(now):
    """Les rejeux rangés depuis JOURS jours, le plus récent d'abord, et les versions de la chaîne vues (hash -> version)."""
    limite, rows, vus = now - datetime.timedelta(days=JOURS), [], {}
    for path in glob.glob(os.path.join(dossier(), "*", "*.json")):
        r = lit(path)
        t = when((r or {}).get("fini_le")) if isinstance(r, dict) else None
        if not t or t < limite or r.get("note_sur_100") is None:
            continue
        rows.append(ligne(r, lit(cache_path(r.get("run")), {}) or {}))
        v = r.get("version")
        if isinstance(v, dict) and v.get("hash"):
            vus[v["hash"]] = v
    rows.sort(key=lambda x: x["fini_le"] or "", reverse=True)
    return rows[:MAX_LIGNES], vus


def lecons(rel):
    data = lit(os.path.join(dossier(), "lecons.json"), {}) or {}
    av = data.get("a_valider") or {}
    actif = bool(av.get("run")) and av.get("run") == rel.get("a_valider_run") and rel.get("a_valider_actif")
    validees = [x for x in data.get("validees") or [] if isinstance(x, dict)]
    return {"a_valider": len(av.get("lecons") or []) if actif else 0, "validees": len(validees),
            "dates": sorted(str(x.get("le") or "") for x in validees)}


def par_version(rows, vus, dates):
    """Le jeu témoin par version de la chaîne, dans l'ordre où elles sont apparues : moyenne de la dernière note de chaque PR
    témoin jouée avec elle ; lecons : leçons du rejeu validées entre la version d'avant et celle-ci."""
    debut, notes = {}, {}
    for r in sorted(rows, key=lambda x: x["fini_le"] or ""):
        if r["version"]:
            debut.setdefault(r["version"], r["fini_le"])
            if r["jeu"] == "temoin":
                notes.setdefault(r["version"], {})[r["pr"]] = r["note"]  # la dernière note de la PR avec cette version
    out, avant, dates = [], None, [t for t in map(when, dates) if t]
    for h in sorted(notes, key=lambda h: debut[h]):
        v, n, t = vus.get(h) or {}, list(notes[h].values()), when(debut[h])
        out.append({"hash": h, "commit": v.get("commit"), "sujet": v.get("sujet"), "debut": debut[h], "moyenne": sum(n) / len(n),
                    "n": len(n), "lecons": sum((not avant or avant < d) and d <= t for d in dates)})
        avant = t
    return out


def arrondi(x):
    return math.floor(x + 0.5)  # au demi supérieur (round() de Python arrondit 78,5 à 78)


def resume(rows, versions, lec):
    der = rows[0] if rows else None
    temoin = None
    if versions:
        cur, prec = versions[-1], (versions[-2] if len(versions) > 1 else None)
        temoin = {"moyenne": arrondi(cur["moyenne"]), "ecart": arrondi(cur["moyenne"] - prec["moyenne"]) if prec else None,
                  "version": cur["hash"], "version_prec": prec["hash"] if prec else None, "n": cur["n"]}
    return {"date": der["fini_le"] if der else None, "temoin": temoin,
            "dernier": {"ticket": der["ticket"], "pr": der["pr"], "note": der["note"], "cible": der["atteint"], "fini_le": der["fini_le"]} if der else None,
            "lecons": {"a_valider": lec["a_valider"], "validees": lec["validees"]}}


def charge(now):
    rel = lit(os.path.join(CACHE, "_releve.json"), {}) or {}
    rows, vus = rejeux(now)
    lec = lecons(rel)
    return rel, rows, vus, lec, par_version(rows, vus, lec["dates"])


def bilan(now=None):
    now = now or datetime.datetime.now(datetime.timezone.utc)
    rel, rows, vus, lec, versions = charge(now)
    temoin = [int(x) for x in conf().get("temoin") or [] if str(x).isdigit()]
    passages = {}
    for r in sorted(rows, key=lambda x: x["fini_le"] or ""):
        if r["jeu"] == "temoin":
            passages.setdefault(r["pr"], []).append({"note": r["note"], "version": r["version"], "fini_le": r["fini_le"], "run": r["run"]})
    titres = {r["pr"]: (r["ticket"], r["titre"]) for r in rows}
    res = resume(rows, versions, lec)
    out = {"generated_at": now.isoformat(timespec="seconds"), "error": rel.get("error"), "periode_jours": JOURS, "cible": CIBLE,
           "depot": conf().get("depot") or next(iter((CFG.get("impl") or {}).get("repos") or {}), ""), "temoin": temoin,
           "version": CFG.get("impl_version") or None, "rejeux": rows, "versions": versions,
           "temoins": [{"pr": n, "ticket": (titres.get(n) or (None,))[0], "titre": (titres.get(n) or (None, None))[1],
                        "passages": passages.get(n, [])[-PASSAGES:]} for n in sorted(set(temoin) | set(passages))],
           "lecons": {"a_valider": lec["a_valider"], "validees": lec["validees"]}, "resume": res}
    if res["temoin"]:
        out["kpi"] = {"value": str(res["temoin"]["moyenne"]), "label": f"jeu témoin, cible {CIBLE}", "short": "Rejeu"}
    return borne(out)


def borne(out):
    """Sous MAX_OUT : les rejeux les plus anciens retirés d'abord."""
    while len(json.dumps(out, ensure_ascii=False).encode()) > MAX_OUT and out["rejeux"]:
        out["rejeux"].pop()
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
    elif cmd == "resume":
        try:
            _, rows, _, lec, versions = charge(datetime.datetime.now(datetime.timezone.utc))
            data = resume(rows, versions, lec)
        except Exception:  # noqa: BLE001  dossier illisible : la fiche de Palpatine marche sans
            data = {"date": None, "temoin": None, "dernier": None, "lecons": {"a_valider": 0, "validees": 0}}
        sys.stdout.write(json.dumps(data, ensure_ascii=False))
    else:
        try:
            data = bilan()
        except Exception as e:  # noqa: BLE001  un fichier illisible : un dataset vide plutôt qu'un cron en échec
            data = {"generated_at": None, "rejeux": [], "versions": [], "temoins": [], "error": str(e)[:300]}
        sys.stdout.write(json.dumps(data, ensure_ascii=False))
