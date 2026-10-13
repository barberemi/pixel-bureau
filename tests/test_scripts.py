"""Scripts des workflows (python3 -m unittest tests/test_scripts.py) : lancés comme dans Kronn, contre un faux Kronn
HTTP et un faux `gh`, sans réseau. Chaque sortie doit être un JSON valide sous la limite de 100 Ko d'une étape Exec."""
import json, os, re, shutil, subprocess, sys, tempfile, threading, unittest
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURE = json.load(open(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json")))
LIMIT = 100 * 1024
OFFICE_WF = FIXTURE["workflows"]["office"]
TEAM_WF = FIXTURE["workflows"]["team"]
AGENT_WF = "aaaaaaaa-1111-2222-3333-444444444444"
# horloge figée (KT-56) : les scripts lancés ici lisent BUREAU_TEST_NOW (tests/fakeclock/sitecustomize.py) ; midi à
# Paris par défaut, BUREAU_TEST_NOW=2026-10-12T00:02:00+02:00 pour rejouer le passage de minuit
NOW = datetime.fromisoformat(os.environ.get("BUREAU_TEST_NOW") or
                             datetime.now(ZoneInfo("Europe/Paris")).replace(hour=12, minute=0, second=0, microsecond=0).isoformat())
CLOCK = {"PYTHONPATH": os.path.join(ROOT, "tests", "fakeclock"), "BUREAU_TEST_NOW": NOW.isoformat()}


def iso(minutes_ago=0):
    return (NOW.astimezone(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat().replace("+00:00", "Z")


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
        self.pages = {}  # autres pages Kronn par id (écran du boss, pages_snapshot.py)
        self.details = {}  # id de run -> step_results du détail du run (sorties complètes)
        self.posts = []  # (chemin, corps) des POST reçus
        self.disc_details = {}  # id de discussion -> détail (GET /discussions/{id}, avec ses messages)
        self.questions = {}  # id de discussion -> questions (GET /discussions/{id}/questions)
        self.variables = {}  # id de workflow -> variables de lancement (GET /workflows/{id})
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
            return {"id": m.group(1), "trigger": {"schedule": "*/10 4-20 * * *"}, "variables": self.variables.get(m.group(1), []),
                    "steps": [{"name": "gate", "step_type": {"type": "Gate"}}] if m.group(1) == AGENT_WF else []}
        m = re.fullmatch(r"/pages/([\w-]+)", p)
        if m and m.group(1) in self.pages:
            return self.pages[m.group(1)]
        if m and self.pages:
            raise KeyError(path)  # page supprimée
        if m:
            return {"datasets": self.datasets}
        if p == "/projects":
            return [{"id": "p1", "name": "Front"}]
        if p == "/discussions":
            return self.discussions
        m = re.fullmatch(r"/discussions/([\w-]+)", p)
        if m and m.group(1) in self.disc_details:
            return self.disc_details[m.group(1)]
        m = re.fullmatch(r"/discussions/([\w-]+)/questions", p)
        if m:
            qs = self.questions.get(m.group(1), [])
            return {"questions": qs, "pending_count": sum(q["state"] == "pending" for q in qs)}
        if re.fullmatch(r"/discussions/[\w-]+/important", p):
            return {"total": 1}
        if p == "/stats/tokens":
            return {"total_cost": {"recorded_usd": 12.5}, "discussion_tokens": 2_500_000}
        raise KeyError(path)

    def post(self, path, body):
        """POST reçus (duck_start.py) : création d'une discussion, puis lancement de l'agent (/run, flux SSE)."""
        self.posts.append((urlparse(path).path.removeprefix("/api"), body))
        p = self.posts[-1][0]
        if p == "/discussions":
            return {"id": "dd000001", "title": body["title"]}
        if re.fullmatch(r"/discussions/[\w-]+/run", p):
            return None
        m = re.fullmatch(r"/discussions/([\w-]+)/questions/([^/]+)/(answer|decline)", p)
        if m:  # question_answer.py : la question passe à answered / declined (id Kronn « question:<discussion>:<n> », encodé)
            q = next(x for x in self.questions[m.group(1)] if x["id"] == unquote(m.group(2)))
            q["state"] = "answered" if m.group(3) == "answer" else "declined"
            return q
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

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers.get("content-length") or 0)) or b"null")
            try:
                data = fake.post(self.path, body)
                code = 200
                out = b"event: done\ndata: {}\n\n" if data is None else json.dumps({"success": True, "data": data}).encode()
            except KeyError:
                code, out = 404, b'{"success":false}'
            self.send_response(code)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(out)

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
        "updated_at": r["updatedAt"], "display_title": r["displayTitle"], "html_url": r["url"],
        **({{"actor": {{"login": r["by"]}}}} if r.get("by") else {{}})}} for r in d.get(key, [])]}})
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
        env = {"BUREAU_CONFIG": cfg_path, "HOME": self.tmp, "PATH": self.bin, **CLOCK}
        return subprocess.run([sys.executable, os.path.join(ROOT, "workflows", name)], input=text, capture_output=True, text=True,
                              env=env, timeout=60)

    def run_script(self, name, stdin=None, api=None, args=(), **extra):
        cfg = dict(FIXTURE, kronn=dict(FIXTURE["kronn"], api=api or "http://127.0.0.1:9/api"), **extra)
        cfg_path = os.path.join(self.tmp, "bureau.config.json")
        with open(cfg_path, "w") as fh:
            json.dump(cfg, fh)
        env = {"BUREAU_CONFIG": cfg_path, "HOME": self.tmp, "PATH": self.bin, **CLOCK}
        r = subprocess.run([sys.executable, os.path.join(ROOT, "workflows", name), *args], input=json.dumps(stdin) if stdin is not None else "",
                           capture_output=True, text=True, env=env, timeout=60)
        self.assertEqual(r.returncode, 0, f"{name} : {r.stderr[-800:]}")
        self.assertLess(len(r.stdout.encode()), LIMIT, f"{name} : sortie de {len(r.stdout.encode())} octets")
        return json.loads(r.stdout)

    # ---------- équipe ----------
    def team_input(self, n_issues=4, moves=1, github=None):
        today = NOW.astimezone(timezone.utc).isoformat()
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

    def test_team_shape_points_follow_the_field_order_and_keep_zero(self):
        """Champ du board d'abord (Story Points) ; un 0 posé compte, l'estimation ne le remplace pas (cas EW-7852)."""
        inp = self.team_input(n_issues=2)
        inp["issues"][0]["fields"].update({"customfield_10016": 3, "customfield_10102": 0})
        inp["issues"][1]["fields"].update({"customfield_10016": 1, "customfield_10102": None})
        jira = dict(FIXTURE["jira"], points_fields=["customfield_10102", "customfield_10016"])
        out = self.run_script("team_shape.py", inp, jira=jira)
        pts = {t["key"]: t["points"] for t in [t for p in out["people"] for t in p["tickets"]] + out["unassigned"]}
        self.assertEqual(pts, {"DM-100": 0, "DM-101": 1})  # 0 gardé ; sans Story Points, repli sur l'estimation

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

    def test_team_shape_planning_lists_unestimated_tickets_of_the_next_two_sprints(self):
        inp = self.team_input()
        sp = lambda i, n: {"id": i, "name": n, "state": "future", "startDate": "2026-10-16T11:00:00.000Z", "endDate": "2026-10-30T11:00:00.000Z"}
        issue = lambda k, sprint, pts=None: {"key": k, "fields": {"summary": "Ticket " + k, "status": {"name": "À faire"},
                                                                 "issuetype": {"name": "Story"}, "assignee": None, "customfield_10016": pts,
                                                                 "customfield_10020": [sprint]}}
        inp["planning"] = {"sprints": [sp(11, "S43"), sp(12, "S45"), sp(13, "S47")],
                           "issues": [issue("DM-1", sp(11, "S43")), issue("DM-2", sp(12, "S45"), pts=3), issue("DM-3", sp(13, "S47"))]}
        pl = self.run_script("team_shape.py", inp)["planning"]
        self.assertEqual([s["name"] for s in pl["sprints"]], ["S43", "S45"])
        self.assertEqual([(t["key"], t["sprint"], t["cat"]) for t in pl["tickets"]], [("DM-1", 11, "todo")])  # estimé ou trop loin : ignorés
        inp["planning"] = None  # sans Jira : étapes retirées, entrée null
        self.assertIsNone(self.run_script("team_shape.py", inp)["planning"])

    def test_planning_jql(self):
        def jql(stdin):
            r = subprocess.run([sys.executable, os.path.join(ROOT, "workflows", "planning_jql.py")], input=stdin, capture_output=True, text=True,
                               env={"BUREAU_CONFIG": os.path.join(ROOT, "tests", "fixtures", "bureau.config.json"), "PATH": self.bin})
            self.assertEqual(r.returncode, 0, r.stderr)
            return r.stdout
        self.assertEqual(jql(json.dumps([{"id": 2328}, {"id": 2361}, {"id": 2461}])),
                         "project = DM AND sprint in (2328,2361) AND cf[10016] is EMPTY AND cf[10102] is EMPTY"
                         " AND statusCategory != Done ORDER BY rank")
        for empty in ("[]", "null", ""):  # pas de sprint futur : une requête valide qui ne renvoie rien
            self.assertEqual(jql(empty), "project = DM AND sprint in futureSprints() AND sprint is EMPTY")

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

    def test_team_shape_status_from_bulkfetch(self):
        """Tickets sans historique (jira_team) + changements de statut de status_log (changelog/bulkfetch), rattachés par id."""
        d = self.team_input(n_issues=2, moves=0)
        a, b = d["issues"]
        for i, it in enumerate(d["issues"]):
            it["id"] = str(81000 + i)
            del it["changelog"]
        a["fields"]["created"] = "2026-08-01T08:00:00.000+0200"
        b["fields"]["created"] = "2026-09-15T08:00:00.000+0200"
        now = NOW.astimezone(timezone.utc).replace(microsecond=0)
        # bulkfetch date en millisecondes epoch (expand=changelog en ISO)
        d["status_log"] = [{"issueId": "81000", "changeHistories": [
            {"created": int(datetime(2026, 9, 20, 8, tzinfo=timezone.utc).timestamp() * 1000),
             "items": [{"field": "status", "fromString": "À faire", "toString": "En cours"}]},
            {"created": int(now.timestamp() * 1000), "author": {"accountId": "acc-1", "displayName": "Darryl Martin"},
             "items": [{"field": "status", "fromString": "En cours", "toString": "To Review"}]}]}]
        out = self.run_script("team_shape.py", d)
        since = {t["key"]: t["since"] for t in [x for p in out["people"] for x in p["tickets"]] + out["unassigned"]}
        self.assertEqual(since[a["key"]], now.isoformat(timespec="milliseconds"))  # dernier changement de statut
        self.assertEqual(since[b["key"]], "2026-09-15T08:00:00.000+0200")  # absent de status_log : création
        moves = [e for e in out["events"] if e["kind"] == "move"]
        self.assertEqual([(e["key"], e["to"]) for e in moves], [(a["key"], "To Review")])  # seul celui d'aujourd'hui

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

    # ---------- canard d'équipe ----------
    def velocity(self, done):
        """Graphique de vélocité Jira : sprints du plus récent au plus ancien, points terminés de chacun."""
        sprints = [{"id": 100 - i, "name": f"S{len(done) - i}"} for i in range(len(done))]
        return {"sprints": sprints, "velocityStatEntries": {str(s["id"]): {"completed": {"value": d}, "estimated": {"value": 99}}
                                                            for s, d in zip(sprints, done)}}

    def test_duck_snapshot_target_held_sprints_and_trophies(self):
        paris = ZoneInfo("Europe/Paris")
        start = (NOW.astimezone(paris) - timedelta(days=3)).replace(hour=9, minute=0, second=0, microsecond=0)
        early = start.replace(hour=10, minute=12) + timedelta(days=1)
        fake = FakeKronn()
        fake.discussions += [{"id": f"k{i}", "title": f"🦆 question {i}", "updated_at": iso()} for i in range(3)]
        self.fake_gh({"prod": [{"status": "completed", "conclusion": "success", "createdAt": early.isoformat(), "updatedAt": early.isoformat(),
                                "displayTitle": "v1.2.0", "url": "https://x/r"}],
                      "merged": []})
        # du plus récent au plus ancien : 120 (moyenne des 4 d'avant 85 : tenu), 100 (85 : tenu), 60 (90 : pas tenu), 80, 100, 100, 80
        out = self.run_script("duck_snapshot.py", {"sprint": {"name": "S8", "startDate": start.isoformat(), "endDate": (start + timedelta(days=14)).isoformat()},
                                                   "velocity": self.velocity([120, 100, 60, 80, 100, 100, 80]), "reopens": []}, api=self.kronn(fake))
        self.assertEqual(out["errors"], [])
        self.assertEqual(out["target"], 90.0)  # moyenne des 4 derniers sprints fermés
        self.assertEqual([(s["name"], s["target"], s["held"]) for s in out["sprints"]],
                         [("S7", 85.0, True), ("S6", 85.0, True), ("S5", 90.0, False)])
        self.assertEqual((out["canetons"], out["streak"]), (2, 2))
        t = out["trophies"]
        self.assertTrue(t["leve_tot"]["ok"])
        self.assertIn("v1.2.0 à 10:12", t["leve_tot"]["detail"])
        self.assertEqual(datetime.fromisoformat(t["leve_tot"]["at"]).astimezone(paris).strftime("%H:%M"), "10:12")  # sa scène joue à l'heure de la MEP
        self.assertEqual(datetime.fromisoformat(t["pas_reopen"]["at"]), start)  # succès du sprint : à son début
        self.assertEqual(datetime.fromisoformat(t["zero_panne"]["at"]).astimezone(paris).strftime("%a %H:%M"), "Mon 08:00")
        self.assertTrue(t["pas_reopen"]["ok"])
        self.assertEqual(t["bavard"], {"ok": False, "progress": "3 / 10"})
        self.assertEqual({k: t["triple"][k] for k in ("ok", "progress")}, {"ok": False, "progress": "2 / 3"})
        self.assertFalse(t["relu_24h"]["ok"])  # aucune PR la semaine dernière : rien à gagner
        self.assertIn("zero_panne", t)
        self.assertNotIn("Pam", json.dumps(out))

    def test_duck_snapshot_without_jira_nor_gh(self):
        out = self.run_script("duck_snapshot.py", {"sprint": None, "velocity": None, "reopens": None}, api=self.kronn(FakeKronn()))
        self.assertEqual((out["target"], out["sprints"], out["canetons"]), (None, [], 0))
        self.assertNotIn("pas_reopen", out["trophies"])
        self.assertTrue(any("gh" in e for e in out["errors"]))

    def test_duck_window_is_the_previous_sprint(self):
        r = self.run_raw("duck_window.py", json.dumps({"startDate": "2026-10-02T14:30:00.000Z", "endDate": "2026-10-16T14:30:00.000Z"}))
        self.assertEqual(r.stdout, '"2026/09/18 16:30", "2026/10/02 16:30"')

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

    def test_office_snapshot_lists_your_actions(self):
        """Fil du Bureau : commentaires posés et questions aux agents du jour ; un run lancé à la main est marqué « man »."""
        cw = "cccccccc-1111-2222-3333-444444444444"
        fake = FakeKronn()
        fake.workflows.append({"id": cw, "name": "Le Bureau · commenter un ticket", "enabled": True, "trigger_type": "manual",
                               "last_run": {"started_at": iso(3), "status": "Success"}})
        fake.runs[cw] = [dict(run_of(950), trigger_context={"type": "manual", "jira_ticket_key": "DM-7", "comment": "Je  regarde\navec Karen"})]
        fake.runs[AGENT_WF][1]["trigger_context"] = {"type": "manual"}
        fake.disc_details["d2"] = {"messages": [{"content": f"Tu es l'agent du Bureau qui fait tourner le workflow Kronn d'id {AGENT_WF}. "
                                                           "Michael te pose une question.\n2. Réponds à cette question : Pourquoi tu échoues ?\n\nRègles"}]}
        out = self.run_script("office_snapshot.py", api=self.kronn(fake), workflows=FIXTURE["workflows"],
                              actions=dict(FIXTURE["actions"], comment=cw))
        self.assertEqual(out["actions"], [
            {"k": "comment", "at": fake.runs[cw][0]["started_at"], "ok": True, "key": "DM-7", "txt": "Je regarde avec Karen"},
            {"k": "ask", "at": fake.discussions[1]["created_at"], "wf": AGENT_WF, "q": "Pourquoi tu échoues ?"}])
        self.assertEqual([r.get("man") for r in out["runs"] if r["wf"] == AGENT_WF].count(1), 1)
        self.assertNotIn(cw, {r["wf"] for r in out["runs"]})  # une action du Bureau n'est pas un agent

    def test_absence_month_names_the_sheet(self):
        """Feuille du mois sans accents, sans retour à la ligne ; en décembre, le mois suivant reste decembre."""
        out = subprocess.run([sys.executable, os.path.join(ROOT, "workflows", "absence_month.py"), "0"], capture_output=True, text=True,
                             env=dict(os.environ, BUREAU_CONFIG=os.path.join(ROOT, "tests", "fixtures", "bureau.config.json"), **CLOCK)).stdout
        months = ("janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre")
        self.assertEqual(out, months[NOW.astimezone(ZoneInfo("Europe/Paris")).month - 1])

    def test_absences_snapshot_reads_the_planning(self):
        """Planning Excel (values de Graph) -> présence par demi-journée des gens du roster, jamais la raison."""
        paris = NOW.astimezone(ZoneInfo("Europe/Paris")).date()
        mon = paris - timedelta(days=paris.weekday()) + timedelta(days=7 if paris.weekday() >= 5 else 0)
        days = [mon + timedelta(days=i) for i in range(5)]
        serial = lambda d: (d - datetime(1899, 12, 30).date()).days  # noqa: E731
        sheet = [["numero jour semaine", ""] + [""] * 5,
                 ["férié", ""] + [False, False, True, False, False],
                 ["Nom Prénom", "Total travaillé"] + [serial(d) for d in days],
                 ["Dev Front Office", ""] + [""] * 5,
                 ["Beesly Pam", 20, "D", "C", "", "AM", "M"], ["", "", "T", "", "", "", ""],
                 ["Halpert Jim", 20, "D", "PM", "", "D", "D"], ["", "", "", "TPM", "", "TAM", "AT"],
                 ["Scott Michael", 20, "D", "D", "", "D", "D"], ["", "", "", "", "", "", ""]]
        out = self.run_script("absences_snapshot.py", stdin={"now": sheet, "next": None},
                              planning_names={"p_pam": "Pam Beesly", "p_jim": "Jim Halpert"})
        iso = [d.isoformat() for d in days]
        self.assertEqual(out["days"][:5], iso)
        self.assertEqual(len(out["days"]), 10)
        self.assertEqual(out["ferie"], [iso[2]])
        self.assertEqual(out["people"]["p_pam"], {iso[0]: "tt", iso[1]: "aa", iso[3]: "ba", iso[4]: "aa"})  # C et M : « absent »
        self.assertEqual(out["people"]["p_jim"], {iso[0]: "bb", iso[1]: "at", iso[3]: "tb", iso[4]: "tt"})
        self.assertNotIn("p_michael", out["people"])  # pas dans le roster de la config : pas publié
        self.assertNotIn("M", json.dumps(out["people"]))

    def test_office_snapshot_stays_under_100k(self):
        paris = NOW.astimezone(ZoneInfo("Europe/Paris"))
        if paris.hour * 60 + paris.minute < 3 * 60 + 10:
            self.skipTest("entre minuit et 3h10 à Paris, aucun run du jour n'est fini depuis plus de 3 h")
        fake = FakeKronn(runs_per_wf=400, steps=6)
        for r in fake.runs[AGENT_WF]:  # du jour (heure de Paris) et finis il y a plus de 3 h : leurs étapes peuvent partir
            r["started_at"] = r["finished_at"] = paris.replace(hour=0, minute=5).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
            r["step_results"][1]["step_kind"] = "Gate"
        out = self.run_script("office_snapshot.py", api=self.kronn(fake))
        self.assertEqual(len(out["runs"]) + out["truncated"], 400)
        self.assertIn("Failed", {r["status"] for r in out["runs"]})  # un échec n'est jamais retiré
        # l'étape Gate reste : la page en tire tes validations et leur durée d'attente
        self.assertTrue(all([s["k"] for s in r["steps"]] == ["Gate"] for r in out["runs"] if r["status"] == "Success"))

    def test_live_snapshot(self):
        out = self.run_script("live_snapshot.py", api=self.kronn(FakeKronn()))
        self.assertEqual({r["wf"] for r in out["runs"]}, {AGENT_WF})
        self.assertEqual([d["id"] for d in out["discussions"]], ["d1"])
        self.assertEqual(out["deploys"], {"staging": {}, "prod": {}})  # sans gh : aucun déploiement, pas d'erreur

    def gh_calls(self):
        p = os.path.join(self.tmp, "gh.json.calls")
        return open(p).read().count("\n") if os.path.exists(p) else 0

    def test_live_snapshot_reads_deploys_with_an_etag(self):
        paris = NOW.astimezone(ZoneInfo("Europe/Paris"))
        if paris.hour == 0 and paris.minute < 4:
            self.skipTest("juste après minuit à Paris, un déploiement d'il y a 3 min date de la veille")
        done = {"status": "completed", "conclusion": "success", "createdAt": iso(3), "updatedAt": iso(2),  # du jour, même tôt
                "displayTitle": "Deploy 17.2.0", "url": "https://x/r/1", "by": "pambeesly"}
        self.fake_gh({"staging": [done], "prod": [done]})
        api = self.kronn(FakeKronn())
        out = self.run_script("live_snapshot.py", api=api)
        self.assertEqual(out["deploys"]["prod"]["17.2.0"]["conclusion"], "success")
        self.assertEqual(out["deploys"]["prod"]["intranet 17.2.0"]["project"], "intranet")  # autre dépôt suivi (github.deploys)
        self.assertIsNone(out["deploys"]["prod"]["17.2.0"]["project"])  # dépôt principal : la version seule
        self.assertEqual(out["deploys"]["prod"]["intranet 17.2.0"]["by"], "pambeesly")  # qui a lancé le déploiement
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

    # ---------- écran du boss : ses autres pages Kronn ----------
    def boss_pages(self, img_kb=1):
        fake = FakeKronn()
        page = lambda pid, title: {"id": pid, "slug": pid, "title": title, "current_revision_id": "r1", "data_revision": 3,
                                   "last_published_at": iso(30), "updated_at": iso(90), "datasets": [], "revision": {"html": "<p>x</p>"}}
        fake.pages = {"pa": page("pa", "Veille techno"), "pb": page("pb", "Core Web Vitals")}
        cache = os.path.join(self.tmp, ".cache", "pixel-bureau", "thumbs")
        os.makedirs(cache)
        img = "data:image/jpeg;base64," + "A" * (img_kb * 1024)
        for pid, key in (("pa", "r1:3"), ("pb", "r0:1"), ("old", "r1:1")):  # pb : miniature périmée ; old : page retirée de la liste
            json.dump({"key": key, "img": img}, open(os.path.join(cache, pid + ".json"), "w"))
        return fake, cache, img

    def test_pages_snapshot_order_cache_and_missing_pages(self):
        fake, cache, img = self.boss_pages()
        out = self.run_script("pages_snapshot.py", api=self.kronn(fake), boss_pages=["pa", "gone", "pb"], chrome=False)
        self.assertEqual([p["id"] for p in out["pages"]], ["pa", "pb"])  # ordre de la config, page supprimée sautée
        pa, pb = out["pages"]
        self.assertEqual((pa["title"], pa["img"]), ("Veille techno", img))  # page inchangée : miniature du cache
        self.assertIsNone(pb["img"])  # page changée et pas de Chrome : pas d'image (jamais l'ancienne)
        self.assertEqual(pa["updated"], fake.pages["pa"]["last_published_at"])
        self.assertEqual(sorted(os.listdir(cache)), ["pa.json", "pb.json"])  # cache de la page retirée supprimé

    def test_pages_snapshot_stays_under_exec_limit(self):
        fake, cache, img = self.boss_pages(img_kb=60)
        json.dump({"key": "r1:3", "img": img}, open(os.path.join(cache, "pb.json"), "w"))
        api = self.kronn(fake)
        out = self.run_script("pages_snapshot.py", api=api, boss_pages=["pa", "pb"], chrome=False)
        self.assertEqual([bool(p["img"]) for p in out["pages"]], [True, False])  # la dernière image saute d'abord
        self.assertEqual(self.run_script("pages_snapshot.py", api=api, chrome=False)["pages"], [])  # sans boss_pages

    # ---------- cartes GitFut des fiches ----------
    def test_gitfut_cache_of_the_day_bad_login_and_unreachable_site(self):
        from datetime import datetime
        from zoneinfo import ZoneInfo
        cache = os.path.join(self.tmp, ".cache", "pixel-bureau", "gitfut")
        os.makedirs(cache)
        today = NOW.astimezone(ZoneInfo("Europe/Paris")).strftime("%Y-%m-%d")
        kept = {"login": "pam", "img": "data:image/jpeg;base64,QUJD", "desc": "Pam scouted on GitFut: 80 OVR ST."}
        json.dump({"day": today, "card": kept}, open(os.path.join(cache, "pam.json"), "w"))
        json.dump({"day": "2020-01-01", "card": kept}, open(os.path.join(cache, "old.json"), "w"))  # périmée : refetch
        out = self.run_script("gitfut_snapshot.py", gitfut={"p_pam": "Pam", "p_old": "old", "p_bad": "../etc"},
                              gitfut_base="http://127.0.0.1:9", wiki_posters=["Five_(2016_film)"], wiki_base="http://127.0.0.1:9")  # injoignables
        self.assertEqual(out["cards"], {"p_pam": kept})
        self.assertEqual(out["posters"], {})  # affiche introuvable : pas d'image, pas d'erreur  # carte du jour reprise du cache ; le reste est sauté sans planter

    def test_payroll_and_gates_ignore_bureau(self):
        api = self.kronn(FakeKronn())
        pay = self.run_script("payroll_snapshot.py", api=api)
        self.assertEqual([a["wf"] for a in pay["agents"]], [AGENT_WF])
        self.assertEqual(pay["rate_usd_per_mtok"], 5.0)
        gates = self.run_script("gates_snapshot.py", api=api)
        self.assertEqual([w["wf"] for w in gates["workflows"]], [AGENT_WF])
        self.assertEqual([w["wf"] for w in gates["askable"]], [AGENT_WF])

    def test_gates_relaunch_skips_workflows_waiting_for_input(self):
        """« Relancer » lance sans variables : pas de bouton pour un workflow qui attend une saisie obligatoire (Réestimer)."""
        fake = FakeKronn()
        now = iso(2)
        ids = {k: f"{k * 8}-1111-2222-3333-444444444444" for k in "bcde"}
        for k, name in (("b", "Réestimer"), ("c", "Sans source"), ("d", "Saisie facultative"), ("e", "Variable fournie")):
            fake.workflows.append({"id": ids[k], "name": name, "enabled": True, "trigger_type": "manual", "last_run": {"started_at": now, "finished_at": now, "status": "Success"}})
        fake.variables = {
            ids["b"]: [{"name": "ticketKey", "required": True, "source": "user_input"}, {"name": "raison", "source": "user_input"}],
            ids["c"]: [{"name": "x", "required": True}],
            ids["d"]: [{"name": "notes", "required": False, "source": "user_input"}],
            ids["e"]: [{"name": "repo", "required": True, "source": "config"}],
        }
        gates = self.run_script("gates_snapshot.py", api=self.kronn(fake))
        self.assertEqual([w["name"] for w in gates["workflows"]], ["Revue de PR", "Saisie facultative", "Variable fournie"])
        self.assertIn(ids["b"], [w["wf"] for w in gates["askable"]])  # on peut toujours l'interroger sur ses runs

    # ---------- le canard ----------
    def duck_discs(self, fake):
        days = lambda n: iso(n * 24 * 60)  # noqa: E731
        fake.discussions += [
            {"id": "k1", "title": "🦆 Le menu casse", "project_id": "p1", "updated_at": days(1), "created_at": days(1), "pending_question_count": 2},
            {"id": "k2", "title": "🦆 EW-1234", "project_id": None, "updated_at": iso(5), "created_at": iso(5)},
            {"id": "k3", "title": "🦆 Trop vieux", "project_id": "p1", "updated_at": days(20), "created_at": days(20)},
            {"id": "k4", "title": "🦆 Archivé", "project_id": "p1", "updated_at": iso(5), "created_at": iso(5), "archived": True},
        ] + [{"id": f"m{i}", "title": f"🦆 n° {i}", "project_id": "p1", "updated_at": days(2), "created_at": days(2)} for i in range(20)]

    def test_gates_lists_projects_and_duck_discussions(self):
        """Dataset gates : projets (« Sans projet » en tête) et discussions du canard (14 jours, 15 au plus, récentes d'abord)."""
        fake = FakeKronn()
        self.duck_discs(fake)
        out = self.run_script("gates_snapshot.py", api=self.kronn(fake))
        self.assertEqual(out["projects"], [{"id": "none", "name": "Sans projet"}, {"id": "p1", "name": "Front"}])
        ducks = out["ducks"]
        self.assertEqual(len(ducks), 15)
        self.assertEqual([d["id"] for d in ducks[:2]], ["k2", "k1"])
        self.assertEqual(ducks[1], {"id": "k1", "title": "🦆 Le menu casse", "project": "Front", "updated": ducks[1]["updated"], "created": ducks[1]["created"], "awaiting": True})
        self.assertEqual((ducks[0]["project"], ducks[0]["awaiting"]), (None, False))
        self.assertFalse({"k3", "k4", "d1", "d2"} & {d["id"] for d in ducks})

    def test_gates_lists_pending_discussion_questions(self):
        """Questions de discussion en attente (14 jours, hors archivées) : simple et formulaire, et une ligne par réponse cliquable."""
        fake = FakeKronn()
        opts = [{"id": "confirm", "label": "Confirmer", "description": None}, {"id": "defer", "label": "Différer", "description": "plus tard"}]
        fake.discussions += [
            {"id": "a1", "title": "Validation de l'audit", "agent": "ClaudeCode", "updated_at": iso(30), "created_at": iso(90), "pending_question_count": 2},
            {"id": "a2", "title": "Vieille", "agent": "ClaudeCode", "updated_at": iso(20 * 24 * 60), "created_at": iso(20 * 24 * 60), "pending_question_count": 1},
            {"id": "a3", "title": "Archivée", "agent": "ClaudeCode", "updated_at": iso(5), "created_at": iso(5), "pending_question_count": 1, "archived": True},
        ]
        q = lambda i, state="pending", items=(): {"id": i, "question": "Que fait-on ?", "context": None, "options": opts, "items": list(items),  # noqa: E731
                                                  "multiple": False, "recommended_option_ids": ["confirm"], "state": state, "created_at": iso(40)}
        fake.questions = {"a1": [q("q1"), q("q2", items=[{"id": "TD-1", "label": "Fiche 1"}]), q("q0", "answered")],
                          "a2": [q("q9")], "a3": [q("q8")]}
        out = self.run_script("gates_snapshot.py", api=self.kronn(fake))
        self.assertEqual([x["id"] for x in out["questions"]], ["q1", "q2"])
        q1, q2 = out["questions"]
        self.assertEqual((q1["disc"], q1["bureau"], q1["rec"], q1["items"]), ("a1", False, ["confirm"], []))
        self.assertEqual(q1["options"][1], {"id": "defer", "label": "Différer", "desc": "plus tard"})
        self.assertEqual(q2["items"], [{"id": "TD-1", "label": "Fiche 1"}])
        self.assertEqual([r["id"] for r in out["qrows"]],
                         ["q1|confirm", "q1|defer", "q1|_text", "q1|_decline", "q2|all:confirm", "q2|all:defer", "q2|_decline"])

    def answer(self, fake, *args):
        """question_answer.py lancé comme l'étape Exec du workflow « réponse » : (code de sortie, sortie, erreur)."""
        cfg_path = os.path.join(self.tmp, "bureau.config.json")
        json.dump(dict(FIXTURE, kronn=dict(FIXTURE["kronn"], api=self.kronn(fake))), open(cfg_path, "w"))
        r = subprocess.run([sys.executable, os.path.join(ROOT, "workflows", "question_answer.py"), *args], capture_output=True, text=True,
                           env={"BUREAU_CONFIG": cfg_path, "HOME": self.tmp, "PATH": self.bin, **CLOCK}, timeout=60)
        self.srv.shutdown()
        self.srv.server_close()
        self.srv = None
        return r.returncode, r.stdout, r.stderr

    def test_question_answer_option_form_text_and_decline(self):
        """Réponse depuis la page : la ligne cliquée (qrows) dit quoi envoyer ; Kronn reçoit option, items ou refus."""
        opts = [{"id": "confirm", "label": "Confirmer"}, {"id": "defer", "label": "Différer"}]
        q = lambda i, items=(): {"id": i, "options": opts, "items": list(items), "state": "pending"}  # noqa: E731
        rows = [{"id": f"{i}|{c}", "q": i, "disc": "a1"} for i, c in
                (("q1", "defer"), ("q2", "all:confirm"), ("q3", "_text"), ("q4", "_decline"), ("q5", "confirm"), ("question:a1:6", "confirm"))]
        fake = FakeKronn()
        fake.datasets = [{"name": "gates", "current": json.dumps({"qrows": rows})}]
        fake.questions = {"a1": [q("q1"), q("q2", [{"id": "TD-1"}, {"id": "TD-2"}]), q("q3"), q("q4"), dict(q("q5"), state="answered"),
                                 q("question:a1:6")]}
        code, out, _ = self.answer(fake, "q1|defer", "dès lundi")
        self.assertEqual((code, out.strip()), (0, "Réponse envoyée : « Différer ». L'agent reprend la discussion."))
        path, body = fake.posts[-1]
        self.assertEqual(path, "/discussions/a1/questions/q1/answer")
        self.assertEqual((body["selected_option_ids"], body["text"]), (["defer"], "dès lundi"))
        self.assertTrue(body["idempotency_key"].startswith("bureau-"))
        self.assertEqual(self.answer(fake, "q2|all:confirm")[0], 0)
        self.assertEqual(fake.posts[-1][1]["item_answers"], [{"item_id": "TD-1", "selected_option_id": "confirm"},
                                                            {"item_id": "TD-2", "selected_option_id": "confirm"}])
        self.assertEqual(self.answer(fake, "q3|_text")[0], 1)  # réponse libre vide : rien d'envoyé
        self.assertEqual(self.answer(fake, "q3|_text", "Ni l'un ni l'autre")[0], 0)
        self.assertEqual(fake.posts[-1][1]["text"], "Ni l'un ni l'autre")
        self.assertEqual(self.answer(fake, "q4|_decline", "hors sujet")[0], 0)
        self.assertEqual(fake.posts[-1], ("/discussions/a1/questions/q4/decline", {"idempotency_key": fake.posts[-1][1]["idempotency_key"], "reason": "hors sujet"}))
        self.assertEqual(self.answer(fake, "question:a1:6|confirm")[0], 0)  # vrai format d'id Kronn
        self.assertEqual(fake.posts[-1][0], "/discussions/a1/questions/question%3Aa1%3A6/answer")
        n = len(fake.posts)
        for bad in ("q5|confirm", "q1|defer", "q9|confirm", "q1|../x"):  # déjà décidée, ligne absente, id invalide
            code, _, err = self.answer(fake, bad)
            self.assertEqual(code, 1, bad)
            self.assertTrue(err.strip(), bad)
        self.assertEqual(len(fake.posts), n)  # rien d'envoyé

    def test_duck_discussions_are_not_visitors(self):
        fake = FakeKronn()
        self.duck_discs(fake)
        api = self.kronn(fake)
        for name in ("office_snapshot.py", "live_snapshot.py"):
            out = self.run_script(name, api=api)
            self.assertEqual([d["id"] for d in out["discussions"]], ["d1"], name)

    def test_duck_start_opens_a_discussion_and_runs_the_agent(self):
        fake = FakeKronn()
        api = self.kronn(fake)
        out = self.run_script("duck_start.py", api=api, args=("none", "Le menu casse sur mobile " + "x" * 80 + "\nDétails : EW-1234"))
        (p1, body), (p2, run) = fake.posts
        self.assertEqual((p1, p2), ("/discussions", "/discussions/dd000001/run"))
        self.assertIsNone(body["project_id"])  # « none » : sans projet
        self.assertTrue(body["title"].startswith("🦆 Le menu casse sur mobile"))
        self.assertLessEqual(len(body["title"]), 72)
        self.assertNotIn("EW-1234", body["title"])  # première ligne seulement
        self.assertEqual((body["agent"], body["language"]), ("ClaudeCode", "fr"))
        self.assertTrue(body["initial_prompt"].startswith("Le menu casse sur mobile"))
        self.assertIn("Détails : EW-1234", body["initial_prompt"])
        self.assertIn("(Discussion ouverte depuis Le Bureau, par le canard.", body["initial_prompt"])
        self.assertIn("idempotency_key", run)
        self.assertEqual(out, {"discussion_id": "dd000001", "url": FIXTURE["kronn"]["ui"] + "#discussion-dd000001"})
        self.run_script("duck_start.py", api=api, args=("p1", "EW-42"))  # un projet : son id tel quel
        self.assertEqual(fake.posts[2][1]["project_id"], "p1")
        self.assertEqual(fake.posts[2][1]["title"], "🦆 EW-42")
        self.run_script("duck_start.py", api=api, args=("p1", "Long détail\nsur plusieurs lignes", "Panier qui ne se vide pas"))
        self.assertEqual(fake.posts[4][1]["title"], "🦆 Panier qui ne se vide pas")  # titre donné : le sujet reste le prompt
        self.assertTrue(fake.posts[4][1]["initial_prompt"].startswith("Long détail"))

    def test_duck_start_refuses_an_empty_topic(self):
        r = subprocess.run([sys.executable, os.path.join(ROOT, "workflows", "duck_start.py"), "none", "  "], capture_output=True, text=True,
                           env={"BUREAU_CONFIG": os.path.join(ROOT, "tests", "fixtures", "bureau.config.json"), "PATH": self.bin, **CLOCK})
        self.assertEqual(r.returncode, 1)
        self.assertIn("canard", r.stderr)

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
        """« defaut » : revenir au plan intégré à la page ; le boss lit si ça change quelque chose."""
        r = self.run_raw("layout_save.py", "defaut")  # Kronn injoignable : publié quand même, message prudent
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIsNone(json.loads(r.stdout)["layout"])
        self.assertIn("il remplace le plan partagé, s'il y en a un", r.stderr)
        fake = FakeKronn()
        fake.datasets = [{"name": "layout", "current": {"layout": None}}]
        self.assertIn("c'est déjà le plan en place : valider ou rejeter ne change rien", self.run_raw("layout_save.py", "defaut", api=self.kronn(fake)).stderr)
        fake.datasets = [{"name": "layout", "current": {"layout": dict(self.PLAN, name="Plateau web")}}]
        self.assertIn("il remplace le plan partagé « Plateau web »", self.run_raw("layout_save.py", "defaut", api=self.kronn(fake)).stderr)


    def test_actions_flat_tickets_and_prs_from_the_team_dataset(self):
        """Dataset actions : tickets et PR à plat (les cartes d'action de Kronn y relisent la clé ou le n° de PR) ;
        la PR d'un ticket = la PR prête qui cite sa clé, plutôt qu'un brouillon ; dataset team en texte JSON."""
        fake = FakeKronn()
        team = {"people": [{"name": "Pam", "tickets": [{"key": "DM-1", "cat": "review"}, {"key": "DM-2", "cat": "todo"}],
                            "prs": [{"n": 7, "keys": ["DM-1"], "draft": True}, {"n": 5, "keys": ["DM-1"]}]}],
                "unassigned": [{"key": "DM-3", "cat": "deploy"}], "other_prs": [{"n": 9, "keys": []}]}
        fake.datasets = [{"name": "team", "current": json.dumps(team)}]
        out = self.run_script("actions_snapshot.py", api=self.kronn(fake), github={"repo": "acme/web"})
        self.assertEqual(out["tickets"], [{"key": "DM-1", "cat": "review", "pr": "5"}, {"key": "DM-2", "cat": "todo", "pr": ""},
                                          {"key": "DM-3", "cat": "deploy", "pr": ""}])
        self.assertEqual(out["prs"], [{"n": "7", "repo": "acme/web"}, {"n": "5", "repo": "acme/web"}, {"n": "9", "repo": "acme/web"}])
        self.assertEqual(self.run_script("actions_snapshot.py")["tickets"], [])  # Kronn injoignable : listes vides


    # ---------- contrat crons -> page (KT-57) ----------
    def fresh_kronn(self, fake):
        """Un faux Kronn par script (le précédent est arrêté) : chaque cron lit l'API comme dans Kronn."""
        if self.srv:
            self.srv.shutdown()
            self.srv.server_close()
            self.srv = None
        return self.kronn(fake)

    def cron_outputs(self):
        """La sortie de chaque script qui écrit un dataset de la page, comme l'écrit son modèle (workflows/templates)."""
        out = {
            "office": self.run_script("office_snapshot.py", api=self.fresh_kronn(FakeKronn())),
            "live": self.run_script("live_snapshot.py", api=self.fresh_kronn(FakeKronn())),
            "gates": self.run_script("gates_snapshot.py", api=self.fresh_kronn(FakeKronn())),
            "payroll": self.run_script("payroll_snapshot.py", api=self.fresh_kronn(FakeKronn())),
            "team": self.run_script("team_shape.py", self.team_input()),
            "duck": self.run_script("duck_snapshot.py", {"sprint": None, "velocity": None, "reopens": None}, api=self.fresh_kronn(FakeKronn())),
            "gitfut": self.run_script("gitfut_snapshot.py", gitfut={"p_pam": "Pam"}, gitfut_base="http://127.0.0.1:9",
                                      wiki_posters=[], wiki_base="http://127.0.0.1:9"),
        }
        fake, _, _ = self.boss_pages()
        out["bosspages"] = self.run_script("pages_snapshot.py", api=self.fresh_kronn(fake), boss_pages=["pa"], chrome=False)
        fake = FakeKronn()
        fake.datasets = [{"name": "team", "current": json.dumps(out["team"])}]
        out["actions"] = self.run_script("actions_snapshot.py", api=self.fresh_kronn(fake), github={"repo": "acme/web"})
        paris = NOW.astimezone(ZoneInfo("Europe/Paris")).date()
        mon = paris - timedelta(days=paris.weekday())
        serial = lambda d: (d - datetime(1899, 12, 30).date()).days  # noqa: E731
        sheet = [["numero jour semaine", ""] + [""] * 5, ["férié", ""] + [False] * 5,
                 ["Nom Prénom", "Total travaillé"] + [serial(mon + timedelta(days=i)) for i in range(5)],
                 ["Beesly Pam", 20, "D", "C", "", "AM", "M"], ["", "", "T", "", "", "", ""]]
        out["absences"] = self.run_script("absences_snapshot.py", stdin={"now": sheet, "next": None}, planning_names={"p_pam": "Pam Beesly"})
        code = "BUREAU1:" + __import__("base64").b64encode(json.dumps({"k": "p_pam", "n": "Pamela", "l": None, "at": 1}).encode()).decode()
        r = self.run_raw("avatar_save.py", code, api=self.fresh_kronn(FakeKronn()))
        self.assertEqual(r.returncode, 0, r.stderr)
        out["avatars"] = json.loads(r.stdout)
        r = self.run_raw("layout_save.py", json.dumps(dict(self.PLAN)), api=self.fresh_kronn(FakeKronn()))
        self.assertEqual(r.returncode, 0, r.stderr)
        out["layout"] = json.loads(r.stdout)
        return out

    def test_contract_page_reads_every_cron_output(self):
        """Ce qu'écrit chaque cron, la page sait le lire : chaque readXxx accepte son dataset, en texte JSON comme en
        objet, et la page démarre sur ces seules données (sans démo). Un champ renommé d'un côté seulement casse ici."""
        outputs = self.cron_outputs()
        self.assertEqual(sorted(outputs), sorted(["office", "live", "gates", "payroll", "team", "duck", "gitfut", "bosspages",
                                                  "actions", "absences", "avatars", "layout"]))  # tous les datasets de la page
        path = os.path.join(self.tmp, "outputs.json")
        with open(path, "w") as fh:
            json.dump(outputs, fh)
        r = subprocess.run(["node", os.path.join(ROOT, "tests", "helpers", "contract.js"), path], capture_output=True, text=True, timeout=120)
        self.assertEqual(r.returncode, 0, r.stderr[-800:])
        res = json.loads(r.stdout)
        for form, readers in res.items():
            bad = {k: v for k, v in readers.items() if v is not True}
            self.assertEqual(bad, {}, f"dataset en {form} : lecteurs qui refusent la sortie de leur cron")
            self.assertGreaterEqual(len(readers), 18, form)  # démarrage + 17 lecteurs

