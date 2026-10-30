"""Relancer un cron du Bureau après une action (python3 -m unittest tests/test_refresh.py) : refresh() de workflows/_lib.py
et workflows/refresh.py contre le faux Kronn de test_scripts.py ; modèles qui le font à leur fin."""
import json, os, subprocess, sys, tempfile, shutil, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import test_scripts as ts  # noqa: E402  (module seulement : ses tests ne sont pas relancés ici)

sys.path.insert(0, os.path.join(ts.ROOT, "tools"))
import templates  # noqa: E402

TPL = templates.load_templates()
TEAM, LIVE = ts.FIXTURE["workflows"]["team"], ts.FIXTURE["workflows"]["live"]
TRIGGER = "/mcp/workflow-trigger"


class Refused(ts.FakeKronn):
    """Kronn qui refuse le lancement (404, comme une route absente)."""

    def post(self, path, body):
        self.posts.append((path, body))
        raise KeyError(path)


def cfg(**over):
    c = json.loads(json.dumps(ts.FIXTURE))
    c["jira"] = {**c["jira"], "config_id": "abcdefab-cdef-abcd-efab-cdefabcdefab", "points_fields": ["customfield_200"]}
    c["github"] = {**c.get("github", {}), "repo": "vance/frigo", "config_id": "12121212-3434-5656-7878-909090909090"}
    c.update(over)
    return c


def steps(key, c=None):
    return templates.render(TPL[key], c or cfg())["steps"]


class RefreshTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.srv = None

    def tearDown(self):
        if self.srv:
            self.srv.shutdown()
            self.srv.server_close()
        shutil.rmtree(self.tmp)

    def kronn(self, fake):
        self.srv = ts.serve(fake)
        return f"http://127.0.0.1:{self.srv.server_address[1]}/api"

    def run_py(self, script, *args, api="http://127.0.0.1:9/api", stdin=""):
        path = os.path.join(self.tmp, "bureau.config.json")
        with open(path, "w") as fh:
            json.dump(dict(ts.FIXTURE, kronn=dict(ts.FIXTURE["kronn"], api=api)), fh)
        return subprocess.run([sys.executable, os.path.join(ts.ROOT, "workflows", script), *args], input=stdin, capture_output=True,
                              text=True, env={"BUREAU_CONFIG": path, "HOME": self.tmp, "PATH": "/usr/bin:/bin", **ts.CLOCK}, timeout=60)

    def triggers(self, fake):
        return [b for p, b in fake.posts if p == TRIGGER]

    # ---------- refresh() ----------
    def test_launches_the_cron_when_it_is_idle(self):
        fake = ts.FakeKronn()  # dernier run du cron équipe : Failed, donc fini
        r = self.run_py("refresh.py", "team", api=self.kronn(fake))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(self.triggers(fake), [{"workflow_id": TEAM, "variables": {}}])
        self.assertIn("Rafraîchissement du cron team : relancé (run run-lanc)", r.stdout)

    def test_nothing_when_a_run_is_active(self):
        for status in ("Running", "Pending", "WaitingApproval", "WaitingQuota"):
            fake = ts.FakeKronn()
            fake.runs[TEAM] = [ts.run_of(902, status)]
            r = self.run_py("refresh.py", "team", api=self.kronn(fake))
            self.srv.shutdown(), self.srv.server_close()
            self.srv = None
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertEqual(self.triggers(fake), [], status)
            self.assertIn("déjà en cours (run 00000902)", r.stdout)

    def test_never_fails_when_kronn_answers_badly(self):
        fake = ts.FakeKronn()
        fake.broken = {f"/workflows/{TEAM}/runs"}  # liste des runs en 404
        r = self.run_py("refresh.py", "team", api=self.kronn(fake))
        self.assertEqual((r.returncode, self.triggers(fake)), (0, []), r.stderr)
        self.assertIn("pas relancé (Kronn a refusé la liste des runs (404))", r.stdout)
        self.srv.shutdown(), self.srv.server_close()
        fake = Refused()  # lancement refusé
        r = self.run_py("refresh.py", "team", api=self.kronn(fake))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("pas relancé (Kronn a refusé /mcp/workflow-trigger (404)", r.stdout)
        r = self.run_py("refresh.py", "team")  # Kronn injoignable
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("pas relancé (Kronn injoignable", r.stdout)
        r = self.run_py("refresh.py", "office_inconnu")  # cron absent de la config
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("pas relancé (pas dans la config)", r.stdout)

    # ---------- cron équipe ----------
    def test_team_models_end_with_a_refresh_reached_only_on_success(self):
        c = cfg(models={"review_child": "abababab-0000-4000-8000-000000000001"})
        for key in ("move", "estimate", "review_one"):
            st = steps(key, c)
            last = st[-1]
            self.assertEqual(last["step_type"]["type"], "Exec", key)
            self.assertEqual(last["exec_args"][2:], ["team"], key)
            self.assertIn("def refresh(which", last["exec_args"][1], key)
            self.assertFalse(last.get("on_result"), key)
            self.assertLessEqual(len(st), 20, key)
            for s in st[:-1]:  # aucun renvoi vers le refresh depuis un échec
                for rule in s.get("on_result") or []:
                    if rule["contains"] == "ERROR":
                        self.assertNotEqual((rule.get("action") or {}).get("step_name"), last["name"], key)
        self.assertEqual(steps("move", c)[-1]["name"], "fin", "move : la fin commune relance, sans étape de plus")
        self.assertEqual(len(steps("move", c)), 17)

    def test_mep_and_ai_time_refresh_in_their_done_step(self):
        c = cfg(models={"ai_time": "abababab-0000-4000-8000-000000000003"})
        mep = TPL["mep"]["definition"]["steps"]
        self.assertEqual(len(mep), 20, "mep : déjà au plafond de Kronn, aucune étape de plus")
        for key in ("mep", "ai_time"):
            done = next(s for s in TPL[key]["definition"]["steps"] if s["name"] == "done")
            self.assertEqual(done["on_result"], [{"contains": "OK", "action": {"type": "Stop"}}], key)
            self.assertGreaterEqual(done["exec_timeout_secs"], 60, key)
        with open(os.path.join(ts.ROOT, "workflows", "mep.py"), encoding="utf-8") as fh:
            self.assertIn('refresh("team")', fh.read())
        stop = next(s for s in steps("ai_time", c) if s["name"] == "stop")
        self.assertNotIn("refresh", json.dumps(stop), "garde-fou : rien écrit dans Jira, rien à rafraîchir")

    def test_ai_time_done_launches_the_team_cron(self):
        fake = ts.FakeKronn()
        r = self.run_py("ai_time.py", "done", "run-1", api=self.kronn(fake))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(self.triggers(fake), [{"workflow_id": TEAM, "variables": {}}])
        self.assertIn("Temps gagné posté", r.stdout)
        self.assertIn("Rafraîchissement du cron team : relancé", r.stderr)


if __name__ == "__main__":
    unittest.main()
