"""Assemble la page autonome : modèle + calques LPC + recettes + sprites fournis + instantanés de démo -> dist/office.html.

Sources de la page : page/office_template.html (squelette HTML + blocs kronn-action) avec deux marqueurs,
`/*__STYLES__*/` <- page/src/styles.css et `/*__SCRIPTS__*/` <- page/src/*.js concaténés dans l'ordre du nom
(00-, 10-, ...) en un seul <script> inline : une seule portée globale, pas de modules, pas de bundler.

Les avatars sont assemblés dans le navigateur (calques de sprites/layers.json + recettes de sprites/cast.json et du
profil d'équipe) ; seuls les sprites fournis tels quels (teams/<équipe>/sprites/, sprites/custom/) sont embarqués comme planches.
"""
import json, math, os, re
from datetime import datetime
from zoneinfo import ZoneInfo

# boutons de la page : bloc kronn-action du squelette -> (clé dans bureau.config.json « actions » ou « launch »,
# marqueur de l'id). actions = workflows du Bureau (créés par l'installateur) ; launch = tes workflows lancés depuis la
# fiche d'un ticket (impl : clé du ticket ; mep : clé + n° de PR ; review : dépôt + n° de PR ; fix : n° de PR + consignes)
ACTIONS = {"bureau-avatar": ("avatar", "__AVATAR_WF__"), "bureau-gate": ("gate", "__GATE_WF__"),
           "bureau-relaunch": ("relaunch", "__RELAUNCH_WF__"), "bureau-ask": ("ask", "__ASK_QP__"),
           "bureau-impl": ("impl", "__IMPL_WF__"), "bureau-mep": ("mep", "__MEP_WF__"),
           "bureau-review": ("review", "__REVIEW_WF__"), "bureau-fix": ("fix", "__FIX_WF__")}
ACTION_RE = re.compile(r'<script type="application/kronn-action" data-action-id="([^"]+)">.*?</script>\n?', re.S)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = lambda *a: os.path.join(ROOT, *a)

SRC = p("page", "src")
JS_FILES = sorted(f for f in os.listdir(SRC) if f.endswith(".js"))


def _nl(s):
    return s if s.endswith("\n") else s + "\n"


def page_html():
    """Squelette + CSS + JS concaténés, avant le remplacement des marqueurs de données (__SPRITES__...)."""
    html = open(p("page", "office_template.html")).read()
    css = open(os.path.join(SRC, "styles.css")).read()
    js = "".join(_nl(open(os.path.join(SRC, f)).read()) for f in JS_FILES)
    for mark, body in (("/*__STYLES__*/", css), ("/*__SCRIPTS__*/", js)):
        assert html.count(mark + "\n") == 1, mark
        # le marqueur occupe sa propre ligne ; chaque fichier source se termine par un saut de ligne
        html = html.replace(mark + "\n", _nl(body))
    return html


def config():
    """bureau.config.json (propre à l'installation) ; absent : page sans boss ni boutons d'action."""
    try:
        return json.load(open(p("bureau.config.json")))
    except FileNotFoundError:
        return {}


def demo_config():
    """Installation de démonstration (équipe fictive) : aperçu local, captures de la documentation, tests."""
    return json.load(open(p("tests", "fixtures", "bureau.config.json")))


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
    for key in ("office", "live", "team", "payroll"):
        path = p("workflows", "templates", key + ".json")
        if os.path.exists(path):
            s = (json.load(open(path))["definition"].get("trigger") or {}).get("schedule")
            out[key] = s.replace("@@cron_hours@@", cron_hours(cfg)) if s else s
    return out


