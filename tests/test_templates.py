"""Modèles de workflows (python3 -m unittest tests/test_templates.py) : rendu pour une autre installation, sans Jira."""
import copy, json, os, re, sys, unittest
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import templates  # noqa: E402

BASE = templates.assemble.demo_config()  # installation de démonstration (les tests ne lisent pas la config locale)
LOCAL = os.path.join(ROOT, "bureau.config.json")
TPL = templates.load_templates()
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")


def colleague(**over):
    c = copy.deepcopy(BASE)
    c.update(owner="p_darryl", page_id="11111111-2222-3333-4444-555555555555",
             kronn={**c["kronn"], "project_id": "99999999-8888-7777-6666-555555555555"})
    c["jira"] = {**c["jira"], "config_id": "abcdefab-cdef-abcd-efab-cdefabcdefab", "project": "AF", "board": 7}
    c.update(over)
    return c


class TemplatesTest(unittest.TestCase):
    def test_no_rendered_script_holds_double_braces(self):
        """Kronn refuse un script Exec qui contient deux accolades ouvrantes (il les prendrait pour une variable) : la
        mise à jour du workflow échoue et l'ancien reste en place (PR #202, écarts Jira en monospace)."""
        import glob
        cfg = json.loads(open(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json"), encoding="utf-8").read())
        for f in sorted(glob.glob(os.path.join(ROOT, "workflows", "*.py"))):
            if not os.path.basename(f).startswith("_"):
                rel = os.path.relpath(f, ROOT)
                self.assertNotIn("{" * 2, templates.script_code(rel, cfg), rel)

    def test_every_rendered_script_fits_in_one_linux_argument(self):
        """Kronn passe chaque script en un seul argument « python3 -c » : sous Linux, 128 Kio au plus par argument
        (MAX_ARG_STRLEN), au-delà « Argument list too long » (CI de la PR #210 : chaine.py rendu à 137 Ko). Chaque script
        cité par un modèle (@@script:…@@), rendu avec une config d'équipe chargée (consignes longues), reste sous 110 Kio ;
        les scripts de la chaîne ne reçoivent que leur part de la config."""
        cfg = json.loads(Path(ROOT, "tests", "fixtures", "bureau.config.json").read_text(encoding="utf-8"))
        cfg["impl"] = {**(cfg.get("impl") or {}), "guidelines": "- consigne d'équipe\n" * 600, "max_tours": 7}  # ~12 Ko, comme un pack réel
        cfg["review"] = {**(cfg.get("review") or {}), "guidelines": "- consigne de revue\n" * 600}
        paths = sorted(set(re.findall(r"@@script:([\w/.]+)@@", json.dumps(TPL))))
        self.assertIn("workflows/chaine_pr.py", paths)
        for rel in paths:
            code = templates.script_code(rel, cfg)
            self.assertLess(len(code.encode()), templates.MAX_SCRIPT, rel)
            compile(code, rel, "exec")
        chaine = templates.script_code("workflows/chaine.py", cfg)
        self.assertNotIn("consigne de revue", chaine)  # pas la config des autres
        self.assertNotIn("consigne d'équipe", chaine)  # les consignes vont dans les prompts (@@impl.guidelines@@), aucun script ne les lit
        self.assertIn('"max_tours": 7', chaine)  # le reste du réglage impl, si
        self.assertEqual(chaine.count("def read_json("), 1)  # _lib recopié une fois, même importé par _chaine

    def test_pr_update_receives_the_roster_github_logins(self):
        """AI-03 : les commentaires de l'équipe vont à l'agent des retours même sans droit sur le dépôt ; le script n'a pas
        accès au pack, ses logins GitHub (roster et people de la config) lui sont injectés au rendu."""
        cfg = json.loads(Path(ROOT, "tests", "fixtures", "bureau.config.json").read_text(encoding="utf-8"))
        code = templates.script_code("workflows/pr_update.py", cfg)
        logins = json.loads(re.search(r'"team_github": (\[[^\]]*\])', code).group(1))
        self.assertIn("pambeesly", logins)
        self.assertIn("hollyflax", logins)
        self.assertNotIn('"team_github"', templates.script_code("workflows/review.py", cfg))

    def test_git_hooks_are_neutralised_for_the_scripts(self):
        """AI-10 : les git des scripts (copies dont le .git est partagé) et le setup bash de la revue n'exécutent aucun hook."""
        cfg = json.loads(Path(ROOT, "tests", "fixtures", "bureau.config.json").read_text(encoding="utf-8"))
        for rel in ("workflows/pr_update.py", "workflows/chaine.py", "workflows/chaine_pr.py", "workflows/review.py"):
            self.assertIn('GIT_CONFIG_KEY_0="core.hooksPath", GIT_CONFIG_VALUE_0="/dev/null"', templates.script_code(rel, cfg), rel)
        setup = next(s for s in TPL["review_child"]["definition"]["steps"] if s["name"] == "setup")
        self.assertIn("export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null\n", setup["exec_args"][1])
        self.assertLess(setup["exec_args"][1].index("GIT_CONFIG_COUNT"), setup["exec_args"][1].index("worktree add"))

    def test_support_postes_have_no_bash(self):
        """AI-08 : les postes Support lisent un message Teams non fiable : lecture du code (Read, Grep, Glob), leur
        discussion et api_call (tickets Jira cités, GET seulement d'après la consigne), jamais Bash (ni rendu, ni modèle)."""
        keys = [k for k in TPL if k.startswith("support_") and any(s["step_type"]["type"] == "Agent" for s in TPL[k]["definition"]["steps"])]
        self.assertEqual(sorted(keys), ["support_cause", "support_logs", "support_relecture", "support_reponse", "support_tri"])
        for k in keys:
            for s in TPL[k]["definition"]["steps"]:
                if s["step_type"]["type"] == "Agent":
                    tools = s["agent_settings"]["tools"]
                    self.assertEqual(tools["cli"], ["Read", "Grep", "Glob"], k)
                    self.assertEqual(tools["kronn_internal"], ["disc_append", "disc_get_message", "disc_meta", "api_call"], k)
                    self.assertIn("api_call, GET seulement", s["description"], k)
            self.assertNotIn('"Bash"', json.dumps(templates.render(TPL[k], BASE), ensure_ascii=False), k)

    def test_all_templates_present_and_without_installation_ids(self):
        """Les modèles exportés (templates.py export) ne gardent aucun id de l'installation qui les a exportés."""
        self.assertEqual(set(TPL), set(templates.TEMPLATES))
        if not os.path.exists(LOCAL):
            self.skipTest("pas d'installation locale (bureau.config.json) : rien à comparer")
        inst = json.loads(Path(LOCAL).read_text())
        own = {inst["page_id"], inst["kronn"]["project_id"], (inst.get("jira") or {}).get("config_id"),
               *inst["workflows"].values(), *inst["actions"].values()} - {None, ""}
        for key, t in TPL.items():
            text = json.dumps(t)
            self.assertFalse(own & set(UUID.findall(text)), f"{key} contient un id de l'installation de référence")

    def test_check_compares_the_run_guards(self):
        """templates.py check : les garde-fous d'un workflow (guards, posés par le modèle de mise en prod) font partie de
        la comparaison ; absents (null chez Kronn), ils ne comptent pas (sinon le check signalait un écart à tort)."""
        live = {"name": "x", "steps": [{"id": "s1", "name": "a"}], "guards": {"timeout_seconds": 14400}, "variables": []}
        self.assertEqual(templates.clean("workflow", live)["guards"], {"timeout_seconds": 14400})
        self.assertNotIn("guards", templates.clean("workflow", {**live, "guards": None}))
        mep = templates.render(TPL["mep"], colleague())
        self.assertEqual(templates.clean("workflow", {**mep, "steps": [dict(s, id="i") for s in mep["steps"]]})["guards"], mep["guards"])

    def test_check_ignores_empty_step_fields_and_compares_the_project_scope(self):
        """templates.py check : Kronn 0.15.1 ajoute prompt_template "" à chaque étape et omet skill_ids et
        sub_workflow_variables vides ; sans effet, ces champs ne sont pas un écart. project_scope (impl_chain : tous les
        projets) est comparé quand il est posé."""
        chain = templates.render(TPL["impl_chain"], colleague())
        live = {**chain, "steps": [{k: v for k, v in dict(s, id="i", prompt_template=s.get("prompt_template", "")).items()
                                    if v not in ([], {})} for s in chain["steps"]]}
        self.assertEqual(templates.sans_vides(chain), templates.clean("workflow", live))
        self.assertNotEqual(templates.sans_vides(chain), templates.clean("workflow", {**live, "project_scope": None}))

    def test_exec_timeouts_within_kronn_limit(self):
        """Kronn refuse un Exec dont exec_timeout_secs dépasse 1800 s (le workflow entier n'est alors pas publié : #189)."""
        for key, tpl in templates.load_templates().items():
            for st in (tpl.get("definition") or tpl).get("steps") or []:
                t = st.get("exec_timeout_secs")
                if t is not None:
                    self.assertTrue(1 <= t <= 1800, "%s · %s : exec_timeout_secs %s" % (key, st.get("name"), t))

    def test_crons_pinned_to_utc(self):
        """Heures des crons calculées en UTC (assemble.cron_hours) : le rendu pose timezone UTC sur chaque Cron, sinon
        Kronn 0.15.1 les lirait dans son fuseau (Europe/Paris) au premier PUT. Le modèle reste sans fuseau (export), un
        Kronn d'avant 0.15 (pas de fuseau écrit) se compare avec legacy, un autre fuseau reste un écart."""
        crons = [k for k, t in TPL.items() if (t["definition"].get("trigger") or {}).get("type") == "Cron"]
        self.assertGreaterEqual(len(crons), 9)
        for key in crons:
            self.assertNotIn("timezone", TPL[key]["definition"]["trigger"], f"{key} : modèle sans fuseau")
            self.assertEqual(templates.render(TPL[key], colleague())["trigger"]["timezone"], "UTC", key)
        self.assertNotIn("timezone", templates.render(TPL["relaunch"], colleague())["trigger"], "manuel : pas de fuseau")
        live = {"name": "x", "steps": [], "trigger": {"type": "Cron", "schedule": "0 7 * * *"}}
        self.assertEqual(templates.clean("workflow", live, legacy=True)["trigger"]["timezone"], "UTC")
        self.assertNotIn("timezone", templates.clean("workflow", live)["trigger"], "0.15 sans fuseau : écart signalé")
        paris = {**live, "trigger": {**live["trigger"], "timezone": "Europe/Paris"}}
        self.assertEqual(templates.clean("workflow", paris, legacy=True)["trigger"]["timezone"], "Europe/Paris")
        utc = templates.render(TPL["office"], colleague())
        self.assertNotIn("timezone", templates.templatize("office", "workflow", utc, colleague())["definition"]["trigger"])

    def test_review_run_at_stays_utc(self):
        """run_at de la revue : posé en UTC par write_ctx dès le départ (tri de la page récap, et son coût rapproché à moins
        de 5 min du début de la revue, les postes passés), jamais {{time.now}} qui suit le fuseau de Kronn depuis 0.15.1."""
        text = json.dumps(TPL["review_child"])
        self.assertIn("{{state.run_at}}", text)
        self.assertNotIn("{{time.now", text)
        ctx = next(s for s in TPL["review_child"]["definition"]["steps"] if s["name"] == "write_ctx")
        self.assertEqual(ctx["exec_args"][:3], ["-c", "@@script:workflows/review.py@@", "contexte"])

    def test_mep_runs_one_at_a_time_per_project(self):
        """Mises en prod de projets différents en même temps, une seule à la fois par projet (concurrency_key) : la clé
        lit la variable de lancement project ; check la compare, absente (null chez Kronn) elle ne compte pas."""
        d = TPL["mep"]["definition"]
        self.assertEqual((d["concurrency_limit"], d["concurrency_key"]), (1, "{{project}}"))
        self.assertIn("project", [v["name"] for v in d["variables"]])
        live = {"name": "x", "steps": [], "variables": [], "concurrency_key": "{{project}}"}
        self.assertEqual(templates.clean("workflow", live)["concurrency_key"], "{{project}}")
        self.assertNotIn("concurrency_key", templates.clean("workflow", {**live, "concurrency_key": None}))

    def test_workflows_never_take_the_main_checkout_lock(self):
        """Les scripts du Bureau n'écrivent que dans ~/.cache et des dossiers temporaires : chaque workflow le déclare
        (main_tree_read_only), sinon Kronn le fait attendre le dossier du projet et le refuse au-delà de 60 s quand
        plusieurs crons partent à la même minute (étape __workspace__ en échec)."""
        for key, t in TPL.items():
            if t["kind"] != "workflow":
                continue
            # revue de PR (#78) : un sous-workflow par PR en foreach, que Kronn lance dans une copie isolée du projet
            # (jamais le dossier principal) ; le sous-workflow tourne dans la copie de son parent
            want = {"hooks": {}, "require_isolation": True} if key in templates.ISOLATED else None if key in templates.SHARED_WORKSPACE \
                else {"hooks": {}, "require_isolation": False, "main_tree_read_only": True}
            self.assertEqual(t["definition"].get("workspace_config"), want, key)

    def test_render_for_a_colleague(self):
        cfg = colleague()
        for key, t in TPL.items():
            out = json.dumps(templates.render(t, cfg), ensure_ascii=False)
            self.assertNotIn("@@", out, key)
            self.assertNotIn(BASE["page_id"], out, key)
            self.assertNotIn(BASE["jira"]["config_id"], out, key)
        team = templates.render(TPL["team"], cfg)
        jql = next(s for s in team["steps"] if s["name"] == "jira_team")["api_query"]["jql"]
        self.assertTrue(jql.startswith("project = AF AND"))
        sprint = next(s for s in team["steps"] if s["name"] == "sprint_info")
        self.assertEqual(sprint["api_endpoint_path"], "/rest/agile/1.0/board/7/sprint")
        self.assertEqual(sprint["api_config_id"], cfg["jira"]["config_id"])
        pub = next(s for s in team["steps"] if s["step_type"]["type"] == "PublishPageData")
        self.assertEqual(pub["page_publish"]["page_id"], cfg["page_id"])
        self.assertEqual(team["project_id"], cfg["kronn"]["project_id"])
        shape = next(s for s in team["steps"] if s["name"] == "shape")
        self.assertIn('"page_id": "11111111-2222-3333-4444-555555555555"', shape["exec_args"][1])  # config injectée
        self.assertIn("Darryl te pose", templates.render(TPL["ask"], cfg)["prompt_template"])

    def test_sketch_prompt_carries_the_shared_text_and_the_repo(self):
        """Le Quick Prompt « plan vers brouillon » reprend tools/plan_prompt.md (comme plan.py from-image) et les commandes
        du dépôt de l'installation ; templatize retrouve exactement le modèle."""
        cfg = colleague()
        qp = templates.render(TPL["sketch"], cfg)
        self.assertTrue(qp["prompt_template"].startswith(templates.text_of("tools/plan_prompt.md")))
        self.assertIn(f"python3 {ROOT}/tools/plan.py check", qp["prompt_template"])
        self.assertEqual(qp["variables"], [])  # sans variable : il s'enchaîne après l'image jointe dans une discussion
        back = templates.templatize("sketch", "quick_prompt", copy.deepcopy(qp), cfg)
        self.assertEqual(back["definition"], TPL["sketch"]["definition"])

    def test_render_without_jira_drops_jira_steps(self):
        cfg = colleague(jira={})
        team = templates.render(TPL["team"], cfg)
        names = [s["name"] for s in team["steps"]]
        self.assertNotIn("jira_team", names)
        self.assertNotIn("sprint_info", names)
        self.assertNotIn("new_tickets", names)
        self.assertNotIn("since", names)
        self.assertIn("github", names)
        shape = next(s for s in team["steps"] if s["name"] == "shape")
        self.assertNotIn("jira", shape["exec_stdin"])
        self.assertIn('"new_tickets":null', shape["exec_stdin"])
        self.assertIn('"issues":null', shape["exec_stdin"])
        self.assertNotIn("_requires", json.dumps(team))

    def test_scripts_receive_lib_and_config(self):
        cfg = colleague()
        for key, (kind, _, scripts) in templates.TEMPLATES.items():
            for path in scripts.values():
                self.assertIn("from _lib import", Path(os.path.join(ROOT, path)).read_text(), path)
                self.assertIn(f"@@script:{path}@@", json.dumps(TPL[key]), path)
                code = templates.script_code(path, cfg)
                self.assertNotIn("from _lib import", code, path)
                self.assertNotIn("__BUREAU_CONFIG__", code, path)
                self.assertIn("def is_bureau(", code, path)
                self.assertIn(cfg["kronn"]["project_id"], code, path)  # la chaîne : sa part de la config seulement
                if path not in templates.CHAINE_SCRIPTS and path != "workflows/review.py":  # la revue : sa part aussi
                    self.assertIn(cfg["page_id"], code, path)
                compile(code, path, "exec")  # le script recopié reste du Python valide

    def script_cfg(self, cfg):
        code = templates.script_code("workflows/gitfut_snapshot.py", cfg)
        return json.loads(re.search(r'_CFG = r"""(.*?)"""', code, re.S).group(1))

    def test_gitfut_and_posters_come_from_the_roster(self):
        """Cartes GitFut : le login github du roster, sauf clé gitfut posée (false = aucune) ; affiches : top3.wiki du roster."""
        cfg = colleague(people=BASE["people"] + [{"key": "p_new", "name": "New", "github": "NewLogin",
                                 "passion": {"top3": {"title": "Films", "top": ["A", "B", "C"], "wiki": ["A_(film)", "B_(film)"]}}}],
                        wiki_posters=["B_(film)", "Z_(film)"])
        got = self.script_cfg(cfg)
        self.assertEqual(got["gitfut"]["p_new"], "NewLogin")
        self.assertEqual(got["gitfut"]["p_pam"], "pambeesly")
        self.assertNotIn("p_jan", got["gitfut"])  # pas de login github
        self.assertEqual(got["wiki_posters"], ["A_(film)", "B_(film)", "Z_(film)"])
        self.assertEqual(self.script_cfg(colleague(gitfut={"p_pam": "Pam"}))["gitfut"], {"p_pam": "Pam"})
        self.assertEqual(self.script_cfg(colleague(gitfut=False))["gitfut"], {})


    def test_cron_hours_follow_the_office_timezone(self):
        """Les crons tournent aux heures de bureau du fuseau (Kronn lit les crons en UTC), 2 h avant et 1 h après."""
        hours = lambda tz, h: templates.assemble.cron_hours({"rhythm": {"timezone": tz, "office_hours": h}})
        self.assertEqual(hours("Europe/Paris", [8, 20]), "4-20")  # comme avant : été (UTC+2) comme hiver (UTC+1)
        self.assertEqual(hours("America/New_York", [9, 18]), "11-23,0")  # passe minuit UTC
        self.assertEqual(hours("Asia/Kolkata", [9, 18]), "1-14")  # décalage d'une demi-heure
        self.assertEqual(hours("UTC", [0, 24]), "*")
        c = colleague(rhythm={**BASE["rhythm"], "timezone": "America/New_York", "office_hours": [9, 18]})
        live = templates.render(TPL["live"], c)
        self.assertEqual(live["trigger"]["schedule"], "* 11-23,0 * * *")
        self.assertEqual(templates.assemble.cron_schedules(c)["team"], "*/10 11-23,0 * * 1-5")  # le calendrier de la page aussi
        back = templates.templatize("live", "workflow", live, c)["definition"]  # export : l'emplacement revient
        self.assertEqual(back["trigger"]["schedule"], "* @@cron_hours@@ * * *")


if __name__ == "__main__":
    unittest.main()
