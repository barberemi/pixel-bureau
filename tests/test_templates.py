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
        """{{time.now}} suit le fuseau de Kronn depuis 0.15.1 : run_at de la revue reste en UTC (tri de la page récap)."""
        text = json.dumps(TPL["review_child"])
        self.assertIn("{{time.now|tz:UTC}}", text)
        self.assertNotIn("{{time.now}}", text)

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
