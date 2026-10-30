"""Implémenter un ticket en chaîne de postes (#76, #125 ; python3 -m unittest tests/test_chaine.py) : les modèles impl_*
rendus (postes en sous-workflows, gates dans le parent, 20 étapes au plus, agents par poste), puis workflows/chaine.py
étape par étape dans un vrai dépôt git jetable : dossier du ticket, propositions et critiques (3 tours), questions,
plan seulement, lots du code et leurs essais, contrôles écartés ou obligatoires, aiguillage de l'orchestrateur ; un
bureau par dépôt (composants Jira), reprise après une panne, mode essai sans effet."""
import copy, json, os, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import templates  # noqa: E402

BASE = json.loads(Path(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json")).read_text())
TPL = templates.load_templates()
KEYS = [k for k in templates.TEMPLATES if k.startswith("impl")]
SEP = "\n===SEP===\n"
TICKET = {"key": "AB-12", "fields": {"summary": "Bouton partager sur la fiche", "description": "Ajouter un bouton partager.",
                                     "components": [{"name": "site"}], "issuetype": {"name": "Story"}}}


def cfg(**over):
    c = copy.deepcopy(BASE)
    c["jira"] = {**c["jira"], "config_id": "abcdefab-cdef-abcd-efab-cdefabcdefab"}
    c["github"] = {**c.get("github", {}), "repo": "dm/site"}
    c["models"] = {k: f"0000000{i % 10}-0000-4000-8000-0000000000{i:02d}" for i, k in enumerate(KEYS + ["assign"])}
    c["impl"] = {"repos": {"dm/site": {"base": "main", "checks": {"regles": [{"cmd": "echo verif {php}", "subdir": "app"}]}}},
                 "postes": {"revue": {"agent": "CopilotCli"}, "patterns": {"skills": ["maison-patterns"]}}, "skills": ["php"]}
    c.update(over)
    return c


def steps(key, c=None):
    return {s["name"]: s for s in templates.render(TPL[key], c or cfg())["steps"]}


class ChaineModelesTest(unittest.TestCase):
    def test_postes_are_subworkflows_and_gates_stay_in_the_parent(self):
        c = cfg()
        chain = templates.render(TPL["impl_chain"], c)
        self.assertLessEqual(len(chain["steps"]), 20)
        self.assertEqual((chain["concurrency_limit"], chain["project_scope"]), (4, {"type": "All"}))  # 4 chaînes, tout projet
        self.assertEqual(chain["workspace_config"], {"hooks": {}, "require_isolation": True})  # une copie par ticket
        subs = {s["name"]: s["sub_workflow_id"] for s in chain["steps"] if s["step_type"]["type"] == "SubWorkflow"}
        self.assertEqual(set(subs), {"cadrage", "schema", "patterns", "code", "controles", "livraison", "publication"})
        self.assertEqual(subs["code"], c["models"]["impl_code"])
        gates = [s["name"] for s in chain["steps"] if s["step_type"]["type"] == "Gate"]
        self.assertEqual(gates, ["gate_questions", "gate_plan", "gate_escalade", "gate_pr"])
        for key in KEYS:  # Kronn refuse un sous-workflow qui contient une gate
            if key != "impl_chain":
                self.assertNotIn("Gate", [s["step_type"]["type"] for s in TPL[key]["definition"]["steps"]], key)
        ctrl = steps("impl_controles", c)
        self.assertEqual([n for n, s in ctrl.items() if s["step_type"]["type"] == "SubWorkflow"],
                         ["regles", "securite", "tests", "perf", "revue"])
        self.assertEqual(ctrl["revue"]["on_result"][0]["action"]["step_name"], "bilan")  # poste en panne : on continue

    def test_human_feedback_reaches_the_postes(self):
        """Le commentaire d'une gate n'est injecté que dans le prompt d'une étape Agent : la chaîne le passe aux postes
        par leur variable retours, et chaque gate renvoie au bon poste."""
        st = steps("impl_chain")
        for n in ("cadrage", "schema", "patterns", "code"):
            self.assertEqual(st[n]["sub_workflow_variables"]["retours"], '{{state.last_human_feedback ?? ""}}', n)
        self.assertEqual({n: st[n]["gate_request_changes_target"] for n in ("gate_questions", "gate_plan", "gate_escalade", "gate_pr")},
                         {"gate_questions": "cadrage", "gate_plan": "schema", "gate_escalade": "code", "gate_pr": "code"})
        self.assertEqual(st["aiguillage"]["on_result"][0]["action"]["step_name"], "livraison")
        self.assertTrue(st["commente_plan"]["external_effect"])

    def test_each_poste_has_its_agent_tier_and_skills(self):
        c = cfg()
        self.assertEqual(steps("impl_cadrage", c)["propose"]["agent_settings"], {"tier": "economy"})
        code = steps("impl_code", c)["code_lot"]
        self.assertEqual((code["agent_settings"]["tier"], code["skill_ids"]), ("reasoning", ["verification-before-completion", "php"]))
        self.assertEqual(steps("impl_revue", c)["propose"]["agent"], "CopilotCli")  # une autre famille de modèle
        self.assertIn("maison-patterns", steps("impl_patterns", c)["propose"]["skill_ids"])
        self.assertEqual(steps("impl_securite", c)["propose"]["skill_ids"], ["security"])
        for key in KEYS:
            for s in templates.render(TPL[key], c)["steps"]:
                self.assertNotIn("_poste", s, key)

    def test_proposals_loop_three_times_at_most(self):
        for key in ("impl_cadrage", "impl_schema", "impl_patterns", "impl_regles", "impl_securite", "impl_perf", "impl_revue"):
            tri = steps(key)["tri"]
            self.assertEqual(tri["on_result"], [{"contains": "exit_3", "action": {"type": "Goto", "step_name": "propose", "max_iterations": 5}}], key)
            # essai du 2026-10-30 : un critique qui rend une analyse sans JSON faisait échouer le poste ; sa proposition est gardée
            self.assertEqual(steps(key)["critique"]["output_format"]["on_invalid"], "Continue", key)
            self.assertEqual(steps(key)["propose"]["output_format"]["on_invalid"], "Continue", key)

    def test_the_floor_stops_at_the_pr_and_its_reviews(self):
        """L'étage ne déploie rien : la PR, sa revue par le modèle du Bureau, les retours traités ; ni CI ni env de branche."""
        liv = steps("impl_livraison")
        self.assertEqual(list(liv), ["entree", "redige", "pousse", "pr", "revue", "retours", "fin"])
        self.assertEqual(liv["revue"]["sub_workflow_id"], cfg()["models"]["impl_revue_pr"])
        rv = steps("impl_revue_pr", cfg(models={**cfg()["models"], "review_child": "abababab-0000-4000-8000-000000000009"}))
        self.assertEqual((rv["revue"]["sub_workflow_id"], rv["revue"]["sub_workflow_foreach_file"]),
                         ("abababab-0000-4000-8000-000000000009", ".kronn/prs.json"))
        self.assertNotIn("revue", steps("impl_revue_pr"))  # sans modèle de revue installé : pas de revue
        self.assertEqual(list(steps("impl_retours")), ["entree", "corrige", "pousse", "reponds", "fin"])
        text = json.dumps([TPL[k] for k in KEYS], ensure_ascii=False)
        self.assertNotIn('"ci"', text)
        self.assertNotIn("env de branche (réglage", text)

    def test_resume_jumps_and_skips(self):
        """Reprise : prepare saute au Code (3), aux contrôles (4) ou à la PR (5) ; un poste d'analyse déjà fait saute à son
        rapport (5) ; le Code en mode essai saute l'étape affecter (5) ; la PR déjà relue saute à la fin (5)."""
        st = steps("impl_chain")
        self.assertEqual({r["contains"]: r["action"]["step_name"] for r in st["prepare"]["on_result"]},
                         {"exit_3": "code", "exit_4": "controles", "exit_5": "livraison"})
        self.assertEqual(st["prepare"]["exec_args"][-3:], ['{{depot ?? ""}}', '{{soeurs ?? ""}}', '{{reprise ?? "non"}}'])
        self.assertEqual(st["commente_plan"]["api_body"]["body"], '{{partie ?? ""}}{{steps.orchestrateur_plan.data.commentaire_jira}}')
        for key in ("impl_cadrage", "impl_schema", "impl_patterns"):
            self.assertEqual(steps(key)["entree"]["on_result"], [{"contains": "exit_5", "action": {"type": "Goto", "step_name": "rapport"}}])
        self.assertEqual(steps("impl_code")["entree"]["on_result"], [{"contains": "exit_5", "action": {"type": "Goto", "step_name": "plan"}}])
        self.assertEqual(steps("impl_livraison")["entree"]["on_result"], [{"contains": "exit_5", "action": {"type": "Goto", "step_name": "fin"}}])
        lance = steps("impl")["lance"]
        self.assertEqual(lance["exec_args"][-1], '{{reprise ?? "auto"}}')
        names = {v["name"] for v in templates.render(TPL["impl_chain"], cfg())["variables"]}
        self.assertTrue({"depot", "soeurs", "partie", "reprise"} <= names)

    def test_assign_step_needs_the_model(self):
        self.assertIn("affecter", steps("impl_code"))
        c = cfg()
        c["models"].pop("assign")
        self.assertNotIn("affecter", steps("impl_code", c))


class ChaineScriptTest(unittest.TestCase):
    """workflows/chaine.py rendu (config injectée), lancé dans une copie de travail jetable dont origin est un dépôt nu."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        origin, self.wt = os.path.join(self.tmp, "origin.git"), os.path.join(self.tmp, "wt")
        run = lambda *a, cwd=None: subprocess.run(a, cwd=cwd, check=True, capture_output=True)  # noqa: E731
        run("git", "init", "-q", "--bare", "-b", "main", origin)
        run("git", "clone", "-q", origin, self.wt)
        os.makedirs(os.path.join(self.wt, "app"))
        Path(self.wt, "app", "A.php").write_text("<?php\n")
        Path(self.wt, "docs").mkdir()
        Path(self.wt, "docs", "AGENTS.md").write_text("# règles\n")
        Path(self.wt, ".gitignore").write_text(".kronn/\n")
        g = ["git", "-c", "user.email=t@t", "-c", "user.name=t"]
        run(*g, "add", "-A", cwd=self.wt)
        run(*g, "commit", "-qm", "init", cwd=self.wt)
        run("git", "push", "-q", "origin", "main", cwd=self.wt)
        # origin a une adresse GitHub (le dépôt se lit dedans) réécrite vers le dépôt nu jetable
        run("git", "remote", "set-url", "origin", "https://github.com/dm/site.git", cwd=self.wt)
        run("git", "config", f"url.{origin}.insteadOf", "https://github.com/dm/site.git", cwd=self.wt)
        self.origin = origin
        self.code = templates.script_code("workflows/chaine.py", cfg())

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def sh(self, *args, stdin=""):
        env = {**os.environ, "KRONN_WORKTREE": self.wt, "HOME": os.path.join(self.tmp, "home")}  # cache du dossier : jetable
        r = subprocess.run(["python3", "-c", self.code, *args], input=stdin, capture_output=True, text=True, cwd=self.wt, env=env)
        return r.returncode, r.stdout + r.stderr

    def dossier(self, name):
        return json.loads(Path(self.wt, ".kronn", "chaine", name).read_text())

    def prepare(self):
        code, outp = self.sh("prepare", "AB-12", "plan", "run1", stdin=json.dumps(TICKET))
        self.assertEqual(code, 0, outp)
        self.assertEqual(self.dossier("etat.json")["repo"], "dm/site")

    def test_prepare_then_cadrage_with_human_feedback(self):
        self.prepare()
        self.assertEqual(subprocess.run(["git", "branch", "--show-current"], cwd=self.wt, capture_output=True, text=True).stdout.strip(),
                         "kronn/AB-12")
        code, ctx = self.sh("entree", "cadrage", "AB-12", "Garde le style actuel")
        self.assertEqual(code, 0, ctx)
        self.assertIn("Bouton partager", ctx)
        self.assertIn("Garde le style actuel", ctx)
        self.assertIn("docs/AGENTS.md", ctx)
        self.sh("entree", "schema", "AB-12", "Garde le style actuel")  # le même retour n'est noté qu'une fois
        self.assertEqual(Path(self.wt, ".kronn", "chaine", "retours.md").read_text().count("Garde le style actuel"), 1)
        self.sh("entree", "schema", "AB-12", "{{state.last_human_feedback}}")  # référence restée telle quelle : ignorée
        self.assertNotIn("state.last", Path(self.wt, ".kronn", "chaine", "retours.md").read_text())

    def test_critique_review_and_questions(self):
        self.prepare()
        revoir = json.dumps({"verdict": "revoir", "remarques": ["x"]})
        self.assertEqual([self.sh("tri", "cadrage", stdin=revoir)[0] for _ in range(3)], [3, 3, 0])  # 3 propositions, puis gardée
        self.sh("entree", "cadrage", "AB-12")  # nouveau passage du poste : compteur à zéro
        self.assertEqual(self.sh("tri", "cadrage", stdin=revoir)[0], 3)
        self.assertEqual(self.sh("tri", "cadrage", stdin=json.dumps({"verdict": "revoir", "remarques": []}))[0], 0)  # sans remarque
        self.assertEqual(self.sh("tri", "cadrage", stdin=json.dumps({"verdict": "ok", "remarques": []}))[0], 0)
        prop = {"resume": "r", "comprehension": "c", "criteres_acceptation": ["a"],
                "questions": [{"question": "Quels réseaux ?", "bloquante": True, "hypothese": "X et Bluesky"}]}
        self.sh("rapport", "cadrage", stdin=json.dumps(prop) + SEP + json.dumps({"verdict": "ok"}))
        code, q = self.sh("questions")
        self.assertEqual(code, 3)
        self.assertIn("Quels réseaux ?", q)
        prop["questions"][0]["bloquante"] = False
        self.sh("rapport", "cadrage", stdin=json.dumps(prop) + SEP + "null")
        self.assertEqual(self.sh("questions")[0], 0)  # plus de question bloquante : pas de gate

    def test_plan_only_mode_stops(self):
        self.assertEqual(self.sh("mode", "plan")[0], 0)
        self.assertEqual(self.sh("mode", "complet")[0], 3)
        st = steps("impl_chain")  # plan seulement : le commentaire Jira, puis Stop ; complet et essai sautent au code
        self.assertEqual(st["mode"]["on_result"], [{"contains": "exit_3", "action": {"type": "Goto", "step_name": "code"}}])
        self.assertEqual(st["commente_plan"]["on_result"], [{"contains": "OK", "action": {"type": "Stop"}}])

    def test_dossier_is_kept_after_the_run(self):
        """Kronn supprime la copie de travail d'un run réussi : fin et plan seulement gardent le dossier dans ~/.cache."""
        self.prepare()
        home = os.path.join(self.tmp, "home")
        env = {**os.environ, "KRONN_WORKTREE": self.wt, "HOME": home}
        r = subprocess.run(["python3", "-c", self.code, "fin"], capture_output=True, text=True, cwd=self.wt, env=env)
        dest = json.loads(r.stdout)["dossier"]
        self.assertTrue(dest.startswith(home), dest)
        self.assertTrue(os.path.exists(os.path.join(dest, "ticket.md")))

    def test_essai_mode_sends_nothing(self):
        """Mode essai : la chaîne entière sans effet externe (le shadow de Kronn ne rejoue pas un workflow à variables)."""
        self.prepare()
        e = self.dossier("etat.json")
        e["mode"] = "essai"
        Path(self.wt, ".kronn", "chaine", "etat.json").write_text(json.dumps(e))
        self.assertEqual(self.sh("mode", "essai")[0], 3)
        for cmd in ("pousse", "pret"):
            code, outp = self.sh(cmd)
            self.assertEqual(code, 0, outp)
            self.assertIn("Mode essai", outp)
        self.assertEqual(self.sh("revue_prep")[0], 3)  # ni revue de la PR ni retours : pas de PR en mode essai
        self.assertEqual(self.sh("retours_lire")[0], 3)
        self.assertIn("Mode essai", self.sh("reponds", stdin=json.dumps({"replies": [{"commentId": 1, "body": "✅"}]}))[1])
        code, outp = self.sh("pr", stdin=json.dumps({"title": "fix: AB-12 x", "body": "corps"}))
        self.assertIn("Mode essai", outp)
        self.assertIn("corps", Path(self.wt, ".kronn", "chaine", "pr_body.md").read_text())
        self.assertEqual(self.sh("reviewers")[0], 5)  # code 5 : l'étape Jira suivante est sautée
        self.assertEqual(steps("impl_publication")["reviewers"]["on_result"], [{"contains": "exit_5", "action": {"type": "Skip"}}])
        self.assertEqual(subprocess.run(["git", "ls-remote", "--heads", self.origin, "kronn/AB-12"], capture_output=True, text=True).stdout, "")

    def test_essai_skips_the_assign_step(self):
        """Mode essai : rien dans Jira, l'étape affecter du poste Code est sautée (code 5, Goto plan)."""
        self.prepare()
        self.assertEqual(self.sh("entree", "code", "AB-12")[0], 0)
        e = self.dossier("etat.json")
        e["mode"] = "essai"
        Path(self.wt, ".kronn", "chaine", "etat.json").write_text(json.dumps(e))
        code, ctx = self.sh("entree", "code", "AB-12")
        self.assertEqual(code, 5)
        self.assertIn("Bouton partager", ctx)  # le contexte reste la sortie de l'étape, lue par code_lot

    def test_one_bureau_per_repo_knows_its_scope_and_sisters(self):
        """Méthode A : le bureau ne traite que son dépôt, sait quels dépôts ont leur bureau ; la PR liste ses sœurs."""
        code, outp = self.sh("prepare", "AB-12", "essai", "run1", "", "", "dm/api,dm/app", "non", stdin=json.dumps(TICKET))
        self.assertEqual(code, 0, outp)
        self.assertIn("dépôts sœurs : dm/api, dm/app", outp)
        self.assertEqual(self.dossier("etat.json")["soeurs"], ["dm/api", "dm/app"])
        code, ctx = self.sh("entree", "cadrage", "AB-12")
        self.assertIn("Périmètre de ce bureau", ctx)
        self.assertIn("dm/api, dm/app : chacun a son propre bureau", ctx)
        self.assertIn("Périmètre de ce bureau", self.sh("dossier")[1])  # l'orchestrateur aussi
        self.sh("pr", stdin=json.dumps({"title": "feat: AB-12", "body": "corps\n\n<!-- bureau-soeurs -->vieux<!-- /bureau-soeurs -->"}))
        body = Path(self.wt, ".kronn", "chaine", "pr_body.md").read_text()
        self.assertIn("### PR sœurs", body)
        self.assertIn("- dm/api : pas encore ouverte (branche `kronn/AB-12`)", body)
        self.assertNotIn("vieux", body)
        self.assertEqual(body.count("<!-- bureau-soeurs -->"), 1)
        code, outp = self.sh("prepare", "AB-12", "plan", "run2", "", "dm/autre", "", "", stdin=json.dumps(TICKET))
        self.assertNotEqual(code, 0)  # copie de travail d'un autre dépôt que celui du bureau
        self.assertIn("pas de dm/autre", outp)

    def test_resume_after_a_failure(self):
        """Une panne aux contrôles : le dossier est dans le cache après chaque étape ; le run suivant, en reprise, repart
        de la branche et du dossier, saute au poste Contrôles et ne refait que les contrôles qui manquent."""
        self.prepare()
        self.sh("rapport", "cadrage", stdin=json.dumps({"resume": "r", "questions": []}) + SEP + "null")
        self.assertEqual(self.sh("mode", "complet")[0], 3)
        self.sh("plan", "", "", stdin=json.dumps({"lots": [{"titre": "L1"}, {"titre": "L2"}], "postes": ["regles"]}))
        self.sh("lot")
        self.sh("tri_lot", stdin=json.dumps({"ok": True}) + SEP + json.dumps({"verdict": "ok"}))
        Path(self.wt, "app", "A.php").write_text("<?php // lot 1\n")
        g = ["git", "-c", "user.email=t@t", "-c", "user.name=t"]
        subprocess.run(g + ["commit", "-qam", "lot 1"], cwd=self.wt, check=True)
        cache = Path(self.tmp, "home", ".cache", "pixel-bureau", "chaine", "AB-12", "dm__site", "courant")
        self.assertEqual(json.loads((cache / "etat.json").read_text())["etape"], "code")  # recopié après chaque étape
        # panne au Code (lot 2) : nouveau run, nouvelle copie de travail (sur main), dossier vide
        subprocess.run(["git", "checkout", "-q", "-f", "main"], cwd=self.wt, check=True)
        import shutil
        shutil.rmtree(os.path.join(self.wt, ".kronn"))
        code, outp = self.sh("prepare", "AB-12", "complet", "run2", "", "", "", "oui", stdin=json.dumps(TICKET))
        self.assertEqual(code, 3, outp)  # droit au poste Code
        self.assertIn("reprise au poste Code", outp)
        self.assertEqual(subprocess.run(["git", "log", "-1", "--format=%s"], cwd=self.wt, capture_output=True, text=True).stdout.strip(), "lot 1")
        self.assertEqual(self.sh("plan", "", "", stdin="")[0], 0)  # plan du run d'avant gardé, lot 1 déjà écrit
        self.assertIn('"titre": "L2"', self.sh("lot")[1])
        self.sh("tri_lot", stdin=json.dumps({"ok": True}) + SEP + json.dumps({"verdict": "ok"}))
        self.sh("bilan_code")
        self.sh("entree", "regles", "AB-12")
        self.sh("rapport", "regles", stdin=json.dumps({"resume": "ok", "constats": []}) + SEP + "null")
        # panne à la sécurité : la reprise saute aux contrôles, règles déjà faites, sécurité à faire
        shutil.rmtree(os.path.join(self.wt, ".kronn"))
        code, outp = self.sh("prepare", "AB-12", "complet", "run3", "", "", "", "oui", stdin=json.dumps(TICKET))
        self.assertEqual(code, 4, outp)
        self.assertIn("déjà fait", self.sh("entree", "regles", "AB-12")[1])
        self.assertEqual(self.sh("entree", "regles", "AB-12")[0], 3)
        self.assertEqual(self.sh("entree", "securite", "AB-12")[0], 0)
        self.assertEqual(self.sh("entree", "cadrage", "AB-12")[0], 5)  # poste d'analyse déjà fait : droit au rapport
        self.assertEqual(self.sh("entree", "cadrage", "AB-12", "Refais le cadrage")[0], 0)  # sauf avec un retour de l'humain
        # un retour au Code demandé par l'orchestrateur, puis une panne : la reprise rend ses consignes au Code
        self.sh("aiguillage", stdin=json.dumps({"decision": "retour_code", "consignes": "Échapper le titre", "resume": "r"}))
        shutil.rmtree(os.path.join(self.wt, ".kronn"))
        code, outp = self.sh("prepare", "AB-12", "complet", "run4", "", "", "", "oui", stdin=json.dumps(TICKET))
        self.assertEqual(code, 3, outp)
        self.assertIn("Échapper le titre", self.sh("entree", "code", "AB-12", "", "")[1])
        self.assertEqual(self.sh("plan", "", "", stdin="")[0], 3)  # mode correction
        self.sh("bilan_code")
        self.assertEqual(self.dossier("etat.json")["consignes_reprise"], "")
        # un nouveau départ (reprise non) efface le dossier gardé
        self.sh("prepare", "AB-12", "complet", "run5", "", "", "", "non", stdin=json.dumps(TICKET))
        self.assertEqual(json.loads((cache / "etat.json").read_text())["run"], "run5")

    def test_nothing_to_resume_starts_over(self):
        code, outp = self.sh("prepare", "AB-12", "plan", "run1", "", "", "", "oui", stdin=json.dumps(TICKET))
        self.assertEqual(code, 0, outp)
        self.assertIn("Rien à reprendre", outp)
        self.assertEqual(self.dossier("etat.json")["etape"], "cadrage")

    def test_lots_retry_three_times_then_move_on(self):
        self.prepare()
        plan = {"lots": [{"titre": "L1", "objectif": "o", "fichiers": ["app/A.php"]}, {"titre": "L2", "objectif": "o", "fichiers": []}],
                "postes": ["regles"]}
        self.assertEqual(self.sh("plan", "", "", stdin=json.dumps(plan))[0], 0)
        self.assertEqual(self.sh("plan", "corrige X", "", stdin=json.dumps(plan))[0], 3)  # consignes : mode correction
        self.assertEqual(self.sh("plan", "{{steps.orchestrateur.data.consignes}}", "", stdin=json.dumps(plan))[0], 0)
        self.assertEqual(self.sh("plan", "", "Approuvé, vas-y", stdin=json.dumps(plan))[0], 0)  # commentaire d'une approbation
        Path(self.wt, ".kronn", "chaine", "code.json").write_text("{}")  # le Code est déjà passé : un retour = correction
        self.assertEqual(self.sh("plan", "", "Renomme la méthode", stdin=json.dumps(plan))[0], 3)
        os.remove(os.path.join(self.wt, ".kronn", "chaine", "code.json"))
        self.sh("plan", "", "", stdin=json.dumps(plan))
        self.assertIn('"titre": "L1"', self.sh("lot")[1])
        red = json.dumps({"ok": False}) + SEP + json.dumps({"verdict": "ok"})
        self.assertEqual(self.sh("tri_lot", stdin=red)[0], 4)
        self.assertEqual(self.sh("tri_lot", stdin=red)[0], 4)
        self.assertEqual(self.sh("tri_lot", stdin=red)[0], 0)  # 3e essai : on passe, les contrôles trancheront
        self.assertIn('"titre": "L2"', self.sh("lot")[1])
        self.assertEqual(self.sh("tri_lot", stdin=json.dumps({"ok": True}) + SEP + json.dumps({"verdict": "revoir"}))[0], 4)
        self.assertEqual(self.sh("tri_lot", stdin=json.dumps({"ok": True}) + SEP + json.dumps({"verdict": "ok"}))[0], 0)
        self.assertEqual(self.sh("lot")[0], 3)

    def test_checks_run_on_changed_files_relative_to_subdir(self):
        self.prepare()
        Path(self.wt, "app", "A.php").write_text("<?php // x\n")
        code, outp = self.sh("verif", "regles")
        res = json.loads(outp)
        self.assertTrue(res["ok"], outp)
        self.assertIn("verif A.php", res["sorties"][0]["sortie"])
        self.assertIn("aucune vérification", json.loads(self.sh("verif", "tests")[1])["note"])

    def test_controls_dispatch_and_orchestrator_rounds(self):
        self.prepare()
        Path(self.wt, "app", "A.php").write_text("<?php // x\n")
        self.sh("plan", "", "", stdin=json.dumps({"lots": [], "postes": ["regles"]}))
        q = json.loads(self.sh("quoi")[1])["postes"]
        self.assertFalse(q["revue"]["actif"])  # écarté par le plan
        self.assertTrue(q["securite"]["actif"])  # bloquant : jamais écarté par le plan
        self.assertFalse(q["perf"]["actif"])  # aucun fichier front
        self.assertEqual(self.sh("entree", "perf", "AB-12")[0], 3)
        self.sh("rapport", "securite", stdin=json.dumps({"resume": "s", "constats": [{"gravite": "bloquant", "probleme": "XSS"}]}) + SEP + "null")
        self.sh("rapport", "revue", stdin=json.dumps({"resume": "s", "constats": [{"gravite": "bloquant", "probleme": "nom"}]}) + SEP + "null")
        b = json.loads(self.sh("bilan_controles")[1])
        self.assertEqual([x["poste"] for x in b["bloquants"]], ["securite"])  # revue : un avis, pas un poste bloquant
        back = json.dumps({"decision": "retour_code", "consignes": "XSS", "resume": "r"})
        self.assertEqual([self.sh("aiguillage", stdin=back)[0] for _ in range(3)], [4, 4, 0])  # 3e tour : un humain
        self.assertEqual(self.sh("aiguillage", stdin=json.dumps({"decision": "livrer"}))[0], 3)


if __name__ == "__main__":
    unittest.main()


class LanceurTest(unittest.TestCase):
    """Le lanceur (méthode A) : un dépôt par composant Jira, une chaîne par dépôt, un passage par ticket et par dépôt,
    reprise auto après un échec ; un composant sans projet Kronn est signalé."""

    def setUp(self):
        sys.path.insert(0, os.path.join(ROOT, "workflows"))
        import chaine
        self.c = chaine
        self.old = (chaine.get, chaine.send, chaine.project_for, dict(chaine.CFG))
        chaine.CFG.clear()
        chaine.CFG.update(cfg(impl={"components": {"API": "dm/api"}, "repos": {"dm/site": {}}}))
        self.sent, self.runs = [], []
        chaine.send = lambda m, p, body=None, timeout=30: self.sent.append(body) or {"run_id": f"run{len(self.sent)}"}
        chaine.project_for = lambda r: {"dm/site": "p1", "dm/api": "p2"}.get(r)

        def get(path):
            if path.endswith("runs?limit=50"):
                return [{k: v for k, v in r.items() if k != "prep"} for r in self.runs]
            r = next(x for x in self.runs if path.endswith(x["id"]))
            return {"step_results": [{"step_name": "prepare", "output": r["prep"]}] if r["prep"] else []}
        chaine.get = get

    def tearDown(self):
        self.c.get, self.c.send, self.c.project_for = self.old[:3]
        self.c.CFG.clear()
        self.c.CFG.update(self.old[3])

    def lance(self, comps, depot="", reprise="auto"):
        import io
        from contextlib import redirect_stdout
        t = {"key": "AB-12", "fields": {"components": [{"name": c} for c in comps]}}
        sys.stdin, buf, code = io.StringIO(json.dumps(t)), io.StringIO(), 0
        try:
            with redirect_stdout(buf):
                self.c.cmd_lance("AB-12", "complet", depot, reprise)
        except SystemExit as e:
            code = e.code
        finally:
            sys.stdin = sys.__stdin__
        return code, buf.getvalue()

    def test_repos_from_components(self):
        t = lambda *cs: {"fields": {"components": [{"name": c} for c in cs]}}  # noqa: E731
        self.assertEqual(self.c.repos_for(t("site", "API", "site"), ""), ["dm/site", "dm/api"])  # réglé, mappé, sans doublon
        self.assertEqual(self.c.repos_for(t("app"), ""), ["dm/app"])  # owner du dépôt principal
        self.assertEqual(self.c.repos_for(t("site", "API"), "dm/x"), ["dm/x"])  # le champ dépôt force un seul bureau
        self.assertEqual(self.c.repos_for(t("site", "API"), "API"), ["dm/api"])

    def test_one_chain_per_repo_with_its_sisters(self):
        code, outp = self.lance(["site", "API", "app"])
        self.assertEqual(code, 0, outp)
        self.assertEqual([(b["project_id"], b["variables"]["depot"], b["variables"]["soeurs"]) for b in self.sent],
                         [("p1", "dm/site", "dm/api,dm/app"), ("p2", "dm/api", "dm/site,dm/app")])
        self.assertEqual(self.sent[1]["variables"]["partie"], "h3. Partie dm/api (2 sur 2)\n\n")
        self.assertIn("dm/app : aucun projet Kronn", outp)  # signalé, pas ignoré en silence
        self.sent.clear()
        self.lance(["site"])
        self.assertEqual((self.sent[0]["variables"]["soeurs"], self.sent[0]["variables"]["partie"]), ("", ""))

    def test_guard_is_per_ticket_and_repo_and_resumes_after_a_failure(self):
        self.runs = [{"id": "a", "status": "Running", "started_at": "2", "prep": "AB-12 sur dm/site : branche kronn/AB-12"},
                     {"id": "b", "status": "Failed", "started_at": "1", "prep": "AB-12 sur dm/api : branche kronn/AB-12"}]
        code, outp = self.lance(["site", "API"])
        self.assertIn("dm/site : déjà sur la chaîne", outp)
        self.assertEqual([(b["variables"]["depot"], b["variables"]["reprise"]) for b in self.sent], [("dm/api", "oui")])
        self.sent.clear()
        self.lance(["API"], reprise="non")
        self.assertEqual(self.sent[0]["variables"]["reprise"], "non")
        self.runs[0]["prep"] = ""  # un run pas encore préparé : on ne sait pas quel ticket il porte
        self.sent.clear()
        self.assertNotEqual(self.lance(["API"])[0], 0)
        self.assertEqual(self.sent, [])


class AtelierSnapshotTest(unittest.TestCase):
    """workflows/atelier_snapshot.py : un bureau par run actif de la chaîne, états des postes lus dans les étapes du parent,
    des contrôles (statut du rapport) et du poste PR ; la file = les runs en attente."""

    def test_rooms_and_queue_from_the_chain_runs(self):
        sys.path.insert(0, os.path.join(ROOT, "workflows"))
        import atelier_snapshot as a
        env = lambda d: "x\n---STEP_OUTPUT---\n" + json.dumps({"data": d}) + "\n---END_STEP_OUTPUT---"  # noqa: E731
        parent = {"id": "r1", "workflow_id": "c", "status": "Running", "tokens_used": 5000, "started_at": "2026-10-01T09:00:00Z", "step_results": [
            {"step_name": "ticket", "status": "Success", "output": env({"fields": {"summary": "Bouton partager"}})},
            {"step_name": "prepare", "status": "Success", "output": "AB-12 sur dm/site : branche kronn/AB-12"},
            {"step_name": "cadrage", "status": "Success"}, {"step_name": "gate_plan", "status": "Success"},
            {"step_name": "code", "status": "Success"}, {"step_name": "controles", "status": "Success"},
            {"step_name": "aiguillage", "status": "Success", "output": "Tour 2 sur 3 : retour au poste Code"},
            {"step_name": "code", "status": "Running"}]}
        ctrl = {"id": "k", "parent_run_id": "r1", "step_results": [{"step_name": "regles", "status": "Success", "output": '"statut": "ok"'},
                                                                   {"step_name": "securite", "status": "Success", "output": '\\"statut\\": \\"a_corriger\\"'},
                                                                   {"step_name": "perf", "status": "Success", "output": '"statut": "non_concerne"'}]}
        api = {"/workflows/c/runs?limit=40": [{"id": "r1", "status": "Running"}, {"id": "r2", "status": "Pending", "started_at": "t"},
                                               {"id": "r3", "status": "Success"}],
               "/workflows/c/runs/r1": parent, "/workflows/k/runs?limit=60": [ctrl], "/workflows/k/runs/k": ctrl,
               "/workflows/code/runs?limit=60": []}
        old = (a.get, dict(a.CFG))
        a.get = lambda p: api.get(p)
        a.CFG.update(models={"impl_chain": "c", "impl_controles": "k", "impl_code": "code"}, impl={"max_tours": 3})
        try:
            snap = a.snapshot("now")
        finally:
            a.get = old[0]
            a.CFG.clear()
            a.CFG.update(old[1])
        self.assertEqual(snap["queue"], [{"run": "r2", "since": "t"}])
        r = snap["rooms"][0]
        self.assertEqual((r["ticket"], r["repo"], r["title"], r["tour"], r["poste"]), ("AB-12", "dm/site", "Bouton partager", "2/3", "code"))
        self.assertEqual({k: r["states"][k] for k in ("gate", "regles", "securite", "perf", "code")},
                         {"gate": "ok", "regles": "ok", "securite": "bloq", "perf": "skip", "code": "run"})
        self.assertTrue(r["back"])
        self.assertEqual(r["note"], "🔒 bloquant → retour au code")