def page_config(cfg):
    """La partie de bureau.config.json utile à la page (pas d'ids de workflows ni de connexions)."""
    return {
        "kronn_ui": (cfg.get("kronn") or {}).get("ui"),
        "jira_site": (cfg.get("jira") or {}).get("site"),
        # statuts Jira des scènes d'équipe : ticket à tester, validé, réouvert
        "jira_flow": {**JIRA_FLOW, **{k: v for k, v in ((cfg.get("jira") or {}).get("flow") or {}).items() if v}},
        "github_repo": (cfg.get("github") or {}).get("repo"),
        "github_login": (cfg.get("github") or {}).get("login"),
        "rhythm": cfg.get("rhythm") or {},
        "mep_workflow": cfg.get("mep_workflow"),
        "workflows": cfg.get("workflows") or {},  # ids des crons : calendrier et fraîcheur des données
        "schedules": cron_schedules(cfg),  # calendrier des crons du Bureau (modèles de workflows)
        "agents": cfg.get("agents") or [],
        "ui": cfg.get("ui") or {},  # réglages d'affichage (ex. ui.todo : open / folded / hidden)
    }


# statuts Jira par défaut du flux de l'équipe (jira.flow) : requêtes du cron équipe et scènes de la page
JIRA_FLOW = {"triage_from": "Proposed", "test": "To Test", "validated": "To Deploy", "reopened": "Reopen"}
DEFAULT_LAYOUT = "layouts/open-space.json"  # plan type, sans équipe


# ---------- profils d'équipe (teams/<équipe>/) ----------
# Un profil = team.json (nom, organisation GitHub requise, plan), roster.json, defaults.json, music/.
# bureau.config.json, clé team : le profil de l'installation ; absente = équipe neuve (roster vide).
# Les personnes ajoutées à une installation (clé people de la config, jamais commitée) suivent le roster du profil.
def teams():
    """Profils d'équipe disponibles : {id: team.json}."""
    base = p("teams")
    out = {}
    for d in sorted(os.listdir(base)) if os.path.isdir(base) else []:
        if os.path.exists(os.path.join(base, d, "team.json")):
            out[d] = json.load(open(os.path.join(base, d, "team.json")))
    return out


def _team_file(cfg, *parts):
    t = (cfg or {}).get("team")
    path = p("teams", t, *parts) if t else None
    return path if path and os.path.exists(path) else None


def roster(cfg):
    """L'équipe de l'installation : roster du profil, puis les personnes ajoutées à l'installation (clé people)."""
    path = _team_file(cfg, "roster.json")
    people = json.load(open(path))["people"] if path else []
    return people + list((cfg or {}).get("people") or [])


def guests(cfg):
    """Invités de passage : les communs (team/guests.json : les hérauts Yoda et Gandalf ; config common_guests false pour
    les retirer), puis ceux du profil (clé guests de son roster), puis ceux de l'installation. Même clé : le dernier
    remplace le précédent. Au plus une visite par jour ouvré."""
    path = _team_file(cfg, "roster.json")
    common = [] if (cfg or {}).get("common_guests") is False else json.load(open(p("team", "guests.json")))["guests"]
    out = {}
    for g in common + (json.load(open(path)).get("guests") or [] if path else []) + list((cfg or {}).get("guests") or []):
        out.pop(g["key"], None)
        out[g["key"]] = g
    return list(out.values())


def defaults(cfg):
    """Valeurs proposées à l'installation : team/defaults.json, complété par le profil (clé à clé au premier niveau)."""
    d = json.load(open(p("team", "defaults.json")))
    path = _team_file(cfg, "defaults.json")
    if path:
        for k, v in json.load(open(path)).items():
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


def wiki_posters(cfg):
    """Pages de la Wikipédia anglaise des affiches des cartes Top 3 : celles du roster (passion.top3.wiki), puis la
    clé wiki_posters de la config, sans doublon."""
    pages = [w for p in roster(cfg) for w in (((p.get("passion") or {}).get("top3") or {}).get("wiki") or [])]
    pages += list((cfg or {}).get("wiki_posters") or [])
    return list(dict.fromkeys(w for w in pages if isinstance(w, str) and w))


