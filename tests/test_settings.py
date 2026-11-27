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
        self.assertEqual(m["agents"][:2], [{"key": "dwight", "name": "Dwight", "role": "Reviewer de PR", "wf": ["aaaaaaaa"], "seat": [3, 4]},
                                           {"key": "a_new", "name": "Neuf", "wf": ["cccccccc"]}])  # Pete, sans workflow ici : absent
        self.assertEqual([a["key"] for a in m["agents"][2:]], ["jim", "pompier", "palpatine"])  # casting par défaut : modèles installés (Palpatine : le rejeu de la démo)
        self.assertEqual(m["jira"], c["jira"])
        self.assertEqual(assemble.merged(m), m)  # idempotent

    def test_enseigne_from_the_pack_and_the_config(self):
        """Lot 2 des habillages : l'enseigne du mur est un réglage d'équipe (texte ou {text, bg, accent}), relu à chaque
        assemblage ; la config la surcharge champ à champ ; une couleur mal écrite est ignorée, le texte coupé à 24."""
        self.write({"enseigne": "VANCE"})
        self.assertEqual(assemble.page_config(assemble.merged(self.cfg()))["enseigne"], {"text": "VANCE"})
        m = assemble.merged(self.cfg(enseigne={"bg": "#112233", "accent": "rouge"}))
        self.assertEqual(m["enseigne"], {"text": "VANCE", "bg": "#112233"})
        self.assertEqual(assemble.merged(m), m)
        self.write({"enseigne": {"text": "X" * 40, "bg": "#000000", "accent": "#ffcc00"}})
        self.assertEqual(assemble.page_config(assemble.merged(self.cfg()))["enseigne"], {"text": "X" * 24, "bg": "#000000", "accent": "#ffcc00"})
        self.write({})
        self.assertIsNone(assemble.page_config(assemble.merged(self.cfg()))["enseigne"])  # le panneau garde ce que dit le plan
        self.assertIn('"enseigne":{"text":"SEUL"}', assemble.build(cfg=self.cfg(enseigne="SEUL")))  # sans pack aussi

    def test_mep_transition_and_teams_channel_from_the_pack(self):
        """Mise en prod : statut de fin et canal Teams de l'équipe dans le pack ; le canal de test reste celui de la config."""
        self.write({"mep": {"done_transition": "3", "teams": {"team": "T1", "channel": "19:mep@thread.tacv2"}}})
        m = assemble.merged(self.cfg(mep={"teams": {"test_channel": "19:test@thread.tacv2"}}))
        self.assertEqual(m["mep"], {"done_transition": "3", "teams": {"team": "T1", "channel": "19:mep@thread.tacv2",
                                                                      "test_channel": "19:test@thread.tacv2"}})
        self.assertEqual(assemble.merged(self.cfg())["mep"]["teams"]["channel"], "19:mep@thread.tacv2")
        self.assertEqual(assemble.merged(m), m)

    def test_combles_address_from_the_pack(self):
        """La borne des Combles : l'adresse de Sprint Quest de l'équipe (pack), sinon débranchée ; la config la surcharge."""
        self.write({"combles": {"url": "https://claude.ai/artifact/equipe"}})
        self.assertEqual(assemble.combles_url(assemble.merged(self.cfg(combles={}))), "https://claude.ai/artifact/equipe")
        self.assertEqual(assemble.combles_url(assemble.merged(self.cfg(combles={"url": "https://claude.ai/artifact/moi"}))),
                         "https://claude.ai/artifact/moi")

    def test_support_channel_from_the_pack_and_its_agent_bound_to_the_model(self):
        """#62 : canal Support du pack (la config surcharge clé à clé), personnage rattaché au modèle support installé."""
        self.write({"support": {"name": "Support", "team": "T1", "channel": "19:x@thread.tacv2"},
                    "agents": [{"key": "kelly", "name": "Kelly", "role": "Support", "model": "support"}]})
        m = assemble.merged(self.cfg(agents=[], support={"name": "Support Scranton"}, models={"support": "5e990001-0000-4000-8000-000000000000"}))
        self.assertEqual(m["support"], {"name": "Support Scranton", "team": "T1", "channel": "19:x@thread.tacv2"})
        self.assertEqual([(a["key"], a["wf"]) for a in m["agents"]], [("kelly", ["5e990001"]), ("jim", ["4d5e6f70"])])  # pas le Pompier : Kelly du pack a le modèle
        self.assertEqual(assemble.support_page(m), {"name": "Support Scranton", "wf": "5e990001", "postes_wf": []})
        # les postes de l'investigation (sous-workflows support_*) : leurs runs vont à la caserne, pas au RDC
        m2 = {**m, "models": {**(m.get("models") or {}), "support_tri": "7a110001-x", "support_poll": "99990000-x", "support_skip": "88880000-x"}}
        self.assertEqual(assemble.support_page(m2)["postes_wf"], ["7a110001"])
        self.assertIsNone(assemble.support_page(assemble.demo_config() | {"support": {"team": "T1"}}), "sans canal : pas de console")

    def test_ticket_page_lists_its_postes(self):
        """Créer un ticket : le préfixe du modèle et de ses postes (rédaction, un ticket), lus au 2e, jamais au RDC."""
        self.assertIsNone(assemble.ticket_page({"models": {}}))
        m = {"models": {"ticket": "71c4e700-1", "ticket_recherche": "aaaa0001-1", "ticket_un": "bbbb0001-1", "review_child": "cccc0001-1"}}
        self.assertEqual(assemble.ticket_page(m), {"wf": "71c4e700", "postes_wf": ["aaaa0001", "bbbb0001"]})

    def test_fix_section_of_the_pack(self):
        """#75 : consignes, skills et contrôles de la correction des commentaires ; la config surcharge, contrôles clé à clé."""
        self.write({"fix": {"guidelines": "Conventions front : un seul dépôt.", "skill_ids": ["php"],
                            "checks": {"vance/front": "make lint", "vance/api": "make test"}}})
        m = assemble.merged(self.cfg(fix={"checks": {"vance/api": "make test-api", "moi/outil": "make check"}}))
        self.assertEqual(m["fix"], {"guidelines": "Conventions front : un seul dépôt.", "skill_ids": ["php"],
                                    "checks": {"vance/front": "make lint", "vance/api": "make test-api", "moi/outil": "make check"}})
        self.assertEqual(assemble.merged(m), m)  # idempotent
        self.assertEqual(templates.values(m)["fix.guidelines"].splitlines()[-1], "Conventions front : un seul dépôt.")  # après les consignes de base

    def test_without_settings_nothing_changes(self):
        """Sans settings.json : rien ne change, sauf le casting par défaut (team/agents.json, lot 5 des habillages) qui
        rattache d'office les personnages des modèles installés que personne n'incarne (ici Jim au bouton rebase, le
        Pompier au modèle support, Palpatine au rejeu) ; la démo les a déjà (Nellie au Support, Jim à soi) : identique."""
        os.remove(self.settings)
        c = self.cfg(agents=[DWIGHT])
        m = assemble.merged(c)
        self.assertEqual({k: v for k, v in m.items() if k != "agents"}, {k: v for k, v in c.items() if k != "agents"})
        self.assertEqual([(a["key"], a["wf"]) for a in m["agents"]], [("dwight", DWIGHT["wf"]), ("jim", ["4d5e6f70"]), ("pompier", ["5e990001"]), ("palpatine", ["4e0e0001"])])
        self.assertEqual(m["agents"][0], DWIGHT)  # son propre nom : il garde son personnage
        demo = assemble.demo_config()  # sans pack
        self.assertEqual(assemble.merged(demo), demo)

    def test_default_casting_replaced_by_the_pack(self):
        """Le pack remplace un personnage du casting par le sien (même clé) ; une ligne de config sans nom prend celui du
        casting ; un modèle déjà incarné par un autre agent ne fait pas apparaître le personnage du casting."""
        self.write({"agents": [{"key": "jim", "name": "Jimmy", "role": "Rebase", "model": "rebase"}]})
        m = assemble.merged(self.cfg(agents=[{"key": "holly", "wf": ["cccccccc"]}, {"key": "nellie", "name": "Nellie", "wf": ["5e990001"]}]))
        self.assertEqual([(a["key"], a.get("name"), a.get("icon")) for a in m["agents"]],
                         [("holly", "Holly", None), ("nellie", "Nellie", None), ("jim", "Jimmy", None), ("palpatine", "Palpatine", "⚡")])
        self.assertEqual(m["agents"][0]["sprite"], "p_holly")
        self.assertEqual(assemble.merged(m), m)

    def test_pack_line_without_name_completes_the_casting(self):
        """Une ligne du pack sans nom ({key, seat}) garde le personnage du casting et lui donne sa place."""
        self.write({"agents": [{"key": "dwight", "seat": "I6.L2"}]})
        a = next(x for x in assemble.team_agents(self.cfg()) if x["key"] == "dwight")
        self.assertEqual((a["name"], a["metier"], a["seat"]), ("Dwight", "revue", "I6.L2"))
        m = assemble.merged(self.cfg(agents=[{"key": "dwight", "wf": ["aaaaaaaa"]}]))
        self.assertEqual((m["agents"][0]["name"], m["agents"][0]["seat"]), ("Dwight", "I6.L2"))

    def test_page_and_crons_read_the_pack(self):
        self.write({"rhythm": {"daily": "09:05"}, "gitfut": {"p_bob": "bobvance"}, "agents": [{"key": "dwight", "name": "Dwight", "role": "Reviewer de PR"}]})
        c = {k: v for k, v in self.cfg(agents=[{"key": "dwight", "wf": ["aaaaaaaa"]}]).items() if k != "rhythm"}  # rien à surcharger
        page = assemble.page_config(assemble.merged(c))
        self.assertEqual(page["rhythm"]["daily"], "09:05")
        self.assertIn('"daily":"09:05"', assemble.build(demo=False, cfg=c))  # la page assemblée lit le pack
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


