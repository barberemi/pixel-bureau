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

    def t(self, *a, stdin=None, cfg=FIXTURE):
        return subprocess.run([sys.executable, os.path.join(ROOT, "workflows", "ticket.py"), *a], input=stdin, capture_output=True, text=True,
                              cwd=self.tmp, env={"PATH": "/usr/bin:/bin", "HOME": self.tmp, "BUREAU_CONFIG": cfg}, timeout=30)

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
        r = self.t("bilan", "r1")
        self.assertEqual(r.returncode, 0)
        self.assertIn("Rafraîchissement du cron redaction_bilan", r.stderr, "la page du bilan relancée, sans faire échouer l'étape")
        b = json.loads(r.stdout)
        self.assertEqual((b["key"], b["title"], b["meta"]), ("DM-9", "API : pistes", "DM-9"))

    def test_gate_preview_shows_the_critique_reservations_left_after_the_last_round(self):
        """Trois tours faits et la critique encore « à retoucher » : l'aperçu du tampon montre ses réserves ; une critique
        d'une version d'avant (la rédaction a repris depuis) ne s'affiche pas."""
        self.t("dossier", "r3", "x", "Tâche", "1", "dm/site", "", "backlog", "")
        self.t("rapport", "redaction", "r3", stdin='{"tickets": [{"summary": "A", "description": "h2. Contexte", "composant": "dm/site", "points": 1}]}')
        self.t("rapport", "critique", "r3", stdin='{"verdict": "a_retoucher", "notes": [{"ticket": 1, "note": "alt existe déjà"}]}')
        ap = self.t("apercus", "r3").stdout
        self.assertIn("⚠ La critique a encore des réserves après 3 tours", ap)
        self.assertIn("- T1 : alt existe déjà", ap)
        self.t("rapport", "redaction", "r3", stdin='{"tickets": [{"summary": "B", "description": "h2. Contexte", "composant": "dm/site", "points": 1}]}')
        self.assertNotIn("réserves", self.t("apercus", "r3").stdout)

    def test_language_and_research_report_without_narration(self):
        """Chaque poste rédige dans la langue de l'équipe (jira.create.language, le français par défaut) ; le rapport de la
        recherche commence à sa ligne « Composants : », sans la narration de l'agent (premier vrai run)."""
        self.t("dossier", "r4", "x", "Tâche", "1", "dm/site", "", "backlog", "")
        self.assertIn("## Langue\nRédige en français : le rapport, le titre (summary)", self.t("poste", "redaction", "r4").stdout)
        rech = self.t("poste", "recherche", "r4").stdout
        self.assertIn("Rends UNIQUEMENT le rapport", rech)
        self.assertIn("ceux qui appellent ou consomment ce qui change", rech)  # pas seulement les composants donnés
        out = self.t("rapport", "recherche", "r4", stdin="Je vais chercher.\n\nParfait ! J'ai trouvé.\n\n**Composants :** dm/site\n- src/Modal.twig:12").stdout
        self.assertTrue(out.startswith("**Composants :** dm/site"), out[:60])
        self.assertNotIn("Je vais chercher", self.t("poste", "redaction", "r4").stdout)

    def test_title_language_apart(self):
        """jira.create.title_language : le titre dans sa langue (modèle d'équipe « titres en anglais »), la description
        et le rapport dans la langue des tickets ; la règle passe avant les autres consignes de langue."""
        c = json.loads(Path(FIXTURE).read_text())
        c.setdefault("jira", {}).setdefault("create", {})["title_language"] = "anglais"
        cfg = os.path.join(self.tmp, "cfg.json")
        Path(cfg).write_text(json.dumps(c))
        self.t("dossier", "r5", "x", "Tâche", "1", "dm/site", "", "backlog", "", cfg=cfg)
        out = self.t("poste", "critique", "r5", cfg=cfg).stdout
        self.assertIn("Rédige en français le rapport et la description des tickets, et le titre (summary) en anglais", out)

    def test_gate_recap_then_detail_only_if_short(self):
        """Le tampon : une ligne par ticket ; le détail suit s'il tient en GATE_FULL caractères, sinon il est au 2e."""
        self.t("dossier", "r6", "x", "Story", "3", "dm/site", "", "backlog", "")
        short = {"tickets": [{"summary": "A", "description": "h2. Contexte\nCourt", "composant": "dm/site", "points": 1},
                             {"summary": "B", "description": "h2. Contexte\nCourt", "composant": "dm/api", "points": 2}]}
        self.t("rapport", "redaction", "r6", stdin=json.dumps(short))
        ap = self.t("apercus", "r6").stdout
        self.assertIn("2 ticket(s) à créer :\nT1 · A · Story · 1 pts · dm/site\nT2 · B · Story · 2 pts · dm/api", ap)
        self.assertIn("━━ T2 ━━", ap)
        long = {"tickets": [{"summary": f"T{k}", "description": "h2. Contexte\n" + "x" * 1500, "composant": "dm/site", "points": 1} for k in range(4)]}
        self.t("rapport", "redaction", "r6", stdin=json.dumps(long))
        ap = self.t("apercus", "r6").stdout
        self.assertIn("T4 · T3 · Story · 1 pts · dm/site", ap)
        self.assertNotIn("━━", ap)
        self.assertIn("au 2e étage du Bureau, clic sur sa carte", ap)
        self.assertLess(len(ap), 1000)

    def test_parent_must_be_an_epic(self):
        """Jira n'accepte qu'une épic pour parent : vérifié dès le dossier (run ed873fc9 : EW-6816, une Story, refusée à la
        création des 3 tickets). Une épic passe ; une Story avec son épic passe sous l'épic ; sinon le run s'arrête."""
        self.t("dossier", "p1", "x", "Story", "3", "dm/site", "", "backlog", "")
        self.assertEqual(self.t("parent_cle", "p1").stdout, "/rest/api/2/myself")
        self.assertIn("Sans parent", self.t("parent_check", "p1", '{"accountId": "x"}').stdout)
        self.t("dossier", "p2", "x", "Story", "3", "dm/site", "", "backlog", "EW-6816")
        self.assertEqual(self.t("parent_cle", "p2").stdout, "/rest/api/2/issue/EW-6816")
        epic = {"fields": {"summary": "Stabilisation", "issuetype": {"name": "Epic", "hierarchyLevel": 1}}}
        self.assertEqual(self.t("parent_check", "p2", json.dumps({"data": epic})).returncode, 0)
        story = {"fields": {"summary": "Keywords", "issuetype": {"name": "Story", "hierarchyLevel": 0},
                            "parent": {"key": "EW-6843", "fields": {"summary": "Stabilisation", "issuetype": {"name": "Epic", "hierarchyLevel": 1}}}}}
        r = self.t("parent_check", "p2", json.dumps(story))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("sous son épic EW-6843", r.stdout)
        self.t("rapport", "redaction", "p2", stdin='{"tickets": [{"summary": "A", "description": "h2. Contexte", "composant": "dm/site", "points": 1}]}')
        self.assertIn("Parent : EW-6843, l'épic de EW-6816", self.t("apercus", "p2").stdout)
        self.assertIn("parent EW-6843", self.t("apercus", "p2").stdout)  # le détail du ticket : son vrai parent
        self.t("dossier", "p3", "x", "Story", "3", "dm/site", "", "backlog", "EW-1")
        alone = {"fields": {"issuetype": {"name": "Story", "hierarchyLevel": 0}}}
        r = self.t("parent_check", "p3", json.dumps(alone))
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("sans épic au-dessus", r.stderr)
        r = self.t("parent_check", "p3", '{"errorMessages": ["Issue does not exist"]}')
        self.assertIn("introuvable", r.stderr)

    def test_nothing_drafted_fails_and_nothing_created_gives_no_result(self):
        self.t("dossier", "r2", "x", "Bug", "1", "dm/site", "", "backlog", "")
        self.assertNotEqual(self.t("rapport", "redaction", "r2", stdin="pas de JSON").returncode, 0)
        self.assertEqual(self.t("bilan", "r2").stdout.strip(), "{}")

    def test_history_keeps_every_version_critique_feedback_and_created_ticket(self):
        """L'historique de la page « Rédaction · bilan » : le dossier ne garde que la dernière version et la dernière
        critique, l'historique les garde toutes, avec tes retours et les tickets créés ; un essai est marqué."""
        self.t("dossier", "h1", "[ESSAI du Bureau] Export CSV", "Tâche", "2", "dm/outils", "", "backlog", "")
        self.t("rapport", "recherche", "h1", stdin="Composants : dm/outils\n- tools/export.py")
        one = lambda s: json.dumps({"tickets": [{"summary": s, "description": "h2. Contexte", "composant": "dm/outils", "points": 2}]})
        self.t("rapport", "redaction", "h1", stdin=one("Export CSV"))
        self.t("rapport", "critique", "h1", stdin=json.dumps({"verdict": "a_retoucher", "notes": [{"ticket": 1, "note": "titre en anglais"}]}))
        self.assertEqual(self.t("aiguillage", "h1").returncode, 3)
        self.t("poste", "redaction", "h1", "plus court")
        self.t("rapport", "redaction", "h1", stdin=one("Exporter les abonnés en CSV"))
        self.t("rapport", "critique", "h1", stdin='{"verdict": "ok", "notes": []}')
        self.t("aiguillage", "h1")
        Path(self.tmp, ".kronn", "current_task.json").write_text(json.dumps({"run": "h1", "i": 0}))
        self.t("lot", "resultat", "DM-12")
        h = json.loads(Path(self.tmp, ".local/share/pixel-bureau/historique/ticket/h1.json").read_text())
        self.assertTrue(h["essai"])
        self.assertEqual((h["intention"], h["tour"], h["recherche"]["composants"]), ("[ESSAI du Bureau] Export CSV", 2, ["dm/outils"]))
        self.assertEqual([(v["v"], v["tickets"][0]["summary"]) for v in h["versions"]], [(1, "Export CSV"), (2, "Exporter les abonnés en CSV")])
        self.assertEqual([(c["v"], c["verdict"]) for c in h["critiques"]], [(1, "a_retoucher"), (2, "ok")])
        self.assertEqual(h["critiques"][0]["notes"], [{"ticket": 1, "note": "titre en anglais"}])
        self.assertEqual([(r["texte"], r["v"]) for r in h["retours"]], [("plus court", 1)])
        self.assertEqual([(c["key"], c["title"], c["points"]) for c in h["crees"]], [("DM-12", "Exporter les abonnés en CSV", "2")])
        self.assertTrue(h["at"] <= h["vu"])

    def test_history_never_fails_the_step(self):
        Path(self.tmp, ".local/share/pixel-bureau/historique").mkdir(parents=True)
        Path(self.tmp, ".local/share/pixel-bureau/historique/ticket").write_text("un fichier, pas un dossier")
        r = self.t("dossier", "h2", "x", "Bug", "1", "dm/site", "", "backlog", "")
        self.assertEqual(r.returncode, 0)
        self.assertIn("historique non écrit", r.stderr)


