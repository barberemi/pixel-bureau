"""Pages Kronn du boss pour l'écran mural de la salle de réunion (#61) : titre, mise à jour, miniature.

Liste : le dataset `pagelist` de la page (ajouts et retraits faits depuis la page, pages_save.py), sinon la clé
boss_pages de la config (l'installation).
Sortie (stdout) : {generated_at, pages[{id, title, updated, img, kpi, tv}], choices[{id, title}], warnings[texte]}, pages dans
l'ordre de la liste ; choices : les pages Kronn qu'on peut ajouter (toutes, sauf le Bureau ; 80 au plus, sans image).
- img : capture JPEG 320x200 en data URI, ou null. Refaite seulement quand la page change (révision du HTML ou des
  données), sinon reprise du cache ~/.cache/pixel-bureau/thumbs/<id>.json.
- Capture : le HTML de la page et ses datasets dans un fichier local (window.KronnPageData, comme dans Kronn),
  photographié par Chrome headless, puis réduit par jpeg() du socle (Pillow, sinon sips). Sans Chrome : cartes sans image.
- kpi : le chiffre clé que la page publie elle-même (champ « kpi » d'un de ses datasets : value, label, et au choix pct,
  parts, color, short), nettoyé (kpi_of) ; le vidéoprojecteur de la salle de réunion le montre en mode TV. Sans : null.
- tv : la page est projetée en mode TV (liste « tv » du dataset pagelist, réglée depuis la fenêtre Mes pages Kronn).
- feeds : les workflows actifs qui publient dans la page (Kronn, GET /pages/{id}/workflows), pour « ↻ Rafraîchir » de la
  fenêtre : [{wf, name, trigger, ai, via, last}] ; un sous-workflow (lancé par un autre, jamais seul) est remplacé par
  ceux qui le lancent (via = son nom) ; ai : une étape Agent (dans le sous-workflow compris) ; last : {status, at} du
  dernier run. La page ne propose le bouton que pour ceux de sa liste des relançables (dataset gates, relaunch.py).
- Une page supprimée ou illisible est sautée. Sortie bornée sous 90 Ko (les images en trop sont retirées).
- warnings (#8) : page sautée, capture ratée (carte sans image) ; écrits aussi sur stderr (run Kronn).
"""
import base64, glob, html, json, os, re, shutil, signal, subprocess, sys, tempfile, time
from datetime import datetime
from _lib import CFG, TZ, dumps, get, jpeg, read_json, write_json, write_text, read_bytes

CACHE = os.path.expanduser("~/.cache/pixel-bureau/thumbs")
CHROMES = ("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
           "/Applications/Chromium.app/Contents/MacOS/Chromium", "google-chrome", "chromium", "chromium-browser")
W, H, MAX_OUT = 1280, 800, 90_000
warnings = []


def warn(msg):
    print("écran du boss : " + msg, file=sys.stderr)
    warnings.append(msg)


def chrome():
    if CFG.get("chrome") is False:  # captures désactivées (tests, machine sans navigateur)
        return None
    for c in [CFG.get("chrome")] + list(CHROMES):
        if c and (os.path.isfile(c) or shutil.which(c)):
            return c
    return None


def runtime_data(d):
    """Les données telles que Kronn les passe à une page (KronnPageData)."""
    return {"version": 1, "page": {"id": d["id"], "slug": d.get("slug"), "title": d.get("title"), "data_revision": d.get("data_revision")},
            "datasets": {x["name"]: {"kind": x.get("kind"), "current": x.get("current"),
                                     "points": [{"observed_at": p.get("observed_at"), "value": p.get("payload")} for p in x.get("points") or []]}
                         for x in d.get("datasets") or []}}


