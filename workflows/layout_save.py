"""Propose un plan de bureau pour toute l'équipe (workflow « Le Bureau · plan », avant la validation du boss).

Entrée (stdin) : le plan, JSON au format bureau-layout/1 (un bloc ```json autour est accepté), ou le mot « defaut »
pour revenir au plan embarqué dans la page.
Sortie (stdout) : le dataset `layout` complet {updated_at, layout} (layout null = plan embarqué).
Sortie d'erreur : le résumé lu par le boss dans la gate (nom, taille, sièges, places qui changent), ou les erreurs.
Un plan qui ne passe pas les règles de tools/plan.py check fait échouer le run : rien n'est publié.
"""
import json, re, sys, urllib.request
from datetime import datetime, timezone
from _lib import CFG, dumps
from _plan import MAX_BYTES, seats_of, validate

PAGE = f"{CFG['kronn']['api']}/pages/{CFG['page_id']}"


def fail(msg):
    print("Plan refusé : " + msg, file=sys.stderr)
    sys.exit(1)


raw = sys.stdin.read().strip()
raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw)
if raw.lower() in ("defaut", "défaut", "default"):
    print(dumps({"updated_at": datetime.now(timezone.utc).isoformat(), "layout": None}))
    print("Retour au plan embarqué dans la page.", file=sys.stderr)
    sys.exit(0)
if len(raw.encode()) > MAX_BYTES:
    fail(f"{len(raw.encode()) // 1024} Ko, 64 Ko au plus")
try:
    L = json.loads(raw)
except ValueError as e:
    fail(f"JSON illisible ({e})")
if not isinstance(L, dict):
    fail("un objet JSON bureau-layout/1 est attendu")
err, warn = validate(L, len(raw.encode()))
if err:
    fail(f"{len(err)} erreur(s)\n- " + "\n- ".join(err[:20]))

# plan partagé actuel : pour dire au boss qui change de place
with urllib.request.urlopen(PAGE, timeout=30) as r:
    page = json.load(r)["data"]
cur = next((d.get("current") for d in page.get("datasets") or [] if d.get("name") == "layout"), None)
if isinstance(cur, str):
    cur = json.loads(cur or "null")
before = ((cur or {}).get("layout") or {}).get("seating") or {}
after = L.get("seating") or {}
b, a = ({k: s for s, k in seating.items()} for seating in (before, after))  # clé -> siège
moves = sorted(k for k in set(a) | set(b) if a.get(k) != b.get(k))

print(dumps({"updated_at": datetime.now(timezone.utc).isoformat(), "layout": L}))
lines = [f"Nouveau plan : {L.get('name') or L.get('id') or 'sans nom'} ({L['size'][0]} x {L['size'][1]} cases, "
         f"{len(seats_of(L))} sièges, {len(after)} places attribuées)."]
if cur and cur.get("layout"):
    lines.append("Places qui changent : " + (", ".join(f"{k} {b.get(k, '-')} → {a.get(k, 'auto')}" for k in moves[:20]) or "aucune") + ".")
else:
    lines.append("Il remplace le plan embarqué dans la page.")
lines += [f"Avertissement : {w}" for w in warn[:5]]
print("\n".join(lines), file=sys.stderr)
