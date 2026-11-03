"""Salle de rédaction (2e étage, python3 -m unittest tests/test_ticket_chain.py) : workflows/ticket.py, les postes du
modèle ticket (dossier, consignes, rapports), l'aiguillage critique → rédaction (3 tours au plus), un élément par ticket
pour le foreach, chaque ticket (aperçu, création) et le bilan pour la page."""
import json, os, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURE = os.path.join(ROOT, "tests", "fixtures", "bureau.config.json")


class TicketChainTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def t(self, *a, stdin=None):
        return subprocess.run([sys.executable, os.path.join(ROOT, "workflows", "ticket.py"), *a], input=stdin, capture_output=True, text=True,
                              cwd=self.tmp, env={"PATH": "/usr/bin:/bin", "HOME": self.tmp, "BUREAU_CONFIG": FIXTURE}, timeout=30)

    def test_intention_split_reviewed_then_one_ticket_each(self):
        self.assertEqual(self.t("dossier", "r1", "Refondre le lecteur vidéo", "Story", "5", "dm/site", "", "next", "").returncode, 0)
        self.assertIn("## La demande\nRefondre le lecteur vidéo", self.t("poste", "recherche", "r1").stdout)
        self.t("rapport", "recherche", "r1", stdin="Composants : dm/site, dm/api\n- src/Player.tsx")
        two = {"tickets": [{"summary": "Lecteur : sous-titres", "description": "h2. Contexte", "composant": "dm/site", "points": 3},
                           {"summary": "API : pistes", "description": "h2. À faire", "composant": "dm/api", "points": 2}]}
        r = self.t("rapport", "redaction", "r1", stdin="Voilà :\n```json\n" + json.dumps(two) + "\n```")
        self.assertIn("2. API : pistes · dm/api · 2 pts", r.stdout)
        self.assertIn("Rapport de la recherche", self.t("poste", "critique", "r1").stdout)
        # à retoucher : retour à la rédaction (code 3), avec les remarques ; trois tours au plus
        self.t("rapport", "critique", "r1", stdin=json.dumps({"verdict": "a_retoucher", "notes": [{"ticket": 2, "note": "Comment tester ?"}]}))
        a = self.t("aiguillage", "r1")
        self.assertEqual(a.returncode, 3)
        self.assertIn("tour 2/3", a.stdout)
        self.assertIn("- ticket 2 : Comment tester ?", self.t("poste", "redaction", "r1").stdout)
        self.assertEqual(self.t("aiguillage", "r1").returncode, 3)
        self.assertEqual(self.t("aiguillage", "r1").returncode, 0, "au 3e tour, on passe à la validation")
        items = json.loads(Path(self.tmp, ".kronn", "tickets.json").read_text())
        self.assertEqual([(x["run"], x["i"]) for x in items], [("r1", 0), ("r1", 1)])
        # ta validation : tous les tickets d'un coup ; tes « Changements » passent à la rédaction
        ap = self.t("apercus", "r1").stdout
        self.assertIn("2 ticket(s) à créer", ap)
        self.assertIn("━━ T2 ━━\n🎫 API : pistes\nStory · 2 pts · dm/api", ap)
        self.assertIn("- retire T2", self.t("poste", "redaction", "r1", "retire T2").stdout)
        # chaque ticket : ses champs (son composant, ses points), sa création notée au dossier
        Path(self.tmp, ".kronn", "current_task.json").write_text(json.dumps(items[1]))
        f = json.loads(self.t("lot", "champs", "{}").stdout)["body"]["fields"]
        self.assertEqual((f["summary"], f["components"]), ("API : pistes", [{"name": "dm/api"}]))
        self.assertEqual(json.loads(self.t("lot", "resultat", "DM-9").stdout)["key"], "DM-9")
        b = json.loads(self.t("bilan", "r1").stdout)
        self.assertEqual((b["key"], b["title"], b["meta"]), ("DM-9", "API : pistes", "DM-9"))

    def test_nothing_drafted_fails_and_nothing_created_gives_no_result(self):
        self.t("dossier", "r2", "x", "Bug", "1", "dm/site", "", "backlog", "")
        self.assertNotEqual(self.t("rapport", "redaction", "r2", stdin="pas de JSON").returncode, 0)
        self.assertEqual(self.t("bilan", "r2").stdout.strip(), "{}")


class RedactionSnapshotTest(unittest.TestCase):
    def test_tables_tickets_and_events(self):
        os.environ.setdefault("BUREAU_CONFIG", FIXTURE)
        sys.path.insert(0, os.path.join(ROOT, "workflows"))
        import redaction_snapshot as r
        tmp = tempfile.mkdtemp()
        os.makedirs(os.path.join(tmp, "r1"))
        Path(tmp, "r1", "demande.json").write_text(json.dumps({"intention": "Refondre le lecteur", "tour": 2, "composants": ["dm/site"]}))
        Path(tmp, "r1", "tickets.json").write_text(json.dumps({"version": 2, "tickets": [{"summary": "A", "composant": "dm/site", "points": 3},
                                                                                       {"summary": "B", "composant": "dm/api", "points": 2}]}))
        api = {"/workflows/tk/runs?limit=20": [{"id": "r1", "status": "Running", "started_at": "2026-10-30T09:00:00Z"}],
               "/workflows/tk/runs/r1": {"id": "r1", "workflow_id": "tk", "status": "WaitingApproval", "started_at": "2026-10-30T09:00:00Z",
                                          "step_results": [{"step_name": "dossier"}, {"step_name": "recherche"}, {"step_name": "relire", "started_at": "2026-10-30T09:31:00Z"}]},
               "/workflows/un/runs?limit=40": []}
        old = (r.get, r.HOME, dict(r.CFG))
        r.get, r.HOME = (lambda p: api.get(p)), tmp
        r.CFG.update(models={"ticket": "tk", "ticket_un": "un"})
        try:
            snap = r.snapshot("2026-10-30T10:00:00+00:00")
        finally:
            r.get, r.HOME = old[0], old[1]
            r.CFG.clear()
            r.CFG.update(old[2])
        t = snap["tables"][0]
        self.assertEqual((t["poste"], t["tour"], t["intention"]), ("valider", 2, "Refondre le lecteur"))
        self.assertEqual([(x["summary"], x["etat"]) for x in t["tickets"]], [("A", "gate"), ("B", "gate")])
        self.assertEqual([e["k"] for e in snap["events"]], ["arrive", "gate"])


if __name__ == "__main__":
    unittest.main()
