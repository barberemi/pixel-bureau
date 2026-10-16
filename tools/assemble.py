"""Assemble la page autonome : modèle + calques LPC + recettes + sprites fournis + instantanés de démo -> dist/office.html.

Sources de la page : page/office_template.html (squelette HTML + blocs kronn-action) avec deux marqueurs,
`/*__STYLES__*/` <- page/src/styles.css et `/*__SCRIPTS__*/` <- page/src/*.js concaténés dans l'ordre du nom
(00-, 10-, ...) en un seul <script> inline : une seule portée globale, pas de modules, pas de bundler.

Les avatars sont assemblés dans le navigateur (calques de sprites/layers.json + recettes de sprites/cast.json et du
profil d'équipe) ; seuls les sprites fournis tels quels (teams/<équipe>/sprites/, sprites/custom/) sont embarqués comme planches.
"""
import base64, json, math, os, re, sys
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compact import strip_css, strip_js  # noqa: E402

# boutons de la page : bloc kronn-action du squelette -> (clé dans bureau.config.json « actions » ou « launch »,
# marqueur de l'id). actions = workflows du Bureau (créés par l'installateur) ; launch = tes workflows lancés depuis la
# fiche d'un ticket ou d'une PR (impl : clé du ticket ; mep : clé + n° de PR ; review : dépôt + n° de PR ; fix : n° de PR + consignes,
# et le dépôt si ton workflow le prend (launch.fix.vars.repo) ;
# estimate : clé du ticket, Story Points et raison saisis dans la carte)
ACTIONS = {"bureau-avatar": ("avatar", "__AVATAR_WF__"), "bureau-gate": ("gate", "__GATE_WF__"), "bureau-answer": ("answer", "__ANSWER_WF__"),
           "bureau-relaunch": ("relaunch", "__RELAUNCH_WF__"), "bureau-launch": ("relaunch", "__RELAUNCH_WF__"), "bureau-ask": ("ask", "__ASK_QP__"),
           "bureau-impl": ("impl", "__IMPL_WF__"), "bureau-mep": ("mep", "__MEP_WF__"),
           "bureau-review": ("review", "__REVIEW_WF__"), "bureau-fix": ("fix", "__FIX_WF__"),
           "bureau-comment": ("comment", "__COMMENT_WF__"), "bureau-duck": ("duck", "__DUCK_WF__"),
           "bureau-estimate": ("estimate", "__ESTIMATE_WF__"), "bureau-mailrules": ("mail_rules", "__MAILRULES_WF__"),
           "bureau-agent": ("agent", "__AGENT_WF__"), "bureau-pages": ("pages", "__PAGES_WF__"),
           "bureau-meppr": ("mep_pr", "__MEPPR_WF__")}
# variables des workflows de la clé launch : rôle -> nom par défaut ; launch.<action> = id seul, ou {wf, vars: {rôle: nom
# chez toi, ou null si ton workflow n'a pas cette variable}}
LAUNCH_VARS = {"impl": {"ticket": "jira_ticket_key"}, "mep": {"ticket": "jira_ticket_key", "pr": "pr_number"},
               "review": {"repo": "repo", "pr": "pr"}, "fix": {"pr": "pr", "notes": "notes", "repo": "repo"},
               "estimate": {"ticket": "jira_ticket_key", "points": "story_points", "reason": "raison"},
               "mep_pr": {}}  # mise en prod d'une PR (#58) : le modèle mep.json du Bureau, variables fixes
# rôles facultatifs : absents du bloc tant que launch.<action>.vars ne les nomme pas (#56 : un workflow « Corriger »
# d'un seul dépôt n'a pas de variable repo ; il ne reçoit alors que les PR du dépôt principal)
LAUNCH_OPTIONAL = {"fix": ("repo",)}
ACTION_RE = re.compile(r'<script type="application/kronn-action" data-action-id="([^"]+)">.*?</script>\n?', re.S)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = lambda *a: os.path.join(ROOT, *a)

SRC = p("page", "src")
JS_FILES = sorted(f for f in os.listdir(SRC) if f.endswith(".js"))
# thèmes d'interface (ui.skin, bouton 🎨) : leurs couleurs, posées après styles.css et pixel.css (habillage commun)
THEME_FILES = sorted(f for f in os.listdir(SRC) if f.startswith("theme-") and f.endswith(".css"))


