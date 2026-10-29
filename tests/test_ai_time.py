"""Estimer le temps gagné par l'IA sur un ticket (#79, python3 -m unittest tests/test_ai_time.py) : le modèle ai_time.json
rendu, puis workflows/ai_time.py étape par étape avec un faux gh (découverte dev-status ou recherche GitHub, garde-fous,
outil et modèle des Co-Authored-By, relecture par un autre modèle, commentaire au gabarit de l'équipe)."""
import copy, json, os, shutil, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import assemble, templates  # noqa: E402

BASE = json.loads(Path(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json")).read_text())
TPL = templates.load_templates()["ai_time"]
CLAUDE = "Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
# gabarit d'une équipe qui commente en anglais (comme le pack d'exemple le ferait)
EN = {"label": "feedback_ia", "lang": "en", "title": "AI Usage Feedback", "tool": "Claude Code", "model": "Claude Opus 4.8",
      "fields": [["Tool used", "{tool}"], ["Model used", "{model}"], ["Were the suggestions challenged by another model?", "{challenged}"],
                 ["What went well", "{went_well}"], ["Time saved (estimate)", "{saved}"], ["What didn't go well", "Nothing"],
                 ["Time lost (estimate)", "No time lost"], ["Confidence in AI output", "4 - Almost perfect"],
                 ["Documentation updated with AI", "No"], ["Additional comments", "{per_pr}"]]}


def cfg(**over):
    c = copy.deepcopy(BASE)
    c["jira"] = {**c["jira"], "config_id": "abcdefab-cdef-abcd-efab-cdefabcdefab"}
    c["github"] = {**c.get("github", {}), "repo": "dm/site", "pr_repos": ["dm/site", "dm/api"]}
    c.update(over)
    return c


FAKE_GH = r'''#!PY
import json, os, sys
from pathlib import Path
a = sys.argv[1:]
d = json.loads(Path(os.environ["FAKE_GH"]).read_text())
with open(os.environ["FAKE_GH"] + ".calls", "a") as fh:
    fh.write(json.dumps(a) + "\n")
if a[:2] == ["pr", "view"]:
    pr = d["prs"].get(a[a.index("-R") + 1] + "#" + a[2])
    if not pr:
        sys.exit(1)
    print(json.dumps(pr)); sys.exit(0)
if a[:2] == ["pr", "diff"]:
    print(d.get("diffs", {}).get(a[a.index("-R") + 1] + "#" + a[2], "")); sys.exit(0)
if a[0] == "api" and "search/issues" in a:
    print(json.dumps({"items": [{"html_url": u} for u in d.get("search", [])]})); sys.exit(0)
sys.exit(1)
'''


def pr(title, state="MERGED", commits=(), body="", reviews=(), url=""):
    return {"title": title, "state": state, "body": body, "url": url, "headRefName": "feat/x", "additions": 40, "deletions": 3,
            "changedFiles": 2, "commits": [{"messageHeadline": h, "messageBody": b} for h, b in commits], "reviews": list(reviews)}


class AiTimeScriptTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.bin = os.path.join(self.tmp, "bin")
        os.makedirs(self.bin)
        gh = os.path.join(self.bin, "gh")
        Path(gh).write_text(FAKE_GH.replace("#!PY", "#!" + sys.executable))
        os.chmod(gh, 0o755)
        self.gh = {"prs": {
            "dm/site#12": pr("feat: DM-7 carrousel", commits=[("feat: carrousel", f"Co-Authored-By: {CLAUDE}"), ("wip", "")],
                             reviews=[{"author": {"login": "copilot-pull-request-reviewer"}, "body": "ok"}]),
            "dm/api#3": pr("fix: DM-7 pagination", body="🤖 Generated with [Claude Code](https://claude.com/claude-code)",
                           reviews=[{"author": {"login": "dm-bot"}, "body": "RAS\n\n🤖 *Review automatique · Le Bureau (ClaudeCode - opus)*"}])},
            "diffs": {"dm/site#12": "diff --git a/src/a.js b/src/a.js\n+const a = 1;\ndiff --git a/package-lock.json b/package-lock.json\n+énorme\n"}}
        self.config = cfg()

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def run_(self, *args, stdin=""):
        Path(self.tmp, "gh.json").write_text(json.dumps(self.gh))
        Path(self.tmp, "cfg.json").write_text(json.dumps(self.config))
        env = {"PATH": self.bin + os.pathsep + "/usr/bin:/bin", "HOME": self.tmp, "BUREAU_CONFIG": os.path.join(self.tmp, "cfg.json"),
               "FAKE_GH": os.path.join(self.tmp, "gh.json")}
        return subprocess.run([sys.executable, os.path.join(ROOT, "workflows", "ai_time.py"), *args], input=stdin,
                              capture_output=True, text=True, env=env, timeout=60)

    def ticket(self, labels=(), points=None, sp=None):
        f = {"summary": "Carrousel", "labels": list(labels), "status": {"name": "Done"}}
        if points is not None:
            f["customfield_99"] = points
        if sp is not None:
            f["customfield_10"] = sp
        return json.dumps({"id": "10042", "key": "DM-7", "fields": f})

    def detail(self, *urls):
        return json.dumps({"detail": [{"pullRequests": [{"url": u, "status": "MERGED"} for u in urls]}]})

    def discover(self, labels=(), detail=None, prs="", force="non", points=None, sp=None):
        stdin = self.ticket(labels, points, sp) + "\n===SEP===\n" + (detail if detail is not None else "null")
        return self.run_("discover", "DM-7", prs, force, "run-1", stdin=stdin)

    def test_instance_key_is_read_in_by_instance_type(self):
        s = {"summary": {"pullrequest": {"overall": {"count": 2},
                                         "byInstanceType": {"GitHub": {"count": 0}, "oAuth-com.github.integration.production": {"count": 2}}}}}
        r = self.run_("instance", stdin=json.dumps(s))
        self.assertEqual((r.returncode, r.stdout), (0, "oAuth-com.github.integration.production"))
        self.assertEqual(self.run_("instance", stdin=json.dumps({"summary": {}})).returncode, 3, "aucune PR liée : recherche GitHub")
        self.assertEqual(self.run_("instance", stdin="pas du json").returncode, 3)

    def test_dev_status_prs_tools_models_and_reviewers(self):
        r = self.discover(detail=self.detail("https://github.com/dm/site/pull/12", "https://github.com/dm/api/pull/3"))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("PR mergées (panneau Development de Jira) : 2", r.stdout)
        self.assertIn("===== PR dm/site#12", r.stdout)
        self.assertIn("+const a = 1;", r.stdout)
        self.assertIn("package-lock.json (fichier généré : diff omis)", r.stdout)
        self.assertNotIn("énorme", r.stdout)
        st = json.loads(Path(self.tmp, ".cache", "pixel-bureau", "ai_time", "run-1.json").read_text())
        self.assertEqual((st["tool"], st["model"], st["challenged"]), ("Claude Code", "Claude Opus 5.5", "Copilot, Claude (revue Kronn)"))
        self.assertEqual([p["id"] for p in st["prs"]], ["dm/site#12", "dm/api#3"])

    def test_github_search_keeps_prs_citing_the_key_in_their_title(self):
        self.gh["search"] = ["https://github.com/dm/site/pull/12", "https://github.com/dm/api/pull/9"]
        self.gh["prs"]["dm/api#9"] = pr("chore: dépendances (voir DM-7 dans la description)".replace("DM-7", "ticket"))
        r = self.discover()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("PR mergées (recherche GitHub) : 1 ; écartées : dm/api#9 (cite seulement DM-7 dans son texte)", r.stdout)
        q = next(c for c in map(json.loads, Path(self.tmp, "gh.json.calls").read_text().splitlines()) if "search/issues" in c)
        self.assertIn('q="DM-7" type:pr repo:dm/site repo:dm/api', q)

    def test_guards_label_already_there_open_pr_no_merged_pr(self):
        url = self.detail("https://github.com/dm/site/pull/12")
        r = self.discover(labels=["temps_gagne_ia"], detail=url)
        self.assertEqual(r.returncode, 3, r.stdout)
        self.assertIn("porte déjà le label temps_gagne_ia", r.stdout)
        self.assertEqual(self.discover(labels=["temps_gagne_ia"], detail=url, force="oui").returncode, 0, "force = oui : reposté")
        self.gh["prs"]["dm/site#13"] = pr("feat: DM-7 suite", state="OPEN")
        r = self.discover(detail=self.detail("https://github.com/dm/site/pull/12", "https://github.com/dm/site/pull/13"))
        self.assertEqual(r.returncode, 5, r.stdout)
        self.assertIn("encore une PR ouverte : dm/site#13", r.stdout)
        self.assertIn("« prs »", r.stdout)
        r = self.discover(detail=self.detail("https://github.com/dm/site/pull/12", "https://github.com/dm/site/pull/13"), prs="dm/site#12")
        self.assertEqual(r.returncode, 0, "liste imposée : exactement ces PR")
        self.gh["prs"]["dm/site#14"] = pr("feat: DM-7 abandon", state="CLOSED")
        r = self.discover(detail=self.detail("https://github.com/dm/site/pull/14"))
        self.assertEqual(r.returncode, 4, r.stdout)
        self.assertIn("dm/site#14 (fermée sans merge)", r.stdout)
        self.assertEqual(self.discover(prs="n'importe quoi").returncode, 2)
        self.assertEqual(self.run_("discover", "DM-7", "", "", "run-1", stdin="null").returncode, 2, "ticket illisible")

    def estimate(self):
        return json.dumps({"prs": [{"pr": "dm/site#12", "without_ai_h": 6, "with_ai_h": 2, "why": "carrousel répétitif"},
                                   {"pr": "dm/api#3", "without_ai_h": 1.5, "with_ai_h": 1, "why": "petite correction"}],
                           "went_well": "Boilerplate of the carousel written in one go", "confidence": "medium"})

    def test_comment_follows_the_team_template_in_english(self):
        self.config = cfg(jira=dict(cfg()["jira"], ai_feedback=EN))
        self.discover(detail=self.detail("https://github.com/dm/site/pull/12", "https://github.com/dm/api/pull/3"))
        r = self.run_("compose", "run-1", self.estimate())
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        out = json.loads(r.stdout)
        self.assertEqual(out["comment"]["body"], "\n".join([
            "*AI Usage Feedback*", "* *Tool used:* Claude Code", "* *Model used:* Claude Opus 5.5",
            "* *Were the suggestions challenged by another model?* Copilot, Claude (revue Kronn)",
            "* *What went well:* Boilerplate of the carousel written in one go",
            "* *Time saved (estimate):* ~4.5h total (without AI ~7.5h, with AI ~3h)", "* *What didn't go well:* Nothing",
            "* *Time lost (estimate):* No time lost", "* *Confidence in AI output:* 4 - Almost perfect",
            "* *Documentation updated with AI:* No", "* *Additional comments:* 2 PR(s): site#12 ~4h, api#3 ~0.5h"]))
        self.assertEqual(out["labels"], {"update": {"labels": [{"add": "feedback_ia"}]}})
        self.assertIn("site#12** feat: DM-7 carrousel : sans IA ~6 h, avec IA ~2 h, gagné ~4 h. carrousel répétitif", out["preview"])
        self.assertIn(out["comment"]["body"], out["preview"], "la validation montre le commentaire tel qu'il sera posté")
        r = self.run_("done", "run-1")
        self.assertIn("label feedback_ia posé", r.stdout)
        self.assertFalse(Path(self.tmp, ".cache", "pixel-bureau", "ai_time", "run-1.json").exists())

    def test_neutral_defaults_in_french_and_default_tool_without_trailers(self):
        self.gh["prs"]["dm/site#12"]["commits"] = []
        self.gh["prs"]["dm/site#12"]["reviews"] = []
        self.discover(detail=self.detail("https://github.com/dm/site/pull/12"))
        r = self.run_("compose", "run-1", json.dumps({"prs": [{"pr": "dm/site#12", "without_ai_h": 3, "with_ai_h": 1.25, "why": "x"}],
                                                      "went_well": "Tests écrits vite", "confidence": "low"}))
        body = json.loads(r.stdout)["comment"]["body"]
        self.assertTrue(body.startswith("*Temps gagné grâce à l'IA*\n* *Outil:* non renseigné\n* *Modèle:* non renseigné\n"
                                        "* *Suggestions relues par un autre modèle ?* Non\n"), body)
        self.assertIn("* *Temps gagné (estimation):* ~1,75 h au total (sans IA ~3 h, avec IA ~1,25 h)", body)
        self.assertIn("* *Confiance dans l'estimation:* faible", body)
        self.config = cfg(jira=dict(cfg()["jira"], ai_feedback={"tool": "Claude Code", "model": "Claude Sonnet"}))
        self.discover(detail=self.detail("https://github.com/dm/site/pull/12"))
        st = json.loads(Path(self.tmp, ".cache", "pixel-bureau", "ai_time", "run-1.json").read_text())
        self.assertEqual((st["tool"], st["model"]), ("Claude Code", "Claude Sonnet"), "sans trailer : valeurs par défaut du réglage")

    def test_nothing_posted_without_a_usable_estimate(self):
        self.discover(detail=self.detail("https://github.com/dm/site/pull/12", "https://github.com/dm/api/pull/3"))
        self.assertEqual(self.run_("compose", "run-1", "{}").returncode, 2)
        partial = json.dumps({"prs": [{"pr": "dm/site#12", "without_ai_h": 1, "with_ai_h": 1, "why": ""}], "went_well": "", "confidence": "low"})
        self.assertEqual(self.run_("compose", "run-1", partial).returncode, 2, "une PR sans estimation : rien n'est posté")
        self.assertEqual(self.run_("compose", "run-2", self.estimate()).returncode, 2, "sans découverte")

    def test_ai_points_story_points_times_the_ai_ratio(self):
        """Points « avec l'IA » (l'effort restant avec l'assistant) : Story Points × heures avec IA / sans IA, en Fibonacci,
        écrits avec le label dans le champ réglé ; une valeur déjà posée est gardée, sauf « Forcer » ; sans Story Points,
        rien."""
        sys.path.insert(0, os.path.join(ROOT, "workflows"))
        old = os.environ.get("BUREAU_CONFIG")
        os.environ["BUREAU_CONFIG"] = os.path.join(ROOT, "tests", "fixtures", "bureau.config.json")
        try:
            import importlib, ai_time
            importlib.reload(ai_time)
        finally:
            os.environ.pop("BUREAU_CONFIG") if old is None else os.environ.__setitem__("BUREAU_CONFIG", old)
        self.assertEqual([ai_time.ai_points(sp, a, b) for sp, a, b in
                          ((5, 14, 4.5), (8, 28, 9), (3, 6, 1.5), (5, 10, 4), (3, 7.5, 2.75), (13, 10, 10), (5, 0, 0), (0.5, 4, 1), (3, 2, 3))],
                         [2, 3, 1, 2, 1, 13, 5, 0.5, 3])
        url = self.detail("https://github.com/dm/site/pull/12", "https://github.com/dm/api/pull/3")
        jira = dict(cfg()["jira"], points_fields=["customfield_10"], ai_feedback={"points": {"field": "customfield_99"}})
        self.config = cfg(jira=jira)
        self.discover(detail=url, sp=5)
        out = json.loads(self.run_("compose", "run-1", self.estimate()).stdout)
        self.assertEqual(out["labels"]["fields"], {"customfield_99": 2}, "5 × 3 h / 7,5 h = 2")
        self.assertIn("**Points avec l'IA : 2** (5 Story Points × 3 h / 7,5 h, champ `customfield_99`)", out["preview"])
        self.discover(detail=url, points=5, sp=5)
        out = json.loads(self.run_("compose", "run-1", self.estimate()).stdout)
        self.assertNotIn("fields", out["labels"], "valeur déjà posée : gardée")
        self.assertIn("non écrits, le ticket en a déjà (5)", out["preview"])
        self.discover(detail=url, points=5, sp=5, force="oui")
        self.assertEqual(json.loads(self.run_("compose", "run-1", self.estimate()).stdout)["labels"]["fields"], {"customfield_99": 2})
        self.discover(detail=url)
        out = json.loads(self.run_("compose", "run-1", self.estimate()).stdout)
        self.assertNotIn("fields", out["labels"], "sans Story Points : rien")
        self.assertIn("non calculés, le ticket n'a pas de Story Points", out["preview"])
        self.config = cfg()
        self.discover(detail=url, sp=5)
        out = json.loads(self.run_("compose", "run-1", self.estimate()).stdout)
        self.assertNotIn("fields", out["labels"], "sans champ réglé : rien d'écrit")
        self.assertNotIn("Points avec l'IA", out["preview"])

    def test_gate_skipped_only_when_asked(self):
        self.assertEqual(self.run_("gate", "non").returncode, 3)
        self.assertEqual(self.run_("gate", "oui").returncode, 0)
        self.assertEqual(self.run_("gate", "").returncode, 0, "par défaut : validation")


class AiTimeTemplateTest(unittest.TestCase):
    def test_points_field_read_with_the_ticket_and_written_with_the_label(self):
        st = lambda c: {s["name"]: s for s in templates.render(TPL, c)["steps"]}  # noqa: E731
        s = st(cfg())
        self.assertEqual((s["ticket"]["api_query"]["fields"], s["label"]["api_query"]["fields"]), ("labels,summary,status", "labels"))
        s = st(cfg(jira=dict(cfg()["jira"], points_fields=["customfield_10"], ai_feedback={"points": {"field": "customfield_99"}})))
        self.assertEqual(s["ticket"]["api_query"]["fields"], "labels,summary,status,customfield_99,customfield_10")
        self.assertEqual(s["label"]["api_query"]["fields"], "labels,customfield_99,customfield_10")

    def test_rendered_zero_token_but_one_agent_and_jumps_to_existing_steps(self):
        d = templates.render(TPL, cfg())
        out = json.dumps(d, ensure_ascii=False)
        self.assertNotIn("@@", out)
        self.assertNotRegex(json.dumps(TPL), r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}", "aucun id Kronn dans le modèle")
        steps = {s["name"]: s for s in d["steps"]}
        self.assertEqual([s["name"] for s in d["steps"] if s["step_type"]["type"] == "Agent"], ["estimate"], "une seule étape IA")
        self.assertEqual(steps["estimate"]["agent_settings"], {"tier": "default", "tools": {"cli": [], "kronn_internal": []}})
        for s in d["steps"]:
            for r in s.get("on_result") or []:
                if r["action"]["type"] == "Goto":
                    self.assertIn(r["action"]["step_name"], steps, s["name"])
            if s["step_type"]["type"] == "ApiCall":
                self.assertEqual(s["api_config_id"], cfg()["jira"]["config_id"], "connexion Jira de l'installation, jamais en dur")
        self.assertEqual(steps["need_gate"]["on_result"], [{"contains": "exit_3", "action": {"type": "Goto", "step_name": "comment"}}])
        self.assertEqual([n for n in steps][-2:], ["done", "stop"], "stop atteinte seulement par un garde-fou")
        self.assertEqual({r["contains"] for r in steps["discover"]["on_result"]}, {"exit_3", "exit_4", "exit_5"})
        self.assertEqual(steps["label"]["api_query"]["returnIssue"], "true")
        self.assertEqual([v["name"] for v in d["variables"]], ["ticket", "prs", "force", "gate"])
        self.assertTrue(d["workspace_config"]["main_tree_read_only"])

    def test_skipped_without_jira_and_proposed_by_the_installer(self):
        self.assertTrue(templates.skipped("ai_time", cfg(jira={})))
        self.assertFalse(templates.skipped("ai_time", cfg()))
        import install
        self.assertIn("ai_time", [k for k, _, _ in install.MODELS])
        self.assertEqual(templates.TEMPLATES["ai_time"][1], ("models", "ai_time"))

    def test_team_template_comes_from_the_pack_and_the_config_overrides_it(self):
        tmp = tempfile.mkdtemp()
        try:
            Path(tmp, "team.json").write_text(json.dumps({"name": "DM"}))
            Path(tmp, "settings.json").write_text(json.dumps({"jira": {"ai_feedback": EN, "create": {"type": "Bug"}, "config_id": "x"}}))
            c = assemble.merged(cfg(team=tmp, jira=dict(cfg()["jira"], ai_feedback={"label": "a_moi"})))
            fb = c["jira"]["ai_feedback"]
            self.assertEqual((fb["label"], fb["lang"], fb["title"]), ("a_moi", "en", "AI Usage Feedback"))
            self.assertEqual(c["jira"]["create"], {"type": "Bug"})
            self.assertEqual(c["jira"]["config_id"], cfg()["jira"]["config_id"], "la connexion reste celle de l'installation")
            self.assertEqual(assemble.merged(c), c, "idempotent")
        finally:
            shutil.rmtree(tmp)


if __name__ == "__main__":
    unittest.main()
