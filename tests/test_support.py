"""Console Support (#62, python3 -m unittest tests/test_support.py) : workflows/support.py avec une fausse CLI claude
(flux stream-json, comme le connecteur Microsoft 365), un faux az, un faux Microsoft Graph et un faux Kronn, sans réseau."""
import json, os, shutil, subprocess, sys, tempfile, threading, unittest
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import templates  # noqa: E402
FIXTURE = json.loads(Path(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json")).read_text())
TOOL = "mcp__claude_ai_Microsoft_365__teams_list_channel_messages"
TOOL_R = "mcp__claude_ai_Microsoft_365__read_resource"
MODEL = "5uppor70-0000-4000-8000-000000000000"
ME = "uid-boss"


def ago(h):
    return (datetime.now(timezone.utc) - timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def msg(i, who, uid, hours, text="Le flux RSS est vide", lm=None, kind="message"):
    return {"id": str(i), "messageType": kind, "from": {"displayName": who, "userId": uid} if who else None,
            "createdDateTime": ago(hours), "lastModifiedDateTime": lm or ago(hours), "webUrl": f"https://teams.example/{i}",
            "bodyPreview": text, "bodyTruncated": False}


# fausse CLI claude : lit la consigne (stdin), note ses arguments, répond par le flux d'un tour où le modèle appelle
# l'outil (une fois pour la liste, une fois par parentMessageId cité) ; FAKE_CLAUDE = {"roots": [...], "replies": {id: [...]}}
FAKE_CLAUDE = r'''#!PY
import json, os, re, sys
d = json.load(open(os.environ["FAKE_CLAUDE"]))
prompt = sys.stdin.read()
with open(os.environ["FAKE_CLAUDE"] + ".calls", "a") as fh:
    fh.write(json.dumps({"argv": sys.argv[1:], "prompt": prompt, "env": os.environ.get("MCP_CONNECTION_NONBLOCKING")}) + "\n")
ev = lambda o: print(json.dumps(o))
ev({"type": "system", "subtype": "init", "tools": d.get("tools", [])})
if d.get("broken"):
    ev({"type": "result", "subtype": "success", "total_cost_usd": 0.001}); sys.exit(0)
calls = [("list", None)] + [("replies", m) for m in re.findall(r'parentMessageId="(\d+)"', prompt)] + \
        [("read", m) for m in re.findall(r'uri="teams:///teams/[^"]*/messages/(\d+)"', prompt)]
uses = [{"type": "tool_use", "id": f"t{i}", "name": ("''' + TOOL + r'''" if k != "read" else "''' + TOOL_R + r'''"),
         "input": {"uri": "teams:///x/messages/" + m} if k == "read" else {"parentMessageId": m} if m else {}} for i, (k, m) in enumerate(calls)]
ev({"type": "assistant", "message": {"content": uses}})
res = []
for i, (k, m) in enumerate(calls):
    items = d["roots"] if k == "list" else d.get("replies", {}).get(m, []) if k == "replies" else [d.get("details", {}).get(m, {"id": m})]
    res.append({"type": "tool_result", "tool_use_id": f"t{i}", "content": [{"type": "text", "text": json.dumps(x)} for x in items]
                + ([{"type": "text", "text": json.dumps({"moreResults": False, "nextCursor": None, "note": "x"})}] if k == "list" else [])})
ev({"type": "user", "message": {"content": res}})
ev({"type": "result", "subtype": "error_max_turns", "total_cost_usd": 0.0051})
'''


class Fake(BaseHTTPRequestHandler):
    """Faux Kronn (/api/…) et faux Graph (/graph/…) dans le même serveur."""
    def log_message(self, *a):
        pass

    def send(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        st = self.server.st
        if self.path.startswith("/graph/me"):
            return self.send({"id": ME, "displayName": "Scott, Michael"})
        if self.path.startswith(f"/api/workflows/{MODEL}/runs"):
            return self.send({"success": True, "data": st["runs"]})
        if self.path == "/api/projects":
            return self.send({"success": True, "data": [{"id": "p1", "name": "site-web", "path": "/repos/site-web"}]})
        self.send({"error": "404"}, 404)

    def do_POST(self):
        st = self.server.st
        body = json.loads(self.rfile.read(int(self.headers.get("content-length") or 0)) or b"null")
        st["posts"].append((self.path, body, self.headers.get("Authorization")))
        if self.path == "/api/discussions":
            return self.send({"success": True, "data": {"id": "disc-1"}})
        if self.path.startswith("/graph/teams/") and self.path.endswith("/replies"):
            return self.send({"id": "reply-1"}, 201)
        self.send({"error": "404"}, 404)


class SupportTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.bin = os.path.join(self.tmp, "bin")
        os.makedirs(self.bin)
        Path(self.bin, "claude").write_text(FAKE_CLAUDE.replace("#!PY", "#!" + sys.executable))
        Path(self.bin, "az").write_text("#!/bin/sh\necho jeton-az\n")
        for f in ("claude", "az"):
            os.chmod(os.path.join(self.bin, f), 0o755)
        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), Fake)
        self.srv.st = {"runs": [], "posts": []}
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.srv.server_port}"
        self.data = {"tools": [TOOL, "mcp__claude_ai_Figma__get_screenshot", "mcp__claude_ai_Microsoft_365__get_me"],
                     "roots": [msg(101, "Beesly, Pam", "uid-pam", 2, "Le flux RSS FR est vide depuis ce matin"),
                               msg(102, "Halpert, Jim", "uid-jim", 30, '<p>404 sur la page <b>just-in</b>&nbsp;!</p> <p>Exemple :'
                                   '<a href="https://site.example/fr/just-in?x=1">https://site.example/fr/just…</a><br />Merci &amp; bravo</p>'),
                               msg(103, None, None, 3, kind="systemEventMessage"),
                               msg(104, "Martin, Angela", "uid-angela", 24 * 9, "Trop vieux")],
                     "replies": {}}

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()
        shutil.rmtree(self.tmp)

    def run_(self, *args, stdin="", models=True):
        Path(self.tmp, "claude.json").write_text(json.dumps(self.data))
        cfg = dict(FIXTURE, kronn=dict(FIXTURE["kronn"], api=self.base + "/api"),
                   support={"name": "Support Scranton", "team": "T1", "channel": "19:canal@thread.tacv2"},
                   **({"models": {"support": MODEL}} if models else {}))
        Path(self.tmp, "cfg.json").write_text(json.dumps(cfg))
        env = {"PATH": self.bin + os.pathsep + "/usr/bin:/bin", "HOME": self.tmp, "BUREAU_CONFIG": os.path.join(self.tmp, "cfg.json"),
               "FAKE_CLAUDE": os.path.join(self.tmp, "claude.json"), "SUPPORT_GRAPH": self.base + "/graph"}
        return subprocess.run([sys.executable, os.path.join(ROOT, "workflows", "support.py"), *args], input=stdin,
                              capture_output=True, text=True, env=env, timeout=60)

    def poll(self):
        r = self.run_("poll")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertLess(len(r.stdout.encode()), 100 * 1024)
        return json.loads(r.stdout)

    def calls(self):
        p = Path(self.tmp, "claude.json.calls")
        return [json.loads(x) for x in p.read_text().splitlines()] if p.exists() else []

    def cache(self):
        return json.loads(Path(self.tmp, ".cache", "pixel-bureau", "support.json").read_text())

    def test_poll_reads_the_channel_through_one_tool_then_only_moved_threads(self):
        d = self.poll()
        self.assertEqual([t["id"] for t in d["threads"]], ["101", "102"], "messages système et fils de plus de 7 jours écartés")
        self.assertEqual([t["state"] for t in d["threads"]], ["new", "new"])
        self.assertEqual(d["threads"][1]["text"], "404 sur la page just-in !\n\nExemple :https://site.example/fr/just-in?x=1\nMerci & bravo",
                         "HTML du message en texte : paragraphes, lien à son adresse complète, entités décodées")
        self.assertEqual((d["ok"], d["cost"], d["me"], d["name"]), (True, 0.0051, "Scott, Michael", "Support Scranton"))
        c = self.calls()[0]
        self.assertEqual(c["env"], "0", "la CLI attend ses connecteurs avant le premier tour")
        a = c["argv"]
        for flag in ("--strict-mcp-config", "--dangerously-skip-permissions"):
            self.assertNotIn(flag, a)
        self.assertEqual(a[a.index("--allowedTools") + 1], TOOL)
        self.assertEqual((a[a.index("--tools") + 1], a[a.index("--max-turns") + 1], a[a.index("--model") + 1]), ("", "1", "haiku"))
        self.assertIn('teamId="T1", channelId="19:canal@thread.tacv2", limit=20', c["prompt"])
        self.assertNotIn("parentMessageId", c["prompt"], "premier relevé : aucun fil connu")
        # second relevé : les autres outils vus au premier sont interdits ; les réponses des fils jamais relus
        self.data["replies"] = {"101": [msg(201, "Beesly, Pam", "uid-pam", 1.5, "Toujours vide"), msg(202, "Schrute, Dwight", "uid-dwight", 1, "Je regarde")],
                                "102": [msg(203, "Scott, Michael", ME, 20, "Corrigé en 17.107.1")]}
        d = self.poll()
        a = self.calls()[1]["argv"]
        banned = next(x for x in a if x.startswith("--disallowedTools="))[len("--disallowedTools="):].split(",")
        self.assertEqual(sorted(banned), ["mcp__claude_ai_Figma__get_screenshot", "mcp__claude_ai_Microsoft_365__get_me"])
        self.assertIn('parentMessageId="101"', self.calls()[1]["prompt"])
        th = {t["id"]: t for t in d["threads"]}
        self.assertEqual((th["101"]["state"], th["101"]["by"], th["101"]["replies"]), ("answered", "Schrute, Dwight", 2),
                         "l'auteur qui relance son fil n'est pas une réponse ; un collègue, si")
        self.assertEqual(th["102"]["state"], "done", "répondu à la main par la personne connectée")
        # troisième relevé : rien n'a bougé, pas de réponses relues
        self.poll()
        self.assertNotIn("parentMessageId", self.calls()[2]["prompt"])

    def test_read_resource_brings_subject_forward_and_check_reaction(self):
        """Message entier (read_resource) des fils qui ont bougé : sujet, message transféré ; ✅ = traité ; l'auteur qui
        relance après la réponse d'un collègue = de nouveau à traiter."""
        self.poll()
        fwd = json.dumps({"originalMessageContent": "<p>Erreur API YouTube 403</p>"})
        self.data["details"] = {"101": {"id": "101", "subject": "Flux RSS FR vide", "body": {"content": "<p>Le flux RSS FR est vide</p>"},
                                        "reactions": [{"reactionType": "✅"}, {"reactionType": "👍"}]},
                                "102": {"id": "102", "body": {"content": "<p>Voir</p>"}, "reactions": [{"reactionType": "custom"}],
                                        "attachments": [{"contentType": "forwardedMessageReference", "content": fwd}]}}
        self.data["replies"] = {"102": [msg(203, "Schrute, Dwight", "uid-dwight", 20, "Je regarde"), msg(204, "Halpert, Jim", "uid-jim", 19, "Toujours KO ?")]}
        d = self.poll()
        self.assertIn('read_resource : uri="teams:///teams/T1/channels/19:canal@thread.tacv2/messages/101"', self.calls()[1]["prompt"])
        th = {t["id"]: t for t in d["threads"]}
        self.assertEqual((th["101"]["state"], th["101"]["subject"], th["101"]["reactions"]), ("resolved", "Flux RSS FR vide", ["✅", "👍"]))
        self.assertEqual((th["102"]["state"], th["102"]["by"]), ("relaunched", "Schrute, Dwight"), "l'auteur relance après la réponse")
        self.assertIn("↪ Message transféré :\nErreur API YouTube 403", th["102"]["text"])

    def test_poll_failure_keeps_threads_and_shows_the_error(self):
        self.poll()
        self.data["broken"] = True
        d = self.poll()
        self.assertFalse(d["ok"])
        self.assertIn("Microsoft 365", d["error"])
        self.assertEqual(len(d["threads"]), 2, "les fils déjà lus restent")

    def test_states_follow_the_investigation_runs(self):
        self.poll()
        tc = lambda m: {"type": "manual", "message_id": m}  # noqa: E731
        self.srv.st["runs"] = [{"id": "r1", "status": "WaitingApproval", "started_at": ago(1), "trigger_context": tc("101"),
                                "step_results": [{"step_name": "open"}, {"step_name": "investigate"}, {"step_name": "gate"}]}]
        self.assertEqual(self.poll()["threads"][0]["state"], "gate")
        self.srv.st["runs"][0].update(status="Failed")
        self.assertEqual(self.poll()["threads"][0]["state"], "ignored", "réponse refusée à la gate")
        self.srv.st["runs"].insert(0, {"id": "r2", "status": "Running", "started_at": ago(0.5), "trigger_context": tc("101"),
                                       "step_results": [{"step_name": "open"}]})
        t = self.poll()["threads"][0]
        self.assertEqual((t["state"], t["run"]["run"]), ("run", "r2"), "le run le plus récent du fil")
        self.srv.st["runs"][0].update(status="Failed")
        self.assertEqual(self.poll()["threads"][0]["state"], "failed", "échec avant la gate : à relancer")

    def test_open_draft_post_the_whole_investigation(self):
        self.poll()
        r = self.run_("open", "999999", "p1", "run-1", "")
        self.assertEqual(r.returncode, 1)
        self.assertIn("Message inconnu", r.stdout)
        r = self.run_("open", "101", "p1", "run-1", "Regarde le cron de 8h")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertTrue(r.stdout.startswith("---STATE:disc=disc-1---\n"), "la même discussion à chaque tour (state.disc)")
        for want in ("Le flux RSS FR est vide", "/repos/site-web", "en lecture seule", "Commentaire de Michael : Regarde le cron de 8h",
                     "🔎 Cause"):
            self.assertIn(want, r.stdout)
        path, body, _ = self.srv.st["posts"][0]
        self.assertEqual((path, body["title"]), ("/api/discussions", "🎧 Pam : Le flux RSS FR est vide depuis ce matin"))
        self.assertEqual(body["project_id"], FIXTURE["kronn"]["project_id"], "la discussion du run est dans son projet (room_id)")
        self.assertIn("Le flux RSS FR est vide", body["initial_prompt"])
        r = self.run_("draft", "run-1", stdin="**🔎 Cause : le cron a échoué à 8h.**\n\n🛠️ Action : relancé à 11h20.\n_Généré de manière automatique 🤖_\n")
        self.assertEqual(r.stdout, "🔎 Cause : le cron a échoué à 8h.\n🛠️ Action : relancé à 11h20.\n", "mention retirée, ajoutée au post")
        r = self.run_("draft", "run-1", stdin="L'agent d'exploration tourne en arrière-plan, j'attends ses résultats.")
        self.assertEqual(r.returncode, 3, "des notes d'avancement ne sont pas une réponse : retour à l'agent (exit_3)")
        self.run_("draft", "run-1", stdin="🔎 Cause : x")
        self.assertEqual(self.cache()["runs"]["run-1"]["version"], 2)
        r = self.run_("post", "run-1", stdin="🔎 Cause : le cron <RSS> a échoué.\n👀 Suivi : on surveille 12h.")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        path, body, auth = self.srv.st["posts"][-1]
        self.assertEqual((path, auth), ("/graph/teams/T1/channels/19%3Acanal%40thread.tacv2/messages/101/replies", "Bearer jeton-az"))
        self.assertEqual(body["body"]["content"], "🔎 <b>Cause</b> : le cron &lt;RSS&gt; a échoué.<br>👀 <b>Suivi</b> : on surveille 12h."
                         "<br><br><em>Généré de manière automatique 🤖</em>")
        t = json.loads(r.stdout)["threads"][0]
        self.assertEqual((t["state"], t["mine"]["text"]), ("done", "🔎 Cause : le cron <RSS> a échoué.\n👀 Suivi : on surveille 12h."))
        self.assertEqual(self.run_("post", "run-1", stdin="encore").returncode, 1, "une seule réponse par fil")
        self.assertEqual(self.run_("open", "101", "p1", "run-2", "").returncode, 1)

    def test_templates_render_only_with_a_channel(self):
        cfg = {k: v for k, v in FIXTURE.items() if k != "support"}
        self.assertTrue(templates.skipped("support", cfg) and templates.skipped("support_poll", cfg))
        cfg["support"] = {"team": "T1", "channel": "19:canal@thread.tacv2"}
        self.assertFalse(templates.skipped("support", cfg) or templates.skipped("support_poll", cfg))
        wf = templates.render(json.loads(Path(ROOT, "workflows", "templates", "support.json").read_text()), cfg)
        steps = {s["name"]: s for s in wf["steps"]}
        self.assertEqual(steps["investigate"]["room_id"], "{{state.disc}}")
        self.assertEqual(steps["gate"]["gate_request_changes_target"], "investigate", "changements : retour à l'agent")
        self.assertTrue(steps["gate"]["gate_message"].startswith("{{steps.draft.data.stdout}}\n\n---\n"), "la page coupe au ---")
        # le dataset support est un vrai objet (sortie JSON d'une étape CollectApiData), jamais le texte d'un stdout : Kronn y
        # relit la ligne cliquée (threads.find(id)) pour la liaison de « Investiguer », sinon « expected an object at threads »
        self.assertNotIn("Agent", steps["investigate"]["agent_settings"]["tools"]["cli"], "aucun agent en arrière-plan")
        self.assertEqual(steps["draft"]["on_result"][0]["action"], {"type": "Goto", "step_name": "investigate"})
        for w in (s for s in wf["steps"] if s["step_type"]["type"] == "PublishPageData"):
            src = w["page_publish"]["writes"][0]["value_from"]
            self.assertTrue(src.endswith(".data.sources.snap"), src)
            self.assertEqual(steps[src.split(".")[1]]["step_type"]["type"], "CollectApiData")
        cron = templates.render(json.loads(Path(ROOT, "workflows", "templates", "support_poll.json").read_text()), cfg)
        self.assertTrue(cron["trigger"]["schedule"].startswith("7-59/15 "))
        self.assertEqual(cron["steps"][1]["page_publish"]["writes"][0]["value_from"], "steps.poll.data.sources.snap")
        self.assertEqual(cron["steps"][0]["step_type"]["type"], "CollectApiData")


if __name__ == "__main__":
    unittest.main()
