"""Modèles des workflows et du Quick Prompt du Bureau (workflows/templates/*.json).

  python3 tools/templates.py export   # depuis le Kronn de bureau.config.json : valeurs de l'installation -> emplacements
  python3 tools/templates.py check    # le rendu avec bureau.config.json redonne exactement les workflows de ce Kronn
  python3 tools/templates.py render <clé>   # affiche le rendu d'un modèle (office, live, team, payroll, canard, absences, avatar, agent, gate, relaunch, layout, comment, duck, ask, sketch)

Emplacements, remplacés au rendu :
  @@page_id@@, @@bilan.page_id@@ (page « Chaîne · bilan »), @@support_bilan.page_id@@ (page « Support · bilan »), @@redaction_bilan.page_id@@ (page « Rédaction · bilan »), @@retours_bilan.page_id@@ (page « Retours · bilan »), @@kronn.project_id@@, @@jira.config_id@@, @@jira.project@@, @@jira.board@@, @@jira.sprint_field@@,
  @@jira.review_version_field@@ (champ du n° de version des corrections de PR), @@jira.points_fields@@ (liste jointe par des virgules), @@owner_name@@ (prénom du boss),
  @@microsoft.config_id@@, @@microsoft.site@@, @@microsoft.item@@ (planning des absences, connexion Microsoft 365 de Kronn),
  @@script:workflows/x.py@@ (le script, config d'installation injectée comme le fait publish.py),
  @@text:tools/x.md@@ (le texte du fichier, tel quel), @@skill:<clé>@@ (renvoi au skill du Bureau chargé avec l'étape ;
  pas encore publié dans Kronn : son texte recopié), @@root@@ (dossier du dépôt de l'installation, pour les commandes d'un prompt).
Une étape marquée "_requires": "jira" disparaît au rendu si l'installation n'a pas de connexion Jira ; ses
références {{steps.<étape>.…}} dans l'entrée des étapes suivantes deviennent null.
Les noms des emplacements ne ressemblent pas aux variables Kronn ({{steps.x}}, {{run_id}}), qui restent intactes.
"""
import base64, copy, io, json, os, re, sys, tokenize, urllib.request
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TPL_DIR = os.path.join(ROOT, "workflows", "templates")
sys.path.insert(0, os.path.join(ROOT, "tools"))
import assemble  # noqa: E402  (roster du profil d'équipe)
# postes de la chaîne d'implémentation (#76) appelés par le parent ou par le poste des contrôles, dans l'ordre de création
# (impl_cadrage est le poste 📋 Plan : la clé garde son nom pour les installations ; schéma, patterns et revue croisée y
# ont été fondus ou retirés, leurs modèles ne sont plus rendus)
IMPL_POSTES = ("cadrage", "code", "tests", "revue_pr", "retours", "livraison", "publication")
_C, _CC, _CP = ({"chaine": "workflows/chaine.py"}, {"chaine_controles": "workflows/chaine_controles.py"},
                {"chaine_pr": "workflows/chaine_pr.py"})
IMPL_SCRIPTS = {"cadrage": _C, "code": _C, "tests": _C, "revue_pr": _CP, "retours": {**_CC, **_CP}, "livraison": {**_C, **_CP},
                "publication": _CP, "controles": _CC, "chain": {**_C, **_CC}, "lanceur": _CP}
# postes de l'investigation Support (#62) : un sous-workflow chacun, appelés par le parent support dans cet ordre
SUPPORT_POSTES = ("tri", "logs", "cause", "reponse", "relecture")
# salle de rédaction (2e étage) : les postes du modèle ticket (un sous-workflow chacun), puis un sous-workflow par ticket
TICKET_POSTES = ("recherche", "redaction", "critique")
# revue de PR (2e étage, salle de revue) : les postes du sous-workflow review_child (un sous-workflow chacun), puis son avis
REVIEW_POSTES = ("contexte", "docs", "lecture", "securite")
# pages Kronn à part, à projeter (HTML autonome de page/, ni assemblage ni démo) : clé de leur id dans la config ->
# (titre, datasets, fichier) ; créées par install.py, publiées par install.py et publish.py page
SIDE_PAGES = {"bilan_page_id": ("Chaîne · bilan", ["bilan"], "bilan.html"),
              "support_bilan_page_id": ("Support · bilan", ["support_bilan"], "support-bilan.html"),
              "redaction_bilan_page_id": ("Rédaction · bilan", ["redaction_bilan"], "redaction-bilan.html"),
              "retours_bilan_page_id": ("Retours · bilan", ["retours_bilan"], "retours-bilan.html")}
