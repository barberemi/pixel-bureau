"""Mémoire du soir (python3 -m unittest tests/test_memoire.py) : workflows/memoire.py relève les retours humains des quatre
workflows à agent (historique des tickets, retours.md de la chaîne, bloquants réfutés des revues, « Changements » des
corrections), vérifie et applique la proposition de l'agent ; workflows/_memoire.py donne à chaque poste sa part des
fiches ; le rejeu (Palpatine) apprend aussi : les écarts du juge, hors jeu témoin, en seconde proposition validée à sa
propre gate (boss_rejeu), rangée dans <rejeu.dossier>/lecons.json. Horloge figée (tests/fakeclock), HOME et dossiers de la
mémoire et du rejeu dans un dossier temporaire."""
import copy, json, os, shutil, subprocess, sys, tempfile, unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURE = json.loads(Path(ROOT, "tests", "fixtures", "bureau.config.json").read_text())
sys.path.insert(0, os.path.join(ROOT, "tools"))
import assemble, templates  # noqa: E402

PARIS = ZoneInfo("Europe/Paris")
NOW = datetime.now(PARIS).replace(hour=22, minute=0, second=0, microsecond=0)  # le passage du cron à 22 h


def iso(d):
    return d.astimezone(timezone.utc).isoformat(timespec="seconds")


class MemoireTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.mem = os.path.join(self.tmp, "memoire")
        self.rj = os.path.join(self.tmp, "rejeu")

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def cfg(self, **memoire):
        c = copy.deepcopy(FIXTURE)
        c["memoire"] = {"dossier": self.mem, **memoire}
        c["rejeu"] = {"dossier": self.rj}
        path = os.path.join(self.tmp, "bureau.config.json")
        Path(path).write_text(json.dumps(c))
        return path

    def run_(self, *args, stdin="", now=NOW, script="memoire.py", **memoire):
        env = {"PATH": "/usr/bin:/bin", "HOME": self.tmp, "BUREAU_CONFIG": self.cfg(**memoire),
               "PYTHONPATH": os.path.join(ROOT, "tests", "fakeclock"), "BUREAU_TEST_NOW": now.isoformat()}
        return subprocess.run([sys.executable, os.path.join(ROOT, "workflows", script), *args], input=stdin, capture_output=True,
                              text=True, cwd=self.tmp, env=env, timeout=60)

    def fiche(self, nom, *lecons):
        os.makedirs(self.mem, exist_ok=True)
        Path(self.mem, nom + ".md").write_text(f"# Mémoire · {nom}\n\n" + "".join(f"- {x}\n" for x in lecons))

    # ---------- sources ----------
    def ticket(self, run, *retours, essai=False):
        d = Path(self.tmp, ".local/share/pixel-bureau/historique/ticket")
        d.mkdir(parents=True, exist_ok=True)
        (d / f"{run}.json").write_text(json.dumps({"run": run, "intention": "Synchroniser les traductions", "essai": essai,
                                                   "retours": [{"at": iso(NOW - timedelta(hours=h)), "texte": t} for h, t in retours]}))

    def chaine(self, ticket, repo, *retours, essai=False):
        d = Path(self.tmp, ".cache/pixel-bureau/chaine", ticket, repo, "courant")
        d.mkdir(parents=True, exist_ok=True)
        (d / "etat.json").write_text(json.dumps({"ticket": ticket, "essai": essai}))
        (d / "retours.md").write_text("".join(f"\n## Retour humain ({p}, {(NOW - timedelta(hours=h)).strftime('%Y-%m-%d %H:%M')}) <!-- {k} -->\n\n{t}\n"
                                              for p, h, k, t in retours))

    def revue(self, repo, pr, h, n, blockers=(), suivi=()):
        d = Path(self.tmp, ".local/share/pixel-bureau/revues", repo.replace("/", "__"), f"pr-{pr}")
        d.mkdir(parents=True, exist_ok=True)
        (d / f"{n}.json").write_text(json.dumps({"repo": repo, "pr": pr, "at": iso(NOW - timedelta(hours=h)), "postee": True,
                                                  "blockers": list(blockers), "suivi": [{"point": p, "etat": e, "preuve": "test présent au head"}
                                                                                        for p, e in suivi]}))

    def correction(self, run, texte, h=2):
        d = Path(self.tmp, ".cache/pixel-bureau/pr/runs")
        d.mkdir(parents=True, exist_ok=True)
        (d / f"{run}.json").write_text(json.dumps({"repo": "dm/site", "pr": 42, "retour_humain": {"at": iso(NOW - timedelta(hours=h)), "texte": texte,
                                                                                                    "repo": "dm/site", "pr": "42"}}))

    def rejeu(self, ticket, run, ecarts, jeu="rotation", h=3):
        d = Path(self.rj, ticket)
        d.mkdir(parents=True, exist_ok=True)
        (d / f"{run}.json").write_text(json.dumps({"ticket": ticket, "run": run, "jeu": jeu, "pr": 7, "note_sur_100": 64, "atteint": False,
                                                   "fini_le": iso(NOW - timedelta(hours=h)), "juge": {"resume": "x", "ecarts": [
                                                       {"fichier": "a.py", "quoi": q, "cause": c, "lecon": l, **({"poste": p} if p else {})}
                                                       for q, c, l, p in ecarts]}}))

    def lecons(self):
        return json.loads(Path(self.rj, "lecons.json").read_text())

    def test_releve_reads_the_four_workflows_once(self):
        self.ticket("aaaa1111", (3, "Garde les noms de commande de la discussion"))
        self.ticket("bbbb2222", (3, "consigne d'essai"), essai=True)
        self.chaine("DM-1", "dm__site", ("code", 5, "h1", "Pas de console.log laissé dans le code"), ("cadrage", 4, "h2", "Découpe en deux lots"))
        self.chaine("DM-2", "dm__site", ("code", 5, "h3", "Essai de nuit : approuvé pour tester la suite"), essai=True)
        self.revue("dm/site", 7, 30, "a", blockers=["**Test manquant** pour le skip"])
        self.revue("dm/site", 7, 6, "b", suivi=[("P1", "refute")])
        self.correction("r1", "Ne réponds pas aux remarques de style, corrige-les")
        self.fiche("ticket", "[redaction] Un critère d'acceptation par comportement")
        r = self.run_("releve")
        self.assertEqual(r.returncode, 0, r.stderr)
        out = r.stdout
        self.assertIn("Nouveaux retours : ticket 1, impl 2, revue 1, correction 1.", out)
        self.assertIn("[ticket] ", out)
        self.assertIn("Garde les noms de commande de la discussion", out)
        self.assertIn("[impl/code] ", out)
        self.assertIn("Pas de console.log laissé dans le code", out)
        self.assertIn("[revue/avis] ", out)
        self.assertIn("Bloquant réfuté par la passe suivante : **Test manquant** pour le skip ; preuve : test présent au head", out)
        self.assertIn("[correction] ", out)
        self.assertIn("dm/site#42", out)
        self.assertNotIn("consigne d'essai", out, "un essai de la rédaction n'est pas un retour")
        self.assertNotIn("Essai de nuit", out, "un essai de la chaîne non plus")
        self.assertIn("### Fiche `ticket`", out)
        self.assertIn("- [redaction] Un critère d'acceptation par comportement", out)
        self.assertIn("### Fiche `equipe` (commune à tous ; 25 leçons au plus)\n(vide)", out)
        jour = Path(self.mem, "journal", NOW.strftime("%Y-%m-%d") + ".jsonl").read_text().splitlines()
        self.assertEqual(len(jour), 5)
        # le soir suivant, rien de nouveau : code 3, fin sans agent ; un retour de plus repart, les autres en « déjà vus »
        again = self.run_("releve", now=NOW + timedelta(days=1))
        self.assertEqual(again.returncode, 3, again.stdout)
        self.assertIn("Aucun retour nouveau", again.stdout)
        self.correction("r2", "Lance les tests du dépôt avant de pousser", h=-20)
        third = self.run_("releve", now=NOW + timedelta(days=1))
        self.assertEqual(third.returncode, 0, third.stderr)
        self.assertIn("Nouveaux retours : ticket 0, impl 0, revue 0, correction 1.", third.stdout)
        vus = third.stdout.split("## Retours déjà vus")[1]
        self.assertIn("Pas de console.log laissé dans le code", vus)

    def test_releve_follows_the_settings_and_the_hour(self):
        self.ticket("aaaa1111", (3, "Titre en anglais"))
        self.correction("r1", "Pas de réponse aux bots")
        off = self.run_("releve", actif=False)
        self.assertEqual(off.returncode, 3)
        self.assertIn("Mémoire éteinte", off.stdout)
        seul = self.run_("releve", workflows=["correction"])
        self.assertEqual(seul.returncode, 0, seul.stderr)
        self.assertIn("Nouveaux retours : correction 1.", seul.stdout)
        self.assertNotIn("Titre en anglais", seul.stdout)
        self.assertNotIn("Fiche `ticket`", seul.stdout)
        # le cron passe aux deux heures UTC possibles : celui qui ne tombe pas à 22 h au bureau s'arrête, une heure réglée
        # autrement (memoire.heure) et un lancement à la main (une autre minute) passent
        tot = self.run_("releve", now=NOW - timedelta(hours=1))
        self.assertEqual(tot.returncode, 3)
        self.assertIn("Pas 22 h au bureau", tot.stdout)
        self.assertEqual(self.run_("releve", now=NOW - timedelta(hours=1), heure=21).returncode, 0)
        shutil.rmtree(os.path.join(self.mem, "journal"))
        self.assertEqual(self.run_("releve", now=NOW - timedelta(hours=1, minutes=-25)).returncode, 0, "à la main, à 21 h 25")

    # ---------- proposition, gate, application ----------
    def test_proposal_is_checked_diffed_and_applied(self):
        self.fiche("ticket", "Ancienne leçon")
        prop = {"fiches": [{"nom": "ticket", "contenu": "# titre ignoré\n- [redaction] Garde les noms décidés\n- Garde les noms décidés\n- [redaction] Garde les noms décidés\n"
                                                         "texte libre ignoré\n- " + "x" * 600, "pourquoi": "le boss l'a corrigé deux fois"},
                           {"nom": "equipe", "contenu": "\n".join(f"- leçon {i}" for i in range(30)), "pourquoi": "trop long"},
                           {"nom": "inconnue", "contenu": "- rien", "pourquoi": "?"},
                           {"nom": "impl", "contenu": "", "pourquoi": "rien"}],
                "promotions": [{"lecon": "Les noms de commande se décident dans la discussion", "cible": "docs/glossary.md", "pourquoi": "revient"}],
                "resume": "La rédaction renomme ce qui est décidé."}
        r = self.run_("propose", stdin=json.dumps(prop))
        self.assertEqual(r.returncode, 0, r.stderr)
        gate = r.stdout
        self.assertTrue(gate.startswith("🧠 **Mémoire du soir** · 28 leçons à valider, 1 retirée : La rédaction renomme ce qui est décidé."), gate[:120])
        self.assertIn("**Fiche ticket** : le boss l'a corrigé deux fois", gate)
        self.assertIn("\n-- Ancienne leçon", gate)
        self.assertIn("\n+- [redaction] Garde les noms décidés", gate)
        self.assertIn("fiche « inconnue » ignorée (inconnue ou éteinte)", gate)
        self.assertIn("fiche equipe : 5 leçon(s) de trop retirée(s)", gate)
        self.assertIn("**À graver dans le dépôt**", gate)
        self.assertIn("- Les noms de commande se décident dans la discussion → docs/glossary.md (revient)", gate)
        p = json.loads(Path(self.mem, "proposition.json").read_text())
        self.assertEqual(sorted(p["fiches"]), ["equipe", "ticket"], "impl, vide et qui le reste : pas de fiche à créer")
        self.assertEqual((p["lecons"], p["retirees"]), (28, 1), "3 dans ticket, 25 dans equipe ; l'ancienne leçon retirée")
        lignes = p["fiches"]["ticket"].splitlines()
        self.assertEqual(lignes[0], "# Mémoire · ticket")
        self.assertEqual(lignes[2:4], ["- [redaction] Garde les noms décidés", "- Garde les noms décidés"], "doublon retiré, texte libre ignoré")
        self.assertEqual(len(lignes[4]), 400, "une leçon trop longue est coupée")
        a = self.run_("applique")
        self.assertEqual(a.returncode, 0, a.stderr)
        self.assertIn("Mémoire mise à jour : ticket (3 leçons), equipe (25 leçons).", a.stdout)
        self.assertIn("- Garde les noms décidés", Path(self.mem, "ticket.md").read_text())
        versions = os.listdir(os.path.join(self.mem, "versions"))
        self.assertEqual(len(versions), 1)
        self.assertEqual(os.listdir(os.path.join(self.mem, "versions", versions[0])), ["ticket.md"], "seule une fiche déjà là est gardée")
        self.assertFalse(os.path.exists(os.path.join(self.mem, "proposition.json")))
        self.assertIn("Aucune proposition", self.run_("applique").stdout)

    def test_a_sheet_can_be_emptied(self):
        self.fiche("correction", "Une leçon devenue fausse")
        r = self.run_("propose", stdin=json.dumps({"fiches": [{"nom": "correction", "contenu": "", "pourquoi": "contredite"}], "promotions": [], "resume": "x"}))
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("\n-- Une leçon devenue fausse", r.stdout)
        self.assertTrue(r.stdout.startswith("🧠 **Mémoire du soir** · 0 leçon à valider, 1 retirée : x"), r.stdout[:80])
        self.run_("applique")
        self.assertEqual(Path(self.mem, "correction.md").read_text().strip(), "# Mémoire · correction")

    def test_nothing_to_change_ends_the_run(self):
        self.fiche("revue", "[avis] Vérifie un test avant de le dire manquant")
        same = {"fiches": [{"nom": "revue", "contenu": "- [avis] Vérifie un test avant de le dire manquant", "pourquoi": "rien"}],
                "promotions": [], "resume": "rien"}
        for stdin in (json.dumps(same), json.dumps({"fiches": [], "promotions": [], "resume": "Rien à apprendre."}), "null", "pas du json"):
            r = self.run_("propose", stdin=stdin)
            self.assertEqual(r.returncode, 3, stdin)
        self.assertEqual(self.run_("propose", stdin=json.dumps({"fiches": [{"nom": "ticket", "contenu": "- x", "pourquoi": ""}]}),
                                   workflows=["revue"]).returncode, 3, "fiche d'un workflow éteint")

    # ---------- lecture par les postes ----------
    def lit(self, workflow, poste="", **memoire):
        code = ("import sys; sys.path.insert(0, %r); from _memoire import memoire_texte; print(memoire_texte(%r, %r or None))"
                % (os.path.join(ROOT, "workflows"), workflow, poste))
        env = {"PATH": "/usr/bin:/bin", "HOME": self.tmp, "BUREAU_CONFIG": self.cfg(**memoire)}
        return subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, env=env, timeout=30).stdout.strip()

    def test_each_poste_reads_the_common_sheet_and_its_own_lines(self):
        self.assertEqual(self.lit("impl", "code"), "", "aucune fiche : rien")
        self.fiche("equipe", "Écris en français", "[code] Pas de console.log")
        self.fiche("impl", "Lis docs/AGENTS.md d'abord", "[code] Un commit par lot", "[cadrage] Cite les fichiers lus")
        code = self.lit("impl", "code")
        self.assertIn("- Écris en français\n- [code] Pas de console.log\n- Lis docs/AGENTS.md d'abord\n- [code] Un commit par lot", code)
        self.assertNotIn("Cite les fichiers lus", code)
        self.assertIn("Cite les fichiers lus", self.lit("impl"), "sans poste (corriger) : toutes les leçons")
        self.assertNotIn("Pas de console.log", self.lit("impl", "cadrage"))
        self.assertEqual(self.lit("impl", "code", workflows=["ticket"]), "", "workflow éteint")
        self.assertEqual(self.lit("impl", "code", actif=False), "")
        self.fiche("impl", *[f"leçon {i} " + "x" * 300 for i in range(40)])
        long = self.lit("impl", "code")
        self.assertLess(len(long), 6400, "plafonné")
        self.assertTrue(long.splitlines()[-1].startswith("- leçon"), "coupé à une leçon entière")

    def test_ticket_postes_read_the_memory_instead_of_raw_corrections(self):
        env = lambda: {"PATH": "/usr/bin:/bin", "HOME": self.tmp, "BUREAU_CONFIG": self.cfg()}
        t = lambda *a: subprocess.run([sys.executable, os.path.join(ROOT, "workflows", "ticket.py"), *a], capture_output=True, text=True,
                                      cwd=self.tmp, env=env(), timeout=30)
        t("dossier", "g1", "Une intention", "Story", "3", "dm/site", "", "backlog", "")
        t("dossier", "g2", "Une autre", "Story", "3", "dm/site", "", "backlog", "")
        t("poste", "redaction", "g2", "ne renomme jamais une commande décidée")
        self.assertIn("## Corrections que le boss a déjà dû faire", t("poste", "redaction", "g1").stdout, "sans mémoire : comme avant")
        self.fiche("ticket", "[redaction] Garde les noms décidés", "[critique] Vérifie chaque critère")
        red = t("poste", "redaction", "g1").stdout
        self.assertIn("## Mémoire de l'équipe (leçons validées par le boss, à appliquer)\n", red)
        self.assertIn("- [redaction] Garde les noms décidés", red)
        self.assertNotIn("Vérifie chaque critère", red)
        self.assertNotIn("## Corrections que le boss", red, "la mémoire remplace les retours bruts")
        cri = t("poste", "critique", "g1").stdout
        self.assertIn("- [critique] Vérifie chaque critère", cri)
        self.assertIn("Guette ces erreurs", cri)

    def test_chain_and_fix_scripts_carry_the_memory(self):
        cfg = {**copy.deepcopy(FIXTURE), "memoire": {"workflows": ["impl"]}}
        for path in ("workflows/chaine.py", "workflows/review.py", "workflows/ticket.py", "workflows/pr_update.py"):
            code = templates.script_code(path, cfg)
            self.assertIn("def memoire_texte(", code, path)
            self.assertIn('"memoire": {"workflows": ["impl"]}', code, path + " : sa part de la config garde le réglage")
            self.assertNotIn("from _memoire", code, path)
            self.assertLess(len(code.encode()), templates.MAX_SCRIPT, path)

    # ---------- modèle ----------
    def test_template_runs_at_ten_pm_office_time_with_a_gate(self):
        tpl = templates.load_templates()["memoire"]
        d = templates.render(tpl, FIXTURE)
        self.assertEqual(d["trigger"], {"type": "Cron", "schedule": "0 20,21 * * 1-5", "timezone": "UTC"})
        self.assertEqual(assemble.local_hour_utc({"rhythm": {"timezone": "America/New_York"}}, 22), "2,3")
        self.assertEqual(templates.render(tpl, {**FIXTURE, "memoire": {"heure": 23}})["trigger"]["schedule"], "0 21,22 * * 1-5")
        self.assertEqual(d["guards"], {"timeout_seconds": 72 * 3600}, "la gate attend le matin, et le lundi après un vendredi soir")
        self.assertEqual(d["concurrency_limit"], 1, "une gate encore ouverte : le soir suivant ne relance pas")
        steps = {s["name"]: s for s in d["steps"]}
        self.assertEqual(list(steps), ["releve", "consolide", "propose", "boss", "applique", "propose_rejeu", "boss_rejeu", "applique_rejeu", "fin"])
        self.assertEqual([s["name"] for s in d["steps"] if s["step_type"]["type"] == "Agent"], ["consolide"], "un seul agent")
        self.assertIn("Tu tiens la mémoire de l'équipe", steps["consolide"]["prompt_template"])
        self.assertTrue(steps["consolide"]["prompt_template"].endswith("{{steps.releve.data.stdout}}"))
        self.assertEqual(steps["boss"]["gate_request_changes_target"], "consolide")
        self.assertEqual(steps["boss"]["gate_message"], "{{steps.propose.data.stdout}}")
        for s in ("releve", "propose_rejeu"):
            self.assertEqual(steps[s]["on_result"], [{"contains": "exit_3", "action": {"type": "Goto", "step_name": "fin"}}])
        self.assertEqual(steps["propose"]["on_result"], [{"contains": "exit_3", "action": {"type": "Goto", "step_name": "fin"}},
                                                         {"contains": "exit_4", "action": {"type": "Goto", "step_name": "propose_rejeu"}}],
                         "rien pour la gate boss mais des leçons du rejeu : directement à leur gate")
        # la seconde gate : même retour à l'agent ; Kronn arrête le run sur un Rejeter, d'où applique avant boss_rejeu
        self.assertEqual(steps["boss_rejeu"]["step_type"], {"type": "Gate"})
        self.assertEqual(steps["boss_rejeu"]["gate_request_changes_target"], "consolide")
        self.assertEqual(steps["boss_rejeu"]["gate_message"], "{{steps.propose_rejeu.data.stdout}}")
        names = list(steps)
        self.assertLess(names.index("applique"), names.index("boss_rejeu"), "la mémoire est écrite avant que la gate du rejeu ne s'ouvre")
        for s in ("releve", "propose", "propose_rejeu", "applique_rejeu"):
            self.assertEqual(steps[s]["exec_args"][-1], "{{run.id}}", s)
        self.assertIn("rejeu", steps["consolide"]["output_format"]["schema"]["properties"])
        self.assertNotIn("rejeu", steps["consolide"]["output_format"]["schema"]["required"], "facultatif : sans rejeu, l'agent ne le rend pas")
        self.assertIn("Rejeu de Palpatine", steps["consolide"]["prompt_template"])
        back = templates.templatize("memoire", "workflow", d, FIXTURE)["definition"]
        self.assertEqual(back["trigger"], tpl["definition"]["trigger"], "export : heures et fuseau redeviennent des emplacements")

    def test_installed_only_with_an_agent_workflow_that_reads_it(self):
        self.assertFalse(templates.skipped("memoire", FIXTURE))
        self.assertTrue(templates.skipped("memoire", {**FIXTURE, "memoire": {"actif": False}}))
        bare = {k: v for k, v in FIXTURE.items() if k not in ("models", "actions")}
        self.assertTrue(templates.skipped("memoire", bare))
        self.assertFalse(templates.skipped("memoire", {**bare, "actions": {"fix_pr": "x"}}))

    def test_fix_gate_message_is_kept_for_the_evening(self):
        tpl = templates.load_templates()["fix"]
        abort = next(s for s in tpl["definition"]["steps"] if s["name"] == "abort")
        self.assertEqual(abort["exec_stdin"], '{{state.last_human_feedback ?? ""}}')
        self.assertEqual(abort["exec_args"][2], "fix_abort", "le rebase garde abort, sans stdin")
        runs = Path(self.tmp, ".cache/pixel-bureau/pr/runs")
        runs.mkdir(parents=True)
        work = Path(self.tmp, "work")
        work.mkdir()
        subprocess.run(["git", "init", "-q", str(work)], check=True)
        (runs / "r9.json").write_text(json.dumps({"repo": "dm/site", "pr": 42, "work": str(work), "clone": str(work)}))
        r = self.run_("fix_abort", "dm/site", "42", "r9", stdin="Garde les réponses courtes", script="pr_update.py")
        self.assertEqual(r.returncode, 0, r.stderr)
        st = json.loads((runs / "r9.json").read_text())
        self.assertEqual(st["retour_humain"]["texte"], "Garde les réponses courtes")
        self.assertEqual((st["retour_humain"]["repo"], st["retour_humain"]["pr"]), ("dm/site", "42"))
        work.mkdir()
        (runs / "r8.json").write_text(json.dumps({"repo": "dm/site", "pr": 43, "work": str(work), "clone": str(work)}))
        self.run_("fix_abort", "dm/site", "43", "r8", stdin="", script="pr_update.py")
        self.assertNotIn("retour_humain", json.loads((runs / "r8.json").read_text()), "message vide : rien à garder")


    # ---------- le rejeu qui apprend (Palpatine) ----------
    def test_releve_reads_the_judge_without_the_witness_set(self):
        self.rejeu("DM-2041", "run1", [("le cache n'est pas vidé", "choix_agent", "Vide le cache touché par un changement de modèle", "code"),
                                       ("nom de test", "convention", "Range les tests à côté du code testé", "poste-inconnu"),
                                       ("le ticket ne disait rien du CSV", "ticket_vague", "Précise le format des exports attendus", ""),
                                       ("autre approche", "acceptable", "", ""),
                                       ("sans leçon", "choix_agent", "", "")])
        self.rejeu("DM-1000", "run2", [("x", "choix_agent", "Leçon du jeu témoin", "")], jeu="temoin")
        Path(self.rj, "demandes").mkdir(parents=True)
        Path(self.rj, "demandes", "DM-2041.json").write_text(json.dumps({"jeu": "rotation", "pr": 7}))
        r = self.run_("releve", "run-a")
        self.assertEqual(r.returncode, 0, r.stderr)
        out = r.stdout
        self.assertIn("Nouveaux retours : ticket 1, impl 0, revue 0, correction 0. Leçons du rejeu de Palpatine : 2.", out)
        neufs = out.split("## Retours nouveaux")[1].split("## Retours déjà vus")[0]
        self.assertIn("[ticket/redaction]", neufs)
        self.assertIn("⚡ DM-2041 · ticket_vague : Précise le format des exports attendus", neufs, "ticket_vague : proposition classique")
        self.assertNotIn("Vide le cache", neufs, "choix_agent : à part")
        section = out.split("## Leçons du rejeu de Palpatine")[1].split("## Fiches actuelles")[0]
        self.assertIn("- ⚡ DM-2041 · choix_agent [code] : Vide le cache touché par un changement de modèle", section)
        self.assertIn("- ⚡ DM-2041 · convention : Range les tests à côté du code testé", section, "un poste inconnu est oublié")
        self.assertNotIn("Leçon du jeu témoin", out, "le jeu témoin mesure, il n'apprend rien")
        self.assertNotIn("autre approche", out, "acceptable : jamais retenu")
        self.assertEqual(len(Path(self.mem, "journal", NOW.strftime("%Y-%m-%d") + ".jsonl").read_text().splitlines()), 3)
        self.assertEqual(len(json.loads(Path(self.mem, "rejeu.json").read_text())["lecons"]), 2)
        again = self.run_("releve", "run-b", now=NOW + timedelta(days=1))
        self.assertEqual(again.returncode, 3, "un écart n'entre qu'une fois au journal")
        self.assertEqual(self.run_("releve", "run-c", workflows=["ticket"], now=NOW + timedelta(days=1)).returncode, 3)

    def proposition(self, **extra):
        return json.dumps({"fiches": [{"nom": "ticket", "contenu": "- [redaction] Précise le format des exports", "pourquoi": "rejeu"}],
                           "promotions": [], "resume": "Les exports se précisent.", **extra})

    def test_two_gates_each_writes_only_what_was_validated(self):
        self.fiche("impl", "Lis docs/AGENTS.md d'abord")
        self.rejeu("DM-2041", "run1", [("cache", "choix_agent", "Vide le cache touché", "code"), ("tests", "convention", "Range les tests à côté", "")])
        self.assertEqual(self.run_("releve", "run-a").returncode, 0)
        rejeu = [{"lecon": "Vide tout cache que le changement touche", "poste": "code", "source": "⚡ DM-2041 · choix_agent"},
                 {"lecon": "Range les tests à côté du code", "poste": "", "source": "⚡ DM-2041 · convention + ⚡ DM-9 · x"},
                 {"lecon": "Inventée", "poste": "", "source": "⚡ DM-0 · choix_agent"},
                 {"lecon": "Lis docs/AGENTS.md d'abord", "source": "⚡ DM-2041 · convention"}]
        r = self.run_("propose", "run-a", stdin=self.proposition(rejeu=rejeu))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(r.stdout.startswith("🧠 **Mémoire du soir** · 1 leçon à valider : Les exports se précisent."), r.stdout[:90])
        self.assertIn("\n\n⚡ **Rejeu de Palpatine** · 2 leçons à valider ensuite", r.stdout, "le second parchemin, annoncé")
        self.assertIn("les leçons du rejeu reviennent au prochain soir", r.stdout)
        av = self.lecons()["a_valider"]
        self.assertEqual(av["run"], "run-a")
        self.assertEqual(av["lecons"], [
            {"ticket": "DM-2041", "cause": "choix_agent", "lecon": "Vide tout cache que le changement touche", "source": "⚡ DM-2041 · choix_agent", "poste": "code"},
            {"ticket": "DM-2041", "cause": "convention", "lecon": "Range les tests à côté du code", "source": "⚡ DM-2041 · convention"}],
            "source inconnue et leçon déjà dans la fiche impl retirées")
        self.assertEqual(self.lecons()["validees"], [])
        self.assertEqual(self.run_("applique").returncode, 0)
        self.assertIn("Précise le format", Path(self.mem, "ticket.md").read_text())
        g = self.run_("propose_rejeu", "run-a")
        self.assertEqual(g.returncode, 0, g.stderr)
        self.assertTrue(g.stdout.startswith("⚡ **Mémoire du soir · rejeu de Palpatine** · 2 leçons à valider : "), g.stdout[:90])
        self.assertIn("- [code] Vide tout cache que le changement touche · _⚡ DM-2041 · choix_agent_", g.stdout)
        self.assertIn("leçon du rejeu sans source connue ignorée : Inventée", g.stdout)
        a = self.run_("applique_rejeu", "run-a")
        self.assertEqual(a.returncode, 0, a.stderr)
        self.assertEqual(Path(self.mem, "impl.md").read_text(), "# Mémoire · impl\n\n- Lis docs/AGENTS.md d'abord\n"
                         "- [code] Vide tout cache que le changement touche\n- Range les tests à côté du code\n")
        lec = self.lecons()
        self.assertIsNone(lec["a_valider"])
        self.assertEqual([(x["ticket"], x["cause"], x["run"]) for x in lec["validees"]], [("DM-2041", "choix_agent", "run-a"), ("DM-2041", "convention", "run-a")])
        self.assertTrue(all(x["le"] for x in lec["validees"]))
        self.assertTrue(any(d.endswith("-rejeu") for d in os.listdir(os.path.join(self.mem, "versions"))), "la fiche d'avant gardée")
        self.assertIn("Aucune leçon du rejeu", self.run_("applique_rejeu", "run-a").stdout, "idempotent")

    def test_rejeu_only_goes_straight_to_its_gate_and_falls_back_on_the_judge(self):
        self.rejeu("DM-7", "run1", [("x", "convention", "Écris la doc du réglage ajouté", "doc")])
        self.run_("releve", "run-a")
        r = self.run_("propose", "run-a", stdin=json.dumps({"fiches": [], "promotions": [], "resume": "rien"}))
        self.assertEqual(r.returncode, 4, "rien pour la gate boss : directement à celle du rejeu")
        self.assertEqual(self.lecons()["a_valider"]["lecons"][0]["lecon"], "Écris la doc du réglage ajouté", "sans champ rejeu : la leçon du juge")
        self.assertEqual(self.lecons()["a_valider"]["lecons"][0]["poste"], "doc")
        self.assertEqual(self.run_("propose", "run-a", stdin="pas du json").returncode, 4, "agent illisible : la leçon du juge quand même")
        vide = self.run_("propose", "run-a", stdin=json.dumps({"fiches": [], "promotions": [], "resume": "rien", "rejeu": []}))
        self.assertEqual(vide.returncode, 3, "l'agent n'en retient aucune")
        self.assertIn("aucune retenue par l'agent", vide.stdout)
        self.assertIsNone(self.lecons()["a_valider"])
        self.assertEqual(self.run_("propose_rejeu", "run-a").returncode, 3, "gate sautée")

    def test_changes_at_the_rejeu_gate_do_not_bring_back_the_first_one(self):
        self.rejeu("DM-7", "run1", [("x", "choix_agent", "Lis le ticket lié", "cadrage")])
        self.run_("releve", "run-a")
        self.assertEqual(self.run_("propose", "run-a", stdin=self.proposition()).returncode, 0)
        self.run_("applique")
        self.assertEqual(self.run_("propose_rejeu", "run-a").returncode, 0)
        # Changements à boss_rejeu : retour à consolide, puis propose ; la mémoire est décidée, sa gate ne revient pas
        r = self.run_("propose", "run-a", stdin=self.proposition(rejeu=[{"lecon": "Lis chaque ticket lié", "poste": "cadrage", "source": "⚡ DM-7 · choix_agent"}]))
        self.assertEqual(r.returncode, 4, r.stdout)
        self.assertIn("déjà décidée", r.stdout)
        self.assertEqual(self.lecons()["a_valider"]["lecons"][0]["lecon"], "Lis chaque ticket lié")
        self.assertIn("- [cadrage] Lis chaque ticket lié", self.run_("propose_rejeu", "run-a").stdout)

    def test_lessons_of_a_run_stopped_before_their_gate_come_back(self):
        self.rejeu("DM-7", "run1", [("x", "choix_agent", "Lis le ticket lié", "")])
        self.run_("releve", "run-a")
        self.run_("propose", "run-a", stdin=self.proposition())
        self.assertIsNotNone(self.lecons()["a_valider"])
        # la gate boss rejetée : Kronn arrête le run, boss_rejeu ne s'ouvre jamais ; le soir suivant, elles reviennent
        nxt = self.run_("releve", "run-b", now=NOW + timedelta(days=1))
        self.assertEqual(nxt.returncode, 0, nxt.stdout)
        self.assertIn("- ⚡ DM-7 · choix_agent : Lis le ticket lié", nxt.stdout)
        self.assertIsNone(self.lecons()["a_valider"], "vidé au relevé")
        self.run_("propose", "run-b", stdin=json.dumps({"fiches": [], "promotions": [], "resume": "x"}))
        self.assertEqual(self.lecons()["a_valider"]["run"], "run-b")
        # cette fois leur gate s'ouvre, puis le boss la rejette : elles ne reviennent pas
        self.run_("propose_rejeu", "run-b")
        third = self.run_("releve", "run-c", now=NOW + timedelta(days=2))
        self.assertEqual(third.returncode, 3, third.stdout)
        self.assertIsNone(self.lecons()["a_valider"])

    def test_memoire_script_gets_the_rejeu_folder(self):
        code = templates.script_code("workflows/memoire.py", {**copy.deepcopy(FIXTURE), "rejeu": {"dossier": "/x/rejeu", "temoin": [1]}})
        self.assertIn('"rejeu": {"dossier": "/x/rejeu"', code)
        self.assertNotIn("{{", code)
        self.assertLess(len(code.encode()), templates.MAX_SCRIPT)


if __name__ == "__main__":
    unittest.main()