def theme_paths(cfg=None):
    """Fichiers des thèmes d'interface {id: chemin} : page/src/theme-<id>.css, puis ceux du pack d'équipe
    (<pack>/themes/theme-<id>.css), qui remplacent un thème de même id."""
    out = {f[len("theme-"):-len(".css")]: os.path.join(SRC, f) for f in THEME_FILES}
    d = team_dir(cfg)
    tdir = os.path.join(d, "themes") if d else None
    if tdir and os.path.isdir(tdir):
        for f in sorted(os.listdir(tdir)):
            if f.startswith("theme-") and f.endswith(".css"):
                out[f[len("theme-"):-len(".css")]] = os.path.join(tdir, f)
    return out


def themes(cfg=None):
    """Thèmes d'interface {id: nom}, nom lu dans la première ligne du fichier « /* @nom: … */ »."""
    out = {}
    for t, path in theme_paths(cfg).items():
        m = re.match(r"/\*\s*@nom:\s*(.+?)\s*\*/", Path(path).read_text())
        assert m, f"{path} : première ligne attendue /* @nom: Nom du thème */"
        out[t] = m.group(1)
    return out


def _nl(s):
    return s if s.endswith("\n") else s + "\n"


def page_parts(cfg=None):
    """(css, js, polices) : le CSS compacté (polices comprises), le JS compacté, et les octets des polices en base64.
    cfg : pour les thèmes du pack d'équipe (défaut : ceux de page/src seulement)."""
    # styles.css, pixel.css (habillage commun) puis les thèmes, qui l'emportent à spécificité égale ;
    # @@font:chemin@@ = police intégrée en base64 (la sandbox des pages n'accepte que font-src data:), chemin relatif
    # au dépôt, ou au pack pour un thème du pack
    fonts = [0]

    def embed(path):
        b64 = base64.b64encode(Path(path).read_bytes()).decode()
        fonts[0] += len(b64)
        return b64

    def font(css, base):
        return re.sub(r"@@font:([\w./-]+)@@", lambda m: embed(os.path.join(base, m.group(1))), css)
    pack = team_dir(cfg)
    files = [os.path.join(SRC, f) for f in ["styles.css", "pixel.css"]] + list(theme_paths(cfg).values())
    css = "".join(font(_nl(Path(f).read_text()), pack if pack and f.startswith(pack + os.sep) else ROOT) for f in files)
    css = strip_css(css)  # KT-28 : sans commentaires ni indentation (tools/compact.py), les sources gardent les leurs
    js = strip_js("".join(_nl(Path(os.path.join(SRC, f)).read_text()) for f in JS_FILES))
    return css, js, fonts[0]


def page_html(cfg=None):
    """Squelette + CSS + JS concaténés, avant le remplacement des marqueurs de données (__SPRITES__...).
    cfg : pour les thèmes du pack d'équipe (défaut : ceux de page/src seulement)."""
    html = Path(p("page", "office_template.html")).read_text()
    css, js, _ = page_parts(cfg)
    for mark, body in (("/*__STYLES__*/", css), ("/*__SCRIPTS__*/", js)):
        assert html.count(mark + "\n") == 1, mark
        # le marqueur occupe sa propre ligne ; chaque fichier source se termine par un saut de ligne
        html = html.replace(mark + "\n", _nl(body))
    return html


def config():
    """bureau.config.json (propre à l'installation) ; absent : page sans boss ni boutons d'action."""
    try:
        return json.loads(Path(p("bureau.config.json")).read_text())
    except FileNotFoundError:
        return {}


def demo_config():
    """Installation de démonstration (équipe fictive) : aperçu local, captures de la documentation, tests."""
    return json.loads(Path(p("tests", "fixtures", "bureau.config.json")).read_text())