# modèle -> (type, où trouver l'id dans la config, scripts par étape)
TEMPLATES = {
    "office": ("workflow", ("workflows", "office"), {"snapshot": "workflows/office_snapshot.py", "statuts": "workflows/statuts_snapshot.py"}),
    "live": ("workflow", ("workflows", "live"), {"snapshot": "workflows/live_snapshot.py", "gates": "workflows/gates_snapshot.py",
                                                    "todos": "workflows/todos.py", "atelier": "workflows/atelier_snapshot.py",
                                                    "retours": "workflows/retours_snapshot.py", "redaction": "workflows/redaction_snapshot.py"}),
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
    # relire une PR (sous-workflow d'abord : le cron et la revue à la demande le lancent pour chaque PR, en foreach) ; ses
    # postes avant lui (un sous-workflow chacun : contexte, docs, lecture, sécurité), son avis dans lui
    **{f"review_{p}": ("workflow", ("models", f"review_{p}"), {n: "workflows/review.py" for n in ("entree", "rapport")}) for p in REVIEW_POSTES},
    "review_child": ("workflow", ("models", "review_child"), {"write_ctx": "workflows/review.py"}),
    "review_one": ("workflow", ("models", "review_one"), {"cost": "workflows/review.py"}),
    "review_cron": ("workflow", ("models", "review_cron"), {"costs": "workflows/review.py"}),
    "estimate": ("workflow", ("models", "estimate"), {}),  # réestimer un ticket : Story Points et commentaire
    # estimer le temps gagné par l'IA sur un ticket terminé (#79) : PR mergées trouvées sans IA, estimation par l'IA,
    # commentaire et label de suivi (jira.ai_feedback) ; lancé par le bouton de la fiche ou en fin de mise en prod
    "ai_time": ("workflow", ("models", "ai_time"), {n: "workflows/ai_time.py" for n in ("instance", "discover", "compose", "need_gate",
                                                                                        "done")}),
    "issue": ("workflow", ("models", "issue"), {}),  # une intention rédigée en issue GitHub selon les modèles du dépôt
    # créer un ticket Jira (#77) : l'IA rédige au modèle de l'équipe (jira.create), le boss valide, l'API REST v2 crée
    # une intention peut donner plusieurs tickets (2e étage) : postes recherche, rédaction, critique (sous-workflows), puis un
    # sous-workflow par ticket (ticket_un : aperçu, ta validation, création) ; enfants créés avant le parent
    **{f"ticket_{p}": ("workflow", ("models", f"ticket_{p}"), {n: "workflows/ticket.py" for n in ("entree", "rapport")}) for p in TICKET_POSTES},
    "ticket_un": ("workflow", ("models", "ticket_un"), {n: "workflows/ticket.py" for n in ("lot", "champs", "resultat")}),
    "ticket": ("workflow", ("models", "ticket"), {n: "workflows/ticket.py" for n in ("dossier", "aiguillage", "resultat")}),
    "assign": ("workflow", ("models", "assign"), {}),  # m'affecter un ticket (assignation puis transition vers En cours)
    "unassign": ("workflow", ("models", "unassign"), {}),  # me le désaffecter (retour à À faire)
    # (re)construire l'env de branche d'une PR (label retiré puis reposé) : bouton « 🌿 » des fiches quand tu n'as pas launch.env
    "env": ("workflow", ("models", "env"), {}),
    # déployer la branche d'une PR hors prod (DEV, STG…) : bouton « 🚀 » des fiches, dépôts et envs du réglage deploy
    "deploy": ("workflow", ("models", "deploy"), {"dispatch": "workflows/deploy.py"}),
    # investiguer un message du canal Support (#62) : une chaîne de postes (sous-workflows, un agent chacun, créés avant le
    # parent), puis ta validation (gate) et la réponse en fil
    **{f"support_{p}": ("workflow", ("models", f"support_{p}"), {n: "workflows/support.py" for n in ("entree", "rapport")}) for p in SUPPORT_POSTES},
    "support": ("workflow", ("models", "support"), {n: "workflows/support.py" for n in ("open", "mark", "draft", "mark_draft", "post", "mark_post")}),
    # implémenter un ticket en chaîne de postes (#76, #125) : un poste = un sous-workflow (un agent, ses skills, son modèle),
    # créés avant ceux qui les appellent (enfants d'abord : Kronn vérifie la cible d'un SubWorkflow à l'enregistrement)
    # (scripts : chaine.py, chaine_controles.py, chaine_pr.py, qui se partagent _chaine.py ; IMPL_SCRIPTS = ceux de chaque modèle)
    **{f"impl_{p}": ("workflow", ("models", f"impl_{p}"), IMPL_SCRIPTS[p]) for p in IMPL_POSTES},
    "impl_controles": ("workflow", ("models", "impl_controles"), IMPL_SCRIPTS["controles"]),
    "impl_chain": ("workflow", ("models", "impl_chain"), IMPL_SCRIPTS["chain"]),
    "impl": ("workflow", ("models", "impl"), IMPL_SCRIPTS["lanceur"]),  # lanceur : projet déduit du composant Jira
    # page « Chaîne · bilan » : l'historique des runs de la chaîne (bilans de chaine.py et API Kronn), page Kronn à part
    # (bilan_page_id) ; sans chaîne installée ou sans cette page : pas créé
    "chaine_bilan": ("workflow", ("workflows", "chaine_bilan"), {"bilan": "workflows/chaine_bilan.py"}),
    # page « Support · bilan » : l'historique des demandes du canal et de leurs investigations (historique de support.py et
    # API Kronn), page Kronn à part (support_bilan_page_id) ; sans investigation Support installée ou sans cette page : pas créé
    "support_bilan": ("workflow", ("workflows", "support_bilan"), {"archive": "workflows/support.py", "releve": "workflows/support_bilan.py",
                                                                   "bilan": "workflows/support_bilan.py"}),
    # page « Rédaction · bilan » : l'historique des intentions de la salle de rédaction et des tickets créés (historique de
    # ticket.py et API Kronn), page Kronn à part (redaction_bilan_page_id) ; sans modèle ticket installé ou sans cette page : pas créé
    "redaction_bilan": ("workflow", ("workflows", "redaction_bilan"), {"releve": "workflows/redaction_bilan.py", "bilan": "workflows/redaction_bilan.py"}),
    # page « Retours · bilan » : l'historique des corrections de commentaires de PR du 3e (états de pr_update.py et API
    # Kronn), page Kronn à part (retours_bilan_page_id) ; sans « corriger » installé ou sans cette page : pas créé
    "retours_bilan": ("workflow", ("workflows", "retours_bilan"), {"releve": "workflows/retours_bilan.py", "bilan": "workflows/retours_bilan.py"}),
    "ask": ("quick_prompt", ("actions", "ask"), {}),
    "sketch": ("quick_prompt", ("actions", "sketch"), {}),
}
WF_KEYS = ("name", "project_id", "trigger", "variables", "steps", "actions", "safety", "workspace_config", "concurrency_limit", "exec_allowlist",
           "guards", "concurrency_key", "project_scope")  # garde-fous du run (délai, appels IA), limite par projet et projets
