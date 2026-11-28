"""Lanceur parallèle des tests Python (python3 -m unittest tests/test_unittests.py) : tools/unittests.py prend tous les
tests/test_*.py, signale les échecs et les erreurs avec leur sortie, tait celle des tests verts, sort en 1 sur un rouge."""
import os, subprocess, sys, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import unittests  # noqa: E402

FIXTURE = os.path.join(ROOT, "tests", "fixtures", "unittests_exemple.py")


def run(*args, **env):
    return subprocess.run([sys.executable, os.path.join(ROOT, "tools", "unittests.py"), *args], capture_output=True,
                          text=True, cwd=ROOT, env={**os.environ, "BUREAU_TEST_JOBS": "2", **env}, timeout=120)


class UnittestsTest(unittest.TestCase):
    def test_red_tests_fail_the_run_with_their_output(self):
        p = run(FIXTURE)
        self.assertEqual(p.returncode, 1, p.stderr)
        self.assertIn("FAIL: tests.fixtures.unittests_exemple.Exemple.test_echoue", p.stderr)
        self.assertIn("ERROR: tests.fixtures.unittests_exemple.Exemple.test_erreur", p.stderr)
        self.assertIn("trace du test rouge", p.stderr)
        self.assertIn("RuntimeError: boum", p.stderr)
        self.assertNotIn("bavard mais vert", p.stderr + p.stdout)
        self.assertIn("Ran 4 tests", p.stderr)
        self.assertIn("FAILED (failures=1, errors=1, skipped=1)", p.stderr)

    def test_green_run_exits_zero(self):
        green = os.path.join(ROOT, "tests", "test_vars.py")
        p = run(green)
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertRegex(p.stderr, r"Ran \d+ tests in .*\(2 processus\)")
        self.assertIn("\nOK", p.stderr)

    def test_every_test_file_is_collected(self):
        # la liste en dur de tools/test.sh avait oublié test_habillages.py : le glob prend tout fichier tests/test_*.py
        ids = unittests.collect([os.path.join(ROOT, "tests", f) for f in os.listdir(os.path.join(ROOT, "tests"))
                                 if f.startswith("test_") and f.endswith(".py")])
        self.assertTrue(any(i.startswith("tests.test_habillages.") for i in ids))
        self.assertTrue(any(i.startswith("tests.test_unittests.") for i in ids))
        self.assertEqual(len(ids), len(set(ids)))


if __name__ == "__main__":
    unittest.main()