def cron_hours(cfg):
    """Heures UTC où tournent les crons du Bureau (champ « heures » de leurs expressions cron, que Kronn lit en UTC) :
    les heures de bureau (rhythm.office_hours, heure locale de rhythm.timezone), 2 h avant et 1 h après, été comme hiver.
    Paris, 8h-20h : « 4-20 ». Une plage qui passe minuit UTC devient deux plages (« 13-23,0-4 »)."""
    r = (cfg or {}).get("rhythm") or {}
    tz = ZoneInfo(r.get("timezone") or "Europe/Paris")
    h0, h1 = (r.get("office_hours") or [8, 20])[:2]
    year = datetime.now().year
    offs = [tz.utcoffset(datetime(year, m, 1)).total_seconds() / 3600 for m in (1, 7)]  # hiver et été
    a, b = math.floor(h0 - 2 - max(offs)), math.ceil(h1 + 1 - min(offs))
    if b - a >= 23:
        return "*"
    a, b = a % 24, b % 24
    span = lambda x, y: str(x) if x == y else f"{x}-{y}"
    return span(a, b) if a <= b else f"{span(a, 23)},{span(0, b)}"


def cron_schedules(cfg=None):
    """Calendrier de chaque cron du Bureau : celui de ses modèles (workflows/templates), heures calées sur le bureau."""
    out = {}
    for key in ("office", "live", "team", "payroll", "canard", "absences", "courrier"):
        path = p("workflows", "templates", key + ".json")
        if os.path.exists(path):
            s = (json.loads(Path(path).read_text())["definition"].get("trigger") or {}).get("schedule")
            out[key] = s.replace("@@cron_hours@@", cron_hours(cfg)) if s else s
    return out


def version():
    """Version du Bureau (fichier VERSION, « 0.MINOR.PATCH ») : affichée en pied de page, tag de la release (KT-66)."""
    return Path(p("VERSION")).read_text().strip()


def mep_projects(cfg):
    """Projets qu'on peut mettre en prod (#58) : le dépôt principal (github) et ceux de github.deploys qui ont une clé mep,
    comme projects() de workflows/mep.py ; [(dépôt, nom court)]."""
    g = (cfg or {}).get("github") or {}
    out = []
    for d in [g] + list(g.get("deploys") or []):
        if d.get("repo") and isinstance(d.get("mep"), dict) and d.get("prod_workflow") and d["repo"] not in [r for r, _ in out]:
            out.append((d["repo"], d.get("label") or d["repo"].split("/")[-1]))
    return out


def page_config(cfg):
    """La partie de bureau.config.json utile à la page (pas d'ids de workflows ni de connexions)."""
    return {
        "kronn_ui": (cfg.get("kronn") or {}).get("ui"),
        "mep_repos": [r for r, _ in mep_projects(cfg)],  # « 🚀 Mise en prod » sur les PR de ces dépôts (#58)
        "jira_site": (cfg.get("jira") or {}).get("site"),
        # statuts Jira des scènes d'équipe : ticket à tester, validé, réouvert
        "jira_flow": {**JIRA_FLOW, **{k: v for k, v in ((cfg.get("jira") or {}).get("flow") or {}).items() if v}},
        "github_repo": (cfg.get("github") or {}).get("repo"),
        # « Corriger » sur la PR d'un autre dépôt : seulement si ton workflow prend le dépôt (launch.fix.vars.repo, #56)
        "fix_any_repo": bool(launch(cfg).get("fix", ("", {}))[1].get("repo")),
        "rhythm": cfg.get("rhythm") or {},
        "mep_workflow": cfg.get("mep_workflow"),
        "workflows": cfg.get("workflows") or {},  # ids des crons : calendrier et fraîcheur des données
        "schedules": cron_schedules(cfg),  # calendrier des crons du Bureau (modèles de workflows)
        "agents": cfg.get("agents") or [],
        "ui": cfg.get("ui") or {},
        "skins": themes(cfg),  # thèmes d'interface (theme-*.css) proposés par le bouton 🎨
    }


# statuts Jira par défaut du flux de l'équipe (jira.flow) : requêtes du cron équipe et scènes de la page
JIRA_FLOW = {"triage_from": "Proposed", "test": "To Test", "validated": "To Deploy", "reopened": "Reopen"}
DEFAULT_LAYOUT = "layouts/open-space.json"  # plan type, sans équipe


