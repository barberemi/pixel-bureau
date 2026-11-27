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


if __name__ == "__main__":
    unittest.main()
