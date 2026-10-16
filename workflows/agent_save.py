"""Ajoute, renomme ou retire un agent du Bureau créé depuis la page (« + » d'une baie de la salle Serveurs, #64).

Entrée (stdin) : le code copié depuis la page, « AGENT1:<base64 de {op, k, n, r, wf, seat, sp, l, at}> »
  op   : "add" (ajout ou modification) ou "remove"
  k    : clé de l'agent, toujours « a_… » (jamais celle d'une personne, d'un invité ni d'un agent de la config)
  n    : prénom ; r : métier affiché sur sa fiche
  wf   : préfixes (8 caractères) des workflows qu'il incarne
  seat : son siège sur le plan (numéro, ex. « I4.L1 »), ou null (la page lui en donne un libre)
  sp   : recette d'avatar de départ (clé de cast.json), ou null
  l    : apparence {sex, skin, hair, ...}, ou null
  at   : horodatage (ms) de la demande
Sortie (stdout) : le dataset `agents` complet {updated_at, agents{k: {name, role, wf, seat, sprite?, look?, at}}, warnings[texte]}.
Tout ce qui ne passe pas la validation fait échouer le run (rien n'est publié).
warnings (#8) : dataset en place illisible, repris de zéro (les autres agents ajoutés sont perdus) ; aussi sur stderr.
"""
import base64, json, re, sys, urllib.request
from datetime import datetime, timezone
from _lib import CFG, clean_look, dumps

PAGE = f"{CFG['kronn']['api']}/pages/{CFG['page_id']}"
KEY = re.compile(r"^a_[a-z0-9_]{1,30}$")
WF = re.compile(r"^[A-Za-z0-9-]{8}$")
SPRITE = re.compile(r"^[a-z0-9_]{1,40}$")
SEAT = re.compile(r"^[A-Za-z0-9._-]{1,16}$")
MAX_AGENTS = 30


def fail(msg):
    print("Code agent refusé : " + msg, file=sys.stderr)
    sys.exit(1)


def text(v, size):
    return re.sub(r"[\x00-\x1f\x7f<>]", "", str(v or "")).strip()[:size]


raw = sys.stdin.read().strip()
m = re.search(r"AGENT1:([A-Za-z0-9+/=_-]+)", raw)
if not m:
    fail("colle le code complet copié depuis la page (il commence par AGENT1:)")
try:
    b64 = m.group(1).replace("-", "+").replace("_", "/")
    req = json.loads(base64.b64decode(b64 + "=" * (-len(b64) % 4)).decode("utf-8"))
except Exception:
    fail("code illisible, recopie-le depuis la page")
if not isinstance(req, dict):
    fail("code illisible, recopie-le depuis la page")

k, op = req.get("k"), req.get("op")
if not isinstance(k, str) or not KEY.match(k):
    fail("clé d'agent invalide")
if op not in ("add", "remove"):
    fail("opération inconnue")
entry = None
if op == "add":
    name = text(req.get("n"), 24)
    if not name:
        fail("prénom manquant")
    wf = req.get("wf")
    if not isinstance(wf, list) or not 1 <= len(wf) <= 10 or not all(isinstance(w, str) and WF.match(w) for w in wf):
        fail("workflows invalides (1 à 10 préfixes de 8 caractères)")
    seat = req.get("seat")
    if seat is not None and not (isinstance(seat, str) and SEAT.match(seat)):
        fail("place invalide")
    entry = {"name": name, "role": text(req.get("r"), 60), "wf": list(dict.fromkeys(wf)), "seat": seat,
             "at": int(req.get("at") or 0)}
    sp = req.get("sp")
    if sp:
        if not isinstance(sp, str) or not SPRITE.match(sp):
            fail("avatar de départ invalide")
        entry["sprite"] = sp
    if req.get("l") is not None:
        try:
            look = clean_look(req["l"])
        except ValueError as e:
            fail(str(e))
        if look:
            entry["look"] = look

with urllib.request.urlopen(PAGE, timeout=30) as r:
    page = json.load(r)["data"]
cur, warnings = {}, []
for d in page.get("datasets") or []:
    if d.get("name") == "agents" and d.get("current"):
        try:
            cur = d["current"] if isinstance(d["current"], dict) else json.loads(d["current"])
        except Exception as e:
            cur = {}
            warnings.append(f"agents en place illisibles, repris de zéro ({str(e)[:120] or type(e).__name__})")
            print("agents : " + warnings[-1], file=sys.stderr)
agents = dict(cur.get("agents") or {}) if isinstance(cur, dict) else {}

if entry:
    agents[k] = entry
else:
    agents.pop(k, None)
if len(agents) > MAX_AGENTS:
    fail(f"trop d'agents ajoutés (au plus {MAX_AGENTS})")

print(dumps({"updated_at": datetime.now(timezone.utc).isoformat(), "agents": agents, "warnings": warnings}))
print(f"{k} : " + ("enregistré" if k in agents else "retiré"), file=sys.stderr)
