"""Réglages d'équipe dans le pack, #32 (python3 -m unittest tests/test_settings.py) : settings.json du pack posé sous la
config (rythme, GitFut, affiches, planning des absences, personnages d'agents), découpe d'une config existante sans que
la page ni les modèles ne changent, rattachement des agents par l'installateur."""
import io, json, os, shutil, sys, tempfile, unittest
from pathlib import Path
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
sys.path.insert(0, os.path.join(ROOT, "tests"))
import assemble, install, split, templates  # noqa: E402
from test_install import ANSWERS, FakeKronn  # noqa: E402

PACK = os.path.join(ROOT, "tests", "fixtures", "pack-exemple")
PLANNING = {"site": "vance.sharepoint.com,1,2", "item": "01ABC", "file": "Planning.xlsx"}
DWIGHT = {"key": "dwight", "name": "Dwight", "role": "Reviewer de PR", "wf": ["aaaaaaaa", "bbbbbbbb"], "seat": [3, 4]}


class SettingsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.pack = os.path.join(self.tmp, "bureau-vance")
        shutil.copytree(PACK, self.pack)
        self.settings = os.path.join(self.pack, "settings.json")

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def write(self, s):
        Path(self.settings).write_text(json.dumps(s, ensure_ascii=False))

    def cfg(self, **kw):
        return {**assemble.demo_config(), "team": self.pack, "owner": "p_bob", "people": [], **kw}

    def test_pack_settings_under_the_config(self):
        self.write({"rhythm": {"daily": "09:30", "daily_minutes": 15}, "gitfut": {"p_bob": "bobvance"}, "wiki_posters": ["Five"],
                    "microsoft": {"config_id": "pas-du-pack", "planning": PLANNING},
                    "agents": [{"key": "dwight", "name": "Dwight", "role": "Reviewer de PR", "wf": ["ignoré"]},
                               {"key": "pete", "name": "Pete", "role": "Veille techno"}],
                    "jira": {"project": "IGNORÉ"}})  # clé hors de settings : ignorée
        c = self.cfg(rhythm={"daily": "10:00"}, wiki_posters=["Mine"], microsoft={"config_id": "m365"},
                     agents=[{"key": "dwight", "wf": ["aaaaaaaa"], "seat": [3, 4]}, {"key": "a_new", "name": "Neuf", "wf": ["cccccccc"]}])
        m = assemble.merged(c)
        self.assertEqual(m["rhythm"], {"daily": "10:00", "daily_minutes": 15})  # la config surcharge clé à clé
        self.assertEqual(m["gitfut"], {"p_bob": "bobvance"})
        self.assertEqual(m["wiki_posters"], ["Mine"])  # posé dans la config : celui de la config
        self.assertEqual(m["microsoft"], {"config_id": "m365", "planning": PLANNING})  # config_id : jamais celui du pack
        self.assertEqual(m["agents"], [{"key": "dwight", "name": "Dwight", "role": "Reviewer de PR", "wf": ["aaaaaaaa"], "seat": [3, 4]},
                                       {"key": "a_new", "name": "Neuf", "wf": ["cccccccc"]}])  # Pete, sans workflow ici : absent
        self.assertEqual(m["jira"], c["jira"])
        self.assertEqual(assemble.merged(m), m)  # idempotent

    def test_without_settings_nothing_changes(self):
        os.remove(self.settings)
        c = self.cfg(agents=[DWIGHT])
        self.assertIs(assemble.merged(c), c)
        demo = assemble.demo_config()  # sans pack
        self.assertIs(assemble.merged(demo), demo)

    def test_page_and_crons_read_the_pack(self):
        self.write({"rhythm": {"daily": "09:05"}, "gitfut": {"p_bob": "bobvance"}, "agents": [{"key": "dwight", "name": "Dwight", "role": "Reviewer de PR"}]})
        c = {k: v for k, v in self.cfg(agents=[{"key": "dwight", "wf": ["aaaaaaaa"]}]).items() if k != "rhythm"}  # rien à surcharger
        page = assemble.page_config(assemble.merged(c))
        self.assertEqual(page["rhythm"]["daily"], "09:05")
        self.assertIn('"daily": "09:05"', assemble.build(demo=False, cfg=c))  # la page assemblée lit le pack
        self.assertEqual(page["agents"][0]["name"], "Dwight")
        code = templates.script_code("workflows/gitfut_snapshot.py", c)
        self.assertIn('"gitfut": {"p_bob": "bobvance"}', code)  # le script du cron a le GitFut du pack

    def test_split_moves_team_settings_and_keeps_everything_identical(self):
        os.remove(self.settings)
        c = self.cfg(rhythm={**assemble.demo_config()["rhythm"], "daily": "09:50"}, gitfut={"p_bob": "bobvance"},
                     wiki_posters=["Five"], microsoft={"config_id": "m365", "planning": PLANNING}, agents=[DWIGHT])
        path = os.path.join(self.tmp, "bureau.config.json")
        Path(path).write_text(json.dumps(c, ensure_ascii=False))
        page = assemble.build(demo=False, cfg=c)
        with mock.patch("sys.stdout", new=io.StringIO()) as out:
            self.assertEqual(split.main(["--config", path]), 0)  # vérification seule : rien d'écrit
        self.assertIn("identiques", out.getvalue())
        self.assertFalse(os.path.exists(self.settings))
        with mock.patch("sys.stdout", new=io.StringIO()):
            self.assertEqual(split.main(["--config", path, "--write"]), 0)
        s, rest = json.loads(Path(self.settings).read_text()), json.loads(Path(path).read_text())
        self.assertEqual(s["rhythm"]["daily"], "09:50")
        self.assertEqual(s["microsoft"], {"planning": PLANNING})
        self.assertEqual(s["agents"], [{"key": "dwight", "name": "Dwight", "role": "Reviewer de PR", "seat": [3, 4]}])  # sans wf
        self.assertEqual(rest["agents"], [{"key": "dwight", "wf": ["aaaaaaaa", "bbbbbbbb"]}])
        self.assertEqual(rest["microsoft"], {"config_id": "m365"})
        for k in ("rhythm", "gitfut", "wiki_posters"):
            self.assertNotIn(k, rest)
        self.assertTrue(os.path.exists(path + ".avant-split"))
        self.assertEqual(assemble.build(demo=False, cfg=rest), page)  # page identique octet pour octet

    def test_split_without_pack_refuses(self):
        path = os.path.join(self.tmp, "bureau.config.json")
        Path(path).write_text(json.dumps(assemble.demo_config()))
        with mock.patch("sys.stdout", new=io.StringIO()):
            self.assertEqual(split.main(["--config", path]), 1)


