"""Modèles des workflows et du Quick Prompt du Bureau (workflows/templates/*.json).

  python3 tools/templates.py export   # depuis le Kronn de bureau.config.json : valeurs de l'installation -> emplacements
  python3 tools/templates.py check    # le rendu avec bureau.config.json redonne exactement les workflows de ce Kronn
  python3 tools/templates.py render <clé>   # affiche le rendu d'un modèle (office, live, team, payroll, canard, absences, avatar, agent, gate, relaunch, layout, comment, duck, ask, sketch)

Emplacements, remplacés au rendu :
  @@page_id@@, @@kronn.project_id@@, @@jira.config_id@@, @@jira.project@@, @@jira.board@@, @@jira.sprint_field@@,
  @@jira.points_fields@@ (liste jointe par des virgules), @@owner_name@@ (prénom du boss),
  @@microsoft.config_id@@, @@microsoft.site@@, @@microsoft.item@@ (planning des absences, connexion Microsoft 365 de Kronn),
  @@script:workflows/x.py@@ (le script, config d'installation injectée comme le fait publish.py),
  @@text:tools/x.md@@ (le texte du fichier, tel quel), @@root@@ (dossier du dépôt de l'installation, pour les commandes d'un prompt).
Une étape marquée "_requires": "jira" disparaît au rendu si l'installation n'a pas de connexion Jira ; ses
références {{steps.<étape>.…}} dans l'entrée des étapes suivantes deviennent null.
Les noms des emplacements ne ressemblent pas aux variables Kronn ({{steps.x}}, {{run_id}}), qui restent intactes.
"""
import copy, json, os, re, sys, urllib.request
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TPL_DIR = os.path.join(ROOT, "workflows", "templates")
sys.path.insert(0, os.path.join(ROOT, "tools"))
import assemble  # noqa: E402  (roster du profil d'équipe)
# modèle -> (type, où trouver l'id dans la config, scripts par étape)
TEMPLATES = {
    "office": ("workflow", ("workflows", "office"), {"snapshot": "workflows/office_snapshot.py"}),
    "live": ("workflow", ("workflows", "live"), {"snapshot": "workflows/live_snapshot.py", "gates": "workflows/gates_snapshot.py",
                                                    "todos": "workflows/todos.py"}),
    "team": ("workflow", ("workflows", "team"), {"github": "workflows/github_snapshot.py", "shape": "workflows/team_shape.py", "since": "workflows/standup_since.py",
                                                    "planning_jql": "workflows/planning_jql.py", "actions": "workflows/actions_snapshot.py"}),
    "payroll": ("workflow", ("workflows", "payroll"), {"payroll": "workflows/payroll_snapshot.py", "pages": "workflows/pages_snapshot.py", "gitfut": "workflows/gitfut_snapshot.py"}),
    "canard": ("workflow", ("workflows", "canard"), {"duck": "workflows/duck_snapshot.py", "prev_window": "workflows/duck_window.py"}),  # canard d'équipe (KT-7)
    # absences et télétravail (KT-1) : planning Excel lu par Microsoft Graph (connexion Microsoft 365) ; sans elle : pas créé
    "absences": ("workflow", ("workflows", "absences"), {"absences": "workflows/absences_snapshot.py", "month_now": "workflows/absence_month.py",
                                                         "month_next": "workflows/absence_month.py"}),
    # courrier (#30) : mails non lus des comptes de mail.accounts (appli Mail du Mac, IMAP) ; sans compte : pas créé
    "courrier": ("workflow", ("workflows", "courrier"), {"mails": "workflows/mail_snapshot.py"}),
    # règles du courrier (#30) : le facteur les propose (agent), le boss les valide (gate) ; lancé par le cron courrier
    # console Support (#62) : relevé du canal (CLI claude et connecteur Microsoft 365) ; sans support.team/channel : pas créé
    "support_poll": ("workflow", ("workflows", "support_poll"), {"poll": "workflows/support.py"}),
    "regles": ("workflow", ("actions", "mail_rules"), {"senders": "workflows/mail_snapshot.py", "merge": "workflows/mail_snapshot.py"}),
    "avatar": ("workflow", ("actions", "avatar"), {"save": "workflows/avatar_save.py"}),
    "agent": ("workflow", ("actions", "agent"), {"save": "workflows/agent_save.py"}),  # agents ajoutés depuis une baie (#64)
    "pages": ("workflow", ("actions", "pages"), {"save": "workflows/pages_save.py", "thumbs": "workflows/pages_snapshot.py"}),  # écran mural Mes pages Kronn (#61)
    "gate": ("workflow", ("actions", "gate"), {"decide": "workflows/gate_decide.py"}),
    "answer": ("workflow", ("actions", "answer"), {"answer": "workflows/question_answer.py"}),  # question de discussion (KT-27)
    "relaunch": ("workflow", ("actions", "relaunch"), {"relaunch": "workflows/relaunch.py"}),
    "layout": ("workflow", ("actions", "layout"), {"save": "workflows/layout_save.py"}),
    "comment": ("workflow", ("actions", "comment"), {}),  # commentaire Jira depuis la fiche d'un ticket (sans Jira : pas créé)
    "move": ("workflow", ("actions", "move"), {}),  # déplacer un ticket d'une colonne (◀ / ▶ de sa fiche) : transition Jira, 0 token
    "duck": ("workflow", ("actions", "duck"), {"start": "workflows/duck_start.py"}),  # parler au canard : une discussion Kronn
    "todo": ("workflow", ("actions", "todo"), {"save": "workflows/todos.py"}),
    # 🔕 ignorer un fil de la console Support (il ne compte plus dans les alertes), ou le réactiver : 0 token
    "support_skip": ("workflow", ("actions", "support_skip"), {"skip": "workflows/support.py", "mark": "workflows/support.py"}),  # Mes todos du boss : tâches Kronn, tableau en liège
    # mise en prod d'une PR, tout projet (#58) : id rangé dans launch (jamais dans BUREAU_IDS : l'agent qui l'incarne
    # garde sa fiche et « ▶ Lancer… ») ; launch.mep_pr, à côté de ton ancien workflow de MEP par ticket (launch.mep)
    "mep": ("workflow", ("launch", "mep_pr"), {n: "workflows/mep.py" for n in ("resolve", "tag", "rebase", "citest", "merge", "release",
                                                                                 "staging", "prod", "done", "teams_post", "teams_failed")}),
    # remettre une PR à jour de sa base (#74) : bouton de la fiche d'une PR, rebase sans squash, conflit résolu par l'IA puis validé
    "rebase": ("workflow", ("actions", "rebase"), {n: "workflows/pr_update.py" for n in ("prepare", "rebase", "push", "done", "verify", "check",
                                                                                          "push_resolved", "abort")}),
    # corriger les commentaires d'une PR, tout dépôt (#75) : actions.fix_pr, à côté de ton workflow « Corriger » (launch.fix),
    # jamais réécrit ; quand il existe, le bouton « 🛠 Corriger » des fiches le lance
    "fix": ("workflow", ("actions", "fix_pr"), {n: "workflows/pr_update.py" for n in ("prepare", "diff", "push", "abort", "end")}),
    # modèles du Bureau que des agents incarnent (#78) : ids rangés dans models (jamais dans BUREAU_IDS : l'agent qui les
    # incarne garde sa fiche), lancés par les boutons quand tu n'as pas ton propre workflow (launch.review, launch.estimate)
    # relire une PR (sous-workflow d'abord : le cron et la revue à la demande le lancent pour chaque PR, en foreach)
    "review_child": ("workflow", ("models", "review_child"), {}),
    "review_one": ("workflow", ("models", "review_one"), {}),
    "review_cron": ("workflow", ("models", "review_cron"), {}),
    "estimate": ("workflow", ("models", "estimate"), {}),  # réestimer un ticket : Story Points et commentaire
    "issue": ("workflow", ("models", "issue"), {}),  # une intention rédigée en issue GitHub selon les modèles du dépôt
    # créer un ticket Jira (#77) : l'IA rédige au modèle de l'équipe (jira.create), le boss valide, l'API REST v2 crée
    "ticket": ("workflow", ("models", "ticket"), {n: "workflows/ticket.py" for n in ("apercu", "champs", "resultat")}),
    "assign": ("workflow", ("models", "assign"), {}),  # m'affecter un ticket (assignation puis transition vers En cours)
    "unassign": ("workflow", ("models", "unassign"), {}),  # me le désaffecter (retour à À faire)
    # (re)construire l'env de branche d'une PR (label retiré puis reposé) : bouton « 🌿 » des fiches quand tu n'as pas launch.env
    "env": ("workflow", ("models", "env"), {}),
    # déployer la branche d'une PR hors prod (DEV, STG…) : bouton « 🚀 » des fiches, dépôts et envs du réglage deploy
    "deploy": ("workflow", ("models", "deploy"), {"dispatch": "workflows/deploy.py"}),
    # investiguer un message du canal Support (#62) : discussion avec l'agent, gate, réponse en fil
    "support": ("workflow", ("models", "support"), {n: "workflows/support.py" for n in ("open", "mark", "draft", "mark_draft", "post", "mark_post")}),
    "ask": ("quick_prompt", ("actions", "ask"), {}),
    "sketch": ("quick_prompt", ("actions", "sketch"), {}),
}
WF_KEYS = ("name", "project_id", "trigger", "variables", "steps", "actions", "safety", "workspace_config", "concurrency_limit", "exec_allowlist",
           "guards", "concurrency_key")  # garde-fous du run (délai, appels IA) et limite par projet : comparés seulement quand ils sont posés
