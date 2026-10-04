"""Plans de bureau (layouts/*.json, format bureau-layout/1) : vérifier, lister les sièges, voir le rendu.

  python3 tools/plan.py check [plan.json]            # erreurs (bloquantes) et avertissements, code de sortie 1 si erreur
  python3 tools/plan.py check plan.json --json       # même chose en JSON (pour un agent qui corrige son brouillon)
  python3 tools/plan.py seats [plan.json]            # sièges numérotés (I2.R2 = îlot 2, côté droit, rang 2), qui s'y assoit,
                                                     # et qui change de place par rapport au plan de l'installation
  .venv/bin/python tools/plan.py preview [plan.json] [-o plan.png]   # rendu du plan (page de démo, Chrome headless)
  python3 tools/plan.py share plan.json              # le proposer à toute l'équipe (workflow « Le Bureau · plan », validé par le boss)
  python3 tools/plan.py share defaut                 # revenir au plan embarqué dans la page

Sans fichier : le plan de l'installation (bureau.config.json, clé layout), sinon layouts/equipe.json.
Le validateur dit ce dont le moteur a besoin aujourd'hui : un plan qui le passe se dessine et se parcourt sans accroc.
"""
import argparse, json, os, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
sys.path.insert(0, os.path.join(ROOT, "workflows"))
import assemble  # noqa: E402
from _plan import FURNITURE, assign, seats_of, validate  # noqa: E402,F401  (FURNITURE : lu par les tests)


def default_path():
    cfg_path = os.path.join(ROOT, "bureau.config.json")
    cfg = json.load(open(cfg_path)) if os.path.exists(cfg_path) else {}
    return os.path.join(ROOT, assemble.layout_path(cfg))


def load(path):
    raw = open(path, "rb").read()
    return json.loads(raw), len(raw)


def cmd_check(path, as_json):
    try:
        L, size = load(path)
    except (OSError, ValueError) as e:
        err, warn = [f"lecture impossible : {e}"], []
    else:
        err, warn = validate(L, size)
    if as_json:
        print(json.dumps({"ok": not err, "errors": err, "warnings": warn}, ensure_ascii=False, indent=1))
    else:
        for m in err:
            print("✗", m)
        for m in warn:
            print("!", m)
        print(("✓ plan valide" if not err else f"✗ {len(err)} erreur(s)") + f" : {os.path.relpath(path, ROOT)}")
    return 1 if err else 0


def cast(cfg):
    """Roster puis agents de l'installation ({key, name, seat?}), le boss à part."""
    roster = json.load(open(os.path.join(ROOT, "team", "roster.json")))["people"]
    return roster + [dict(a, name=a["name"] + " (agent)") for a in cfg.get("agents") or []]


def cmd_seats(path):
    L, _ = load(path)
    cfg = assemble.config()
    people = cast(cfg)
    owner = cfg.get("owner")
    names = {p["key"]: p["name"] for p in people}
    got, temps = assign(L, people, owner)
    who = {sid: names[k] for k, sid in got.items()}
    for s in seats_of(L):
        print(f"{s['id']:7} [{s['x']:>2},{s['y']:>2}]  " + (who.get(s["id"]) or ("libre (intérimaires)" if s["id"] in temps else "")))
    if L.get("boss"):
        print(f"{'BOSS':7} {L['boss']['seat']}  " + names.get(owner, "le boss"))
    # qui change de place si ce plan remplace celui de l'installation
    cur = default_path()
    if os.path.abspath(path) != cur and os.path.exists(cur):
        before, _ = assign(load(cur)[0], people, owner)
        moves = [(names[k], before.get(k), got.get(k)) for k in names if before.get(k) != got.get(k)]
        print(f"\nPar rapport au plan actuel ({os.path.relpath(cur, ROOT)}) : " + ("personne ne change de place" if not moves else
              f"{len(moves)} changement(s) de place"))
        for n, a, b in moves:
            print(f"  {n:22} {a or 'sans siège':10} → {b or 'sans siège'}")
    return 0


def cmd_preview(path, out):
    import shots
    L, size = load(path)
    err, _ = validate(L, size)
    if err:
        print(f"✗ plan invalide ({len(err)} erreur(s)) : python3 tools/plan.py check {os.path.relpath(path, ROOT)}")
        return 1
    page = shots.build_page({**assemble.config(), "layout": os.path.abspath(path)})
    with shots.chrome() as call:
        png = shots.capture(call, page, 1400, 1000, shots.AT(11), "#cv", 1.5)
    if isinstance(png, str):
        print("✗", png)
        return 1
    with open(out, "wb") as f:
        f.write(png)
    print("✓ aperçu :", os.path.relpath(out, ROOT))
    return 0


def cmd_share(path):
    """Lance le workflow « Le Bureau · plan » avec ce plan : il le revérifie, attend la validation du boss, puis le publie
    dans le dataset layout (la page se redessine). « defaut » : retour au plan embarqué."""
    cfg = assemble.config()
    wf = (cfg.get("actions") or {}).get("layout")
    if not wf:
        print("✗ workflow « Le Bureau · plan » absent : relance python3 tools/install.py")
        return 1
    if path == "defaut":
        text = "defaut"
    else:
        if cmd_check(path, False):
            return 1
        text = open(path).read()
    req = urllib.request.Request(cfg["kronn"]["api"].rstrip("/") + "/mcp/workflow-trigger", method="POST",
                                 headers={"content-type": "application/json"},
                                 data=json.dumps({"workflow_id": wf, "variables": {"layout_json": text}}).encode())
    with urllib.request.urlopen(req, timeout=60) as r:
        run = json.load(r)
    run = run.get("data", run)
    ui = (cfg.get("kronn") or {}).get("ui", "").rstrip("/")
    print(f"✓ proposé (run {str(run.get('run_id'))[:8]}) : en attente de la validation du boss, dans la page ou dans Kronn {ui}")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=("check", "seats", "preview", "share"))
    ap.add_argument("plan", nargs="?")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("-o", "--out", default=os.path.join(ROOT, "dist", "plan.png"))
    a = ap.parse_args(argv)
    if a.cmd == "share":
        if not a.plan:
            ap.error("share : donne le fichier du plan, ou defaut")
        return cmd_share(a.plan if a.plan == "defaut" else os.path.abspath(a.plan))
    path = os.path.abspath(a.plan) if a.plan else default_path()
    if a.cmd == "check":
        return cmd_check(path, a.json)
    if a.cmd == "seats":
        return cmd_seats(path)
    return cmd_preview(path, a.out)


if __name__ == "__main__":
    sys.exit(main())