class ComblesUrlTest(unittest.TestCase):
    """La borne des Combles (68-combles.js) : l'adresse de Sprint Quest, réglée dans combles.url, en https seulement."""

    def test_https_only(self):
        self.assertEqual(assemble.page_config({"combles": {"url": "https://claude.ai/artifact/abc"}})["combles_url"], "https://claude.ai/artifact/abc")
        self.assertEqual(assemble.page_config({"combles": {"noel_url": "https://claude.ai/artifact/noel"}})["noel_url"], "https://claude.ai/artifact/noel")
        self.assertIsNone(assemble.page_config({"combles": {"noel_url": "http://pas-https"}})["noel_url"])
        for bad in ({}, {"combles": {}}, {"combles": {"url": "javascript:alert(1)"}}, {"combles": {"url": "http://x"}}, {"combles": {"url": 3}}):
            self.assertIsNone(assemble.page_config(bad)["combles_url"], bad)


if __name__ == "__main__":
    unittest.main()



class BranchementsTest(unittest.TestCase):
    """Lot 6 des habillages : tes workflows branchés sur les boutons par leur nom (branchements, pack et config) ;
    l'installateur et la mise à jour retrouvent leur id dans Kronn et remplissent launch."""
    B = {"impl": {"wf": "deliver-ticket", "vars": {"ticket": "ticket_key"}, "postes": {"analyse": "plan", "develop": "code"}}}

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.pack = os.path.join(self.tmp, "bureau-vance")
        shutil.copytree(PACK, self.pack)
        Path(os.path.join(self.pack, "settings.json")).write_text(json.dumps({"branchements": {**self.B, "review": {"wf": "relire-equipe"}}}))
        self.addCleanup(shutil.rmtree, self.tmp)

    def cfg(self, **kw):
        return {**assemble.demo_config(), "team": self.pack, "owner": "p_bob", "people": [], **kw}

    def test_pack_then_config_button_by_button(self):
        b = assemble.branchements(self.cfg(branchements={"review": {"wf": "ma-revue", "vars": {"pr": "num"}}}))
        self.assertEqual(b["impl"], {"wf": "deliver-ticket", "vars": {"ticket": "ticket_key"}, "postes": {"analyse": "cadrage", "develop": "code"}})
        self.assertEqual(b["review"], {"wf": "ma-revue", "vars": {"pr": "num"}, "postes": {}})  # la config l'emporte

    def test_errors(self):
        for bad, msg in (({"deploy": {"wf": "x"}}, "bouton inconnu"), ({"impl": {"vars": {}}}, "nom du workflow"),
                         ({"impl": {"wf": "x", "vars": {"pr": "n"}}}, "rôle inconnu pr"),
                         ({"review": {"wf": "x", "postes": {"a": "code"}}}, "seul impl"), ({"impl": {"wf": "x", "postes": {"a": "cuisine"}}}, "poste inconnu")):
            with self.assertRaisesRegex(ValueError, msg):
                assemble.branchements({"branchements": bad})

    def test_resolve_by_name_and_check_variables(self):
        c = self.cfg()
        wfs = [{"id": "11111111-a", "name": "deliver-ticket", "variables": [{"name": "ticket_key"}]},
               {"id": "22222222-b", "name": "relire-equipe"}, {"id": "33333333-c", "name": "relire-equipe"}]
        found, problems = assemble.resolve_branchements(c, wfs)
        self.assertEqual(found, {"impl": {"wf": "11111111-a", "vars": {"ticket": "ticket_key"}}})
        self.assertEqual(problems, ["review : « relire-equipe » porté par 2 workflows"])
        found, problems = assemble.resolve_branchements(c, [{"id": "1", "name": "deliver-ticket", "variables": [{"name": "key"}]}])
        self.assertEqual(found, {})
        self.assertIn("ne déclare pas ticket_key", problems[0])

    def test_install_fills_launch_and_the_floor_reads_it(self):
        class K:
            calls = []

            def get(self, p):
                self.calls.append(p)
                return {"/workflows": [{"id": "11111111-a", "name": "deliver-ticket"}, {"id": "22222222-b", "name": "relire-equipe"}],
                        "/workflows/11111111-a": {"variables": [{"name": "ticket_key"}]},
                        "/workflows/22222222-b": {"variables": [{"name": "repo"}, {"name": "pr"}]}}.get(p)
        c = self.cfg(launch={"mep_pr": "c1605136-x"})
        with mock.patch("sys.stdout", new=io.StringIO()) as out:
            self.assertEqual(install.branch(K(), c), [])
        self.assertEqual(c["launch"], {"mep_pr": "c1605136-x", "impl": {"wf": "11111111-a", "vars": {"ticket": "ticket_key"}},
                                       "review": {"wf": "22222222-b"}})
        self.assertIn("bouton impl branché sur « deliver-ticket » (11111111)", out.getvalue())
        self.assertEqual(install.MODEL_LAUNCH["impl"], "impl")  # la chaîne du Bureau n'est plus proposée
        page = assemble.page_config(assemble.merged(c))
        self.assertEqual((page["atelier"], page["atelier_chain"], page["action_wf"]["impl"]), (True, "11111111", "11111111"))
        with mock.patch("sys.stdout", new=io.StringIO()):
            self.assertEqual(install.branch(K(), {**assemble.demo_config()}), [])  # rien de branché : Kronn pas interrogé


