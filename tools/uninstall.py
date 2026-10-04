"""Désinstalle Le Bureau d'un Kronn : supprime la page, les workflows et le Quick Prompt de bureau.config.json, puis
retire leurs ids de la config (les réponses de l'installation restent : une réinstallation les repropose).

  python3 tools/uninstall.py --dry-run   # liste ce qui serait supprimé, sans rien toucher
  python3 tools/uninstall.py             # liste, demande confirmation, puis supprime
  python3 tools/uninstall.py --yes       # sans confirmation

Ne supprime jamais : un workflow ou Quick Prompt branché tel quel à l'installation (liste « own » de la config),
les connexions (Jira…), les autres workflows de Kronn, ni la page de l'installation de référence (refus).
"""
import argparse, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from install import InstallError, Kronn, jdump, jload, say  # noqa: E402
import templates  # noqa: E402



def targets(k, cfg):
    """[(type, clé, id, nom ou None si déjà absent de Kronn)] dans l'ordre de suppression : crons, boutons, QP, page."""
    own = set(cfg.get("own") or [])
    qps = None
    out = []
    for key, (kind, (sec, field), _) in templates.TEMPLATES.items():
        ident = (cfg.get(sec) or {}).get(field)
        if not ident or ident in own:
            continue
        if kind == "workflow":
            try:
                out.append(("workflow", key, ident, k.get(f"/workflows/{ident}").get("name")))
            except InstallError:
                out.append(("workflow", key, ident, None))
        else:
            if qps is None:
                qps = k.get("/quick-prompts")
            out.append(("quick-prompt", key, ident, next((q.get("name") for q in qps if q.get("id") == ident), None)))
    if cfg.get("page_id"):
        try:
            out.append(("page", "page", cfg["page_id"], k.get(f"/pages/{cfg['page_id']}").get("title")))
        except InstallError:
            out.append(("page", "page", cfg["page_id"], None))
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", default=os.path.join(ROOT, "bureau.config.json"))
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--yes", action="store_true", help="sans confirmation")
    a = ap.parse_args(argv)

    if not os.path.exists(a.config):
        say(f"Pas de {os.path.relpath(a.config, ROOT)} : rien à désinstaller.")
        return 0
    cfg = jload(a.config)
    if cfg.get("protect"):  # installation à garder (réglage "protect": true de la config)
        raise InstallError("cette installation est protégée (\"protect\": true dans la config) : ce script refuse de la désinstaller.")
    k = Kronn(cfg["kronn"]["api"])
    todo = targets(k, cfg)
    if not todo:
        say("Aucun id dans la config : rien à désinstaller.")
        return 0
    say("— Le Bureau : désinstallation —" + (" (dry-run, rien ne sera supprimé)" if a.dry_run else ""))
    for kind, key, ident, name in todo:
        say(f"  {kind:12} {key:9} {ident[:8]}  " + (name or "(déjà absent de Kronn)"))
    for ident in cfg.get("own") or []:
        say(f"  gardé        {ident[:8]}  (branché tel quel à l'installation)")
    if a.dry_run:
        return 0
    if not a.yes and input("Supprimer tout ça de Kronn ? (o/N) : ").strip().lower() not in ("o", "oui", "y", "yes"):
        say("Rien n'a été supprimé.")
        return 1

    failed = 0
    for kind, key, ident, name in todo:
        if name is not None:
            try:
                k.call("DELETE", f"/{kind}s/{ident}")
            except InstallError as e:
                failed += 1
                say(f"(!) {kind} {key} {ident[:8]} : {e}")
                continue
            say(f"✓ {kind} {key} supprimé" + ("e" if kind == "page" else ""))
        # retiré de la config (supprimé, ou déjà absent de Kronn)
        if kind == "page":
            cfg["page_id"] = None
        else:
            sec, field = templates.TEMPLATES[key][1]
            cfg[sec].pop(field, None)
    jdump(cfg, a.config)
    say(f"✓ config mise à jour : {os.path.relpath(a.config, ROOT)}" + (f" ({failed} élément(s) non supprimé(s), relance pour réessayer)" if failed else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except InstallError as e:
        print(f"\n✗ {e}", file=sys.stderr)
        sys.exit(2)
    except (KeyboardInterrupt, EOFError):
        print("\nDésinstallation interrompue.", file=sys.stderr)
        sys.exit(130)
