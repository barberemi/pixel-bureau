"""Régression visuelle, KT-57 (python3 -m unittest tests/test_visual.py) : règle de PR « références visuelles changées
=> guide/ changé » (tools/visual.py --guide-rule), sur un petit dépôt git jetable."""
import contextlib, io, os, subprocess, sys, tempfile, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import visual  # noqa: E402


class GuideRuleTest(unittest.TestCase):
    def setUp(self):
        self.repo = tempfile.mkdtemp()
        self.git("init", "-q", "-b", "main")

    def git(self, *a):
        env = dict(os.environ, GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@t", GIT_COMMITTER_NAME="t", GIT_COMMITTER_EMAIL="t@t")
        subprocess.run(["git", "-c", "commit.gpgsign=false", *a], cwd=self.repo, check=True, capture_output=True, env=env)

    def commit(self, files):
        for path, text in files.items():
            os.makedirs(os.path.dirname(os.path.join(self.repo, path)), exist_ok=True)
            with open(os.path.join(self.repo, path), "w") as f:
                f.write(text)
        self.git("add", "-A")
        self.git("commit", "-q", "-m", "x")

    def rule(self):
        with contextlib.redirect_stdout(io.StringIO()) as out:
            code = visual.guide_rule("main", cwd=self.repo)
        return code, out.getvalue()

    def branch(self, files):
        self.git("checkout", "-q", "-b", "pr")
        self.commit(files)

    def test_first_references_need_no_guide(self):
        self.commit({"README.md": "x"})
        self.branch({"tests/visual/references.json": "{}", "tests/visual/plan.png": "a"})
        self.assertEqual(self.rule()[0], 0)

    def test_changed_reference_without_guide_fails(self):
        self.commit({"tests/visual/references.json": "{}", "tests/visual/plan.png": "a"})
        self.branch({"tests/visual/plan.png": "b", "page/src/x.js": "y"})
        code, out = self.rule()
        self.assertEqual(code, 1)
        self.assertIn("tests/visual/plan.png", out)

    def test_changed_reference_with_guide_passes(self):
        self.commit({"tests/visual/references.json": "{}", "tests/visual/plan.png": "a"})
        self.branch({"tests/visual/plan.png": "b", "guide/img/plan.png": "c"})
        self.assertEqual(self.rule()[0], 0)

    def test_no_visual_change_no_guide_needed(self):
        self.commit({"tests/visual/references.json": "{}", "tests/visual/plan.png": "a"})
        self.branch({"tools/x.py": "y"})
        self.assertEqual(self.rule()[0], 0)


if __name__ == "__main__":
    unittest.main()