# ---------- profils d'équipe (teams/<équipe>/) et packs d'équipe (KT-60) ----------
# Un profil = team.json (nom, organisation GitHub requise, plan), roster.json, defaults.json, cast.json, sprites.json,
# music/ ; un pack d'équipe = le même dossier hors du dépôt (ex. un dépôt privé), qui peut apporter en plus ses plans
# (layouts/) et ses thèmes de page (themes/theme-<id>.css, polices dans fonts/). Format : docs/conventions/pack-equipe.md.
# bureau.config.json, clé team : l'id d'un profil de teams/, ou le chemin d'un pack (« ~/Sites/bureau-monequipe ») ;
# absente = équipe neuve (roster vide).
# Les personnes ajoutées à une installation (clé people de la config, jamais commitée) suivent le roster du profil.
TEAMS = p("teams")  # profils d'équipe du dépôt (aucun n'est livré : une équipe vit dans son pack)


def teams():
    """Profils d'équipe disponibles : {id: team.json}."""
    base = TEAMS
    out = {}
    for d in sorted(os.listdir(base)) if os.path.isdir(base) else []:
        if os.path.exists(os.path.join(base, d, "team.json")):
            out[d] = json.loads(Path(os.path.join(base, d, "team.json")).read_text())
    return out


def is_pack(team):
    """La clé team désigne-t-elle un pack (un chemin) plutôt qu'un profil de teams/ (un id) ?"""
    return isinstance(team, str) and ("/" in team or team.startswith(("~", ".")))


def team_dir(cfg):
    """Dossier de l'équipe de l'installation : le pack (chemin, ~ compris ; relatif = au dépôt) ou teams/<id> ;
    None pour une équipe neuve. Un pack introuvable est une erreur : la page n'aurait plus son équipe."""
    t = (cfg or {}).get("team")
    if not t:
        return None
    if is_pack(t):
        d = os.path.abspath(os.path.join(ROOT, os.path.expanduser(t)))
        if not os.path.isfile(os.path.join(d, "team.json")):
            raise ValueError(f"pack d'équipe introuvable : {t} (team.json attendu dans {d})")
        return d
    d = os.path.join(TEAMS, t)
    return d if os.path.isdir(d) else None


def team_meta(cfg):
    """team.json de l'équipe de l'installation ({} pour une équipe neuve)."""
    d = team_dir(cfg)
    return json.loads(Path(os.path.join(d, "team.json")).read_text()) if d and os.path.exists(os.path.join(d, "team.json")) else {}


def _team_file(cfg, *parts):
    d = team_dir(cfg)
    path = os.path.join(d, *parts) if d else None
    return path if path and os.path.exists(path) else None


def roster(cfg):
    """L'équipe de l'installation : roster du profil, puis les personnes ajoutées à l'installation (clé people)."""
    path = _team_file(cfg, "roster.json")
    people = json.loads(Path(path).read_text())["people"] if path else []
    return people + list((cfg or {}).get("people") or [])


def guests(cfg):
    """Invités de passage : les communs (team/guests.json : les hérauts Yoda et Gandalf ; config common_guests false pour
    les retirer), puis ceux du profil (clé guests de son roster), puis ceux de l'installation. Même clé : le dernier
    remplace le précédent. Au plus une visite par jour ouvré."""
    path = _team_file(cfg, "roster.json")
    common = [] if (cfg or {}).get("common_guests") is False else json.loads(Path(p("team", "guests.json")).read_text())["guests"]
    out = {}
    for g in common + (json.loads(Path(path).read_text()).get("guests") or [] if path else []) + list((cfg or {}).get("guests") or []):
        out.pop(g["key"], None)
        out[g["key"]] = g
    return list(out.values())


def defaults(cfg):
    """Valeurs proposées à l'installation : team/defaults.json, complété par le profil (clé à clé au premier niveau)."""
    d = json.loads(Path(p("team", "defaults.json")).read_text())
    path = _team_file(cfg, "defaults.json")
    if path:
        for k, v in json.loads(Path(path).read_text()).items():
            if not k.startswith("_"):
                d[k] = {**d[k], **v} if isinstance(v, dict) and isinstance(d.get(k), dict) else v
    return d


