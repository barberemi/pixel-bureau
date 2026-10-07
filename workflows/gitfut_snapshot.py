"""Cartes GitFut (gitfut.com : profil GitHub noté sur 99, façon FIFA Ultimate Team) des personnes qui ont un login
GitHub dans le roster (clé gitfut de la config injectée, {clé du roster: login GitHub}, déduite au rendu), pour leur fiche.

Sortie (stdout) : {generated_at, cards{clé: {login, img, desc}}, posters{page: img}}.
- posters : affiches des cartes « Top 3 » (passion.top3.wiki du roster, plus la clé wiki_posters de la config :
  pages de la Wikipédia anglaise, qui les héberge), miniature JPEG ~160 px en data URI, récupérées une fois par jour avec le même cache.
- img : la carte découpée dans l'image de partage gitfut (<login>/opengraph-image, 1200x630, carte à gauche), en JPEG
  data URI ; le fond est retiré par la page. desc : la description de la page (« 79 OVR CDM, Mezzala »).
- Récupérée une fois par jour (cache ~/.cache/kronn-bureau/gitfut/<login>.json) : le cron tourne toutes les heures.
- Images réduites par jpeg() du socle (Pillow, sinon sips). Si gitfut ne répond pas : la personne est sautée.
"""
import base64, html, json, os, re, shutil, tempfile, urllib.parse, urllib.request
from datetime import datetime
from _lib import CFG, TZ, dumps, jpeg

BASE = (CFG.get("gitfut_base") or "https://gitfut.com").rstrip("/")
CACHE = os.path.expanduser("~/.cache/kronn-bureau/gitfut")
UA = {"User-Agent": "kronn-bureau (carte GitFut de la fiche)"}


def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return r.read()


def card(login):
    """{login, img, desc} ou None."""
    page = fetch(f"{BASE}/{login}").decode("utf-8", "replace")
    m = re.search(r'<meta name="description" content="([^"]*)"', page)
    desc = html.unescape(m.group(1)) if m else ""
    tmp = tempfile.mkdtemp(prefix="bureau-gitfut-")
    try:
        png, jpg = (os.path.join(tmp, n) for n in ("og.png", "card.jpg"))
        open(png, "wb").write(fetch(f"{BASE}/{login}/opengraph-image"))
        if not jpeg(png, jpg, crop=(78, 30, 380, 580), fit=300, quality=80):  # la carte, à gauche de l'image
            return None
        return {"login": login, "img": "data:image/jpeg;base64," + base64.b64encode(open(jpg, "rb").read()).decode(), "desc": desc}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


today = datetime.now(TZ).strftime("%Y-%m-%d")
cards = {}
for key, login in (CFG.get("gitfut") or {}).items():
    if not isinstance(login, str) or not re.fullmatch(r"[A-Za-z0-9-]{1,39}", login):
        continue
    path = os.path.join(CACHE, login.lower() + ".json")
    try:
        c = json.load(open(path))
        if c.get("day") == today and c.get("card"):
            cards[key] = c["card"]
            continue
    except Exception:
        pass
    try:
        got = card(login)
    except Exception:
        got = None
    if got:
        os.makedirs(CACHE, exist_ok=True)
        json.dump({"day": today, "card": got}, open(path, "w"))
        cards[key] = got
WIKI = (CFG.get("wiki_base") or "https://en.wikipedia.org").rstrip("/")


def poster(page):
    """Miniature de l'image principale d'une page Wikipédia (l'affiche d'un film), en data URI, ou None."""
    meta = json.loads(fetch(f"{WIKI}/api/rest_v1/page/summary/" + urllib.parse.quote(page, safe="")))
    src = (meta.get("thumbnail") or {}).get("source")
    if not src:
        return None
    tmp = tempfile.mkdtemp(prefix="bureau-poster-")
    try:
        raw, jpg = os.path.join(tmp, "raw"), os.path.join(tmp, "p.jpg")
        open(raw, "wb").write(fetch(src))
        if not jpeg(raw, jpg, fit=160, quality=70):
            return None
        return "data:image/jpeg;base64," + base64.b64encode(open(jpg, "rb").read()).decode()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


posters = {}
for page in CFG.get("wiki_posters") or []:
    if not isinstance(page, str) or not page or len(page) > 200:
        continue
    path = os.path.join(CACHE, "poster-" + re.sub(r"[^A-Za-z0-9_-]", "_", page) + ".json")
    try:
        c = json.load(open(path))
        if c.get("day") == today and c.get("img"):
            posters[page] = c["img"]
            continue
    except Exception:
        pass
    try:
        img = poster(page)
    except Exception:
        img = None
    if img:
        os.makedirs(CACHE, exist_ok=True)
        json.dump({"day": today, "img": img}, open(path, "w"))
        posters[page] = img
print(dumps({"generated_at": datetime.now(TZ).isoformat(), "cards": cards, "posters": posters}))
