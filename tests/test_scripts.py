"""Scripts des workflows (python3 -m unittest tests/test_scripts.py) : lancés comme dans Kronn, contre un faux Kronn
HTTP et un faux `gh`, sans réseau. Chaque sortie doit être un JSON valide sous la limite de 100 Ko d'une étape Exec."""
import json, os, re, shutil, subprocess, sys, tempfile, threading, unittest
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
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
        self.datasets = []  # datasets de la page (GET /pages/{id})
        self.details = {}  # id de run -> step_results du détail du run (sorties complètes)
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
        m = re.fullmatch(r"/workflows/([\w-]+)/runs/([\w-]+)", p)
        if m:  # détail d'un run : les sorties des étapes (la liste ne les porte pas)
            return next(dict(r, step_results=self.details.get(r["id"], r["step_results"])) for r in self.runs[m.group(1)] if r["id"] == m.group(2))
        m = re.fullmatch(r"/workflows/([\w-]+)/runs", p)
        if m:
            return self.runs.get(m.group(1), []) if "offset=0" in path or "offset" not in path else []
        m = re.fullmatch(r"/workflows/([\w-]+)", p)
        if m:
            return {"id": m.group(1), "trigger": {"schedule": "*/10 4-20 * * *"}, "variables": [],
                    "steps": [{"name": "gate", "step_type": {"type": "Gate"}}] if m.group(1) == AGENT_WF else []}
        if re.fullmatch(r"/pages/[\w-]+", p):
            return {"datasets": self.datasets}
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
import hashlib, json, sys
a = sys.argv[1:]
open({data!r} + ".calls", "a").write(" ".join(a) + "\\n")
d = json.load(open({data!r}))
key = ("open" if "open" in a else "merged") if a[0] == "pr" else "releases" if a[0] == "release" else \\
      "staging" if "NONPROD" in " ".join(a) or "staging" in " ".join(a) else "prod"
if a[0] == "api":  # gh api -i [-H If-None-Match: …] …/actions/workflows/<fichier>/runs : en-têtes, ETag, 304
    body = json.dumps({{"workflow_runs": [{{"status": r["status"], "conclusion": r["conclusion"], "created_at": r["createdAt"],
        "updated_at": r["updatedAt"], "display_title": r["displayTitle"], "html_url": r["url"]}} for r in d.get(key, [])]}})
    etag = 'W/"' + hashlib.sha1(body.encode()).hexdigest() + '"'
    if "If-None-Match: " + etag in a:
        open({data!r} + ".calls", "a").write("304\\n")
        print("HTTP/2.0 304 Not Modified\\r\\nEtag: " + etag + "\\r\\n\\r\\n")
        sys.exit(1)
    print("HTTP/2.0 200 OK\\r\\nEtag: " + etag + "\\r\\n\\r\\n" + body)
    sys.exit(0)
