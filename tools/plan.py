"""Plans de bureau (layouts/*.json, format bureau-layout/1) : vérifier, lister les sièges, voir le rendu.

  python3 tools/plan.py check [plan.json]            # erreurs (bloquantes) et avertissements, code de sortie 1 si erreur
  python3 tools/plan.py check plan.json --json       # même chose en JSON (pour un agent qui corrige son brouillon)
  python3 tools/plan.py seats [plan.json]            # sièges numérotés (I2.R2 = îlot 2, côté droit, rang 2), qui s'y assoit,
                                                     # et qui change de place par rapport au plan de l'installation
  .venv/bin/python tools/plan.py preview [plan.json] [-o plan.png]   # rendu du plan (page de démo, Chrome headless)
  python3 tools/plan.py share plan.json              # le proposer à toute l'équipe (workflow « Le Bureau · plan », validé par le boss)
  python3 tools/plan.py share defaut                 # revenir au plan embarqué dans la page
  python3 tools/plan.py from-image croquis.jpg       # brouillon depuis un croquis ou une photo (PNG, JPEG, WebP), par Claude
                                                     # (CLI claude, Opus) : brouillon, vérification, corrections, aperçu, puis share

Sans fichier : le plan de l'installation (clé layout de bureau.config.json, sinon celui du profil d'équipe, sinon le plan type).
Le validateur dit ce dont le moteur a besoin aujourd'hui : un plan qui le passe se dessine et se parcourt sans accroc.
"""
import argparse, json, os, shutil, subprocess, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
sys.path.insert(0, os.path.join(ROOT, "workflows"))
import assemble  # noqa: E402
from _plan import FURNITURE, assign, seats_of, validate  # noqa: E402,F401  (FURNITURE : lu par les tests)

PROMPT = os.path.join(ROOT, "tools", "plan_prompt.md")  # aussi le début du Quick Prompt « plan vers brouillon »
EXAMPLE = os.path.join(ROOT, "layouts", "open-space.json")
CLAUDE = os.environ.get("BUREAU_CLAUDE", "claude")  # les tests le remplacent par un faux
ROUNDS = 4  # un brouillon, puis trois corrections au plus


def default_path():
    cfg_path = os.path.join(ROOT, "bureau.config.json")
    cfg = json.load(open(cfg_path)) if os.path.exists(cfg_path) else {}
    return os.path.join(ROOT, assemble.layout_path(cfg))


def shown(path):
    """Chemin à afficher : relatif au dépôt s'il y est, sinon tel quel."""
    rel = os.path.relpath(path, ROOT)
    return path if rel.startswith("..") else rel


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
        print(("✓ plan valide" if not err else f"✗ {len(err)} erreur(s)") + f" : {shown(path)}")
    return 1 if err else 0


def cast(cfg):
    """Équipe (profil et personnes ajoutées) puis agents de l'installation ({key, name, seat?})."""
    return assemble.roster(cfg) + [dict(a, name=a["name"] + " (agent)") for a in cfg.get("agents") or []]


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
        print(f"\nPar rapport au plan actuel ({shown(cur)}) : " + ("personne ne change de place" if not moves else
              f"{len(moves)} changement(s) de place"))
        for n, a, b in moves:
            print(f"  {n:22} {a or 'sans siège':10} → {b or 'sans siège'}")
    return 0


def cmd_preview(path, out):
    import shots
    L, size = load(path)
    err, _ = validate(L, size)
    if err:
        print(f"✗ plan invalide ({len(err)} erreur(s)) : python3 tools/plan.py check {shown(path)}")
        return 1
    page = shots.build_page({**assemble.demo_config(), "layout": os.path.abspath(path)})
    with shots.chrome() as call:
        png = shots.capture(call, page, 1400, 1000, shots.AT(11), "#cv", 1.5)
    if isinstance(png, str):
        print("✗", png)
        return 1
    with open(out, "wb") as f:
        f.write(png)
    print("✓ aperçu :", shown(out))
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


def image_kind(path):
    """png, jpeg ou webp d'après les premiers octets ; None sinon (HEIC, PDF… : à exporter en JPEG d'abord)."""
    with open(path, "rb") as f:
        head = f.read(12)
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if head.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    return None


def ask_claude(text, session, model, image_dir):
    """Un tour de Claude Code en mode non interactif, avec la seule lecture de fichiers : (session, réponse)."""
    cmd = [CLAUDE, "-p", text, "--model", model, "--output-format", "json", "--tools", "Read", "--allowedTools", "Read",
           "--add-dir", image_dir] + (["--resume", session] if session else [])
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT, timeout=900)
    try:
        out = json.loads(r.stdout)
    except ValueError:
        raise RuntimeError((r.stderr or r.stdout).strip()[-300:] or f"claude : code {r.returncode}")
    if r.returncode or out.get("is_error"):
        raise RuntimeError(str(out.get("result") or r.stderr).strip()[-300:])
    return out.get("session_id"), out.get("result") or ""


class Refused(Exception):
    """Claude ne voit pas de plan de bureau dans l'image (réponse {"_error": …})."""


