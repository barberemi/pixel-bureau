"""Commandes de vérification (workflows/_checks.py) : les noms de fichiers et la branche de base viennent de la PR ;
cités pour le shell, ils ne s'exécutent jamais, et un nom ordinaire reste tel quel (les réglages existants marchent)."""
import os, shutil, sys, tempfile, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "workflows"))
from _checks import check_fill, check_run  # noqa: E402

PIEGES = ["a;touch PWNED1;.php", "b$(touch PWNED2).php", "c`touch PWNED3`.php", "d e.php", "f'g.php"]


class ChecksTest(unittest.TestCase):
    def setUp(self):
        self.wt = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.wt)
        for f in PIEGES + ["app/ok.php"]:
            os.makedirs(os.path.dirname(os.path.join(self.wt, f)) or self.wt, exist_ok=True)
            open(os.path.join(self.wt, f), "w").close()

    def test_a_hostile_file_name_never_runs(self):
        out = os.path.join(self.wt, "vu.txt")
        check_run([f"printf '%s\\n' {{php}} {{base}} > {out}"], PIEGES, self.wt, base="x;touch PWNED4")
        for n in range(1, 5):
            self.assertFalse(os.path.exists(os.path.join(self.wt, f"PWNED{n}")), f"PWNED{n} : le nom s'est exécuté")
        with open(out) as f:
            self.assertEqual(f.read().splitlines(), PIEGES + ["x;touch PWNED4"], "chaque nom arrive entier, comme un seul argument")

    def test_ordinary_names_and_paths_stay_as_written(self):
        cmd, _ = check_fill("phpstan -c {worktree}/x.neon {php} --base {base}", ["app/ok.php"], self.wt, base="main")
        self.assertEqual(cmd, f"phpstan -c {self.wt}/x.neon app/ok.php --base main")
        cmd, _ = check_fill("ls {main}/vendor", [], self.wt, main="")
        self.assertEqual(cmd, "ls /vendor", "sans dossier local : vide, comme avant")


if __name__ == "__main__":
    unittest.main()
