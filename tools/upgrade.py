"""Met à jour une installation du Bureau, sans question : tout vient de bureau.config.json (et du pack d'équipe).

  python3 tools/upgrade.py               # après la mise à jour du dépôt : complète, puis publie
  python3 tools/upgrade.py --dry-run     # affiche ce qui serait fait, sans rien créer ni écrire
  python3 tools/upgrade.py --no-publish  # complète l'installation, sans republier les workflows ni la page

Dans l'ordre : une sauvegarde datée de la config, les migrations de la config, ce qui manque à ce qui est déjà installé
(datasets de la page, pages à part des modèles installés, skills, workflows, crons et Quick Prompts du Bureau ; les crons
créés sont activés, sans premier lancement), puis la publication : les workflows, puis la page et les pages à part.
Relançable sans doublon. Les modèles facultatifs pas encore installés ne sont pas créés : tools/install.py les propose.
"""
import argparse, copy, datetime, importlib, json, os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import install, templates  # noqa: E402
from install import InstallError, say  # noqa: E402

BACKUPS = os.path.join(os.path.expanduser("~"), ".local", "share", "pixel-bureau", "sauvegardes")
KEEP = 10  # sauvegardes gardées, les plus récentes


# ---------- migrations de la config ----------
# (nom, fonction(cfg) -> True si elle a changé la config). Idempotentes : une migration déjà faite ne change plus rien.
# Pas encore de migration à faire : les reprises connues sont lues à la volée (la page « Revue · bilan » reprend
# review.page_id, templates.revue_page) ou posées par install.side_pages, partagé avec la mise à jour.
MIGRATIONS = []


def migrate(cfg):
    """Applique les migrations dans l'ordre ; renvoie les noms de celles qui ont changé la config."""
    return [name for name, fn in MIGRATIONS if fn(cfg)]


# ---------- sauvegarde ----------
def backup(path, folder=None, now=None):
    """Copie datée de la config (config-AAAAMMJJTHHMMSS.json) ; ne garde que les KEEP plus récentes. Renvoie la copie."""
    folder = folder or BACKUPS
    os.makedirs(folder, exist_ok=True)
    stamp = (now or datetime.datetime.now()).strftime("%Y%m%dT%H%M%S")
    dest, n = os.path.join(folder, f"config-{stamp}.json"), 1
    while os.path.exists(dest):  # deux mises à jour dans la même seconde
        n += 1
        dest = os.path.join(folder, f"config-{stamp}-{n}.json")
    shutil.copyfile(path, dest)

    def order(f):
        m = re.fullmatch(r"config-(\d{8}T\d{6})(?:-(\d+))?\.json", f)
        return (m.group(1), int(m.group(2) or 1))
    olds = sorted((f for f in os.listdir(folder) if re.fullmatch(r"config-\d{8}T\d{6}(-\d+)?\.json", f)), key=order)
    for f in olds[:-KEEP]:
        os.remove(os.path.join(folder, f))
    return dest


# ---------- état de l'installation ----------
def installed_models(cfg):
    """Les modèles d'agents déjà installés (models.<clé>) et ce qu'ils lancent (postes, sous-workflow de revue)."""
    return install.with_posts({key for key, v in (cfg.get("models") or {}).items() if v})


def available_models(cfg):
    """Modèles facultatifs proposables (Kronn connecté pour eux) mais pas installés : install.py les propose."""
    launch = cfg.get("launch") or {}
    return [key for key, _q, _d in install.MODELS if not (cfg.get("models") or {}).get(key)
            and not templates.skipped(key, cfg) and not launch.get(install.MODEL_LAUNCH.get(key, ""))]


def dataset_names(k, pid):
    try:
        return {d.get("name") for d in k.get(f"/pages/{pid}").get("datasets") or []}
    except InstallError:
        return None


def flat(cfg):
    """La config à plat sur deux niveaux (section.clé), pour dire ce qui a changé."""
    out = {}
    for key, v in cfg.items():
        if key.startswith("_"):
            continue
        if isinstance(v, dict) and v:
            out.update({f"{key}.{sub}": x for sub, x in v.items()})
        else:
            out[key] = v
    return out


def changed_keys(old, new):
    a, b = flat(old), flat(new)
    return ([f"{x} (ajoutée)" for x in b if x not in a] + [f"{x} (modifiée)" for x in b if x in a and a[x] != b[x]]
            + [f"{x} (retirée)" for x in a if x not in b])


BIG_PAGE = 1_000_000  # la limite des Kronn d'avant 0.15.2 (install.MIN_VERSION)


