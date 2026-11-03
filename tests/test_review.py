"""Revue de PR en postes (python3 -m unittest tests/test_review.py) : workflows/review.py tel que Kronn le lance (python3
-c, config injectée), dans une copie de travail jetable : diff annoté, contexte de la revue et saut au head déjà relu,
consigne de chaque poste, saut de la passe sécurité, rapports rangés, coût d'une revue regroupé en une ligne."""
import copy, json, os, shutil, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
sys.path.insert(0, os.path.join(ROOT, "workflows"))
import templates  # noqa: E402

BASE = json.loads(Path(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json")).read_text())
PATCH = "\n".join(["@@ -10,3 +10,4 @@ def f():", " a = 1", "-b = 2", "+b = 3", "+c = 4", " return a"])


def git(*a, cwd):
    subprocess.run(["git", *a], cwd=cwd, check=True, capture_output=True)


class ReviewTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.wt = os.path.join(self.tmp, ".kronn", "pr-12")
        os.makedirs(os.path.join(self.wt, "docs"))
        Path(self.wt, "docs", "AGENTS.md").write_text("# Règles\nTests obligatoires.\n")
        git("init", "-q", cwd=self.wt)
        git("-c", "user.email=a@b", "-c", "user.name=a", "commit", "-q", "--allow-empty", "-m", "x", cwd=self.wt)
        self.head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=self.wt, capture_output=True, text=True).stdout.strip()
        Path(self.tmp, ".kronn", "current_task.json").write_text(json.dumps({"number": 12, "repo": "dm/site", "author": "jim"}))

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def run_(self, *args, stdin="", cfg=None, env=None):
        code = templates.script_code("workflows/review.py", cfg or {**copy.deepcopy(BASE), "review": {"guidelines": "Tutoie l'auteur."}})
        return subprocess.run([sys.executable, "-c", code, *args], cwd=self.tmp, input=stdin, capture_output=True, text=True,
                              env={**os.environ, **(env or {})})

    def ctx(self, reviews=()):
        files = [{"filename": "src/f.py", "status": "modified", "additions": 2, "deletions": 1, "patch": PATCH},
                 {"filename": "big.min.js", "status": "added", "additions": 9000, "deletions": 0}]
        comments = [{"id": 5, "user": {"login": "pam"}, "body": "ok ?"}, {"id": 6, "in_reply_to_id": 5, "user": {"login": "bot"}}]
        return self.run_("contexte", "12", "bot", stdin=json.dumps({"reviews": list(reviews), "comments": comments, "files": files}))

    def test_annotated_diff_gives_each_line_its_side(self):
        import review
        self.assertEqual(review.annotate(PATCH).split("\n")[1:], ["R10 a = 1", "L11-b = 2", "R11+b = 3", "R12+c = 4", "R13 return a"])

    def test_context_states_and_annotated_diff(self):
        Path(self.tmp, ".kronn", "review-12").mkdir(parents=True)
        Path(self.tmp, ".kronn", "review-12", "lecture.md").write_text("rapport d'une revue d'avant")
        r = self.ctx([{"user": {"login": "bot"}, "body": "## 💬\n\n— 🤖 *Review automatique · Le Bureau*", "commit_id": "vieux"}])
        self.assertEqual(r.returncode, 0, r.stderr)
        for line in ("---STATE:is_own=false---", "---STATE:diff_files=2---", "---STATE:diff_add=9002---", "---STATE:diff_del=1---",
                     "---STATE:review_pass=2---"):
            self.assertIn(line, r.stdout)
        self.assertRegex(r.stdout, r"---STATE:run_at=\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z---")  # UTC, comme {{time.now|tz:UTC}}
        ctx = Path(self.wt, ".review-context.json").read_text()
        self.assertTrue(ctx.startswith("DIFF_FILES:\nsrc/f.py\nbig.min.js\n---REVIEWS---"))
        self.assertIn("---ANSWERED_ROOTS---\n[5]", ctx)
        self.assertIn("---PROJECT_CONVENTIONS---\n### docs/AGENTS.md\n# Règles", ctx)
        d = Path(self.tmp, ".kronn", "review-12")
        self.assertFalse((d / "lecture.md").exists())  # dossier vidé : jamais le rapport d'une revue d'avant
        diff = (d / "diff.md").read_text()
        self.assertIn("### src/f.py (modified, +2 -1)\n```diff\n@@ -10,3 +10,4 @@ def f():\nR10 a = 1\nL11-b = 2", diff)
        self.assertIn("### big.min.js (added, +9000 -0)\n```diff\n(diff absent de l'API", diff)

    def test_already_reviewed_at_head_exits_5_with_its_marker(self):
        r = self.ctx([{"user": {"login": "bot"}, "body": "— 🤖 *Review automatique · Le Bureau*", "commit_id": self.head}])
        self.assertEqual(r.returncode, 5)
        self.assertTrue(Path(self.tmp, ".kronn", "skip-12").exists())
        self.assertFalse(Path(self.wt, ".review-context.json").exists())
        manual = self.ctx([{"user": {"login": "bot"}, "body": "Une réponse à la main", "commit_id": self.head}])
        self.assertEqual(manual.returncode, 0, manual.stderr)  # une review à la main au head ne compte pas

    def test_each_poste_opens_with_the_cost_header_and_reads_the_context(self):
        self.ctx()
        r = self.run_("poste", "contexte", "12", "dm/site")
        self.assertTrue(r.stdout.startswith("Review la PR #12 (`dm/site`) · poste contexte\n"), r.stdout[:80])
        self.assertIn("Tutoie l'auteur.", r.stdout)
        self.assertIn("`Sécurité : oui` ou `Sécurité : non`", r.stdout)
        self.assertNotIn("## Format", r.stdout)
        self.assertEqual(self.run_("rapport", "contexte", "12", stdin="Sens : x\nSécurité : non").returncode, 0)
        lecture = self.run_("poste", "lecture", "12", "dm/site").stdout
        self.assertIn("## Rapport du poste 🗺 contexte\nSens : x", lecture)
        self.assertIn("R<ligne>", lecture)
        self.assertIn("docs/AGENTS.md", self.run_("poste", "docs", "12", "dm/site").stdout)
        self.assertNotEqual(self.run_("poste", "inconnu", "12", "dm/site").returncode, 0)
        self.assertNotEqual(self.run_("rapport", "lecture", "12", stdin="  ").returncode, 0)  # rien rendu : en échec

    def test_security_pass_skipped_only_when_the_context_says_no(self):
        self.ctx()
        self.run_("rapport", "contexte", "12", stdin="Sécurité : oui")
        self.assertEqual(self.run_("poste", "securite", "12", "dm/site").returncode, 0)
        self.run_("rapport", "contexte", "12", stdin="**Sécurité** : non")
        self.assertEqual(self.run_("poste", "securite", "12", "dm/site").returncode, 5)
        always = {**copy.deepcopy(BASE), "review": {"securite": "toujours"}}
        self.assertEqual(self.run_("poste", "securite", "12", "dm/site", cfg=always).returncode, 0)
        self.run_("rapport", "contexte", "12", stdin="Sens : rien sur la sécurité")
        self.assertEqual(self.run_("poste", "securite", "12", "dm/site").returncode, 0)  # pas d'avis : dans le doute, la passe

    def test_cost_groups_the_postes_of_one_review_into_one_row(self):
        root = os.path.join(self.tmp, "projects") + "/"
        d = Path(root + "-run-wt")
        d.mkdir(parents=True)

        def sess(name, first, t0, t1, usd, model="claude-sonnet-5"):
            lines = [{"type": "user", "sessionId": name, "timestamp": t0, "message": {"content": first}},
                     {"type": "assistant", "timestamp": t1, "message": {"id": "m", "model": model, "usage": {"input_tokens": 10, "output_tokens": 5}}},
                     {"type": "cost-state", "totalCostUSD": usd, "totalAPIDuration": 1000}]
            (d / (name + ".jsonl")).write_text("\n".join(json.dumps(x) for x in lines))
        sess("s1", "Review la PR #12 (`dm/site`) · poste contexte\n…", "2026-11-03T10:00:00Z", "2026-11-03T10:01:00Z", 0.04, "claude-haiku-4-5")
        sess("s2", "Review la PR #12 (`dm/site`) · poste lecture\n…", "2026-11-03T10:02:00Z", "2026-11-03T10:06:00Z", 0.5, "claude-opus-5-5")
        sess("s3", "Review la PR #12 (`dm/site`) · poste avis. Tu es…", "2026-11-03T10:07:00Z", "2026-11-03T10:09:00Z", 0.1)
        sess("s4", "Review la PR #12 (`dm/site`) en appliquant…", "2026-11-03T15:00:00Z", "2026-11-03T15:02:00Z", 0.7, "claude-opus-5-5")
        sess("x", "Autre chose", "2026-11-03T10:00:00Z", "2026-11-03T10:01:00Z", 9)
        r = self.run_("couts", "/run/wt", env={"REVIEW_SESSIONS_ROOT": root, "DRY_RUN": "1"})
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("2 revues, 1.34 $", r.stdout)
        rows = json.loads(r.stdout[:r.stdout.rindex("]") + 1])
        one, old = rows
        self.assertEqual((one["session_id"], one["pr"], one["repo"], one["cost_usd"], one["model"]), ("s1", 12, "dm/site", 0.64, "claude-opus-5-5"))
        self.assertEqual(one["postes"], {"contexte": 0.04, "lecture": 0.5, "avis": 0.1})
        self.assertEqual((one["started_at"], one["session_ms"], one["api_ms"], one["output"]), ("2026-11-03T10:00:00Z", 540000, 3000, 15))
        self.assertEqual((old["session_id"], old["cost_usd"]), ("s4", 0.7))  # une revue d'une seule session : la ligne d'avant
        self.assertNotIn("postes", old)


if __name__ == "__main__":
    unittest.main()
