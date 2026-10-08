"""Installateur (python3 -m unittest tests/test_install.py) : déroulé complet contre un faux Kronn, sans réseau."""
import copy, json, os, re, shutil, sys, tempfile, unittest
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
            ep = body["step"]["api_endpoint_path"]
            if ep.endswith("/configuration"):
                return {"success": True, "envelope": {"data": {"columnConfig": {"columns": [
                    {"name": "Backlog", "statuses": [{"id": "1"}]}, {"name": "Doing", "statuses": [{"id": "2"}]},
                    {"name": "Code review", "statuses": [{"id": "3"}]}, {"name": "QA", "statuses": [{"id": "4"}, {"id": "9"}]},
                    {"name": "Ready to ship", "statuses": [{"id": "5"}]}, {"name": "Shipped", "statuses": [{"id": "6"}]}]}}}}
            if ep == "/rest/api/2/status":
                return {"success": True, "envelope": {"data": [
                    {"id": "1", "name": "Open", "statusCategory": {"key": "new"}}, {"id": "2", "name": "Building", "statusCategory": {"key": "indeterminate"}},
                    {"id": "3", "name": "Peer review", "statusCategory": {"key": "indeterminate"}},
                    {"id": "4", "name": "In QA", "statusCategory": {"key": "indeterminate"}}, {"id": "9", "name": "Reopened", "statusCategory": {"key": "indeterminate"}},
                    {"id": "5", "name": "Ready", "statusCategory": {"key": "indeterminate"}}, {"id": "6", "name": "Live", "statusCategory": {"key": "done"}}]}}
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


ANSWERS = {"team": "equipe", "owner": "p_coll2", "project_id": "1", "reuse": "new", "jira_config": "1", "github_repo": "acme/front_web",
           "ai_agent": "1", "agents": "auto", "mep_workflow": "", "avatar": "editor", "music": "", "confirm": "o"}


class InstallTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.cfg_path = os.path.join(self.tmp, "bureau.config.json")
        self.roster = open(os.path.join(ROOT, "teams", "equipe", "roster.json")).read()
        self.fakes = []

        def make(api):
            f = FakeKronn(api); self.fakes.append(f); return f
        self.patches = [mock.patch.object(install, "Kronn", side_effect=make),
                        mock.patch.object(install.subprocess, "run", side_effect=FileNotFoundError()),
                        mock.patch.object(install, "org_member", return_value=(True, "membre actif"))]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        open(os.path.join(ROOT, "teams", "equipe", "roster.json"), "w").write(self.roster)  # le test ne touche pas l'équipe
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
        self.assertEqual(sum(1 for p, _ in posts if p == "/workflows"), 9)  # dont commenter un ticket (Jira connecté)
        self.assertEqual(sum(1 for p, _ in posts if p == "/quick-prompts"), 2)  # interroger un agent, plan vers brouillon
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
        self.assertNotIn(json.load(open(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json")))["page_id"], html)  # pas l'id de la démo
        self.assertEqual(sum(1 for m, p, _ in k.calls if p == "/mcp/workflow-trigger"), 4)

    def test_comment_workflow_only_with_jira(self):
        """« Commenter un ticket » : un ApiCall Jira (POST commentaire), créé seulement si Jira est connecté."""
        self.assertEqual(self.run_install(ANSWERS), 0)
        cfg = json.load(open(self.cfg_path))
        wf = self.fakes[-1].store[cfg["actions"]["comment"]]
        step = wf["steps"][0]
        self.assertEqual((step["api_method"], step["api_endpoint_path"], step["api_config_id"]), ("POST", "/rest/api/2/issue/{key}/comment", JIRA))
        self.assertTrue(step["api_body"]["body"].startswith("{{comment}}"))  # jamais le placeholder seul : reste du texte
        os.remove(self.cfg_path)  # installation neuve, sans Jira : pas de workflow de commentaire
        self.assertEqual(self.run_install({**ANSWERS, "jira_config": "2"}), 0)  # « Pas de Jira »
        self.assertEqual(json.load(open(self.cfg_path))["actions"]["comment"], "")
        self.assertFalse([b for m, p, b in self.fakes[-1].calls if m == "POST" and p == "/workflows" and "commenter" in b["name"]])

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
        self.assertEqual(len(posts), 1 + 9 + 2)  # rien de recréé à la relance

    def test_relaunch_adds_missing_datasets(self):
        self.run_install(ANSWERS)
        first = self.fakes[-1]
        page_id = json.load(open(self.cfg_path))["page_id"]
        first.store[page_id]["datasets"] = [d for d in first.store[page_id]["datasets"] if d["name"] not in ("layout", "actions")]  # page d'avant
        with mock.patch.object(install, "Kronn", return_value=first):
            self.assertEqual(self.run_install(ANSWERS), 0)
        self.assertEqual([d["name"] for d in first.store[page_id]["datasets"]], install.DATASETS)

    def test_reuses_same_named_workflow_instead_of_creating(self):
        answers = {k: v for k, v in ANSWERS.items() if k != "reuse"}  # défaut : homonymes réutilisés
        self.assertEqual(self.run_install(answers), 0)
        k = self.fakes[-1]
        cfg = json.load(open(self.cfg_path))
        self.assertEqual(cfg["workflows"]["live"], FakeKronn.LIVE)
        self.assertEqual(sum(1 for m, p, _ in k.calls if m == "POST" and p == "/workflows"), 8)
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
        self.assertEqual(len(deleted), 8 + 2 + 1)  # 8 workflows, les 2 QP, la page
        self.assertNotIn(f"/workflows/{mine}", deleted)
        self.assertEqual(deleted[-1], f"/pages/{cfg['page_id']}")  # la page en dernier
        after = json.load(open(self.cfg_path))
        self.assertEqual((after["page_id"], after["workflows"], after["actions"]), (None, {"team": mine}, {}))
        self.assertEqual(after["owner"], "p_coll2")  # réponses gardées pour une réinstallation

    def test_uninstall_refuses_a_protected_installation(self):
        import uninstall
        install.jdump({"page_id": "11111111-0000-4000-8000-000000000000", "protect": True, "kronn": {"api": "http://x"}}, self.cfg_path)
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
        hand = {"gitfut": {"p_remi": "barberemi"}, "wiki_posters": ["Five_(2016_film)"], "chrome": False}  # posés à la main
        json.dump({**cfg, "ui": {"todo": "folded"}, "protect": True, **hand}, open(self.cfg_path, "w"))
        with mock.patch.object(install, "Kronn", return_value=self.fakes[-1]):
            self.assertEqual(self.run_install(ANSWERS), 0)
        after = json.load(open(self.cfg_path))
        self.assertEqual(after["ui"], {"todo": "folded"})
        self.assertTrue(after["protect"])
        self.assertEqual({k: after.get(k) for k in hand}, hand)

    def test_boss_screen_pages_asked_by_id(self):
        """Écran du boss : ids complets ou débuts d'id uniques, dans l'ordre donné ; la page du Bureau n'est pas proposée."""
        pages = {"cccc1111-0000-4000-8000-000000000000": {"title": "Revue de PR", "datasets": []},
                 "cccc2222-0000-4000-8000-000000000000": {"title": "CWV", "datasets": []},
                 "dddd3333-0000-4000-8000-000000000000": {"title": "SCSS", "datasets": []}}
        init = FakeKronn.__init__

        def with_pages(f, api):
            init(f, api)
            f.store.update(copy.deepcopy(pages))
        with mock.patch.object(FakeKronn, "__init__", with_pages):
            self.assertEqual(self.run_install({**ANSWERS, "boss_pages": "dddd, cccc2222-0000-4000-8000-000000000000"}), 0)
            self.assertEqual(json.load(open(self.cfg_path))["boss_pages"],
                             ["dddd3333-0000-4000-8000-000000000000", "cccc2222-0000-4000-8000-000000000000"])
        with mock.patch.object(install, "Kronn", return_value=self.fakes[-1]):  # relance sur le même Kronn
            with self.assertRaises(install.InstallError):  # « cccc » : deux pages
                self.run_install({**ANSWERS, "boss_pages": "cccc"})
            self.assertEqual(self.run_install({**ANSWERS, "boss_pages": "-"}), 0)
            self.assertEqual(json.load(open(self.cfg_path))["boss_pages"], [])

    def test_new_team_by_default_with_the_type_plan(self):
        answers = {k: v for k, v in ANSWERS.items() if k not in ("team", "owner")}
        answers.update(owner="__new__", new_name="Pam", new_person="Pam Beesly", new_role="dev", github_repo="")
        self.assertEqual(self.run_install(answers), 0)
        cfg = json.load(open(self.cfg_path))
        self.assertIsNone(cfg["team"])
        self.assertEqual(cfg["layout"], "layouts/open-space.json")
        self.assertEqual([p["key"] for p in cfg["people"]], ["p_pam"])
        self.assertEqual(cfg["jira"]["project"], "")  # défauts neutres : rien d'equipe
        html = next(b for m, p, b in self.fakes[-1].calls if m == "PUT" and p.endswith("/html"))["html"]
        self.assertIn('"p_pam"', html)
        self.assertNotIn("Jan Levinson", html)  # pas le roster equipe (les recettes d'avatar restent dans sprites/cast.json)
        self.assertNotIn("LE BUREAU", html)

    def test_newcomer_stays_in_the_local_config(self):
        answers = dict(ANSWERS, owner="__new__", new_name="Jan", new_person="Jan Levinson", new_role="po")
        self.assertEqual(self.run_install(answers), 0)
        cfg = json.load(open(self.cfg_path))
        self.assertEqual(cfg["people"], [{"key": "p_jan", "name": "Jan", "role": "Product owner", "person": "Jan Levinson", "roleKind": "po"}])
        self.assertEqual(open(os.path.join(ROOT, "teams", "equipe", "roster.json")).read(), self.roster)  # roster partagé intact
        html = next(b for m, p, b in self.fakes[-1].calls if m == "PUT" and p.endswith("/html"))["html"]
        self.assertIn('"p_jan"', html)
        self.assertIn('"p_coll1"', html)

    def test_team_reserved_to_its_github_organisation(self):
        with mock.patch.object(install, "org_member", return_value=(False, "ton compte GitHub n'est pas membre de acme")):
            with self.assertRaises(install.InstallError) as e:
                self.run_install(ANSWERS)
        self.assertIn("réservée aux membres de acme", str(e.exception))
        self.assertFalse([c for c in self.fakes[-1].calls if c[0] in ("POST", "PUT")])

    def test_github_login_suggests_who_you_are(self):
        roster = [{"key": "p_a", "name": "A", "role": "Dev"}, {"key": "p_b", "name": "B", "role": "Dev", "github": "BeeGH"}]
        asker = install.Asker({})
        with mock.patch("sys.stdout", new=open(os.devnull, "w")):
            self.assertEqual(install.who(asker, roster, "beegh"), ("p_b", None))

    def test_dry_run_creates_nothing(self):
        self.assertEqual(self.run_install(ANSWERS, "--dry-run"), 0)
        k = self.fakes[-1]
        self.assertFalse([1 for m, p, _ in k.calls if m in ("POST", "PUT") and p != "/workflow-steps/test-api-call"])
        self.assertFalse(os.path.exists(self.cfg_path))


    def test_jira_statuses_proposed_from_the_board_columns(self):
        """Colonnes du board lues à travers Kronn : chaque statut classé par le nom de sa colonne, sinon sa catégorie Jira."""
        self.assertEqual(self.run_install(ANSWERS), 0)
        j = json.load(open(self.cfg_path))["jira"]
        self.assertEqual({k: j["statuses"][k] for k in ("Open", "Building", "Peer review", "In QA", "Reopened", "Ready", "Live")},
                         {"Open": "todo", "Building": "doing", "Peer review": "review", "In QA": "test", "Reopened": "test",
                          "Ready": "deploy", "Live": "done"})  # « Backlog » et « Doing » : par leur nom ; colonne inconnue : catégorie
        self.assertEqual((j["flow"]["test"], j["flow"]["reopened"], j["done_status"]), ("In QA", "Reopened", "Live"))
        with mock.patch.object(install, "Kronn", return_value=self.fakes[-1]):  # refusé : le classement du profil reste
            self.assertEqual(self.run_install({**ANSWERS, "jira_statuses": "n"}), 0)
        self.assertNotIn("Live", json.load(open(self.cfg_path))["jira"]["statuses"])

    def test_deploy_workflows_and_other_repos_asked(self):
        self.assertEqual(self.run_install({**ANSWERS, "github_prod": "deploy-prod.yml", "github_staging": "",
                                           "github_deploys": "acme/front_api, acme/new-repo"}), 0)
        g = json.load(open(self.cfg_path))["github"]
        self.assertEqual(g["prod_workflow"], "deploy-prod.yml")
        by = {d["repo"]: d for d in g["deploys"]}
        self.assertEqual(list(by), ["acme/front_api", "acme/new-repo"])
        self.assertEqual(by["acme/front_api"]["prod_workflow"], "CD_Deploy-PROD.yaml")  # celui du profil, gardé
        self.assertEqual(by["acme/new-repo"], {"repo": "acme/new-repo", "prod_workflow": "deploy-prod.yml"})
        with self.assertRaises(install.InstallError):
            self.run_install({**ANSWERS, "github_deploys": "pas-un-depot"})


class GuestsTest(unittest.TestCase):
    """Invités de passage : les communs (hérauts), ceux du profil d'équipe, puis ceux de l'installation, embarqués avec le roster."""

    def test_common_then_profile_then_installation(self):
        import assemble
        cfg = {"team": "equipe", "guests": [{"key": "g_x", "name": "X"}]}
        profile = [g["key"] for g in json.load(open(os.path.join(ROOT, "teams", "equipe", "roster.json")))["guests"]]
        self.assertEqual([g["key"] for g in assemble.guests(cfg)], ["g_gandalf", "g_yoda"] + profile + ["g_x"])
        self.assertIn("g_veilleur", profile)
        self.assertEqual([g["key"] for g in assemble.guests({})], ["g_gandalf", "g_yoda"])  # toute installation, même sans équipe
        self.assertEqual(assemble.guests({"common_guests": False}), [])
        renamed = assemble.guests({"guests": [{"key": "g_yoda", "name": "Le sage", "sprite": "yoda", "on": "prod"}]})
        self.assertEqual([(g["key"], g["name"]) for g in renamed], [("g_gandalf", "Gandalf"), ("g_yoda", "Le sage")])  # même clé : remplacé
        self.assertTrue({"yoda", "mage"} <= set(assemble.sprites({})))  # planches communes (sprites/common.json)
        self.assertIn("hank", assemble.sprites(cfg))  # sa planche, tirée de teams/equipe/sprites/hank/
        html = assemble.build(demo=False, cfg=dict(json.load(open(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json"))), team="equipe"))
        self.assertIn('"guests": [{"key": "g_gandalf"', html)



class LaunchTest(unittest.TestCase):
    """Clé launch : les workflows lancés depuis la fiche d'un ticket, avec les noms de variables de chaque installation."""

    def block(self, cfg, aid):
        import assemble
        html = assemble.build(demo=False, cfg=cfg)
        m = re.search(r'<script type="application/kronn-action" data-action-id="' + aid + r'">(.*?)</script>', html, re.S)
        return json.loads(m.group(1)) if m else None

    def test_id_alone_keeps_the_default_variable_names(self):
        cfg = dict(json.load(open(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json"))))
        cfg["launch"] = {"mep": "wf-mep"}
        spec = self.block(cfg, "bureau-mep")
        self.assertEqual(spec["target_id"], "wf-mep")
        self.assertEqual([v["name"] for v in spec["values"]], ["jira_ticket_key", "pr_number"])
        self.assertIsNone(self.block(cfg, "bureau-impl"))  # pas configuré : pas de bouton

    def test_variables_renamed_or_dropped_for_your_workflows(self):
        cfg = dict(json.load(open(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json"))))
        cfg["launch"] = {"mep": {"wf": "wf-mep", "vars": {"ticket": "issue_key", "pr": None}},
                         "review": {"wf": "wf-rev", "vars": {"repo": "project", "pr": "mr"}}}
        mep = self.block(cfg, "bureau-mep")
        self.assertEqual([(v["name"], v["source_ref"]) for v in mep["values"]],
                         [("issue_key", "<page.dataset.actions.tickets.find(key).key>")])  # pr retiré, liaison gardée
        rev = self.block(cfg, "bureau-review")
        self.assertEqual([v["name"] for v in rev["values"]], ["project", "mr"])
        import assemble  # la page reçoit les noms renommés comme clés de data-kronn-bindings
        binds = assemble.action_binds(assemble.build(demo=False, cfg=cfg))
        self.assertEqual((binds["bureau-mep"], binds["bureau-review"]), ({"issue_key": "key"}, {"project": "n", "mr": "n"}))

    def test_unknown_role_is_refused(self):
        import assemble
        with self.assertRaises(ValueError) as e:
            assemble.launch({"launch": {"impl": {"wf": "x", "vars": {"pr": "pr"}}}})
        self.assertIn("rôles : ticket", str(e.exception))


if __name__ == "__main__":
    unittest.main()
