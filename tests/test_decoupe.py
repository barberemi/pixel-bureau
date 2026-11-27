"""Découpe des planches générées (python3 -m unittest tests/test_decoupe.py) : sprites/decoupe.py ramène une planche à fond
magenta au format des sprites fournis (Yoda, Palpatine, 2026-11-27) ; heralds.GENERATED les crédite."""
import json, os, sys, tempfile, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sprites"))
try:
    from PIL import Image
    import decoupe
except ImportError:  # python3 du système, sans le venv
    Image = None

MAGENTA, BODY, BOLT = (255, 0, 255), (30, 30, 40), (150, 210, 255)


@unittest.skipUnless(Image, "Pillow absent")
class DecoupeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def save(self, im):
        path = os.path.join(self.tmp, "planche.png")
        im.save(path)
        return path

    def test_marche(self):
        """3 rangées de 9 (dos, face, profil vers la droite), figures de tailles différentes selon la rangée : rangées LPC
        (gauche = miroir de la droite), chaque rangée à la même hauteur, bas des pieds à 62, fond transparent."""
        src = Image.new("RGB", (9 * 100, 3 * 200), MAGENTA)
        for r, h in enumerate((120, 150, 140)):
            for c in range(9):
                x, y = c * 100 + 30, r * 200 + 190 - h
                src.paste(BODY, (x, y, x + 40, y + h))
                src.paste((200, 180, 60), (x + 30, y + 10, x + 40, y + 20))  # un œil à droite : le miroir se voit
        out = decoupe.marche(self.save(src), "test", 42)
        walk, idle = out["test-walk.png"], out["test-idle.png"]
        self.assertEqual((walk.size, idle.size), ((576, 256), (128, 256)))
        for r in range(4):
            box = walk.crop((64, r * 64, 128, r * 64 + 64)).getbbox()
            self.assertEqual((box[3] - box[1], box[3]), (42, 62), r)  # 42 px, bas à 62 comme les planches LPC
            self.assertEqual(walk.getpixel((0, r * 64))[3], 0)  # le magenta est devenu transparent
        right = walk.crop((0, 192, 64, 256))
        self.assertEqual(list(walk.crop((0, 64, 64, 128)).getdata()), list(right.transpose(Image.FLIP_LEFT_RIGHT).getdata()))
        self.assertEqual(list(idle.crop((64, 128, 128, 192)).getdata()), list(walk.crop((0, 128, 64, 192)).getdata()))

    def test_eclairs(self):
        """Grille de 3 x 3 : le corps seul, calé à x = 30 dans des cases de 128 ; l'éclair est retiré au-delà de la main,
        repérée dans <nom>-cast.json (null sans éclair)."""
        src = Image.new("RGB", (3 * 300, 3 * 200), MAGENTA)
        for i in range(9):
            x, y = (i % 3) * 300 + 20, (i // 3) * 200 + 20
            src.paste(BODY, (x, y, x + 60, y + 160))
            if i:
                src.paste(BOLT, (x + 60, y + 80, x + 250, y + 90))
        out = decoupe.eclairs(self.save(src), "test", 44)
        cast, hands = out["test-cast.png"], out["test-cast.json"]
        self.assertEqual(cast.size, (9 * 128, 64))
        self.assertIsNone(hands[0])
        for i in range(9):
            box = cast.crop((i * 128, 0, i * 128 + 128, 64)).getbbox()
            head = cast.crop((i * 128, box[1], i * 128 + 128, box[1] + 10)).getbbox()
            self.assertLessEqual(abs((head[0] + head[2]) / 2 - 30), 1, i)  # la tête centrée en 30
            self.assertLess(box[2], 50, i)  # plus d'éclair au loin
            if i:
                hx, hy = hands[i]
                self.assertTrue(40 <= hx <= 50 and 30 <= hy <= 50, hands[i])
        json.dumps(hands)

    def test_grille(self):
        """Grille de cases (GRILLES[<nom>]) : marche 9 x 4, attente 2 x 4, bras levés 3 x 1 ; la droite est le miroir de
        la gauche, la pose d'attente de face fait --taille px, les pieds à 62, le trait de la grille transparent."""
        g = decoupe.GRILLES["ackbar"]
        cols, rows = g["grille"]
        src = Image.new("RGB", (cols * 100, rows * 120), MAGENTA)
        for r in range(rows):
            for c in range(cols):
                src.paste((180, 0, 170), (c * 100, r * 120, c * 100 + 2, r * 120 + 120))  # le trait de la grille
                x, y = c * 100 + 30, r * 120 + 20
                src.paste(BODY, (x, y, x + 40, y + 90))
                src.paste((200, 180, 60), (x + 30, y + 10, x + 40, y + 20))  # un œil à droite : le miroir se voit
        out = decoupe.grille(self.save(src), "ackbar", 42)
        walk, idle, emote = out["ackbar-walk.png"], out["ackbar-idle.png"], out["ackbar-emote.png"]
        self.assertEqual((walk.size, idle.size, emote.size), ((576, 256), (128, 256), (192, 64)))
        box = idle.crop((0, 128, 64, 192)).getbbox()
        self.assertEqual((box[3] - box[1], box[3]), (42, 62))
        self.assertEqual(walk.getpixel((1, 1))[3], 0)
        self.assertEqual(list(walk.crop((64, 64, 128, 128)).getdata()), list(walk.crop((64, 192, 128, 256)).transpose(Image.FLIP_LEFT_RIGHT).getdata()))
        self.assertTrue(all(emote.crop((c * 64, 0, c * 64 + 64, 64)).getbbox() for c in range(3)))

    def test_vol(self):
        """4 rangées de 8 sur un damier gris : 6 cases carrées (plané, 4 battements, le parchemin seul), l'œil de la monture
        au même point de chaque case, le damier transparent, même enfermé entre la queue et le corps."""
        src = Image.new("RGB", (8 * 180, 4 * 190))
        px = src.load()
        for y in range(src.size[1]):
            for x in range(src.size[0]):
                px[x, y] = (100,) * 3 if (x // 20 + y // 20) % 2 else (148,) * 3
        for r in range(4):
            for c in range(8):
                x, y = c * 180 + 10 + (c % 3) * 4, r * 190 + 40 + r * 6  # figures pas toutes au même endroit
                src.paste(BODY, (x, y, x + 150, y + 60))
                src.paste((100,) * 3, (x + 20, y + 15, x + 60, y + 45))  # un trou de damier enfermé par le corps
                src.paste((230, 90, 20), (x + 135, y + 10, x + 141, y + 16))  # l'œil, à droite
                if (r, c) == decoupe.VOL_PARCHEMIN:
                    src.paste((235, 225, 190), (x + 60, y + 60, x + 90, y + 72))
        out = decoupe.vol(self.save(src), "test", 80)["test-vol.png"]
        cw = out.size[1]
        self.assertEqual(out.size[0], 6 * cw)
        eyes = set()
        for i in range(5):
            cell = out.crop((i * cw, 0, i * cw + cw, cw))
            self.assertLessEqual(abs(cell.getbbox()[2] - cell.getbbox()[0] - 80), 1)  # --taille, à l'arrondi près
            p = cell.load()
            pts = [(x, y) for x in range(cw) for y in range(cw) if p[x, y][3] and p[x, y][0] > 170 and p[x, y][2] < 90]
            ex, ey = round(sum(x for x, _ in pts) / len(pts)), round(sum(y for _, y in pts) / len(pts))
            eyes.add((ex, ey))
            self.assertEqual(cell.getpixel((ex - 52, ey + 9))[3], 0, i)  # le trou enfermé (98 px plus à gauche que l'œil, 17 plus bas) est transparent
            self.assertEqual(cell.getpixel((ex - 30, ey + 9))[3], 255, i)  # le corps à côté
        for k in (0, 1):  # au pixel près (la réduction arrondit)
            self.assertLessEqual(max(e[k] for e in eyes) - min(e[k] for e in eyes), 1, eyes)
        scroll = out.crop((5 * cw, 0, 6 * cw, cw))
        self.assertTrue(scroll.getbbox() and all(p[0] > 200 for p in scroll.getdata() if p[3]))  # le parchemin seul

    def test_generated_sheets_are_shipped_and_credited(self):
        """Chaque planche générée a sa marche et son attente dans sprites/common/, et sa ligne dans CREDITS.md."""
        import heralds
        with open(os.path.join(ROOT, "CREDITS.md"), encoding="utf-8") as f:
            credits = f.read()
        for name in heralds.GENERATED:
            for a in ("walk", "idle"):
                self.assertTrue(os.path.exists(os.path.join(ROOT, "sprites", "common", name, f"{name}-{a}.png")), name)
            self.assertIn(f"`sprites/common/{name}/`) : planche générée", credits)
            self.assertNotIn(name, heralds.RECIPES)
        for name in heralds.GENERATED_FX:
            self.assertTrue(os.path.exists(os.path.join(ROOT, "sprites", "common", name, f"{name}-vol.png")), name)
            self.assertIn(f"`sprites/common/{name}/`) : planche générée", credits)

    def test_vol_is_shipped_as_is(self):
        """build_sprites.sheets : un dossier sans marche (le Nazgûl) n'est pas un personnage, sa bande <nom>-vol.png est
        gardée telle quelle sous <nom>_vol ; sprites/common.json est à jour."""
        import base64, shutil, build_sprites
        d = os.path.join(self.tmp, "common", "nazgul")
        os.makedirs(d)
        shutil.copy(os.path.join(ROOT, "sprites", "common", "nazgul", "nazgul-vol.png"), d)
        out = build_sprites.sheets(os.path.dirname(d))
        with open(os.path.join(d, "nazgul-vol.png"), "rb") as f:
            self.assertEqual(out, {"nazgul_vol": "data:image/png;base64," + base64.b64encode(f.read()).decode()})
        with open(os.path.join(ROOT, "sprites", "common.json"), encoding="utf-8") as f:
            self.assertEqual(json.load(f)["nazgul_vol"], out["nazgul_vol"])


if __name__ == "__main__":
    unittest.main()
