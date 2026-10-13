"""Dépôt public, KT-63 (python3 -m unittest tests/test_public.py) : rien de l'équipe d'origine dans l'arbre (son nom,
ses adresses), et les fichiers attendus d'un dépôt public sont là. Les noms réels vivent dans les packs d'équipe privés."""
import os, subprocess, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEAM = "euro" + "news"  # écrit en deux morceaux : ce fichier ne doit pas se trouver lui-même


class PublicTreeTest(unittest.TestCase):
    def grep(self, *pattern):
        r = subprocess.run(["git", "grep", "-n", "-i", *pattern], cwd=ROOT, capture_output=True, text=True)
        return r.stdout.strip()

    def test_no_trace_of_the_original_team(self):
        self.assertEqual(self.grep("-F", TEAM), "")  # ni dans le code, ni dans la doc, ni dans les données de démo
        self.assertEqual(self.grep("-F", "@" + TEAM + "."), "")  # aucune adresse pro

    def test_public_repository_files(self):
        for f in ("README.md", "SECURITY.md", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md"):
            self.assertTrue(os.path.isfile(os.path.join(ROOT, f)), f)
        sec = open(os.path.join(ROOT, "SECURITY.md")).read()
        self.assertIn("security/advisories/new", sec)  # signalement privé, jamais une issue publique


if __name__ == "__main__":
    unittest.main()
