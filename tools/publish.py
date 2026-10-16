"""Publie dans Kronn (API locale) : la page et/ou les scripts des workflows du Bureau.

  python3 tools/publish.py page        # assemble la page (sans démo) et la pousse dans la page Le Bureau
  python3 tools/publish.py workflows   # pousse le rendu des modèles (workflows/templates) : étapes, scripts, crons, QP
  python3 tools/publish.py all
"""
import json, os, sys, urllib.request
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG_PATH = os.environ.get("BUREAU_CONFIG") or os.path.join(ROOT, "bureau.config.json")  # BUREAU_CONFIG : tests
CFG = json.loads(Path(CFG_PATH).read_text())
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
    Les ids des étapes existantes sont gardés (retrouvés par leur nom).
    En deux temps : d'abord les workflows du Bureau absents de la config (créés, leur id rangé), puis le rendu de tous,
    pour que chaque script connaisse les ids de tous les workflows du Bureau (BUREAU_IDS de _lib.py : un workflow créé
    après le rendu d'un cron passerait sinon pour un agent, « Intérimaire 1 »)."""
    tpls = templates.load_templates()
    for key, tpl in tpls.items():
        kind, where, _ = templates.TEMPLATES[key]
        if not templates.config_id(CFG, where) and kind == "workflow" and not templates.skipped(key, CFG):
            # workflow du Bureau ajouté depuis l'installation (ex. commenter un ticket) : créé, son id rangé dans la config
            ident = call("POST", "/workflows", templates.render(tpl, CFG))["data"]["id"]
            CFG.setdefault(where[0], {})[where[1]] = ident
            Path(CFG_PATH).write_text(json.dumps(CFG, ensure_ascii=False, indent=1))
            print(f"{key} ({ident[:8]}) créé")
    for key, tpl in tpls.items():
        kind, where, _ = templates.TEMPLATES[key]
        ident = templates.config_id(CFG, where)
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


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    if what in ("page", "all"):
        page()
    if what in ("workflows", "all"):
        workflows()