class BoutonsTest(unittest.TestCase):
    """Lot 7 des habillages : des boutons libres sur les fiches (ticket ou PR), un workflow par son nom, ses variables
    liées à la fiche ; rattachables à un agent."""
    R = {"id": "recette", "label": "🧪 Recette", "fiche": "ticket", "wf": "recette", "vars": {"ticket_key": "{ticket}", "env": "?"}, "agent": "holly"}

    def test_errors(self):
        for bad, msg in (({**self.R, "id": "Recette !"}, "id"), ({**self.R, "fiche": "sprint"}, "ticket ou pr"),
                         ({**self.R, "vars": {"pr": "{pr}"}}, "pr={pr}"), ({**self.R, "wf": ""}, "obligatoires")):
            with self.assertRaisesRegex(ValueError, msg):
                assemble.boutons({"boutons": [bad]})

    def test_install_finds_it_and_the_page_gets_its_block(self):
        class K:
            def get(self, p):
                return {"/workflows": [{"id": "abcdef12-0000", "name": "recette"}],
                        "/workflows/abcdef12-0000": {"variables": [{"name": "ticket_key"}, {"name": "env"}]}}.get(p)
        c = {**assemble.demo_config(), "boutons": [self.R], "agents": [{"key": "holly", "name": "Holly", "wf": ["11111111"]}]}
        with mock.patch("sys.stdout", new=io.StringIO()):
            self.assertEqual(install.branch(K(), c), [])
        self.assertEqual(c["boutons_wf"], {"recette": "abcdef12-0000"})
        m = assemble.merged(c)
        self.assertEqual(m["agents"][0]["wf"], ["11111111", "abcdef12"])  # rattaché à Holly : son run va à elle
        self.assertEqual(assemble.merged(m), m)
        page = assemble.page_config(m)
        self.assertEqual(page["boutons"], [{"id": "recette", "label": "🧪 Recette", "fiche": "ticket", "wf": "recette"}])
        self.assertEqual(page["action_wf"]["libre-recette"], "abcdef12")
        html = assemble.build(cfg=c)
        self.assertIn('data-action-id="bureau-libre-recette">{"kind":"workflow","target_id":"abcdef12-0000","values":[{"name":"ticket_key",'
                      '"provenance":"dynamic_binding","source_ref":"<page.dataset.actions.tickets.find(key).key>"},{"name":"env","provenance":"user_input"}]}', html)
        self.assertIn('"bureau-libre-recette":{"ticket_key":"key"}', html)
        self.assertNotIn("<!--__BOUTONS__-->", html)

    def test_missing_workflow_or_variable(self):
        class K:
            def get(self, p):
                return {"/workflows": [{"id": "abcdef12-0000", "name": "recette"}], "/workflows/abcdef12-0000": {"variables": [{"name": "key"}]}}.get(p)
        c = {**assemble.demo_config(), "boutons": [self.R, {**self.R, "id": "autre", "wf": "absent"}]}
        with mock.patch("sys.stdout", new=io.StringIO()):
            problems = install.branch(K(), c)
        self.assertEqual(c["boutons_wf"], {})
        self.assertEqual(len(problems), 2)
        self.assertNotIn("data-action-id=\"bureau-libre-", assemble.build(cfg=c))
