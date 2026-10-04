"""Installateur (python3 -m unittest tests/test_install.py) : déroulé complet contre un faux Kronn, sans réseau."""
import json, os, shutil, sys, tempfile, unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import install  # noqa: E402

PROJECT = "99999999-8888-7777-6666-555555555555"
JIRA = "abcdefab-cdef-abcd-efab-cdefabcdefab"


class FakeKronn:
    LIVE = "bbbbbbbb-1111-2222-3333-444444444444"  # homonyme du cron live : reste d'une installation sans config

    def __init__(self, api):
        self.calls, self.n = [], 0
        self.store = {self.LIVE: {"name": "Le Bureau · live (1 min)", "steps": [{"name": "snapshot"}]}}
        self.qps = {}

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
            return [{"id": "aaaaaaaa-1111-2222-3333-444444444444", "name": "Revue de PR", "trigger_type": "Cron"}] + \
                   [{"id": i, "name": b["name"], "trigger_type": "Cron"} for i, b in self.store.items() if "steps" in b]
        if path == "/pages" and method == "GET":
            return [{"id": i, "title": b.get("title")} for i, b in self.store.items() if "datasets" in b]
        if path == "/quick-prompts" and method == "GET":
            return [{"id": i, "name": b["name"]} for i, b in self.qps.items()]
        if path == "/workflow-steps/test-api-call":
            return {"success": True, "data": {"self": "https://acme.atlassian.net/rest/agile/1.0/sprint/1", "name": "S1"}}
        if method == "POST" and path.startswith("/pages/") and path.endswith("/datasets"):
            self.store[path.split("/")[2]]["datasets"].append(body)
            return body
        if method == "POST" and path in ("/pages", "/workflows", "/quick-prompts"):
            i = self._id(); (self.qps if path == "/quick-prompts" else self.store)[i] = body
            return {"id": i}
        if method in ("GET", "DELETE") and path.startswith(("/pages/", "/workflows/", "/quick-prompts/")):
            i = path.split("/")[2]
            box = self.qps if path.startswith("/quick-prompts/") else self.store
            if i not in box:
                raise install.InstallError("404")
            if method == "DELETE":
                del box[i]
                return {}
            b = box[i]
            return {"id": i, "name": b.get("name"), "title": b.get("title"), "datasets": b.get("datasets"),
                    "steps": [{**s, "id": "s-" + s["name"]} for s in b.get("steps", [])]}
        if method == "PUT" or path == "/mcp/workflow-trigger":
            return {}
        raise AssertionError(f"appel inattendu {method} {path}")

    def get(self, path):
        return self.call("GET", path)


