"""Scripts des workflows (python3 -m unittest tests/test_scripts.py) : lancés comme dans Kronn, contre un faux Kronn
HTTP et un faux `gh`, sans réseau. Chaque sortie doit être un JSON valide sous la limite de 100 Ko d'une étape Exec."""
import json, os, re, shutil, subprocess, sys, tempfile, threading, unittest
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURE = json.load(open(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json")))
LIMIT = 100 * 1024
OFFICE_WF = FIXTURE["workflows"]["office"]
TEAM_WF = FIXTURE["workflows"]["team"]
AGENT_WF = "aaaaaaaa-1111-2222-3333-444444444444"


def iso(minutes_ago=0):
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat().replace("+00:00", "Z")


def run_of(i, status="Success", steps=3, ago=5):
    return {"id": f"{i:08d}-0000-4000-8000-000000000000", "status": status, "started_at": iso(ago + 1), "finished_at": iso(ago),
            "tokens_used": 1200, "trigger_context": {"pr": "42", "secret_token": "x"},
            "step_results": [{"step_name": f"etape_{k}", "step_kind": "Agent", "status": "Failed" if status == "Failed" and k == 0 else "Success",
                              "started_at": iso(ago + 1), "duration_ms": 900, "tokens_used": 400,
                              "output": "---STEP_OUTPUT---{\"error\": \"401 Unauthorized\"}---END_STEP_OUTPUT---" if status == "Failed" else "ok " * 200}
                             for k in range(steps)]}


class FakeKronn:
    """Les routes de l'API Kronn que lisent les scripts. `runs_per_wf` : nombre de runs du jour par agent."""

    def __init__(self, runs_per_wf=3, steps=3):
        now = iso(2)
        self.workflows = [
            {"id": AGENT_WF, "name": "Revue de PR", "enabled": True, "trigger_type": "cron", "last_run": {"started_at": now, "finished_at": now, "status": "Success"}},
            # un cron du Bureau RENOMMÉ : il doit rester filtré (par id, pas par nom)
            {"id": OFFICE_WF, "name": "Mon instantané", "enabled": True, "trigger_type": "cron", "last_run": {"started_at": now, "finished_at": now, "status": "Success"}},
            {"id": TEAM_WF, "name": "Le Bureau · équipe", "enabled": True, "trigger_type": "cron", "last_run": {"started_at": now, "finished_at": now, "status": "Failed"}},
        ]
        self.runs = {AGENT_WF: [run_of(i, "Failed" if i == 0 else "Success", steps) for i in range(runs_per_wf)],
                     OFFICE_WF: [run_of(900)], TEAM_WF: [run_of(901, "Failed")]}
        self.discussions = [
            {"id": "d1", "title": "Pourquoi ça casse ?", "agent": "ClaudeCode", "participants": ["ClaudeCode"], "message_count": 4,
             "archived": False, "created_at": now, "updated_at": now, "workflow_run_id": None, "project_id": "p1"},
            {"id": "d2", "title": "Le Bureau · interroger un agent", "agent": "ClaudeCode", "participants": [], "message_count": 2,
             "archived": False, "created_at": now, "updated_at": now, "project_id": "p1"},
        ]

    def route(self, path):
        p = urlparse(path).path.removeprefix("/api")
        if p == "/workflows":
            return self.workflows
        m = re.fullmatch(r"/workflows/([\w-]+)/runs", p)
        if m:
            return self.runs.get(m.group(1), []) if "offset=0" in path or "offset" not in path else []
        m = re.fullmatch(r"/workflows/([\w-]+)", p)
        if m:
            return {"id": m.group(1), "trigger": {"schedule": "*/10 4-20 * * *"}, "variables": [],
                    "steps": [{"name": "gate", "step_type": {"type": "Gate"}}] if m.group(1) == AGENT_WF else []}
        if p == "/projects":
            return [{"id": "p1", "name": "Front"}]
        if p == "/discussions":
            return self.discussions
        if re.fullmatch(r"/discussions/[\w-]+/important", p):
            return {"total": 1}
        if p == "/stats/tokens":
            return {"total_cost": {"recorded_usd": 12.5}, "discussion_tokens": 2_500_000}
        raise KeyError(path)


def serve(fake):
    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            try:
                code, body = 200, json.dumps({"success": True, "data": fake.route(self.path)}).encode()
            except KeyError:
                code, body = 404, b'{"success":false}'
            self.send_response(code)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(body)

        def do_DELETE(self):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"{}")

        def log_message(self, *a):
            pass
    srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


class ScriptsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.bin = os.path.join(self.tmp, "bin")  # PATH des scripts : rien d'autre que le faux gh éventuel
        os.makedirs(self.bin)
        self.srv = None

    def tearDown(self):
        if self.srv:
            self.srv.shutdown()
            self.srv.server_close()
        shutil.rmtree(self.tmp)

    def kronn(self, fake):
        self.srv = serve(fake)
        return f"http://127.0.0.1:{self.srv.server_address[1]}/api"

    def fake_gh(self, outputs):
        """Faux `gh` : sa sortie selon le sous-commande (« pr list --state open » -> outputs["open"], …)."""
        data = os.path.join(self.tmp, "gh.json")
        with open(data, "w") as fh:
            json.dump(outputs, fh)
        path = os.path.join(self.bin, "gh")
        with open(path, "w") as fh:
            fh.write(f"""#!{sys.executable}
import json, sys
a = sys.argv[1:]
d = json.load(open({data!r}))
key = ("open" if "open" in a else "merged") if a[0] == "pr" else "releases" if a[0] == "release" else \\
      "staging" if "NONPROD" in " ".join(a) else "prod"
print(json.dumps(d.get(key, [])))
""")
        os.chmod(path, 0o755)

    def run_script(self, name, stdin=None, api=None, args=()):
        cfg = dict(FIXTURE, kronn=dict(FIXTURE["kronn"], api=api or "http://127.0.0.1:9/api"))
        cfg_path = os.path.join(self.tmp, "bureau.config.json")
        with open(cfg_path, "w") as fh:
            json.dump(cfg, fh)
        env = {"BUREAU_CONFIG": cfg_path, "HOME": self.tmp, "PATH": self.bin, "PYTHONPATH": ""}
        r = subprocess.run([sys.executable, os.path.join(ROOT, "workflows", name), *args], input=json.dumps(stdin) if stdin is not None else "",
                           capture_output=True, text=True, env=env, timeout=60)
        self.assertEqual(r.returncode, 0, f"{name} : {r.stderr[-800:]}")
        self.assertLess(len(r.stdout.encode()), LIMIT, f"{name} : sortie de {len(r.stdout.encode())} octets")
        return json.loads(r.stdout)

    # ---------- équipe ----------
    def team_input(self, n_issues=4, moves=1, github=None):
        today = datetime.now(timezone.utc).isoformat()
        people = [("acc-1", "Darryl Martin"), ("acc-2", "Jan Dupont")]
        issues = []
        for i in range(n_issues):
            acc, name = people[i % 2]
            issues.append({"key": f"EW-{100 + i}", "fields": {
                "summary": f"Ticket {i} " + "x" * 120, "status": {"name": ["En cours", "To Review", "To Test", "Inconnu"][i % 4]},
                "assignee": None if i == n_issues - 1 else {"accountId": acc, "displayName": name},
                "issuetype": {"name": "Story"}, "updated": today, "created": today, "customfield_10016": 3},
                "changelog": {"histories": [{"created": today, "author": {"accountId": acc, "displayName": name},
                                             "items": [{"field": "status", "fromString": "À faire", "toString": "En cours"}]}] * moves}})
        gh = github if github is not None else {
            "open": [{"number": 7, "title": "EW-100 corrige le menu", "author": {"login": "cmartin", "name": "Darryl Martin"},
                      "isDraft": False, "reviewDecision": "APPROVED", "url": "https://x/7", "updatedAt": today, "createdAt": today,
                      "latestReviews": [], "reviewRequests": ["barberemi"]}],
            "merged": [], "releases": [], "staging": [], "prod": [], "errors": []}
        return {"sprint": {"name": "S42", "startDate": today, "endDate": today}, "issues": issues, "closed": [], "github": gh,
                "work": {"written": [], "po_triage": None, "sm_triage": None, "qa_ok": None, "qa_back": None},
                "roles": {"po": "", "sm": "", "qa": ""}}

    def test_team_shape_groups_tickets_and_prs(self):
        out = self.run_script("team_shape.py", self.team_input())
        names = {p["name"]: p for p in out["people"]}
        self.assertEqual(set(names), {"Darryl Martin", "Jan Dupont"})
        self.assertEqual([t["key"] for t in names["Darryl Martin"]["tickets"]], ["EW-100", "EW-102"])
        self.assertEqual(names["Darryl Martin"]["prs"][0]["req"], ["barberemi"])
        self.assertEqual(out["unassigned"], [])  # le ticket sans assigné est dans un statut inconnu : ignoré
        self.assertTrue(out["sources"]["jira"] and out["sources"]["github"])
        self.assertNotIn("truncated", out)

    def test_team_shape_reports_github_errors(self):
        gh = {"open": [], "merged": [], "releases": [], "staging": [], "prod": [], "errors": ["open : gh introuvable sur la machine"]}
        out = self.run_script("team_shape.py", self.team_input(github=gh))
        self.assertFalse(out["sources"]["github"])
        self.assertEqual(out["sources"]["github_errors"], ["open : gh introuvable sur la machine"])

    def test_team_shape_without_jira(self):
        d = self.team_input()
        d.update(sprint=None, issues=None, closed=None)
        out = self.run_script("team_shape.py", d)
        self.assertEqual(out["people"], [])
        self.assertFalse(out["sources"]["jira"])

    def test_team_shape_stays_under_100k(self):
        out = self.run_script("team_shape.py", self.team_input(n_issues=100, moves=30))
        self.assertTrue(out["truncated"])
        self.assertGreater(len(out["events"]), 5)
        self.assertEqual(sum(len(p["tickets"]) for p in out["people"]), 75)  # les tickets du sprint ne sont jamais coupés

    # ---------- GitHub ----------
    def test_github_snapshot_without_gh(self):
        out = self.run_script("github_snapshot.py")
        self.assertEqual([out[k] for k in ("open", "merged", "releases", "staging", "prod")], [[]] * 5)
        self.assertEqual(len(out["errors"]), 5)
        self.assertIn("gh introuvable", out["errors"][0])

    def test_github_snapshot_stays_under_100k(self):
        pr = {"number": 1, "title": "EW-1 " + "t" * 400, "author": {"login": "a", "name": "A", "id": "x" * 300}, "isDraft": False,
              "reviewDecision": None, "url": "https://x/1", "updatedAt": iso(), "createdAt": iso(),
              "latestReviews": [{"author": {"login": "b"}, "state": "APPROVED", "submittedAt": iso(), "body": "b" * 2000}] * 3,
              "reviewRequests": [{"login": "c"}, {"name": "une équipe"}]}
        self.fake_gh({"open": [pr] * 100, "merged": [pr] * 40, "releases": [], "staging": [], "prod": []})
        out = self.run_script("github_snapshot.py")
        self.assertEqual(out["errors"], [])
        self.assertEqual(out["open"][0]["reviewRequests"], ["c"])
        self.assertNotIn("body", json.dumps(out["open"][0]["latestReviews"]))

    # ---------- instantanés Kronn ----------
    def test_office_snapshot_filters_bureau_by_id_and_reports_failures(self):
        out = self.run_script("office_snapshot.py", api=self.kronn(FakeKronn()))
        self.assertEqual({r["wf"] for r in out["runs"]}, {AGENT_WF})  # le cron du Bureau renommé reste dehors
        self.assertEqual(out["runs"][0]["vars"], {"pr": "42"})  # jamais une variable non listée (token…)
        self.assertEqual([d["id"] for d in out["discussions"]], ["d1"])
        self.assertEqual(out["discussions"][0]["project"], "Front")
        self.assertEqual([c["wf"] for c in out["crons"]], [AGENT_WF])
        self.assertEqual(set(out["bureau_failed"]), {"team"})
        self.assertEqual(out["bureau_failed"]["team"]["err"], "401 Unauthorized")
        failed = next(r for r in out["runs"] if r["status"] == "Failed")
        self.assertEqual(failed["steps"][0]["err"], "401 Unauthorized")

    def test_office_snapshot_stays_under_100k(self):
        fake = FakeKronn(runs_per_wf=400, steps=6)
        for r in fake.runs[AGENT_WF]:  # finis il y a plus de 3 h : leurs étapes peuvent partir
            r["started_at"] = r["finished_at"] = datetime.now(timezone.utc).replace(hour=0, minute=5).isoformat().replace("+00:00", "Z")
        out = self.run_script("office_snapshot.py", api=self.kronn(fake))
        self.assertEqual(len(out["runs"]) + out["truncated"], 400)
        self.assertIn("Failed", {r["status"] for r in out["runs"]})  # un échec n'est jamais retiré

    def test_live_snapshot(self):
        out = self.run_script("live_snapshot.py", api=self.kronn(FakeKronn()))
        self.assertEqual({r["wf"] for r in out["runs"]}, {AGENT_WF})
        self.assertEqual([d["id"] for d in out["discussions"]], ["d1"])
        self.assertEqual(out["deploys"], {"staging": {}, "prod": {}})  # sans gh : aucun déploiement, pas d'erreur

    def test_payroll_and_gates_ignore_bureau(self):
        api = self.kronn(FakeKronn())
        pay = self.run_script("payroll_snapshot.py", api=api)
        self.assertEqual([a["wf"] for a in pay["agents"]], [AGENT_WF])
        self.assertEqual(pay["rate_usd_per_mtok"], 5.0)
        gates = self.run_script("gates_snapshot.py", api=api)
        self.assertEqual([w["wf"] for w in gates["workflows"]], [AGENT_WF])
        self.assertEqual([w["wf"] for w in gates["askable"]], [AGENT_WF])

    def test_standup_since_format(self):
        r = subprocess.run([sys.executable, os.path.join(ROOT, "workflows", "standup_since.py")], capture_output=True, text=True,
                           env={"BUREAU_CONFIG": os.path.join(ROOT, "tests", "fixtures", "bureau.config.json"), "PATH": self.bin})
        self.assertRegex(r.stdout, r"^\d{4}/\d{2}/\d{2} 09:40$")


if __name__ == "__main__":
    unittest.main()
