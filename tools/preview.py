"""Aperçu local de la page de ta branche, avec tes vraies données, sans rien publier ni merger.

    python3 tools/preview.py            # la page assemblée depuis le dossier courant + les datasets actuels de ta page Kronn
    python3 tools/preview.py --mail     # + un relevé réel du courrier (workflows/mail_snapshot.py, en local)
    python3 tools/preview.py --no-open  # sans ouvrir le navigateur

La page (dist/apercu.html, jamais commitée) reçoit les datasets comme dans Kronn (window.KronnPageData). Les boutons
d'action (cartes Kronn) n'y marchent pas : ils ont besoin de Kronn. Sans section mail dans la config, --mail lit tous
les comptes de l'appli Mail du Mac.
"""
import argparse, json, os, subprocess, sys, tempfile, urllib.request
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import assemble  # noqa: E402


def runtime_data(d):
    """Les données telles que Kronn les passe à une page (même forme que workflows/pages_snapshot.py)."""
    return {"version": 1, "page": {"id": d.get("id"), "title": d.get("title")},
            "datasets": {x["name"]: {"kind": x.get("kind"), "current": x.get("current")} for x in d.get("datasets") or []}}


def mail_now(cfg):
    """Relevé du courrier en local : la config, sinon tous les comptes de l'appli Mail."""
    if not (cfg.get("mail") or {}).get("accounts"):
        r = subprocess.run(["osascript", "-e", 'tell application "Mail" to get name of every account'], capture_output=True, text=True, timeout=60)
        names = [x.strip() for x in r.stdout.split(",") if x.strip()]
        cfg = {**cfg, "mail": {"accounts": [{"id": f"m{i}", "label": n, "provider": "mac-mail", "account": n} for i, n in enumerate(names)]}}
    pack = ((assemble.defaults(cfg).get("mail") or {}).get("messengers")) or []  # porteurs du pack d'équipe
    if pack and not cfg["mail"].get("messengers"):
        cfg = {**cfg, "mail": {**cfg["mail"], "messengers": pack}}
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
        json.dump({**cfg, "actions": {k: v for k, v in (cfg.get("actions") or {}).items() if k != "mail_rules"}}, fh)  # jamais de visite du facteur
    r = subprocess.run([sys.executable, os.path.join(ROOT, "workflows", "mail_snapshot.py")], capture_output=True, text=True,
                       env={**os.environ, "BUREAU_CONFIG": fh.name}, timeout=300)
    os.unlink(fh.name)
    sys.stderr.write(r.stderr)
    return r.stdout if r.returncode == 0 else None, cfg


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", default=os.path.join(ROOT, "bureau.config.json"))
    ap.add_argument("--mail", action="store_true", help="relever le courrier maintenant (appli Mail, IMAP)")
    ap.add_argument("--no-open", action="store_true")
    a = ap.parse_args(argv)
    cfg = json.loads(Path(a.config).read_text())
    api = (cfg.get("kronn") or {}).get("api", "").rstrip("/")
    with urllib.request.urlopen(f"{api}/pages/{cfg['page_id']}", timeout=30) as r:
        d = json.load(r)
    data = runtime_data(d.get("data", d))
    if a.mail:
        mails, cfg = mail_now(cfg)
        if mails:
            data["datasets"]["mails"] = {"kind": "snapshot", "current": mails}
            print("✓ courrier relevé : " + ", ".join(f"{x['label']} {x['useful_n']} utiles" for x in json.loads(mails)["accounts"]))
    html = assemble.build(demo=False, cfg=cfg)
    boot = ("<script>window.KronnPageData=" + json.dumps(data).replace("</", "<\\/") +
            ";addEventListener('load',()=>dispatchEvent(new CustomEvent('kronn:page-data',{detail:window.KronnPageData})));</script>")
    i = html.lower().find("<head>")
    html = html[:i + 6] + boot + html[i + 6:] if i >= 0 else boot + html
    out = os.path.join(ROOT, "dist", "apercu.html")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(html)
    print(f"✓ aperçu : {os.path.relpath(out, ROOT)} ({len(html.encode()) // 1024} Ko, {len(data['datasets'])} datasets de la page Kronn)")
    if not a.no_open:
        subprocess.run(["open", out])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