QP_KEYS = ("name", "icon", "prompt_template", "variables", "agent", "project_id", "skill_ids", "profile_ids", "directive_ids", "tier", "description")
TOKEN = re.compile(r"@@([a-z_.]+|(?:script|text):[\w/.]+)@@")
TEXTS = ("tools/plan_prompt.md", "tools/mail_rules_prompt.md", "tools/rebase_prompt.md", "tools/fix_prompt.md", "tools/review_rubric.md")
REVIEW_SCHEDULE = "30 7,10,13,16,19 * * 1-5"  # cron des revues de PR, heures UTC (review.schedule de l'équipe pour un autre)
# modèles lancés en foreach (un sous-workflow par PR) : Kronn y écrit .kronn/current_task.json, il leur faut leur propre
# copie du projet (require_isolation), jamais le dossier principal ; le sous-workflow tourne dans celle de son parent
ISOLATED = {"review_one", "review_cron"}
SHARED_WORKSPACE = {"review_child"}  # fichiers recopiés tels quels dans un prompt (@@text:…@@)


def load_config():
    return json.loads(Path(os.path.join(ROOT, "bureau.config.json")).read_text())


def text_of(path):
    """Un fichier recopié dans un prompt : ni @@ ni {{ (Kronn y verrait ses variables)."""
    body = Path(os.path.join(ROOT, path)).read_text(encoding="utf-8")
    assert "@@" not in body and "{{" not in body, path + " : ni @@ ni {{"
    return body