# permis (impl_chain : tous) : comparés seulement quand ils sont posés
# champs d'étape vides que Kronn ajoute (0.15.1 : prompt_template "" sur toute étape) ou omet (skill_ids, variables d'un
# sous-workflow) : sans effet à l'exécution, écartés des deux côtés de la comparaison
VIDES = {"prompt_template": "", "skill_ids": [], "sub_workflow_variables": {}}
QP_KEYS = ("name", "icon", "prompt_template", "variables", "agent", "project_id", "skill_ids", "profile_ids", "directive_ids", "tier", "description")
TOKEN = re.compile(r"@@([a-z_.]+|(?:script|text|skill):[\w/.]+)@@")
TEXTS = ("tools/plan_prompt.md", "tools/mail_rules_prompt.md", "tools/rebase_prompt.md", "tools/fix_prompt.md")
# skills du Bureau, partagés par la revue de PR et la chaîne d'implémentation : la source est skills/<fichier>.md, publiée
# dans Kronn par publish.py et install.py (sync_skills), son id rangé dans skills.<clé> de la config ; un poste les nomme
# « bureau:<clé> » dans REVIEW_AGENTS ou IMPL_AGENTS. Pas d'épinglage (custom-x@N) : Kronn ne désactive un workflow qu'à
# la modification d'un skill par un agent, et le Bureau publie ses skills avec ses workflows, toujours ensemble.
BUREAU_SKILLS = {
    "grille": ("grille-revue.md", "Bureau · grille de revue de PR", "Trancher et écrire une revue de PR : priorités, verdict, inline, réactions, synthèse.", "🧐"),
    "recherches": ("recherches-hors-diff.md", "Bureau · recherches hors du diff", "R1 à R11 : les lecteurs hors du diff qu'une revue rate, chaque recherche tracée.", "🔎"),
    "exigences": ("conformite-ticket.md", "Bureau · conformité au ticket", "Les exigences du ticket et leur état dans le diff, ce que le ticket ne demande pas.", "🎯"),
    "tests": ("tests-contre-epreuve.md", "Bureau · tests et contre-épreuve", "Mutations, tests faibles, tests liés et cycle de vie.", "🧪"),
    "doc": ("doc-a-jour.md", "Bureau · doc à jour", "La doc du dépôt dit-elle encore vrai après le diff ; conventions et citations.", "📚"),
}


def skill_body(key):
    """La requête Kronn (POST /skills, PUT /skills/<id>) d'un skill du Bureau."""
    fichier, name, description, icon = BUREAU_SKILLS[key]
    content = Path(os.path.join(ROOT, "skills", fichier)).read_text(encoding="utf-8")
    assert "@@" not in content and "{{" not in content, fichier + " : ni @@ ni {{"
    return {"name": name, "description": description, "icon": icon, "category": "Domain", "content": content}


def sync_skills(call, cfg, say=print):
    """Crée ou met à jour dans Kronn les skills du Bureau (skills/*.md) ; range l'id d'un skill créé dans skills.<clé>.
    call(méthode, chemin, corps) rend le « data » de la réponse. Avant les workflows : leur rendu nomme ces ids."""
    ids = cfg.setdefault("skills", {})
    have = {s.get("id") for s in call("GET", "/skills", None) or [] if isinstance(s, dict)}
    for key in BUREAU_SKILLS:
        body = skill_body(key)
        ident = ids.get(key)
        if ident and ident in have:
            call("PUT", f"/skills/{ident}", body)
            say(f"skill {key} ({ident}) à jour")
        else:
            ids[key] = call("POST", "/skills", body)["id"]
            say(f"skill {key} ({ids[key]}) créé")
    return ids


def skill_ref(key, cfg):
    """Un skill du Bureau dans un prompt : un renvoi quand il est publié (chargé avec l'étape), sinon son texte recopié,
    pour qu'une installation dont les skills ne sont pas encore publiés ne perde pas ce savoir-faire."""
    if (cfg.get("skills") or {}).get(key):
        return f"(le skill « {BUREAU_SKILLS[key][1]} », chargé avec cette étape)"
    return skill_body(key)["content"]


def skills_of(names, cfg):
    """Les ids Kronn des skills d'un poste : « bureau:<clé> » devient l'id rangé dans skills.<clé> (absent : pas encore
    publié, le skill est omis) ; les autres noms restent tels quels."""
    ids = cfg.get("skills") or {}
    return [ids.get(n[7:]) if n.startswith("bureau:") else n for n in names if not n.startswith("bureau:") or ids.get(n[7:])]
