"""Publie dans Kronn (API locale) : la page et/ou les scripts des workflows du Bureau.

  python3 tools/publish.py page        # assemble la page (sans démo) et la pousse dans la page Le Bureau
  python3 tools/publish.py workflows   # pousse le rendu des modèles (workflows/templates) : étapes, scripts, crons, QP
  python3 tools/publish.py all
"""
import json, os, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = json.load(open(os.path.join(ROOT, "bureau.config.json")))
API = CFG["kronn"]["api"].rstrip("/")
PAGE_ID = CFG["page_id"]
sys.path.insert(0, os.path.join(ROOT, "tools"))
import templates  # noqa: E402  (modèles des workflows : workflows/templates/*.json)


def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, headers={"content-type": "application/json"},
                                 data=json.dumps(body).encode() if body is not None else None)
    return json.load(urllib.request.urlopen(req, timeout=60))


def page():
    sys.path.insert(0, os.path.join(ROOT, "tools"))
    import assemble, plan
    err, _ = plan.validate(*plan.load(os.path.join(ROOT, assemble.layout_path(CFG))))
    if err:  # un plan cassé ferait disparaître des personnages ou bloquerait des chemins : on ne publie pas
        sys.exit(f"plan invalide ({len(err)} erreur(s)) : python3 tools/plan.py check")
    html = assemble.build(demo=False)  # sans les instantanés de démo : une page vide attend ses propres données
    print("page", call("PUT", f"/pages/{PAGE_ID}/html", {"html": html}).get("success"))


def workflows():
    """Pousse dans Kronn le rendu de chaque modèle (workflows/templates) avec bureau.config.json.
    Les modèles sont la source : étapes, scripts (config injectée), déclencheur et programmes autorisés.
    Les ids des étapes existantes sont gardés (retrouvés par leur nom)."""
    for key, tpl in templates.load_templates().items():
        kind, where, _ = templates.TEMPLATES[key]
        ident = templates.config_id(CFG, where)
        if not ident and kind == "workflow" and not (key == "comment" and not (CFG.get("jira") or {}).get("config_id")):
            # workflow du Bureau ajouté depuis l'installation (ex. commenter un ticket) : créé, son id rangé dans la config
            ident = call("POST", "/workflows", templates.render(tpl, CFG))["data"]["id"]
            CFG.setdefault(where[0], {})[where[1]] = ident
            json.dump(CFG, open(os.path.join(ROOT, "bureau.config.json"), "w"), ensure_ascii=False, indent=1)
            print(f"{key} ({ident[:8]}) créé")
            continue
        if not ident:
            print(key, ": pas installé (aucun id dans la config) : relance python3 tools/install.py, qui l'ajoute sans doublon")
            continue
        if ident in (CFG.get("own") or []):
            print(f"{key} ({ident[:8]}) : gardé tel quel (branché à l'installation), non publié")
            continue
        body = templates.render(tpl, CFG)
        if kind == "workflow":
            live = call("GET", f"/workflows/{ident}")["data"]
            ids = {st["name"]: st["id"] for st in live["steps"]}
            for st in body["steps"]:
                if st["name"] in ids:
                    st["id"] = ids[st["name"]]
            ok = call("PUT", f"/workflows/{ident}", body).get("success")
        else:
            ok = call("PUT", f"/quick-prompts/{ident}", body).get("success")
        print(f"{key} ({ident[:8]})", ok)


what = sys.argv[1] if len(sys.argv) > 1 else "all"
if what in ("page", "all"):
    page()
if what in ("workflows", "all"):
    workflows()