def owner_name(cfg):
    p = next((x for x in assemble.roster(cfg) if x["key"] == cfg.get("owner")), None)
    return p["name"] if p else "le boss"


LIB_IMPORT = re.compile(r"^from (_lib|_plan) import [\w, ]+$", re.M)


def script_code(path, cfg):
    """Le script tel qu'il tourne dans Kronn (« python3 -c », sans fichier voisin) : workflows/_lib.py et _plan.py
    recopiés à la place de leur ligne « from _lib import … », puis la config d'installation injectée à la place de
    __BUREAU_CONFIG__."""
    cfg = assemble.merged(cfg)  # réglages d'équipe du pack (#32) : les scripts n'ont pas accès au pack
    code = Path(os.path.join(ROOT, path)).read_text()

    def lib(m):
        body = Path(os.path.join(ROOT, "workflows", m.group(1) + ".py")).read_text()
        assert "@@" not in body and "{{" not in body, m.group(1) + ".py : ni @@ ni {{ (Kronn rendrait ses propres variables)"
        return body
    code = LIB_IMPORT.sub(lib, code)
    # clés de premier niveau triées : même script, que les réglages d'équipe soient dans la config ou dans le pack (#32)
    c = {k: v for k, v in sorted(cfg.items()) if not k.startswith("_")}
    c.update(gitfut=assemble.gitfut(cfg), wiki_posters=assemble.wiki_posters(cfg),  # déduits du roster (scripts sans accès au dépôt)
             planning_names=assemble.planning_names(cfg),  # noms complets du roster, pour le planning des absences
             root=ROOT)  # dossier du dépôt : son venv (Pillow) pour réduire les images
    blob = json.dumps(c, ensure_ascii=False)
    assert '"""' not in blob and "__BUREAU_CONFIG__" in code, path
    return code.replace("__BUREAU_CONFIG__", blob, 1)