def check_kronn(k, page_id=None):
    """La version de Kronn, refusée sous install.MIN_VERSION, sauf si Kronn garde déjà la page du Bureau au-delà de
    BIG_PAGE octets : c'est un Kronn construit depuis main après le tag (il dit 0.15.1 mais accepte la page)."""
    h = k.call("GET", "/health", timeout=10)
    v = tuple(int(x) for x in re.findall(r"\d+", str(h.get("version", "0")))[:3])
    if v >= install.MIN_VERSION:
        return h.get("version")
    need = ".".join(map(str, install.MIN_VERSION))
    try:
        size = int((k.call("GET", f"/pages/{page_id}", timeout=10) or {}).get("html_size_bytes") or 0) if page_id else 0
    except (InstallError, ValueError, TypeError):
        size = 0
    if size <= BIG_PAGE:
        raise InstallError(f"Kronn {h.get('version')} trop ancien : il faut {need} ou plus.")
    say(f"! Kronn dit {h.get('version')}, mais il garde déjà la page ({size} octets) : mise à jour faite quand même ; "
        f"passe Kronn en {need} ou plus.")
    return h.get("version")


# ---------- publication ----------
def publish_all(k, path):
    """Publie avec tools/publish.py (la config écrite juste avant) : les workflows, puis la page et les pages à part.
    Les appels passent par le client Kronn de la mise à jour. Renvoie les chemins mis à jour (PUT)."""
    before = os.environ.get("BUREAU_CONFIG")
    os.environ["BUREAU_CONFIG"] = path  # publish.py lit la config à l'import
    try:
        pub = importlib.reload(sys.modules["publish"]) if "publish" in sys.modules else importlib.import_module("publish")
        puts = []

        def call(method, p, body=None):
            if method == "PUT":
                puts.append(p)
            return {"success": True, "data": k.call(method, p, body)}
        pub.call = call
        pub.workflows()
        pub.page()
        return puts
    finally:
        if before is None:
            os.environ.pop("BUREAU_CONFIG", None)
        else:
            os.environ["BUREAU_CONFIG"] = before


def names_of(cfg):
    """{id Kronn: nom lisible} des éléments du Bureau de la config (workflows, QP, skills, pages)."""
    out = {templates.config_id(cfg, where): key for key, (_k, where, _s) in templates.TEMPLATES.items() if templates.config_id(cfg, where)}
    out.update({v: f"skill {key}" for key, v in (cfg.get("skills") or {}).items() if v})
    out.update({templates.side_page_id(cfg, key): f"page « {t} »" for key, (t, _d, _f) in templates.SIDE_PAGES.items()
                if templates.side_page_id(cfg, key)})
    if cfg.get("page_id"):
        out[cfg["page_id"]] = "page du Bureau"
    return out


