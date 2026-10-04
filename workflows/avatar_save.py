"""Enregistre la personnalisation d'un avatar du Bureau pour toute l'équipe.

Entrée (stdin) : le code copié depuis la page, « BUREAU1:<base64 de {k, n, l, at}> »
  k  : clé du personnage (ex. p_pam)
  n  : nom affiché ("" ou null = nom d'origine)
  l  : apparence {sex, skin, hair, ...} (null = apparence d'origine)
  at : horodatage de la modification (ms), pour que la page départage local et équipe
Sortie (stdout) : le dataset `avatars` complet {updated_at, avatars{k: {name?, look?, at}}}, lu puis fusionné.
Tout ce qui ne passe pas la validation fait échouer le run (rien n'est publié).
"""
import base64, json, re, sys, urllib.request
from datetime import datetime, timezone
from _lib import CFG, dumps

PAGE = f"{CFG['kronn']['api']}/pages/{CFG['page_id']}"
KEY = re.compile(r"^[a-z0-9_]{1,40}$")
WORD = re.compile(r"^[a-z0-9_/]{1,40}$")
COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
COLORS = {"hair_color", "shirt", "legs_color", "shoes", "hat_color"}
WORDS = {"sex", "skin", "head", "hair", "beard", "torso", "legs", "hat", "glasses"}


def fail(msg):
    print("Code avatar refusé : " + msg, file=sys.stderr)
    sys.exit(1)


raw = sys.stdin.read().strip()
m = re.search(r"BUREAU1:([A-Za-z0-9+/=_-]+)", raw)
if not m:
    fail("colle le code complet copié depuis la page (il commence par BUREAU1:)")
try:
    b64 = m.group(1).replace("-", "+").replace("_", "/")
    req = json.loads(base64.b64decode(b64 + "=" * (-len(b64) % 4)).decode("utf-8"))
except Exception:
    fail("code illisible, recopie-le depuis la page")

k = req.get("k")
if not isinstance(k, str) or not KEY.match(k):
    fail("personnage inconnu")
entry = {"at": int(req.get("at") or 0)}

name = req.get("n")
if name:
    name = re.sub(r"[\x00-\x1f\x7f<>]", "", str(name)).strip()[:24]
    if name:
        entry["name"] = name

look = req.get("l")
if look is not None:
    if not isinstance(look, dict) or len(look) > 20:
        fail("apparence invalide")
    clean = {}
    for a, v in look.items():
        if v in (None, ""):
            continue
        if a in COLORS and isinstance(v, str) and COLOR.match(v):
            clean[a] = v.lower()
        elif a in WORDS and isinstance(v, str) and WORD.match(v):
            clean[a] = v
        else:
            fail(f"champ {a!r} invalide")
    if clean:
        entry["look"] = clean

with urllib.request.urlopen(PAGE, timeout=30) as r:
    page = json.load(r)["data"]
cur = {}
for d in page.get("datasets") or []:
    if d.get("name") == "avatars" and d.get("current"):
        try:
            cur = d["current"] if isinstance(d["current"], dict) else json.loads(d["current"])
        except Exception:
            cur = {}
avatars = dict(cur.get("avatars") or {})

if "name" in entry or "look" in entry:
    avatars[k] = entry
else:
    avatars.pop(k, None)  # retour à l'original
if len(avatars) > 80:
    fail("trop d'avatars personnalisés")

print(dumps({"updated_at": datetime.now(timezone.utc).isoformat(), "avatars": avatars}))
print(f"{k} : " + ("enregistré" if k in avatars else "remis à l'original"), file=sys.stderr)
