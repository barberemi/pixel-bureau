"""Implémenter un ticket en chaîne de postes (#76, #125 ; python3 -m unittest tests/test_chaine.py) : les modèles impl_*
rendus (postes en sous-workflows, gates dans le parent, 20 étapes au plus, agents par poste), puis workflows/chaine.py
étape par étape dans un vrai dépôt git jetable : dossier du ticket, propositions et critiques (3 tours), questions,
plan seulement, lots du code et leurs essais, contrôles écartés ou obligatoires, aiguillage de l'orchestrateur."""
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
        run("git", "remote", "set-url", "origin", origin, cwd=self.wt)
        self.origin = origin
        self.code = templates.script_code("workflows/chaine.py", cfg())

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def sh(self, *args, stdin=""):
        env = {**os.environ, "KRONN_WORKTREE": self.wt}
        r = subprocess.run(["python3", "-c", self.code, *args], input=stdin, capture_output=True, text=True, cwd=self.wt, env=env)
        return r.returncode, r.stdout + r.stderr

    def dossier(self, name):
        return json.loads(Path(self.wt, ".kronn", "chaine", name).read_text())

    def prepare(self):
        # dépôt de test : origin est un chemin, pas GitHub ; on lui donne le nom du dépôt réglé
        subprocess.run(["git", "remote", "set-url", "origin", self.origin], cwd=self.wt, check=True)
        code, outp = self.sh("prepare", "AB-12", "plan", "run1", stdin=json.dumps(TICKET))
        self.assertEqual(code, 0, outp)
        e = self.dossier("etat.json")
        e["repo"] = "dm/site"
        Path(self.wt, ".kronn", "chaine", "etat.json").write_text(json.dumps(e))

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

    def test_lots_retry_three_times_then_move_on(self):
        self.prepare()
        plan = {"lots": [{"titre": "L1", "objectif": "o", "fichiers": ["app/A.php"]}, {"titre": "L2", "objectif": "o", "fichiers": []}],
                "postes": ["regles"]}
        self.assertEqual(self.sh("plan", "", "", stdin=json.dumps(plan))[0], 0)
        self.assertEqual(self.sh("plan", "corrige X", "", stdin=json.dumps(plan))[0], 3)  # consignes : mode correction
        self.assertEqual(self.sh("plan", "{{steps.orchestrateur.data.consignes}}", "", stdin=json.dumps(plan))[0], 0)
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
