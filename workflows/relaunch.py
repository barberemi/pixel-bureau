"""Relance un workflow depuis la page Le Bureau (page action « bureau-relaunch »).

Arguments : wf_id, relu par Kronn dans le dataset `gates`, jamais saisi ; params (facultatif, « ▶ Lancer… » des fiches
d'agents, #64) : « nom=valeur ; nom=valeur », la ligne copiée par la page puis complétée dans la carte Kronn.
Sans params : le workflow doit être dans la liste `workflows` (relançables sans saisie). Avec params : dans `launchable`,
chaque nom doit être une de ses variables à saisir et chaque variable obligatoire remplie (« … » = pas rempli).
Revérifie aussi qu'aucun run n'est déjà en cours, puis le lance via POST /api/mcp/workflow-trigger (route JSON : crée le
run et rend la main, sans flux SSE).
"""
import json, re, sys, urllib.request, urllib.error
from _lib import ACTIVE, API, CFG, get

PAGE = CFG["page_id"]
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def fail(msg):
    print(msg, file=sys.stderr)
    sys.exit(1)


def parse(text, asked):
    """« nom=valeur ; nom=valeur » (ou une par ligne) -> {nom: valeur}, validé contre les variables à saisir."""
    names = {v["name"]: v for v in asked}
    out = {n: "" for n in names}  # chaque variable passée, même vide (Kronn refuse une variable facultative absente)
    for part in re.split(r"[;\n]", text):
        if not part.strip():
            continue
        k, sep, v = part.partition("=")
        k, v = k.strip(), v.strip()
        if not sep or k not in names:
            fail(f"Paramètre inconnu : « {k or part.strip()[:40]} » (attendus : {', '.join(names)}).")
        if v and v not in ("…", "..."):
            out[k] = v[:4000]
    missing = [n for n, v in names.items() if v.get("required") and not out[n]]
    if missing:
        fail("Paramètre obligatoire à remplir : " + ", ".join(missing) + ".")
    return out


wf_id = (sys.argv[1] if len(sys.argv) > 1 else "").strip()
params = (sys.argv[2] if len(sys.argv) > 2 else "").strip()
if not UUID.match(wf_id):
    fail("Workflow invalide : recharge la page.")
cur = next((d.get("current") for d in get(f"/pages/{PAGE}").get("datasets") or [] if d.get("name") == "gates"), None) or {}
if isinstance(cur, str):
    cur = json.loads(cur)
row = next((w for w in cur.get("launchable" if params else "workflows") or [] if w.get("wf") == wf_id), None)
if not row:
    fail("Ce workflow ne peut pas être " + ("lancé avec ces paramètres" if params else "relancé") + " depuis la page.")
variables = parse(params, row.get("vars") or []) if params else {}
busy = [r for r in get(f"/workflows/{wf_id}/runs?limit=5") if r.get("status") in ACTIVE]
if busy:
    fail(f"« {row['name']} » tourne déjà (run {busy[0]['id'][:8]}, {busy[0]['status']}) : attends qu'il finisse.")

req = urllib.request.Request(f"{API}/mcp/workflow-trigger", method="POST", headers={"content-type": "application/json"},
                             data=json.dumps({"workflow_id": wf_id, "variables": variables}).encode())
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        res = json.load(r)
except urllib.error.HTTPError as e:
    fail(f"Kronn a refusé le lancement ({e.code}) : {e.read()[:300].decode(errors='replace')}")
if not res.get("success"):
    fail("Kronn a refusé le lancement : " + str(res.get("error")))
print(f"« {row['name']} » {'lancé' if params else 'relancé'} : run {res['data']['run_id']}")