print(json.dumps(d.get(key, [])))
""")
        os.chmod(path, 0o755)

    def run_raw(self, name, text, api=None):
        """Lance le script avec ce texte tel quel sur stdin ; renvoie le processus terminé (sans exiger de succès)."""
        cfg = dict(FIXTURE, kronn=dict(FIXTURE["kronn"], api=api or "http://127.0.0.1:9/api"))
        cfg_path = os.path.join(self.tmp, "bureau.config.json")
        with open(cfg_path, "w") as fh:
            json.dump(cfg, fh)
        env = {"BUREAU_CONFIG": cfg_path, "HOME": self.tmp, "PATH": self.bin, "PYTHONPATH": ""}
        return subprocess.run([sys.executable, os.path.join(ROOT, "workflows", name)], input=text, capture_output=True, text=True,
                              env=env, timeout=60)

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
            issues.append({"key": f"DM-{100 + i}", "fields": {
                "summary": f"Ticket {i} " + "x" * 120, "status": {"name": ["En cours", "To Review", "To Test", "Inconnu"][i % 4]},
                "assignee": None if i == n_issues - 1 else {"accountId": acc, "displayName": name},
                "issuetype": {"name": "Story"}, "updated": today, "created": today, "customfield_10016": 3},
                "changelog": {"histories": [{"created": today, "author": {"accountId": acc, "displayName": name},
                                             "items": [{"field": "status", "fromString": "À faire", "toString": "En cours"}]}] * moves}})
        gh = github if github is not None else {
            "open": [{"number": 7, "title": "DM-100 corrige le menu", "author": {"login": "dmartin", "name": "Darryl Martin"},
                      "isDraft": False, "reviewDecision": "APPROVED", "url": "https://x/7", "updatedAt": today, "createdAt": today,
                      "latestReviews": [], "reviewRequests": ["michaelscott"]}],
            "merged": [], "releases": [], "staging": [], "prod": [], "errors": []}
        return {"sprint": {"name": "S42", "startDate": today, "endDate": today}, "issues": issues, "closed": [], "github": gh,
                "work": {"written": [], "po_triage": None, "sm_triage": None, "qa_ok": None, "qa_back": None},
                "roles": {"po": "", "sm": "", "qa": ""}}

    def test_team_shape_groups_tickets_and_prs(self):
        out = self.run_script("team_shape.py", self.team_input())
        names = {p["name"]: p for p in out["people"]}
        self.assertEqual(set(names), {"Darryl Martin", "Jan Dupont"})
        self.assertEqual([t["key"] for t in names["Darryl Martin"]["tickets"]], ["DM-100", "DM-102"])
        self.assertEqual(names["Darryl Martin"]["prs"][0]["req"], ["michaelscott"])
        self.assertEqual(out["unassigned"], [])  # le ticket sans assigné est dans un statut inconnu : ignoré
        self.assertTrue(out["sources"]["jira"] and out["sources"]["github"])
        self.assertNotIn("truncated", out)

    def test_team_shape_new_tickets_with_their_author(self):
        """Tickets créés depuis le dernier daily (étape new_tickets) : numéro, titre, statut, auteur ; null = étape retirée."""
        inp = self.team_input()
        inp["new_tickets"] = [{"key": "DM-900", "fields": {"summary": "Nouveau besoin " + "y" * 200, "status": {"name": "En cours"},
                               "issuetype": {"name": "Bug"}, "created": "2026-10-01T10:08:00.000+0200",
                               "reporter": {"accountId": "acc-2", "displayName": "Jan Dupont"}}}]
        out = self.run_script("team_shape.py", inp)
        t = out["new_tickets"][0]
        self.assertEqual((t["key"], t["by"], t["by_name"], t["type"], t["status"]), ("DM-900", "acc-2", "Jan Dupont", "Bug", "En cours"))
        self.assertEqual(len(t["summary"]), 110)
        inp["new_tickets"] = None  # sans Jira, l'étape est retirée du rendu et sa référence devient null
        self.assertEqual(self.run_script("team_shape.py", inp)["new_tickets"], [])

    def test_team_shape_real_age_from_status_history(self):
        d = self.team_input(n_issues=2, moves=0)
        bascule = "2026-10-02T16:13:27.490+0200"  # bascule de sprint : réécrit updated, pas le statut
        a, b = d["issues"]
        a["fields"].update(updated=bascule, created="2025-05-22T14:25:19.116+0200")
        a["changelog"]["histories"] = [
            {"created": "2026-09-20T10:00:00.000+0200", "items": [{"field": "status", "fromString": "En cours", "toString": "To Review"}]},
            {"created": "2026-09-01T09:00:00.000+0200", "items": [{"field": "status", "fromString": "À faire", "toString": "En cours"}]},
            {"created": bascule, "items": [{"field": "Sprint", "fromString": "S41", "toString": "S42"}]}]
        b["fields"].update(updated=bascule, created="2026-09-15T08:00:00.000+0200")  # jamais changé de statut
        out = self.run_script("team_shape.py", d)
        since = {t["key"]: t["since"] for t in [x for p in out["people"] for x in p["tickets"]] + out["unassigned"]}
        self.assertEqual(since[a["key"]], "2026-09-20T10:00:00.000+0200")
        self.assertEqual(since[b["key"]], "2026-09-15T08:00:00.000+0200")
        pr = next(x for p in out["people"] for x in p["prs"])
        self.assertTrue(pr["created"])  # création de la PR, gardée pour l'âge de « PR sans review »

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
        pr = {"number": 1, "title": "DM-1 " + "t" * 400, "author": {"login": "a", "name": "A", "id": "x" * 300}, "isDraft": False,
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
        paris = datetime.now(ZoneInfo("Europe/Paris"))
        if paris.hour * 60 + paris.minute < 3 * 60 + 10:
            self.skipTest("entre minuit et 3h10 à Paris, aucun run du jour n'est fini depuis plus de 3 h")
        fake = FakeKronn(runs_per_wf=400, steps=6)
        for r in fake.runs[AGENT_WF]:  # du jour (heure de Paris) et finis il y a plus de 3 h : leurs étapes peuvent partir
            r["started_at"] = r["finished_at"] = paris.replace(hour=0, minute=5).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        out = self.run_script("office_snapshot.py", api=self.kronn(fake))
        self.assertEqual(len(out["runs"]) + out["truncated"], 400)
        self.assertIn("Failed", {r["status"] for r in out["runs"]})  # un échec n'est jamais retiré

    def test_live_snapshot(self):
        out = self.run_script("live_snapshot.py", api=self.kronn(FakeKronn()))
        self.assertEqual({r["wf"] for r in out["runs"]}, {AGENT_WF})
        self.assertEqual([d["id"] for d in out["discussions"]], ["d1"])
        self.assertEqual(out["deploys"], {"staging": {}, "prod": {}})  # sans gh : aucun déploiement, pas d'erreur

    def gh_calls(self):
        p = os.path.join(self.tmp, "gh.json.calls")
        return open(p).read().count("\n") if os.path.exists(p) else 0

    def test_live_snapshot_reads_deploys_with_an_etag(self):
        paris = datetime.now(ZoneInfo("Europe/Paris"))
        if paris.hour == 0 and paris.minute < 4:
            self.skipTest("juste après minuit à Paris, un déploiement d'il y a 3 min date de la veille")
        done = {"status": "completed", "conclusion": "success", "createdAt": iso(3), "updatedAt": iso(2),  # du jour, même tôt
                "displayTitle": "Deploy 17.2.0", "url": "https://x/r/1"}
        self.fake_gh({"staging": [done], "prod": [done]})
        api = self.kronn(FakeKronn())
        out = self.run_script("live_snapshot.py", api=api)
        self.assertEqual(out["deploys"]["prod"]["17.2.0"]["conclusion"], "success")
        self.assertEqual(out["deploys"]["prod"]["intranet 17.2.0"]["project"], "intranet")  # autre dépôt suivi (github.deploys)
        self.assertIsNone(out["deploys"]["prod"]["17.2.0"]["project"])  # dépôt principal : la version seule
        calls = open(os.path.join(self.tmp, "gh.json.calls")).read().splitlines()
        self.assertEqual(len(calls), 3)  # staging + prod du dépôt principal, prod de l'intranet
        self.assertFalse([c for c in calls if "If-None-Match" in c])  # pas encore d'ETag
        out = self.run_script("live_snapshot.py", api=api)  # rien n'a bougé : 304, runs republiés depuis le cache
        calls = open(os.path.join(self.tmp, "gh.json.calls")).read().splitlines()[3:]
        self.assertEqual(sum("If-None-Match: W/" in c for c in calls), 3)  # trois requêtes conditionnelles…
        self.assertEqual(calls.count("304"), 3)  # … et trois 304 (ordre libre : lectures en parallèle)
        self.assertEqual(out["deploys"]["prod"]["17.2.0"]["conclusion"], "success")
        moving = dict(done, status="in_progress", conclusion=None, updatedAt=iso(1), displayTitle="Deploy 17.3.0")
        self.fake_gh({"staging": [done], "prod": [moving, done]})  # une MEP part sur GitHub : nouvel ETag, relue tout de suite
        out = self.run_script("live_snapshot.py", api=api)
        self.assertEqual(out["deploys"]["prod"]["17.3.0"]["status"], "in_progress")
        self.assertIsNone(out["deploys"]["prod"]["17.3.0"]["end"])

    def test_payroll_and_gates_ignore_bureau(self):
        api = self.kronn(FakeKronn())
        pay = self.run_script("payroll_snapshot.py", api=api)
        self.assertEqual([a["wf"] for a in pay["agents"]], [AGENT_WF])
        self.assertEqual(pay["rate_usd_per_mtok"], 5.0)
        gates = self.run_script("gates_snapshot.py", api=api)
        self.assertEqual([w["wf"] for w in gates["workflows"]], [AGENT_WF])
        self.assertEqual([w["wf"] for w in gates["askable"]], [AGENT_WF])

    def test_gate_message_is_read_from_the_run_detail(self):
        fake = FakeKronn()
        run = dict(run_of(950, steps=0), status="WaitingApproval",
                   step_results=[{"step_name": "gate", "status": "WaitingApproval", "output": "", "started_at": iso(1)}])
        fake.runs[AGENT_WF] = [run]
        fake.details[run["id"]] = [{"step_name": "gate", "status": "WaitingApproval", "output": "Nouveau plan : 36 sièges"}]
        gates = self.run_script("gates_snapshot.py", api=self.kronn(fake))
        self.assertEqual([g["message"] for g in gates["gates"]], ["Nouveau plan : 36 sièges"])

    def test_standup_since_format(self):
        r = subprocess.run([sys.executable, os.path.join(ROOT, "workflows", "standup_since.py")], capture_output=True, text=True,
                           env={"BUREAU_CONFIG": os.path.join(ROOT, "tests", "fixtures", "bureau.config.json"), "PATH": self.bin})
        self.assertRegex(r.stdout, r"^\d{4}/\d{2}/\d{2} 09:40$")


if __name__ == "__main__":
    unittest.main()

    # ---------- plan partagé (workflow « Le Bureau · plan ») ----------
    PLAN = json.load(open(os.path.join(ROOT, "layouts", "exemple-startup.json")))

    def test_layout_save_publishes_a_valid_plan_with_a_summary(self):
        fake = FakeKronn()
        fake.datasets = [{"name": "layout", "current": {"layout": dict(self.PLAN, seating={"I1.L1": "p_pam"})}}]
        r = self.run_raw("layout_save.py", "```json\n" + json.dumps(dict(self.PLAN, seating={"I2.R1": "p_pam"})) + "\n```",
                         api=self.kronn(fake))
        self.assertEqual(r.returncode, 0, r.stderr)
        out = json.loads(r.stdout)
        self.assertEqual(out["layout"]["id"], "exemple-startup")
        self.assertIn("36 sièges", r.stderr)  # résumé lu par le boss dans la gate
        self.assertIn("p_pam I1.L1 → I2.R1", r.stderr)

    def test_layout_save_refuses_an_invalid_plan(self):
        r = self.run_raw("layout_save.py", json.dumps(dict(self.PLAN, exit=[5, 5])))
        self.assertEqual(r.returncode, 1)
        self.assertEqual(r.stdout, "")  # rien à publier
        self.assertIn("Plan refusé", r.stderr)
        self.assertIn("exit", r.stderr)
        self.assertEqual(self.run_raw("layout_save.py", "pas du json").returncode, 1)

    def test_layout_save_back_to_embedded_plan(self):
        r = self.run_raw("layout_save.py", "defaut")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIsNone(json.loads(r.stdout)["layout"])
