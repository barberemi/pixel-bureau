"""Relance un workflow depuis la page Le Bureau (page action « bureau-relaunch »).

Argument : wf_id, relu par Kronn dans le dataset `gates` (liste `workflows` = relançables), jamais saisi.
Revérifie ici que le workflow est toujours dans cette liste et qu'aucun run n'est déjà en cours, puis le lance
via POST /api/mcp/workflow-trigger (route JSON : crée le run et rend la main, sans flux SSE).
"""
import json, re, sys, urllib.request, urllib.error
# config d'installation : injectée par tools/publish.py (étape Kronn « python3 -c ») ; en local, lue dans bureau.config.json
import os as _os
_CFG = r"""__BUREAU_CONFIG__"""
CFG = json.loads(_CFG) if not _CFG.startswith("__") else json.load(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), _os.pardir, "bureau.config.json")))

API = CFG["kronn"]["api"]
PAGE = CFG["page_id"]
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def fail(msg):
    print(msg, file=sys.stderr)
    sys.exit(1)


def get(path):
    with urllib.request.urlopen(API + path, timeout=30) as r:
        return json.load(r)["data"]


wf_id = (sys.argv[1] if len(sys.argv) > 1 else "").strip()
if not UUID.match(wf_id):
    fail("Workflow invalide : recharge la page.")
cur = next((d.get("current") for d in get(f"/pages/{PAGE}").get("datasets") or [] if d.get("name") == "gates"), None) or {}
if isinstance(cur, str):
    cur = json.loads(cur)
row = next((w for w in cur.get("workflows") or [] if w.get("wf") == wf_id), None)
if not row:
    fail("Ce workflow ne peut pas être relancé depuis la page.")
busy = [r for r in get(f"/workflows/{wf_id}/runs?limit=5") if r.get("status") in ("Running", "Pending", "WaitingApproval")]
if busy:
    fail(f"« {row['name']} » tourne déjà (run {busy[0]['id'][:8]}, {busy[0]['status']}) : attends qu'il finisse.")

req = urllib.request.Request(f"{API}/mcp/workflow-trigger", method="POST", headers={"content-type": "application/json"},
                             data=json.dumps({"workflow_id": wf_id, "variables": {}}).encode())
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        res = json.load(r)
except urllib.error.HTTPError as e:
    fail(f"Kronn a refusé le lancement ({e.code}) : {e.read()[:300].decode(errors='replace')}")
if not res.get("success"):
    fail("Kronn a refusé le lancement : " + str(res.get("error")))
print(f"« {row['name']} » relancé : run {res['data']['run_id']}")