def pil_python():
    """Un Python qui a Pillow : celui des tests, sinon celui du venv du dépôt ; None sinon."""
    for py in (sys.executable, os.path.join(ROOT, ".venv", "bin", "python")):
        if os.path.exists(py) and subprocess.run([py, "-c", "import PIL"], capture_output=True).returncode == 0:
            return py
    return None


class JpegTest(unittest.TestCase):
    """jpeg() du socle : Pillow dans le processus, sinon le Python du venv du dépôt (cas de Kronn : python3 du système)."""
    CODE = ("import sys; sys.path.insert(0, {wf!r}); from _lib import jpeg; "
            "print(jpeg({src!r}, {out!r}, crop=(78, 30, 380, 580), fit=300))")

    def setUp(self):
        self.pil = pil_python()
        if not self.pil:
            self.skipTest("Pillow absent (python3 -m venv .venv && .venv/bin/pip install pillow)")
        self.tmp = tempfile.mkdtemp()
        self.cfg = os.path.join(self.tmp, "bureau.config.json")
        json.dump({**FIXTURE, "root": ROOT}, open(self.cfg, "w"))
        self.src, self.out = os.path.join(self.tmp, "og.png"), os.path.join(self.tmp, "card.jpg")
        subprocess.run([self.pil, "-c", f"from PIL import Image; Image.new('RGB', (1200, 630), (10, 20, 60)).save({self.src!r})"], check=True)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def convert(self, python):
        code = self.CODE.format(wf=os.path.join(ROOT, "workflows"), src=self.src, out=self.out)
        r = subprocess.run([python, "-c", code], capture_output=True, text=True, timeout=60,
                           env={"BUREAU_CONFIG": self.cfg, "PATH": "/usr/bin:/bin", "HOME": self.tmp})
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.stdout.strip(), "True")
        fmt, w, h = subprocess.run([self.pil, "-c", f"from PIL import Image; im = Image.open({self.out!r}); print(im.format, *im.size)"],
                                   capture_output=True, text=True, check=True).stdout.split()
        self.assertEqual((fmt, max(int(w), int(h))), ("JPEG", 300))
        self.assertAlmostEqual(int(w) / int(h), 380 / 580, places=2)  # la carte recadrée, pas l'image entière

    def test_with_pillow(self):
        self.convert(self.pil)

    def test_system_python_without_pillow_uses_the_repo_venv(self):
        py = "/usr/bin/python3"
        if not os.path.exists(os.path.join(ROOT, ".venv", "bin", "python")) or not os.path.exists(py) or \
                subprocess.run([py, "-c", "import PIL"], capture_output=True).returncode == 0:
            self.skipTest("il faut un python3 système sans Pillow et le venv du dépôt")
        self.convert(py)


if __name__ == "__main__":
    unittest.main()