def music(cfg):
    """Morceaux des collègues (carte « Sa musique ») : ceux du profil, puis ceux de l'installation (clé music)."""
    path = _team_file(cfg, "music", "music.json")
    m = json.load(open(path)) if path else {}
    for v in m.values():
        if v.get("cover"):  # pochette embarquée en data URI, rangée à côté de music.json
            v["cover"] = open(os.path.join(os.path.dirname(path), v["cover"])).read().strip()
    return {**m, **((cfg or {}).get("music") or {})}


def recipes(cfg):
    """Recettes des avatars : communes (agents, intérimaires, visiteurs, équipe de démo), puis celles du profil."""
    path = _team_file(cfg, "cast.json")
    return {**json.load(open(p("sprites", "cast.json"))), **(json.load(open(path)) if path else {})}


def sprites(cfg):
    """Sprites fournis tels quels (planches) : les communs (sprites/common.json, hérauts), ceux de l'installation
    (sprites/sprites.json, local), puis ceux du profil. Les avatars des recettes sont composés dans le navigateur :
    leurs planches ne sont pas embarquées."""
    local = p("sprites", "sprites.json")
    shared = json.load(open(p("sprites", "common.json")))
    common = json.load(open(p("sprites", "cast.json")))
    out = {k: v for k, v in (json.load(open(local)) if os.path.exists(local) else {}).items() if k not in common}
    path = _team_file(cfg, "sprites.json")
    return {**shared, **out, **(json.load(open(path)) if path else {})}


def layout_path(cfg):
    """Plan du bureau de cette installation : clé layout de la config, sinon celui du profil, sinon le plan type."""
    t = teams().get((cfg or {}).get("team")) or {}
    return (cfg or {}).get("layout") or t.get("layout") or DEFAULT_LAYOUT


def build(demo=True, cfg=None):
    """Page complète. demo : instantanés de démo embarqués (aperçu local, tests) ; la page publiée n'en a pas.
    cfg : config d'installation (défaut : bureau.config.json)."""
    cfg = config() if cfg is None else cfg
    ids = {**(cfg.get("actions") or {}), **(cfg.get("launch") or {})}
    acts = {k: ids.get(k) or "" for k, _ in ACTIONS.values()}
    html = page_html()
    # bouton sans workflow configuré : sa carte kronn-action disparaît (la page masque le bouton)
    html = ACTION_RE.sub(lambda m: m.group(0) if acts[ACTIONS[m.group(1)][0]] else "", html)
    cast, custom = recipes(cfg), sprites(cfg)
    html = (html.replace("__SPRITES__", json.dumps(custom))
                .replace("__LAYERS__", open(p("sprites", "layers.json")).read())
                .replace("__MUSIC__", json.dumps(music(cfg), ensure_ascii=False))
                .replace("__CAST__", json.dumps(cast, ensure_ascii=False, separators=(",", ":")))
                .replace("__ROSTER__", json.dumps({"people": roster(cfg), "guests": guests(cfg)}, ensure_ascii=False))
                .replace("__LAYOUT__", open(p(layout_path(cfg))).read())
                .replace("__OWNER__", json.dumps(cfg.get("owner")))
                .replace("__CONFIG__", json.dumps(page_config(cfg), ensure_ascii=False))
                .replace("__ACTIONS__", json.dumps({k: bool(v) for k, v in acts.items()}))
                .replace("__DEMO__", "true" if demo else "false")
                .replace("__SNAP__", open(p("data", "office_snapshot.json")).read() if demo else "null")
                .replace("__TEAM__", open(p("data", "team_snapshot.json")).read() if demo else "null"))
    for _, mark in ACTIONS.values():
        html = html.replace(mark, acts[ACTIONS_BY_MARK[mark]])
    return html


ACTIONS_BY_MARK = {mark: key for key, mark in ACTIONS.values()}


if __name__ == "__main__":
    html = build()
    os.makedirs(p("dist"), exist_ok=True)
    open(p("dist", "office.html"), "w").write(html)
    print("dist/office.html", len(html.encode()), "octets (limite Kronn : 1 000 000)")
