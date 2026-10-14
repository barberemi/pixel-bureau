"""Cartes GitFut (gitfut.com : profil GitHub noté sur 99, façon FIFA Ultimate Team) des personnes qui ont un login
GitHub dans le roster (clé gitfut de la config injectée, {clé du roster: login GitHub}, déduite au rendu), pour leur fiche.

Sortie (stdout) : {generated_at, cards{clé: {login, img, desc}}, posters{page: img}, warnings[texte]}.
- posters : affiches des cartes « Top 3 » (passion.top3.wiki du roster, plus la clé wiki_posters de la config :
  pages de la Wikipédia anglaise, qui les héberge), miniature JPEG ~160 px en data URI, récupérées une fois par jour avec le même cache.
- img : la carte découpée dans l'image de partage gitfut (<login>/opengraph-image, 1200x630, carte à gauche), en JPEG
  data URI ; le fond est retiré par la page. desc : la description de la page (« 79 OVR CDM, Mezzala »).
- Récupérée une fois par jour (cache ~/.cache/pixel-bureau/gitfut/<login>.json) : le cron tourne toutes les heures.
- Images réduites par jpeg() du socle (Pillow, sinon sips). Si gitfut ne répond pas : la personne est sautée.
- warnings (#8) : carte ou affiche non récupérée (site injoignable, image illisible) ; écrits aussi sur stderr (run Kronn).
"""
import base64, html, json, os, re, shutil, sys, tempfile, urllib.parse, urllib.request
from datetime import datetime
from _lib import CFG, TZ, dumps, jpeg, read_json, write_json, read_bytes, write_bytes

BASE = (CFG.get("gitfut_base") or "https://gitfut.com").rstrip("/")
CACHE = os.path.expanduser("~/.cache/pixel-bureau/gitfut")
UA = {"User-Agent": "pixel-bureau (carte GitFut de la fiche)"}
warnings = []


def warn(what, e):
    msg = f"{what} ({str(e)[:120] or type(e).__name__})"
    print("gitfut : " + msg, file=sys.stderr)
    warnings.append(msg)


def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return r.read()


def card(login):
    """{login, img, desc} ; exception si gitfut ne répond pas ou si l'image ne se réduit pas."""
    page = fetch(f"{BASE}/{login}").decode("utf-8", "replace")
    m = re.search(r'<meta name="description" content="([^"]*)"', page)
    desc = html.unescape(m.group(1)) if m else ""
    tmp = tempfile.mkdtemp(prefix="bureau-gitfut-")
    try:
        png, jpg = (os.path.join(tmp, n) for n in ("og.png", "card.jpg"))
        write_bytes(png, fetch(f"{BASE}/{login}/opengraph-image"))
        if not jpeg(png, jpg, crop=(78, 30, 380, 580), fit=300, quality=80):  # la carte, à gauche de l'image
            raise RuntimeError("réduction en JPEG impossible (ni Pillow ni sips)")
        return {"login": login, "img": "data:image/jpeg;base64," + base64.b64encode(read_bytes(jpg)).decode(), "desc": desc}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


today = datetime.now(TZ).strftime("%Y-%m-%d")
cards = {}
for key, login in (CFG.get("gitfut") or {}).items():
    if not isinstance(login, str) or not re.fullmatch(r"[A-Za-z0-9-]{1,39}", login):
        continue
    path = os.path.join(CACHE, login.lower() + ".json")
    try:
        c = read_json(path)
        if c.get("day") == today and c.get("card"):
            cards[key] = c["card"]
            continue
    except Exception:
        pass  # cache absent ou illisible : carte relue sur gitfut
    try:
        got = card(login)
    except Exception as e:
        got = None
        warn(f"carte de {login} non récupérée", e)
    if got:
        os.makedirs(CACHE, exist_ok=True)
        write_json(path, {"day": today, "card": got})
        cards[key] = got
WIKI = (CFG.get("wiki_base") or "https://en.wikipedia.org").rstrip("/")


def poster(page):
    """Miniature de l'image principale d'une page Wikipédia (l'affiche d'un film), en data URI, ou None si la page n'a
    pas d'image (pas une erreur) ; exception si Wikipédia ne répond pas ou si l'image ne se réduit pas."""
    meta = json.loads(fetch(f"{WIKI}/api/rest_v1/page/summary/" + urllib.parse.quote(page, safe="")))
    src = (meta.get("thumbnail") or {}).get("source")
    if not src:
        return None
    tmp = tempfile.mkdtemp(prefix="bureau-poster-")
    try:
        raw, jpg = os.path.join(tmp, "raw"), os.path.join(tmp, "p.jpg")
        write_bytes(raw, fetch(src))
        if not jpeg(raw, jpg, fit=160, quality=70):
            raise RuntimeError("réduction en JPEG impossible (ni Pillow ni sips)")
        return "data:image/jpeg;base64," + base64.b64encode(read_bytes(jpg)).decode()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


posters = {}
for page in CFG.get("wiki_posters") or []:
    if not isinstance(page, str) or not page or len(page) > 200:
        continue
    path = os.path.join(CACHE, "poster-" + re.sub(r"[^A-Za-z0-9_-]", "_", page) + ".json")
    try:
        c = read_json(path)
        if c.get("day") == today and c.get("img"):
            posters[page] = c["img"]
            continue
    except Exception:
        pass  # cache absent ou illisible : affiche relue sur Wikipédia
    try:
        img = poster(page)
    except Exception as e:
        img = None
        warn(f"affiche « {page[:40]} » non récupérée", e)
    if img:
        os.makedirs(CACHE, exist_ok=True)
        write_json(path, {"day": today, "img": img})
        posters[page] = img
print(dumps({"generated_at": datetime.now(TZ).isoformat(), "cards": cards, "posters": posters, "warnings": warnings}))
