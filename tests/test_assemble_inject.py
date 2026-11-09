"""Le pack d'équipe est une frontière de confiance (python3 -m unittest tests/test_assemble_inject.py) : un collègue qui
écrit dans le pack partagé ne fait ni exécuter de script dans la page du mainteneur (« </script> » dans un nom, un
marqueur « __CONFIG__ » dans une donnée), ni embarquer un fichier hors du pack (« ../ » d'une pochette, d'une police,
d'un plan)."""
import contextlib, io, json, os, re, shutil, sys, tempfile, unittest
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import assemble, smoke  # noqa: E402

PACK = os.path.join(ROOT, "tests", "fixtures", "pack-exemple")
EVIL = "</script><script>x=1</script>"
COVER = "data:image/png;base64,iVBORw0KGgo="


class InjectTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.pack = os.path.join(self.tmp, "pack")
        shutil.copytree(PACK, self.pack)
        self.cfg = {**assemble.demo_config(), "team": self.pack, "owner": "p_bob", "people": []}

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def edit(self, rel, fn):
        path = Path(self.pack, rel)
        data = json.loads(path.read_text())
        fn(data)
        path.write_text(json.dumps(data, ensure_ascii=False))

    def music(self, entry):
        Path(self.pack, "music", "music.json").write_text(json.dumps({"p_lynn": {"title": "T", "url": "https://example.org/m", **entry}}))

    def test_js_json_never_closes_the_script(self):
        s = assemble.js_json({"n": EVIL + " & <!--   "})
        self.assertNotRegex(s, r"[<>&  ]")
        self.assertEqual(json.loads(s)["n"], EVIL + " & <!--   ")

    def test_names_from_the_pack_stay_data(self):
        self.edit("roster.json", lambda r: r["people"][1].update(name=EVIL))
        self.edit("settings.json", lambda s: s["agents"][0].update(name=EVIL))  # personnage du pack
        theme = Path(self.pack, "themes", "theme-menthe.css")
        theme.write_text(theme.read_text().replace("/* @nom: Menthe */", f"/* @nom: {EVIL} */", 1))
        cfg = {**self.cfg, "agents": [{"key": "pete", "wf": ["abcd1234"]}]}
        html = assemble.build(demo=False, cfg=cfg)
        # un seul script exécutable, sans attribut ; tout autre <script> est un bloc kronn-action
        self.assertEqual(html.count("<script>"), 1)
        self.assertEqual(len(re.findall(r"<script\b", html)), len(re.findall(r"</script>", html)))
        self.assertNotIn("x=1</script>", html)
        # les données posées sont relues intactes : roster, nom de l'agent et du thème (config de la page)
        roster = assemble.tight({"people": assemble.roster(cfg), "guests": assemble.guests(cfg)})
        self.assertIn(roster, html)
        self.assertEqual(json.loads(roster)["people"][1]["name"], EVIL)
        conf = assemble.js_json(assemble.page_config(assemble.merged(cfg)))
        self.assertIn(conf, html)
        conf = json.loads(conf)
        self.assertEqual(conf["skins"]["menthe"], EVIL)
        self.assertEqual([a["name"] for a in conf["agents"] if a["key"] == "pete"], [EVIL])
        smoke.fails.clear()
        with contextlib.redirect_stdout(io.StringIO()):
            smoke.static_checks(html, cfg)  # le script se parse, aucun marqueur restant
        self.assertEqual(smoke.fails, [])

    def test_a_marker_in_the_data_is_not_replaced(self):
        self.edit("roster.json", lambda r: r["people"][1].update(name="Lynn __CONFIG__", person="__ROSTER__ __VERSION__"))
        html = assemble.build(demo=False, cfg=self.cfg)
        roster = assemble.tight({"people": assemble.roster(self.cfg), "guests": assemble.guests(self.cfg)})
        self.assertIn(roster, html)  # posé une seule fois, tel quel : la page ne casse pas
        lynn = json.loads(roster)["people"][1]
        self.assertEqual((lynn["name"], lynn["person"]), ("Lynn __CONFIG__", "__ROSTER__ __VERSION__"))
        self.assertIn(assemble.js_json(assemble.page_config(assemble.merged(self.cfg))), html)
        self.assertIn(f"Le Bureau {assemble.version()}", html)  # __VERSION__ du pied de page toujours rempli
        self.assertIsNone(re.search(r"__[A-Z_]+__", html.replace(roster, "")), "aucun marqueur restant hors de la donnée")

    def test_cover_stays_in_the_music_folder_and_is_an_image(self):
        Path(self.pack, "music", "lynn.txt").write_text(COVER + "\n")
        self.music({"cover": "lynn.txt"})
        self.assertEqual(assemble.music(self.cfg)["p_lynn"]["cover"], COVER)
        Path(self.tmp, "x").write_text(COVER)
        for bad in ("../x", "../../x", "/etc/hosts", "sub/lynn.txt", ".."):
            self.music({"cover": bad})
            with self.assertRaises(ValueError, msg=bad):
                assemble.music(self.cfg)
        os.symlink(os.path.join(self.tmp, "x"), os.path.join(self.pack, "music", "lien.txt"))
        self.music({"cover": "lien.txt"})
        with self.assertRaisesRegex(ValueError, "sort du dossier"):
            assemble.music(self.cfg)
        Path(self.pack, "music", "lynn.txt").write_text('x" onerror="alert(1)')
        self.music({"cover": "lynn.txt"})
        with self.assertRaisesRegex(ValueError, "data URI"):
            assemble.music(self.cfg)

    def test_pack_font_stays_in_fonts(self):
        theme = Path(self.pack, "themes", "theme-menthe.css")
        base = theme.read_text()
        os.makedirs(os.path.join(self.pack, "fonts"))
        Path(self.pack, "fonts", "pixel.woff2").write_bytes(b"wOF2")
        theme.write_text(base + "@font-face{font-family:P;src:url(data:font/woff2;base64,@@font:fonts/pixel.woff2@@)}\n")
        self.assertIn("d09GMg==", assemble.page_parts(self.cfg)[0])  # police légitime du pack embarquée
        for bad in ("../x", "fonts/../../x.woff2", "fonts/../team.json", "/etc/hosts", "team.json"):
            theme.write_text(base + f"a{{b:url(@@font:{bad}@@)}}\n")
            with self.assertRaises(ValueError, msg=bad):
                assemble.page_parts(self.cfg)
        theme.write_text(base + "a{content:'</style><script>x=1</script>'}\n")
        with self.assertRaisesRegex(ValueError, "</style"):
            assemble.page_parts(self.cfg)

    def test_pack_layout_stays_in_the_pack_or_layouts(self):
        Path(self.tmp, "x.json").write_text("{}")  # un JSON à côté du pack, hors du pack
        for bad in ("../x.json", "../../../../etc/x.json", "tools/../bureau.config.json"):
            self.edit("team.json", lambda t: t.update(layout=bad))
            with self.assertRaisesRegex(ValueError, "sort du dossier", msg=bad):
                assemble.layout_path(self.cfg)
        self.edit("team.json", lambda t: t.update(layout="layouts/open-space.json"))  # plan du dépôt : accepté
        self.assertEqual(assemble.layout_path(self.cfg), "layouts/open-space.json")

    def test_legit_pack_still_builds(self):
        html = assemble.build(demo=False, cfg=self.cfg)
        self.assertIn('"vance-plan"', html)
        self.assertIn('data-skin="menthe"', html)
        self.assertEqual(html.count("<script>"), 1)


if __name__ == "__main__":
    unittest.main()