def gitfut(cfg):
    """Cartes GitFut de la fiche, {clé: login GitHub} : la clé gitfut de la config si elle est posée (false = aucune
    carte), sinon toute personne du roster qui a son login GitHub (champ github, le vrai login : gitfut.com/<login>)."""
    v = (cfg or {}).get("gitfut")
    if v is False:
        return {}
    if isinstance(v, dict):
        return v
    return {p["key"]: p["github"] for p in roster(cfg) if p.get("github")}


def planning_names(cfg):
    """{clé: nom complet} des personnes du roster (champ person, sinon name), pour retrouver chacun dans le planning des
    absences (« Nom Prénom » du classeur, comparé sans accents ni ordre des mots)."""
    return {p["key"]: p.get("person") or p.get("name") for p in roster(cfg) if p.get("key") and (p.get("person") or p.get("name"))}


def wiki_posters(cfg):
    """Pages de la Wikipédia anglaise des affiches des cartes Top 3 : celles du roster (passion.top3.wiki), puis la
    clé wiki_posters de la config, sans doublon."""
    pages = [w for p in roster(cfg) for w in (((p.get("passion") or {}).get("top3") or {}).get("wiki") or [])]
    pages += list((cfg or {}).get("wiki_posters") or [])
    return list(dict.fromkeys(w for w in pages if isinstance(w, str) and w))


def music(cfg):
    """Morceaux des collègues (carte « Sa musique ») : ceux du profil, puis ceux de l'installation (clé music)."""
    path = _team_file(cfg, "music", "music.json")
    m = json.loads(Path(path).read_text()) if path else {}
    for v in m.values():
        if v.get("cover"):  # pochette embarquée en data URI, rangée à côté de music.json
            v["cover"] = Path(os.path.join(os.path.dirname(path), v["cover"])).read_text().strip()
    return {**m, **((cfg or {}).get("music") or {})}


def recipes(cfg):
    """Recettes des avatars : communes (agents, intérimaires, visiteurs, équipe de démo), puis celles du profil."""
    path = _team_file(cfg, "cast.json")
    return {**json.loads(Path(p("sprites", "cast.json")).read_text()), **(json.loads(Path(path).read_text()) if path else {})}


def sprites(cfg):
    """Sprites fournis tels quels (planches) : les communs (sprites/common.json, hérauts), ceux de l'installation
    (sprites/sprites.json, local), puis ceux du profil. Les avatars des recettes sont composés dans le navigateur :
    leurs planches ne sont pas embarquées."""
    local = p("sprites", "sprites.json")
    shared = json.loads(Path(p("sprites", "common.json")).read_text())
    common = json.loads(Path(p("sprites", "cast.json")).read_text())
    out = {k: v for k, v in (json.loads(Path(local).read_text()) if os.path.exists(local) else {}).items() if k not in common}
    path = _team_file(cfg, "sprites.json")
    every = {**shared, **out, **(json.loads(Path(path).read_text()) if path else {})}
    used = used_sprites(cfg)
    return {k: v for k, v in every.items() if k in used}


def used_sprites(cfg):
    """Noms de sprite qu'un personnage peut porter (KT-28 : seules ces planches sont embarquées) : clé ou sprite du
    roster, des invités et des agents (sprite d'un personnage = son sprite, sinon sa clé), boss_sprite, et tout nom
    cité entre apostrophes dans le JS de la page (« 'temp' », VISITOR)."""
    defs = roster(cfg) + guests(cfg) + list((cfg or {}).get("agents") or [])
    names = {d.get(f) for d in defs for f in ("key", "sprite", "boss_sprite")} - {None}
    js = "".join(Path(os.path.join(SRC, f)).read_text() for f in JS_FILES)
    return names | set(re.findall(r"'([\w-]+)'", js))


def layout_path(cfg):
    """Plan du bureau de cette installation : clé layout de la config, sinon celui du profil ou du pack (chemin relatif
    au pack s'il y est, sinon au dépôt), sinon le plan type."""
    if (cfg or {}).get("layout"):
        return cfg["layout"]
    lay, d = team_meta(cfg).get("layout"), team_dir(cfg)
    if lay and d and os.path.exists(os.path.join(d, lay)):
        return os.path.join(d, lay)
    return lay or DEFAULT_LAYOUT


