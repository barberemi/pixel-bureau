"""tools/lpc_sheet.py : planche LPC -> planche du Bureau, sur un personnage synthétique (tête de profil, chaussures en L)
avec les défauts vus sur les planches générées : images tournées à l'envers, pieds à l'envers, liseré violet."""
import os, sys, unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools"))
try:
    from PIL import Image
    import lpc_sheet as L
except ImportError:  # Pillow : dans le venv du dépôt et sur la CI
    Image = L = None

C = 64
HAIR, SKIN, BODY, PANTS, SHOE = (70, 45, 30, 255), (220, 170, 130, 255), (60, 70, 120, 255), (60, 60, 60, 255), (30, 20, 15, 255)


def fig(spread, right=True):
    """Un personnage de profil vers la droite (ou son miroir) : jambes écartées ou jointes, chaussures pointe en avant."""
    c = Image.new("RGBA", (C, C))
    c.paste(HAIR, (26, 2, 32, 20))
    c.paste(SKIN, (32, 4, 38, 20))
    c.paste(BODY, (25, 20, 39, 47))
    legs = [22, 36] if spread else [29, 31]
    for x in legs:
        c.paste(PANTS, (x, 47, x + 5, 58))
        c.paste(SHOE, (x, 58, x + 4, 64))  # le talon
        c.paste(SHOE, (x + 4, 61, x + 9, 64))  # la pointe, vers l'avant
    return c if right else c.transpose(Image.FLIP_LEFT_RIGHT)


def sheet(cells):
    """cells : {(f, r): image} ; le reste, le personnage debout vers la droite."""
    im = Image.new("RGBA", (9 * C, 4 * C))
    for r in range(4):
        for f in range(9):
            im.alpha_composite(cells.get((f, r), fig(False)), (f * C, r * C))
    return im


@unittest.skipUnless(L, "Pillow absent")
class LpcSheetTest(unittest.TestCase):
    def test_sens_du_visage_et_des_pieds(self):
        t = L.shoe_template(fig(True))
        self.assertTrue(L.faces_right(fig(True)))
        self.assertFalse(L.faces_right(fig(True, right=False)))
        self.assertTrue(L.feet_right(fig(True), t))
        self.assertTrue(L.feet_right(fig(False), t), "pieds joints : ils se touchent, le sens se lit quand même")
        self.assertFalse(L.feet_right(fig(False, right=False), t))

    def test_marche_de_cote_refaite_et_dans_un_seul_sens(self):
        # la marche vers la droite livrée : écartées partout, sauf la 5 (jointes) ; les images 0 à 2 tournées à l'envers,
        # la 3 avec les pieds à l'envers ; la gauche livrée, tournée à droite sur ses dernières images
        cells = {(f, 3): fig(f != 5, right=f > 2) for f in range(9)}
        cells.update({(f, 1): fig(True, right=f >= 6) for f in range(9)})
        cells[(3, 3)] = Image.alpha_composite(fig(True), Image.new("RGBA", (C, C)))
        cells[(3, 3)].paste((0, 0, 0, 0), (0, 47, C, C))
        cells[(3, 3)].alpha_composite(fig(True, right=False).crop((0, 47, C, C)), (0, 47))
        logs = []
        out = L.build(sheet(cells), Image.new("RGBA", (2 * C, 4 * C)), cut=47, spread=(6, 3), joint=5, log=logs.append)
        self.assertEqual(out.size, (9 * C, 6 * C))
        t = L.shoe_template(fig(True))
        for f in range(9):
            right, left = L.cell(out, f, 3), L.cell(out, f, 1)
            self.assertTrue(L.faces_right(right) and L.feet_right(right, t), f"droite, image {f}")
            self.assertFalse(L.faces_right(left) or L.feet_right(left, t), f"gauche, image {f}")
        widths = [(lambda bb: bb[2] - bb[0])(L.cell(out, f, 3).crop((0, 58, C, C)).getbbox()) for f in range(1, 9)]
        self.assertEqual([w > 12 for w in widths], [True, True, False, False, True, True, False, False], "écartées x2, jointes x2")
        self.assertIn("jambes retournées (pieds à l'envers) : images [3]", logs)
        self.assertIn("bustes de profil droit : 6 / 8", logs)

    def test_liseré_violet(self):
        im = Image.new("RGBA", (5, 5))
        im.paste(BODY, (1, 1, 4, 4))
        im.putpixel((1, 1), (200, 40, 190, 255))  # magenta vif, sur le bord
        im.putpixel((2, 2), (40, 5, 40, 255))  # contour teinté, dedans
        out = L.clean(im)
        self.assertEqual(out.getpixel((1, 1)), L.OUTLINE)
        r, g, b, _ = out.getpixel((2, 2))
        self.assertEqual(r, g)
        self.assertEqual(g, b)
        self.assertEqual(out.getpixel((3, 3)), BODY, "le reste ne bouge pas")

    def test_attente_de_face_et_etoffer(self):
        walk = sheet({})
        idle = Image.new("RGBA", (2 * C, 4 * C))
        idle.alpha_composite(fig(False), (0, 2 * C))
        out = L.build(walk, idle, idle_face=True, brut=True)
        self.assertIsNotNone(L.cell(out, 0, 4).getbbox(), "de dos : l'image debout de la marche")
        self.assertEqual(L.cell(out, 2, 4).tobytes(), fig(False).tobytes(), "de face : la planche d'attente")
        big = L.build(walk, idle, idle_face=True, brut=True, etoffer=(1.3, 1.15))
        head = lambda im: (lambda bb: bb[2] - bb[0])(L.cell(im, 2, 4).crop((0, 0, C, 20)).getbbox())  # noqa: E731
        self.assertGreater(head(big), head(out), "la tête est plus large")


if __name__ == "__main__":
    unittest.main()