# ---------- mise à jour ----------
def upgrade(path, dry=False, publish=True):
    old = install.jload(path) if os.path.exists(path) else {}
    if not old.get("page_id") or not (old.get("kronn") or {}).get("api"):
        raise InstallError("pas encore installé : lance d'abord python3 tools/install.py")
    cfg = copy.deepcopy(old)
    k = install.Kronn(cfg["kronn"]["api"])
    say(f"— Le Bureau : mise à jour{' (dry-run, rien ne sera écrit)' if dry else ''} —")
    say(f"✓ Kronn {check_kronn(k, cfg['page_id'])} sur {cfg['kronn']['api']}")
    if not dry:
        say(f"✓ config sauvegardée : {backup(path)}")
    created, ignored = [], []

    applied = migrate(cfg)
    for name in applied:
        say(f"✓ migration : {name}")

    have = dataset_names(k, cfg["page_id"])
    if have is None:
        raise InstallError(f"la page {cfg['page_id'][:8]} de la config n'existe plus dans Kronn : relance python3 tools/install.py")
    created += [f"dataset {n}" for n in install.DATASETS if n not in have]
    install.upsert_page(k, cfg, None, dry)

    chosen = installed_models(cfg)
    side_before = {key: templates.side_page_id(cfg, key) for key in templates.SIDE_PAGES}
    side_have = {key: dataset_names(k, pid) for key, pid in side_before.items() if pid}
    install.side_pages(k, cfg, chosen, dry)
    for key, (title, datasets, _f) in templates.SIDE_PAGES.items():
        if cfg.get(key) and not side_before[key]:
            created.append(f"page « {title} »")
        elif side_have.get(key) is not None:
            created += [f"dataset {n} (page « {title} »)" for n in datasets if n not in side_have[key]]

    skills = cfg.get("skills") or {}
    live = {s.get("id") for s in k.get("/skills") or [] if isinstance(s, dict)}
    lacking = [key for key in templates.BUREAU_SKILLS if not skills.get(key) or skills[key] not in live]
    created += [f"skill {key}" for key in lacking]
    if lacking and not dry:  # avant les workflows : leur rendu nomme les ids des skills
        templates.sync_skills(k.call, cfg, say=lambda m: None)

    tpls = templates.load_templates()
    todo = {key: tpl for key, tpl in tpls.items() if not templates.config_id(cfg, templates.TEMPLATES[key][1])
            and (templates.TEMPLATES[key][1][0] != "models" or key in chosen)}
    if "ask" in todo:  # le Quick Prompt « interroger un agent » : l'agent choisi à l'installation, sinon pas de bouton
        agent = (old.get("_answers") or {}).get("ai_agent")
        if agent:
            cfg["_ai_agent"] = agent
        else:
            del todo["ask"]
            if (cfg.get("actions") or {}).get("ask") is None:
                ignored.append("ask (aucun agent IA connu : python3 tools/install.py le demande)")
    if todo:  # un homonyme dans Kronn (config perdue, autre installation) : pas de doublon, install.py propose de le reprendre
        names = {"workflow": {w.get("name") for w in k.get("/workflows")}, "quick_prompt": {q.get("name") for q in k.get("/quick-prompts")}}
        for key in list(todo):
            if todo[key]["definition"]["name"] in names[templates.TEMPLATES[key][0]]:
                del todo[key]
                ignored.append(f"{key} (« {tpls[key]['definition']['name']} » existe déjà dans Kronn : python3 tools/install.py propose de le reprendre)")
    before = {key: templates.config_id(cfg, templates.TEMPLATES[key][1]) for key in todo}
    install.upsert_all(k, cfg, todo, True, dry)  # crons activés comme à l'installation, sans premier lancement
    cfg.pop("_ai_agent", None)
    for key in todo:
        sec, field = templates.TEMPLATES[key][1]
        if templates.config_id(cfg, (sec, field)):
            created.append(f"{key} ({templates.TEMPLATES[key][0].replace('_', ' ')})")
        elif before[key] is None and field in (cfg.get(sec) or {}):
            del cfg[sec][field]  # pas créé (connexion ou réglage absent) : la config reste comme avant

    for key, (_kind, where, _s) in templates.TEMPLATES.items():
        ident = templates.config_id(cfg, where)
        if ident and ident in (cfg.get("own") or []):
            ignored.append(f"{key} (gardé tel quel, own)")
        elif templates.skipped(key, cfg) and (ident or where[0] != "models" or key in chosen):
            ignored.append(f"{key} (connexion ou réglage manquant)")

    updated = []
    if dry:
        say("\n(dry-run) Rien n'est écrit ni publié ; la mise à jour publierait les workflows, puis la page.")
        final = cfg
    else:
        if cfg != old:
            install.jdump(cfg, path)
            say(f"✓ config écrite : {path}")
        if publish:
            say("\n— Publication : les workflows, puis la page —")
            puts = publish_all(k, path)
            ids = names_of(install.jload(path))
            for p in puts:
                ident = p.split("/")[2]
                label = ids.get(ident, ident[:8])
                if label not in updated:
                    updated.append(label)
        else:
            say("\n(--no-publish) Rien de publié : python3 tools/publish.py all quand tu veux.")
        final = install.jload(path) if os.path.exists(path) else cfg

    say("\n— Résumé —")
    verb = "serait créé" if dry else "créé"
    say(f"  {verb} : " + (", ".join(created) if created else "rien"))
    say("  mis à jour : " + (", ".join(updated) if updated else "rien" + (" (dry-run)" if dry else " (--no-publish)" if not publish else "")))
    say("  ignoré : " + (", ".join(ignored) if ignored else "rien"))
    avail = available_models(final)
    say("  disponibles, non installés : " + (", ".join(avail) + " ; python3 tools/install.py les propose" if avail else "aucun"))
    keys = changed_keys(old, final)
    say("  clés de config changées : " + (", ".join(keys) if keys else "aucune") + (f" ; migrations : {', '.join(applied)}" if applied else ""))
    return {"created": created, "updated": updated, "ignored": ignored, "available": avail, "changed": keys, "migrations": applied}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", default=os.path.join(ROOT, "bureau.config.json"))
    ap.add_argument("--dry-run", action="store_true", help="affiche ce qui serait fait, sans rien créer, écrire ni publier")
    ap.add_argument("--no-publish", action="store_true", help="complète l'installation sans republier workflows et page")
    a = ap.parse_args(argv)
    upgrade(a.config, dry=a.dry_run, publish=not a.no_publish)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except InstallError as e:
        print(f"\n✗ {e}", file=sys.stderr)
        sys.exit(2)
    except KeyboardInterrupt:
        print("\nMise à jour interrompue : la sauvegarde de la config est dans " + BACKUPS, file=sys.stderr)
        sys.exit(130)
