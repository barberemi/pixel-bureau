"""Pages Kronn du boss (bureau.config.json, clé boss_pages) pour l'écran du bureau du boss : titre, mise à jour, miniature.

Sortie (stdout) : {generated_at, pages[{id, title, updated, img}]}, dans l'ordre de boss_pages.
- img : capture JPEG 320x200 en data URI, ou null. Refaite seulement quand la page change (révision du HTML ou des
  données), sinon reprise du cache ~/.cache/kronn-bureau/thumbs/<id>.json.
- Capture : le HTML de la page et ses datasets dans un fichier local (window.KronnPageData, comme dans Kronn),
  photographié par Chrome headless, puis réduit par sips (macOS). Ni Chrome ni sips : cartes sans image.
- Une page supprimée ou illisible est sautée. Sortie bornée sous 90 Ko (les images en trop sont retirées).
"""
import base64, glob, json, os, shutil, signal, subprocess, tempfile, time
from datetime import datetime
from _lib import CFG, TZ, dumps, get

CACHE = os.path.expanduser("~/.cache/kronn-bureau/thumbs")
CHROMES = ("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
           "/Applications/Chromium.app/Contents/MacOS/Chromium", "google-chrome", "chromium", "chromium-browser")
W, H, MAX_OUT = 1280, 800, 90_000


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
    """Capture JPEG 320x200 de la page, en data URI ; None si Chrome ou sips échouent."""
    html = (d.get("revision") or {}).get("html") or ""
    boot = ("<script>window.KronnPageData=" + json.dumps(runtime_data(d)).replace("</", "<\\/") +
            ";addEventListener('load',()=>dispatchEvent(new CustomEvent('kronn:page-data',{detail:window.KronnPageData})));</script>")
    i = html.lower().find("<head>")
    html = html[:i + 6] + boot + html[i + 6:] if i >= 0 else boot + html
    tmp = tempfile.mkdtemp(prefix="bureau-thumb-")
    try:
        page, png, jpg = (os.path.join(tmp, n) for n in ("page.html", "shot.png", "shot.jpg"))
        open(page, "w", encoding="utf-8").write(html)
        # Chrome ne rend pas la main après --screenshot (processus auxiliaires) : on guette l'image, puis on arrête le groupe
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
        except ProcessLookupError:
            pass
        p.wait(timeout=10)
        if not os.path.exists(png) or not shutil.which("sips"):
            return None
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "55", "-z", "200", "320", png, "--out", jpg],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
        return "data:image/jpeg;base64," + base64.b64encode(open(jpg, "rb").read()).decode() if os.path.exists(jpg) else None
    except Exception:
        return None
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def thumb(d, exe):
    """La miniature en cache tant que la page n'a pas changé, sinon une nouvelle capture."""
    key = f"{d.get('current_revision_id')}:{d.get('data_revision')}"
    path = os.path.join(CACHE, d["id"] + ".json")
    try:
        c = json.load(open(path))
        if c.get("key") == key and c.get("img"):
            return c["img"]
    except Exception:
        pass
    img = capture(d, exe) if exe else None
    if img:
        os.makedirs(CACHE, exist_ok=True)
        json.dump({"key": key, "img": img}, open(path, "w"))
    return img


ids = [x for x in CFG.get("boss_pages") or [] if isinstance(x, str) and x]
exe = chrome()
pages = []
for pid in ids:
    try:
        d = get(f"/pages/{pid}")
    except Exception:
        continue  # page supprimée ou Kronn injoignable : on passe
    pages.append({"id": d["id"], "title": d.get("title") or d.get("slug") or d["id"][:8],
                  "updated": d.get("last_published_at") or d.get("updated_at"), "img": thumb(d, exe)})
# caches des pages retirées de la liste
for f in glob.glob(os.path.join(CACHE, "*.json")):
    if os.path.basename(f)[:-5] not in ids:
        os.remove(f)
out = {"generated_at": datetime.now(TZ).isoformat(), "pages": pages}
for p in reversed(pages):  # sortie Exec tronquée à 100 Ko : les dernières images sautent d'abord
    if len(dumps(out)) <= MAX_OUT:
        break
    p["img"] = None
print(dumps(out))
