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
        self.assertIn("⚠ La critique a encore des réserves bloquantes", ap)
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

    def test_tickets_beyond_the_cap_are_set_aside_and_shown_at_the_stamp(self):
        """8 tickets au plus par intention : la consigne le dit ; le surplus et le hors_liste de la rédaction sont gardés,
        relus par la critique et montrés au tampon (ils étaient coupés en silence) ; seuls les 8 partent au foreach."""
        self.t("dossier", "r12", "Douze pages", "Story", "13", "dm/site", "", "backlog", "")
        self.assertIn("8 tickets au plus", self.t("poste", "redaction", "r12").stdout)
        many = {"tickets": [{"summary": f"Page {k}", "description": "h2. Contexte", "composant": "dm/site", "points": 1, "bloque_par": [10]}
                            for k in range(1, 11)], "hors_liste": ["Page 11", "Page 10"]}
        r = self.t("rapport", "redaction", "r12", stdin=json.dumps(many))
        self.assertIn("✂ 3 mis de côté", r.stdout)
        self.assertIn("## Mis de côté pour une autre intention (8 tickets au plus)\n- Page 9\n- Page 10\n- Page 11",
                      self.t("poste", "critique", "r12").stdout)
        ap = self.t("apercus", "r12").stdout
        self.assertIn("8 ticket(s) à créer", ap)
        self.assertIn("✂ 3 livrable(s) hors de cette liste (8 tickets au plus par intention), à lancer dans une autre intention :\n- Page 9", ap)
        self.assertNotIn("bloqué par", ap, "un lien vers un ticket mis de côté est retiré")
        self.t("rapport", "critique", "r12", stdin='{"verdict": "ok", "notes": []}')
        self.t("aiguillage", "r12")
        self.assertEqual(len(json.loads(Path(self.tmp, ".kronn", "tickets.json").read_text())), 8)
        h = json.loads(Path(self.tmp, ".local", "share", "pixel-bureau", "historique", "ticket", "r12.json").read_text())
        self.assertEqual(h["versions"][-1]["hors_liste"], ["Page 9", "Page 10", "Page 11"])

    def test_how_to_do_and_how_to_test_are_filled_from_the_research(self):
        """« Comment faire » et « Comment tester » : la recherche en donne la matière, la rédaction les remplit (le modèle
        les laisse au dev, au framing : c'est ce que le Bureau lui épargne), la critique vérifie qu'ils tiennent dans le code."""
        self.t("dossier", "f1", "x", "Story", "3", "dm/site", "", "backlog", "")
        rech = self.t("poste", "recherche", "f1").stdout
        self.assertIn("de quoi écrire « Comment faire »", rech)
        # Jira en lecture seule : les tickets ne sont créés qu'après le tampon
        self.assertIn("EN LECTURE SEULE", rech)
        self.assertIn("ne crée, ne modifie, ne commente, ne déplace aucun ticket", rech)
        red =self.t("poste", "redaction", "f1").stdout
        self.assertIn("remplis-les aussi, à partir du rapport de la recherche", red)
        self.assertIn("« à compléter », jamais inventé", red)
        self.assertIn("« Comment faire » et « Comment tester » sont remplis et s'appuient sur le code", self.t("poste", "critique", "f1").stdout)

    def test_template_per_type_read_from_its_jira_ticket(self):
        """jira.create.templates : un modèle par type, la clé d'un ticket Jira (Story et Tâche : EW-7951, Bug : EW-7981) ;
        sa description, lue par modele_jira, va dans la consigne de la rédaction et de la critique. Sans réglage pour le type :
        jira.create.template, comme quand le ticket modèle est illisible (sans arrêter le run)."""
        c = json.loads(Path(FIXTURE).read_text())
        c["jira"] = {**c.get("jira", {}), "create": {"template": "h2. Défaut", "templates": {"Story": "EW-7951", "bug": "EW-7981"}}}
        cfg = os.path.join(self.tmp, "cfg.json")
        Path(cfg).write_text(json.dumps(c))
        self.t("dossier", "m1", "x", "Bug", "1", "dm/site", "", "backlog", "", cfg=cfg)
        self.assertEqual(self.t("modele_cle", "m1", cfg=cfg).stdout, "/rest/api/2/issue/EW-7981")
        bug = {"fields": {"summary": "[TEMPLATE] Bug", "description": "h2. Étapes pour reproduire\n_Les étapes exactes._"}}
        self.assertIn("Modèle EW-7981 « [TEMPLATE] Bug » pour le type Bug", self.t("modele_jira", "m1", json.dumps({"data": bug}), cfg=cfg).stdout)
        for k in ("redaction", "critique"):
            p = self.t("poste", k, "m1", cfg=cfg).stdout
            self.assertIn("le ticket modèle EW-7981 « [TEMPLATE] Bug », pour un ticket de type Bug", p)
            self.assertIn("h2. Étapes pour reproduire", p)
        self.t("dossier", "m2", "x", "Tâche", "1", "dm/site", "", "backlog", "", cfg=cfg)
        self.assertEqual(self.t("modele_cle", "m2", cfg=cfg).stdout, "/rest/api/2/myself")
        self.assertIn("## Modèle de ticket de l'équipe\nh2. Défaut", self.t("poste", "redaction", "m2", cfg=cfg).stdout)
        self.t("dossier", "m3", "x", "Story", "1", "dm/site", "", "backlog", "", cfg=cfg)
        r = self.t("modele_jira", "m3", '{"errorMessages": ["introuvable"]}', cfg=cfg)
        self.assertEqual(r.returncode, 0)
        self.assertIn("EW-7951 illisible", r.stderr)
        self.assertIn("## Modèle de ticket de l'équipe\nh2. Défaut", self.t("poste", "redaction", "m3", cfg=cfg).stdout)

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
        self.assertEqual(h["critiques"][0]["notes"], [{"ticket": 1, "gravite": "bloquant", "note": "titre en anglais"}])
        self.assertEqual([(r["texte"], r["v"]) for r in h["retours"]], [("plus court", 1)])
        self.assertEqual([(c["key"], c["title"], c["points"]) for c in h["crees"]], [("DM-12", "Exporter les abonnés en CSV", "2")])
        self.assertTrue(h["at"] <= h["vu"])

    def cfg_with(self, **create):
        """Une config de test : jira.create complété, Kronn sur un port fermé (le projet Kronn d'un dépôt introuvable)."""
        c = json.loads(Path(FIXTURE).read_text())
        c["kronn"]["api"] = "http://127.0.0.1:9/api"
        c["jira"]["create"] = {**(c["jira"].get("create") or {}), **create}
        c["impl"] = {"clones": os.path.join(self.tmp, "clones")}
        p = os.path.join(self.tmp, "cfg.json")
        Path(p).write_text(json.dumps(c))
        return p

    def test_critique_converges_blocking_notes_only_with_its_memory(self):
        """La critique note chaque remarque « bloquant » ou « conseil » : seuls les bloquants renvoient à la rédaction, les
        conseils vont au tampon. Elle relit ses notes d'avant et les réponses de la rédaction ; tes « Changements » sont
        tranchés pour elle, et lui rouvrent un tour."""
        self.t("dossier", "c1", "Bouton fermer de la modale", "Story", "2", "dm/site", "", "backlog", "")
        self.t("rapport", "redaction", "c1", stdin='{"tickets": [{"summary": "A", "description": "h2. Contexte", "composant": "dm/site", "points": 2}]}')
        r = self.t("rapport", "critique", "c1", stdin=json.dumps({"verdict": "a_retoucher", "notes": [
            {"ticket": 1, "gravite": "conseil", "note": "titre plus court"}]}))
        self.assertIn("✓ relu", r.stdout, "que des conseils : rien à retoucher, quoi que dise le verdict")
        self.assertEqual(self.t("aiguillage", "c1").returncode, 0)
        ap = self.t("apercus", "c1").stdout
        self.assertIn("💡 Conseils de la critique (non bloquants) :\n- T1 : titre plus court", ap)
        self.assertNotIn("réserves", ap)
        # un bloquant : retour à la rédaction, qui le voit à corriger et le conseil à part, et répond
        self.t("rapport", "critique", "c1", stdin=json.dumps({"verdict": "a_retoucher", "notes": [
            {"ticket": 1, "gravite": "bloquant", "note": "comment tester ?"}, {"ticket": 1, "gravite": "conseil", "note": "titre plus court"}]}))
        self.assertEqual(self.t("aiguillage", "c1").returncode, 3)
        red = self.t("poste", "redaction", "c1").stdout
        self.assertIn("## Notes bloquantes de la critique (à corriger)\n- ticket 1 : comment tester ?", red)
        self.assertIn("## Conseils de la critique (à suivre s'ils sont justes)\n- ticket 1 : titre plus court", red)
        self.t("rapport", "redaction", "c1", stdin=json.dumps({"tickets": [{"summary": "A", "description": "h2. Comment tester", "composant": "dm/site",
                                                                          "points": 2}], "reponses": ["ticket 1 : section Comment tester ajoutée"]}))
        crit = self.t("poste", "critique", "c1").stdout
        self.assertIn("## Tes relectures précédentes (ne les rouvre pas, ne les contredis pas)", crit)
        self.assertIn("- version 1 · ticket 1 · bloquant : comment tester ?", crit)
        self.assertIn("## Réponses de la rédaction à tes notes\n- ticket 1 : section Comment tester ajoutée", crit)
        self.assertIn('"gravite": "bloquant" | "conseil"', crit)
        # une note sans gravité compte comme bloquante
        self.t("rapport", "critique", "c1", stdin='{"verdict": "a_retoucher", "notes": [{"ticket": 1, "note": "composant faux"}]}')
        self.assertEqual(self.t("aiguillage", "c1").returncode, 3)
        self.assertEqual(self.t("aiguillage", "c1").returncode, 0, "3 tours au plus")
        self.assertIn("⚠ La critique a encore des réserves bloquantes", self.t("apercus", "c1").stdout)
        # tes « Changements » : la critique les reçoit comme tranchés, et peut encore renvoyer une fois
        self.t("poste", "redaction", "c1", "garde le composant dm/site")
        self.assertIn("## Retours du boss à la validation (tranchés : ne les conteste pas)\n- garde le composant dm/site",
                      self.t("poste", "critique", "c1").stdout)
        self.t("rapport", "redaction", "c1", stdin='{"tickets": [{"summary": "B", "description": "h2. Contexte", "composant": "dm/site", "points": 2}]}')
        self.t("rapport", "critique", "c1", stdin='{"verdict": "a_retoucher", "notes": [{"ticket": 1, "gravite": "bloquant", "note": "x"}]}')
        self.assertEqual(self.t("aiguillage", "c1").returncode, 3, "un tour de plus après tes Changements")
        self.assertEqual(self.t("aiguillage", "c1").returncode, 0)

    def test_near_duplicates_from_jira(self):
        """Les tickets ouverts proches : un JQL par racine des mots forts de l'intention (sans les mots de la maison), puis
        le tri par racines communes ; donnés à la rédaction et à la critique, montrés au tampon. Jira en erreur : sans."""
        cfg = self.cfg_with(components=["dm_site", "dm_api"])
        self.t("dossier", "d1", "Publier le contrat OpenAPI des keywords en paquet Composer, servir les keywords par préfixe",
               "Story", "3", "dm_api", "", "backlog", "", cfg=cfg)
        jql = self.t("doublons_jql", "d1", cfg=cfg).stdout
        self.assertTrue(jql.startswith("project = DM AND statusCategory != Done AND (summary ~ \"keywor*\""), jql)
        for w in ('"contra*"', '"compos*"', '"prefix*"', '"openap*"'):
            self.assertIn(w, jql)
        self.assertNotIn('"dunder', jql, "le site Jira n'est pas un mot de l'intention")
        issues = {"issues": [{"key": "DM-1", "fields": {"summary": "[Keywords] Publish the OpenAPI contract as a Composer package", "status": {"name": "To Do"}}},
                             {"key": "DM-2", "fields": {"summary": "Fix the contract tests", "status": {"name": "To Do"}}},
                             {"key": "DM-3", "fields": {"summary": "Serve keywords by prefix", "status": {"name": "En cours"}}}]}
        out = self.t("doublons", "d1", json.dumps(issues), cfg=cfg).stdout
        self.assertIn("2 ticket(s) ouvert(s) proche(s)", out)
        self.assertLess(out.index("DM-1"), out.index("DM-3"), "le plus proche d'abord")
        self.assertNotIn("DM-2", out, "un seul mot commun : pas un doublon")
        self.assertIn("## Tickets Jira ouverts proches de l'intention", self.t("poste", "redaction", "d1", cfg=cfg).stdout)
        self.assertIn("- DM-3 · Serve keywords by prefix (En cours)", self.t("poste", "critique", "d1", cfg=cfg).stdout)
        self.assertNotIn("Tickets Jira ouverts", self.t("poste", "recherche", "d1", cfg=cfg).stdout)
        self.t("rapport", "redaction", "d1", stdin='{"tickets": [{"summary": "A", "description": "h2. Contexte", "composant": "dm_api", "points": 3}]}', cfg=cfg)
        self.assertIn("🔎 Tickets Jira ouverts proches (doublons possibles) :\n- DM-1 ·", self.t("apercus", "d1", cfg=cfg).stdout)
        # Jira en erreur (le Goto de l'étape passe un texte d'erreur) : aucun, sans échec
        r = self.t("doublons", "d1", "HTTP 400 on GET", cfg=cfg)
        self.assertEqual(r.returncode, 0)
        self.assertIn("indisponible", r.stdout)
        self.assertNotIn("🔎", self.t("apercus", "d1", cfg=cfg).stdout)
        # sans mot fort : une recherche qui ne ramène rien
        self.t("dossier", "d2", "Fix it", "Bug", "1", "", "", "backlog", "", cfg=cfg)
        self.assertTrue(self.t("doublons_jql", "d2", cfg=cfg).stdout.endswith("AND created > now()"))

    def test_labels_on_every_created_ticket(self):
        cfg = self.cfg_with(labels=["ia_framed", "Rédigé par le Bureau", "ia_framed"])
        self.t("dossier", "l1", "x", "Tâche", "1", "dm/site", "", "backlog", "", cfg=cfg)
        self.t("rapport", "redaction", "l1", stdin='{"tickets": [{"summary": "A", "description": "h2. Contexte", "composant": "dm/site", "points": 1}]}', cfg=cfg)
        self.t("aiguillage", "l1", cfg=cfg)
        self.assertIn("Labels : ia_framed, Rédigé_par_le_Bureau", self.t("apercus", "l1", cfg=cfg).stdout)
        Path(self.tmp, ".kronn", "current_task.json").write_text(json.dumps(json.loads(Path(self.tmp, ".kronn", "tickets.json").read_text())[0]))
        f = json.loads(self.t("lot", "champs", "{}", cfg=cfg).stdout)["body"]["fields"]
        self.assertEqual(f["labels"], ["ia_framed", "Rédigé_par_le_Bureau"])
        self.assertNotIn("labels", json.loads(self.t("lot", "champs", "{}").stdout)["body"]["fields"], "sans réglage : aucun label")

    def test_team_template_file_is_copied_into_the_prompt(self):
        """« <chemin> du dépôt <dépôt> » : le fichier, lu dans la copie locale du dépôt, recopié dans la consigne de la
        rédaction et de la critique (l'agent n'a plus à le chercher) ; introuvable : le réglage tel quel."""
        tpl = Path(self.tmp, "clones", "dm_site", "docs", "templates")
        tpl.mkdir(parents=True)
        Path(tpl, "jira-ticket.md").write_text("h2. +De quoi on parle ?+\n{panel:bgColor=#e3fcef}")
        cfg = self.cfg_with(template="docs/templates/jira-ticket.md du dépôt dm_site")
        self.t("dossier", "m1", "x", "Story", "3", "dm/site", "", "backlog", "", cfg=cfg)
        for poste in ("redaction", "critique"):
            out = self.t("poste", poste, "m1", cfg=cfg).stdout
            self.assertIn("## Modèle de ticket de l'équipe\n(fichier docs/templates/jira-ticket.md du dépôt dm_site)\n\nh2. +De quoi on parle ?+", out)
        self.assertIn("le modèle de ticket de l'équipe est suivi", self.t("poste", "critique", "m1", cfg=cfg).stdout)
        cfg = self.cfg_with(template="dm_site:docs/autre.md")
        r = self.t("poste", "redaction", "m1", cfg=cfg)
        self.assertIn("## Modèle de ticket de l'équipe\ndm_site:docs/autre.md", r.stdout)
        self.assertIn("modèle docs/autre.md introuvable", r.stderr)
        cfg = self.cfg_with(template="Trois sections, en français.")
        self.assertIn("## Modèle de ticket de l'équipe\nTrois sections, en français.", self.t("poste", "redaction", "m1", cfg=cfg).stdout)

    def test_dependencies_are_cleaned_shown_at_the_stamp_and_linked_in_jira(self):
        """bloque_par : numéros valides, sans boucle ; montré au tampon ; à la création, chaque ticket est lié (« Blocks »)
        à ceux déjà créés, vu de lui-même : inwardIssue = il est bloqué par, outwardIssue = il bloque."""
        self.t("dossier", "l1", "Contrat d'API puis client", "Story", "8", "dm/api", "dm/site", "backlog", "")
        three = {"tickets": [{"summary": "API : le contrat", "description": "h2. x", "composant": "dm/api", "points": 3, "bloque_par": []},
                             {"summary": "Site : le client", "description": "h2. x", "composant": "dm/site", "points": 3, "bloque_par": ["T1", 3, 2, 9]},
                             {"summary": "Doc", "description": "h2. x", "composant": "dm/site", "points": 2, "bloque_par": [2]}]}
        out = self.t("rapport", "redaction", "l1", stdin=json.dumps(three)).stdout
        self.assertIn("2. Site : le client · dm/site · 3 pts · bloqué par T1, T3", out)
        t = json.loads(Path(self.tmp, ".cache/pixel-bureau/ticket/l1/tickets.json").read_text())["tickets"]
        self.assertEqual([x["bloque_par"] for x in t], [[], [1, 3], []], "lui-même et T9 retirés ; T3 bloqué par T2 fermerait une boucle")
        ap = self.t("apercus", "l1").stdout
        self.assertIn("T2 · Site : le client · Story · 3 pts · dm/site · bloqué par T1, T3", ap)
        self.assertIn("Liens Jira « Blocks » posés à la création", ap)
        lot = lambda i, key: (Path(self.tmp, ".kronn").mkdir(exist_ok=True), Path(self.tmp, ".kronn", "current_task.json").write_text(json.dumps({"run": "l1", "i": i})),  # noqa: E731
                              self.t("lot", "resultat", key), json.loads(self.t("lot", "liens", key).stdout))[-1]
        self.assertEqual(lot(0, "DM-1"), {"body": {}, "n": 0, "texte": "aucun lien"}, "le premier créé n'a rien à lier")
        b = lot(1, "DM-2")
        self.assertEqual(b["body"]["update"]["issuelinks"], [{"add": {"type": {"name": "Blocks"}, "inwardIssue": {"key": "DM-1"}}}])
        self.assertEqual(b["texte"], "bloqué par DM-1", "T3 pas encore créé : son lien viendra avec lui")
        b = lot(2, "DM-3")
        self.assertEqual(b["body"]["update"]["issuelinks"], [{"add": {"type": {"name": "Blocks"}, "outwardIssue": {"key": "DM-2"}}}])
        self.assertEqual(b["texte"], "bloque DM-2")

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