def launch(cfg):
    """Clé launch : {action: (id du workflow, {nom par défaut: nom chez toi, ou None})}. Rôle inconnu : ValueError."""
    out = {}
    for k, v in ((cfg or {}).get("launch") or {}).items():
        wf, names = (v.get("wf") or "", v.get("vars") or {}) if isinstance(v, dict) else (v or "", {})
        roles = LAUNCH_VARS.get(k, {})
        bad = sorted(set(names) - set(roles))
        if bad:
            raise ValueError(f"launch.{k}.vars : rôle inconnu {', '.join(bad)} (rôles : {', '.join(roles) or 'aucun'})")
        out[k] = (wf, {roles[r]: n for r, n in names.items()})
    return out


def action_ids(cfg):
    """Id de la cible de chaque bouton : workflows du Bureau (actions), puis tes workflows (launch)."""
    return {**(cfg.get("actions") or {}), **{k: wf for k, (wf, _) in launch(cfg).items()}}


def action_block(block, cfg):
    """Bloc kronn-action du squelette prêt pour cette installation : id de la cible, variables renommées (launch.vars)."""
    aid = re.search(r'data-action-id="([^"]+)"', block).group(1)
    key, mark = ACTIONS[aid]
    block = block.replace(mark, action_ids(cfg).get(key) or "")
    names = {**{LAUNCH_VARS[key][r]: None for r in LAUNCH_OPTIONAL.get(key, ())}, **launch(cfg).get(key, ("", {}))[1]}
    if not names:
        return block
    m = re.match(r"(<script[^>]*>)(.*?)(</script>\n?)$", block, re.S)
    spec = json.loads(m.group(2))
    spec["values"] = [dict(v, name=names.get(v["name"], v["name"])) for v in spec["values"] if names.get(v["name"], v["name"])]
    return m.group(1) + json.dumps(spec, ensure_ascii=False, separators=(",", ":")) + m.group(3)


def action_binds(html):
    """Pour chaque bloc kronn-action de la page : {nom de chaque valeur liée : champ de la ligne relue (find(champ))}.
    Kronn attend ces noms, renommages de launch.vars compris, comme clés de data-kronn-bindings."""
    out = {}
    for m in ACTION_RE.finditer(html):
        spec = json.loads(re.search(r">(.*)</script>", m.group(0), re.S).group(1))
        out[m.group(1)] = {v["name"]: f.group(1) for v in spec.get("values") or [] if v.get("provenance") == "dynamic_binding"
                           for f in [re.search(r"\.find\((\w+)\)", v.get("source_ref") or "")] if f}
    return out


def demo_team(cfg):
    """Instantané d'équipe de la démo (data/team_snapshot.json). Avec une autre équipe (pack, smoke.py et shots.py --team),
    réattribué à ses personnes : boss au boss, puis même métier dans l'ordre (« Testeuse » et « Testeur » vont ensemble),
    puis le reste dans l'ordre ; noms complets et prénoms remplacés partout. Une personne de la démo en trop reste de passage."""
    with open(p("data", "team_snapshot.json")) as f:
        text = f.read()
    base = demo_config()
    src, dst = roster(base), roster(cfg)
    if [x.get("key") for x in src] == [x.get("key") for x in dst]:
        return text
    trade = lambda x: str(x.get("role") or "").lower()[:5]  # noqa: E731
    boss = lambda r, c: [x for x in r if x.get("key") == c.get("owner")]  # noqa: E731
    pairs = list(zip(boss(src, base), boss(dst, cfg)))
    left = [x for x in dst if x not in [b for _, b in pairs]]
    alone = []
    for a in (x for x in src if x not in [s for s, _ in pairs]):
        b = next((x for x in left if trade(x) == trade(a)), None)
        if b:
            pairs.append((a, b))
            left.remove(b)
        else:
            alone.append(a)
    pairs += list(zip(alone, left))
    names = {}
    for a, b in pairs:
        names[a.get("person") or a["name"]] = b.get("person") or b["name"]
        names[a["name"]] = b["name"]
    rx = re.compile(r"\b(" + "|".join(map(re.escape, sorted(names, key=len, reverse=True))) + r")\b")
    return rx.sub(lambda m: names[m.group(1)], text)