def capture(d, exe):
    """Capture JPEG 320x200 de la page, en data URI ; None (et un avertissement) si Chrome ou la réduction échouent."""
    html = (d.get("revision") or {}).get("html") or ""
    boot = ("<script>window.KronnPageData=" + json.dumps(runtime_data(d)).replace("</", "<\\/") +
            ";addEventListener('load',()=>dispatchEvent(new CustomEvent('kronn:page-data',{detail:window.KronnPageData})));</script>")
    i = html.lower().find("<head>")
    html = html[:i + 6] + boot + html[i + 6:] if i >= 0 else boot + html
    tmp = tempfile.mkdtemp(prefix="bureau-thumb-")
    try:
        page, png, jpg = (os.path.join(tmp, n) for n in ("page.html", "shot.png", "shot.jpg"))
        write_text(page, html)
        # Chrome ne rendait pas la main après --screenshot (processus auxiliaires) : on guette l'image, puis on arrête le
        # groupe ; les versions récentes sortent seules, et macOS refuse alors le signal (EPERM, pas ESRCH)
        p = subprocess.Popen([exe, "--headless=new", "--disable-gpu", "--mute-audio", "--no-first-run", "--hide-scrollbars",
                              "--user-data-dir=" + os.path.join(tmp, "profile"), f"--window-size={W},{H}",
                              "--virtual-time-budget=3000", "--screenshot=" + png, "file://" + page],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        t0, last = time.time(), -1
        while time.time() - t0 < 25:
            time.sleep(0.3)
            size = os.path.getsize(png) if os.path.exists(png) else -1
            if size > 0 and size == last:
                break
            last = size
        try:
            os.killpg(p.pid, signal.SIGTERM)
        except OSError:  # groupe déjà parti (ProcessLookupError) ou réduit à un zombie (PermissionError sur macOS)
            pass
        p.wait(timeout=10)
        if not os.path.exists(png):
            raise RuntimeError("Chrome n'a pas rendu d'image")
        if not jpeg(png, jpg, size=(320, 200), quality=55):
            raise RuntimeError("réduction en JPEG impossible (ni Pillow ni sips)")
        return "data:image/jpeg;base64," + base64.b64encode(read_bytes(jpg)).decode()
    except Exception as e:
        warn(f"miniature de « {str(d.get('title') or d['id'][:8])[:40]} » non faite ({str(e)[:120] or type(e).__name__})")
        return None
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def thumb(d, exe):
    """La miniature en cache tant que la page n'a pas changé, sinon une nouvelle capture."""
    key = f"{d.get('current_revision_id')}:{d.get('data_revision')}"
    path = os.path.join(CACHE, d["id"] + ".json")
    try:
        c = read_json(path)
        if c.get("key") == key and c.get("img"):
            return c["img"]
    except Exception:
        pass  # cache absent ou illisible : nouvelle capture, rien de faux n'est publié
    img = capture(d, exe) if exe else None
    if img:
        os.makedirs(CACHE, exist_ok=True)
        write_json(path, {"key": key, "img": img})
    return img


def title(d):
    """Titre affichable : certaines pages Kronn ont un titre déjà échappé (« Fastly &amp; CloudWatch »), décodé ici
    (la page l'échappe elle-même à l'affichage)."""
    return html.unescape(str(d.get("title") or d.get("slug") or d["id"][:8]))


HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def kpi_of(d):
    """Le premier champ « kpi » valide des datasets de la page : value et label (textes) obligatoires ; pct (0 à 100) ou
    parts ([[nombre, "#rrggbb"]…], 6 au plus) pour la barre, color, short (titre court sur la toile). Rien d'autre."""
    for ds in d.get("datasets") or []:
        c = ds.get("current")
        try:
            c = json.loads(c) if isinstance(c, str) else c
        except ValueError:
            continue
        k = c.get("kpi") if isinstance(c, dict) else None
        if not isinstance(k, dict) or not isinstance(k.get("value"), (str, int, float)) or not isinstance(k.get("label"), str):
            continue
        out = {"value": str(k["value"])[:16], "label": k["label"][:40]}
        if isinstance(k.get("short"), str) and k["short"].strip():
            out["short"] = k["short"].strip()[:18]
        if isinstance(k.get("pct"), (int, float)) and not isinstance(k.get("pct"), bool):
            out["pct"] = max(0.0, min(100.0, float(k["pct"])))
        parts = [[float(n), col] for n, col in (p for p in k.get("parts") or [] if isinstance(p, list) and len(p) == 2)
                 if isinstance(n, (int, float)) and not isinstance(n, bool) and n >= 0 and isinstance(col, str) and HEX.match(col)][:6]
        if parts and sum(n for n, _ in parts) > 0:
            out["parts"] = parts
        if isinstance(k.get("color"), str) and HEX.match(k["color"]):
            out["color"] = k["color"]
        return out
    return None


TV = set()


WFS, DEFS = {}, {}  # workflows de Kronn (liste) et leurs définitions, lues une fois par passage


def definition(wid):
    if wid not in DEFS:
        try:
            DEFS[wid] = get(f"/workflows/{wid}") or {}
        except Exception:
            DEFS[wid] = {}
    return DEFS[wid]


def has_agent(d):
    return any((s.get("step_type") or {}).get("type") == "Agent" for s in d.get("steps") or [])


def parents_of(wid):
    """Workflows actifs qui lancent ce sous-workflow (une étape sub_workflow_id), définitions lues à la demande."""
    return [w for w in WFS.values() if w.get("enabled") and w["id"] != wid
            and any(s.get("sub_workflow_id") == wid for s in definition(w["id"]).get("steps") or [])]


def feed(w, via=None, ai=False):
    lr = w.get("last_run") or {}
    return {"wf": w["id"], "name": str(w.get("name") or "")[:80], "trigger": w.get("trigger_type") or "manual",
            "ai": ai or has_agent(definition(w["id"])), "via": via,
            "last": {"status": lr.get("status"), "at": lr.get("finished_at") or lr.get("started_at")} if lr else None}


def feeds(pid):
    """Workflows à relancer pour rafraîchir la page : ceux qui y publient, les parents à la place d'un sous-workflow."""
    try:
        links = [x for x in get(f"/pages/{pid}/workflows") or [] if x.get("enabled", True)]
    except Exception as e:
        warn(f"workflows de la page {pid[:8]} illisibles : pas de « ↻ Rafraîchir » ({str(e)[:120] or type(e).__name__})")
        return []
    if links and not WFS:
        WFS.update({w["id"]: w for w in get("/workflows") or [] if w.get("id")})
    out = {}
    for x in links:
        w = WFS.get(x["id"]) or {"id": x["id"], "name": x.get("name"), "enabled": True}
        ups = parents_of(w["id"]) if w.get("trigger_type") == "manual" else []
        for f in ([feed(u, via=w.get("name"), ai=has_agent(definition(w["id"]))) for u in ups] if ups else [feed(w)]):
            out.setdefault(f["wf"], f)
    return list(out.values())[:6]


def chosen():
    """La liste rangée par la page (dataset pagelist), sinon boss_pages ; TV : ses pages projetées en mode TV."""
    try:
        for d in get(f"/pages/{CFG['page_id']}").get("datasets") or []:
            if d.get("name") == "pagelist" and d.get("current"):
                c = d["current"] if isinstance(d["current"], dict) else json.loads(d["current"])
                if isinstance(c.get("pages"), list):
                    TV.update(x for x in c.get("tv") or [] if isinstance(x, str))
                    return [x for x in c["pages"] if isinstance(x, str) and x]
    except Exception as e:
        warn(f"liste de l'écran illisible, reprise de boss_pages ({str(e)[:120] or type(e).__name__})")
    return [x for x in CFG.get("boss_pages") or [] if isinstance(x, str) and x]


ids = chosen() if CFG.get("page_id") else [x for x in CFG.get("boss_pages") or [] if isinstance(x, str) and x]
try:
    choices = [{"id": p["id"], "title": title(p)[:80]}
               for p in get("/pages") or [] if p.get("id") and p["id"] != CFG.get("page_id")][:80]
except Exception as e:
    choices = []
    warn(f"liste des pages Kronn illisible : « + Ajouter » sans choix ({str(e)[:120] or type(e).__name__})")
exe = chrome()
pages = []
for pid in ids:
    try:
        d = get(f"/pages/{pid}")
    except Exception as e:  # page supprimée ou Kronn injoignable : on passe, et on le dit
        warn(f"page {pid[:8]} sautée, supprimée ou illisible ({str(e)[:120] or type(e).__name__})")
        continue
    pages.append({"id": d["id"], "title": title(d),
                  "updated": d.get("last_published_at") or d.get("updated_at"), "img": thumb(d, exe),
                  "kpi": kpi_of(d), "tv": d["id"] in TV, "feeds": feeds(d["id"])})
# caches des pages retirées de la liste
for f in glob.glob(os.path.join(CACHE, "*.json")):
    if os.path.basename(f)[:-5] not in ids:
        os.remove(f)
out = {"generated_at": datetime.now(TZ).isoformat(), "pages": pages, "choices": choices, "warnings": warnings}
dropped = 0
for p in reversed(pages):  # sortie Exec tronquée à 100 Ko : les dernières images sautent d'abord
    if len(dumps(out)) <= MAX_OUT:
        break
    dropped += bool(p["img"])
    p["img"] = None
if dropped:
    warn(f"{dropped} miniature{'s' if dropped > 1 else ''} retirée{'s' if dropped > 1 else ''} : sortie limitée à 90 Ko")
print(dumps(out))