ROLES = ("po", "sm", "qa")
# étapes du travail des rôles : retirées si personne n'a ce rôle (ou pas de compte Jira dans le roster)
WORK_REQUIRES = {"work_written": "jira.role_ids", "work_po_triage": "jira.role.po", "work_sm_triage": "jira.role.sm",
                 "work_qa_ok": "jira.role.qa", "work_qa_back": "jira.role.qa", "since": "jira",
                 "planning_jql": "jira"}
FLOW_DEFAULTS = assemble.JIRA_FLOW


def role_ids(role, cfg):
    """Compte Jira (jira_id du roster) de la première personne de ce rôle, sinon chaîne vide."""
    return next((p["jira_id"] for p in assemble.roster(cfg) if p.get("roleKind") == role and p.get("jira_id")), "")


def values(cfg):
    """Valeur de chaque emplacement pour une installation."""
    cfg = assemble.merged(cfg)
    j = cfg.get("jira") or {}
    rv = cfg.get("review") or {}
    return {
        "page_id": cfg.get("page_id") or "",
        "kronn.project_id": (cfg.get("kronn") or {}).get("project_id") or "",
        "jira.config_id": j.get("config_id") or "",
        "jira.project": j.get("project") or "",
        "jira.board": str(j.get("board") or ""),
        "jira.sprint_field": j.get("sprint_field") or "",
        "jira.points_fields": ",".join(j.get("points_fields") or []),
        "microsoft.config_id": (cfg.get("microsoft") or {}).get("config_id") or "",  # planning des absences (Graph)
        "microsoft.site": ((cfg.get("microsoft") or {}).get("planning") or {}).get("site") or "",
        "microsoft.item": ((cfg.get("microsoft") or {}).get("planning") or {}).get("item") or "",
        "owner_name": owner_name(cfg),
        "root": ROOT,
        "cron_hours": assemble.cron_hours(cfg),  # heures UTC des crons, d'après le fuseau et les heures de bureau
        # travail Jira des rôles sans tickets assignés (PO, SM, QA) : compte Jira de la première personne du rôle
        **{f"jira.role.{r}": role_ids(r, cfg) for r in ROLES},
        "jira.role_ids": ",".join(f'"{x}"' for r in ROLES for x in [role_ids(r, cfg)] if x),
        **{f"jira.flow.{k}": (j.get("flow") or {}).get(k) or v for k, v in FLOW_DEFAULTS.items()},
        # mise en prod (#58) : Quick Prompt du retour IA et transition Jira de fin (facultatifs : étapes retirées sans eux)
        "mep.feedback_qp": (cfg.get("mep") or {}).get("feedback_qp") or "",
        "mep.done_transition": str((cfg.get("mep") or {}).get("done_transition") or ""),
        # projet Kronn du workflow : il borne les connexions de l'étape retour IA (GitHub de l'équipe), comme la revue
        "mep.project_id": (cfg.get("mep") or {}).get("project_id") or rv.get("project_id")
        or (cfg.get("kronn") or {}).get("project_id") or "",
        # modèles incarnés par des agents (#78)
        "kronn.api": (cfg.get("kronn") or {}).get("api") or "",
        "github.config_id": (cfg.get("github") or {}).get("config_id") or "",  # connexion GitHub de Kronn (API GitHub)
        "jira.points_field": (j.get("points_fields") or [""])[0],  # champ Story Points du board (réestimer)
        # créer un ticket (#77) : modèle de ticket de l'équipe (chemin, facultatif) ; champ du board où recopier les points
        # quand l'écran de création en a un autre (jira.create.points_field), sinon vide (étape retirée)
        "jira.create.template": str((j.get("create") or {}).get("template") or "aucun (structure par défaut)"),
        "jira.create.board_points": create_board_points(j),
        **{f"jira.statuses.{c}": json.dumps([s for s, k in (j.get("statuses") or {}).items() if k == c], ensure_ascii=False)
           for c in ("todo", "doing")},  # statuts « À faire » et « En cours » du board (m'affecter, me désaffecter)
        # statut -> colonne du board : déplacer un ticket passe par un statut de sa colonne quand Jira l'exige
        "jira.statuses_json": json.dumps(j.get("statuses") or {}, ensure_ascii=False, separators=(",", ":")) if j.get("statuses") else "",
        "models.review_child": (cfg.get("models") or {}).get("review_child") or "",
        "review.project_id": rv.get("project_id") or (cfg.get("kronn") or {}).get("project_id") or "",
        "review.page_id": rv.get("page_id") or "",  # page de récap des revues, facultative
        "review.schedule": rv.get("schedule") or REVIEW_SCHEDULE,
        "review.repos_json": json.dumps([{"repo": r} for r in review_repos(cfg)], ensure_ascii=False, separators=(",", ":")),
        "review.guidelines": str(rv.get("guidelines") or "Aucune consigne d'équipe en plus de la grille."),
        "issue.repo": (cfg.get("issue") or {}).get("repo") or (cfg.get("github") or {}).get("repo") or "",
        "issue.search_dirs": ", ".join((cfg.get("issue") or {}).get("search_dirs") or ["~/Sites", "~/Projects", "~/code"]),
        "issue.discussion": (cfg.get("issue") or {}).get("discussion") or "",  # discussion Kronn du récap, facultative
        "env.label": (cfg.get("env") or {}).get("label") or "env-branch",  # label qui construit l'env de branche (réglage d'équipe)
    }


