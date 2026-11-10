"""Étage des retours de PR (3e étage, python3 -m unittest tests/test_retours.py) : workflows/retours_snapshot.py, un
bureau par run actif du modèle « corriger les commentaires d'une PR », le Kanban de ses fils lu dans l'état du run et
l'avancement de l'agent ; la colonne d'un fil d'après sa réponse (fil_col de _lib.py) ; l'étape du cron live."""
import json, os, sys, tempfile, unittest
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "workflows"))
sys.path.insert(0, os.path.join(ROOT, "tools"))
os.environ.setdefault("BUREAU_CONFIG", os.path.join(ROOT, "tests", "fixtures", "bureau.config.json"))  # _lib sans installation


class FilColTest(unittest.TestCase):
    def test_column_from_the_reply_icon(self):
        from _lib import fil_col
        self.assertEqual(fil_col("✅ **Corrigé** : renommé"), "corrige")
        self.assertEqual(fil_col("✅ **Corrigé** : renommé\n🧪 **Test** : ajouté"), "test")
        self.assertEqual(fil_col("⏭️ **Laissé tel quel** : voulu"), "laisse")
        self.assertEqual(fil_col("💬 **Réponse** : oui"), "reponse")
        self.assertEqual(fil_col(None), "laisse", "sans réponse : le fil est laissé (obsolète ou déjà traité)")


