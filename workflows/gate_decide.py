"""Décide une gate depuis la page Le Bureau (page action « bureau-gate »).

Arguments : run_id decision [comment]
  run_id : relu par Kronn dans le dataset `gates` (ligne cliquée), jamais saisi ; le workflow et l'étape
           sont retrouvés ici dans ce même dataset (un seul champ automatique dans la carte)
  decision : approve | reject | request_changes (menu de la carte)
Appelle POST /api/workflows/{wf}/runs/{run}/decide avec gate_step : Kronn refuse si le run
n'attend plus CETTE gate (décision périmée), donc rien d'autre ne peut être validé par erreur.
"""
import json, re, sys, urllib.request, urllib.error
from _lib import API, CFG

PAGE = CFG["page_id"]
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
LABEL = {"approve": "approuvée", "reject": "rejetée", "request_changes": "renvoyée avec des changements demandés"}


def fail(msg):
    print(msg, file=sys.stderr)
    sys.exit(1)


args = sys.argv[1:] + [""] * 3
run_id, decision, comment = (a.strip() for a in args[:3])
if not UUID.match(run_id):
    fail("Run invalide : recharge la page.")
with urllib.request.urlopen(f"{API}/pages/{PAGE}", timeout=30) as r:
    datasets = json.load(r)["data"].get("datasets") or []
cur = next((d.get("current") for d in datasets if d.get("name") == "gates"), None) or {}
if isinstance(cur, str):
    cur = json.loads(cur)
row = next((g for g in cur.get("gates") or [] if g.get("run") == run_id), None)
if not row:
    fail("Cette gate n'est plus en attente (déjà décidée ?) : recharge la page.")
wf_id, gate = row["wf"], row["gate"]
if decision not in LABEL:
    fail("Décision inconnue : " + decision)
if decision == "request_changes" and not comment:
    fail("Un commentaire est obligatoire pour demander des changements.")

body = {"decision": decision, "gate_step": gate or None, "comment": comment or None}
req = urllib.request.Request(f"{API}/workflows/{wf_id}/runs/{run_id}/decide", method="POST",
                             headers={"content-type": "application/json"}, data=json.dumps(body).encode())
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        res = json.load(r)
except urllib.error.HTTPError as e:
    fail(f"Kronn a refusé la décision ({e.code}) : {e.read()[:300].decode(errors='replace')}")
if not res.get("success"):
    fail("Kronn a refusé la décision : " + str(res.get("error")))
print(f"Gate « {gate} » {LABEL[decision]}. Nouveau statut du run : {res['data'].get('new_status')}")
