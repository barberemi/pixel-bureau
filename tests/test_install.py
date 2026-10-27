"""Installateur (python3 -m unittest tests/test_install.py) : déroulé complet contre un faux Kronn, sans réseau."""
import copy, io, json, os, re, shutil, sys, tempfile, unittest
from pathlib import Path
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


# l'équipe installée : le pack fictif (tests/fixtures/pack-exemple) posé en profil « vance » d'un teams/ temporaire
ANSWERS = {"team": "vance", "owner": "p_lynn", "project_id": "1", "reuse": "new", "jira_config": "1", "github_repo": "vance/frigo",
           "ai_agent": "1", "agents": "auto", "mep_workflow": "", "avatar": "editor", "music": "", "confirm": "o"}


class InstallTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.cfg_path = os.path.join(self.tmp, "bureau.config.json")
        self.teams = os.path.join(self.tmp, "teams")
        shutil.copytree(os.path.join(ROOT, "tests", "fixtures", "pack-exemple"), os.path.join(self.teams, "vance"))
        self.roster = Path(os.path.join(self.teams, "vance", "roster.json")).read_text()
        self.fakes = []

        def make(api):
            f = FakeKronn(api); self.fakes.append(f); return f
        self.patches = [mock.patch.object(install, "Kronn", side_effect=make),
                        mock.patch.object(install.subprocess, "run", side_effect=FileNotFoundError()),
                        mock.patch.object(install, "org_member", return_value=(True, "membre actif")),
                        mock.patch.object(install.assemble, "TEAMS", self.teams)]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        shutil.rmtree(self.tmp)

    def write_answers(self, answers):
        ap = os.path.join(self.tmp, "answers.json")
        Path(ap).write_text(json.dumps(answers))
        return ap

    def run_install(self, answers, *extra):
        ap = self.write_answers(answers)
        with mock.patch("sys.stdout", new=io.StringIO()):
            return install.main(["--config", self.cfg_path, "--answers", ap, *extra])

    def test_full_install_creates_everything_and_writes_config(self):
        self.assertEqual(self.run_install(ANSWERS), 0)
        k = self.fakes[-1]
        posts = [(p, b) for m, p, b in k.calls if m == "POST"]
        page = next(b for p, b in posts if p == "/pages")
        self.assertEqual([d["name"] for d in page["datasets"]], install.DATASETS)
        self.assertEqual(sum(1 for p, _ in posts if p == "/workflows"), 23)  # Mes todos compris ; déplacer un ticket (Jira connecté) ; dont les 5 modèles d'agents proposés par défaut avec Jira (réestimer, issue GitHub, créer un ticket, m'affecter, me désaffecter ; pas la revue de PR sans connexion GitHub), puis remettre une PR à jour et corriger ses commentaires, les agents et les pages de l'écran mural ajoutés depuis la page, commenter un ticket (Jira connecté), parler au canard, le canard d'équipe et répondre aux questions
        self.assertEqual(sum(1 for p, _ in posts if p == "/quick-prompts"), 2)  # interroger un agent, plan vers brouillon
        cfg = json.loads(Path(self.cfg_path).read_text())
        self.assertEqual(cfg["owner"], "p_lynn")
        self.assertEqual(cfg["jira"]["config_id"], JIRA)
        self.assertEqual(cfg["jira"]["site"], "https://acme.atlassian.net")  # déduit de la réponse Jira
        self.assertEqual(set(cfg["workflows"]), {"office", "live", "team", "payroll", "canard"})
        self.assertTrue(all(cfg["actions"].values()))
        self.assertEqual([a["name"] for a in cfg["agents"]], ["Dwight"])  # ses workflows, pas ceux du Bureau
        self.assertNotIn("seat", cfg["agents"][0])  # sa place : celle que le plan lui donne
        self.assertEqual(os.path.realpath(cfg["layout"]), os.path.realpath(os.path.join(self.teams, "vance", "layouts", "plan.json")))  # plan du profil
        # deuxième passe : les scripts reçoivent la config complète (ids de tous les crons)
        office_put = [b for m, p, b in k.calls if m == "PUT" and p == f"/workflows/{cfg['workflows']['office']}"][-1]
        script = office_put["steps"][0]["collect_api_data"]["sources"][0]["quick_exec"]["args"][1]
        self.assertIn(cfg["workflows"]["live"], script)
        html = next(b for m, p, b in k.calls if m == "PUT" and p.endswith("/html"))["html"]
        self.assertIn('"p_lynn"', html)
        self.assertIn(cfg["actions"]["gate"], html)
        self.assertNotIn(json.loads(Path(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json")).read_text())["page_id"], html)  # pas l'id de la démo
        self.assertEqual(sum(1 for m, p, _ in k.calls if p == "/mcp/workflow-trigger"), 5)

    def test_comment_workflow_only_with_jira(self):
        """« Commenter un ticket » : un ApiCall Jira (POST commentaire), créé seulement si Jira est connecté."""
        self.assertEqual(self.run_install(ANSWERS), 0)
        cfg = json.loads(Path(self.cfg_path).read_text())
        wf = self.fakes[-1].store[cfg["actions"]["comment"]]
        step = wf["steps"][0]
        self.assertEqual((step["api_method"], step["api_endpoint_path"], step["api_config_id"]), ("POST", "/rest/api/2/issue/{key}/comment", JIRA))
        self.assertTrue(step["api_body"]["body"].startswith("{{comment}}"))  # jamais le placeholder seul : reste du texte
        os.remove(self.cfg_path)  # installation neuve, sans Jira : pas de workflow de commentaire
        self.assertEqual(self.run_install({**ANSWERS, "jira_config": "2"}), 0)  # « Pas de Jira »
        self.assertEqual(json.loads(Path(self.cfg_path).read_text())["actions"]["comment"], "")
        self.assertFalse([b for m, p, b in self.fakes[-1].calls if m == "POST" and p == "/workflows" and "commenter" in b["name"]])

    def test_without_jira_team_cron_has_no_jira_steps(self):
        self.assertEqual(self.run_install({**ANSWERS, "jira_config": "2"}), 0)
        k = self.fakes[-1]
        team = [b for m, p, b in k.calls if m == "POST" and p == "/workflows" and b["name"].startswith("Le Bureau · équipe")][0]
        self.assertNotIn("jira_team", [s["name"] for s in team["steps"]])
        self.assertEqual(json.loads(Path(self.cfg_path).read_text())["jira"], {})

    def test_relaunch_updates_instead_of_creating(self):
        self.run_install(ANSWERS)
        first = self.fakes[-1]
        with mock.patch.object(install, "Kronn", return_value=first):
            self.assertEqual(self.run_install(ANSWERS), 0)
        posts = [p for m, p, _ in first.calls if m == "POST" and p in ("/pages", "/workflows", "/quick-prompts")]
        self.assertEqual(len(posts), 1 + 23 + 2)  # rien de recréé à la relance

    def test_relaunch_adds_missing_datasets(self):
        self.run_install(ANSWERS)
        first = self.fakes[-1]
        page_id = json.loads(Path(self.cfg_path).read_text())["page_id"]
        first.store[page_id]["datasets"] = [d for d in first.store[page_id]["datasets"] if d["name"] not in ("layout", "actions", "duck", "absences", "mails", "mail_rules", "support", "todos")]  # page d'avant
        with mock.patch.object(install, "Kronn", return_value=first):
            self.assertEqual(self.run_install(ANSWERS), 0)
        self.assertEqual([d["name"] for d in first.store[page_id]["datasets"]], install.DATASETS)

    def test_agent_models_proposed_with_the_github_connection(self):
        """#78 : avec une connexion GitHub dans Kronn, la revue de PR est proposée (le cron, accepté, est créé désactivé) ;
        un bouton qui a déjà ton workflow (launch.estimate) ne se voit pas proposer le modèle."""
        gh = "12121212-3434-5656-7878-909090909090"
        orig = FakeKronn.call

        def call(self_, method, path, body=None, timeout=60):
            if path == "/mcps":
                return {"configs": [{"id": JIRA, "server_id": "mcp-atlassian", "label": "Jira", "is_global": True},
                                    {"id": gh, "server_id": "mcp-github", "label": "GitHub", "is_global": True}]}
            return orig(self_, method, path, body, timeout)
        Path(self.cfg_path).write_text(json.dumps({"launch": {"estimate": "e5e5e5e5-0000-4000-8000-000000000000"}}))
        with mock.patch.object(FakeKronn, "call", call):
            self.assertEqual(self.run_install({**ANSWERS, "model_review_cron": "o"}), 0)
        k = self.fakes[-1]
        cfg = json.loads(Path(self.cfg_path).read_text())
        self.assertEqual(cfg["github"]["config_id"], gh)
        self.assertEqual(set(cfg["models"]), {"review_child", "review_one", "review_cron", "issue", "ticket", "assign", "unassign"})
        made = {b["name"]: b for m, p_, b in k.calls if m == "POST" and p_ == "/workflows"}
        self.assertIs(made["Le Bureau · revue des PR (cron)"]["enabled"], False)
        cron = made["Le Bureau · revue des PR (cron)"]
        self.assertTrue(all(s.get("sub_workflow_id") != "" for s in cron["steps"]))
        self.assertNotIn("Le Bureau · réestimer un ticket", made)

    def test_reuses_same_named_workflow_instead_of_creating(self):
        answers = {k: v for k, v in ANSWERS.items() if k != "reuse"}  # défaut : homonymes réutilisés
        self.assertEqual(self.run_install(answers), 0)
        k = self.fakes[-1]
        cfg = json.loads(Path(self.cfg_path).read_text())
        self.assertEqual(cfg["workflows"]["live"], FakeKronn.LIVE)
        self.assertEqual(sum(1 for m, p, _ in k.calls if m == "POST" and p == "/workflows"), 22)
        self.assertTrue([1 for m, p, _ in k.calls if m == "PUT" and p == f"/workflows/{FakeKronn.LIVE}"])  # mis à jour
        self.assertEqual([a["name"] for a in cfg["agents"]], ["Dwight"])

    def test_never_takes_over_another_installation(self):
        k = FakeKronn("http://x")
        k.store["cccccccc-0000-4000-8000-000000000000"] = {"title": "Le Bureau de Michael", "datasets": []}
        k.store[FakeKronn.LIVE]["steps"][0]["page_id"] = "cccccccc-0000-4000-8000-000000000000"
        answers = {kk: v for kk, v in ANSWERS.items() if kk != "reuse"}
        with mock.patch.object(install, "Kronn", return_value=k):
            self.assertEqual(self.run_install(answers), 0)
        self.assertNotEqual(json.loads(Path(self.cfg_path).read_text())["workflows"]["live"], FakeKronn.LIVE)
        self.assertFalse([1 for m, p, _ in k.calls if m == "PUT" and p == f"/workflows/{FakeKronn.LIVE}"])

    def test_own_workflow_by_id_is_kept_as_is(self):
        mine = "aaaaaaaa-1111-2222-3333-444444444444"
        answers = {**ANSWERS, "reuse": "ask", **{f"reuse_{k}": "new" for k in ("office", "live", "payroll", "avatar", "gate", "relaunch", "ask")},
                   "reuse_team": "id", "reuse_team_id": mine, "reuse_team_mode": "own"}
        self.assertEqual(self.run_install(answers), 0)
        k = self.fakes[-1]
        cfg = json.loads(Path(self.cfg_path).read_text())
        self.assertEqual(cfg["workflows"]["team"], mine)
        self.assertEqual(cfg["own"], [mine])
        self.assertFalse([1 for m, p, _ in k.calls if m in ("PUT", "DELETE") and p == f"/workflows/{mine}"])  # jamais touché
        self.assertEqual(cfg["agents"], [])  # branché comme cron équipe : plus un agent
        # désinstallation : tout le Bureau part, sauf le workflow branché tel quel
        import uninstall
        with mock.patch.object(uninstall, "Kronn", return_value=k), mock.patch("sys.stdout", new=io.StringIO()):
            self.assertEqual(uninstall.main(["--config", self.cfg_path, "--dry-run"]), 0)
            self.assertFalse([1 for m, _, _ in k.calls if m == "DELETE"])
            self.assertEqual(uninstall.main(["--config", self.cfg_path, "--yes"]), 0)
        deleted = [p for m, p, _ in k.calls if m == "DELETE"]
        self.assertEqual(len(deleted), 22 + 2 + 1)  # 22 workflows, les 2 QP, la page
        self.assertNotIn(f"/workflows/{mine}", deleted)
        self.assertEqual(deleted[-1], f"/pages/{cfg['page_id']}")  # la page en dernier
        after = json.loads(Path(self.cfg_path).read_text())
        self.assertEqual((after["page_id"], after["workflows"], after["actions"]), (None, {"team": mine}, {}))
        self.assertEqual(after["owner"], "p_lynn")  # réponses gardées pour une réinstallation

    def test_uninstall_refuses_a_protected_installation(self):
        import uninstall
        install.jdump({"page_id": "11111111-0000-4000-8000-000000000000", "protect": True, "kronn": {"api": "http://x"}}, self.cfg_path)
        with self.assertRaises(install.InstallError):
            uninstall.main(["--config", self.cfg_path, "--yes"])

    def test_own_layout_file(self):
        """Un plan à soi : chemin absolu hors du dépôt, relatif au dépôt dedans (la config reste valable si on le déplace).
        Les deux cas sont posés explicitement : TMPDIR peut être dans le dépôt (agents lancés par Kronn, KT-42)."""
        L = json.loads(Path(os.path.join(ROOT, "layouts", "exemple-startup.json")).read_text())
        inside = tempfile.mkdtemp(dir=ROOT, prefix=".test-plan-")
        self.addCleanup(shutil.rmtree, inside, True)
        outside = self.tmp if not os.path.abspath(self.tmp).startswith(ROOT + os.sep) else tempfile.mkdtemp(dir=os.path.dirname(ROOT))
        if outside != self.tmp:
            self.addCleanup(shutil.rmtree, outside, True)
        for where, expect in ((outside, lambda f: f), (inside, lambda f: os.path.relpath(f, ROOT))):
            mine = os.path.join(where, "mon-plan.json")
            Path(mine).write_text(json.dumps(L))
            if os.path.exists(self.cfg_path):
                os.remove(self.cfg_path)  # une installation neuve par cas
            self.assertEqual(self.run_install({**ANSWERS, "layout": "__file__", "layout_file": mine}), 0)
            self.assertEqual(json.loads(Path(self.cfg_path).read_text())["layout"], expect(mine))
            html = next(b for m, p, b in self.fakes[-1].calls if m == "PUT" and p.endswith("/html"))["html"]
            self.assertIn('"exemple-startup"', html)  # la page embarque ce plan

    def test_invalid_layout_is_refused_before_anything_is_created(self):
        L = json.loads(Path(os.path.join(ROOT, "layouts", "exemple-startup.json")).read_text())
        L["exit"] = [5, 5]
        bad = os.path.join(self.tmp, "casse.json")
        Path(bad).write_text(json.dumps(L))
        with self.assertRaises(install.InstallError) as e:
            self.run_install({**ANSWERS, "layout": "__file__", "layout_file": bad})
        self.assertIn("plan invalide", str(e.exception))
        self.assertFalse([c for c in self.fakes[-1].calls if c[0] in ("POST", "PUT")])

    def test_settings_survive_a_relaunch(self):
        self.run_install(ANSWERS)
        cfg = json.loads(Path(self.cfg_path).read_text())
        hand = {"gitfut": {"p_bob": "bobvance"}, "wiki_posters": ["Five_(2016_film)"], "chrome": False}  # posés à la main
        Path(self.cfg_path).write_text(json.dumps({**cfg, "ui": {"agent_label": "office"}, "protect": True, **hand}))
        with mock.patch.object(install, "Kronn", return_value=self.fakes[-1]):
            self.assertEqual(self.run_install(ANSWERS), 0)
        after = json.loads(Path(self.cfg_path).read_text())
        self.assertEqual(after["ui"], {"skin": "menthe", "agent_label": "office"})  # thème du profil ajouté, réglage gardé
        self.assertTrue(after["protect"])
        # un thème choisi à la main l'emporte sur celui du profil
        Path(self.cfg_path).write_text(json.dumps({**after, "ui": {"skin": "classique"}}))
        with mock.patch.object(install, "Kronn", return_value=self.fakes[-1]):
            self.assertEqual(self.run_install(ANSWERS), 0)
        self.assertEqual(json.loads(Path(self.cfg_path).read_text())["ui"], {"skin": "classique"})
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
            self.assertEqual(json.loads(Path(self.cfg_path).read_text())["boss_pages"],
                             ["dddd3333-0000-4000-8000-000000000000", "cccc2222-0000-4000-8000-000000000000"])
        with mock.patch.object(install, "Kronn", return_value=self.fakes[-1]):  # relance sur le même Kronn
            with self.assertRaises(install.InstallError):  # « cccc » : deux pages
                self.run_install({**ANSWERS, "boss_pages": "cccc"})
            self.assertEqual(self.run_install({**ANSWERS, "boss_pages": "-"}), 0)
            self.assertEqual(json.loads(Path(self.cfg_path).read_text())["boss_pages"], [])

    def test_mail_accounts_from_mac_mail_and_imap(self):
        """Courrier (#30) : comptes de l'appli Mail et IMAP ; mot de passe au trousseau, jamais dans la config ; cron courrier
        créé ; à la relance, règles gardées ; refuser le courrier retire la clé mail."""
        keys = []
        with mock.patch.object(install, "mac_mail_accounts", return_value=["Exchange", "iCloud"]), \
                mock.patch.object(install, "keychain_set", side_effect=lambda *a: keys.append(a)), \
                mock.patch.object(install, "imap_check", return_value=None):
            answers = {**ANSWERS, "mail": "o", "mail_mac_exchange": "o", "mail_mac_exchange_label": "Pro", "mail_mac_icloud": "n",
                       "mail_imap_0": "o", "mail_imap_0_user": "lynn@gmail.com", "mail_imap_0_label": "Perso",
                       "mail_imap_0_password": "abcd efgh ijkl mnop", "mail_imap_0_primary": "o", "mail_imap_1": "n"}
            self.assertEqual(self.run_install(answers), 0)
            cfg = json.loads(Path(self.cfg_path).read_text())
            pro, perso = cfg["mail"]["accounts"]
            self.assertEqual((pro["id"], pro["provider"], pro["account"]), ("pro", "mac-mail", "Exchange"))
            self.assertEqual((perso["provider"], perso["host"], perso["secret"], perso["only"]),
                             ("imap", "imap.gmail.com", "keychain:pixel-bureau-perso", "category:primary"))
            self.assertNotEqual(pro["color"], perso["color"])
            self.assertEqual(keys, [("pixel-bureau-perso", "lynn@gmail.com", "abcd efgh ijkl mnop")])
            self.assertNotIn("abcd efgh ijkl mnop", Path(self.cfg_path).read_text())  # le mot de passe n'est jamais écrit (_answers compris)
            self.assertIn("courrier", cfg["workflows"])
            # relance : règles posées depuis gardées, compte IMAP gardé sans redemander son mot de passe
            cfg["mail"]["ignore"] = ["atlassian.net"]
            Path(self.cfg_path).write_text(json.dumps(cfg))
            with mock.patch.object(install, "Kronn", return_value=self.fakes[-1]):
                self.assertEqual(self.run_install({**answers, "mail_keep_perso": "o", "mail_imap_0": "n"}), 0)
                cfg = json.loads(Path(self.cfg_path).read_text())
                self.assertEqual(cfg["mail"]["ignore"], ["atlassian.net"])
                self.assertEqual([a["id"] for a in cfg["mail"]["accounts"]], ["pro", "perso"])
                self.assertEqual(len(keys), 1)
                # porteurs du pack (defaults.json, mail.messengers) : repris s'il n'y en a pas encore
                with mock.patch.object(install.assemble, "defaults", side_effect=lambda c, f=install.assemble.defaults: {**f(c), "mail": {"messengers": [{"id": "gazette", "carrier": "g_x"}]}}):
                    self.assertEqual(self.run_install({**answers, "mail_keep_perso": "o", "mail_imap_0": "n"}), 0)
                self.assertEqual(json.loads(Path(self.cfg_path).read_text())["mail"]["messengers"], [{"id": "gazette", "carrier": "g_x"}])
                self.assertEqual(self.run_install({**ANSWERS, "mail": "n"}), 0)
                self.assertNotIn("mail", json.loads(Path(self.cfg_path).read_text()))

    def test_env_branch_model_offered_when_the_team_sets_it(self):
        """Modèle env : oui par défaut quand le pack règle env (settings.json), non sinon ; jamais proposé à qui a launch.env."""
        base = json.loads(Path(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json")).read_text())
        ask = lambda: install.Asker(answers={})  # noqa: E731 : chaque question prend sa valeur par défaut
        with mock.patch.object(install.templates, "skipped", return_value=False):
            with mock.patch.object(install.assemble, "merged", side_effect=lambda c: {**c, "env": {"label": "env-branch"}}):
                self.assertIn("env", install.models(ask(), base, {}))
                self.assertNotIn("env", install.models(ask(), {**base, "launch": {"env": "wf-env"}}, {}))
            with mock.patch.object(install.assemble, "merged", side_effect=lambda c: {k: v for k, v in c.items() if k != "env"}):
                self.assertNotIn("env", install.models(ask(), base, {}))

    def test_deploy_model_offered_when_the_team_sets_it(self):
        """Modèle deploy : oui par défaut quand le pack règle deploy (settings.json), non sinon."""
        base = json.loads(Path(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json")).read_text())
        ask = lambda: install.Asker(answers={})  # noqa: E731 : chaque question prend sa valeur par défaut
        with mock.patch.object(install.templates, "skipped", return_value=False):
            with mock.patch.object(install.assemble, "merged", side_effect=lambda c: {**c, "deploy": {"repos": {"a/b": {"envs": {"dev": {}}}}}}):
                self.assertIn("deploy", install.models(ask(), base, {}))
            with mock.patch.object(install.assemble, "merged", side_effect=lambda c: {k: v for k, v in c.items() if k != "deploy"}):
                self.assertNotIn("deploy", install.models(ask(), base, {}))

    def test_mac_notification_asked_only_with_osascript(self):
        """notify_mac : demandé sur Mac (osascript), oui par défaut, le non est retenu ; ailleurs, aucune question ni clé."""
        with mock.patch.object(install.shutil, "which", side_effect=lambda c: "/usr/bin/osascript" if c == "osascript" else shutil.which(c)):
            self.assertEqual(self.run_install(ANSWERS), 0)
            self.assertIs(json.loads(Path(self.cfg_path).read_text())["notify_mac"], True)
            with mock.patch.object(install, "Kronn", return_value=self.fakes[-1]):  # relance sur la même installation
                self.assertEqual(self.run_install({**ANSWERS, "notify_mac": "n"}), 0)
            self.assertIs(json.loads(Path(self.cfg_path).read_text())["notify_mac"], False)
        with mock.patch.object(install.shutil, "which", side_effect=lambda c: None if c == "osascript" else shutil.which(c)):
            os.remove(self.cfg_path)
            self.assertEqual(self.run_install(ANSWERS), 0)
            self.assertNotIn("notify_mac", json.loads(Path(self.cfg_path).read_text()))

    def test_new_team_by_default_with_the_type_plan(self):
        answers = {k: v for k, v in ANSWERS.items() if k not in ("team", "owner")}
        answers.update(owner="__new__", new_name="Pam", new_person="Pam Beesly", new_role="dev", github_repo="")
        self.assertEqual(self.run_install(answers), 0)
        cfg = json.loads(Path(self.cfg_path).read_text())
        self.assertIsNone(cfg["team"])
        self.assertEqual(cfg["layout"], "layouts/open-space.json")
        self.assertEqual([p["key"] for p in cfg["people"]], ["p_pam"])
        self.assertEqual(cfg["jira"]["project"], "")  # défauts neutres : rien du profil
        html = next(b for m, p, b in self.fakes[-1].calls if m == "PUT" and p.endswith("/html"))["html"]
        self.assertIn('"p_pam"', html)
        self.assertNotIn("Bob Vance", html)  # pas le roster du profil
        self.assertNotIn('"vance-plan"', html)

    def test_from_scratch_without_any_team_pack_the_page_is_valid_and_starts(self):
        """Installation de zéro, sans profil d'équipe (KT-57) : la page que l'installateur publie passe les contrôles
        du smoke (taille, scripts, blocs d'action, marqueurs) et démarre avec la config écrite, sans démo ni données."""
        import smoke, subprocess
        answers = {k: v for k, v in ANSWERS.items() if k not in ("team", "owner")}
        answers.update(owner="__new__", new_name="Pam", new_person="Pam Beesly", new_role="dev", github_repo="")
        self.assertEqual(self.run_install(answers), 0)
        cfg = json.loads(Path(self.cfg_path).read_text())
        html = next(b for m, p, b in self.fakes[-1].calls if m == "PUT" and p.endswith("/html"))["html"]
        self.patches[1].stop()  # le vrai subprocess pour node (setUp le remplace pour l'installateur)
        try:
            smoke.fails.clear()
            with mock.patch("sys.stdout", new=io.StringIO()):
                smoke.static_checks(html, cfg)
            self.assertEqual(smoke.fails, [])
            js = ("const {load}=require(process.argv[1]);const cfg=JSON.parse(require('fs').readFileSync(process.argv[2],'utf8'));"
                  "const p=load({config:cfg,demo:false,owner:cfg.owner});"
                  "process.stdout.write(p.run('JSON.stringify({data:!!DATA,boss:(chars.find(c=>c.boss)||{}).key||null,keys:chars.filter(c=>c.person).map(c=>c.key)})'))")
            r = subprocess.run(["node", "-e", js, os.path.join(ROOT, "tests", "helpers", "page.js"), self.cfg_path],
                               capture_output=True, text=True, timeout=60)
            self.assertEqual(r.returncode, 0, r.stderr[-800:])
            page = json.loads(r.stdout)
            self.assertTrue(page["data"])  # bureau vide (pas encore de données) mais la page tourne
            self.assertEqual(page["boss"], "p_pam")
            self.assertEqual(page["keys"], ["p_pam"])
        finally:
            self.patches[1].start()  # remis avant tearDown, qui l'arrête

    def test_team_pack_outside_the_repo(self):
        """Pack d'équipe (KT-60) : l'installateur prend le chemin d'un dossier hors du dépôt, y lit l'équipe et son plan,
        écrit ce chemin dans la clé team, et la page publiée a l'équipe, le plan et le thème du pack."""
        pack = os.path.join(self.tmp, "bureau-vance")
        shutil.copytree(os.path.join(ROOT, "tests", "fixtures", "pack-exemple"), pack)
        answers = dict(ANSWERS, team="__pack__", team_pack=pack, owner="p_bob", github_repo="")
        self.assertEqual(self.run_install(answers), 0)
        cfg = json.loads(Path(self.cfg_path).read_text())
        self.assertEqual(cfg["team"], pack)
        self.assertEqual(cfg["layout"], os.path.join(pack, "layouts", "plan.json"))  # le plan du pack, proposé par défaut
        html = next(b for m, p, b in self.fakes[-1].calls if m == "PUT" and p.endswith("/html"))["html"]
        self.assertIn('"p_lynn"', html)
        self.assertIn('data-skin="menthe"', html)

    def test_missing_team_pack_is_refused(self):
        answers = dict(ANSWERS, team="__pack__", team_pack=os.path.join(self.tmp, "absent"))
        with self.assertRaisesRegex(install.InstallError, "pack d'équipe introuvable"):
            self.run_install(answers)
        self.assertFalse(os.path.exists(self.cfg_path))  # rien d'écrit

    def test_newcomer_stays_in_the_local_config(self):
        answers = dict(ANSWERS, owner="__new__", new_name="Jan", new_person="Jan Levinson", new_role="po")
        self.assertEqual(self.run_install(answers), 0)
        cfg = json.loads(Path(self.cfg_path).read_text())
        self.assertEqual(cfg["people"], [{"key": "p_jan", "name": "Jan", "role": "Product owner", "person": "Jan Levinson", "roleKind": "po"}])
        self.assertEqual(Path(os.path.join(self.teams, "vance", "roster.json")).read_text(), self.roster)  # roster partagé intact
        html = next(b for m, p, b in self.fakes[-1].calls if m == "PUT" and p.endswith("/html"))["html"]
        self.assertIn('"p_jan"', html)
        self.assertIn('"p_bob"', html)

    def test_team_reserved_to_its_github_organisation(self):
        with mock.patch.object(install, "org_member", return_value=(False, "ton compte GitHub n'est pas membre de vance-refrigeration")):
            with self.assertRaises(install.InstallError) as e:
                self.run_install(ANSWERS)
        self.assertIn("réservée aux membres de vance-refrigeration", str(e.exception))
        self.assertFalse([c for c in self.fakes[-1].calls if c[0] in ("POST", "PUT")])

    def test_github_login_suggests_who_you_are(self):
        roster = [{"key": "p_a", "name": "A", "role": "Dev"}, {"key": "p_b", "name": "B", "role": "Dev", "github": "BeeGH"}]
        asker = install.Asker({})
        with mock.patch("sys.stdout", new=io.StringIO()):
            self.assertEqual(install.who(asker, roster, "beegh"), ("p_b", None))

    def test_dry_run_creates_nothing(self):
        self.assertEqual(self.run_install(ANSWERS, "--dry-run"), 0)
        k = self.fakes[-1]
        self.assertFalse([1 for m, p, _ in k.calls if m in ("POST", "PUT") and p != "/workflow-steps/test-api-call"])
        self.assertFalse(os.path.exists(self.cfg_path))


    def test_jira_statuses_proposed_from_the_board_columns(self):
        """Colonnes du board lues à travers Kronn : chaque statut classé par le nom de sa colonne, sinon sa catégorie Jira."""
        self.assertEqual(self.run_install(ANSWERS), 0)
        j = json.loads(Path(self.cfg_path).read_text())["jira"]
        self.assertEqual({k: j["statuses"][k] for k in ("Open", "Building", "Peer review", "In QA", "Reopened", "Ready", "Live")},
                         {"Open": "todo", "Building": "doing", "Peer review": "review", "In QA": "test", "Reopened": "test",
                          "Ready": "deploy", "Live": "done"})  # « Backlog » et « Doing » : par leur nom ; colonne inconnue : catégorie
        self.assertEqual((j["flow"]["test"], j["flow"]["reopened"], j["done_status"]), ("In QA", "Reopened", "Live"))
        with mock.patch.object(install, "Kronn", return_value=self.fakes[-1]):  # refusé : le classement du profil reste
            self.assertEqual(self.run_install({**ANSWERS, "jira_statuses": "n"}), 0)
        self.assertNotIn("Live", json.loads(Path(self.cfg_path).read_text())["jira"]["statuses"])

    def test_deploy_workflows_and_other_repos_asked(self):
        self.assertEqual(self.run_install({**ANSWERS, "github_prod": "deploy-prod.yml", "github_staging": "",
                                           "github_deploys": "vance/api, acme/new-repo"}), 0)
        g = json.loads(Path(self.cfg_path).read_text())["github"]
        self.assertEqual(g["prod_workflow"], "deploy-prod.yml")
        by = {d["repo"]: d for d in g["deploys"]}
        self.assertEqual(list(by), ["vance/api", "acme/new-repo"])
        self.assertEqual(by["vance/api"]["prod_workflow"], "CD_Deploy-PROD.yaml")  # celui du profil, gardé
        self.assertEqual(by["acme/new-repo"], {"repo": "acme/new-repo", "prod_workflow": "deploy-prod.yml"})
        with self.assertRaises(install.InstallError):
            self.run_install({**ANSWERS, "github_deploys": "pas-un-depot"})
        self.assertNotIn("pr_repos", g)  # PR : par défaut le principal et les dépôts de mises en prod, sans clé (#56)

    def test_pr_repos_asked_main_repo_first(self):
        """#56 : dépôts dont lire les PR, facultatif ; une liste différente du défaut est écrite, dépôt principal en tête."""
        self.assertEqual(self.run_install({**ANSWERS, "github_prod": "deploy-prod.yml", "github_deploys": "vance/api",
                                           "github_pr_repos": "vance/api, acme/outils, vance/api"}), 0)
        g = json.loads(Path(self.cfg_path).read_text())["github"]
        self.assertEqual(g["pr_repos"], ["vance/frigo", "vance/api", "acme/outils"])
        with self.assertRaises(install.InstallError):
            self.run_install({**ANSWERS, "github_pr_repos": "pas-un-depot"})


class GuestsTest(unittest.TestCase):
    """Invités de passage : les communs (hérauts), ceux du profil d'équipe, puis ceux de l'installation, embarqués avec le roster."""

    def test_common_then_profile_then_installation(self):
        import assemble
        pack = os.path.join(ROOT, "tests", "fixtures", "pack-exemple")
        cfg = {"team": pack, "guests": [{"key": "g_x", "name": "X"}]}
        profile = [g["key"] for g in json.loads(Path(os.path.join(pack, "roster.json")).read_text())["guests"]]
        self.assertEqual([g["key"] for g in assemble.guests(cfg)], ["g_gandalf", "g_yoda", "g_facteur", "g_menage"] + profile + ["g_x"])
        self.assertIn("g_hank", profile)
        self.assertEqual([g["key"] for g in assemble.guests({})], ["g_gandalf", "g_yoda", "g_facteur", "g_menage"])  # toute installation, même sans équipe
        self.assertEqual(assemble.guests({"common_guests": False}), [])
        renamed = assemble.guests({"guests": [{"key": "g_yoda", "name": "Le sage", "sprite": "yoda", "on": "prod"}]})
        self.assertEqual([(g["key"], g["name"]) for g in renamed], [("g_gandalf", "Gandalf"), ("g_facteur", "Le facteur"), ("g_menage", "L'agent d'entretien"), ("g_yoda", "Le sage")])  # même clé : remplacé (et passé en dernier)
        self.assertTrue({"yoda", "mage", "facteur"} <= set(assemble.sprites({})))  # planches communes (sprites/common.json)
        self.assertIn("sorcier", assemble.sprites(cfg))  # sa planche, tirée de sprites/sorcier/ du pack
        html = assemble.build(demo=False, cfg=dict(json.loads(Path(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json")).read_text()), team=pack))
        self.assertIn('"guests":[{"key":"g_gandalf"', html)



class LaunchTest(unittest.TestCase):
    """Clé launch : les workflows lancés depuis la fiche d'un ticket, avec les noms de variables de chaque installation."""

    def block(self, cfg, aid):
        import assemble
        html = assemble.build(demo=False, cfg=cfg)
        m = re.search(r'<script type="application/kronn-action" data-action-id="' + aid + r'">(.*?)</script>', html, re.S)
        return json.loads(m.group(1)) if m else None

    def test_id_alone_keeps_the_default_variable_names(self):
        cfg = dict(json.loads(Path(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json")).read_text()))
        cfg["launch"] = {"mep": "wf-mep"}
        spec = self.block(cfg, "bureau-mep")
        self.assertEqual(spec["target_id"], "wf-mep")
        self.assertEqual([v["name"] for v in spec["values"]], ["jira_ticket_key", "pr_number"])
        self.assertIsNone(self.block(cfg, "bureau-impl"))  # pas configuré : pas de bouton

    def test_variables_renamed_or_dropped_for_your_workflows(self):
        cfg = dict(json.loads(Path(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json")).read_text()))
        cfg["launch"] = {"mep": {"wf": "wf-mep", "vars": {"ticket": "issue_key", "pr": None}},
                         "review": {"wf": "wf-rev", "vars": {"repo": "project", "pr": "mr"}}}
        mep = self.block(cfg, "bureau-mep")
        self.assertEqual([(v["name"], v["source_ref"]) for v in mep["values"]],
                         [("issue_key", "<page.dataset.actions.tickets.find(key).key>")])  # pr retiré, liaison gardée
        rev = self.block(cfg, "bureau-review")
        self.assertEqual([v["name"] for v in rev["values"]], ["project", "mr"])
        import assemble  # la page reçoit les noms renommés comme clés de data-kronn-bindings
        binds = assemble.action_binds(assemble.build(demo=False, cfg=cfg))
        self.assertEqual((binds["bureau-mep"], binds["bureau-review"]), ({"issue_key": "key"}, {"project": "id", "mr": "id"}))

    def test_env_branch_action_binds_the_pr_and_its_fixed_action(self):
        """launch.env : n° de PR et action relus dans la ligne de la PR (actions.prs[].env), dépôt seulement s'il est nommé ;
        la page reçoit les dépôts du bouton (launch.env.repos, sinon le dépôt principal)."""
        import assemble
        cfg = dict(json.loads(Path(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json")).read_text()))
        self.assertIsNone(self.block(cfg, "bureau-env"))
        self.assertEqual(assemble.env_repos(cfg), [])
        cfg["launch"] = {"env": {"wf": "wf-env", "vars": {"pr": "pr_number", "action": "action"}, "repos": ["acme/front"]}}
        spec = self.block(cfg, "bureau-env")
        self.assertEqual(spec["target_id"], "wf-env")
        self.assertEqual([(v["name"], v["source_ref"]) for v in spec["values"]],
                         [("pr_number", "<page.dataset.actions.prs.find(id).n>"), ("action", "<page.dataset.actions.prs.find(id).env>")])
        self.assertEqual(assemble.env_repos(cfg), ["acme/front"])
        self.assertEqual(assemble.env_repos({**cfg, "launch": {"env": "wf-env"}}), [cfg["github"]["repo"]])

    def test_unknown_role_is_refused(self):
        import assemble
        with self.assertRaises(ValueError) as e:
            assemble.launch({"launch": {"impl": {"wf": "x", "vars": {"pr": "pr"}}}})
        self.assertIn("rôles : ticket", str(e.exception))


if __name__ == "__main__":
    unittest.main()
