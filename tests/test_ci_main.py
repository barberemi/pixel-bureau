"""tools/ci_main.py (#39) : avant de publier, le dernier run « Tests » de main sur le commit publié. Faux git et faux gh."""
import json, os, subprocess, sys, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import ci_main  # noqa: E402

HEAD = "b0a2e82" + "0" * 33


def fake(head=HEAD, branch="main", dirty="", runs=None, gh_fails=False, no_git=False):
    """subprocess.run simulé : git rev-parse / status, gh run list."""
    def run(cmd, **kw):
        if no_git and cmd[0] == "git":
            return subprocess.CompletedProcess(cmd, 128, "", "not a git repository")
        if cmd[:2] == ["git", "rev-parse"]:
            return subprocess.CompletedProcess(cmd, 0, (branch if "--abbrev-ref" in cmd else head) + "\n", "")
        if cmd[:2] == ["git", "status"]:
            return subprocess.CompletedProcess(cmd, 0, dirty, "")
        if cmd[0] == "gh":
            if gh_fails:
                raise FileNotFoundError("gh")
            return subprocess.CompletedProcess(cmd, 0, json.dumps(runs if runs is not None else []), "")
        raise AssertionError(cmd)
    return run


def r(sha, status="completed", conclusion="success"):
    return {"headSha": sha, "status": status, "conclusion": conclusion}


class CiMainTest(unittest.TestCase):
    def state(self, **kw):
        return ci_main.ci_state(fake(**kw))

    def test_green_on_this_commit(self):
        self.assertEqual(self.state(runs=[r(HEAD)]), ("ok", "tests de main verts sur b0a2e82"))

    def test_red_or_running_is_refused(self):
        st, msg = self.state(runs=[r(HEAD, conclusion="failure")])
        self.assertEqual(st, "stop")
        self.assertIn("échec", msg)
        st, msg = self.state(runs=[r(HEAD, status="in_progress", conclusion="")])
        self.assertEqual(st, "stop")
        self.assertIn("en cours", msg)

    def test_only_this_commit_counts(self):
        """Le dernier run de main vert sur un autre commit ne dit rien de celui qu'on publie."""
        st, msg = self.state(runs=[r("f" * 40), r(HEAD, conclusion="failure")])
        self.assertEqual(st, "stop")
        st, msg = self.state(runs=[r("f" * 40)])
        self.assertEqual(st, "warn")
        self.assertIn("pas encore poussé", msg)

    def test_warnings_only(self):
        self.assertEqual(self.state(gh_fails=True)[0], "warn", "sans gh (collègue sans GitHub) : on publie en le disant")
        self.assertIn("gh indisponible", self.state(gh_fails=True)[1])
        self.assertIn("pas un dépôt git", self.state(no_git=True)[1])
        st, msg = self.state(branch="feat/x", runs=[r("f" * 40)])
        self.assertEqual(st, "warn")
        self.assertIn("branche feat/x, pas main", msg)
        st, msg = self.state(runs=[r(HEAD, conclusion="cancelled")])
        self.assertEqual(st, "warn")
        self.assertIn("annulé", msg)
        st, msg = self.state(runs=[r(HEAD)], dirty=" M page/src/75-tv.js\n M CHANGELOG.md\n")
        self.assertEqual(st, "warn")
        self.assertIn("2 fichier(s) modifié(s)", msg)

    def test_check_refuses_red_unless_override(self):
        said = []
        real = ci_main.ci_state
        ci_main.ci_state = lambda run=None: ("stop", "tests de main en échec (failure) sur b0a2e82")
        try:
            self.assertFalse(ci_main.check([], said.append))
            self.assertIn("--sans-ci", said[-1])
            self.assertTrue(ci_main.check(["page", "--sans-ci"], said.append))
            ci_main.ci_state = lambda run=None: ("warn", "gh indisponible")
            self.assertTrue(ci_main.check([], said.append))
        finally:
            ci_main.ci_state = real


if __name__ == "__main__":
    unittest.main()