class RedactionSnapshotTest(unittest.TestCase):
    def test_tables_tickets_and_events(self):
        os.environ.setdefault("BUREAU_CONFIG", FIXTURE)
        sys.path.insert(0, os.path.join(ROOT, "workflows"))
        import redaction_snapshot as r
        tmp = tempfile.mkdtemp()
        os.makedirs(os.path.join(tmp, "r1"))
        Path(tmp, "r1", "demande.json").write_text(json.dumps({"intention": "Refondre le lecteur", "tour": 2, "composants": ["dm/site"]}))
        Path(tmp, "r1", "tickets.json").write_text(json.dumps({"version": 2, "tickets": [{"summary": "A", "composant": "dm/site", "points": 3,
                                                                                        "description": "h2. Contexte\n{panel}\nLe lecteur\n{panel}\n* sous-titres"},
                                                                                       {"summary": "B", "composant": "dm/api", "points": 2}]}))
        api = {"/workflows/tk/runs?limit=20": [{"id": "r1", "status": "Running", "started_at": "2026-10-30T09:00:00Z", "tokens_used": 21000},
                                               {"id": "r0", "status": "Success", "started_at": "2026-10-29T22:30:00Z", "tokens_used": 5000}],
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
        self.assertEqual([e["k"] for e in snap["events"]], ["arrive", "arrive", "gate"], "r0 (la veille) arrive aussi")
        self.assertEqual(t["tickets"][0]["detail"], "▸ Contexte\n│ Le lecteur\n• sous-titres")  # le texte lisible, pour la fiche au 2e
        self.assertNotIn("detail", t["tickets"][1])
        self.assertEqual(snap["tok_jour"], 21000, "les jetons depuis minuit à Paris (le run de 23 h 30 la veille ne compte pas)")


class RevueFileTest(unittest.TestCase):
    """La file de la salle de revue (2e étage) : les PR retenues par le cron, dans l'ordre, et les verdicts des revues."""
    def test_finalize_prints_the_kept_prs_in_order(self):
        sys.path.insert(0, os.path.join(ROOT, "tools"))
        import templates
        cfg = json.loads(Path(FIXTURE).read_text())
        cfg["github"] = {**cfg.get("github", {}), "config_id": "12121212-3434-5656-7878-909090909090", "pr_repos": ["dm/site"]}
        step = next(s for s in templates.render(templates.load_templates()["review_cron"], cfg)["steps"] if s["name"] == "finalize")
        tmp = tempfile.mkdtemp()
        os.makedirs(os.path.join(tmp, ".kronn"))
        cand = [{"repo": "dm/site", "number": 12, "author": "hollyflax", "baseRef": "main", "head": "a"},
                {"repo": "dm/api", "number": 7, "author": "pambeesly", "baseRef": "main", "head": "b"},
                {"repo": "dm/site", "number": 9, "author": "hollyflax", "baseRef": "main", "head": "c"}]
        Path(tmp, ".kronn", "prs_candidates.json").write_text(json.dumps(cand))
        done = {"items": [{"input": {"repo": "dm/api", "number": 7}, "response": [{"user": {"login": "bot"}, "body": "Review automatique", "commit_id": "b"}]}]}
        out = subprocess.run([step["exec_command"], *step["exec_args"][:2], "_", "bot"], cwd=tmp, input=json.dumps(done), capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertIn('PRS=[["dm/site",12,"hollyflax"],["dm/site",9,"hollyflax"]]', out.stdout)

    def test_snapshot_reads_batches_and_verdicts_once(self):
        os.environ.setdefault("BUREAU_CONFIG", FIXTURE)
        sys.path.insert(0, os.path.join(ROOT, "workflows"))
        import redaction_snapshot as r
        out = lambda d: "x\n---STEP_OUTPUT---\n" + json.dumps({"data": d}) + "\n---END_STEP_OUTPUT---\n[SIGNAL: OK]"  # noqa: E731
        api = {"/workflows/cr/runs?limit=8": [{"id": "c1", "status": "Success", "started_at": "2026-10-30T09:30:00Z"},
                                              {"id": "c0", "status": "Success", "started_at": "2026-10-28T09:30:00Z"}],
               "/workflows/cr/runs/c1": {"step_results": [{"step_name": "finalize", "output": out({"stdout": '3 candidates\nPRS=[["dm/site",12,"hollyflax"],["dm/api",7,"pambeesly"]]\n'})}]},
               "/workflows/ch/runs?limit=60": [{"id": "k1", "parent_run_id": "c1", "status": "Success"}, {"id": "k2", "parent_run_id": "c1", "status": "Running"},
                                                {"id": "k9", "parent_run_id": "autre", "status": "Success"}],
               "/workflows/ch/runs/k1": {"step_results": [{"step_name": "avis", "output": out({"verdict": "comment", "pr": 12})}]}}
        calls = []
        old = (r.get, r.RV_HOME, dict(r.CFG))
        r.get, r.RV_HOME = (lambda p: calls.append(p) or api.get(p)), tempfile.mkdtemp()
        r.CFG.update(models={"review_cron": "cr", "review_child": "ch"})
        try:
            snap = r.snapshot("2026-10-30T10:00:00+00:00")
            self.assertEqual(snap["revue"], {"batches": {"c1": [["dm/site", 12, "hollyflax"], ["dm/api", 7, "pambeesly"]]}, "verdicts": {"k1": "comment"}})
            n = len(calls)
            self.assertEqual(r.snapshot("2026-10-30T10:01:00+00:00")["revue"], snap["revue"])
            self.assertEqual([c for c in calls[n:] if "/runs/" in c], [], "un run fini n'est lu qu'une fois")
        finally:
            r.get, r.RV_HOME = old[0], old[1]
            r.CFG.clear()
            r.CFG.update(old[2])


if __name__ == "__main__":
    unittest.main()
