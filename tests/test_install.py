"""Installateur (python3 -m unittest tests/test_install.py) : déroulé complet contre un faux Kronn, sans réseau."""
import json, os, shutil, sys, tempfile, unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import install  # noqa: E402

PROJECT = "99999999-8888-7777-6666-555555555555"
JIRA = "abcdefab-cdef-abcd-efab-cdefabcdefab"


class FakeKronn:
    def __init__(self, api):
        self.calls, self.n, self.store = [], 0, {}

    def _id(self):
        self.n += 1
        return f"{self.n:08d}-0000-4000-8000-000000000000"

    def call(self, method, path, body=None, timeout=60):
        self.calls.append((method, path, body))
        if path == "/health":
            return {"ok": True, "version": "0.14.1"}
        if path == "/projects":
            return [{"id": PROJECT, "name": "Front"}]
        if path == "/mcps":
            return {"configs": [{"id": JIRA, "server_id": "mcp-atlassian", "label": "Jira", "is_global": True}]}
        if path == "/agents":
            return [{"agent_type": "ClaudeCode", "name": "Claude Code", "installed": True, "enabled": True}]
        if path == "/workflows" and method == "GET":
            return [{"id": "aaaaaaaa-1111-2222-3333-444444444444", "name": "Revue de PR", "trigger_type": "Cron"},
                    {"id": "bbbbbbbb-1111-2222-3333-444444444444", "name": "Le Bureau · live (1 min)", "trigger_type": "Cron"}]
        if path == "/workflow-steps/test-api-call":
            return {"success": True, "data": {"self": "https://acme.atlassian.net/rest/agile/1.0/sprint/1", "name": "S1"}}
        if method == "POST" and path in ("/pages", "/workflows", "/quick-prompts"):
            i = self._id(); self.store[i] = body
            return {"id": i}
        if method == "GET" and path.startswith(("/pages/", "/workflows/")):
            i = path.split("/")[2]
            if i not in self.store:
                raise install.InstallError("404")
            return {"id": i, "steps": [{"name": s["name"], "id": "s-" + s["name"]} for s in self.store[i].get("steps", [])]}
        if method == "PUT" or path == "/mcp/workflow-trigger":
            return {}
        raise AssertionError(f"appel inattendu {method} {path}")

    def get(self, path):
        return self.call("GET", path)


ANSWERS = {"owner": "p_coll2", "project_id": "1", "jira_config": "1", "github_repo": "acme/front_web",
           "ai_agent": "1", "agents": "auto", "mep_workflow": "", "avatar": "editor", "music": "", "confirm": "o"}


class InstallTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.cfg_path = os.path.join(self.tmp, "bureau.config.json")
        self.roster = open(os.path.join(ROOT, "team", "roster.json")).read()
        self.fakes = []

        def make(api):
            f = FakeKronn(api); self.fakes.append(f); return f
        self.patches = [mock.patch.object(install, "Kronn", side_effect=make),
                        mock.patch.object(install.subprocess, "run", side_effect=FileNotFoundError())]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        open(os.path.join(ROOT, "team", "roster.json"), "w").write(self.roster)  # le test ne touche pas l'équipe
        shutil.rmtree(self.tmp)

    def run_install(self, answers, *extra):
        ap = os.path.join(self.tmp, "answers.json")
        json.dump(answers, open(ap, "w"))
        with mock.patch("sys.stdout", new=open(os.devnull, "w")):
            return install.main(["--config", self.cfg_path, "--answers", ap, *extra])

    def test_full_install_creates_everything_and_writes_config(self):
        self.assertEqual(self.run_install(ANSWERS), 0)
        k = self.fakes[-1]
        posts = [(p, b) for m, p, b in k.calls if m == "POST"]
        page = next(b for p, b in posts if p == "/pages")
        self.assertEqual([d["name"] for d in page["datasets"]], install.DATASETS)
        self.assertEqual(sum(1 for p, _ in posts if p == "/workflows"), 7)
        self.assertEqual(sum(1 for p, _ in posts if p == "/quick-prompts"), 1)
        cfg = json.load(open(self.cfg_path))
        self.assertEqual(cfg["owner"], "p_coll2")
        self.assertEqual(cfg["jira"]["config_id"], JIRA)
        self.assertEqual(cfg["jira"]["site"], "https://acme.atlassian.net")  # déduit de la réponse Jira
        self.assertEqual(set(cfg["workflows"]), {"office", "live", "team", "payroll"})
        self.assertTrue(all(cfg["actions"].values()))
        self.assertEqual([a["name"] for a in cfg["agents"]], ["Dwight"])  # ses workflows, pas ceux du Bureau
        # deuxième passe : les scripts reçoivent la config complète (ids de tous les crons)
        office_put = [b for m, p, b in k.calls if m == "PUT" and p == f"/workflows/{cfg['workflows']['office']}"][-1]
        script = office_put["steps"][0]["collect_api_data"]["sources"][0]["quick_exec"]["args"][1]
        self.assertIn(cfg["workflows"]["live"], script)
        html = next(b for m, p, b in k.calls if m == "PUT" and p.endswith("/html"))["html"]
        self.assertIn('"p_coll2"', html)
        self.assertIn(cfg["actions"]["gate"], html)
        self.assertNotIn("4f38f114", html)
        self.assertEqual(sum(1 for m, p, _ in k.calls if p == "/mcp/workflow-trigger"), 4)

    def test_without_jira_team_cron_has_no_jira_steps(self):
        self.assertEqual(self.run_install({**ANSWERS, "jira_config": "2"}), 0)
        k = self.fakes[-1]
        team = [b for m, p, b in k.calls if m == "POST" and p == "/workflows" and b["name"].startswith("Le Bureau · équipe")][0]
        self.assertNotIn("jira_team", [s["name"] for s in team["steps"]])
        self.assertEqual(json.load(open(self.cfg_path))["jira"], {})

    def test_relaunch_updates_instead_of_creating(self):
        self.run_install(ANSWERS)
        first = self.fakes[-1]
        with mock.patch.object(install, "Kronn", return_value=first):
            self.assertEqual(self.run_install(ANSWERS), 0)
        posts = [p for m, p, _ in first.calls if m == "POST" and p in ("/pages", "/workflows", "/quick-prompts")]
        self.assertEqual(len(posts), 1 + 7 + 1)  # rien de recréé à la relance

    def test_dry_run_creates_nothing(self):
        self.assertEqual(self.run_install(ANSWERS, "--dry-run"), 0)
        k = self.fakes[-1]
        self.assertFalse([1 for m, p, _ in k.calls if m in ("POST", "PUT") and p != "/workflow-steps/test-api-call"])
        self.assertFalse(os.path.exists(self.cfg_path))


if __name__ == "__main__":
    unittest.main()
