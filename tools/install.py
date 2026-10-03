"""Installe Le Bureau dans un Kronn : pose les questions, crée la page, ses datasets, les workflows et le Quick Prompt
depuis les modèles (workflows/templates), écrit bureau.config.json, publie la page et lance un premier rafraîchissement.

  python3 tools/install.py                      # interactif
  python3 tools/install.py --answers rep.json   # réponses données d'avance (tests, réinstallation)
  python3 tools/install.py --dry-run            # pose les questions et affiche ce qui serait fait, sans rien créer
  python3 tools/install.py --disabled           # crée les crons désactivés

Relançable : les réponses et les ids déjà dans la config sont repris, ce qui existe est mis à jour, pas recréé.
L'installateur ne crée jamais de connexion Jira ni ne se connecte à GitHub à ta place : il dit comment faire.
Python 3 seul, sans dépendance (Pillow seulement pour un sprite fourni).
"""
import argparse, json, os, re, shutil, subprocess, sys, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import assemble, templates  # noqa: E402

LPC_GENERATOR = "https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator"
MIN_VERSION = (0, 14, 1)
# personnages de The Office proposés pour les workflows de la personne (recettes dans sprites/cast.json)
OFFICE = [("dwight", "Dwight"), ("jim", "Jim"), ("stanley", "Stanley"), ("phyllis", "Phyllis"), ("oscar", "Oscar"),
          ("angela", "Angela"), ("kevin", "Kevin"), ("creed", "Creed"), ("meredith", "Meredith"), ("toby", "Toby"),
          ("erin", "Erin"), ("ryan", "Ryan")]
AGENT_SEATS = [[23, 14], [23, 15], [23, 16], [25, 14], [25, 15], [25, 16], [29, 14], [29, 15], [29, 16], [31, 14], [31, 15], [31, 16]]
ROLES = {"dev": ("Développeur", None), "lead": ("Tech Lead", None), "qa": ("Testeur", "qa"), "po": ("Product owner", "po"),
         "sm": ("Facilitateur", "sm")}
DATASETS = ["office", "live", "team", "gates", "payroll", "avatars"]
CRONS = ("office", "live", "team", "payroll")


class InstallError(Exception):
    pass


