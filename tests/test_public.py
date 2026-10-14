"""Dépôt public, KT-63 (python3 -m unittest tests/test_public.py) : rien de l'équipe d'origine dans l'arbre (son nom,
ses adresses), et les fichiers attendus d'un dépôt public sont là. Les noms réels vivent dans les packs d'équipe privés."""
import os, subprocess, unittest
from pathlib import Path

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
        sec = Path(os.path.join(ROOT, "SECURITY.md")).read_text()
        self.assertIn("security/advisories/new", sec)  # signalement privé, jamais une issue publique


    def test_license_and_credits(self):
        """KT-29 : AGPL 3.0 à la racine ; chaque fichier LPC embarqué (sprites/lpc_used.json) a son calque dans
        CREDITS.md, qui est à jour (python3 sprites/credits.py --check, quand le CSV du générateur est en cache)."""
        import json
        self.assertIn("GNU AFFERO GENERAL PUBLIC LICENSE", Path(os.path.join(ROOT, "LICENSE")).read_text())
        credits = Path(os.path.join(ROOT, "CREDITS.md")).read_text(encoding="utf-8")
        sys_path = os.path.join(ROOT, "sprites")
        import sys
        sys.path.insert(0, sys_path)
        import credits as cr
        used = json.loads(Path(os.path.join(sys_path, "lpc_used.json")).read_text())
        self.assertGreater(len(used), 100)
        missing = sorted({cr.asset(p) for p in used if f"| `{cr.asset(p)}` |" not in credits})
        self.assertEqual(missing, [])
        for s in ("Press Start 2P", "AGPL 3.0", "Planches fournies", "Personnages"):
            self.assertIn(s, credits)
        self.assertNotIn("à relever", credits)  # chaque planche fournie a ses calques (sprites/heralds.py)
        for name in cr.heralds.RECIPES:
            self.assertIn(f"`sprites/common/{name}/`, recette", credits)
        if os.path.exists(cr.CSV):  # en local : CREDITS.md doit correspondre aux calques utilisés
            self.assertEqual(cr.main(["--check"]), 0)


if __name__ == "__main__":
    unittest.main()
