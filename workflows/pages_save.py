"""Ajoute ou retire une page de l'écran mural « Mes pages Kronn » de la salle de réunion, depuis la page (#61).

Entrée (stdin) : le code copié depuis la page, « PAGES1:<base64 de {op, id, at}> »
  op : "add" (en dernier) ou "remove"
  id : id (uuid) de la page Kronn ; à l'ajout, elle doit exister et ne pas être la page du Bureau
  at : horodatage (ms) de la demande
Sortie (stdout) : le dataset `pagelist` complet {updated_at, pages[id], warnings[texte]}, dans l'ordre de l'écran.
Liste de départ : le dataset en place, sinon la clé boss_pages de la config (l'installation). La miniature d'une page
ajoutée arrive au passage suivant du cron fiche de paie (pages_snapshot.py lit cette liste).
Tout ce qui ne passe pas la validation fait échouer le run (rien n'est publié).
warnings (#8) : dataset en place illisible, repris de boss_pages ; aussi sur stderr.
"""
import base64, json, re, sys
from datetime import datetime, timezone
from _lib import CFG, dumps, get

UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
MAX_PAGES = 12


def fail(msg):
    print("Code page refusé : " + msg, file=sys.stderr)
    sys.exit(1)


raw = sys.stdin.read().strip()
m = re.search(r"PAGES1:([A-Za-z0-9+/=_-]+)", raw)
if not m:
    fail("colle le code complet copié depuis la page (il commence par PAGES1:)")
try:
    b64 = m.group(1).replace("-", "+").replace("_", "/")
    req = json.loads(base64.b64decode(b64 + "=" * (-len(b64) % 4)).decode("utf-8"))
except Exception:
    fail("code illisible, recopie-le depuis la page")
if not isinstance(req, dict) or req.get("op") not in ("add", "remove"):
    fail("opération inconnue")
pid, op = req.get("id"), req["op"]
if not isinstance(pid, str) or not UUID.match(pid):
    fail("id de page invalide")

page = get(f"/pages/{CFG['page_id']}")
cur, warnings = None, []
for d in page.get("datasets") or []:
    if d.get("name") == "pagelist" and d.get("current"):
        try:
            c = d["current"] if isinstance(d["current"], dict) else json.loads(d["current"])
            cur = [x for x in c.get("pages") or [] if isinstance(x, str) and UUID.match(x)]
        except Exception as e:
            warnings.append(f"liste en place illisible, reprise de boss_pages ({str(e)[:120] or type(e).__name__})")
            print("pages : " + warnings[-1], file=sys.stderr)
pages = cur if cur is not None else [x for x in CFG.get("boss_pages") or [] if isinstance(x, str) and UUID.match(x)]

if op == "add":
    if pid == CFG["page_id"]:
        fail("c'est la page du Bureau elle-même")
    try:
        get(f"/pages/{pid}")
    except Exception:
        fail("cette page Kronn n'existe pas (ou plus)")
    if pid not in pages:
        pages.append(pid)
else:
    pages = [x for x in pages if x != pid]
if len(pages) > MAX_PAGES:
    fail(f"trop de pages sur l'écran (au plus {MAX_PAGES})")

print(dumps({"updated_at": datetime.now(timezone.utc).isoformat(), "pages": pages, "warnings": warnings}))
print(f"{pid[:8]} : " + ("ajoutée" if pid in pages else "retirée"), file=sys.stderr)
