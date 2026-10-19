"""Découpe une config existante (#32) : les réglages d'équipe partent dans le pack, la config ne garde que l'installation.

  python3 tools/split.py            # montre ce qui partirait dans le pack et vérifie que rien ne change, sans rien garder
  python3 tools/split.py --write    # écrit <pack>/settings.json et bureau.config.json (copie de l'ancienne à côté)

Vont dans settings.json du pack : rhythm, gitfut, wiki_posters, microsoft.planning et les personnages des agents
(clé, nom, métier, place, sprite…, sans ids de workflows). Restent dans la config : microsoft.config_id, le rattachement
de chaque agent à ses workflows (agents[] = {key, wf}), les pages de l'écran du boss, les ids Kronn.
Le pack écrit, la page assemblée et le rendu de chaque modèle doivent être identiques octet pour octet à ceux d'avant ;
sinon rien n'est gardé (le settings.json d'avant est remis).
"""
import argparse, json, os, shutil, sys
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import assemble, templates  # noqa: E402


def dump(obj):
    return json.dumps(obj, ensure_ascii=False, indent=1) + "\n"


def split(cfg, current):
    """(settings, config) : les réglages d'équipe de cfg posés sur le settings.json actuel du pack (current), et la
    config sans eux. Un agent sans clé reste entier dans la config (il n'a pas de personnage)."""
    s = {k: v for k, v in (current or {}).items()}
    c = {k: v for k, v in cfg.items() if k not in ("rhythm", "gitfut", "wiki_posters")}
    for k in ("rhythm", "gitfut", "wiki_posters"):
        if k in cfg:
            s[k] = cfg[k]
    m = cfg.get("microsoft")
    if isinstance(m, dict):
        team = {k: v for k, v in m.items() if k != "config_id"}
        if team:
            s["microsoft"] = {**(s.get("microsoft") or {}), **team}
        c["microsoft"] = {k: v for k, v in m.items() if k == "config_id"}
        if not c["microsoft"]:
            c.pop("microsoft")
    if "agents" in cfg:
        personas = {a["key"]: a for a in s.get("agents") or [] if a.get("key")}
        bindings = []
        for a in cfg.get("agents") or []:
            if not a.get("key"):
                bindings.append(a)
                continue
            personas[a["key"]] = {**personas.get(a["key"], {}), **{k: v for k, v in a.items() if k != "wf"}}
            bindings.append({"key": a["key"], "wf": a.get("wf") or []})
        s["agents"] = [assemble._agent(p, {}) for p in personas.values()]
        c["agents"] = bindings
    return s, c


def outputs(cfg):
    """Ce qu'on compare : la page publiée, puis le rendu de chaque modèle que l'installation crée."""
    out = {"page": assemble.build(demo=False, cfg=cfg)}
    for key, tpl in templates.load_templates().items():
        if not templates.skipped(key, cfg):
            out[key] = json.dumps(templates.render(tpl, cfg), ensure_ascii=False, sort_keys=True)
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", default=os.path.join(ROOT, "bureau.config.json"))
    ap.add_argument("--write", action="store_true", help="garder le résultat (sinon : vérification seule)")
    a = ap.parse_args(argv)
    cfg = json.loads(Path(a.config).read_text())
    pack = assemble.team_dir(cfg)
    if not pack or not assemble.is_pack(cfg.get("team")):
        print("✗ pas de pack d'équipe (clé team = chemin d'un pack) : rien à découper")
        return 1
    path = os.path.join(pack, "settings.json")
    before = Path(path).read_text() if os.path.exists(path) else None
    settings, rest = split(cfg, json.loads(before) if before else {})
    want = outputs(cfg)
    Path(path).write_text(dump(settings))
    try:
        got = outputs(rest)
    except Exception:
        got = None
    diff = [k for k in want if not got or got.get(k) != want[k]] + [k for k in (got or {}) if k not in want]
    if diff or not a.write:
        if before is None:
            os.remove(path)
        else:
            Path(path).write_text(before)
    moved = [k for k in ("rhythm", "gitfut", "wiki_posters") if k in cfg] + (["microsoft.planning"] if "microsoft" in settings else []) \
        + ([f"{len(settings['agents'])} personnage(s) d'agents"] if settings.get("agents") else [])
    print("Vers le pack :", ", ".join(moved) or "rien")
    if diff:
        print("✗ la page ou des modèles changeraient : " + ", ".join(diff) + " ; rien n'est gardé")
        return 1
    print(f"✓ page et {len(want) - 1} modèles identiques après la découpe")
    if not a.write:
        print("(vérification seule : --write pour garder le résultat)")
        return 0
    shutil.copy(a.config, a.config + ".avant-split")
    Path(a.config).write_text(dump(rest))
    print(f"✓ {os.path.relpath(path)} écrit, config allégée ({os.path.basename(a.config)}.avant-split : l'ancienne)")
    print("  À commiter dans le pack : settings.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
