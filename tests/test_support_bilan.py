"""Page « Support · bilan » (python3 -m unittest tests/test_support_bilan.py) : workflows/support_bilan.py relève l'API Kronn
(bouchonnée) : agents du parent et des postes (sous-workflows), passages à la gate et décision, run fini lu une fois ; puis
assemble l'historique (support.py) et ce relevé : temps de réponse en heures ouvrées, causes de tes retours, projet des
vieux runs, sujet d'un message transféré, chiffre clé du vidéoprojecteur, dataset borné ; enfin le modèle du cron et sa page."""
import copy, datetime, json, os, shutil, sys, tempfile, unittest
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
sys.path.insert(0, os.path.join(ROOT, "workflows"))
import templates  # noqa: E402

BASE = json.loads(Path(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json")).read_text())
MODELS = {"support": "wsup", "support_tri": "wtri", "support_cause": "wcause"}
NOW = datetime.datetime(2026, 11, 2, 16, 0, tzinfo=datetime.timezone.utc)


def agent(n, ms, cost, model="claude-sonnet-5", s="Success", at="2026-11-02T10:16:00Z"):
    return {"step_name": n, "step_kind": "Agent", "status": s, "duration_ms": ms, "tokens_used": 1000, "started_at": at,
            "step_model": model, "agent_provenance": {"attempts": [{"cost_usd": cost}]}}


def step(n, ms=100, s="Success", at="2026-11-02T10:15:00Z", kind="Exec"):
    return {"step_name": n, "step_kind": kind, "status": s, "duration_ms": ms, "started_at": at}


class SupportBilanTest(unittest.TestCase):
    def setUp(self):
        import support_bilan
        self.m = support_bilan
        self.tmp = tempfile.mkdtemp()
        self.old = (support_bilan.get, support_bilan.CACHE, dict(support_bilan.CFG), dict(support_bilan.S), dict(support_bilan.R))
        support_bilan.CFG.clear()
        support_bilan.CFG.update({**copy.deepcopy(BASE), "models": MODELS})
        support_bilan.S.clear()
        support_bilan.S.update({"name": "Support Scranton", "historique": os.path.join(self.tmp, "hist")})
        support_bilan.R.clear()
        support_bilan.R.update({"office_hours": [8, 20], "weekend": ["Sat", "Sun"]})
        support_bilan.CACHE = os.path.join(self.tmp, "cache")
        self.calls = []
        self.runs = {
            "wsup": [{"id": "r1", "status": "Success", "started_at": "2026-11-02T10:15:00Z"},
                     {"id": "r2", "status": "Failed", "started_at": "2026-10-21T13:00:00Z"},
                     {"id": "r3", "status": "Success", "started_at": "2026-10-21T14:25:00Z"},
                     {"id": "r4", "status": "WaitingApproval", "started_at": "2026-11-02T15:00:00Z"},
                     {"id": "rp", "status": "Pending"}],
            "wtri": [{"id": "t1", "parent_run_id": "r1"}, {"id": "t4", "parent_run_id": "r4"}],
            "wcause": [{"id": "c1", "parent_run_id": "r1"}]}
        self.details = {
            "r1": {"status": "Success", "started_at": "2026-11-02T10:15:00Z", "finished_at": "2026-11-02T10:45:00Z", "step_results": [
                step("open"), step("tri", 60000, kind="SubWorkflow"), step("cause", 300000, kind="SubWorkflow"),
                step("gate", 600000, at="2026-11-02T10:20:00Z", kind="Gate"), step("reponse", kind="SubWorkflow"),
                step("gate", 120000, at="2026-11-02T10:31:00Z", kind="Gate"), step("post", 3000, at="2026-11-02T10:44:00Z")]},
            "t1": {"step_results": [step("entree"), agent("agent", 40000, 0.02, "claude-haiku-4-5"), step("rapport")]},
            "c1": {"step_results": [agent("agent", 100000, 0.3, s="Failed"), agent("agent", 200000, 0.4)]},
            "r2": {"status": "Failed", "started_at": "2026-10-21T13:00:00Z", "step_results": [
                step("open"), agent("investigate", 114000, 0.229), step("gate", 3185000, s="Failed", kind="Gate")]},
            "r3": {"status": "Success", "started_at": "2026-10-21T14:25:00Z", "step_results": [
                agent("investigate", 246000, 0.545), step("gate", 111000, kind="Gate"), step("post")]},
            "r4": {"status": "WaitingApproval", "started_at": "2026-11-02T15:00:00Z", "step_results": [step("tri", kind="SubWorkflow"), step("gate", 0, "WaitingApproval", kind="Gate")]},
            "t4": {"step_results": [agent("agent", 30000, 0.01)]},
        }

        def get(path, timeout=120):
            self.calls.append(path)
            if path == "/projects":
                return [{"id": "pid-site", "name": "site-web"}]
            if "/runs?limit" in path:
                return self.runs[path.split("/")[2]]
            return self.details[path.rsplit("/", 1)[1]]
        support_bilan.get = get
        h = Path(self.tmp, "hist")
        h.mkdir()
        self.hist = {
            # dimanche soir, répondu lundi 11h44 à Paris (10h44 UTC) : 3 h 44 ouvrées, 14 h 11 en tout
            "11": {"msg": "11", "at": "2026-11-01T20:33:00Z", "from": "Priol, Romuald", "subject": "404 dans le menu", "extrait": "x",
                   "url": "https://teams/11", "state": "done", "reactions": ["👍"], "replies": 0,
                   "runs": {"r1": {"at": "2026-11-02T10:15:00Z", "project": "pid-site", "project_name": "site-web", "disc": "d1",
                                   "comment": "check", "version": 2,
                                   "postes": {"tri": {"categorie": "contenu", "urgence": "basse", "deja_traite": True},
                                              "cause": {"certitude": "supposee", "piste": "valider les liens du menu"},
                                              "logs": {"verifs": 2, "outils": ["Fastly"]}},
                                   "renvois": 1, "retours": [{"at": "x", "texte": "Trop long, sois plus concis"}]}},
                   "reponse": {"at": "2026-11-02T10:44:00Z", "run": "r1", "texte": "🔎 Cause : slug"}},
            "12": {"msg": "12", "at": "2026-10-21T12:54:00Z", "from": "Astruc, Laureen", "subject": None,
                   "extrait": "↪ Message transféré :\nSouci de swipe", "state": "resolved", "relance": True, "reactions": [],
                   "runs": {"r2": {"at": "2026-10-21T13:00:00Z", "project": "pid-site"}, "r3": {"at": "2026-10-21T14:25:00Z", "project": "pid-site"}},
                   "reponse": {"at": "2026-10-21T14:31:00Z", "run": "r3", "texte": "ok"}},
            "13": {"msg": "13", "at": "2026-10-28T08:08:00Z", "from": "Jas, Alexandre", "subject": "Publier", "state": "skipped", "runs": {}},
            "14": {"msg": "14", "at": "2026-11-02T14:58:00Z", "from": "Beesly, Pam", "subject": "En cours", "state": "gate",
                   "runs": {"r4": {"at": "2026-11-02T15:00:00Z", "project": "pid-site", "project_name": "site-web"}}},
            "15": {"msg": "15", "at": "2026-06-01T08:00:00Z", "from": "X", "subject": "trop vieux", "state": "done", "runs": {}},
        }
        for k, v in self.hist.items():
            Path(h, k + ".json").write_text(json.dumps(v))

    def tearDown(self):
        self.m.get, self.m.CACHE = self.old[:2]
        for live, saved in ((self.m.CFG, self.old[2]), (self.m.S, self.old[3]), (self.m.R, self.old[4])):
            live.clear()
            live.update(saved)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_releve_reads_agents_of_the_parent_and_of_the_postes(self):
        res = self.m.releve()
        self.assertEqual((res["lus"], res["en_cache"]), (4, 0), "le run Pending n'est pas lu")
        c = json.loads(Path(self.tmp, "cache", "r1.json").read_text())
        self.assertEqual(c["postes"]["tri"], {"ms": 40000, "tok": 1000, "cout": 0.02, "modele": "claude-haiku-4-5", "passages": 1, "echecs": 0})
        self.assertEqual((c["postes"]["cause"]["ms"], c["postes"]["cause"]["cout"], c["postes"]["cause"]["echecs"]), (300000, 0.7, 1),
                         "un essai en échec puis relancé compte dans le poste")
        self.assertEqual(c["gate"], {"visites": 2, "changements": 1, "attente_ms": 720000, "decision": "approuvee"})
        self.assertEqual([s["n"] for s in c["deroule"]], ["open", "tri", "cause", "gate", "reponse", "gate", "post"])
        r2 = json.loads(Path(self.tmp, "cache", "r2.json").read_text())
        self.assertEqual((r2["postes"]["investigation"]["cout"], r2["gate"]["decision"]), (0.229, "refusee"), "ancien modèle : un agent")
        self.assertEqual(json.loads(Path(self.tmp, "cache", "r4.json").read_text())["gate"]["decision"], "en_attente")
        # au passage suivant, seuls les runs encore actifs sont relus
        self.calls.clear()
        res = self.m.releve()
        self.assertEqual((res["lus"], res["en_cache"]), (1, 3))
        self.assertNotIn("/workflows/wsup/runs/r1", self.calls)
        self.assertIn("/workflows/wsup/runs/r4", self.calls)

    def test_bilan_joins_the_history_and_the_releve(self):
        self.m.releve()
        out = self.m.bilan(NOW)
        rows = {d["msg"]: d for d in out["demandes"]}
        self.assertEqual([d["msg"] for d in out["demandes"]], ["14", "11", "13", "12"], "90 jours, la plus récente d'abord")
        r = rows["11"]
        self.assertEqual((r["from"], r["projet"], r["categorie"], r["certitude"], r["piste"], r["verifs"], r["outils"]),
                         ("Romuald", "site-web", "contenu", "supposee", "valider les liens du menu", 2, ["Fastly"]))
        self.assertEqual((r["reponse_s"], r["reponse_brut_s"]), (3 * 3600 + 44 * 60, 14 * 3600 + 11 * 60), "heures ouvrées : lundi 8h -> 11h44 à Paris")
        self.assertEqual((r["cout"], r["gate"]["changements"], r["renvois"], r["causes"]), (0.72, 1, 1, ["longueur"]))
        r = rows["12"]
        self.assertEqual((r["subject"], r["projet"], r["runs"], r["gate"]["refus"], r["gate"]["decision"]), ("Souci de swipe", "site-web", 2, 1, "approuvee"),
                         "sujet d'un message transféré, nom du projet d'un vieux run, refus puis relance")
        self.assertEqual((r["relance"], r["resolu"], r["cout"]), (True, True, 0.774))
        self.assertEqual((rows["13"]["runs"], rows["13"]["state"]), (0, "skipped"))
        self.assertEqual(sorted(out["fiches"]), ["11", "12", "14"], "fiches des demandes investiguées")
        f = out["fiches"]["11"]
        self.assertEqual((f["comment"], f["versions"], f["retours"][0]["cause"], f["deroule"][0]["n"]), ("check", 2, "longueur", "open"))
        self.assertEqual(out["kpi"], {"value": "2 h 40", "label": "médiane avant réponse (h. ouvrées)", "short": "Support · bilan"})
        self.assertEqual(set(out["kpi"]), {"value", "label", "short"})  # contrat du vidéoprojecteur (pages_snapshot.kpi_of)
        self.assertTrue(len(out["kpi"]["value"]) <= 16 and len(out["kpi"]["label"]) <= 40 and len(out["kpi"]["short"]) <= 18)
        self.assertEqual((out["canal"], out["heures"]["debut"], out["error"]), ("Support Scranton", 8, None))

    def test_business_hours_skip_nights_and_weekends(self):
        w = lambda s: datetime.datetime.fromisoformat(s)  # noqa: E731
        self.assertEqual(self.m.ouvrees(w("2026-10-30T18:00:00+01:00"), w("2026-11-02T09:00:00+01:00")), 3 * 3600, "vendredi 18h -> lundi 9h")
        self.assertEqual(self.m.ouvrees(w("2026-10-31T10:00:00+01:00"), w("2026-10-31T12:00:00+01:00")), 0, "samedi")
        self.assertEqual(self.m.ouvrees(w("2026-11-02T09:00:00+01:00"), w("2026-11-02T09:30:00+01:00")), 1800)
        self.assertIsNone(self.m.ouvrees(None, w("2026-11-02T09:00:00+01:00")))

    def test_causes_of_your_feedback(self):
        self.assertEqual([self.m.cause_of(t) for t in ("Trop long", "C'est faux, vérifie les logs", "Ajoute le lien du ticket",
                                                        "En anglais stp", "ok merci")],
                         ["longueur", "exactitude", "action", "ton", "autre"])

    def test_kronn_down_still_publishes_the_history(self):
        def down(path, timeout=120):
            raise OSError("connexion refusée")
        self.m.get = down
        out = self.m.bilan(NOW)
        self.assertEqual(len(out["demandes"]), 4)
        self.assertEqual({d["msg"]: d["projet"] for d in out["demandes"]}["12"], "pid-site", "projet sans nom : son id")

    def test_dataset_stays_under_the_limit(self):
        out = self.m.bilan(NOW)
        out["fiches"] = {f"x{i}": {"reponse": "y" * 20000} for i in range(10)}
        small = self.m.borne(out)
        self.assertLessEqual(len(json.dumps(small, ensure_ascii=False).encode()), self.m.MAX_OUT)
        self.assertEqual(len(small["demandes"]), 4)  # les fiches partent d'abord

    def test_no_investigation_model_reads_nothing(self):
        self.m.CFG["models"] = {}
        self.assertEqual(self.m.releve(), {"lus": 0, "en_cache": 0, "error": None})


class SupportBilanModeleTest(unittest.TestCase):
    def cfg(self, **over):
        c = copy.deepcopy(BASE)
        c["support"] = {"team": "T1", "channel": "19:canal@thread.tacv2"}
        c["models"] = {"support": "11111111-0000-4000-8000-000000000001"}
        c.update(over)
        return c

    def test_cron_archives_then_reads_kronn_then_publishes(self):
        c = self.cfg(support_bilan_page_id="22222222-0000-4000-8000-000000000003")
        self.assertFalse(templates.skipped("support_bilan", c))
        d = templates.render(templates.load_templates()["support_bilan"], c)
        steps = {s["name"]: s for s in d["steps"]}
        self.assertEqual(list(steps), ["archive", "releve", "bilan", "publish"])
        self.assertEqual(steps["archive"]["exec_args"][2:], ["archive"])
        self.assertIn("def archive", steps["archive"]["exec_args"][1])
        self.assertEqual((steps["releve"]["exec_args"][2:], steps["bilan"]["exec_args"][2:]), (["releve"], ["bilan"]))
        self.assertIn("def releve", steps["bilan"]["exec_args"][1])
        pub = steps["publish"]["page_publish"]
        self.assertEqual((pub["page_id"], pub["writes"][0]["dataset"], pub["writes"][0]["value_from"]),
                         ("22222222-0000-4000-8000-000000000003", "support_bilan", "steps.bilan.data.stdout"))
        self.assertTrue(d["trigger"]["schedule"].startswith("11-59/15 "))

    def test_not_created_without_the_investigation_its_channel_or_its_page(self):
        self.assertTrue(templates.skipped("support_bilan", self.cfg()))  # pas de page
        self.assertTrue(templates.skipped("support_bilan", self.cfg(models={}, support_bilan_page_id="x")))
        self.assertTrue(templates.skipped("support_bilan", self.cfg(support={}, support_bilan_page_id="x")))

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
                    self.pages["p2"] = {"id": "p2", "datasets": body["datasets"]}
                    return {"id": "p2"}
                return {}
        k, say = K(), install.say
        install.say = lambda m: None
        try:
            self.assertEqual(install.upsert_side_page(k, {}, "support_bilan_page_id", False), "p2")
            self.assertEqual(k.calls, [("POST", "/pages", "Support · bilan")])
            self.assertEqual([d["name"] for d in k.pages["p2"]["datasets"]], ["support_bilan"])
            self.assertEqual(install.upsert_side_page(k, {"support_bilan_page_id": "p2"}, "support_bilan_page_id", False), "p2")
            self.assertEqual(len(k.calls), 1, "gardée, rien de recréé")
            self.assertTrue(install.upsert_side_page(k, {}, "support_bilan_page_id", True).endswith("b2"))
        finally:
            install.say = say
        self.assertIn("<title>Support · bilan</title>", install.side_html("support_bilan_page_id"))
        self.assertIn("support_bilan", install.CRONS)


if __name__ == "__main__":
    unittest.main()