REVIEW_SCHEDULE = "30 7,10,13,16,19 * * 1-5"  # cron des revues de PR, heures UTC (review.schedule de l'équipe pour un autre)
# modèles lancés en foreach (un sous-workflow par PR) : Kronn y écrit .kronn/current_task.json, il leur faut leur propre
# copie du projet (require_isolation), jamais le dossier principal ; le sous-workflow tourne dans celle de son parent
ISOLATED = {"review_one", "review_cron", "impl_chain", "ticket"}  # la chaîne : une copie du projet par ticket, 4 en parallèle
# sous-workflows qui tournent dans la copie de leur parent : relire une PR, les postes de la chaîne d'implémentation
SHARED_WORKSPACE = {"review_child", *(f"review_{p}" for p in REVIEW_POSTES), "impl_controles", *(f"impl_{p}" for p in IMPL_POSTES), *(f"support_{p}" for p in SUPPORT_POSTES),
                    *(f"ticket_{p}" for p in TICKET_POSTES), "ticket_un"}  # la salle de rédaction (2e étage)


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


_VERSION = {}


def impl_version():
    """Version de la chaîne d'implémentation rendue : empreinte des modèles impl*.json et de workflows/chaine.py, et le
    dernier commit qui les a touchés (une modification de la chaîne se juge sur les tickets qui l'ont suivie)."""
    if not _VERSION:
        import glob, hashlib, subprocess
        files = (sorted(glob.glob(os.path.join(TPL_DIR, "impl*.json"))) + [os.path.join(ROOT, p) for p in CHAINE_SCRIPTS + ("workflows/_chaine.py",)]
                 + [os.path.join(ROOT, "skills", f) for f, *_ in BUREAU_SKILLS.values()])
        h = hashlib.sha1()
        for f in files:
            h.update(Path(f).read_bytes())
        r = subprocess.run(["git", "-C", ROOT, "log", "-1", "--format=%h%x09%s", "--", "workflows/templates/impl*.json",
                            *CHAINE_SCRIPTS, "workflows/_chaine.py"], capture_output=True, text=True)
        commit, _, sujet = r.stdout.strip().partition("\t")
        _VERSION.update(hash=h.hexdigest()[:7], commit=commit, sujet=re.sub(r"[{}@]", "", sujet)[:120])  # ni {{ ni @@ dans un script
    return dict(_VERSION)


def review_version():
    """Version de la revue rendue : empreinte des modèles review*.json, de workflows/review.py, de son relevé commun et de la
    grille, et le dernier commit qui les a touchés ; gardée avec chaque revue (historique, page) pour juger une modification
    sur les PR qui l'ont suivie."""
    if not _RV_VERSION:
        import glob, hashlib, subprocess
        rel = ["workflows/review.py", "workflows/_releves.py", *(f"skills/{f}" for f, *_ in BUREAU_SKILLS.values())]
        files = sorted(glob.glob(os.path.join(TPL_DIR, "review*.json"))) + [os.path.join(ROOT, p) for p in rel]
        h = hashlib.sha1()
        for f in files:
            h.update(Path(f).read_bytes())
        try:  # sans git (ou subprocess bouchonné par un test) : l'empreinte suffit
            commit = subprocess.run(["git", "-C", ROOT, "log", "-1", "--format=%h", "--", "workflows/templates/review*.json", *rel],
                                    capture_output=True, text=True).stdout.strip()
        except OSError:
            commit = ""
        _RV_VERSION.update(hash=h.hexdigest()[:7], commit=commit)
    return dict(_RV_VERSION)


_RV_VERSION = {}


LIB_IMPORT = re.compile(r"^from (_lib|_plan|_checks|_chaine|_releves) import [\w, *]+(?:  #.*)?$", re.M)
# la chaîne d'implémentation : trois scripts et leur commun (_chaine.py, recopié dans chacun). Kronn passe un script en un
# seul argument « python3 -c » : sous Linux, 128 Kio au plus (MAX_ARG_STRLEN) ; ils ne reçoivent que leur part de la config
CHAINE_SCRIPTS = ("workflows/chaine.py", "workflows/chaine_controles.py", "workflows/chaine_pr.py")
CHAINE_CFG = ("impl", "models", "github", "kronn", "rhythm", "workflows", "actions")
REVIEW_CFG = ("review", "jira", "kronn", "models", "rhythm", "workflows", "actions", "github")
MAX_SCRIPT = 110 * 1024  # marge sous les 128 Kio d'un argument (tests/test_templates.py)


def without_comment_lines(code):
    """Le script sans ses lignes de commentaire seul (tokenize : jamais une ligne d'une chaîne, les prompts restent
    entiers) : elles ne servent qu'à la lecture du dépôt et pèsent sur les 128 Kio d'un argument."""
    lines = code.splitlines(keepends=True)
    drop = {tok.start[0] for tok in tokenize.generate_tokens(io.StringIO(code).readline)
            if tok.type == tokenize.COMMENT and not lines[tok.start[0] - 1][:tok.start[1]].strip()}
    return "".join(line for i, line in enumerate(lines, 1) if i not in drop)