def create_board_points(j):
    board = (j.get("points_fields") or [""])[0]
    return board if board and (j.get("create") or {}).get("points_field") not in (None, "", board) else ""


CREATE_TYPES = ["Story", "Bug", "Task"]  # types proposés sans réglage jira.create.types


def create_options(kind, v, cfg):
    """Choix d'une variable du modèle ticket (#77) d'après jira.create : types (le type par défaut en tête), composants
    (sans liste : champ libre, obligatoire seulement si component_required)."""
    c = (cfg.get("jira") or {}).get("create") or {}
    if kind == "jira.create.types":
        types = list(c.get("types") or CREATE_TYPES)
        dflt = c.get("type") if c.get("type") in types else types[0]
        v["control"] = {"type": "select", "options": [{"value": t, "label": t, "enabled": True} for t in types], "default_value": dflt}
        return
    comps = list(c.get("components") or [])
    if v["required"]:  # composant principal : obligatoire par défaut quand l'équipe donne la liste
        v["required"] = bool(c.get("component_required", bool(comps)))
    if comps:
        v["control"] = {"type": "select", "options": [{"value": x, "label": x, "enabled": True} for x in comps]}
    else:
        v["placeholder"] = "nom du composant Jira"


def review_repos(cfg):
    """Dépôts que le cron des revues relit : review.repos de l'équipe, sinon les PR suivies (github.pr_repos), sinon le
    dépôt principal puis ceux des mises en prod (comme github_snapshot.py)."""
    g = cfg.get("github") or {}
    repos = (cfg.get("review") or {}).get("repos") or g.get("pr_repos") or \
        [g.get("repo")] + [d.get("repo") for d in g.get("deploys") or []]
    return list(dict.fromkeys(r for r in repos if r))


def mep_projects(cfg):
    return assemble.mep_projects(cfg)


