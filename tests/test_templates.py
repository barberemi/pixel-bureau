"""Modèles de workflows (python3 -m unittest tests/test_templates.py) : rendu pour une autre installation, sans Jira."""
import copy, json, os, re, sys, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import templates  # noqa: E402

REMI = templates.load_config()
TPL = templates.load_templates()
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")


def colleague(**over):
    c = copy.deepcopy(REMI)
    c.update(owner="p_coll2", page_id="11111111-2222-3333-4444-555555555555",
             kronn={**c["kronn"], "project_id": "99999999-8888-7777-6666-555555555555"})
    c["jira"] = {**c["jira"], "config_id": "abcdefab-cdef-abcd-efab-cdefabcdefab", "project": "AF", "board": 7}
    c.update(over)
    return c


class TemplatesTest(unittest.TestCase):
    def test_all_templates_present_and_without_installation_ids(self):
        self.assertEqual(set(TPL), set(templates.TEMPLATES))
        own = {REMI["page_id"], REMI["kronn"]["project_id"], REMI["jira"]["config_id"],
               *REMI["workflows"].values(), *REMI["actions"].values()}
        for key, t in TPL.items():
            text = json.dumps(t)
            self.assertFalse(own & set(UUID.findall(text)), f"{key} contient un id de l'installation de Rémi")

    def test_render_for_a_colleague(self):
        cfg = colleague()
        for key, t in TPL.items():
            out = json.dumps(templates.render(t, cfg), ensure_ascii=False)
            self.assertNotIn("@@", out, key)
            self.assertNotIn(REMI["page_id"], out, key)
            self.assertNotIn(REMI["jira"]["config_id"], out, key)
            self.assertNotIn("4f38f114", out, key)
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

    def test_render_without_jira_drops_jira_steps(self):
        cfg = colleague(jira={})
        team = templates.render(TPL["team"], cfg)
        names = [s["name"] for s in team["steps"]]
        self.assertNotIn("jira_team", names)
        self.assertNotIn("sprint_info", names)
        self.assertIn("github", names)
        shape = next(s for s in team["steps"] if s["name"] == "shape")
        self.assertNotIn("jira", shape["exec_stdin"])
        self.assertIn('"issues":null', shape["exec_stdin"])
        self.assertNotIn("_requires", json.dumps(team))

    def test_scripts_receive_config(self):
        for key, (kind, _, scripts) in templates.TEMPLATES.items():
            for path in scripts.values():
                self.assertIn("__BUREAU_CONFIG__", open(os.path.join(ROOT, path)).read(), path)
                self.assertIn(f"@@script:{path}@@", json.dumps(TPL[key]), path)


if __name__ == "__main__":
    unittest.main()
