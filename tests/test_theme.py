"""Thèmes d'interface (page/src/theme-<id>.css) : chacun a son nom (« /* @nom: … */ »), ses variables de couleur, des
contrastes WCAG suffisants (texte >= 4,5:1 sur ses fonds, blanc >= 4,5:1 sur ses aplats) ; polices intégrées."""
import os, re, sys, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import assemble  # noqa: E402

TEXT = ("ink", "muted", "accent", "ok", "warn", "err")  # couleurs de texte
GROUNDS = ("panel", "chip", "bg")                      # fonds sur lesquels elles s'affichent
FILLS = ("line", "err", "warn", "brand")               # aplats qui portent du texte (--on-<aplat>, blanc par défaut ; brand : facultatif)
# mode TV (bloc :root[data-skin="<id>"] body.tv, facultatif) : textes sur les fonds de l'écran mural, et texte des aplats
TV_TEXT = ("tv-ink", "tv-muted", "tv-h2", "tv-hint", "tv-ok", "tv-warn", "tv-err", "tv-mep")
TV_GROUNDS = ("tv-bg", "tv-bar", "tv-deep", "tv-card", "tv-chip")
TV_FILLS = (("tv-stand-ink", "tv-stand"), ("tv-retro-ink", "tv-retro"))


def lum(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def ratio(a, b):
    a, b = lum(a), lum(b)
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)


def tv_palette(theme):
    """Variables du bloc mode TV du thème ({} s'il n'en a pas : le mode TV garde alors ses couleurs de styles.css)."""
    css = open(os.path.join(assemble.SRC, f"theme-{theme}.css")).read()
    block = re.search(r':root\[data-skin="%s"\] body\.tv\s*\{(.*?)\}' % re.escape(theme), css, re.S)
    return dict(re.findall(r"--([\w-]+):\s*(#[0-9a-fA-F]{6})\b", block.group(1))) if block else {}


def palette(theme):
    """Variables du premier bloc :root[data-skin="<id>"] du thème."""
    css = open(os.path.join(assemble.SRC, f"theme-{theme}.css")).read()
    block = re.search(r':root\[data-skin="%s"\][^{]*\{(.*?)\}' % re.escape(theme), css, re.S)
    assert block, f"theme-{theme}.css : bloc :root[data-skin=\"{theme}\"] absent"
    return dict(re.findall(r"--([\w-]+):\s*(#[0-9a-fA-F]{6})\b", block.group(1)))


class ThemeTest(unittest.TestCase):
    def test_every_theme_has_a_name(self):
        self.assertIn("equipe", assemble.themes())
        for theme, name in assemble.themes().items():
            self.assertTrue(name, theme)

    def test_contrasts(self):
        for theme in assemble.themes():
            v = palette(theme)
            for key in TEXT + GROUNDS + ("line",):
                self.assertIn(key, v, f"theme-{theme}.css : --{key} manquante (couleur #rrggbb)")
            for fg in TEXT:
                for bg in GROUNDS:
                    with self.subTest(theme=theme, fg=fg, bg=bg):
                        self.assertGreaterEqual(ratio(v[fg], v[bg]), 4.5, f"{theme} : --{fg} sur --{bg}")
            for fill in FILLS:
                if fill in v:
                    on = v.get("on-" + fill, "#ffffff")
                    with self.subTest(theme=theme, fill=fill):
                        self.assertGreaterEqual(ratio(on, v[fill]), 4.5, f"{theme} : --on-{fill} sur --{fill}")

    def test_tv_contrasts(self):
        for theme in assemble.themes():
            v = tv_palette(theme)
            if not v:
                continue
            for key in TV_TEXT + TV_GROUNDS:
                self.assertIn(key, v, f"theme-{theme}.css (mode TV) : --{key} manquante")
            for fg in TV_TEXT:
                for bg in TV_GROUNDS:
                    with self.subTest(theme=theme, fg=fg, bg=bg):
                        self.assertGreaterEqual(ratio(v[fg], v[bg]), 4.5, f"{theme} (TV) : --{fg} sur --{bg}")
            for fg, bg in TV_FILLS:
                if fg in v and bg in v:
                    with self.subTest(theme=theme, fill=bg):
                        self.assertGreaterEqual(ratio(v[fg], v[bg]), 4.5, f"{theme} (TV) : --{fg} sur --{bg}")
        self.assertTrue(tv_palette("equipe"), "le thème Equipe habille le mode TV")

    def test_fonts_are_embedded(self):
        html = assemble.page_html()
        self.assertNotIn("@@font:", html)
        self.assertIn("font/woff2;base64,d09GMg", html)  # signature wOF2


if __name__ == "__main__":
    unittest.main()