class InstallBindTest(unittest.TestCase):
    """L'installateur rattache les personnages du pack aux workflows du Kronn ; --rattacher refait seulement ça."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.cfg_path = os.path.join(self.tmp, "bureau.config.json")
        self.teams = os.path.join(self.tmp, "teams")
        shutil.copytree(PACK, os.path.join(self.teams, "vance"))
        Path(os.path.join(self.teams, "vance", "settings.json")).write_text(json.dumps(
            {"rhythm": {"daily": "09:30"}, "agents": [{"key": "dwight", "name": "Dwight", "role": "Revue de PR"},
                                                      {"key": "pete", "name": "Pete", "role": "Veille techno"}]}))
        self.fakes = []

        def make(api):
            f = FakeKronn(api); self.fakes.append(f); return f
        self.patches = [mock.patch.object(install, "Kronn", side_effect=make),
                        mock.patch.object(install.subprocess, "run", side_effect=FileNotFoundError()),
                        mock.patch.object(install, "org_member", return_value=(True, "membre actif")),
                        mock.patch.object(install.assemble, "TEAMS", self.teams)]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        shutil.rmtree(self.tmp)

    def run_install(self, answers, *extra):
        ap = os.path.join(self.tmp, "answers.json")
        Path(ap).write_text(json.dumps(answers))
        with mock.patch("sys.stdout", new=io.StringIO()):
            return install.main(["--config", self.cfg_path, "--answers", ap, *extra])

    def test_personas_bound_by_name_rhythm_left_to_the_pack(self):
        self.assertEqual(self.run_install(ANSWERS), 0)
        cfg = json.loads(Path(self.cfg_path).read_text())
        self.assertEqual(cfg["agents"], [{"key": "dwight", "wf": ["aaaaaaaa"]}])  # « Revue de PR » : son métier ; Pete : aucun
        self.assertNotIn("daily", cfg["rhythm"])  # dit par le pack
        self.assertEqual(cfg["rhythm"]["timezone"], "Europe/Paris")  # ce que le pack ne dit pas : valeurs proposées
        self.assertEqual(assemble.merged(cfg)["agents"][0]["name"], "Dwight")

    def test_rebind_only_agents_and_boss_pages(self):
        self.assertEqual(self.run_install(ANSWERS), 0)
        before = json.loads(Path(self.cfg_path).read_text())
        self.assertEqual(self.run_install({"agent_dwight": "", "agents": "none", "boss_pages": "-", "confirm": "o"}, "--rattacher"), 0)
        cfg = json.loads(Path(self.cfg_path).read_text())
        self.assertEqual(cfg["agents"], [])
        self.assertEqual(cfg["workflows"], before["workflows"])  # le reste ne bouge pas
        self.assertTrue([1 for m, p, _ in self.fakes[-1].calls if m == "PUT" and p == f"/pages/{cfg['page_id']}/html"])

    def test_rebind_keeps_previous_binding(self):
        self.assertEqual(self.run_install(ANSWERS), 0)
        self.assertEqual(self.run_install({"agents": "none", "boss_pages": "-", "confirm": "o"}, "--rattacher"), 0)
        self.assertEqual(json.loads(Path(self.cfg_path).read_text())["agents"], [{"key": "dwight", "wf": ["aaaaaaaa"]}])


if __name__ == "__main__":
    unittest.main()