def skipped(key, cfg):
    """Workflows du Bureau qu'une installation ne crée pas faute de connexion : commenter un ticket sans Jira, les
    absences sans planning Microsoft 365 (microsoft.config_id et microsoft.planning dans la config), le courrier sans
    compte (mail.accounts), la console Support sans canal (support.team, support.channel)."""
    cfg = assemble.merged(cfg)  # planning des absences : dans le pack (#32)
    if key in ("comment", "move"):
        return not (cfg.get("jira") or {}).get("config_id")
    if key == "absences":
        m = cfg.get("microsoft") or {}
        return not (m.get("config_id") and (m.get("planning") or {}).get("site") and (m.get("planning") or {}).get("item"))
    if key in ("courrier", "regles"):
        return not (cfg.get("mail") or {}).get("accounts")
    if key == "mep":  # aucun projet avec une clé mep (github ou github.deploys)
        return not mep_projects(cfg)
    if key in ("review_child", "review_one", "review_cron"):  # API GitHub : connexion GitHub de Kronn (github.config_id)
        return not (cfg.get("github") or {}).get("config_id") or (key == "review_cron" and not review_repos(cfg))
    if key in ("estimate", "assign", "unassign", "ticket"):
        return not (cfg.get("jira") or {}).get("config_id")
    if key == "env":  # aucun dépôt où générer un env de branche
        return not assemble.env_repos({**cfg, "models": {**(cfg.get("models") or {}), "env": "?"}})
    if key == "deploy":  # aucun dépôt ni env hors prod réglé (deploy.repos)
        return not assemble.deploy_envs({**cfg, "models": {**(cfg.get("models") or {}), "deploy": "?"}})
    if key in ("support", "support_poll", "support_skip"):  # console Support (#62) : canal Teams réglé (support.team, support.channel)
        s = cfg.get("support") or {}
        return not (s.get("team") and s.get("channel"))
    return False


# ---------- rendu ----------
def _sub(v, vals, cfg):
    if isinstance(v, str):
        def rep(m):
            k = m.group(1)
            if k.startswith("script:"):
                return script_code(k[7:], cfg)
            if k.startswith("text:"):
                return text_of(k[5:])
            if k not in vals:
                raise KeyError(f"emplacement inconnu : {k}")
            return vals[k]
        return TOKEN.sub(rep, v)
    if isinstance(v, list):
        return [_sub(x, vals, cfg) for x in v]
    if isinstance(v, dict):
        return {_sub(k, vals, cfg): _sub(x, vals, cfg) for k, x in v.items()}  # une clé peut être un emplacement (champ Jira)
    return v


def render(tpl, cfg):
    """Modèle + config d'installation -> définition prête pour l'API Kronn (sans ids)."""
    cfg = assemble.merged(cfg)  # réglages d'équipe du pack sous la config (#32)
    d = copy.deepcopy(tpl["definition"])
    if tpl["kind"] == "workflow":
        has_jira = bool((cfg.get("jira") or {}).get("config_id"))
        vals = values(cfg)

        def ok(req):  # "jira" : connexion Jira ; "jira.role.qa", "jira.role_ids" : Jira et quelqu'un dans ce rôle ;
            # "github" : connexion GitHub de Kronn ; une autre clé (review.page_id…) : sa valeur est posée
            if not req:
                return True
            if req == "jira" or req.startswith("jira."):
                return has_jira and (req == "jira" or bool(vals.get(req)))
            return bool(vals.get("github.config_id" if req == "github" else req))
        names = [s["name"] for s in d["steps"]]
        dropped = {s["name"] for s in d["steps"] if not ok(s.get("_requires"))}
        # un renvoi (on_result Goto) vers une étape retirée va à la première étape gardée après elle (#78 : sans page de
        # récap, « reply » en échec saute à la fin au lieu de build_row)
        after = {n: next((m for m in names[i:] if m not in dropped), None) for i, n in enumerate(names)}
        d["steps"] = [s for s in d["steps"] if s["name"] not in dropped]
        for s in d["steps"]:
            for r in s.get("on_result") or []:
                a = r.get("action") or {}
                if a.get("type") == "Goto" and a.get("step_name") in dropped:
                    a["step_name"] = after[a["step_name"]]
        for v in d.get("variables") or []:  # liste des projets (#58) : choix de la variable, le dépôt principal par défaut
            opt = v.pop("_options", None)
            if opt in ("jira.create.types", "jira.create.components"):
                create_options(opt, v, cfg)
            if opt == "mep.projects":
                opts = mep_projects(cfg)
                v["control"] = {"type": "select", "options": [{"value": r, "label": n, "enabled": True} for r, n in opts],
                                **({"default_value": opts[0][0]} if opts else {})}
        for s in d["steps"]:
            s.pop("_requires", None)
            if s.pop("_skills_from", None) == "review.skill_ids":  # skills de l'équipe en plus de ceux du modèle (#78)
                s["skill_ids"] = list(dict.fromkeys(s.get("skill_ids", []) + list((cfg.get("review") or {}).get("skill_ids") or [])))
            if s.pop("_vars_from", None) == "mep.feedback_vars":  # variables propres au Quick Prompt du retour IA
                s["quick_prompt_variables"] = {**((cfg.get("mep") or {}).get("feedback_vars") or {}), **s.get("quick_prompt_variables", {})}
            for name in dropped:  # entrée d'une étape suivante qui lisait une étape retirée
                if isinstance(s.get("exec_stdin"), str):
                    s["exec_stdin"] = re.sub(r"\{\{steps\." + re.escape(name) + r"\.[\w.]+\}\}", "null", s["exec_stdin"])
    return _sub(d, values(cfg), cfg)


