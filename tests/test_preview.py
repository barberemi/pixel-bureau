"""Aperçu local (python3 -m unittest tests/test_preview.py) : tools/preview.py assemble la page du dossier courant et y
injecte les datasets de la page Kronn (faux Kronn HTTP), sans rien publier."""
import json, os, sys, tempfile, threading, unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import preview  # noqa: E402


class PreviewTest(unittest.TestCase):
    def test_page_with_the_datasets_of_kronn_and_nothing_published(self):
        posts = []

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_GET(self):
                body = json.dumps({"success": True, "data": {"id": "p1", "title": "Le Bureau", "datasets": [{"name": "gitfut", "kind": "snapshot", "current": "{}"}]}}).encode()
                self.send_response(200); self.end_headers(); self.wfile.write(body)

            def do_POST(self):
                posts.append(self.path)
        srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.shutdown)
        cfg = dict(json.load(open(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json"))), page_id="p1")
        cfg["kronn"] = dict(cfg["kronn"], api=f"http://127.0.0.1:{srv.server_address[1]}/api")
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
            json.dump(cfg, fh)
        self.addCleanup(os.unlink, fh.name)
        with mock.patch("sys.stdout", new=open(os.devnull, "w")):
            self.assertEqual(preview.main(["--config", fh.name, "--no-open"]), 0)
        html = open(os.path.join(ROOT, "dist", "apercu.html"), encoding="utf-8").read()
        self.assertIn('window.KronnPageData={"version": 1', html)
        self.assertIn('"gitfut"', html)
        self.assertEqual(posts, [])


if __name__ == "__main__":
    unittest.main()
