"""Modèles de workflows (python3 -m unittest tests/test_templates.py) : rendu pour une autre installation, sans Jira."""
import copy, json, os, re, sys, unittest

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
        inst = json.load(open(LOCAL))
        own = {inst["page_id"], inst["kronn"]["project_id"], (inst.get("jira") or {}).get("config_id"),
               *inst["workflows"].values(), *inst["actions"].values()} - {None, ""}
        for key, t in TPL.items():
            text = json.dumps(t)
            self.assertFalse(own & set(UUID.findall(text)), f"{key} contient un id de l'installation de référence")

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
                self.assertIn("from _lib import", open(os.path.join(ROOT, path)).read(), path)
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


if __name__ == "__main__":
    unittest.main()
