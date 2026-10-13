"""Thèmes d'interface (page/src/theme-<id>.css) : chacun a son nom (« /* @nom: … */ »), toutes ses variables de couleur,
des contrastes WCAG suffisants (tools/theme.py : texte >= 4,5:1 sur ses fonds, blanc >= 4,5:1 sur ses aplats) ; polices
intégrées. Le même contrôle vaut pour le thème d'un pack d'équipe (python3 tools/theme.py check, sa CI)."""
import contextlib, io, os, shutil, sys, tempfile, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import assemble, theme  # noqa: E402


def path(t):
    return os.path.join(assemble.SRC, f"theme-{t}.css")


class ThemeTest(unittest.TestCase):
    def test_every_theme_has_a_name(self):
        self.assertEqual(list(assemble.themes()), ["classique"])  # le dépôt n'a que le Classique : les autres viennent des packs
        for t, name in assemble.themes().items():
            self.assertTrue(name, t)

    def test_contrasts(self):
        for t in assemble.themes():
            v = theme.palette(path(t))
            for key in theme.TEXT + theme.GROUNDS + ("line",):
                self.assertIn(key, v, f"theme-{t}.css : --{key} manquante (couleur #rrggbb)")  # un thème du dépôt définit tout
            errors, _ = theme.check(path(t))
            self.assertEqual(errors, [], t)

    def test_tv_contrasts(self):
        for t in assemble.themes():
            v = theme.tv_palette(path(t))
            if v:
                for key in theme.TV_TEXT + theme.TV_GROUNDS:
                    self.assertIn(key, v, f"theme-{t}.css (mode TV) : --{key} manquante")

    def test_check_a_pack_theme(self):
        """Thème de pack : seules ses couleurs sont vérifiées ; un contraste insuffisant fait échouer la commande."""
        menthe = os.path.join(ROOT, "tests", "fixtures", "pack-exemple", "themes", "theme-menthe.css")
        self.assertEqual(theme.check(menthe), ([], []))
        tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, tmp)
        pale = os.path.join(tmp, "theme-pale.css")
        open(pale, "w").write('/* @nom: Pâle */\n:root[data-skin="pale"]{--bg:#ffffff;--panel:#ffffff;--ink:#bbbbbb}\n'
                              ':root[data-skin="pale"] body.tv{--tv-bg:#000000;--tv-ink:#111111}\n')
        errors, warnings = theme.check(pale)
        self.assertIn("--ink sur --panel : 1.92:1 (minimum 4.5:1)", errors)
        self.assertIn("mode TV : --tv-ink sur --tv-bg : 1.11:1 (minimum 4.5:1)", errors)
        self.assertTrue(warnings and "--muted" in warnings[0])  # couleurs restées celles du Classique
        sans_nom = os.path.join(tmp, "theme-x.css")
        open(sans_nom, "w").write(':root[data-skin="x"]{--ink:#000000;--bg:#ffffff}\n')
        self.assertIn("première ligne « /* @nom: Nom affiché */ » absente", theme.check(sans_nom)[0])
        with contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(theme.main(["check", menthe]), 0)
            self.assertEqual(theme.main(["check", menthe, pale]), 1)
        self.assertIn("✓ thème valide", out.getvalue())

    def test_fonts_are_embedded(self):
        html = assemble.page_html()
        self.assertNotIn("@@font:", html)
        self.assertIn("font/woff2;base64,d09GMg", html)  # signature wOF2


if __name__ == "__main__":
    unittest.main()