ANSWERS = {"owner": "p_coll2", "project_id": "1", "reuse": "new", "jira_config": "1", "github_repo": "acme/front_web",
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
        self.assertEqual(sum(1 for p, _ in posts if p == "/workflows"), 8)
        self.assertEqual(sum(1 for p, _ in posts if p == "/quick-prompts"), 1)
        cfg = json.load(open(self.cfg_path))
        self.assertEqual(cfg["owner"], "p_coll2")
        self.assertEqual(cfg["jira"]["config_id"], JIRA)
        self.assertEqual(cfg["jira"]["site"], "https://acme.atlassian.net")  # déduit de la réponse Jira
        self.assertEqual(set(cfg["workflows"]), {"office", "live", "team", "payroll"})
        self.assertTrue(all(cfg["actions"].values()))
        self.assertEqual([a["name"] for a in cfg["agents"]], ["Dwight"])  # ses workflows, pas ceux du Bureau
        self.assertNotIn("seat", cfg["agents"][0])  # sa place : celle que le plan lui donne
        self.assertEqual(cfg["layout"], "layouts/equipe.json")  # plan par défaut
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
        self.assertEqual(len(posts), 1 + 8 + 1)  # rien de recréé à la relance

    def test_relaunch_adds_missing_datasets(self):
        self.run_install(ANSWERS)
        first = self.fakes[-1]
        page_id = json.load(open(self.cfg_path))["page_id"]
        first.store[page_id]["datasets"] = [d for d in first.store[page_id]["datasets"] if d["name"] != "layout"]  # page d'avant
        with mock.patch.object(install, "Kronn", return_value=first):
            self.assertEqual(self.run_install(ANSWERS), 0)
        self.assertEqual([d["name"] for d in first.store[page_id]["datasets"]], install.DATASETS)

    def test_reuses_same_named_workflow_instead_of_creating(self):
        answers = {k: v for k, v in ANSWERS.items() if k != "reuse"}  # défaut : homonymes réutilisés
        self.assertEqual(self.run_install(answers), 0)
        k = self.fakes[-1]
        cfg = json.load(open(self.cfg_path))
        self.assertEqual(cfg["workflows"]["live"], FakeKronn.LIVE)
        self.assertEqual(sum(1 for m, p, _ in k.calls if m == "POST" and p == "/workflows"), 7)
        self.assertTrue([1 for m, p, _ in k.calls if m == "PUT" and p == f"/workflows/{FakeKronn.LIVE}"])  # mis à jour
        self.assertEqual([a["name"] for a in cfg["agents"]], ["Dwight"])

    def test_never_takes_over_another_installation(self):
        k = FakeKronn("http://x")
        k.store["cccccccc-0000-4000-8000-000000000000"] = {"title": "Le Bureau de Rémi", "datasets": []}
        k.store[FakeKronn.LIVE]["steps"][0]["page_id"] = "cccccccc-0000-4000-8000-000000000000"
        answers = {kk: v for kk, v in ANSWERS.items() if kk != "reuse"}
        with mock.patch.object(install, "Kronn", return_value=k):
            self.assertEqual(self.run_install(answers), 0)
        self.assertNotEqual(json.load(open(self.cfg_path))["workflows"]["live"], FakeKronn.LIVE)
        self.assertFalse([1 for m, p, _ in k.calls if m == "PUT" and p == f"/workflows/{FakeKronn.LIVE}"])

    def test_own_workflow_by_id_is_kept_as_is(self):
        mine = "aaaaaaaa-1111-2222-3333-444444444444"
        answers = {**ANSWERS, "reuse": "ask", **{f"reuse_{k}": "new" for k in ("office", "live", "payroll", "avatar", "gate", "relaunch", "ask")},
                   "reuse_team": "id", "reuse_team_id": mine, "reuse_team_mode": "own"}
        self.assertEqual(self.run_install(answers), 0)
        k = self.fakes[-1]
        cfg = json.load(open(self.cfg_path))
        self.assertEqual(cfg["workflows"]["team"], mine)
        self.assertEqual(cfg["own"], [mine])
        self.assertFalse([1 for m, p, _ in k.calls if m in ("PUT", "DELETE") and p == f"/workflows/{mine}"])  # jamais touché
        self.assertEqual(cfg["agents"], [])  # branché comme cron équipe : plus un agent
        # désinstallation : tout le Bureau part, sauf le workflow branché tel quel
        import uninstall
        with mock.patch.object(uninstall, "Kronn", return_value=k), mock.patch("sys.stdout", new=open(os.devnull, "w")):
            self.assertEqual(uninstall.main(["--config", self.cfg_path, "--dry-run"]), 0)
            self.assertFalse([1 for m, _, _ in k.calls if m == "DELETE"])
            self.assertEqual(uninstall.main(["--config", self.cfg_path, "--yes"]), 0)
        deleted = [p for m, p, _ in k.calls if m == "DELETE"]
        self.assertEqual(len(deleted), 7 + 1 + 1)  # 7 workflows, le QP, la page
        self.assertNotIn(f"/workflows/{mine}", deleted)
        self.assertEqual(deleted[-1], f"/pages/{cfg['page_id']}")  # la page en dernier
        after = json.load(open(self.cfg_path))
        self.assertEqual((after["page_id"], after["workflows"], after["actions"]), (None, {"team": mine}, {}))
        self.assertEqual(after["owner"], "p_coll2")  # réponses gardées pour une réinstallation

    def test_uninstall_refuses_reference_page(self):
        import uninstall
        install.jdump({"page_id": "4f38f114-e010-41ba-b34e-832ff9a72672", "kronn": {"api": "http://x"}}, self.cfg_path)
        with self.assertRaises(install.InstallError):
            uninstall.main(["--config", self.cfg_path, "--yes"])

    def test_own_layout_file(self):
        L = json.load(open(os.path.join(ROOT, "layouts", "exemple-startup.json")))
        mine = os.path.join(self.tmp, "mon-plan.json")
        json.dump(L, open(mine, "w"))
        self.assertEqual(self.run_install({**ANSWERS, "layout": "__file__", "layout_file": mine}), 0)
        self.assertEqual(json.load(open(self.cfg_path))["layout"], mine)
        html = next(b for m, p, b in self.fakes[-1].calls if m == "PUT" and p.endswith("/html"))["html"]
        self.assertIn('"exemple-startup"', html)  # la page embarque ce plan

    def test_invalid_layout_is_refused_before_anything_is_created(self):
        L = json.load(open(os.path.join(ROOT, "layouts", "exemple-startup.json")))
        L["exit"] = [5, 5]
        bad = os.path.join(self.tmp, "casse.json")
        json.dump(L, open(bad, "w"))
        with self.assertRaises(install.InstallError) as e:
            self.run_install({**ANSWERS, "layout": "__file__", "layout_file": bad})
        self.assertIn("plan invalide", str(e.exception))
        self.assertFalse([c for c in self.fakes[-1].calls if c[0] in ("POST", "PUT")])

    def test_settings_survive_a_relaunch(self):
        self.run_install(ANSWERS)
        cfg = json.load(open(self.cfg_path))
        json.dump({**cfg, "ui": {"todo": "folded"}}, open(self.cfg_path, "w"))
        with mock.patch.object(install, "Kronn", return_value=self.fakes[-1]):
            self.assertEqual(self.run_install(ANSWERS), 0)
        self.assertEqual(json.load(open(self.cfg_path))["ui"], {"todo": "folded"})

    def test_dry_run_creates_nothing(self):
        self.assertEqual(self.run_install(ANSWERS, "--dry-run"), 0)
        k = self.fakes[-1]
        self.assertFalse([1 for m, p, _ in k.calls if m in ("POST", "PUT") and p != "/workflow-steps/test-api-call"])
        self.assertFalse(os.path.exists(self.cfg_path))


if __name__ == "__main__":
    unittest.main()
