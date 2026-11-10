"""Page « Retours · bilan » (python3 -m unittest tests/test_retours_bilan.py) : workflows/retours_bilan.py relève l'API
Kronn (bouchonnée) et l'état de chaque PR (pr_update.py) : coût de l'agent de correction, attente à ta validation,
résultat (poussée, panne, coupée, refusée, rien à pousser, en cours), fils et leur colonne, réponse prévue, contrôles ; un
run fini lu une fois ; puis le dataset (lignes, fiches, chiffre clé, borne) ; enfin le modèle du cron et sa page."""
import copy, datetime, json, os, shutil, sys, tempfile, unittest
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
sys.path.insert(0, os.path.join(ROOT, "workflows"))
os.environ.setdefault("BUREAU_CONFIG", os.path.join(ROOT, "tests", "fixtures", "bureau.config.json"))  # _lib sans installation
import templates  # noqa: E402

BASE = json.loads(Path(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json")).read_text())
NOW = datetime.datetime(2026, 11, 9, 16, 0, tzinfo=datetime.timezone.utc)


def step(n, s="Success", at="2026-11-09T10:00:00Z", ms=1000, **o):
    return {"step_name": n, "status": s, "started_at": at, "duration_ms": ms, "step_kind": "Exec", **o}


def fix(cost, tok=20000):
    return step("fix", step_kind="Agent", tokens_used=tok, step_model="claude-opus-5-5 · reasoning", ms=300000,
                agent_provenance={"attempts": [{"cost_usd": cost}]})


class RetoursBilanTest(unittest.TestCase):
    def setUp(self):
        import retours_bilan
        self.m = retours_bilan
        self.tmp = tempfile.mkdtemp()
        self.old = (retours_bilan.get, retours_bilan.CACHE, retours_bilan.ETATS, dict(retours_bilan.CFG))
        retours_bilan.CFG.update(actions={"fix_pr": "fx"})
        retours_bilan.CACHE = os.path.join(self.tmp, "cache")
        retours_bilan.ETATS = os.path.join(self.tmp, "etats")
        os.makedirs(retours_bilan.ETATS)
        fils = [{"id": "T1", "path": "src/a.php", "line": 3, "who": "pam", "text": "Renomme <x>", "url": "u1"},
                {"id": "T2", "path": "src/b.php", "line": 9, "who": "jim", "text": "Un test ?", "url": "u2"},
                {"id": "T3", "path": "src/a.php", "line": 40, "who": "pam", "text": "Pourquoi ?", "url": "u3"}]
        self.etat("ok", repo="dm/site", pr=16, title="feat: export", author="andy", fils=fils, cols={"T1": "corrige", "T2": "test", "T3": "laisse"},
                  reponses={"T1": "✅ **Corrigé** : renommé"}, check={"verdict": "verts ✅", "cmd": "phpunit"}, ecartes=["tmp.log"])
        self.etat("cut", repo="dm/api", pr=4, title="fix: cache", author="pam", fils=fils[:2], cols={"T1": "corrige", "T2": "corrige"})
        runs = {
            "ok": {"status": "Success", "started_at": "2026-11-09T09:00:00Z", "finished_at": "2026-11-09T09:30:00Z",
                   "step_results": [step("prepare"), fix(1.2), step("check"), step("diff"), step("gate", ms=600000), step("push", at="2026-11-09T09:29:00Z")]},
            "cut": {"status": "StoppedByGuard", "started_at": "2026-11-09T08:00:00Z", "finished_at": "2026-11-09T10:00:00Z",
                    "step_results": [step("prepare"), fix(3.3), step("check"), step("diff"), step("gate", s="Cancelled", ms=7000000), step("__guard_timeout__", s="Failed")]},
            "ko": {"status": "Failed", "started_at": "2026-11-08T08:00:00Z", "finished_at": "2026-11-08T08:20:00Z", "trigger_context": {"repo": "dm/cms", "pr": "7"},
                   "step_results": [step("prepare"), fix(0.4), step("check", s="Failed")]},
            "no": {"status": "Failed", "started_at": "2026-11-07T08:00:00Z", "finished_at": "2026-11-07T08:10:00Z",
                   "step_results": [step("prepare"), fix(0.1), step("check"), step("diff"), step("gate", s="Failed", ms=60000), step("abort")]},
            "vide": {"status": "Failed", "started_at": "2026-11-06T08:00:00Z", "finished_at": "2026-11-06T08:10:00Z",
                     "step_results": [step("prepare"), fix(0.2), step("check"), step("diff", s="Failed")]},
            "run": {"status": "WaitingApproval", "started_at": "2026-11-09T15:00:00Z",
                    "step_results": [step("prepare"), fix(0.9), step("check"), step("diff"), step("gate", s="WaitingApproval", ms=0)]}}
        self.calls = []

        def get(path):
            self.calls.append(path)
            if path.startswith("/workflows/fx/runs?"):
                return [{"id": k, "status": v["status"], "started_at": v["started_at"]} for k, v in runs.items()] + [{"id": "q", "status": "Pending"}]
            return {"id": path.rsplit("/", 1)[-1], **runs[path.rsplit("/", 1)[-1]]}
        retours_bilan.get = get

    def tearDown(self):
        self.m.get, self.m.CACHE, self.m.ETATS = self.old[:3]
        self.m.CFG.clear()
        self.m.CFG.update(self.old[3])
        shutil.rmtree(self.tmp, ignore_errors=True)

    def etat(self, run, **st):
        Path(self.m.ETATS, run + ".json").write_text(json.dumps(st))

    def test_releve_then_bilan(self):
        self.assertEqual(self.m.releve(), {"lus": 6, "en_cache": 0, "error": None})
        rows = {r["run"]: r for r in self.m.bilan(NOW)["corrections"]}
        self.assertEqual({k: (r["resultat"], r["poste"]) for k, r in rows.items()},
                         {"ok": ("poussee", None), "cut": ("coupee", "gate"), "ko": ("panne", "check"), "no": ("refusee", None),
                          "vide": ("rien", None), "run": ("en_cours", None)})
        ok = rows["ok"]
        self.assertEqual((ok["repo"], ok["pr"], ok["auteur"], ok["fils"], ok["cols"]),
                         ("dm/site", "16", "andy", 3, {"corrige": 1, "test": 1, "laisse": 1, "reponse": 0}))
        self.assertEqual((ok["cout"], ok["tok"], ok["attente_ms"], ok["ms"], ok["controles"]), (1.2, 20000, 600000, 1800000, "verts ✅"))
        self.assertEqual(ok["url"], "https://github.com/dm/site/pull/16")
        self.assertIsNone(rows["run"]["attente_ms"], "à ta validation : pas encore d'attente mesurée")
        self.assertEqual((rows["ko"]["repo"], rows["ko"]["pr"]), ("dm/cms", "7"), "sans état : la PR du déclencheur")
        self.assertEqual([r["run"] for r in self.m.bilan(NOW)["corrections"]], ["run", "ok", "cut", "ko", "no", "vide"], "le plus récent d'abord")
        f = self.m.bilan(NOW)["fiches"]["ok"]
        self.assertEqual([(x["path"], x["col"], x["reponse"]) for x in f["fils"]],
                         [("src/a.php", "corrige", "✅ **Corrigé** : renommé"), ("src/b.php", "test", None), ("src/a.php", "laisse", None)])
        self.assertEqual((f["controles"]["cmd"], f["ecartes"]), ("phpunit", 1))
        self.assertEqual(self.m.bilan(NOW)["kpi"]["value"], "1 / 5", "en cours : hors du compte")

    def test_a_finished_run_is_read_once(self):
        self.m.releve()
        self.calls.clear()
        self.assertEqual(self.m.releve(), {"lus": 1, "en_cache": 5, "error": None})
        self.assertEqual([c for c in self.calls if c.startswith("/workflows/fx/runs/")], ["/workflows/fx/runs/run"], "seul le run en cours est relu")

    def test_old_runs_out_and_bounded(self):
        self.m.releve()
        self.assertEqual(len(self.m.bilan(NOW + datetime.timedelta(days=91))["corrections"]), 0)
        self.m.MAX_OUT, old = 2500, self.m.MAX_OUT
        try:
            out = self.m.bilan(NOW)
            self.assertLessEqual(len(json.dumps(out, ensure_ascii=False).encode()), 2500)
            self.assertTrue(out["corrections"], "les fiches partent avant les lignes")
        finally:
            self.m.MAX_OUT = old

    def test_without_the_model_nothing(self):
        self.m.CFG["actions"] = {}
        self.assertEqual(self.m.releve(), {"lus": 0, "en_cache": 0, "error": None})


class RetoursBilanModeleTest(unittest.TestCase):
    def cfg(self, **over):
        c = copy.deepcopy(BASE)
        c["actions"] = {**(c.get("actions") or {}), "fix_pr": "11111111-0000-4000-8000-000000000001"}
        c.update(over)
        return c

    def test_cron_reads_kronn_then_publishes(self):
        c = self.cfg(retours_bilan_page_id="22222222-0000-4000-8000-000000000005")
        self.assertFalse(templates.skipped("retours_bilan", c))
        d = templates.render(templates.load_templates()["retours_bilan"], c)
        steps = {s["name"]: s for s in d["steps"]}
        self.assertEqual(list(steps), ["releve", "bilan", "publish"])
        self.assertEqual((steps["releve"]["exec_args"][2:], steps["bilan"]["exec_args"][2:]), (["releve"], ["bilan"]))
        self.assertIn("def releve", steps["bilan"]["exec_args"][1])
        pub = steps["publish"]["page_publish"]
        self.assertEqual((pub["page_id"], pub["writes"][0]["dataset"], pub["writes"][0]["value_from"]),
                         ("22222222-0000-4000-8000-000000000005", "retours_bilan", "steps.bilan.data.stdout"))

    def test_not_created_without_fix_or_its_page(self):
        self.assertTrue(templates.skipped("retours_bilan", self.cfg()))
        self.assertTrue(templates.skipped("retours_bilan", self.cfg(actions={}, retours_bilan_page_id="x")))

    def test_install_creates_the_page_with_its_dataset(self):
        import install

        class K:
            def __init__(self):
                self.calls, self.pages = [], {}

            def get(self, path):
                raise install.InstallError("introuvable")

            def call(self, method, path, body=None, timeout=60):
                self.calls.append((method, path, (body or {}).get("title")))
                self.pages["p4"] = {"id": "p4", "datasets": body["datasets"]}
                return {"id": "p4"}
        k, say = K(), install.say
        install.say = lambda m: None
        try:
            self.assertEqual(install.upsert_side_page(k, {}, "retours_bilan_page_id", False), "p4")
            self.assertEqual(k.calls, [("POST", "/pages", "Retours · bilan")])
            self.assertEqual([d["name"] for d in k.pages["p4"]["datasets"]], ["retours_bilan"])
        finally:
            install.say = say
        self.assertIn("<title>Retours · bilan</title>", install.side_html("retours_bilan_page_id"))
        self.assertIn("retours_bilan", install.CRONS)


if __name__ == "__main__":
    unittest.main()
