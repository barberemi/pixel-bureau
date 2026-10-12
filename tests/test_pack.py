"""Packs d'équipe, KT-60 (python3 -m unittest tests/test_pack.py) : une équipe chargée depuis un dossier hors du dépôt
(clé team = chemin) apporte son roster, ses avatars, sa musique, son plan et ses thèmes ; sans pack, rien ne change."""
import contextlib, io, json, os, shutil, subprocess, sys, tempfile, unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import assemble, smoke  # noqa: E402

PACK = os.path.join(ROOT, "tests", "fixtures", "pack-exemple")


def cfg_with(team):
    return {**assemble.demo_config(), "team": team, "owner": "p_bob", "people": []}  # sans l'équipe de démo de la config


class PackTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.pack = os.path.join(self.tmp, "bureau-vance")  # hors du dépôt, comme un dépôt privé cloné
        shutil.copytree(PACK, self.pack)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def test_team_dir_id_path_tilde_and_missing(self):
        self.assertTrue(assemble.team_dir({"team": "equipe"}).endswith(os.path.join("teams", "equipe")))  # un id : teams/
        self.assertEqual(assemble.team_dir({"team": self.pack}), self.pack)
        with mock.patch.dict(os.environ, {"HOME": self.tmp}):
            self.assertEqual(assemble.team_dir({"team": "~/bureau-vance"}), self.pack)
        self.assertEqual(assemble.team_dir({"team": "./tests/fixtures/pack-exemple"}), PACK)  # relatif : au dépôt
        self.assertIsNone(assemble.team_dir({}))  # équipe neuve
        with self.assertRaises(ValueError):
            assemble.team_dir({"team": os.path.join(self.tmp, "absent")})  # jamais une page sans son équipe, en silence

    def test_pack_brings_roster_avatars_music_layout_and_theme(self):
        cfg = cfg_with(self.pack)
        self.assertEqual([p["key"] for p in assemble.roster(cfg)], ["p_bob", "p_lynn", "p_ozzie"])
        self.assertIn("p_lynn", assemble.recipes(cfg))
        self.assertEqual(assemble.music(cfg)["p_lynn"]["url"], "https://example.org/morceau")
        self.assertEqual(assemble.layout_path(cfg), os.path.join(self.pack, "layouts", "plan.json"))
        self.assertEqual(assemble.themes(cfg)["menthe"], "Menthe")
        self.assertNotIn("menthe", assemble.themes({}))  # le thème du pack ne fuit pas dans les autres installations
        self.assertEqual(assemble.defaults(cfg)["ui"]["skin"], "menthe")

    def test_page_with_pack_passes_smoke_and_starts(self):
        cfg = cfg_with(self.pack)
        html = assemble.build(demo=False, cfg=cfg)
        self.assertIn('"vance-plan"', html)
        self.assertIn('data-skin="menthe"', html)  # CSS du thème du pack embarqué
        smoke.fails.clear()
        with contextlib.redirect_stdout(io.StringIO()):
            smoke.static_checks(html, cfg)
        self.assertEqual(smoke.fails, [])
        path = os.path.join(self.tmp, "cfg.json")
        json.dump(cfg, open(path, "w"))
        js = ("const {load}=require(process.argv[1]);const cfg=JSON.parse(require('fs').readFileSync(process.argv[2],'utf8'));"
              "const p=load({config:cfg,demo:false,owner:cfg.owner});"
              "process.stdout.write(p.run('JSON.stringify({boss:(chars.find(c=>c.boss)||{}).key,people:chars.filter(c=>c.person).map(c=>c.key),"
              "skins:Object.keys(CFG.skins),plan:LAYOUT.id})'))")
        r = subprocess.run(["node", "-e", js, os.path.join(ROOT, "tests", "helpers", "page.js"), path], capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr[-800:])
        page = json.loads(r.stdout)
        self.assertEqual(page["boss"], "p_bob")
        self.assertEqual(sorted(page["people"]), ["p_bob", "p_lynn", "p_ozzie"])
        self.assertIn("menthe", page["skins"])
        self.assertEqual(page["plan"], "vance-plan")

    def test_without_pack_nothing_changes(self):
        cfg = assemble.demo_config()
        self.assertIsNone(cfg.get("team"))
        self.assertEqual(assemble.layout_path(cfg), assemble.DEFAULT_LAYOUT)
        self.assertEqual(set(assemble.themes(cfg)), set(assemble.themes()))


if __name__ == "__main__":
    unittest.main()
