"""CI GitHub (.github/workflows) : un nom de branche choisi par l'auteur d'une PR n'est jamais collé dans un script
(il passe par une variable d'environnement), et le checkout ne garde pas le jeton quand rien ne pousse."""
import os, re, unittest
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WF = Path(ROOT, ".github", "workflows")
AUTEUR = re.compile(r"\$\{\{\s*github\.(head_ref|event\.pull_request\.(title|body|head\.ref|head\.label))")


class CiTest(unittest.TestCase):
    def test_branch_names_only_through_env(self):
        for f in sorted(WF.glob("*.yml")):
            for n, line in enumerate(f.read_text().splitlines(), 1):
                if AUTEUR.search(line):
                    self.assertRegex(line, r"^\s+[A-Z_]+:\s*\$\{\{", f"{f.name}:{n} : valeur de l'auteur hors d'une variable d'env")

    def test_checkout_without_kept_token(self):
        for name in ("tests.yml", "visual-refs.yml"):
            self.assertIn("persist-credentials: false", (WF / name).read_text(), name)
        self.assertIn("ref: ${{ github.event.pull_request.head.sha }}", (WF / "visual-refs.yml").read_text())


if __name__ == "__main__":
    unittest.main()
