"""Page « Chaîne · bilan » (python3 -m unittest tests/test_chaine_bilan.py) : workflows/chaine_bilan.py lit les bilans de
l'historique (chaine.py) et l'API Kronn (bouchonnée) : jetons par poste (sous-workflows compris), jetons perdus, attente
aux gates, issue finale (panne, rejet), runs sans bilan repris en partiel, chiffre clé du vidéoprojecteur hors essais,
consommation d'un run fini gardée en cache, dataset borné ; puis le modèle du cron et son installation."""
import copy, datetime, json, os, shutil, sys, tempfile, unittest
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
sys.path.insert(0, os.path.join(ROOT, "workflows"))
import templates  # noqa: E402

BASE = json.loads(Path(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json")).read_text())
MODELS = {"impl_chain": "chain", "impl_code": "wcode", "impl_controles": "wctrl", "impl_cadrage": "wcad"}
NOW = datetime.datetime(2026, 11, 1, 12, 0, tzinfo=datetime.timezone.utc)


def bilan(run, ticket, version, debut, essai=False, issue="pr_prete"):
    return {"v": 1, "ticket": ticket, "titre": "Titre " + ticket, "repo": "dm/site", "run": run, "mode": "complet", "essai": essai,
            "debut": debut, "issue": issue, "pr": {"n": "12", "url": "u"}, "version": {"hash": version, "commit": "c", "sujet": "s " + version},
            "tours": {"propositions": {"cadrage": 2}, "essais_code": 1, "controles": 2, "escalades": 0},
            "retours": {"n": 1, "par_gate": {"plan": 1}, "par_cause": {"perimetre": 1}, "liste": [{"gate": "plan", "cause": "perimetre", "texte": "x"}]},
            "schema": {"mermaid": "flowchart LR\n A-->B", "prevus": ["a", "b"], "touches": ["a", "c"], "prevus_touches": 1,
                       "touches_non_prevus": ["c"], "prevus_non_touches": ["b"]},
            "plan": {"lots": 1, "titres": ["l"]}, "exigences": {"compte": {"fait": 3, "partiel": 1}, "liste": [{"exigence": "e", "etat": "fait"}]},
            "doc": {"statuts": {}, "fichiers": [{"fichier": "docs/a.md", "plus": 4, "moins": 1}], "a_mettre_a_jour": ["guide/x.md"]},
            "diff": {"code": {"fichiers": 1, "plus": 10, "moins": 2}, "tests": {"fichiers": 1, "plus": 5, "moins": 0}, "doc": {"fichiers": 1, "plus": 4, "moins": 1}},
            "controles": {"securite": {"statut": "ok", "tours": 2, "bloquants": {"trouves": 1, "corriges": 1, "restes": 0},
                                       "avis": {"trouves": 0, "corriges": 0, "restes": 0}}},
            "resume": {"comprehension": "c", "orchestrateur": "o", "decision": "livrer"}}


class ChaineBilanTest(unittest.TestCase):
    def setUp(self):
        import chaine_bilan
        self.m = chaine_bilan
        self.tmp = tempfile.mkdtemp()
        self.old = (chaine_bilan.get, chaine_bilan.CACHE, dict(chaine_bilan.CFG))
        chaine_bilan.CFG.clear()
        chaine_bilan.CFG.update({**copy.deepcopy(BASE), "models": MODELS, "impl": {"historique": os.path.join(self.tmp, "hist")}})
        chaine_bilan.CACHE = os.path.join(self.tmp, "cache")
        self.calls = []
        st = lambda n, tok=0, s="Success", ms=1000, at="2026-10-30T10:00:00Z", out="": {  # noqa: E731
            "step_name": n, "tokens_used": tok, "status": s, "duration_ms": ms, "started_at": at, "output": out}
        self.runs = {
            "chain": [{"id": "r1", "status": "Success", "started_at": "2026-10-30T10:00:00Z", "finished_at": "2026-10-30T12:00:00Z"},
                      {"id": "r2", "status": "Success", "started_at": "2026-10-20T10:00:00Z", "finished_at": "2026-10-20T11:00:00Z"},
                      {"id": "r3", "status": "Failed", "started_at": "2026-10-29T10:00:00Z", "finished_at": "2026-10-29T10:30:00Z"},
                      {"id": "r4", "status": "Failed", "started_at": "2026-10-31T10:00:00Z", "finished_at": "2026-10-31T11:00:00Z"},
                      {"id": "old", "status": "Success", "started_at": "2026-08-01T10:00:00Z"}],
            "wcode": [{"id": "c1", "parent_run_id": "r1"}, {"id": "c2", "parent_run_id": "r2"}],
            "wctrl": [{"id": "k1", "parent_run_id": "r1"}], "wcad": []}
        self.details = {
            "r1": {"status": "Success", "started_at": "2026-10-30T10:00:00Z", "finished_at": "2026-10-30T12:00:00Z", "step_results": [
                st("prepare", out="AB-1 sur dm/site : branche"), st("orchestrateur_plan", 20000), st("gate_plan", ms=600000, at="2026-10-30T10:10:00Z"),
                st("code", 999999, at="2026-10-30T10:20:00Z"), st("orchestrateur", 5000), st("livraison", at="2026-10-30T11:00:00Z")]},
            "c1": {"step_results": [st("code", 100000, "Failed"), st("code", 120000)]},
            "k1": {"step_results": [st("parallele", 40000)]},
            "r2": {"status": "Success", "started_at": "2026-10-20T10:00:00Z", "finished_at": "2026-10-20T11:00:00Z",
                   "step_results": [st("orchestrateur_plan", 30000)]},
            "c2": {"step_results": [st("code", 400000)]},
            "r3": {"status": "Failed", "started_at": "2026-10-29T10:00:00Z", "step_results": [
                st("prepare", out="AB-3 sur dm/api : branche"), st("ticket", out='{"fields": {"summary": "Cache des listes"}}'),
                st("orchestrateur_plan", 7000, "Failed")]},
            "r4": {"status": "Failed", "started_at": "2026-10-31T10:00:00Z", "finished_at": "2026-10-31T11:00:00Z",
                   "step_results": [st("orchestrateur_plan", 1000), st("gate_plan", s="Failed")]},
        }

        def get(path):
            self.calls.append(path)
            if "/runs?limit" in path:
                return self.runs[path.split("/")[2]]
            return self.details[path.rsplit("/", 1)[1]]
        chaine_bilan.get = get
        for b in (bilan("r1", "AB-1", "v2", "2026-10-30T10:00:00Z"), bilan("r2", "AB-2", "v1", "2026-10-20T10:00:00Z"),
                  bilan("r4", "AB-4", "v2", "2026-10-31T10:00:00Z", essai=True)):
            d = Path(self.tmp, "hist", b["ticket"], "dm__site")
            d.mkdir(parents=True)
            Path(d, b["run"] + ".json").write_text(json.dumps(b))

    def tearDown(self):
        self.m.get, self.m.CACHE = self.old[:2]
        self.m.CFG.clear()
        self.m.CFG.update(self.old[2])
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_rows_join_the_history_and_kronn(self):
        out = self.m.snapshot(NOW)
        rows = {t["run"]: t for t in out["tickets"]}
        self.assertEqual([t["run"] for t in out["tickets"]], ["r4", "r1", "r3", "r2"])  # 30 jours, le plus récent d'abord
        r1 = rows["r1"]
        # jetons : agents du parent et des sous-workflows (le Code, les contrôles en parallèle) ; pas l'étape SubWorkflow
        self.assertEqual(r1["postes"], {"plan": 20000, "orchestrateur": 5000, "code": 220000, "paralleles": 40000})
        self.assertEqual(r1["tok"], 285000)
        self.assertEqual((r1["postes"]["plan"], r1["postes"]["code"], r1["postes"]["paralleles"]), (20000, 220000, 40000))
        self.assertEqual(r1["perdu"], {"echec": 100000, "panne": 0})  # essai du Code en échec puis relancé
        self.assertEqual((r1["gates"], r1["duree"], r1["issue"], r1["version"]), ({"plan": 600000}, 7200, "pr_prete", "v2"))
        self.assertEqual((r1["tours"]["controles"], r1["tours"]["cadrage"], r1["exig"], r1["doc"]["a_maj"]), (2, 2, {"fait": 3, "partiel": 1}, 1))
        self.assertEqual(r1["controles"]["securite"]["bloquants"], [1, 1, 0])
        r3 = rows["r3"]  # sans bilan : repris de l'API, en panne
        self.assertEqual((r3["partiel"], r3["ticket"], r3["repo"], r3["titre"], r3["issue"]), (True, "AB-3", "dm/api", "Cache des listes", "panne"))
        self.assertEqual(r3["perdu"]["panne"], 7000)
        self.assertEqual(rows["r4"]["issue"], "rejete")  # dernière étape : une gate refusée
        self.assertEqual([v["hash"] for v in out["versions"]], ["v1", "v2"])
        self.assertIn("mermaid", out["fiches"]["r1"])
        self.assertEqual(out["fiches"]["r1"]["deroule"][0]["n"], "prepare")

    def test_kpi_leaves_out_trials_and_compares_versions(self):
        out = self.m.snapshot(NOW)
        # r1 (v2, 285 k), r2 (v1, 430 k), r3 (en panne, pas de version, 7 k) ; r4 : un essai, écarté
        self.assertEqual(out["kpi"]["value"], f"{round((285000 + 430000 + 7000) / 3 / 1000)} k")
        self.assertEqual(out["kpi"]["label"], "jetons par ticket · −34 % / version")
        self.assertEqual(out["kpi"]["short"], "Chaîne · bilan")
        # contrat du vidéoprojecteur (kpi_of de pages_snapshot.py, un script qui tourne dès l'import : pas importé ici)
        self.assertEqual(set(out["kpi"]), {"value", "label", "short"})
        self.assertTrue(len(out["kpi"]["value"]) <= 16 and len(out["kpi"]["label"]) <= 40 and len(out["kpi"]["short"]) <= 18)

    def test_a_finished_run_is_read_once(self):
        self.m.snapshot(NOW)
        n = sum(1 for c in self.calls if c.endswith("/runs/r1"))
        self.calls.clear()
        self.m.snapshot(NOW)
        self.assertEqual(sum(1 for c in self.calls if c.endswith("/runs/r1")), 0)
        self.assertEqual(n, 1)

    def test_dataset_stays_under_the_limit(self):
        out = self.m.snapshot(NOW)
        out["fiches"] = {f"x{i}": {"mermaid": "y" * 20000} for i in range(10)}
        small = self.m.borne(out)
        self.assertLessEqual(len(json.dumps(small, ensure_ascii=False).encode()), self.m.MAX_OUT)
        self.assertEqual(len(small["tickets"]), 4)  # les fiches partent d'abord

    def test_no_chain_no_rows(self):
        self.m.CFG["models"] = {}
        self.assertEqual(self.m.snapshot(NOW)["tickets"], [])


class ChaineBilanModeleTest(unittest.TestCase):
    def cfg(self, **over):
        c = copy.deepcopy(BASE)
        c["jira"] = {**c["jira"], "config_id": "abcdefab-cdef-abcd-efab-cdefabcdefab"}
        c["models"] = {"impl_chain": "11111111-0000-4000-8000-000000000001"}
        c.update(over)
        return c

    def test_cron_publishes_into_the_bilan_page(self):
        c = self.cfg(bilan_page_id="22222222-0000-4000-8000-000000000002")
        self.assertFalse(templates.skipped("chaine_bilan", c))
        d = templates.render(templates.load_templates()["chaine_bilan"], c)
        pub = d["steps"][-1]["page_publish"]
        self.assertEqual((pub["page_id"], pub["writes"][0]["dataset"]), ("22222222-0000-4000-8000-000000000002", "bilan"))
        self.assertIn("def snapshot", d["steps"][0]["exec_args"][1])
        self.assertTrue(d["trigger"]["schedule"].startswith("4,19,34,49 "))

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
                self.calls.append((method, path))
                if path == "/pages":
                    self.pages["p1"] = {"id": "p1", "datasets": body["datasets"]}
                    return {"id": "p1"}
                return {}
        k, say = K(), install.say
        install.say = lambda m: None
        try:
            pid = install.upsert_bilan_page(k, {}, False)
            self.assertEqual((pid, k.calls), ("p1", [("POST", "/pages")]))
            self.assertEqual([d["name"] for d in k.pages["p1"]["datasets"]], ["bilan"])
            self.assertEqual(install.upsert_bilan_page(k, {"bilan_page_id": "p1"}, False), "p1")  # gardée, rien de recréé
            self.assertEqual(len(k.calls), 1)
            k.pages["p1"]["datasets"] = []
            install.upsert_bilan_page(k, {"bilan_page_id": "p1"}, False)  # dataset manquant : ajouté
            self.assertEqual(k.calls[-1], ("POST", "/pages/p1/datasets"))
        finally:
            install.say = say
        self.assertIn("Chaîne · bilan", install.bilan_html())

    def test_not_created_without_the_chain_or_its_page(self):
        self.assertTrue(templates.skipped("chaine_bilan", self.cfg()))  # pas de page
        self.assertTrue(templates.skipped("chaine_bilan", self.cfg(models={}, bilan_page_id="x")))  # pas de chaîne


if __name__ == "__main__":
    unittest.main()