# ---------- export depuis un Kronn ----------
def _api(cfg):
    return cfg["kronn"]["api"].rstrip("/")


def fetch(kind, ident, cfg):
    if kind == "workflow":
        with urllib.request.urlopen(f"{_api(cfg)}/workflows/{ident}", timeout=30) as r:
            return json.load(r)["data"]
    with urllib.request.urlopen(f"{_api(cfg)}/quick-prompts", timeout=30) as r:  # pas de lecture par id : la liste
        body = json.load(r)
    return next(q for q in body.get("data", body) if q["id"] == ident)


def clean(kind, live):
    """Définition comparable : sans ids, dates, état ; étapes sans leur id."""
    keys = WF_KEYS if kind == "workflow" else QP_KEYS
    # Kronn omet une liste de variables vide ; des garde-fous absents (null) ne sont pas un champ du modèle
    d = {k: copy.deepcopy(live.get(k)) for k in keys if k not in ("variables", "guards", "concurrency_key") or live.get(k) or kind != "workflow"}
    if kind == "workflow":
        for s in d["steps"]:
            s.pop("id", None)
    return d


def templatize(key, kind, d, cfg):
    """Remplace les valeurs propres à l'installation par des emplacements (l'inverse de render)."""
    scripts = TEMPLATES[key][2]
    vals = values(cfg)
    j = cfg.get("jira") or {}

    def walk(v):
        if isinstance(v, str):
            for k, val in (("page_id", vals["page_id"]), ("jira.config_id", vals["jira.config_id"]),
                           ("kronn.project_id", vals["kronn.project_id"]), ("microsoft.config_id", vals["microsoft.config_id"]),
                           ("microsoft.site", vals["microsoft.site"]), ("microsoft.item", vals["microsoft.item"]),
                           ("jira.statuses_json", vals["jira.statuses_json"])):
                if val and v == val:
                    return f"@@{k}@@"
            if vals["jira.points_fields"]:
                v = v.replace(vals["jira.points_fields"], "@@jira.points_fields@@")
            if vals["jira.sprint_field"]:
                v = v.replace(vals["jira.sprint_field"], "@@jira.sprint_field@@")
            if j.get("project"):
                v = re.sub(r"\bproject = " + re.escape(j["project"]) + r"\b", "project = @@jira.project@@", v)
            if j.get("board") is not None:
                v = v.replace(f"/board/{j['board']}/", "/board/@@jira.board@@/")
            if '"roles":{' in v:  # entrée de shape : comptes des rôles
                for r in ROLES:
                    if vals[f"jira.role.{r}"]:
                        v = v.replace(f'"{r}":"{vals[f"jira.role.{r}"]}"', f'"{r}":"@@jira.role.{r}@@"')
            if "CHANGED" in v or "WAS" in v or "reporter in" in v:  # requêtes du travail des rôles
                if vals["jira.role_ids"]:
                    v = v.replace(f"reporter in ({vals['jira.role_ids']})", "reporter in (@@jira.role_ids@@)")
                for r in ROLES:
                    if vals[f"jira.role.{r}"]:
                        v = v.replace(f'BY "{vals[f"jira.role.{r}"]}"', f'BY "@@jira.role.{r}@@"')
                for k in FLOW_DEFAULTS:
                    v = re.sub(r'(FROM|TO|WAS) "' + re.escape(vals[f"jira.flow.{k}"]) + '"', lambda m: f'{m.group(1)} "@@jira.flow.{k}@@"', v)
            return v
        if isinstance(v, list):
            return [walk(x) for x in v]
        if isinstance(v, dict):
            return {k: walk(x) for k, x in v.items()}
        return v

    d = walk(d)
    sch = (d.get("trigger") or {}).get("schedule")
    if isinstance(sch, str) and len(sch.split()) == 5 and sch.split()[1] == vals["cron_hours"]:
        f = sch.split()
        d["trigger"]["schedule"] = " ".join(f[:1] + ["@@cron_hours@@"] + f[2:])
    if kind == "workflow":
        for s in d["steps"]:
            if s.get("api_plugin_slug") == "mcp-atlassian" or s["name"] in WORK_REQUIRES:
                s["_requires"] = WORK_REQUIRES.get(s["name"], "jira")
            path = scripts.get(s["name"])
            if not path:
                continue
            tok = f"@@script:{path}@@"
            if s.get("collect_api_data"):
                s["collect_api_data"]["sources"][0]["quick_exec"]["args"] = ["-c", tok]
            else:
                s["exec_args"] = ["-c", tok] + (s.get("exec_args") or [])[2:]
    else:
        name = vals["owner_name"]
        t = d["prompt_template"].replace(f"{name} te pose", "@@owner_name@@ te pose")
        for path in TEXTS:
            t = t.replace(text_of(path), f"@@text:{path}@@")
        d["prompt_template"] = t.replace(ROOT, "@@root@@")
    return {"kind": kind, "key": key, "definition": d}