def jload(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def jdump(obj, path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


# ---------- Kronn ----------
class Kronn:
    def __init__(self, api):
        self.api = api.rstrip("/")

    def call(self, method, path, body=None, timeout=60):
        req = urllib.request.Request(self.api + path, method=method, headers={"content-type": "application/json"},
                                     data=json.dumps(body).encode() if body is not None else None)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read()
        except urllib.error.HTTPError as e:
            raise InstallError(f"Kronn {method} {path} : HTTP {e.code} {e.read()[:300]!r}")
        except OSError as e:
            raise InstallError(f"Kronn injoignable ({self.api}) : {e}")
        d = json.loads(raw or b"{}")
        if isinstance(d, dict) and d.get("success") is False:
            raise InstallError(f"Kronn {method} {path} : {d.get('error')}")
        return d.get("data", d) if isinstance(d, dict) else d

    def get(self, path):
        return self.call("GET", path)


# ---------- questions ----------
class Asker:
    """Pose les questions dans le terminal, ou lit les réponses d'un fichier (clé = id de la question)."""

    def __init__(self, answers=None, previous=None):
        self.answers, self.previous = answers, previous or {}

    def _get(self, qid, prompt, default):
        if self.answers is not None:
            if qid in self.answers:
                return self.answers[qid]
            if default is not None:
                return default
            raise InstallError(f"réponse manquante dans le fichier : {qid} ({prompt})")
        suffix = f" [{default}]" if default not in (None, "") else ""
        v = input(f"{prompt}{suffix} : ").strip()
        return v if v else default

    def text(self, qid, prompt, default=None):
        return self._get(qid, prompt, self.previous.get(qid, default))

    def choice(self, qid, prompt, options, default=None):
        """options : [(valeur, libellé)] ; renvoie la valeur. Réponse : numéro, ou la valeur elle-même."""
        default = self.previous.get(qid, default)
        if self.answers is None:
            print(f"\n{prompt}")
            for i, (v, label) in enumerate(options, 1):
                print(f"  {i}) {label}" + ("   (actuel)" if v == default else ""))
        values = [v for v, _ in options]
        dflt = str(values.index(default) + 1) if default in values else None
        while True:
            a = self._get(qid, "Ton choix", dflt)
            if a in values:
                return a
            if isinstance(a, str) and a.isdigit() and 1 <= int(a) <= len(options):
                return values[int(a) - 1]
            if self.answers is not None:
                raise InstallError(f"réponse invalide pour {qid} : {a!r}")
            print("  Choix invalide.")

    def yes(self, qid, prompt, default=True):
        a = self._get(qid, prompt + (" (O/n)" if default else " (o/N)"), self.previous.get(qid, "o" if default else "n"))
        return a is True or str(a).strip().lower() in ("o", "oui", "y", "yes", "true", "1")


def say(msg):
    print(msg, flush=True)


# ---------- étapes ----------
def check_kronn(ask, defaults):
    api = ask.text("kronn_api", "Adresse de l'API Kronn", defaults["kronn"]["api"])
    k = Kronn(api)
    try:
        h = k.call("GET", "/health", timeout=10)
    except InstallError as e:
        raise InstallError(f"{e}\n  Lance Kronn, ou donne son adresse (question kronn_api).")
    v = tuple(int(x) for x in re.findall(r"\d+", str(h.get("version", "0")))[:3])
    if v < MIN_VERSION:
        raise InstallError(f"Kronn {h.get('version')} trop ancien : il faut {'.'.join(map(str, MIN_VERSION))} ou plus.")
    say(f"✓ Kronn {h.get('version')} sur {api}")
    ui = ask.text("kronn_ui", "Adresse de l'interface Kronn (liens de la page)", defaults["kronn"]["ui"])
    return k, {"api": api, "ui": ui}


def free_seats(roster):
    with open(os.path.join(ROOT, "page", "src", "00-config.js"), encoding="utf-8") as f:
        src = f.read()
    seats = json.loads(re.search(r"const FREE_SEATS = (\[\[.*?\]\]);", src).group(1))
    taken = {tuple(p["seat"]) for p in roster if p.get("seat")}
    return [s for s in seats if tuple(s) not in taken]


def who(ask, roster_doc):
    roster = roster_doc["people"]
    opts = [(p["key"], f"{p['name']} ({p['role']})") for p in roster] + [("__new__", "Quelqu'un d'autre (je m'ajoute à l'équipe)")]
    key = ask.choice("owner", "Qui es-tu ? Tu prendras le bureau du boss.", opts)
    if key != "__new__":
        return key, None
    name = ask.text("new_name", "Ton prénom (affiché)")
    person = ask.text("new_person", "Ton nom exact dans Jira (pour retrouver tes tickets)", name)
    role = ask.choice("new_role", "Ton rôle", [(k, v[0]) for k, v in ROLES.items()], "dev")
    seats = free_seats(roster)
    seat = ask.choice("new_seat", "Ta place quand tu n'es pas le boss", [(f"{s[0]},{s[1]}", f"[{s[0]},{s[1]}]") for s in seats],
                      f"{seats[0][0]},{seats[0][1]}" if seats else None)
    key = "p_" + re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    label, kind = ROLES[role]
    p = {"key": key, "name": name, "role": label, "person": person, "seat": [int(x) for x in seat.split(",")]}
    if kind:
        p["roleKind"] = kind
    return key, p


def project(ask, k):
    projs = k.get("/projects")
    if not projs:
        raise InstallError("Aucun projet dans ce Kronn : crée-en un (les workflows y seront rangés).")
    return ask.choice("project_id", "Projet Kronn qui portera les workflows du Bureau", [(p["id"], p["name"]) for p in projs])


def jira(ask, k, project_id, defaults, tpl_team):
    configs = [c for c in (k.get("/mcps").get("configs") or []) if c.get("server_id") == "mcp-atlassian"
               and (c.get("is_global") or project_id in (c.get("project_ids") or []))]
    opts = [(c["id"], c.get("label") or c["id"][:8]) for c in configs] + [("", "Pas de Jira (le Bureau tournera sans tickets ni sprint)")]
    if not configs:
        say("\n(i) Aucune connexion Atlassian dans ce Kronn. Pour avoir les tickets : Kronn > MCP > Atlassian, puis relance l'installateur.")
    cid = ask.choice("jira_config", "Connexion Jira (dans Kronn)", opts, configs[0]["id"] if configs else "")
    j = dict(defaults["jira"])
    if not cid:
        return {}
    j["config_id"] = cid
    j["project"] = ask.text("jira_project", "Projet Jira", j["project"])
    j["board"] = int(ask.text("jira_board", "Board scrum (id)", str(j["board"])))
    # test : le sprint actif du board, à travers Kronn (le token reste dans Kronn)
    step = next(s for s in templates.render(tpl_team, {"jira": j, "kronn": {"project_id": project_id}, "rhythm": defaults["rhythm"],
                                                         "page_id": "x", "owner": None, "github": defaults["github"]})["steps"]
                if s["name"] == "sprint_info")
    try:
        r = k.call("POST", "/workflow-steps/test-api-call", {"step": step, "project_id": project_id})
        blob = json.dumps(r)
        m = re.search(r'https://[a-z0-9.-]+\.atlassian\.net', blob)
        if m:
            j["site"] = m.group(0)
        ok = bool(r.get("success", r.get("ok", True))) if isinstance(r, dict) else True
        say(("✓" if ok and "sprint" in blob.lower() else "(!)") + f" Jira : board {j['board']} interrogé" + (f" ({j['site']})" if m else ""))
    except InstallError as e:
        say(f"(!) Test Jira impossible : {e}. On garde la connexion, à vérifier au premier run.")
    j["site"] = ask.text("jira_site", "Adresse du site Jira (liens des tickets)", j["site"])
    return j


def github(ask, defaults):
    g = dict(defaults["github"])
    login = None
    try:
        st = subprocess.run(["gh", "auth", "status"], capture_output=True, text=True, timeout=20)
        if st.returncode != 0:
            raise RuntimeError("gh non connecté")
        login = subprocess.run(["gh", "api", "user", "--jq", ".login"], capture_output=True, text=True, timeout=20).stdout.strip() or None
        say(f"✓ gh connecté{(' en tant que ' + login) if login else ''}")
    except (FileNotFoundError, RuntimeError, subprocess.TimeoutExpired) as e:
        say(f"(i) GitHub : {e if not isinstance(e, FileNotFoundError) else 'gh introuvable'}. Sans gh, pas de PR ni de MEP"
            " (installe gh puis `gh auth login`, rien d'autre à refaire).")
    g["repo"] = ask.text("github_repo", "Dépôt GitHub suivi", g["repo"])
    if login:
        r = subprocess.run(["gh", "repo", "view", g["repo"], "--json", "name"], capture_output=True, text=True, timeout=20)
        say(("✓" if r.returncode == 0 else "(!)") + f" accès au dépôt {g['repo']}" + ("" if r.returncode == 0 else " refusé"))
    return g, login


def ai_agent(ask, k):
    agents = [a for a in k.get("/agents") if a.get("installed") and a.get("enabled")]
    opts = [(a["agent_type"], a["name"]) for a in agents] + [("", "Aucun (bouton « Lui poser une question » masqué)")]
    return ask.choice("ai_agent", "Agent IA pour « interroger un agent » (quelques centimes par question)", opts,
                      agents[0]["agent_type"] if agents else "")


def my_agents(ask, k, previous):
    wfs = [w for w in k.get("/workflows") if not str(w.get("name", "")).startswith("Le Bureau") and w.get("enabled", True)]
    if not wfs:
        return [], None
    mode = ask.choice("agents", "Tes agents : un personnage de The Office pour chacun de tes workflows",
                      [("auto", f"Oui, attribuer automatiquement ({min(len(wfs), len(OFFICE))} personnages)"),
                       ("keep", "Garder ceux de ma config actuelle"), ("none", "Non, des intérimaires suffisent")],
                      "keep" if previous else "auto")
    if mode == "keep":
        return previous or [], None
    if mode == "none":
        return [], None
    def last(w):  # les plus actifs d'abord : date du dernier run
        lr = w.get("last_run")
        return str((lr or {}).get("started_at") or (lr or {}).get("finished_at") or "") if isinstance(lr, dict) else str(lr or "")
    picked = sorted(wfs, key=last, reverse=True)[:len(OFFICE)]
    agents = [{"key": OFFICE[i][0], "name": OFFICE[i][1], "role": re.sub(r"\s+", " ", w["name"])[:40], "wf": [w["id"][:8]],
               "seat": AGENT_SEATS[i]} for i, w in enumerate(picked)]
    for a in agents:
        say(f"  {a['name']:9} → {a['role']}")
    mep = ask.choice("mep_workflow", "Un de ces workflows pilote-t-il les mises en prod (scène MEP sur le plan) ?",
                     [("", "Non")] + [(w["id"][:8], w["name"]) for w in picked], "")
    return agents, mep or None


def avatar(ask, key, roster_doc, dry):
    a = ask.choice("avatar", "Ton avatar",
                   [("editor", "Je le personnaliserai dans la page (éditeur intégré, bouton ✎)"),
                    ("lpc", f"J'ai fait un sprite sur le générateur LPC ({LPC_GENERATOR})"),
                    ("default", "Celui par défaut")], "editor")
    if a == "lpc":
        say(f"  Sur {LPC_GENERATOR} : compose ton personnage, puis « Export to PNG » (planche de 832 px de large).")
        png = os.path.expanduser(ask.text("avatar_png", "Chemin du PNG exporté"))
        if not os.path.isfile(png):
            raise InstallError(f"fichier introuvable : {png}")
        folder = f"{key}_lpc"
        if not dry:
            dest = os.path.join(ROOT, "sprites", "custom", folder)
            os.makedirs(dest, exist_ok=True)
            shutil.copy(png, os.path.join(dest, os.path.basename(png)))
            for p in roster_doc["people"]:
                if p["key"] == key:
                    p["sprite"] = folder
            py = os.path.join(ROOT, ".venv", "bin", "python")
            r = subprocess.run([py if os.path.exists(py) else sys.executable, os.path.join(ROOT, "sprites", "build_sprites.py")],
                               capture_output=True, text=True)
            say("✓ sprite ajouté" if r.returncode == 0 else
                "(!) sprite copié, mais build_sprites.py a échoué (Pillow : python3 -m venv .venv && .venv/bin/pip install pillow) : "
                + r.stderr.strip()[-200:])
    music = ask.text("music", "Lien Suno de ta musique (facultatif, Entrée pour passer)", "")
    return music or None


# ---------- création dans Kronn ----------
def upsert_page(k, cfg, title, dry):
    if cfg.get("page_id"):
        try:
            k.get(f"/pages/{cfg['page_id']}")
            say(f"✓ page existante {cfg['page_id'][:8]}")
            return cfg["page_id"]
        except InstallError:
            say("(i) la page de la config n'existe plus : nouvelle page")
    if dry:
        return "00000000-0000-0000-0000-000000000000"
    p = k.call("POST", "/pages", {"title": title, "html": "<!doctype html><p>Installation du Bureau en cours…</p>",
                                  "datasets": [{"name": n, "kind": "snapshot", "max_points": 50000} for n in DATASETS]})
    say(f"✓ page créée {p['id'][:8]} (6 datasets)")
    return p["id"]


def upsert_all(k, cfg, tpls, enabled, dry):
    """Crée ou met à jour chaque workflow et le QP. Deux passes : la config injectée dans les scripts contient tous les ids."""
    for pass_ in (1, 2):
        for key, tpl in tpls.items():
            kind, (sec, field), _ = templates.TEMPLATES[key]
            if key == "ask" and not cfg.get("_ai_agent"):
                cfg.setdefault(sec, {})[field] = ""
                continue
            body = templates.render(tpl, cfg)
            if key == "ask":
                body["agent"] = cfg["_ai_agent"]
            ident = (cfg.get(sec) or {}).get(field)
            if dry:
                cfg.setdefault(sec, {})[field] = ident or f"dry-{key}"
                continue
            if kind == "workflow":
                body["enabled"] = enabled if key in CRONS else True
                if ident:
                    live = k.get(f"/workflows/{ident}")
                    ids = {s["name"]: s["id"] for s in live["steps"]}
                    for s in body["steps"]:
                        if s["name"] in ids:
                            s["id"] = ids[s["name"]]
                    k.call("PUT", f"/workflows/{ident}", body)
                else:
                    ident = k.call("POST", "/workflows", body)["id"]
            else:
                if ident:
                    k.call("PUT", f"/quick-prompts/{ident}", body)
                else:
                    ident = k.call("POST", "/quick-prompts", body)["id"]
            cfg.setdefault(sec, {})[field] = ident
            if pass_ == 2:
                say(f"✓ {key:9} {ident[:8]}" + ("" if kind != "workflow" or key not in CRONS or enabled else " (désactivé)"))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", default=os.path.join(ROOT, "bureau.config.json"))
    ap.add_argument("--answers", help="fichier JSON de réponses (id de question -> réponse)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--disabled", action="store_true", help="crons créés désactivés")
    ap.add_argument("--title", help="titre de la page (défaut : team/defaults.json)")
    ap.add_argument("--no-run", action="store_true", help="ne pas lancer le premier rafraîchissement")
    a = ap.parse_args(argv)

    defaults = jload(os.path.join(ROOT, "team", "defaults.json"))
    roster_path = os.path.join(ROOT, "team", "roster.json")
    roster_doc = jload(roster_path)
    old = jload(a.config) if os.path.exists(a.config) else {}
    previous = old.get("_answers") or {}
    ask = Asker(jload(a.answers) if a.answers else None, previous)
    tpls = templates.load_templates()

    say("— Le Bureau : installation —")
    k, kronn = check_kronn(ask, defaults)
    owner, new_person = who(ask, roster_doc)
    project_id = project(ask, k)
    kronn["project_id"] = project_id
    j = jira(ask, k, project_id, defaults, tpls["team"])
    g, gh_login = github(ask, defaults)
    if g is not None and gh_login:
        g["login"] = gh_login  # login du boss : « PR qui attendent ta review » dans la page
    ai = ai_agent(ask, k)
    agents, mep = my_agents(ask, k, old.get("agents"))
    if new_person:
        if gh_login:
            new_person["github"] = gh_login
        roster_doc["people"].append(new_person)
    music = avatar(ask, owner, roster_doc, a.dry_run)

    cfg = {"_doc": "Propre à cette installation, jamais partagé. Créé par tools/install.py (relançable).",
           "owner": owner, "kronn": kronn, "page_id": old.get("page_id"), "workflows": dict(old.get("workflows") or {}),
           "actions": dict(old.get("actions") or {}), "jira": j, "github": g, "rhythm": defaults["rhythm"],
           "mep_workflow": mep, "agents": agents, "_ai_agent": ai}
    name = next(p["name"] for p in roster_doc["people"] if p["key"] == owner)
    say("\n— Récapitulatif —")
    say(f"  Boss : {name} · projet Kronn {project_id[:8]} · agent IA : {ai or 'aucun'}")
    say(f"  Jira : {j['project'] + ' (board ' + str(j['board']) + ')' if j else 'non connecté : sprint, tickets, kanban masqués'}")
    say(f"  GitHub : {g['repo']}" + ("" if gh_login else " (gh non connecté : PR et MEP vides)"))
    say(f"  Agents : {len(agents)} personnage(s) · page : {'existante' if cfg['page_id'] else 'à créer'} · crons : "
        + ("désactivés" if a.disabled else "actifs"))
    if not ask.yes("confirm", "Créer ou mettre à jour tout ça dans Kronn ?"):
        say("Rien n'a été fait.")
        return 1

    title = a.title or defaults["page_title"]
    cfg["page_id"] = upsert_page(k, cfg, title, a.dry_run)
    upsert_all(k, cfg, tpls, not a.disabled, a.dry_run)
    cfg["_answers"] = {**previous, **(ask.answers or {}), "owner": owner, "project_id": project_id,
                       "jira_config": j.get("config_id", ""), "ai_agent": ai}
    ai_agent_value = cfg.pop("_ai_agent")
    if a.dry_run:
        say("\n(dry-run) Config qui serait écrite :")
        say(json.dumps({k_: v for k_, v in cfg.items() if not k_.startswith("_")}, ensure_ascii=False, indent=1)[:2500])
        return 0
    jdump(roster_doc, roster_path)
    if music:
        mp = os.path.join(ROOT, "sprites", "music", "music.json")
        m = jload(mp)
        sid = re.search(r"song/([0-9a-f-]{36})", music)
        m[owner] = {"title": "Sa musique", "url": music, **({"suno_id": sid.group(1)} if sid else {})}
        jdump(m, mp)
    jdump(cfg, a.config)
    say(f"✓ config écrite : {os.path.relpath(a.config, ROOT)}")
    html = assemble.build(demo=False, cfg=cfg)
    k.call("PUT", f"/pages/{cfg['page_id']}/html", {"html": html})
    say(f"✓ page publiée ({len(html.encode()) // 1024} Ko)")
    if not a.no_run and not a.disabled:
        for key in CRONS:
            wid = cfg["workflows"].get(key)
            if wid:
                try:
                    k.call("POST", "/mcp/workflow-trigger", {"workflow_id": wid})
                except InstallError as e:
                    say(f"(!) premier run de {key} : {e}")
        say("✓ premier rafraîchissement lancé (les données arrivent en 1 à 2 minutes)")
    say(f"\nLe Bureau est prêt : {kronn['ui'].rstrip('/')}/#page/{cfg['page_id']}")
    _ = ai_agent_value
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except InstallError as e:
        print(f"\n✗ {e}", file=sys.stderr)
        sys.exit(2)
    except (KeyboardInterrupt, EOFError):
        print("\nInstallation interrompue, rien de plus n'a été fait.", file=sys.stderr)
        sys.exit(130)
