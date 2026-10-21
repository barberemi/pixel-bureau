"""Régression visuelle, KT-57 (python3 -m unittest tests/test_visual.py) : règle de PR « références visuelles changées
=> guide/ changé » (tools/visual.py --guide-rule), sur un petit dépôt git jetable."""
import contextlib, io, os, subprocess, sys, tempfile, unittest
from pathlib import Path

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



class RefsWorkflowTest(unittest.TestCase):
    """.github/workflows/visual-refs.yml : après son commit, le run « Tests » de la PR créé par le push du robot (en
    attente d'approbation, il ne tournerait jamais) est supprimé ; les tests relancés par workflow_dispatch restent."""

    def test_awaiting_approval_run_is_deleted(self):
        wf = Path(os.path.join(ROOT, ".github", "workflows", "visual-refs.yml")).read_text()
        self.assertIn('echo "sha=$sha" >> "$GITHUB_OUTPUT"', wf)  # seulement si un commit a été créé

    def test_commit_is_signed_by_github_never_pushed(self):
        """Le ruleset de main exige des commits signés : le commit du robot est créé par l'API GraphQL
        (createCommitOnBranch, signé par GitHub), jamais par git commit + git push (non signé, il bloquait la PR)."""
        wf = Path(os.path.join(ROOT, ".github", "workflows", "visual-refs.yml")).read_text()
        step = wf[wf.index("- name: Commit signé sur la branche de la PR"):wf.index("- name: Retirer le label")]
        self.assertIn("createCommitOnBranch", step)
        self.assertIn("expectedHeadOid", step)
        self.assertNotIn("git push", step)
        self.assertNotIn("git -c user.name", step)
        step = wf[wf.index("- name: Supprimer le run en attente d'approbation"):]
        self.assertIn("if: steps.commit.outputs.sha != ''", step)
        self.assertIn("head_sha=$SHA&event=pull_request", step)  # jamais le run workflow_dispatch des tests relancés
        self.assertIn('select(.conclusion == "action_required" or .status == "waiting")', step)
        self.assertIn("gh api -X DELETE", step)
        self.assertIn("actions: write", wf)

    def test_relaunched_tests_publish_the_required_status(self):
        """Les tests relancés par workflow_dispatch ne comptent pas dans les contrôles de la PR (merge bloqué, vu sur
        la PR #104) : tests.yml publie leur résultat en statut de commit « tests », le contrôle obligatoire de main."""
        wf = Path(os.path.join(ROOT, ".github", "workflows", "tests.yml")).read_text()
        self.assertIn("statuses: write", wf)
        step = wf[wf.index("- name: Statut « tests » du commit"):]
        self.assertIn("if: always() && github.event_name == 'workflow_dispatch'", step)
        self.assertIn("/statuses/${{ github.sha }}", step)
        self.assertIn("-f context=tests", step)
        self.assertIn("job.status == 'success'", step)


if __name__ == "__main__":
    unittest.main()