def script_code(path, cfg):
    """Le script tel qu'il tourne dans Kronn (« python3 -c », sans fichier voisin) : workflows/_lib.py, _plan.py et _checks.py
    recopiés à la place de leur ligne « from _lib import … », les lignes de commentaire seul retirées, puis la config
    d'installation injectée à la place de __BUREAU_CONFIG__."""
    cfg = assemble.merged(cfg)  # réglages d'équipe du pack (#32) : les scripts n'ont pas accès au pack
    code = Path(os.path.join(ROOT, path)).read_text()
    seen = set()

    def lib(m):  # une seule copie par module, même importé par un autre (_chaine importe _lib et _checks)
        if m.group(1) in seen:
            return ""
        seen.add(m.group(1))
        body = Path(os.path.join(ROOT, "workflows", m.group(1) + ".py")).read_text()
        assert "@@" not in body and "{{" not in body, m.group(1) + ".py : ni @@ ni {{ (Kronn rendrait ses propres variables)"
        return LIB_IMPORT.sub(lib, body)
    code = LIB_IMPORT.sub(lib, code)
    code = without_comment_lines(code)
    # clés de premier niveau triées : même script, que les réglages d'équipe soient dans la config ou dans le pack (#32)
    c = {k: v for k, v in sorted(cfg.items()) if not k.startswith("_")}
    if path in CHAINE_SCRIPTS:  # la config entière ferait passer le script au-dessus de 128 Kio (un argument, sous Linux)
        c = {k: v for k, v in c.items() if k in CHAINE_CFG}
        c["github"] = {"repo": (cfg.get("github") or {}).get("repo") or ""}
        if isinstance(c.get("impl"), dict):  # les consignes de l'équipe vont dans les prompts (@@impl.guidelines@@), jamais lues par un script
            c["impl"] = {k: v for k, v in c["impl"].items() if k != "guidelines"}
    if path == "workflows/review.py":  # idem pour la revue : sa part de la config (les consignes de la chaîne pèsent)
        c = {k: v for k, v in c.items() if k in REVIEW_CFG}
    c.update(gitfut=assemble.gitfut(cfg), wiki_posters=assemble.wiki_posters(cfg),  # déduits du roster (scripts sans accès au dépôt)
             planning_names=assemble.planning_names(cfg),  # noms complets du roster, pour le planning des absences
             root=ROOT)  # dossier du dépôt : son venv (Pillow) pour réduire les images
    if path == "workflows/pr_update.py":  # AI-03 : logins GitHub du roster, dont les commentaires vont à l'agent des retours
        c["team_github"] = sorted({str(p["github"]) for p in assemble.roster(cfg) if p.get("github")})
    if path == "workflows/review.py":  # version de la revue gardée avec chaque revue (historique, page de récap)
        c["review_version"] = review_version()
    if path in CHAINE_SCRIPTS:  # version de la chaîne gardée dans le bilan de chaque run (page « Chaîne · bilan »)
        c["impl_version"] = impl_version()
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
        "bilan.page_id": cfg.get("bilan_page_id") or "",  # page « Chaîne · bilan » (installée avec la chaîne)
        "redaction_bilan.page_id": cfg.get("redaction_bilan_page_id") or "",  # page « Rédaction · bilan » (installée avec le modèle ticket)
        "retours_bilan.page_id": cfg.get("retours_bilan_page_id") or "",  # page « Retours · bilan » (installée avec « corriger »)
        "support_bilan.page_id": cfg.get("support_bilan_page_id") or "",  # page « Support · bilan » (installée avec l'investigation)
        "kronn.project_id": (cfg.get("kronn") or {}).get("project_id") or "",
        "jira.config_id": j.get("config_id") or "",
        "jira.project": j.get("project") or "",
        "jira.board": str(j.get("board") or ""),
        "jira.sprint_field": j.get("sprint_field") or "",
        "jira.review_version_field": j.get("review_version_field") or "",  # n° de version des corrections de PR (fix) ; vide : étapes retirées
        "jira.points_fields": ",".join(j.get("points_fields") or []),
        # temps gagné par l'IA (#79) : le champ des points « avec l'IA », lu avec le ticket (« ,customfield_… » ou rien)
        "jira.ai_points_q": "".join("," + f for f in [((j.get("ai_feedback") or {}).get("points") or {}).get("field")] if f)
        + ("".join("," + f for f in j.get("points_fields") or [] if f) if ((j.get("ai_feedback") or {}).get("points") or {}).get("field") else ""),
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
        # mise en prod (#58) : temps gagné par l'IA (#79, le modèle du Bureau s'il est installé et Jira connecté) et
        # transition Jira de fin (facultatifs : étapes retirées sans eux)
        "mep.ai_time": mep_ai_time(cfg),
        "mep.done_transition": str((cfg.get("mep") or {}).get("done_transition") or ""),
        # chargeur animé de l'annonce Teams (#59), passé à l'étape merge : le script ne lit rien sur le disque du dépôt
        "mep.loader": mep_loader(),
        # projet Kronn du workflow : celui de la revue (dépôts de l'équipe), sinon celui de Kronn
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
        # retours de PR (3e étage) : le modèle « corriger les commentaires d'une PR » installé (son relevé dans le cron live)
        "actions.fix_pr": (cfg.get("actions") or {}).get("fix_pr") or "",
        "models.ticket": (cfg.get("models") or {}).get("ticket") or "",  # salle de rédaction (2e étage) : son relevé dans le cron live
        "models.review_child": (cfg.get("models") or {}).get("review_child") or "",
        "review.project_id": rv.get("project_id") or (cfg.get("kronn") or {}).get("project_id") or "",
        "review.page_id": rv.get("page_id") or "",  # page de récap des revues, facultative
        "review.schedule": rv.get("schedule") or REVIEW_SCHEDULE,
        # sélection du cron : seulement les PR où le compte ou une de ses équipes est demandé (review.demandees), et ses équipes
        "review.selection": json.dumps({"demandees": bool(rv.get("demandees")), "equipes": list(rv.get("equipes") or [])},
                                       ensure_ascii=False, separators=(",", ":")),
        "review.repos_json": json.dumps([{"repo": r} for r in review_repos(cfg)], ensure_ascii=False, separators=(",", ":")),
        # langue de la review : français (défaut), ou celle de la PR (review.langue = "pr")
        "review.langue": ("Écris toute la review (`summary`, `blockers`, chaque `comments[].body`, chaque réponse) dans la langue "
                          "de la PR : celle de sa description, à défaut de son titre et des échanges ; français si rien ne la "
                          "dit. Une seule langue par review ; déclare-la dans `lang`." if str(rv.get("langue") or "").lower() == "pr" else
                          "toute la review est rédigée en FRANÇAIS (`summary`, `blockers`, chaque `comments[].body` et chaque "
                          "réponse), `lang` = `fr`."),
        "review.guidelines": str(rv.get("guidelines") or "Aucune consigne d'équipe en plus de la grille."),
        # corriger les commentaires d'une PR (#75) : consignes de l'équipe (section fix du pack), jamais celles de la revue
        "fix.guidelines": str((cfg.get("fix") or {}).get("guidelines") or "Aucune consigne d'équipe en plus des règles ci-dessus."),
        "issue.repo": (cfg.get("issue") or {}).get("repo") or (cfg.get("github") or {}).get("repo") or "",
        "issue.search_dirs": ", ".join((cfg.get("issue") or {}).get("search_dirs") or ["~/Sites", "~/Projects", "~/code"]),
        "issue.discussion": (cfg.get("issue") or {}).get("discussion") or "",  # discussion Kronn du récap, facultative
        "env.label": (cfg.get("env") or {}).get("label") or "env-branch",  # label qui construit l'env de branche (réglage d'équipe)
        # chaîne d'implémentation (#76) : ids des postes (enfants créés d'abord), consignes de l'équipe pour le code et les contrôles
        **{f"models.{k}": (cfg.get("models") or {}).get(k) or "" for k in ("assign", "impl_controles", "impl_chain",
                                                                          *(f"impl_{p}" for p in IMPL_POSTES),
                                                                          *(f"support_{p}" for p in SUPPORT_POSTES),  # postes Support (#62)
                                                                          *(f"ticket_{p}" for p in TICKET_POSTES), "ticket_un",  # salle de rédaction
                                                                          *(f"review_{p}" for p in REVIEW_POSTES))},  # postes de la revue
        "impl.guidelines": str((cfg.get("impl") or {}).get("guidelines") or "Aucune consigne d'équipe en plus de la doc du dépôt."),
    }


