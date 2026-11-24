"""Habillages publics (python3 -m unittest tests/test_habillages.py) : chaque plan du dépôt dans chaque thème du dépôt a
sa capture dans la galerie de guide/habillages.md (tools/shots.py --galerie), et un plan public ne nomme ni personne ni
équipe (zones de places, enseigne sans texte, thème proposé qui existe)."""
import json, os, sys, unittest
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import assemble, shots  # noqa: E402

GUIDE = Path(os.path.join(ROOT, "guide", "habillages.md")).read_text(encoding="utf-8")


class HabillagesTest(unittest.TestCase):
    def test_gallery_covers_every_plan_and_theme(self):
        names = [n for n, _, _ in shots.galerie()]
        plans = [f[:-5] for f in os.listdir(os.path.join(ROOT, "layouts")) if f.endswith(".json")]
        self.assertEqual(len(names), len(plans) * len(assemble.themes()))
        for n in names:
            self.assertIn(f"(img/habillages/{n}.png)", GUIDE, f"{n} : sa capture manque au tableau de guide/habillages.md")
            self.assertTrue(os.path.isfile(os.path.join(ROOT, "guide", "img", "habillages", n + ".png")),
                            f"{n} : .venv/bin/python tools/shots.py --galerie")
        for t, name in assemble.themes().items():
            self.assertIn(name, GUIDE, f"thème {t} absent du guide des habillages")

    def test_public_plans_name_nobody(self):
        for f in sorted(os.listdir(os.path.join(ROOT, "layouts"))):
            L = json.loads(Path(os.path.join(ROOT, "layouts", f)).read_text())
            self.assertNotIn("seating", L, f)
            for d in L.get("wall") or []:
                if d.get("type") == "sign":
                    self.assertIn(d.get("text") or "", ("", "LE BUREAU"), f"{f} : le nom de l'équipe vient du réglage enseigne")
            if "skin" in L:
                self.assertIn(L["skin"], assemble.themes(), f)

    def test_the_ci_remakes_the_gallery(self):
        wf = Path(os.path.join(ROOT, ".github", "workflows", "visual-refs.yml")).read_text()
        self.assertIn("python3 tools/shots.py --galerie", wf)
        self.assertIn("git add tests/visual guide/img/habillages", wf)

    def test_a_habillage_is_a_theme_and_a_plan_of_the_same_name(self):
        for t in ("darkmode", "newsroom"):
            L = json.loads(Path(os.path.join(ROOT, "layouts", t + ".json")).read_text())
            self.assertEqual((L["id"], L.get("skin", t)), (t, t))
            self.assertIn(t, assemble.themes())


if __name__ == "__main__":
    unittest.main()