class RetoursSnapshotTest(unittest.TestCase):
    def setUp(self):
        import retours_snapshot as r
        self.r = r
        self.tmp = tempfile.mkdtemp()
        self.old = (r.get, r.HOME, dict(r.CFG))
        r.HOME = self.tmp
        r.CFG.update(actions={"fix_pr": "fx"}, kronn={"ui": "http://k"})

    def tearDown(self):
        self.r.get, self.r.HOME = self.old[0], self.old[1]
        self.r.CFG.clear()
        self.r.CFG.update(self.old[2])

    def state(self, run, **st):
        os.makedirs(os.path.join(self.tmp, "runs"), exist_ok=True)
        Path(self.tmp, "runs", run + ".json").write_text(json.dumps(st))

    def test_rooms_queue_kanban_and_events(self):
        work = os.path.join(self.tmp, "work", "r1")
        os.makedirs(work)
        fils = [{"id": "T1", "path": "a.ts", "line": 3, "who": "jim", "text": "Renomme"}, {"id": "T2", "path": "b.ts", "line": 9, "who": "pam", "text": "Pourquoi ?"},
                {"id": "T3", "path": "c.ts", "line": 1, "who": "jim", "text": "Test ?"}]
        # r1 : l'agent au travail sur T2, T1 déjà corrigé (son avancement) ; r2 : à la validation, colonnes tirées des réponses
        self.state("r1", repo="dm/site", pr=16, title="feat: export", author="andy", work=work, fils=fils, threads=["T1", "T2", "T3"])
        Path(work, ".bureau-fix-progress.json").write_text(json.dumps({"current": "T2", "done": {"T1": "corrige"}}))
        self.state("r2", repo="dm/api", pr=4, title="fix: cache", author="pam", work="/nulle/part", fils=fils[:2], cols={"T1": "test", "T2": "laisse"})
        tc = lambda repo, pr: {"trigger_context": {"repo": repo, "pr": pr}}  # noqa: E731
        runs = {"r1": {"id": "r1", "workflow_id": "fx", "status": "Running", "started_at": "2026-10-30T09:00:00Z", **tc("dm/site", "16"), "step_results": [
                    {"step_name": "prepare", "status": "Success", "started_at": "2026-10-30T09:00:00Z"}, {"step_name": "fix", "status": "Running"}]},
                "r2": {"id": "r2", "workflow_id": "fx", "status": "WaitingApproval", "started_at": "2026-10-30T08:00:00Z", **tc("dm/api", "4"), "step_results": [
                    {"step_name": "prepare", "status": "Success", "started_at": "2026-10-30T08:00:00Z"}, {"step_name": "fix", "status": "Success"},
                    {"step_name": "check", "status": "Success"}, {"step_name": "diff", "status": "Success"},
                    {"step_name": "gate", "status": "WaitingApproval", "started_at": "2026-10-30T08:40:00Z"}]},
                "r3": {"id": "r3", "workflow_id": "fx", "status": "Success", "started_at": "2026-10-30T07:00:00Z", **tc("dm/site", "12"), "step_results": [
                    {"step_name": "prepare", "status": "Success", "started_at": "2026-10-30T07:00:00Z"},
                    {"step_name": "push", "status": "Success", "started_at": "2026-10-30T07:30:00Z", "duration_ms": 6000}]},
                "f1": {"id": "f1", "workflow_id": "fx", "status": "Failed", "started_at": "2026-10-30T06:00:00Z", **tc("dm/cms", "7"), "step_results": [
                    {"step_name": "prepare", "status": "Success", "started_at": "2026-10-30T06:00:00Z"},
                    {"step_name": "fix", "status": "Failed", "started_at": "2026-10-30T06:01:00Z", "duration_ms": 1000}]},
                "rej": {"id": "rej", "workflow_id": "fx", "status": "Failed", "started_at": "2026-10-30T05:00:00Z", **tc("dm/cms", "8"), "step_results": [
                    {"step_name": "gate", "status": "Failed", "started_at": "2026-10-30T05:10:00Z"}]}}
        api = {"/workflows/fx/runs?limit=40": [{k: v for k, v in r.items() if k != "step_results"} for r in runs.values()]
               + [{"id": "q1", "status": "Pending", "started_at": "2026-10-30T09:30:00Z", **tc("dm/site", "20")}],
               **{f"/workflows/fx/runs/{k}": v for k, v in runs.items()}}
        self.r.get = lambda p: api.get(p)
        snap = self.r.snapshot("2026-10-30T10:00:00+00:00")
        self.assertEqual(snap["queue"], [{"run": "q1", "repo": "dm/site", "pr": "20", "since": "2026-10-30T09:30:00Z"}])
        a, b = sorted(snap["rooms"], key=lambda x: x["run"])
        self.assertEqual((a["repo"], a["pr"], a["author"], a["poste"], a["gate"]), ("dm/site", "16", "andy", "fix", False))
        self.assertEqual([(f["id"], f["col"], f["cur"]) for f in a["fils"]], [("T1", "corrige", False), ("T2", "a_traiter", True), ("T3", "a_traiter", False)])
        self.assertEqual((b["poste"], b["gate"], b["states"]["gate"]), ("gate", True, "gate"))
        self.assertEqual([(f["id"], f["col"], f["cur"]) for f in b["fils"]], [("T1", "test", False), ("T2", "laisse", False)])
        self.assertEqual(b["url"], "http://k/#workflows/fx")
        self.assertEqual([p["run"] for p in snap["pannes"]], ["f1"], "une gate refusée n'est pas une panne")
        self.assertEqual(snap["pannes"][0]["poste"], "fix")
        ks = [(e["run"], e["k"]) for e in snap["events"]]
        self.assertIn(("r2", "gate"), ks)
        self.assertIn(("r3", "push"), ks)
        self.assertIn(("f1", "panne"), ks)
        self.assertEqual(snap["pousses"], 1)
        self.assertIn(("rej", "fin"), ks, "fini sans push (gate refusée) : le rejeu libère son bureau")

    def test_day_board_counts_today_and_the_week_reading_each_finished_run_once(self):
        # p1 poussée aujourd'hui (3 fils), p2 poussée il y a 3 jours, x1 finie sans push, a1 en cours, v1 trop vieille
        self.state("p1", cols={"T1": "corrige", "T2": "test", "T3": "laisse"})
        push = lambda at: {"step_name": "push", "status": "Success", "started_at": at, "duration_ms": 6000}  # noqa: E731
        runs = {"p1": {"id": "p1", "status": "Success", "started_at": "2026-10-30T08:00:00Z", "tokens_used": 40000, "step_results": [push("2026-10-30T08:30:00Z")]},
                "p2": {"id": "p2", "status": "Success", "started_at": "2026-10-27T08:00:00Z", "tokens_used": 9000, "step_results": [push("2026-10-27T08:20:00Z")]},
                "x1": {"id": "x1", "status": "Failed", "started_at": "2026-10-30T07:00:00Z", "tokens_used": 5000, "trigger_context": {"repo": "dm/cms", "pr": "7"}, "step_results": [{"step_name": "fix", "status": "Failed"}]},
                "a1": {"id": "a1", "status": "Running", "started_at": "2026-10-30T09:00:00Z", "tokens_used": 1000, "step_results": [{"step_name": "fix", "status": "Running"}]},
                "v1": {"id": "v1", "status": "Success", "started_at": "2026-10-20T08:00:00Z", "tokens_used": 1, "step_results": [push("2026-10-20T08:20:00Z")]}}
        calls = []

        def get(p):
            calls.append(p)
            if p == "/workflows/fx/runs?limit=40":
                return [{k: v for k, v in r.items() if k != "step_results"} for r in runs.values()]
            return runs.get(p.rsplit("/", 1)[-1])
        self.r.get = get
        j = self.r.snapshot("2026-10-30T10:00:00+00:00")["jour"]
        self.assertEqual(j, {"pousses": 1, "fils": 3, "tok": 46000, "cours": 1, "pannes": 1, "semaine": 2})
        self.assertNotIn("/workflows/fx/runs/v1", calls, "hors des 7 jours : jamais relu")
        calls.clear()
        self.r.snapshot("2026-10-30T10:01:00+00:00")
        self.assertNotIn("/workflows/fx/runs/p2", calls, "un run fini n'est relu qu'une fois (jour.json)")

    def test_exchange_files_never_follow_a_link(self):
        """SRV-02 : l'avancement en lien symbolique (posé par une PR ou un agent) est ignoré ; _lib.write_json remplace un
        lien au lieu d'écrire dans sa cible, et garde les droits du fichier remplacé."""
        import _lib
        work, secret, cible = (os.path.join(self.tmp, x) for x in ("work", "secret", "cible"))
        os.makedirs(work)
        Path(secret).write_text('{"current": "MOT-DE-PASSE"}')
        Path(cible).write_text("intact")
        os.symlink(secret, os.path.join(work, ".bureau-fix-progress.json"))
        self.assertEqual(self.r.progress({"work": work}), {})
        os.symlink(cible, os.path.join(work, ".bureau-fix.json"))
        _lib.write_json(os.path.join(work, ".bureau-fix.json"), [1])
        self.assertEqual(Path(cible).read_text(), "intact")
        self.assertFalse(os.path.islink(os.path.join(work, ".bureau-fix.json")))
        self.assertEqual(_lib.read_json(os.path.join(work, ".bureau-fix.json")), [1])
        os.chmod(os.path.join(work, ".bureau-fix.json"), 0o600)
        _lib.write_text(os.path.join(work, ".bureau-fix.json"), "[2]")
        self.assertEqual(os.stat(os.path.join(work, ".bureau-fix.json")).st_mode & 0o777, 0o600)
        self.assertEqual(sorted(os.listdir(work)), [".bureau-fix-progress.json", ".bureau-fix.json"], "aucun fichier temporaire laissé")

    def test_without_the_model_nothing(self):
        self.r.CFG.pop("actions", None)
        self.assertEqual(self.r.snapshot("now")["rooms"], [])

    def test_live_cron_has_the_step_only_with_the_model(self):
        import templates
        fx = json.loads(Path(ROOT, "tests", "fixtures", "bureau.config.json").read_text())
        names = lambda cfg: [s["name"] for s in templates.render(templates.load_templates()["live"], cfg)["steps"]]  # noqa: E731
        self.assertIn("publish_retours", names({**fx, "actions": {**(fx.get("actions") or {}), "fix_pr": "fx-id"}}))
        self.assertNotIn("retours", names({**fx, "actions": {k: v for k, v in (fx.get("actions") or {}).items() if k != "fix_pr"}}))


if __name__ == "__main__":
    unittest.main()