def parse_draft(text):
    """Réponse de Claude -> (plan, hypothèses, problème) ; plan None si le JSON est illisible. Refused si pas de plan."""
    try:
        L = json.loads(text[text.index("{"):text.rindex("}") + 1])
    except ValueError as e:
        return None, [], f"réponse sans JSON lisible ({e})"
    if not isinstance(L, dict):
        return None, [], "la réponse n'est pas un objet JSON"
    if L.get("_error"):
        raise Refused(str(L["_error"]))
    notes = L.pop("_notes", None) or []
    return L, notes if isinstance(notes, list) else [str(notes)], None


def cmd_from_image(image, out, model):
    """Brouillon de plan depuis un croquis ou une photo : Claude le dessine, le vérificateur le relit, Claude corrige
    (ROUNDS tours au plus). Plan valide : aperçu PNG, sièges, puis proposition à l'équipe sur confirmation."""
    if not os.path.isfile(image):
        print("✗ image introuvable :", image)
        return 1
    if not image_kind(image):
        print("✗ format non pris en charge : PNG, JPEG ou WebP (une photo HEIC s'exporte en JPEG depuis Photos ou Aperçu)")
        return 1
    if not shutil.which(CLAUDE):
        print("✗ CLI claude introuvable : installe Claude Code (https://claude.com/claude-code) et connecte-toi")
        return 1
    text = (open(PROMPT, encoding="utf-8").read()
            + f"\n## À toi\n\nL'image : {image}\nLe plan d'exemple : {EXAMPLE}\n"
            "Lis les deux avec l'outil Read, puis réponds uniquement par le JSON du plan, sans texte autour.\n")
    session, err = None, None
    for n in range(1, ROUNDS + 1):
        print(f"… tour {n}/{ROUNDS} : " + ("brouillon" if n == 1 else "correction") + f" (claude, {model})", flush=True)
        try:
            session, answer = ask_claude(text, session, model, os.path.dirname(image))
            L, notes, problem = parse_draft(answer)
        except (RuntimeError, subprocess.TimeoutExpired) as e:
            print("✗ claude :", e)
            return 1
        except Refused as e:
            print("✗ pas de plan tiré de cette image :", e)
            return 1
        if L is None:
            err = [problem]
        else:
            raw = json.dumps(L, ensure_ascii=False, indent=1) + "\n"
            os.makedirs(os.path.dirname(out), exist_ok=True)
            with open(out, "w", encoding="utf-8") as f:
                f.write(raw)
            err, warn = validate(L, len(raw.encode()))
        if not err:
            break
        print(f"  {len(err)} erreur(s) : " + err[0] + (" …" if len(err) > 1 else ""))
        text = ("Le vérificateur (python3 tools/plan.py check --json) refuse ce plan :\n"
                + json.dumps({"errors": err[:40]}, ensure_ascii=False, indent=1)
                + "\nCorrige ces erreurs sans rien casser d'autre et renvoie le plan complet, en JSON seulement, avec _notes.")
    else:
        print(f"✗ toujours {len(err)} erreur(s) après {ROUNDS} tours :")
        for m in err:
            print("  ✗", m)
        if os.path.exists(out):
            print(f"Le dernier brouillon est dans {shown(out)} : corrige-le à la main, puis python3 tools/plan.py check")
        return 1

    rel = shown(out)
    print(f"✓ plan valide en {n} tour(s) : {rel} ({L['size'][0]}x{L['size'][1]} cases, {len(seats_of(L))} sièges)")
    for m in notes:
        print("  hypothèse :", m)
    for m in warn:
        print("  !", m)
    png = os.path.splitext(out)[0] + ".png"
    try:
        cmd_preview(out, png)
    except Exception as e:  # pas de Chrome ou de websocket-client : le plan reste bon, l'aperçu se refait à part
        print(f"(!) aperçu impossible ({e}) : .venv/bin/python tools/plan.py preview {rel}")
    if not sys.stdin.isatty():
        print(f"Pour le proposer à l'équipe : python3 tools/plan.py share {rel}")
        return 0
    if input("Proposer ce plan à toute l'équipe (validation du boss) ? [o/N] ").strip().lower() in ("o", "oui", "y"):
        return cmd_share(out)
    print(f"Plus tard : python3 tools/plan.py share {rel}")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=("check", "seats", "preview", "share", "from-image"))
    ap.add_argument("plan", nargs="?")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("-o", "--out", help="preview : dist/plan.png ; from-image : dist/plan-brouillon.json")
    ap.add_argument("--model", default="opus", help="from-image : modèle de claude (opus par défaut)")
    a = ap.parse_args(argv)
    if a.cmd == "from-image":
        if not a.plan:
            ap.error("from-image : donne le chemin de l'image")
        return cmd_from_image(os.path.abspath(a.plan), os.path.abspath(a.out or os.path.join(ROOT, "dist", "plan-brouillon.json")), a.model)
    if a.cmd == "share":
        if not a.plan:
            ap.error("share : donne le fichier du plan, ou defaut")
        return cmd_share(a.plan if a.plan == "defaut" else os.path.abspath(a.plan))
    path = os.path.abspath(a.plan) if a.plan else default_path()
    if a.cmd == "check":
        return cmd_check(path, a.json)
    if a.cmd == "seats":
        return cmd_seats(path)
    return cmd_preview(path, a.out or os.path.join(ROOT, "dist", "plan.png"))


if __name__ == "__main__":
    sys.exit(main())