def mep_loader():
    try:
        return "data:image/png;base64," + base64.b64encode(Path(ROOT, "sprites", "teams", "loader.png").read_bytes()).decode()
    except OSError:
        return ""


def mep_ai_time(cfg):
    return (cfg.get("models") or {}).get("ai_time") or "" if (cfg.get("jira") or {}).get("config_id") else ""


def create_board_points(j):
    """Le champ du board où recopier les points après la création (étape points_board), quand il n'est pas celui de l'écran
    de création ; jira.create.board_copy à false : jamais (seule l'estimation de jira.create.points_field est remplie)."""
    board, c = (j.get("points_fields") or [""])[0], j.get("create") or {}
    return board if board and c.get("points_field") not in (None, "", board) and c.get("board_copy") is not False else ""


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
    if key in ("review_child", "review_one", "review_cron") or key.startswith("review_"):  # API GitHub : connexion GitHub de Kronn (github.config_id)
        return not (cfg.get("github") or {}).get("config_id") or (key == "review_cron" and not review_repos(cfg))
    if key == "chaine_bilan":  # la page du bilan de la chaîne : chaîne installée et page créée (install.py)
        return not ((cfg.get("models") or {}).get("impl_chain") and cfg.get("bilan_page_id"))
    if key == "support_bilan":  # la page du bilan du Support : investigation installée, canal réglé et page créée (install.py)
        s = cfg.get("support") or {}
        return not ((cfg.get("models") or {}).get("support") and cfg.get("support_bilan_page_id") and s.get("team") and s.get("channel"))
    if key == "redaction_bilan":  # la page du bilan de la rédaction : modèle ticket installé et page créée (install.py)
        return not ((cfg.get("models") or {}).get("ticket") and cfg.get("redaction_bilan_page_id"))
    if key == "retours_bilan":  # la page du bilan des retours : « corriger » installé (actions.fix_pr) et page créée (install.py)
        return not ((cfg.get("actions") or {}).get("fix_pr") and cfg.get("retours_bilan_page_id"))
    if key.startswith("impl"):  # la chaîne lit le ticket dans Jira et livre sur GitHub (gh)
        return not (cfg.get("jira") or {}).get("config_id")
    if key in ("estimate", "assign", "unassign", "ticket", "ai_time") or key.startswith("ticket_"):  # ses postes et chaque ticket aussi
        return not (cfg.get("jira") or {}).get("config_id")
    if key == "env":  # aucun dépôt où générer un env de branche
        return not assemble.env_repos({**cfg, "models": {**(cfg.get("models") or {}), "env": "?"}})
    if key == "deploy":  # aucun dépôt ni env hors prod réglé (deploy.repos)
        return not assemble.deploy_envs({**cfg, "models": {**(cfg.get("models") or {}), "deploy": "?"}})
    if key in ("support", "support_poll", "support_skip") or key.startswith("support_"):  # console Support (#62) : canal Teams réglé (support.team, support.channel)
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
            if k.startswith("skill:"):
                return skill_ref(k[6:], cfg)
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
            if "_poste" in s:  # chaîne d'implémentation ou investigation Support : agent, modèle et skills du poste
                role = s.pop("_poste")
                (poste_agent if role.split(".")[0] in POSTE_AGENTS else impl_agent)(s, role, cfg)
            src = s.pop("_skills_from", None)
            if src in ("review.skill_ids", "fix.skill_ids"):  # skills de l'équipe en plus de ceux du modèle (#78, #75)
                team = (cfg.get(src.split(".")[0]) or {}).get("skill_ids")
                if team is None and src == "fix.skill_ids":  # sans skills propres à la correction : ceux de la revue
                    team = (cfg.get("review") or {}).get("skill_ids")
                s["skill_ids"] = list(dict.fromkeys(s.get("skill_ids", []) + list(team or [])))
            for name in dropped:  # entrée d'une étape suivante qui lisait une étape retirée
                if isinstance(s.get("exec_stdin"), str):
                    s["exec_stdin"] = re.sub(r"\{\{steps\." + re.escape(name) + r"\.[\w.]+\}\}", "null", s["exec_stdin"])
        pin_tz(d)
    return _sub(d, values(cfg), cfg)


