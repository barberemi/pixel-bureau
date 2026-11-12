"""Services extérieurs (python3 -m unittest tests/test_statuts.py) : workflows/statuts_snapshot.py contre de fausses pages
Statuspage (summary.json, incidents.json) servies en local ; horloge figée comme pour les autres scripts."""
import json, os, sys, threading, unittest
from datetime import timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import test_scripts as ts  # noqa: E402  (module seulement : ses tests ne sont pas relancés ici)


def at(hours_ago):
    return (ts.NOW.astimezone(timezone.utc) - timedelta(hours=hours_ago)).isoformat().replace("+00:00", "Z")


def incident(name, impact, start, end=None, comps=()):
    return {"name": name, "impact": impact, "status": "resolved" if end is not None else "investigating", "created_at": at(start),
            "started_at": at(start), "resolved_at": at(end) if end is not None else None, "shortlink": "https://stspg.io/" + name[:3],
            "components": [{"name": c} for c in comps]}


class FakePages:
    """Pages de statut sous /<service>/api/v2/… ; pages[service] = {"components": […], "incidents": […]}, "BROKEN" = 500,
    "RAW" = un saut de ligne brut dans une chaîne (vu sur status.claude.com)."""
    def __init__(self, pages):
        self.pages = pages
        pages_ = pages

        class H(BaseHTTPRequestHandler):
            def do_GET(self):
                svc, _, rest = self.path.strip("/").partition("/")
                page = pages_.get(svc)
                if page is None or page == "BROKEN":
                    self.send_response(404 if page is None else 500)
                    self.end_headers()
                    return
                if rest == "api/v2/summary.json":
                    body = json.dumps({"components": page["components"], "incidents": [i for i in page["incidents"] if not i["resolved_at"]]})
                elif rest == "api/v2/incidents.json" and page.get("incidents_ok", True):
                    body = json.dumps({"incidents": page["incidents"]})
                    if page.get("raw"):
                        body = body.replace("\\n", "\n")
                else:
                    self.send_response(500)
                    self.end_headers()
                    return
                self.send_response(200)
                self.send_header("content-type", "application/json")
                self.end_headers()
                self.wfile.write(body.encode())

            def log_message(self, *a):
                pass
        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def url(self, svc):
        return f"http://127.0.0.1:{self.srv.server_address[1]}/{svc}"

    def close(self):
        self.srv.shutdown()
        self.srv.server_close()


OK = [{"name": "API", "status": "operational"}, {"name": "Webhooks", "status": "operational"}]


class StatutsTest(unittest.TestCase):
    setUp, tearDown, run_script = ts.ScriptsTest.setUp, ts.ScriptsTest.tearDown, ts.ScriptsTest.run_script  # sans ses tests

    def snap(self, pages, services):
        fake = FakePages(pages)
        self.addCleanup(fake.close)
        conf = [dict(s, url=fake.url(s["url"])) for s in services]
        return self.run_script("statuts_snapshot.py", statuts=conf)

    def test_state_is_the_worst_kept_component_and_incidents_are_dated_by_the_page(self):
        pages = {"gh": {"components": [{"name": "API", "status": "operational"}, {"name": "Webhooks", "status": "degraded_performance"},
                                       {"name": "Groupe", "status": "major_outage", "group": True}],
                        "incidents": [incident("Webhooks en retard", "minor", 1, comps=["Webhooks"]),
                                      incident("Panne d'hier", "major", 30, 29), incident("Vieille panne", "critical", 60, 50),
                                      incident("Annonce", "none", 2, 1)]}}
        d = self.snap(pages, [{"n": "GitHub", "url": "gh"}])
        self.assertEqual([(s["k"], s["n"], s["st"]) for s in d["services"]], [("github", "GitHub", "degraded")])
        self.assertEqual([(i["name"], i["impact"], i["to"] is None) for i in d["incidents"]],
                         [("Panne d'hier", "partial", False), ("Webhooks en retard", "degraded", True)])  # 36 h, sans « none », par début
        self.assertEqual(d["incidents"][1]["from"], at(1))
        self.assertEqual(d["warnings"], [])

    def test_components_bound_the_service_and_its_incidents(self):
        pages = {"cl": {"components": [{"name": "Claude API (api.anthropic.com)", "status": "operational"},
                                       {"name": "claude.ai", "status": "partial_outage"}],
                        "incidents": [incident("Connecteur Gmail", "minor", 1, comps=["claude.ai"]),
                                      incident("Erreurs sur l'API", "major", 3, 2, comps=["claude.ai", "Claude API (api.anthropic.com)"]),
                                      incident("Sans composant", "minor", 4, 3)]}}
        d = self.snap(pages, [{"n": "Claude", "url": "cl", "components": ["Claude API (api.anthropic.com)"]}])
        self.assertEqual(d["services"][0]["st"], "op", "claude.ai en panne ne compte pas")
        self.assertEqual([i["name"] for i in d["incidents"]], ["Sans composant", "Erreurs sur l'API"])

    def test_an_open_incident_weighs_even_when_the_components_are_still_green(self):
        pages = {"ji": {"components": OK, "incidents": [incident("Lenteurs", "critical", 0.5)]}}
        d = self.snap(pages, [{"n": "Jira", "url": "ji"}])
        self.assertEqual(d["services"][0]["st"], "major")

    def test_unreachable_service_keeps_its_name_and_warns(self):
        pages = {"ok": {"components": OK, "incidents": []}, "ko": "BROKEN",
                 "half": {"components": OK, "incidents": [incident("Ouvert", "minor", 1)], "incidents_ok": False}}
        d = self.snap(pages, [{"n": "Confluence", "url": "ko"}, {"n": "Jira", "url": "ok"}, {"n": "Mon Service", "url": "half"}])
        self.assertEqual([(s["k"], s["st"]) for s in d["services"]], [("confluence", None), ("jira", "op"), ("mon-service", "degraded")])
        self.assertEqual([i["name"] for i in d["incidents"]], ["Ouvert"], "incidents.json illisible : ceux de summary.json")
        self.assertEqual(len(d["warnings"]), 2)
        self.assertIn("Confluence injoignable", d["warnings"][0])

    def test_raw_line_breaks_in_a_status_page_are_read(self):
        pages = {"cl": {"components": OK, "incidents": [incident("Erreurs\nsur deux lignes", "minor", 1)], "raw": True}}
        d = self.snap(pages, [{"n": "Claude", "url": "cl"}])
        self.assertEqual(d["incidents"][0]["name"], "Erreurs\nsur deux lignes")

    def test_empty_setting_reads_nothing(self):
        d = self.snap({}, [])
        self.assertEqual((d["services"], d["incidents"]), ([], []))


if __name__ == "__main__":
    unittest.main()
