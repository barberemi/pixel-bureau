"""Assemble la page autonome : modèle + calques LPC + recettes + sprites fournis + instantanés de démo -> dist/office.html.

Sources de la page : page/office_template.html (squelette HTML + blocs kronn-action) avec deux marqueurs,
`/*__STYLES__*/` <- page/src/styles.css et `/*__SCRIPTS__*/` <- page/src/*.js concaténés dans l'ordre du nom
(00-, 10-, ...) en un seul <script> inline : une seule portée globale, pas de modules, pas de bundler.

Les avatars sont assemblés dans le navigateur (calques de sprites/layers.json + recettes de sprites/cast.json) ;
seuls les sprites fournis tels quels (sprites/custom/, ex. boss_sax) sont embarqués comme planches.
"""
import json, os, re

# boutons de la page : bloc kronn-action du squelette -> (clé dans bureau.config.json « actions », marqueur de l'id)
ACTIONS = {"bureau-avatar": ("avatar", "__AVATAR_WF__"), "bureau-gate": ("gate", "__GATE_WF__"),
           "bureau-relaunch": ("relaunch", "__RELAUNCH_WF__"), "bureau-ask": ("ask", "__ASK_QP__")}
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


def cron_schedules():
    """Calendrier de chaque cron du Bureau, lu dans ses modèles (workflows/templates)."""
    out = {}
    for key in ("office", "live", "team", "payroll"):
        path = p("workflows", "templates", key + ".json")
        if os.path.exists(path):
            out[key] = ((json.load(open(path))["definition"].get("trigger") or {}).get("schedule"))
    return out


def page_config(cfg):
    """La partie de bureau.config.json utile à la page (pas d'ids de workflows ni de connexions)."""
    return {
        "kronn_ui": (cfg.get("kronn") or {}).get("ui"),
        "jira_site": (cfg.get("jira") or {}).get("site"),
        "github_repo": (cfg.get("github") or {}).get("repo"),
        "rhythm": cfg.get("rhythm") or {},
        "mep_workflow": cfg.get("mep_workflow"),
        "workflows": cfg.get("workflows") or {},  # ids des crons : calendrier et fraîcheur des données
        "schedules": cron_schedules(),  # calendrier des crons du Bureau (modèles de workflows)
        "agents": cfg.get("agents") or [],
    }


def build(demo=True, cfg=None):
    """Page complète. demo : instantanés de démo embarqués (aperçu local, tests) ; la page publiée n'en a pas.
    cfg : config d'installation (défaut : bureau.config.json)."""
    cfg = config() if cfg is None else cfg
    acts = {k: (cfg.get("actions") or {}).get(k) or "" for k, _ in ACTIONS.values()}
    html = page_html()
    # bouton sans workflow configuré : sa carte kronn-action disparaît (la page masque le bouton)
    html = ACTION_RE.sub(lambda m: m.group(0) if acts[ACTIONS[m.group(1)][0]] else "", html)
    cast = json.load(open(p("sprites", "cast.json")))
    custom = {k: v for k, v in json.load(open(p("sprites", "sprites.json"))).items() if k not in cast}
    # morceaux des collègues (carte « Sa musique » du profil) : pochette embarquée en data URI
    music = json.load(open(p("sprites", "music", "music.json")))
    for m in music.values():
        if m.get("cover"):
            m["cover"] = open(p("sprites", "music", m["cover"])).read().strip()
    html = (html.replace("__SPRITES__", json.dumps(custom))
                .replace("__LAYERS__", open(p("sprites", "layers.json")).read())
                .replace("__MUSIC__", json.dumps(music, ensure_ascii=False))
                .replace("__CAST__", json.dumps(cast, ensure_ascii=False, separators=(",", ":")))
                .replace("__ROSTER__", open(p("team", "roster.json")).read())
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
