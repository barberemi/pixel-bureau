"""tools/publish.py workflows (python3 -m unittest tests/test_publish.py) : un workflow du Bureau absent de la config est
créé AVANT le rendu des autres, pour que tous les scripts connaissent son id (sinon il passe pour un agent)."""
import contextlib, importlib, io, json, os, sys, tempfile, unittest
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURE = json.loads(Path(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json")).read_text())


class PublishWorkflowsTest(unittest.TestCase):
    def test_missing_bureau_workflow_is_created_before_everything_is_rendered(self):
        cfg = json.loads(json.dumps(FIXTURE))
        (cfg.get("actions") or {}).pop("pages", None)
        tmp = tempfile.mkdtemp()
        path = os.path.join(tmp, "bureau.config.json")
        Path(path).write_text(json.dumps(cfg))
        os.environ["BUREAU_CONFIG"] = path
        try:
            sys.path.insert(0, os.path.join(ROOT, "tools"))
            publish = importlib.reload(importlib.import_module("publish"))
            calls = []

            def call(method, url, body=None):
                calls.append((method, url, body))
                if method == "POST":
                    return {"data": {"id": "11111111-2222-3333-4444-555555555555"}}
                if method == "GET":
                    return {"data": {"steps": []}}
                return {"success": True}
            publish.call = call
            with contextlib.redirect_stdout(io.StringIO()):
                publish.workflows()
        finally:
            os.environ.pop("BUREAU_CONFIG", None)
        posts = [i for i, c in enumerate(calls) if c[0] == "POST"]
        puts = [i for i, c in enumerate(calls) if c[0] == "PUT"]
        self.assertTrue(posts and puts)
        self.assertLess(max(posts), min(puts), "créations d'abord, rendus ensuite")
        self.assertEqual(json.loads(Path(path).read_text())["actions"]["pages"], "11111111-2222-3333-4444-555555555555")
        office = next(b for m, u, b in calls if m == "PUT" and u == f"/workflows/{cfg['workflows']['office']}")
        self.assertIn("11111111-2222-3333-4444-555555555555", json.dumps(office), "le cron du bureau connaît le nouveau workflow")



class PublishPageSizeTest(unittest.TestCase):
    """Kronn refuse une page de plus de 24 Mio (garde-fou) : publish.py et install.py la pèsent avant l'envoi (assemble.publishable)
    et ne l'envoient pas, en disant de combien elle déborde ; à 90 % de la limite, une alerte."""

    def setUp(self):
        sys.path.insert(0, os.path.join(ROOT, "tools"))
        self.assemble = importlib.import_module("assemble")
        self.cfg = self.assemble.demo_config()
        self.size = len(self.assemble.build(demo=False, cfg=self.cfg).encode())
        self.limit = self.assemble.KRONN_LIMIT

    def tearDown(self):
        self.assemble.KRONN_LIMIT = self.limit

    def test_too_big_is_refused_with_the_overflow(self):
        self.assemble.KRONN_LIMIT = self.size - 10
        with self.assertRaises(self.assemble.PageTooBig) as e:
            self.assemble.publishable(self.cfg)
        self.assertIn("10 de trop", str(e.exception))
        self.assertIn("Poids :", str(e.exception))

    def test_near_the_limit_warns_but_publishes(self):
        self.assemble.KRONN_LIMIT = int(self.size / 0.95)
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            html = self.assemble.publishable(self.cfg)
        self.assertEqual(len(html.encode()), self.size)
        self.assertIn("ALERTE taille", err.getvalue())
        self.assemble.KRONN_LIMIT = self.size * 2
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            self.assemble.publishable(self.cfg)
        self.assertEqual(err.getvalue(), "")

    def test_publish_sends_nothing_when_too_big(self):
        tmp = tempfile.mkdtemp()
        path = os.path.join(tmp, "bureau.config.json")
        Path(path).write_text(json.dumps(FIXTURE))
        os.environ["BUREAU_CONFIG"] = path
        try:
            publish = importlib.reload(importlib.import_module("publish"))
            calls = []
            publish.call = lambda *a, **k: calls.append(a) or {"success": True}
            self.assemble.KRONN_LIMIT = 1000  # le module que publish.page() importe
            with self.assertRaises(SystemExit) as e:
                publish.page()
        finally:
            os.environ.pop("BUREAU_CONFIG", None)
        self.assertIn("page non publiée", str(e.exception.code))
        self.assertEqual(calls, [], "rien d'envoyé à Kronn")


if __name__ == "__main__":
    unittest.main()