def tight(data):
    """JSON embarqué sans espaces (KT-28 : poids de la page) ; data = objet ou texte JSON (fichier)."""
    return json.dumps(json.loads(data) if isinstance(data, str) else data, ensure_ascii=False, separators=(",", ":"))


def to_second(text):
    """Instantanés de démo embarqués : horodatages à la seconde (les fractions ne servent pas au rejeu)."""
    return re.sub(r"(T\d\d:\d\d:\d\d)\.\d+(?=Z|[+-]\d\d:\d\d)", r"\1", text)


def demo_snap():
    return to_second(tight(Path(p("data", "office_snapshot.json")).read_text()))


def build(demo=True, cfg=None):
    """Page complète. demo : instantanés de démo embarqués (aperçu local, tests) ; la page publiée n'en a pas.
    cfg : config d'installation (défaut : bureau.config.json)."""
    cfg = config() if cfg is None else cfg
    ids = action_ids(cfg)
    acts = {k: ids.get(k) or "" for k, _ in ACTIONS.values()}
    html = page_html(cfg)
    # bouton sans workflow configuré : sa carte kronn-action disparaît (la page masque le bouton)
    html = ACTION_RE.sub(lambda m: action_block(m.group(0), cfg) if acts[ACTIONS[m.group(1)][0]] else "", html)
    cast, custom = recipes(cfg), sprites(cfg)
    html = (html.replace("__SPRITES__", tight(custom))
                .replace("__LAYERS__", Path(p("sprites", "layers.json")).read_text())
                .replace("__MUSIC__", tight(music(cfg)))
                .replace("__CAST__", tight(cast))
                .replace("__ROSTER__", tight({"people": roster(cfg), "guests": guests(cfg)}))
                .replace("__LAYOUT__", tight(Path(p(layout_path(cfg))).read_text()))
                .replace("__OWNER__", json.dumps(cfg.get("owner")))
                .replace("__CONFIG__", json.dumps(page_config(cfg), ensure_ascii=False))
                .replace("__ACTIONS__", json.dumps({k: bool(v) for k, v in acts.items()}))
                .replace("__ACTION_BINDS__", json.dumps(action_binds(html)))
                .replace("__DEMO__", "true" if demo else "false")
                .replace("__VERSION__", version())
                .replace("__SNAP__", demo_snap() if demo else "null")
                .replace("__TEAM__", to_second(tight(demo_team(cfg))) if demo else "null"))
    for _, mark in ACTIONS.values():
        html = html.replace(mark, acts[ACTIONS_BY_MARK[mark]])
    return html


ACTIONS_BY_MARK = {mark: key for key, mark in ACTIONS.values()}


def weights(cfg=None, demo=True):
    """Poids de la page par bloc, en octets (KT-28, affiché par tools/smoke.py) : JS et CSS compactés, polices en base64,
    sprites fournis et calques LPC de l'éditeur, données de l'équipe (recettes, roster, plan, musique), instantanés de
    démo ; le reste (squelette, config de la page, blocs d'action) par différence avec la page assemblée."""
    cfg = config() if cfg is None else cfg
    b = lambda s: len(s.encode())  # noqa: E731
    css, js, fonts = page_parts(cfg)
    w = {"JS": b(js), "CSS": b(css) - fonts, "polices": fonts,
         "sprites et calques": b(tight(sprites(cfg))) + b(Path(p("sprites", "layers.json")).read_text()),
         "équipe et plan": b(tight(recipes(cfg))) + b(tight({"people": roster(cfg), "guests": guests(cfg)}))
         + b(tight(Path(p(layout_path(cfg))).read_text())) + b(tight(music(cfg))),
         "démo": b(demo_snap()) + b(to_second(tight(demo_team(cfg)))) if demo else 0}
    w["squelette et réglages"] = b(build(demo=demo, cfg=cfg)) - sum(w.values())
    return w


if __name__ == "__main__":
    html = build()
    os.makedirs(p("dist"), exist_ok=True)
    Path(p("dist", "office.html")).write_text(html)
    print("dist/office.html", len(html.encode()), "octets (limite Kronn : 1 000 000)")