# chaîne d'implémentation (#76) : (tier, skills Kronn) par rôle d'agent ; léger pour lire et cadrer, fort pour coder et juger.
# Réglage impl.postes.<rôle> du pack ou de la config : agent (ClaudeCode, CopilotCli, Codex…), tier, model, skills (ajoutés).
IMPL_AGENTS = {
    "cadrage": ("reasoning", ["bureau:exigences"]),  # 📋 Plan : compris, fichiers impactés, façons de faire ; ta gate du plan tient lieu de critique
    "orchestrateur": ("default", []),  # en reasoning, Opus 5.5 a coupé deux fois (filtre reasoning_extraction)
    "code": ("reasoning", ["verification-before-completion"]), "code.relecture": ("default", []),
    # règles, sécurité, perf · a11y, besoin et doc : une étape, un sous-agent par poste, en même temps (Kronn ne lance pas
    # de sous-workflows en parallèle) ; ses skills couvrent les cinq. Le coordinateur ne fait que lancer et transmettre :
    # economy ; chaque sous-agent a son modèle (chaine_controles.SOUS_MODELES, impl.postes.controles.modeles)
    "controles": ("economy", ["security", "web-performance", "accessibility", "bureau:recherches", "bureau:exigences", "bureau:doc"]),
    "tests": ("default", ["testing", "bureau:tests"]),  # pas test-driven-development : ce poste éprouve, il n'écrit pas avant le code
    "livraison": ("economy", []), "retours": ("reasoning", ["receiving-code-review"]),
    "revue_pr": ("reasoning", ["bureau:recherches", "bureau:exigences", "bureau:tests"]),  # mode essai : revue locale du diff (la revue du Bureau a ses propres postes)
}
IMPL_TEAM_SKILLS = {"code", "code.relecture", "controles", "tests", "retours", "revue_pr"}  # + impl.skills de l'équipe (langages, conventions)


def impl_agent(step, role, cfg):
    tier, skills = IMPL_AGENTS[role]
    imp = cfg.get("impl") or {}
    conf = (imp.get("postes") or {}).get(role) or {}
    step["agent"] = conf.get("agent") or step.get("agent") or "ClaudeCode"
    # les outils déclarés par le modèle (impl_tests : sans MCP ni outils Kronn, contexte de départ plus léger) restent
    step["agent_settings"] = {**(step.get("agent_settings") or {}), "tier": conf.get("tier") or tier,
                              **({"model": conf["model"]} if conf.get("model") else {})}
    extra = list(conf.get("skills") or []) + (list(imp.get("skills") or []) if role in IMPL_TEAM_SKILLS else [])
    step["skill_ids"] = list(dict.fromkeys(skills_of(skills, cfg) + extra))


# investigation Support (#62) : (tier, skills Kronn) par poste ; léger pour trier et relire, plus fort pour chercher et
# rédiger. Réglage support.postes.<poste> du pack ou de la config : agent, tier, model, skills (ajoutés).
SUPPORT_AGENTS = {"tri": ("economy", []), "logs": ("default", []), "cause": ("default", []), "reponse": ("default", []),
                  "relecture": ("economy", [])}
# revue de PR : le cadrage juge aussi le ticket critère par critère ; fort pour lire le code et pour l'avis, qui tranche. Réglage review.postes.<poste>
# du pack ou de la config : agent, tier, model, skills (ajoutés) ; review.skill_ids de l'équipe pour ceux qui lisent le code
REVIEW_AGENTS = {"contexte": ("default", ["bureau:exigences"]), "docs": ("default", ["bureau:doc"]),
                 "lecture": ("reasoning", ["testing", "bureau:recherches", "bureau:tests"]), "securite": ("default", ["security"]),
                 "avis": ("reasoning", ["bureau:grille", "bureau:recherches", "bureau:exigences"])}
REVIEW_TEAM_SKILLS = {"lecture", "securite", "avis"}
POSTE_AGENTS = {"support": SUPPORT_AGENTS, "review": REVIEW_AGENTS}