def config_id(cfg, where):
    a, b = where
    return (cfg.get(a) or {}).get(b)


def load_templates():
    return {k: json.loads(Path(os.path.join(TPL_DIR, k + ".json")).read_text()) for k in TEMPLATES
            if os.path.exists(os.path.join(TPL_DIR, k + ".json"))}


def main():
    cfg = load_config()
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    if cmd == "export":
        os.makedirs(TPL_DIR, exist_ok=True)
        for key, (kind, where, _) in TEMPLATES.items():
            ident = config_id(cfg, where)
            if not ident:
                print(f"{key} : pas d'id dans la config, ignoré")
                continue
            t = templatize(key, kind, clean(kind, fetch(kind, ident, cfg)), cfg)
            Path(os.path.join(TPL_DIR, key + ".json")).write_text(json.dumps(t, ensure_ascii=False, indent=1))
            left = sorted(set(re.findall(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", json.dumps(t))))
            print(f"{key} : exporté" + (f" (ids restants : {left})" if left else ""))
    elif cmd == "check":
        bad = 0
        for key, tpl in load_templates().items():
            kind, where, _ = TEMPLATES[key]
            ident = config_id(cfg, where)
            if not ident or ident in (cfg.get("own") or []):
                print(f"--   {key} : " + ("pas installé" if not ident else f"workflow {ident[:8]} gardé tel quel, non comparé"))
                continue
            same = render(tpl, cfg) == clean(kind, fetch(kind, ident, cfg))
            bad += not same
            print(("ok   " if same else "DIFF ") + f"{key} : rendu {'identique au' if same else 'différent du'} workflow {ident[:8]}")
        sys.exit(1 if bad else 0)
    elif cmd == "render":
        print(json.dumps(render(load_templates()[sys.argv[2]], cfg), ensure_ascii=False, indent=1)[:4000])


if __name__ == "__main__":
    main()
