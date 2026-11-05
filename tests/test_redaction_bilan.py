"""Page « Rédaction · bilan » (python3 -m unittest tests/test_redaction_bilan.py) : workflows/redaction_bilan.py relève l'API
Kronn (bouchonnée) : agents des postes (sous-workflows), passages au tampon et décision, créations, run fini lu une fois ;
puis assemble l'historique (ticket.py) et ce relevé : issue de chaque intention, notes de la critique classées et celles
qui reviennent, causes de tes retours, run d'avant l'historique lu dans son dossier, chiffre clé du vidéoprojecteur,
dataset borné ; enfin le modèle du cron et sa page."""
import copy, datetime, json, os, shutil, sys, tempfile, unittest
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
sys.path.insert(0, os.path.join(ROOT, "workflows"))
import templates  # noqa: E402

BASE = json.loads(Path(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json")).read_text())
MODELS = {"ticket": "wtk", "ticket_recherche": "wrech", "ticket_redaction": "wred", "ticket_critique": "wcri", "ticket_un": "wun"}
NOW = datetime.datetime(2026, 11, 4, 16, 0, tzinfo=datetime.timezone.utc)


def agent(ms, cost, tok=1000, model="claude-sonnet-5"):
    return {"step_name": "agent", "step_kind": "Agent", "status": "Success", "duration_ms": ms, "tokens_used": tok,
            "step_model": model, "agent_provenance": {"attempts": [{"cost_usd": cost}]}}


def step(n, ms=100, s="Success", at="2026-11-04T10:00:00Z", kind="SubWorkflow"):
    return {"step_name": n, "step_kind": kind, "status": s, "duration_ms": ms, "started_at": at}


class RedactionBilanTest(unittest.TestCase):
    def setUp(self):
        import redaction_bilan
        self.m = redaction_bilan
        self.tmp = tempfile.mkdtemp()
        self.old = (redaction_bilan.get, redaction_bilan.CACHE, redaction_bilan.DOSSIERS, dict(redaction_bilan.CFG))
        redaction_bilan.CFG.clear()
        redaction_bilan.CFG.update({**copy.deepcopy(BASE), "models": MODELS})
        redaction_bilan.CFG["jira"]["create"] = {"historique": os.path.join(self.tmp, "hist")}
        redaction_bilan.CACHE = os.path.join(self.tmp, "cache")
        redaction_bilan.DOSSIERS = os.path.join(self.tmp, "dossiers")
        self.calls = []
        self.runs = {
            "wtk": [{"id": "r1", "status": "Success"}, {"id": "r2", "status": "Failed"}, {"id": "r3", "status": "WaitingApproval"},
                    {"id": "r0", "status": "Failed"}, {"id": "rp", "status": "Pending"}],
            "wrech": [{"id": "a1", "parent_run_id": "r1"}], "wred": [{"id": "b1", "parent_run_id": "r1"}, {"id": "b2", "parent_run_id": "r1"}],
            "wcri": [{"id": "c1", "parent_run_id": "r1"}], "wun": [{"id": "u1", "parent_run_id": "r1", "status": "Success"},
                                                                 {"id": "u2", "parent_run_id": "r1", "status": "Success"},
                                                                 {"id": "u0", "parent_run_id": "r0", "status": "Failed"}]}
        self.details = {
            "r1": {"status": "Success", "started_at": "2026-11-04T10:00:00Z", "finished_at": "2026-11-04T10:31:00Z", "step_results": [
                step("dossier", kind="Exec"), step("recherche", 240000), step("redaction"), step("critique"),
                step("aiguillage", s="Failed", kind="Exec"), step("redaction"), step("critique"),
                step("relire", 300000, at="2026-11-04T10:14:00Z", kind="Gate"), step("redaction"), step("critique"),
                step("relire", 60000, at="2026-11-04T10:25:00Z", kind="Gate"), step("chaque", at="2026-11-04T10:30:00Z")]},
            "a1": {"step_results": [step("entree", kind="Exec"), agent(240000, 0.38, 9000)]},
            "b1": {"step_results": [agent(100000, 0.15)]}, "b2": {"step_results": [agent(80000, 0.15)]},
            "c1": {"step_results": [agent(40000, 0.09)]},
            "r2": {"status": "Failed", "started_at": "2026-11-03T09:00:00Z", "finished_at": "2026-11-03T09:20:00Z", "step_results": [
                step("recherche"), step("relire", 900000, s="Failed", at="2026-11-03T09:05:00Z", kind="Gate")]},
            "r3": {"status": "WaitingApproval", "started_at": "2026-11-04T15:00:00Z", "step_results": [
                step("recherche"), step("relire", 0, s="WaitingApproval", at="2026-11-04T15:10:00Z", kind="Gate")]},
            "r0": {"status": "Failed", "started_at": "2026-11-02T08:00:00Z", "finished_at": "2026-11-02T08:30:00Z", "step_results": [
                step("relire", 1000, at="2026-11-02T08:20:00Z", kind="Gate"), step("chaque", s="Failed", at="2026-11-02T08:29:00Z")]},
        }

        def get(path, timeout=120):
            self.calls.append(path)
            if "/runs?limit" in path:
                return self.runs[path.split("/")[2]]
            return self.details[path.rsplit("/", 1)[1]]
        redaction_bilan.get = get
        h = Path(self.tmp, "hist")
        h.mkdir()
        v = lambda n, *s: {"v": n, "tickets": [{"summary": x, "composant": "dm/site", "points": 3} for x in s]}  # noqa: E731
        self.hist = {
            "r1": {"run": "r1", "at": "2026-11-04T10:00:00Z", "intention": "Refondre le lecteur vidéo", "type": "Story", "points": "5",
                   "composants": ["dm/site"], "tour": 2, "essai": False, "recherche": {"composants": ["dm/site", "dm/api"],
                                                                                         "texte": "Composants : dm/site, dm/api\n- site/Player.vue : le lecteur\n* api/tracks.rs"},
                   "versions": [v(1, "Player: subtitles", "Pistes"), v(2, "Lecteur : sous-titres", "Pistes"), v(3, "Lecteur : sous-titres", "Pistes audio")],
                   "critiques": [{"v": 1, "verdict": "a_retoucher", "notes": [{"ticket": 1, "note": "Titre en anglais"}, {"ticket": 2, "note": "Comment tester ?"}]},
                                 {"v": 2, "verdict": "a_retoucher", "notes": [{"ticket": 1, "note": "toujours en anglais"}]},
                                 {"v": 3, "verdict": "ok", "notes": []}],
                   "retours": [{"at": "x", "texte": "Fusionne T1 et T2", "v": 2}],
                   "crees": [{"i": 0, "key": "DM-7853", "title": "Lecteur : sous-titres", "composant": "dm/site", "points": "3"},
                             {"i": 1, "key": "DM-7854", "title": "Pistes audio", "composant": "dm/site"}]},
            "r2": {"run": "r2", "at": "2026-11-03T09:00:00Z", "intention": "[ESSAI du Bureau] aria-label", "essai": True,
                   "versions": [v(1, "A")], "critiques": [{"v": 1, "verdict": "a_retoucher", "notes": [{"ticket": 0, "note": "à découper"}]}]},
            "r3": {"run": "r3", "at": "2026-11-04T15:00:00Z", "intention": "Export CSV", "versions": [v(1, "Export")]},
            "vieux": {"run": "vieux", "at": "2026-06-01T08:00:00Z", "intention": "trop vieux"},
        }
        for k, x in self.hist.items():
            Path(h, k + ".json").write_text(json.dumps(x))
        # r0 : d'avant l'historique, seul son dossier reste
        d = Path(self.tmp, "dossiers", "r0")
        d.mkdir(parents=True)
        Path(d, "demande.json").write_text(json.dumps({"intention": "Pagination", "type": "Tâche", "tour": 1, "composants": ["dm/api"]}))
        Path(d, "tickets.json").write_text(json.dumps({"version": 1, "tickets": [{"summary": "Paginer", "composant": "dm/api", "points": 2}]}))

    def tearDown(self):
        self.m.get, self.m.CACHE, self.m.DOSSIERS = self.old[:3]
        self.m.CFG.clear()
        self.m.CFG.update(self.old[3])
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_releve_reads_the_postes_the_stamp_and_the_creations(self):
        res = self.m.releve()
        self.assertEqual((res["lus"], res["en_cache"]), (4, 0), "le run Pending n'est pas lu")
        c = json.loads(Path(self.tmp, "cache", "r1.json").read_text())
        self.assertEqual(c["postes"]["recherche"], {"ms": 240000, "tok": 9000, "cout": 0.38, "modele": "claude-sonnet-5", "passages": 1})
        self.assertEqual((c["postes"]["redaction"]["passages"], c["postes"]["redaction"]["cout"]), (2, 0.3))
        self.assertEqual(c["gate"], {"visites": 2, "changements": 1, "attente_ms": 360000, "decision": "approuvee", "at": "2026-11-04T10:14:00Z"})
        self.assertEqual((c["creations"], c["panne"]), ({"ok": 2, "echecs": 0}, None), "l'aiguillage en échec est un renvoi, pas une panne")
        self.assertEqual([s["n"] for s in c["deroule"]][:4], ["recherche", "redaction", "critique", "redaction"])
        # passage par passage (la fiche : rédaction v1, v2…), avec le coût et le modèle de chacun
        self.assertEqual([(x["n"], x["cout"]) for x in c["passages"] if x["n"] == "redaction"], [("redaction", 0.15), ("redaction", 0.15)])
        self.assertEqual(c["passages"][0]["modele"], "claude-sonnet-5")
        self.assertEqual(json.loads(Path(self.tmp, "cache", "r2.json").read_text())["gate"]["decision"], "rejetee")
        self.assertEqual(json.loads(Path(self.tmp, "cache", "r3.json").read_text())["gate"]["decision"], "en_attente")
        r0 = json.loads(Path(self.tmp, "cache", "r0.json").read_text())
        self.assertEqual((r0["panne"], r0["creations"]), ("chaque", {"ok": 0, "echecs": 1}))
        self.calls.clear()
        res = self.m.releve()
        self.assertEqual((res["lus"], res["en_cache"]), (1, 3), "seul le run encore actif est relu")
        self.assertNotIn("/workflows/wtk/runs/r1", self.calls)
        c = json.loads(Path(self.tmp, "cache", "r1.json").read_text())
        del c["passages"]
        Path(self.tmp, "cache", "r1.json").write_text(json.dumps(c))
        self.assertEqual(self.m.releve()["lus"], 2, "un cache d'avant le coût par passage est relu une fois")

    def test_bilan_joins_the_history_and_the_releve(self):
        self.m.releve()
        out = self.m.bilan(NOW)
        rows = {r["run"]: r for r in out["intentions"]}
        self.assertEqual([r["run"] for r in out["intentions"]], ["r3", "r1", "r2", "r0"], "90 jours, la plus récente d'abord")
        r = rows["r1"]
        self.assertEqual((r["issue"], r["proposes"], r["versions"], r["tours"], r["composants"]), ("cree", 2, 3, 2, ["dm/site", "dm/api"]))
        self.assertEqual([(c["key"], c["points"]) for c in r["crees"]], [("DM-7853", "3"), ("DM-7854", 3)], "points de la version créée")
        self.assertEqual((r["duree_ms"], r["avant_tampon_ms"], r["cout"], r["tok"]), (31 * 60000, 14 * 60000, 0.77, 12000))
        self.assertEqual(r["critique"], {"notes": ["langue", "criteres", "langue"], "revenues": ["langue"], "tours": 3, "reserves": False})
        self.assertEqual((r["causes"], r["gate"]["changements"]), (["decoupage"], 1))
        self.assertEqual((rows["r2"]["issue"], rows["r2"]["essai"], rows["r2"]["critique"]["reserves"]), ("rejetee", True, True))
        self.assertEqual(rows["r3"]["issue"], "attente")
        r0 = rows["r0"]
        self.assertEqual((r0["issue"], r0["panne"], r0["partiel"], r0["intention"], r0["proposes"], r0["creations_ko"]), ("panne", "chaque", True, "Pagination", 1, 1))
        f = out["fiches"]["r1"]
        self.assertEqual(f["recherche"], {"composants": ["dm/site", "dm/api"], "pistes": ["site/Player.vue : le lecteur", "api/tracks.rs"]})
        self.assertEqual(([v["v"] for v in f["versions"]], f["critiques"][0]["notes"][0]["note"], f["retours"][0]["cause"]), ([1, 2, 3], "Titre en anglais", "decoupage"))
        self.assertEqual(out["kpi"], {"value": "2", "label": "tickets créés (30 j) · 0,39 $ / ticket", "short": "Rédaction · bilan"},
                         "hors essais")
        self.assertTrue(len(out["kpi"]["value"]) <= 16 and len(out["kpi"]["label"]) <= 40 and len(out["kpi"]["short"]) <= 18)
        self.assertEqual((out["jira_site"], out["error"]), ("https://dunder-mifflin.atlassian.net", None))

    def test_notes_and_causes_by_keywords(self):
        self.assertEqual([self.m.classe(t, self.m.NOTES) for t in ("Le titre est en anglais", "Aucun critère d'acceptation", "Trop large, à découper",
                                                                   "Ce fichier n'existe pas", "Doublon de DM-12", "5 points, c'est beaucoup",
                                                                   "Mauvais projet", "Bien")],
                         ["langue", "criteres", "decoupage", "invente", "doublon", "points", "composant", "autre"])
        self.assertEqual([self.m.classe(t, self.m.CAUSES) for t in ("retire T2", "mauvais composant", "trop long", "le titre", "T1 : 5 pts", "ok")],
                         ["decoupage", "projet", "longueur", "titre", "points", "autre"])

    def test_kronn_down_still_publishes_the_history(self):
        def down(path, timeout=120):
            raise OSError("connexion refusée")
        self.m.get = down
        out = self.m.bilan(NOW)
        self.assertEqual(sorted(r["run"] for r in out["intentions"]), ["r1", "r2", "r3"], "sans relevé, le dossier r0 n'est pas retrouvé")
        self.assertTrue(all(r["partiel"] for r in out["intentions"]))

    def test_dataset_stays_under_the_limit(self):
        out = self.m.bilan(NOW)
        out["fiches"] = {f"x{i}": {"intention": "y" * 20000} for i in range(10)}
        small = self.m.borne(out)
        self.assertLessEqual(len(json.dumps(small, ensure_ascii=False).encode()), self.m.MAX_OUT)
        self.assertEqual(len(small["intentions"]), 3)

    def test_no_ticket_model_reads_nothing(self):
        self.m.CFG["models"] = {}
        self.assertEqual(self.m.releve(), {"lus": 0, "en_cache": 0, "error": None})


class RedactionBilanModeleTest(unittest.TestCase):
    def cfg(self, **over):
        c = copy.deepcopy(BASE)
        c["models"] = {"ticket": "11111111-0000-4000-8000-000000000001"}
        c.update(over)
        return c

    def test_cron_reads_kronn_then_publishes(self):
        c = self.cfg(redaction_bilan_page_id="22222222-0000-4000-8000-000000000004")
        self.assertFalse(templates.skipped("redaction_bilan", c))
        d = templates.render(templates.load_templates()["redaction_bilan"], c)
        steps = {s["name"]: s for s in d["steps"]}
        self.assertEqual(list(steps), ["releve", "bilan", "publish"])
        self.assertEqual((steps["releve"]["exec_args"][2:], steps["bilan"]["exec_args"][2:]), (["releve"], ["bilan"]))
        self.assertIn("def releve", steps["bilan"]["exec_args"][1])
        pub = steps["publish"]["page_publish"]
        self.assertEqual((pub["page_id"], pub["writes"][0]["dataset"], pub["writes"][0]["value_from"]),
                         ("22222222-0000-4000-8000-000000000004", "redaction_bilan", "steps.bilan.data.stdout"))
        self.assertTrue(d["trigger"]["schedule"].startswith("13-59/15 "))

    def test_not_created_without_the_ticket_model_or_its_page(self):
        self.assertTrue(templates.skipped("redaction_bilan", self.cfg()))
        self.assertTrue(templates.skipped("redaction_bilan", self.cfg(models={}, redaction_bilan_page_id="x")))

    def test_install_creates_the_page_once_with_its_dataset(self):
        import install

        class K:
            def __init__(self):
                self.calls, self.pages = [], {}

            def get(self, path):
                if path.split("/")[-1] not in self.pages:
                    raise install.InstallError("introuvable")
                return self.pages[path.split("/")[-1]]

            def call(self, method, path, body=None, timeout=60):
                self.calls.append((method, path, (body or {}).get("title")))
                if path == "/pages":
                    self.pages["p3"] = {"id": "p3", "datasets": body["datasets"]}
                    return {"id": "p3"}
                return {}
        k, say = K(), install.say
        install.say = lambda m: None
        try:
            self.assertEqual(install.upsert_side_page(k, {}, "redaction_bilan_page_id", False), "p3")
            self.assertEqual(k.calls, [("POST", "/pages", "Rédaction · bilan")])
            self.assertEqual([d["name"] for d in k.pages["p3"]["datasets"]], ["redaction_bilan"])
            self.assertTrue(install.upsert_side_page(k, {}, "redaction_bilan_page_id", True).endswith("b3"))
        finally:
            install.say = say
        self.assertIn("<title>Rédaction · bilan</title>", install.side_html("redaction_bilan_page_id"))
        self.assertIn("redaction_bilan", install.CRONS)


if __name__ == "__main__":
    unittest.main()
