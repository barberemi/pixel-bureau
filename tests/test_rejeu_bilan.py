"""Page « Rejeu · bilan » (python3 -m unittest tests/test_rejeu_bilan.py) : workflows/rejeu_bilan.py relève l'API Kronn
(bouchonnée : durée et coût d'un run d'impl_rejeu et de ses postes, un run fini lu une fois, la proposition de leçons qui
attend encore), lit les rejeux rangés par rejeu.py (dossier jetable) et les leçons du rejeu (absentes, puis validées et à
valider), puis le dataset rejeu_bilan (jeu témoin par version, ⚡, PR témoins, borne) et le résumé rejeu_resume ; enfin le
modèle du cron, sa page et son installation avec le rejeu."""
import datetime, json, os, shutil, sys, tempfile, unittest
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
sys.path.insert(0, os.path.join(ROOT, "workflows"))
os.environ.setdefault("BUREAU_CONFIG", os.path.join(ROOT, "tests", "fixtures", "bureau.config.json"))  # _lib sans installation
import templates  # noqa: E402

BASE = json.loads(Path(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json")).read_text())
NOW = datetime.datetime(2026, 11, 27, 16, 0, tzinfo=datetime.timezone.utc)
V1, V2 = {"hash": "a1b2c3d", "commit": "1111111", "sujet": "chaîne d'avant"}, {"hash": "b2c3d4e", "commit": "2222222", "sujet": "chaîne d'après"}


def agent(cost):
    return {"step_name": "code", "step_kind": "Agent", "agent_provenance": {"attempts": [{"cost_usd": cost}, {"cost_usd": 0.5}]}}


class RejeuBilanTest(unittest.TestCase):
    def setUp(self):
        import rejeu_bilan
        self.m = rejeu_bilan
        self.tmp = tempfile.mkdtemp()
        self.dos = os.path.join(self.tmp, "rejeu")
        self.old = (rejeu_bilan.get, rejeu_bilan.CACHE, dict(rejeu_bilan.CFG))
        rejeu_bilan.CACHE = os.path.join(self.tmp, "cache")
        rejeu_bilan.CFG.update(rejeu={"dossier": self.dos, "temoin": [101, 102], "depot": "dm/site"},
                               models={"impl_rejeu": "rj", "impl_code": "code", "impl_chain": "ch", "rejeu": "lanceur"},
                               workflows={"memoire": "mem"}, impl_version=V2)
        self.runs = {"r1": {"status": "Success", "started_at": "2026-11-20T10:00:00Z", "finished_at": "2026-11-20T11:30:00Z", "step_results": [agent(1.0)]},
                     "r9": {"status": "Running", "started_at": "2026-11-27T15:00:00Z", "step_results": []}}
        self.calls = []

        def get(path):
            self.calls.append(path)
            if path.startswith("/workflows/rj/runs?"):
                return [{"id": k, **{x: v.get(x) for x in ("status", "started_at", "finished_at")}} for k, v in self.runs.items()]
            if path.startswith("/workflows/code/runs?"):
                return [{"id": "c1", "parent_run_id": "r1"}, {"id": "c2", "parent_run_id": "autre"}]
            if path == "/workflows/code/runs/c1":
                return {"step_results": [agent(2.0)]}
            if path.startswith("/workflows/mem/runs/"):
                return {"status": self.mem}
            return self.runs[path.rsplit("/", 1)[-1]]
        self.mem = "WaitingApproval"
        rejeu_bilan.get = get

    def tearDown(self):
        self.m.get, self.m.CACHE = self.old[:2]
        self.m.CFG.clear()
        self.m.CFG.update(self.old[2])
        shutil.rmtree(self.tmp, ignore_errors=True)

    def rejeu(self, ticket, run, pr, note, fini, jeu="rotation", version=V2, **o):
        os.makedirs(os.path.join(self.dos, ticket), exist_ok=True)
        r = {"ticket": ticket, "run": run, "pr": pr, "titre": f"feat: <{ticket}>", "url": f"https://github.com/dm/site/pull/{pr}", "jeu": jeu,
             "genre": "feat", "zone": "src/Ventes", "fini_le": fini, "note_sur_100": note, "atteint": note >= 80, "version": version,
             "parts": {"tests": 1.0, "fichiers": 0.5, "lignes": 0.4, "juge": 0.7}, "escalade": False,
             "juge": {"resume": "Même approche.", "ecarts": [{"cause": "choix_agent", "lecon": "Lire le service voisin.", "detail": "x"}]}, **o}
        Path(self.dos, ticket, run + ".json").write_text(json.dumps(r))

    def releve(self):  # comme l'étape releve : le relevé gardé pour le bilan
        os.makedirs(self.m.CACHE, exist_ok=True)
        Path(self.m.CACHE, "_releve.json").write_text(json.dumps(self.m.releve()))

    def lecons(self, d):
        os.makedirs(self.dos, exist_ok=True)
        Path(self.dos, "lecons.json").write_text(json.dumps(d))

    def jeu(self):
        self.rejeu("DM-101", "t1", 101, 60, "2026-11-10T10:00:00+00:00", "temoin", V1)
        self.rejeu("DM-102", "t2", 102, 70, "2026-11-10T12:00:00+00:00", "temoin", V1)
        self.rejeu("DM-101", "t3", 101, 70, "2026-11-12T10:00:00+00:00", "temoin", V1)  # la dernière note de #101 en V1
        self.rejeu("DM-101", "t4", 101, 80, "2026-11-21T10:00:00+00:00", "temoin", V2)
        self.rejeu("DM-102", "t5", 102, 77, "2026-11-21T12:00:00+00:00", "temoin", V2)
        self.rejeu("DM-2041", "r1", 2041, 82, "2026-11-25T10:00:00+00:00")
        self.rejeu("DM-1", "vieux", 9, 10, "2026-07-01T10:00:00+00:00")  # hors des 90 jours

    def test_releve_cout_et_duree_puis_cache(self):
        rel = self.m.releve()
        self.assertEqual((rel["lus"], rel["en_cache"]), (1, 0), "un run en cours n'est pas relu")
        c = json.loads(Path(self.m.cache_path("r1")).read_text())
        self.assertEqual((c["cout"], c["ms"]), (4.0, 5400000), "le run et son poste, relances comprises")
        self.calls.clear()
        self.assertEqual(self.m.releve()["en_cache"], 1)
        self.assertNotIn("/workflows/rj/runs/r1", self.calls, "un run fini n'est relu qu'une fois")
        self.assertNotIn("a_valider_run", rel, "sans lecons.json : rien à demander à Kronn")

    def test_sans_lecons_ni_rejeu(self):
        out = self.m.bilan(NOW)
        self.assertEqual((out["rejeux"], out["versions"], out["lecons"]), ([], [], {"a_valider": 0, "validees": 0}))
        self.assertEqual([t["pr"] for t in out["temoins"]], [101, 102], "le jeu témoin réglé, pas encore joué")
        self.assertEqual(out["resume"], {"date": None, "temoin": None, "dernier": None, "lecons": {"a_valider": 0, "validees": 0}})
        self.assertNotIn("kpi", out)

    def test_bilan_jeu_temoin_par_version(self):
        self.jeu()
        self.lecons({"a_valider": {"run": "m1", "le": "2026-11-26T20:00:00+00:00", "lecons": [{"ticket": "DM-2041"}, {"ticket": "DM-2041"}]},
                     "validees": [{"le": "2026-11-15T20:00:00+00:00", "ticket": "DM-7"}, {"le": "2026-11-26T20:00:00+00:00", "ticket": "DM-8"}]})
        self.releve()
        out = self.m.bilan(NOW)
        self.assertEqual([r["run"] for r in out["rejeux"]], ["r1", "t5", "t4", "t3", "t2", "t1"], "le plus récent d'abord, 90 jours")
        r1 = out["rejeux"][0]
        self.assertEqual((r1["note"], r1["cout"], r1["ms"], r1["version"], r1["ecarts"]),
                         (82, 4.0, 5400000, "b2c3d4e", [{"cause": "choix_agent", "lecon": "Lire le service voisin."}]))
        self.assertEqual([(v["hash"], v["moyenne"], v["n"], v["lecons"]) for v in out["versions"]],
                         [("a1b2c3d", 70, 2, 0), ("b2c3d4e", 78.5, 2, 1)], "⚡ : la leçon validée entre les deux versions")
        self.assertEqual([[p["note"] for p in t["passages"]] for t in out["temoins"]], [[60, 70, 80], [70, 77]])
        self.assertEqual(out["lecons"], {"a_valider": 2, "validees": 2})
        self.assertEqual(out["version"], V2)
        self.assertEqual(out["resume"], {"date": "2026-11-25T10:00:00+00:00",
                                         "temoin": {"moyenne": 79, "ecart": 9, "version": "b2c3d4e", "version_prec": "a1b2c3d", "n": 2},
                                         "dernier": {"ticket": "DM-2041", "pr": 2041, "note": 82, "cible": True, "fini_le": "2026-11-25T10:00:00+00:00"},
                                         "lecons": {"a_valider": 2, "validees": 2}})
        self.assertEqual(out["kpi"]["value"], "79")
        self.mem = "Success"  # la gate du rejeu tranchée : plus rien à valider
        self.releve()
        self.assertEqual(self.m.bilan(NOW)["lecons"]["a_valider"], 0)

    def test_borne(self):
        self.jeu()
        old = self.m.MAX_OUT
        try:
            self.m.MAX_OUT = 3000
            out = self.m.bilan(NOW)
            self.assertLessEqual(len(json.dumps(out, ensure_ascii=False).encode()), 3000)
            self.assertEqual(out["rejeux"][0]["run"], "r1", "les plus anciens retirés d'abord")
        finally:
            self.m.MAX_OUT = old

    def test_modele_page_et_installation(self):
        tpl = json.loads(Path(ROOT, "workflows", "templates", "rejeu_bilan.json").read_text(encoding="utf-8"))
        d = tpl["definition"]
        self.assertEqual(d["trigger"]["schedule"], "47 @@cron_hours@@ * * 1-5", "toutes les heures, aux heures du bureau")
        self.assertTrue(d["workspace_config"]["main_tree_read_only"])
        pubs = {s["page_publish"]["writes"][0]["dataset"]: s["page_publish"]["page_id"] for s in d["steps"] if s["step_type"]["type"] == "PublishPageData"}
        self.assertEqual(pubs, {"rejeu_bilan": "@@rejeu_bilan.page_id@@", "rejeu_resume": "@@page_id@@"})
        self.assertEqual(templates.SIDE_PAGES["rejeu_bilan_page_id"], ("Rejeu · bilan", ["rejeu_bilan"], "rejeu-bilan.html"))
        import install
        self.assertIn("rejeu_resume", install.DATASETS)
        self.assertIn("rejeu_bilan", install.CRONS)
        cfg = dict(BASE, models={**(BASE.get("models") or {}), "rejeu": "w1"})
        self.assertTrue(templates.skipped("rejeu_bilan", cfg), "sans sa page : pas de cron")
        cfg["rejeu_bilan_page_id"] = "pg"
        self.assertFalse(templates.skipped("rejeu_bilan", cfg))
        self.assertEqual(templates.values(cfg)["rejeu_bilan.page_id"], "pg")
        self.assertTrue(templates.skipped("rejeu_bilan", dict(BASE, rejeu_bilan_page_id="pg", models={k: v for k, v in (BASE.get("models") or {}).items() if k != "rejeu"})), "sans rejeu installé : pas de cron")
        code = templates.script_code("workflows/rejeu_bilan.py", cfg)
        self.assertIn('"impl_version"', code, "la version de la chaîne en service")


if __name__ == "__main__":
    unittest.main()