def poste_agent(step, role, cfg):
    """Agent, modèle et skills d'un poste du Support ou de la revue (rôle « support.cause », « review.lecture »)."""
    part, k = role.split(".", 1)
    tier, skills = POSTE_AGENTS[part][k]
    sec = cfg.get(part) or {}
    conf = (sec.get("postes") or {}).get(k) or {}
    team = list(sec.get("skill_ids") or []) if part == "review" and k in REVIEW_TEAM_SKILLS else []
    step["agent"] = conf.get("agent") or step.get("agent") or "ClaudeCode"
    step["agent_settings"] = {**(step.get("agent_settings") or {}), "tier": conf.get("tier") or tier, **({"model": conf["model"]} if conf.get("model") else {})}
    step["skill_ids"] = list(dict.fromkeys(skills_of(skills, cfg) + team + list(conf.get("skills") or [])))


# fuseau des crons : leurs heures sont calculées en UTC (assemble.cron_hours) ; depuis Kronn 0.15.1, un cron sans fuseau
# suit celui de Kronn (souvent Europe/Paris) et partirait 1 ou 2 h plus tôt. 0.14 ignore ce champ.
CRON_TZ = "UTC"


def pin_tz(d):
    """Pose le fuseau d'un déclencheur Cron qui n'en a pas (rendu, et lecture d'un Kronn d'avant 0.15)."""
    t = d.get("trigger") or {}
    if t.get("type") == "Cron" and not t.get("timezone"):
        t["timezone"] = CRON_TZ


def legacy_kronn(cfg):
    """Kronn d'avant 0.15 : ses crons n'ont pas de fuseau (toujours UTC), templates.py check en pose un pour comparer."""
    with urllib.request.urlopen(f"{_api(cfg)}/health", timeout=10) as r:
        version = str(json.load(r).get("version", "0"))
    return tuple(int(x) for x in re.findall(r"\d+", version)[:3]) < (0, 15, 0)


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


def clean(kind, live, legacy=False):
    """Définition comparable : sans ids, dates, état ; étapes sans leur id. legacy : Kronn d'avant 0.15 (crons en UTC
    sans fuseau écrit), le fuseau est posé comme au rendu."""
    keys = WF_KEYS if kind == "workflow" else QP_KEYS
    # Kronn omet une liste de variables vide ; des garde-fous absents (null) ne sont pas un champ du modèle
    d = {k: copy.deepcopy(live.get(k)) for k in keys
         if k not in ("variables", "guards", "concurrency_key", "project_scope") or live.get(k) or kind != "workflow"}
    if kind == "workflow":
        for s in d["steps"]:
            s.pop("id", None)
        if legacy:
            pin_tz(d)
    return sans_vides(d)


def sans_vides(d):
    """Définition sans les champs d'étape vides (VIDES) : les deux côtés de templates.py check."""
    for s in d.get("steps") or []:
        for k, v in VIDES.items():
            if k in s and s[k] == v:
                del s[k]
    return d


def templatize(key, kind, d, cfg):
    """Remplace les valeurs propres à l'installation par des emplacements (l'inverse de render)."""
    scripts = TEMPLATES[key][2]
    vals = values(cfg)
    j = cfg.get("jira") or {}

    def walk(v):
        if isinstance(v, str):
            for k in BUREAU_SKILLS:  # un skill du Bureau dans un prompt (renvoi, ou son texte recopié) : son emplacement
                v = v.replace(skill_ref(k, cfg), f"@@skill:{k}@@")
            for k, val in (("page_id", vals["page_id"]), ("jira.config_id", vals["jira.config_id"]),
                           ("kronn.project_id", vals["kronn.project_id"]), ("microsoft.config_id", vals["microsoft.config_id"]),
                           ("microsoft.site", vals["microsoft.site"]), ("microsoft.item", vals["microsoft.item"]),
                           ("jira.statuses_json", vals["jira.statuses_json"]),
                           ("jira.review_version_field", vals["jira.review_version_field"])):
                if val and v == val:
                    return f"@@{k}@@"
            if vals["jira.points_fields"]:
                v = v.replace(vals["jira.points_fields"], "@@jira.points_fields@@")
            if vals["jira.ai_points_q"] and v.startswith("labels"):  # champs lus et écrits par le temps gagné IA (#79)
                v = v.replace(vals["jira.ai_points_q"], "@@jira.ai_points_q@@")
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
        if isinstance(v, dict):  # une clé peut être un champ Jira (corps d'une écriture)
            f = vals["jira.review_version_field"]
            return {("@@jira.review_version_field@@" if f and k == f else k): walk(x) for k, x in v.items()}
        return v

    d = walk(d)
    if (d.get("trigger") or {}).get("timezone") == CRON_TZ:  # posé au rendu (pin_tz) : le modèle reste sans fuseau
        d["trigger"].pop("timezone")
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
                qe = s["collect_api_data"]["sources"][0]["quick_exec"]
                qe["args"] = ["-c", tok] + (qe.get("args") or [])[2:]  # arguments de la sous-commande gardés
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
        bad, legacy = 0, legacy_kronn(cfg)
        for key, tpl in load_templates().items():
            kind, where, _ = TEMPLATES[key]
            ident = config_id(cfg, where)
            if not ident or ident in (cfg.get("own") or []):
                print(f"--   {key} : " + ("pas installé" if not ident else f"workflow {ident[:8]} gardé tel quel, non comparé"))
                continue
            same = sans_vides(render(tpl, cfg)) == clean(kind, fetch(kind, ident, cfg), legacy)
            bad += not same
            print(("ok   " if same else "DIFF ") + f"{key} : rendu {'identique au' if same else 'différent du'} workflow {ident[:8]}")
        sys.exit(1 if bad else 0)
    elif cmd == "render":
        print(json.dumps(render(load_templates()[sys.argv[2]], cfg), ensure_ascii=False, indent=1)[:4000])


if __name__ == "__main__":
    main()
