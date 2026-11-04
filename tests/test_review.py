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


FAKE_GH = r'''#!PY
import json, os, sys
a = sys.argv[1:]
d = json.load(open(os.environ["FAKE_GH"])) if os.path.exists(os.environ.get("FAKE_GH", "")) else {}
key = " ".join(a[:2])
out = d.get(key)
if out is None:
    sys.exit(1)
print(out if isinstance(out, str) else json.dumps(out))
'''


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
        # gh de test : jamais GitHub ; réponses par « sous-commande » (pr checks, pr view, api …) dans gh.json, sinon échec
        self.bin = os.path.join(self.tmp, "bin")
        os.makedirs(self.bin)
        Path(self.bin, "gh").write_text(FAKE_GH.replace("#!PY", "#!" + sys.executable))
        os.chmod(os.path.join(self.bin, "gh"), 0o755)
        self.gh = {}

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def run_(self, *args, stdin="", cfg=None, env=None):
        code = templates.script_code("workflows/review.py", cfg or {**copy.deepcopy(BASE), "review": {"guidelines": "Tutoie l'auteur."}})
        Path(self.tmp, "gh.json").write_text(json.dumps(self.gh))
        env = {**os.environ, "PATH": self.bin + os.pathsep + os.environ.get("PATH", ""), "FAKE_GH": os.path.join(self.tmp, "gh.json"), **(env or {})}
        return subprocess.run([sys.executable, "-c", code, *args], cwd=self.tmp, input=stdin, capture_output=True, text=True, env=env)

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
        # chemins absolus, dans la copie de travail du run : jamais à reconstruire sous le dossier du projet
        self.assertRegex(lecture, r"le worktree `/[^`]*%s/\.kronn/pr-12`" % os.path.basename(self.tmp))
        self.assertRegex(lecture, r"`/[^`]*%s/\.kronn/review-12/diff\.md`" % os.path.basename(self.tmp))
        self.assertIn("ne conclus jamais qu'ils manquent", lecture)
        self.assertNotEqual(self.run_("poste", "inconnu", "12", "dm/site").returncode, 0)
        self.assertNotEqual(self.run_("rapport", "lecture", "12", stdin="  ").returncode, 0)  # rien rendu : en échec

    def test_observation_without_agent(self):
        """write_ctx observe la PR sans agent : la CI au head, l'état de fusion, le retard sur la base, les fichiers de
        déploiement ou de config touchés ; une lecture gh en échec : « indisponible », jamais d'échec de l'étape."""
        r = self.ctx()
        self.assertEqual(r.returncode, 0, r.stderr)
        obs = Path(self.tmp, ".kronn", "review-12", "observation.md").read_text()
        self.assertIn("- CI : indisponible", obs)
        self.assertIn("- Déploiement, config ou dépendances touchés : aucun", obs)
        self.gh = {"pr checks": [{"name": "tests", "bucket": "pass"}, {"name": "phpstan", "bucket": "fail"}, {"name": "e2e", "bucket": "pending"}],
                   "pr view": {"mergeable": "CONFLICTING", "mergeStateStatus": "DIRTY", "isDraft": False}, "api repos/dm/site/compare/main..." + self.head: "3"}
        files = [{"filename": f, "status": "modified", "additions": 1, "deletions": 0, "patch": PATCH}
                 for f in ("src/f.py", ".github/workflows/CD_Deploy-PRODUCTION.yaml", "composer.lock", "config/packages/prod/cache.yaml")]
        r = self.run_("contexte", "12", "bot", stdin=json.dumps({"reviews": [], "comments": [], "files": files}))
        self.assertEqual(r.returncode, 0, r.stderr)
        obs = Path(self.tmp, ".kronn", "review-12", "observation.md").read_text()
        self.assertIn("- CI : 1 fail, 1 pass, 1 pending ; en échec : phpstan", obs)
        self.assertIn("- Fusion : ⛔ en conflit avec la base (DIRTY)", obs)
        self.assertIn("- Retard sur main : 3 commit(s)", obs)
        self.assertIn(".github/workflows/CD_Deploy-PRODUCTION.yaml, composer.lock, config/packages/prod/cache.yaml", obs)
        self.assertIn("---OBSERVATION---\n# Observation", Path(self.wt, ".review-context.json").read_text())

    def test_ticket_of_the_pr_read_in_jira(self):
        """La PR (titre, branche, description -> pr.md) donne la clé de son ticket, du projet Jira de l'installation ; le
        ticket lu -> ticket.md (description en texte, commentaires, liens) ; sans clé, Jira en erreur : dit tel quel."""
        self.ctx()
        self.gh = {"pr view": {"title": "[SEO] Fix sitemaps (ABC-1)", "headRefName": "feat/dm-7853-sitemaps", "body": "Corrige DM-9 aussi"}}
        r = self.run_("ticket_cle", "12", "dm/site")
        self.assertEqual(r.stdout, "/rest/api/2/issue/DM-7853", "la clé de la branche, du projet de l'installation (DM), avant la description")
        self.assertIn("# [SEO] Fix sitemaps (ABC-1)\n\nBranche : feat/dm-7853-sitemaps\n\nCorrige DM-9 aussi", Path(self.tmp, ".kronn", "review-12", "pr.md").read_text())
        issue = {"key": "DM-7853", "fields": {"summary": "Fix sitemaps", "status": {"name": "En cours"},
                 "description": "h2. Critères\n* le sitemap des tags répond en 200\n* noindex validé par le produit",
                 "comment": {"comments": [{"author": {"displayName": "Laureen"}, "created": "2026-11-02T10:00:00", "body": "OK pour le noindex"}]},
                 "issuelinks": [{"type": {"outward": "blocks"}, "outwardIssue": {"key": "DM-7854", "fields": {"summary": "Suite"}}}]}}
        out = self.run_("ticket", "12", json.dumps(issue)).stdout
        tk = Path(self.tmp, ".kronn", "review-12", "ticket.md").read_text()
        self.assertTrue(tk.startswith("# DM-7853 · Fix sitemaps\nStatut : En cours"), tk[:80])
        self.assertIn("le sitemap des tags répond en 200", tk)
        self.assertIn("- Laureen, 2026-11-02 : OK pour le noindex", tk)
        self.assertIn("- blocks DM-7854 · Suite", tk)
        self.assertIn("DM-7853", out)
        self.gh = {"pr view": {"title": "Sans ticket", "headRefName": "fix/x", "body": ""}}
        self.assertEqual(self.run_("ticket_cle", "12", "dm/site").stdout, "/rest/api/2/myself")
        self.run_("ticket", "12", json.dumps({"accountId": "x", "displayName": "Moi"}))
        self.assertIn("Pas de ticket Jira", Path(self.tmp, ".kronn", "review-12", "ticket.md").read_text())
        self.run_("ticket", "12", "HTTP 401 on GET")
        self.assertIn("indisponible", Path(self.tmp, ".kronn", "review-12", "ticket.md").read_text())
        # les postes savent où lire, le contexte juge le ticket critère par critère, la lecture suit les valeurs
        lecture = self.run_("poste", "lecture", "12", "dm/site").stdout
        self.assertRegex(lecture, r"`/[^`]*/\.kronn/review-12/pr\.md` \(titre, description\) et `/[^`]*/\.kronn/review-12/ticket\.md`")
        self.assertIn("review-12/observation.md", lecture)
        self.assertIn("Suis chaque valeur modifiée jusqu'à son rendu ou son consommateur", lecture)
        self.assertIn("« bloquant sauf preuve que … »", lecture)
        self.assertIn("`Ticket :`", self.run_("poste", "contexte", "12", "dm/site").stdout)

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


class CronCap(unittest.TestCase):
    def test_six_prs_per_pass_the_rest_waits(self):
        """Six PR au plus par passage du cron : séquentielles, 10 à 25 min chacune, sous la limite de 2 h du run."""
        d = json.load(open(os.path.join(os.path.dirname(__file__), "..", "workflows", "templates", "review_cron.json")))
        fin = next(s for s in d["definition"]["steps"] if s["name"] == "finalize")
        tmp = tempfile.mkdtemp()
        try:
            os.makedirs(os.path.join(tmp, ".kronn"))
            cand = [{"number": n, "baseRef": "main", "author": "pam", "repo": "dm/site", "head": "h%d" % n} for n in range(9)]
            Path(tmp, ".kronn", "prs_candidates.json").write_text(json.dumps(cand))
            r = subprocess.run([fin["exec_command"], *fin["exec_args"][:3], "bot"], cwd=tmp, input=json.dumps({"items": []}),
                               capture_output=True, text=True)
            self.assertIn("9 a reviewer, garde 6, reporte 3", r.stdout)
            self.assertEqual(len(json.load(open(os.path.join(tmp, ".kronn", "prs.json")))), 6)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
