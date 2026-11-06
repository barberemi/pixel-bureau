"""Implémenter un ticket en chaîne de postes (#76, #125 ; python3 -m unittest tests/test_chaine.py) : les modèles impl_*
rendus (postes en sous-workflows, gates dans le parent, 20 étapes au plus, agents par poste), puis workflows/chaine.py
étape par étape dans un vrai dépôt git jetable : dossier du ticket, poste Plan et « ce que j'ai compris » de sa gate,
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
CTRL_CMDS = ('missions', 'range', 'quoi', 'bilan_controles', 'aiguillage', 'fin_essai', 'retours_local')  # sous-commandes de chaine_controles.py
PR_CMDS = ('lance', 'pousse', 'pr', 'pret', 'reviewers', 'fin', 'revue_prep', 'retours_pr', 'repasse', 'revue_locale', 'retours_synchro')  # sous-commandes de chaine_pr.py ; les autres : chaine.py
TICKET = {"key": "AB-12", "fields": {"summary": "Bouton partager sur la fiche", "description": "Ajouter un bouton partager.",
                                     "components": [{"name": "site"}], "issuetype": {"name": "Story"}}}


def cfg(**over):
    c = copy.deepcopy(BASE)
    c["jira"] = {**c["jira"], "config_id": "abcdefab-cdef-abcd-efab-cdefabcdefab"}
    c["github"] = {**c.get("github", {}), "repo": "dm/site"}
    c["models"] = {k: f"0000000{i % 10}-0000-4000-8000-0000000000{i:02d}" for i, k in enumerate(KEYS + ["assign"])}
    c["impl"] = {"repos": {"dm/site": {"base": "main", "checks": {"regles": [{"cmd": "echo verif {php}", "subdir": "app"}]}}},
                 "postes": {"cadrage": {"agent": "CopilotCli", "skills": ["maison-patterns"]}}, "skills": ["php"]}
    c.update(over)
    return c


def steps(key, c=None):
    return {s["name"]: s for s in templates.render(TPL[key], c or cfg())["steps"]}


class ChaineModelesTest(unittest.TestCase):
    def test_postes_are_subworkflows_and_gates_stay_in_the_parent(self):
        c = cfg()
        chain = templates.render(TPL["impl_chain"], c)
        self.assertLessEqual(len(chain["steps"]), 20)  # le plafond de Kronn par workflow
        named = {s["name"]: s for s in chain["steps"]}
        # Code en échec (garde-fou docs de Kronn avec le travail fini) : rattrape, puis les contrôles ; sinon échec
        self.assertEqual(named["code"]["on_result"], [{"contains": "SUBWF_FAILED", "action": {"type": "Goto", "step_name": "rattrape", "max_iterations": 5}}])
        self.assertEqual(named["rattrape"]["exec_stdin"], '{{steps.code.data.last_output ?? ""}}')
        self.assertEqual(named["rattrape"]["on_result"][0]["action"], {"type": "Goto", "step_name": "controles", "max_iterations": 5})
        self.assertEqual(chain["steps"][-1]["name"], "rattrape")  # jamais atteinte dans l'ordre : seulement par le Goto
        self.assertEqual((chain["concurrency_limit"], chain["project_scope"]), (4, {"type": "All"}))  # 4 chaînes, tout projet
        self.assertEqual(chain["workspace_config"], {"hooks": {}, "require_isolation": True})  # une copie par ticket
        subs = {s["name"]: s["sub_workflow_id"] for s in chain["steps"] if s["step_type"]["type"] == "SubWorkflow"}
        self.assertEqual(set(subs), {"cadrage", "code", "controles", "livraison", "publication"})
        self.assertEqual(subs["code"], c["models"]["impl_code"])
        gates = [s["name"] for s in chain["steps"] if s["step_type"]["type"] == "Gate"]
        self.assertEqual(gates, ["gate_plan", "gate_escalade", "gate_pr"])  # une seule gate avant le code
        for key in KEYS:  # Kronn refuse un sous-workflow qui contient une gate
            if key != "impl_chain":
                self.assertNotIn("Gate", [s["step_type"]["type"] for s in TPL[key]["definition"]["steps"]], key)
        ctrl = steps("impl_controles", c)
        # tests d'abord (ils écrivent), puis règles, sécurité, perf, besoin et doc en parallèle (sous-agents d'une même
        # étape : Kronn ne lance pas de sous-workflows en parallèle), puis leur bilan ; plus de revue croisée
        self.assertEqual(list(ctrl), ["tests", "missions", "parallele", "range", "bilan"])
        self.assertEqual(ctrl["tests"]["on_result"][0]["action"]["step_name"], "missions")  # poste en panne : on continue
        self.assertEqual(ctrl["missions"]["on_result"], [{"contains": "exit_3", "action": {"type": "Goto", "step_name": "bilan"}}])
        self.assertEqual(set(ctrl["parallele"]["output_format"]["schema"]["properties"]), {"regles", "securite", "perf", "besoin", "doc"})
        doc = ctrl["parallele"]["output_format"]["schema"]["properties"]["doc"]["properties"]["docs"]["items"]["properties"]["etat"]
        self.assertEqual(doc["enum"], ["a_jour", "a_mettre_a_jour", "non_concernee", "manquante"])
        self.assertIn("tous en même temps", ctrl["parallele"]["prompt_template"])
        for m in ("Mission regles", "Mission securite", "Mission perf", "Mission besoin", "Mission doc", "Relevé de la doc"):
            self.assertIn(m, ctrl["parallele"]["prompt_template"])
        self.assertNotIn("{{steps.propose", ctrl["parallele"]["prompt_template"])
        self.assertEqual(ctrl["parallele"]["skill_ids"][:3], ["security", "web-performance", "accessibility"])
        self.assertEqual(ctrl["range"]["exec_stdin"], '{{steps.parallele.data_json ?? "null"}}')
        # coût (runs du 5 novembre) : le coordinateur ne fait que lancer (economy), chaque sous-agent a son modèle, lit le
        # contexte dans un fichier et y écrit son rapport ; le poste Tests part sans MCP ni outils Kronn, sans le skill TDD
        self.assertEqual(ctrl["parallele"]["agent_settings"], {"tier": "economy"})
        self.assertIn("avec le modèle indiqué", ctrl["parallele"]["prompt_template"])
        self.assertIn("rends `{}`", ctrl["parallele"]["prompt_template"])
        tp = steps("impl_tests", c)["propose"]
        self.assertEqual(tp["agent_settings"], {"tools": {"cli": ["Bash", "Read", "Edit", "Write", "Grep", "Glob"], "kronn_internal": []},
                                                "tier": "default"})
        self.assertNotIn("test-driven-development", tp["skill_ids"])
        names = [s["name"] for s in chain["steps"]]
        self.assertEqual(names[:7], ["ticket", "prepare", "cadrage", "compris", "dossier", "orchestrateur_plan", "gate_plan"])
        for gone in ("questions", "gate_questions", "schema", "patterns"):
            self.assertNotIn(gone, names)
        chain = {s["name"]: s for s in chain["steps"]}  # « ce que j'ai compris » et le plan : une seule gate, toujours ouverte
        self.assertNotIn("on_result", chain["compris"])
        msg = chain["gate_plan"]["gate_message"]
        self.assertIn("Ce que j'ai compris", msg)
        self.assertLess(msg.index("{{steps.compris.data.stdout"), msg.index("{{steps.orchestrateur_plan.data.apercu"))
        self.assertNotIn("revue", chain["orchestrateur_plan"]["output_format"]["schema"]["properties"]["postes"]["items"]["enum"])
        self.assertNotIn("Schéma", chain["orchestrateur_plan"]["prompt_template"])
        for key in ("impl_schema", "impl_patterns", "impl_revue"):  # plus appelés : plus rendus ni installés
            self.assertNotIn(key, templates.TEMPLATES)
            self.assertNotIn(f"@@models.{key}@@", json.dumps([TPL[k] for k in KEYS]))

    def test_human_feedback_reaches_the_postes(self):
        """Le commentaire d'une gate n'est injecté que dans le prompt d'une étape Agent : la chaîne le passe aux postes
        par leur variable retours, et chaque gate renvoie au bon poste."""
        st = steps("impl_chain")
        for n in ("cadrage", "code"):
            self.assertEqual(st[n]["sub_workflow_variables"]["retours"], '{{state.last_human_feedback ?? ""}}', n)
        self.assertEqual({n: st[n]["gate_request_changes_target"] for n in ("gate_plan", "gate_escalade", "gate_pr")},
                         {"gate_plan": "cadrage", "gate_escalade": "code", "gate_pr": "code"})
        self.assertEqual(st["aiguillage"]["on_result"][0]["action"]["step_name"], "livraison")
        self.assertTrue(st["commente_plan"]["external_effect"])

    def test_each_poste_has_its_agent_tier_and_skills(self):
        c = cfg()
        plan = steps("impl_cadrage", c)["propose"]  # le poste Plan : réglage impl.postes.cadrage
        self.assertEqual((plan["agent"], plan["agent_settings"], plan["skill_ids"]), ("CopilotCli", {"tier": "reasoning"}, ["maison-patterns"]))
        self.assertEqual(steps("impl_cadrage")["propose"]["agent_settings"], {"tier": "reasoning"})
        code = steps("impl_code", c)["code"]
        self.assertEqual((code["agent_settings"]["tier"], code["skill_ids"]), ("reasoning", ["verification-before-completion", "php"]))
        for key in KEYS:
            for s in templates.render(TPL[key], c)["steps"]:
                self.assertNotIn("_poste", s, key)

    def test_plan_is_one_agent_and_code_loops_three_times_at_most(self):
        """Le poste 📋 Plan : un agent, sans critique (ta gate du plan tranche), le relevé git grep avant lui et la
        vérification des chemins après, rangée dans son rapport ; il fait ce que faisaient cadrage, schéma et patterns."""
        plan = steps("impl_cadrage")
        self.assertEqual(list(plan), ["entree", "releve", "propose", "existe", "rapport"])
        self.assertEqual(plan["rapport"]["exec_stdin"], '{{steps.propose.data_json ?? "null"}}\n===SEP===\n{{steps.existe.data.stdout ?? "null"}}')
        self.assertEqual(plan["propose"]["output_format"]["on_invalid"], "Continue")
        props = plan["propose"]["output_format"]["schema"]["properties"]
        for k in ("comprehension", "criteres_acceptation", "questions", "fichiers", "mermaid", "zones_risque", "choix", "a_eviter", "concerne"):
            self.assertIn(k, props)
        self.assertIn("{{steps.releve.data.stdout", plan["propose"]["prompt_template"])
        self.assertNotIn("critique", plan["propose"]["prompt_template"])
        code = steps("impl_code")  # le Code en une session, 3 essais comptés par le script
        self.assertEqual(list(code), ["entree", "affecter", "plan", "code", "verif", "relecture", "tri", "bilan"])
        self.assertEqual(code["tri"]["on_result"], [{"contains": "exit_4", "action": {"type": "Goto", "step_name": "code", "max_iterations": 5}}])

    def test_the_floor_stops_at_the_pr_and_its_reviews(self):
        """L'étage ne déploie rien : la PR, sa revue par le modèle du Bureau, les retours traités ; ni CI ni env de branche."""
        liv = steps("impl_livraison")
        self.assertEqual(list(liv), ["entree", "redige", "pousse", "pr", "revue", "retours", "repasse", "fin"])
        self.assertEqual(liv["revue"]["sub_workflow_id"], cfg()["models"]["impl_revue_pr"])
        rv = steps("impl_revue_pr", cfg(models={**cfg()["models"], "review_child": "abababab-0000-4000-8000-000000000009"}))
        self.assertEqual((rv["revue"]["sub_workflow_id"], rv["revue"]["sub_workflow_foreach_file"]),
                         ("abababab-0000-4000-8000-000000000009", ".kronn/prs.json"))
        self.assertNotIn("revue", steps("impl_revue_pr"))  # sans modèle de revue installé : pas de revue
        rt = steps("impl_retours")  # le code de « corriger les commentaires d'une PR » (pr_update.py), sans sa gate
        self.assertEqual(list(rt), ["entree", "prepare", "corrige", "controle", "diff", "pousse", "synchro", "fin", "corrige_local", "note_local"])
        # mode essai : revue locale du diff puis correction locale, après fin (Stop) : jamais atteintes dans l'ordre
        rv = steps("impl_revue_pr")
        self.assertEqual(list(rv), ["entree", "fin", "locale", "range"])  # sans modèle de revue : fin suit entree
        self.assertIn({"contains": "exit_6", "action": {"type": "Goto", "step_name": "locale"}}, rv["entree"]["on_result"])
        for st in (rv, rt):
            self.assertEqual(st["fin"]["on_result"], [{"contains": "OK", "action": {"type": "Stop"}}])
        self.assertEqual(rv["range"]["on_result"], [{"contains": "OK", "action": {"type": "Goto", "step_name": "fin"}}])
        self.assertEqual(rv["range"]["exec_stdin"], '{{steps.locale.data_json ?? "null"}}')
        self.assertEqual(rv["locale"]["agent_settings"]["tier"], "reasoning")
        self.assertIn("ne postes rien", rv["locale"]["prompt_template"])
        self.assertIn({"contains": "exit_6", "action": {"type": "Goto", "step_name": "corrige_local"}}, rt["entree"]["on_result"])
        self.assertIn("Ne pousse rien", rt["corrige_local"]["prompt_template"])
        self.assertEqual(rt["note_local"]["on_result"], [{"contains": "OK", "action": {"type": "Goto", "step_name": "fin"}}])
        self.assertNotIn("Gate", json.dumps([s["step_type"] for s in rt.values()]))
        text = json.dumps([TPL[k] for k in KEYS], ensure_ascii=False)
        self.assertNotIn('"ci"', text)
        self.assertNotIn("env de branche (réglage", text)

    def test_resume_jumps_and_skips(self):
        """Reprise : prepare saute au Code (3), aux contrôles (4) ou à la PR (5) ; un poste d'analyse déjà fait saute à son
        rapport (5) ; le Code en mode essai saute l'étape affecter (5) ; la PR déjà relue saute à la fin (5)."""
        st = steps("impl_chain")
        self.assertEqual({r["contains"]: r["action"]["step_name"] for r in st["prepare"]["on_result"]},
                         {"exit_3": "code", "exit_4": "controles", "exit_5": "livraison"})
        self.assertEqual(st["prepare"]["exec_args"][-4:], ['{{depot ?? ""}}', '{{soeurs ?? ""}}', '{{reprise ?? "non"}}', '{{base ?? ""}}'])
        self.assertEqual(st["commente_plan"]["api_body"]["body"], '{{partie ?? ""}}{{steps.orchestrateur_plan.data.commentaire_jira}}')
        self.assertEqual(steps("impl_cadrage")["entree"]["on_result"], [{"contains": "exit_5", "action": {"type": "Goto", "step_name": "rapport"}}])
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
        self.render(cfg())

    def render(self, c):
        """Les trois scripts de la chaîne rendus avec cette config ; sh choisit celui qui porte la sous-commande."""
        self.code = templates.script_code("workflows/chaine.py", c)
        self.codes = {p: templates.script_code(f"workflows/{p}.py", c) for p in ("chaine_controles", "chaine_pr")}

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def sh(self, *args, stdin=""):
        env = {**os.environ, "KRONN_WORKTREE": self.wt, "HOME": os.path.join(self.tmp, "home"), **getattr(self, "env_extra", {})}  # cache du dossier : jetable
        code = self.codes["chaine_controles"] if args[0] in CTRL_CMDS else self.codes["chaine_pr"] if args[0] in PR_CMDS else self.code
        r = subprocess.run(["python3", "-c", code, *args], input=stdin, capture_output=True, text=True, cwd=self.wt, env=env)
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
        self.sh("entree", "code", "AB-12", "Garde le style actuel")  # le même retour n'est noté qu'une fois
        self.assertEqual(Path(self.wt, ".kronn", "chaine", "retours.md").read_text().count("Garde le style actuel"), 1)
        self.sh("entree", "code", "AB-12", "{{state.last_human_feedback}}")  # référence restée telle quelle : ignorée
        self.assertNotIn("state.last", Path(self.wt, ".kronn", "chaine", "retours.md").read_text())

    def test_plan_report_and_what_i_understood(self):
        """Le poste Plan : son rapport (cadrage.json) porte compris, fichiers et façons de faire, avec les chemins
        introuvables ; « ce que j'ai compris » ouvre la gate du plan à chaque ticket (plus de saut, impl.gate_cadrage sans
        effet) ; après un « Changements », le poste reprend son rapport précédent."""
        self.prepare()
        Path(self.wt, "app").mkdir(exist_ok=True)
        Path(self.wt, "app", "Share.php").write_text("<?php\n")
        prop = {"resume": "r", "comprehension": "c", "criteres_acceptation": ["a"],
                "questions": [{"question": "Quels réseaux ?", "bloquante": True, "hypothese": "X et Bluesky"}],
                "fichiers": [{"chemin": "app/Share.php", "action": "modifier"}, {"chemin": "app/Absent.php", "action": "modifier"},
                             {"chemin": "app/Neuf.php", "action": "creer"}],
                "mermaid": "flowchart LR\n A-->B", "choix": [{"sujet": "où", "decision": "comme app/Share.php"}]}
        code, ex = self.sh("existe", stdin=json.dumps(prop))
        self.assertEqual(json.loads(ex)["absents"], ["app/Absent.php"])
        self.sh("rapport", "cadrage", stdin=json.dumps(prop) + SEP + ex)
        rep = self.dossier("cadrage.json")
        self.assertEqual((rep["resultat"]["choix"][0]["sujet"], rep["critique"]["absents"]), ("où", ["app/Absent.php"]))
        code, q = self.sh("compris")
        self.assertEqual(code, 0)
        for part in ("🎯 Compréhension", "✅ Critères d'acceptation", "❓ À trancher** (1 bloquante)", "(bloquante) Quels réseaux ?",
                     "Hypothèse si pas de réponse : X et Bluesky", "⚠️ Chemins cités introuvables", "app/Absent.php"):
            self.assertIn(part, q)
        c = cfg()  # réglage d'avant : la gate s'ouvre quand même, rien à trancher compris
        c["impl"]["gate_cadrage"] = False
        self.render(c)
        prop["questions"] = []
        self.sh("rapport", "cadrage", stdin=json.dumps(prop) + SEP + "null")
        code, q = self.sh("compris")
        self.assertEqual(code, 0)
        self.assertNotIn("À trancher", q)
        self.assertNotIn("introuvables", q)
        code, ctx = self.sh("entree", "cadrage", "AB-12", "Pas de Bluesky")  # « Changements » à la gate du plan
        self.assertIn("Ton rapport précédent", ctx)
        self.assertIn("comme app/Share.php", ctx)
        code, dos = self.sh("dossier")  # l'orchestrateur lit le rapport du poste Plan, rien d'autre
        self.assertIn("Rapport du poste Plan", dos)
        self.assertIn("app/Share.php", dos)
        self.assertNotIn("ABSENT", dos)
        self.assertNotEqual(self.sh("tri", "cadrage", stdin="{}")[0], 0)  # plus de critique : la sous-commande n'existe plus

    def test_plan_only_mode_stops(self):
        self.assertEqual(self.sh("mode", "plan")[0], 4)
        self.assertEqual(self.sh("mode", "complet")[0], 0)
        # plan seulement : saut au commentaire Jira, dernière étape, puis Stop ; complet et essai : le Code suit dans
        # l'ordre. Kronn reprend un « Changements » de gate à l'étape qui suit la dernière gardée (essai d'EW-6550 :
        # commente_plan juste après mode a posté le plan dans Jira en mode essai) : le Code doit suivre mode.
        c = templates.render(TPL["impl_chain"], cfg())
        names = [s["name"] for s in c["steps"]]
        st = {s["name"]: s for s in c["steps"]}
        self.assertEqual(names[names.index("mode") + 1], "code")
        self.assertEqual(names[names.index("publication") + 1], "commente_plan")  # après : des étapes atteintes par Goto seulement
        self.assertLessEqual(set(names[names.index("commente_plan") + 1:]), {"rattrape", "fin_essai"})
        self.assertEqual(st["mode"]["on_result"], [{"contains": "exit_4", "action": {"type": "Goto", "step_name": "commente_plan"}}])
        self.assertEqual(st["commente_plan"]["on_result"], [{"contains": "OK", "action": {"type": "Stop"}}])
        self.assertEqual(st["publication"]["on_result"], [{"contains": "OK", "action": {"type": "Stop"}}])

    def test_dossier_is_kept_after_the_run(self):
        """Kronn supprime la copie de travail d'un run réussi : fin et plan seulement gardent le dossier dans ~/.cache."""
        self.prepare()
        home = os.path.join(self.tmp, "home")
        env = {**os.environ, "KRONN_WORKTREE": self.wt, "HOME": home}
        r = subprocess.run(["python3", "-c", self.codes["chaine_pr"], "fin"], capture_output=True, text=True, cwd=self.wt, env=env)
        dest = json.loads(r.stdout)["dossier"]
        self.assertTrue(dest.startswith(home), dest)
        self.assertTrue(os.path.exists(os.path.join(dest, "ticket.md")))

    def test_essai_mode_sends_nothing(self):
        """Mode essai : la chaîne entière sans effet externe (le shadow de Kronn ne rejoue pas un workflow à variables)."""
        self.prepare()
        e = self.dossier("etat.json")
        e["mode"] = "essai"
        Path(self.wt, ".kronn", "chaine", "etat.json").write_text(json.dumps(e))
        self.assertEqual(self.sh("mode", "essai")[0], 0)
        for cmd in ("pousse", "pret"):
            code, outp = self.sh(cmd)
            self.assertEqual(code, 0, outp)
            self.assertIn("Mode essai", outp)
        self.assertEqual(self.sh("revue_prep")[0], 6)  # pas de PR en mode essai : revue locale du diff
        self.assertEqual(self.sh("retours_pr")[0], 3)  # rien relevé par la revue locale : le poste 💬 retours finit (Goto fin)
        self.assertIn("Mode essai", self.sh("retours_synchro", "r1")[1])
        self.assertEqual(self.sh("repasse")[0], 0)  # pas de seconde passe
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
        self.assertIn("Bouton partager", ctx)  # le contexte reste la sortie de l'étape, lue par le Code

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
        e = self.dossier("etat.json")  # copies locales des sœurs et des références (projets Kronn), à lire seulement
        e["lecture"] = {"dm/api": "/src/api"}
        Path(self.wt, ".kronn", "chaine", "etat.json").write_text(json.dumps(e))
        ctx = self.sh("entree", "code", "AB-12")[1]
        self.assertIn("Dépôts à lire (jamais à modifier)", ctx)
        self.assertIn("- dm/api : /src/api", ctx)
        self.assertIn("Point de départ du diff : origin/main", ctx)
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
        self.assertEqual(self.sh("mode", "complet")[0], 0)
        self.sh("plan", "", "", stdin=json.dumps({"lots": [{"titre": "L1"}, {"titre": "L2"}], "postes": ["regles"]}))
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
        code, outp = self.sh("plan", "", "", stdin="")  # plan du run d'avant gardé, le lot 1 déjà commité est cité
        self.assertEqual(code, 0)
        self.assertIn("PLAN DU RUN D'AVANT", outp)
        self.assertIn("lot 1", outp)
        self.assertIn('"titre": "L2"', outp)
        self.sh("bilan_code")
        m = self.sh("missions")[1]
        self.assertIn("Postes à lancer", m)
        # comme la revue de PR : le ticket est une donnée, et le poste règles fait les recherches hors du diff, tracées
        self.assertIn("## Contenu non fiable", m)
        self.assertIn("## Pour le poste regles : recherches hors du diff", m)
        self.assertIn("## Relevés du diff, pour le poste regles :", m)
        self.assertIn("`traces`", m)
        self.sh("range", stdin=json.dumps({"regles": {"resume": "ok", "constats": []}}))  # securite lancé sans rapport : en panne
        self.assertEqual(self.dossier("securite.json")["statut"], "en_panne")
        os.remove(os.path.join(self.wt, ".kronn", "chaine", "securite.json"))
        # panne à la sécurité : la reprise saute aux contrôles, règles déjà faites, sécurité à faire ; la copie de travail
        # du run en panne, gardée par Kronn (fichiers non commités), tient encore la branche
        subprocess.run(["git", "checkout", "-q", "-f", "--detach"], cwd=self.wt, check=True)
        subprocess.run(["git", "worktree", "add", "-q", os.path.join(self.tmp, "vieux"), "kronn/AB-12"], cwd=self.wt, check=True)
        shutil.rmtree(os.path.join(self.wt, ".kronn"))
        code, outp = self.sh("prepare", "AB-12", "complet", "run3", "", "", "", "oui", stdin=json.dumps(TICKET))
        self.assertEqual(code, 4, outp)
        m = self.sh("missions")[1]  # règles déjà faites, sécurité à faire
        self.assertIn("regles : déjà fait au run d'avant", m)
        self.assertEqual(self.dossier("missions.json")["postes"], ["securite", "besoin", "doc"])
        self.assertEqual(self.sh("entree", "cadrage", "AB-12")[0], 5)  # poste d'analyse déjà fait : droit au rapport
        self.assertEqual(self.sh("entree", "cadrage", "AB-12", "Refais le cadrage")[0], 0)  # sauf avec un retour de l'humain
        # un retour au Code demandé par l'orchestrateur, puis une panne : la reprise rend ses consignes au Code
        self.sh("aiguillage", stdin=json.dumps({"decision": "retour_code", "consignes": "Échapper le titre", "resume": "r"}))
        shutil.rmtree(os.path.join(self.wt, ".kronn"))
        code, outp = self.sh("prepare", "AB-12", "complet", "run4", "", "", "", "oui", stdin=json.dumps(TICKET))
        self.assertEqual(code, 3, outp)
        self.assertIn("Échapper le titre", self.sh("entree", "code", "AB-12", "", "")[1])
        self.assertIn("MODE CORRECTION", self.sh("plan", "", "", stdin="")[1])
        self.sh("bilan_code")
        self.assertEqual(self.dossier("etat.json")["consignes_reprise"], "")
        # un nouveau départ (reprise non) efface le dossier gardé
        self.sh("prepare", "AB-12", "complet", "run5", "", "", "", "non", stdin=json.dumps(TICKET))
        self.assertEqual(json.loads((cache / "etat.json").read_text())["run"], "run5")

    def test_replay_from_a_past_commit_and_default_branch(self):
        """Essai rejoué : la branche part d'un commit passé (ticket déjà livré, comparé à sa PR) ; une base réglée absente
        du dépôt distant (front_tools : master) laisse la place à sa branche par défaut."""
        g = ["git", "-c", "user.email=t@t", "-c", "user.name=t"]
        first = subprocess.run(["git", "rev-parse", "HEAD"], cwd=self.wt, capture_output=True, text=True).stdout.strip()
        Path(self.wt, "app", "B.php").write_text("<?php // livré\n")
        subprocess.run(g + ["add", "-A"], cwd=self.wt, check=True)
        subprocess.run(g + ["commit", "-qm", "ticket livré"], cwd=self.wt, check=True)
        subprocess.run(["git", "push", "-q", "origin", "main"], cwd=self.wt, check=True)
        t = copy.deepcopy(TICKET)  # un commentaire d'avant le rejeu, un d'après (posté après la livraison)
        t["fields"].update(status={"name": "Deployed"}, comment={"comments": [
            {"created": "2000-01-01T10:00:00.000+0100", "body": "question d'avant"},
            {"created": "2999-01-01T10:00:00.000+0100", "body": "retour d'usage de l'IA"}]})
        code, outp = self.sh("prepare", "AB-12", "essai", "run1", "", "", "", "", first[:10], stdin=json.dumps(t))  # SHA court
        self.assertEqual(code, 0, outp)
        self.assertFalse(Path(self.wt, "app", "B.php").exists())  # l'état d'avant la livraison
        self.assertEqual(self.dossier("etat.json")["depart"], first)
        md = Path(self.wt, ".kronn", "chaine", "ticket.md").read_text()
        self.assertIn("question d'avant", md)
        self.assertNotIn("retour d'usage", md)
        self.assertNotIn("Deployed", md)
        self.assertEqual(steps("impl_chain")["ticket"]["api_query"]["expand"], "changelog")  # l'historique, pour défaire

    def test_replay_rebuilds_the_ticket_as_it_was(self):
        """Essai rejoué : description et titre réécrits après le départ (décisions produit, PR humaine déjà ouverte) sont
        défaits depuis l'historique Jira, du plus récent au plus ancien ; un changement d'avant le départ reste."""
        ns = {"__name__": "chaine_mod"}
        exec(compile(self.code, "chaine.py", "exec"), ns)
        h = lambda when, *items: {"created": when, "items": [dict(zip(("field", "fromString", "toString"), i)) for i in items]}  # noqa: E731
        t = {"key": "AB-12", "fields": {"summary": "Titre final", "description": "v3 avec décisions produit"},
             "changelog": {"histories": [
                 h("2026-10-01T10:00:00.000+0200", ("description", "v0", "v1")),
                 h("2026-10-20T10:00:00.000+0200", ("description", "v1", "v2"), ("status", "To Do", "Done")),
                 h("2026-10-25T10:00:00.000+0200", ("description", "v2", "v3 avec décisions produit"), ("summary", "Titre initial", "Titre final"))]}}
        avant = ns["quand"]("2026-10-10T00:00:00+02:00")
        old, remontes = ns["a_la_date"](t, avant)
        self.assertEqual((old["fields"]["description"], old["fields"]["summary"], remontes), ("v1", "Titre initial", ["description", "summary"]))
        self.assertEqual(t["fields"]["description"], "v3 avec décisions produit")  # le ticket reçu n'est pas modifié
        md = ns["ticket_md"](old, avant, remontes)
        self.assertIn("tels qu'au 2026-10-09 22:00 UTC", md)
        self.assertNotIn("décisions produit", md)
        self.assertEqual(ns["a_la_date"](t, ns["quand"]("2026-11-01T00:00:00Z"))[1], [])  # rien après : rien à défaire
        self.assertEqual(ns["a_la_date"]({"fields": {"description": "d"}}, avant)[0]["fields"]["description"], "d")  # sans historique
        first = subprocess.run(["git", "rev-parse", "HEAD"], cwd=self.wt, capture_output=True, text=True).stdout.strip()
        t2 = {**t, "changelog": {"histories": [h("2999-01-01T10:00:00.000+0100", ("description", "d'origine", "réécrite"))]}}
        t2["fields"] = {**TICKET["fields"], "description": "réécrite"}
        code, outp = self.sh("prepare", "AB-12", "essai", "run1", "", "", "", "", first, stdin=json.dumps(t2))
        self.assertEqual(code, 0, outp)
        md = Path(self.wt, ".kronn", "chaine", "ticket.md").read_text()
        self.assertIn("d'origine", md)
        self.assertNotIn("réécrite", md)
        self.assertIn("d'origine", self.dossier("etat.json")["texte"])
        Path(self.wt, "app", "C.php").write_text("<?php\n")
        self.assertEqual(json.loads(self.sh("quoi")[1])["fichiers"], ["app/C.php"])  # diff contre le commit rejoué
        self.assertIn("ne rebase pas dessus", self.sh("entree", "besoin", "AB-12")[1])  # la base distante a déjà le ticket
        self.assertIn("essai_rejoue", self.sh("bilan_controles")[1])
        subprocess.run(["git", "push", "-q", "origin", "main:master"], cwd=self.wt, check=True)
        subprocess.run(["git", "symbolic-ref", "HEAD", "refs/heads/master"], cwd=self.origin, check=True)
        subprocess.run(["git", "push", "-q", "origin", "--delete", "main"], cwd=self.wt, check=True)
        code, outp = self.sh("prepare", "AB-12", "essai", "run2", stdin=json.dumps(TICKET))
        self.assertEqual(code, 0, outp)
        self.assertIn("depuis origin/master", outp)

    def test_cadrage_out_of_scope_goes_to_the_gate(self):
        """Ticket à plusieurs dépôts dont rien ne revient à ce bureau : la gate du plan propose de l'arrêter."""
        self.prepare()
        self.sh("rapport", "cadrage", stdin=json.dumps({"resume": "r", "questions": [], "concerne": False,
                                                        "hors_perimetre": "tout est dans dm/api"}) + SEP + "null")
        code, outp = self.sh("compris")
        self.assertEqual(code, 0)
        self.assertIn("🚫 Rien à faire dans dm/site ?", outp)
        self.assertIn("tout est dans dm/api", outp)
        self.assertIn("Rejeter : ce bureau s'arrête", outp)

    def test_nothing_to_resume_starts_over(self):
        code, outp = self.sh("prepare", "AB-12", "plan", "run1", "", "", "", "oui", stdin=json.dumps(TICKET))
        self.assertEqual(code, 0, outp)
        self.assertIn("Rien à reprendre", outp)
        self.assertEqual(self.dossier("etat.json")["etape"], "cadrage")

    def test_pr_gets_the_requirements_table_and_open_points(self):
        """Le tableau exigence par exigence (poste 🎯 Besoin) et les points ouverts (avis des contrôles) sont écrits dans la
        PR par le script, à l'emplacement laissé par le rédacteur ou à la fin ; l'agent ne peut ni les omettre ni les
        réécrire (essai d'EW-7945 : « qat retiré » alors que deux workflows le proposaient encore)."""
        self.prepare()
        e = self.dossier("etat.json")
        e["mode"] = "essai"
        Path(self.wt, ".kronn", "chaine", "etat.json").write_text(json.dumps(e))
        self.sh("rapport", "besoin", stdin=json.dumps({"resume": "r", "constats": [], "exigences": [
            {"exigence": "qat retiré des actions non-prod", "etat": "partiel", "detail": "reste CD_BUILD_APP.yaml | ligne 12"},
            {"exigence": "guard en prod", "etat": "fait", "detail": "CD_Deploy-PRODUCTION.yaml"}]}) + SEP + "null")
        Path(self.wt, ".kronn", "chaine", "controles.json").write_text(json.dumps({"bloquants": [], "avis": [
            {"poste": "perf", "fichier": "README.md", "ligne": 75, "probleme": "qat encore listé", "correction": "retirer la ligne"},
            {"poste": "perf", "fichier": "README.md", "ligne": 75, "probleme": "qat encore listé"},
            {"poste": "tests", "probleme": "tests rouges", "correction": "\x1b[31mFAIL\x1b[39m " + "x" * 900}]}))
        self.sh("pr", stdin=json.dumps({"title": "t", "body": "## 🎯 De quoi on parle ?\n\nx\n\n<!-- bureau-exigences -->\n\n## 🧪 Comment on teste ?\n\n1. y"}))
        body = Path(self.wt, ".kronn", "chaine", "pr_body.md").read_text()
        self.assertLess(body.index("## Ce que le ticket demandait"), body.index("🧪 Comment on teste ?"))  # à l'emplacement laissé
        self.assertIn("| qat retiré des actions non-prod | 🟡 partiel | reste CD_BUILD_APP.yaml \\| ligne 12 |", body)
        self.assertIn("| guard en prod | ✅ livré |", body)
        self.assertIn("## Points ouverts", body)
        self.assertEqual(body.count("qat encore listé"), 1)  # doublon écarté
        self.assertIn("(⚡ perf) `README.md:75` : qat encore listé ; piste : retirer la ligne", body)
        self.assertIn("piste : FAIL xxx", body)  # sortie de terminal sans codes couleur, tronquée
        self.assertNotIn("\x1b", body)
        self.assertIn("x…", body)
        self.sh("pr", stdin=json.dumps({"title": "t", "body": body}))  # une PR remise à jour ne double pas les blocs
        self.assertEqual(Path(self.wt, ".kronn", "chaine", "pr_body.md").read_text().count("## Ce que le ticket demandait"), 1)

    def fake_gh(self, data=None):
        """Un gh de test (PATH) : réponses par sous-commande, appels notés ; jamais GitHub."""
        b = os.path.join(self.tmp, "bin")
        os.makedirs(b, exist_ok=True)
        Path(b, "gh").write_text("#!" + sys.executable + "\nimport json, os, sys\na = sys.argv[1:]\n"
                                 "open(os.environ['GH_LOG'], 'a').write(json.dumps(a) + '\\n')\n"
                                 "d = json.load(open(os.environ['GH_DATA']))\nprint(d.get(' '.join(a[:2]), ''))\n")
        os.chmod(os.path.join(b, "gh"), 0o755)
        Path(self.tmp, "gh.json").write_text(json.dumps(data or {}))
        self.env_extra = {"PATH": b + os.pathsep + os.environ.get("PATH", ""), "GH_LOG": os.path.join(self.tmp, "gh.log"),
                          "GH_DATA": os.path.join(self.tmp, "gh.json"),  # une identité git : la CI n'en a pas (le squash commite)
                          "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}

    def gh_calls(self):
        p = Path(self.tmp, "gh.log")
        return [json.loads(x) for x in p.read_text().splitlines()] if p.exists() else []

    def commit(self, name, text, msg):
        Path(self.wt, name).write_text(text)
        g = ["git", "-c", "user.email=t@t", "-c", "user.name=t"]
        subprocess.run([*g, "add", "-A"], cwd=self.wt, check=True, capture_output=True)
        subprocess.run([*g, "commit", "-qm", msg], cwd=self.wt, check=True, capture_output=True)

    def test_code_checks_run_rules_tests_and_guardrails(self):
        """Au poste Code, les vérifications « code » : règles et tests réglés, puis les garde-fous du diff (clé de ticket
        dans un commentaire, en-tête sensible, commit provisoire) ; rouges, le Code reprend."""
        self.prepare()
        self.commit("app/A.php", "<?php\n$a = 1;\n", "feat(site): AB-12 lot 1")
        v = json.loads(self.sh("verif", "code")[1])
        self.assertTrue(v["ok"], v)
        self.assertEqual([x["cmd"] for x in v["sorties"]][-1], "garde-fous du diff (0 token)")
        self.commit("app/B.php", "<?php\n// AB-12 : à cause du ticket\nheader('Access-Control-Allow-Origin: *');\n", "TEMP debug")
        v = json.loads(self.sh("verif", "code")[1])
        self.assertFalse(v["ok"])
        sortie = v["sorties"][-1]["sortie"]
        self.assertIn("app/B.php : clé de ticket dans un commentaire", sortie)
        self.assertIn("app/B.php : en-tête ou clé sensible", sortie)
        self.assertIn("commit provisoire à retirer : TEMP debug", sortie)
        self.assertNotIn("A.php", sortie)
        self.assertEqual(steps("impl_code")["verif"]["exec_args"][3], "code")

    def test_ready_squashes_into_one_commit_labels_and_notes_the_gaps_in_jira(self):
        """Après la revue et les retours de la chaîne : un seul commit au format du dépôt (message du rédacteur), poussé,
        la PR prête avec le label de CI ; le commentaire Jira acte les écarts au ticket et ce qui est changé sans exigence."""
        self.prepare()
        e = self.dossier("etat.json")
        e["mode"] = "complet"
        Path(self.wt, ".kronn", "chaine", "etat.json").write_text(json.dumps(e))
        for i in (1, 2, 3):
            self.commit("app/A.php", "<?php\n$a = %d;\n" % i, "feat(site): AB-12 lot %d" % i)
        self.fake_gh({"pr list": "", "pr create": "https://github.com/dm/site/pull/7"})
        self.render(cfg(impl={**cfg()["impl"], "ci_label": "ci-test"}))
        code, outp = self.sh("pr", stdin=json.dumps({"title": "feat(Site):AB-12 Bouton partager", "body": "corps",
                                                     "commit": "feat(Site):AB-12 Bouton partager\n\nDétail."}))
        self.assertEqual(code, 0, outp)
        code, outp = self.sh("pret")
        self.assertEqual(code, 0, outp)
        self.assertIn("3 commits réunis en un", outp)
        self.assertIn("label ci-test posé", outp)
        log = subprocess.run(["git", "--git-dir", self.origin, "log", "--format=%B", "-n", "2", e["branch"]], capture_output=True, text=True).stdout
        self.assertTrue(log.startswith("feat(Site):AB-12 Bouton partager\n\nDétail.\n\nSigned-off-by: "), log)
        self.assertEqual(subprocess.run(["git", "--git-dir", self.origin, "rev-list", "--count", f"main..{e['branch']}"],
                                        capture_output=True, text=True).stdout.strip(), "1")
        calls = self.gh_calls()
        self.assertIn(["pr", "ready", "7", "-R", "dm/site"], calls)
        self.assertIn(["pr", "edit", "7", "-R", "dm/site", "--add-label", "ci-test"], calls)
        self.sh("rapport", "besoin", stdin=json.dumps({"resume": "r", "constats": [], "exigences": [
            {"exigence": "bouton sur la fiche", "etat": "fait", "detail": "app/A.php"},
            {"exigence": "partage par mail", "etat": "hors_scope", "detail": "ticket de suite"}],
            "hors_ticket": [{"fichier": "composer.lock", "changement": "symfony 7.3", "justification": ""}]}) + SEP + "null")
        code, outp = self.sh("reviewers")
        self.assertIn("h4. Écarts au ticket (à valider)", outp)
        self.assertIn("|partage par mail|⏭️ hors scope|ticket de suite|", outp)
        self.assertNotIn("bouton sur la fiche", outp)
        self.assertIn("* {{composer.lock}} : symfony 7.3", outp)

    def test_retours_use_the_fix_code_without_its_gate(self):
        """Le poste 💬 retours enchaîne fix_prepare, l'agent au prompt du fix, fix_check, fix_diff et fix_push sur la PR
        en « dépôt#n » ; aucun fil (9) ou rien à pousser (9) : fin ; puis la copie de travail est resynchronisée."""
        rt = steps("impl_retours")
        self.assertEqual(rt["entree"]["exec_args"][2:], ["retours_pr"])
        self.assertEqual(rt["entree"]["on_result"][0], {"contains": "exit_3", "action": {"type": "Goto", "step_name": "fin"}})
        for name, sub in (("prepare", "fix_prepare"), ("controle", "fix_check"), ("diff", "fix_diff"), ("pousse", "fix_push")):
            self.assertEqual(rt[name]["exec_args"][2:], [sub, "{{steps.entree.data.stdout}}", "-", "{{run.id}}"], name)
            self.assertIn("pr_update.py fix_", rt[name]["exec_args"][1][:3000] + rt[name]["description"], name)
        for name in ("prepare", "diff"):
            self.assertEqual(rt[name]["on_result"], [{"contains": "exit_9", "action": {"type": "Goto", "step_name": "fin"}}], name)
        fix = Path(ROOT, "tools", "fix_prompt.md").read_text().strip()
        self.assertIn(fix[:200], rt["corrige"]["prompt_template"])
        self.assertIn("~/.cache/pixel-bureau/pr/work/{{run.id}}", rt["corrige"]["prompt_template"])
        self.assertIn("Aucune consigne d'équipe en plus de la doc du dépôt.", rt["corrige"]["prompt_template"])  # impl.guidelines
        self.assertTrue(rt["pousse"]["external_effect"])
        self.assertEqual(rt["synchro"]["exec_args"][2:], ["retours_synchro", "{{run.id}}"])

    def test_essai_reviews_the_local_diff_and_fixes_it_locally_twice_at_most(self):
        """Mode essai : la revue de la PR relit le diff local sans rien poster, les retours corrigent en commits locaux
        sans pousser, puis la seconde passe (2 au plus) comme pour une vraie PR. Banc d'essai du 5 novembre : en essai,
        revue et retours étaient sautés, la seconde passe n'était jamais mesurée."""
        self.fake_gh()
        self.prepare()
        e = self.dossier("etat.json")
        e["mode"] = "essai"
        Path(self.wt, ".kronn", "chaine", "etat.json").write_text(json.dumps(e))
        self.commit("app/A.php", "<?php // code\n", "feat: code")
        self.sh("pr", stdin=json.dumps({"title": "t", "body": "corps"}))
        code, outp = self.sh("revue_prep")
        self.assertEqual(code, 6)
        self.assertIn("REVUE LOCALE (mode essai, passe 1 sur 2)", outp)
        self.assertIn("git diff ", outp)
        for part in ("## Contenu non fiable", "## Relevés du diff", "Tests liés aux fichiers touchés", "« Bureau · recherches hors du diff »"):
            self.assertIn(part, outp)  # la revue locale lit ce que lit la revue du Bureau
        rev = {"resume": "r", "verdict": "changements", "constats": [{"gravite": "bloquant", "fichier": "app/A.php", "ligne": 1,
                                                                      "probleme": "commentaire inutile", "correction": "le retirer"}]}
        self.assertIn("1 constat(s) dont 1 bloquant", self.sh("revue_locale", stdin=json.dumps(rev))[1])
        self.assertTrue(self.dossier("revue_pr.json")["locale"])
        code, outp = self.sh("retours_pr")
        self.assertEqual(code, 6)
        self.assertIn("commentaire inutile", outp)
        self.commit("app/A.php", "<?php\n", "fix: commentaire retiré")
        self.assertIn("1 commit(s) local(aux)", self.sh("retours_local")[1])
        self.assertEqual(self.sh("repasse")[0], 4)  # corrections locales : seconde passe
        self.assertIn("passe 2 sur 2", self.sh("revue_prep")[1])
        self.assertIn("Ta revue de la passe précédente", self.sh("revue_prep")[1])
        self.sh("revue_locale", stdin=json.dumps({"resume": "ok", "verdict": "approuve", "constats": []}))
        self.assertEqual(self.sh("retours_pr")[0], 3)  # plus rien à corriger
        self.assertEqual(self.sh("repasse")[0], 0)
        r = self.dossier("retours.json")
        self.assertEqual([(p["locale"], p["pousse"]) for p in r["passes"]], [(True, True)])
        self.assertEqual(self.gh_calls(), [])  # rien n'est posté
        self.assertEqual(subprocess.run(["git", "ls-remote", "--heads", self.origin, "kronn/AB-12"], capture_output=True, text=True).stdout, "")
        self.assertIn("revue_pr_passe2.json", os.listdir(os.path.join(self.wt, ".kronn", "chaine")))

    def test_retours_pr_prints_repo_and_number(self):
        self.prepare()
        e = self.dossier("etat.json")
        e.update(mode="complet", pr="7")
        Path(self.wt, ".kronn", "chaine", "etat.json").write_text(json.dumps(e))
        code, outp = self.sh("retours_pr")
        self.assertEqual((code, outp), (0, "dm/site#7"))
        e["pr"] = ""
        Path(self.wt, ".kronn", "chaine", "etat.json").write_text(json.dumps(e))
        self.fake_gh({"pr list": ""})
        self.assertEqual(self.sh("retours_pr")[0], 3)  # pas de PR ouverte : rien à lire

    def test_synchro_takes_back_the_pushed_fixes_then_one_more_pass(self):
        """fix_push pousse depuis son propre dossier : la copie de la chaîne avance sur origin/<branche> (le squash les
        garde), la description garde le bloc du fix et ses blocs exigences et points ; une seconde passe, pas trois."""
        self.prepare()
        e = self.dossier("etat.json")
        e.update(mode="complet", pr="7")
        Path(self.wt, ".kronn", "chaine", "etat.json").write_text(json.dumps(e))
        self.commit("app/A.php", "<?php\n$a = 1;\n", "feat(site): AB-12 lot 1")
        subprocess.run(["git", "push", "-q", "origin", f"HEAD:{e['branch']}"], cwd=self.wt, check=True, capture_output=True)
        other = os.path.join(self.tmp, "fix")  # le dossier de travail de pr_update.py : la branche distante de la PR
        subprocess.run(["git", "clone", "-q", "-b", e["branch"], self.origin, other], check=True, capture_output=True)
        Path(other, "app", "A.php").write_text("<?php\n$a = 2;\n")
        g = ["git", "-c", "user.email=t@t", "-c", "user.name=t"]
        subprocess.run([*g, "commit", "-qam", "fix: retours de review"], cwd=other, check=True, capture_output=True)
        subprocess.run(["git", "push", "-q", "origin", e["branch"]], cwd=other, check=True, capture_output=True)
        pushed = subprocess.run(["git", "rev-parse", "HEAD"], cwd=other, capture_output=True, text=True).stdout.strip()
        runs = Path(self.tmp, "home", ".cache", "pixel-bureau", "pr", "runs")
        runs.mkdir(parents=True)
        (runs / "r1.json").write_text(json.dumps({"version": 1, "threads": ["T1", "T2"], "generaux": [{"id": "G"}],
                                                  "cols": {"T1": "corrige", "T2": "laisse"}}))
        self.fake_gh({"pr view": "corps\n<!-- bureau-points -->\n<!-- bureau-fix:start -->fix<!-- bureau-fix:end -->"})
        code, outp = self.sh("retours_synchro", "r1")
        self.assertEqual(code, 0, outp)
        self.assertIn("Corrections reprises", outp)
        self.assertEqual(subprocess.run(["git", "rev-parse", "HEAD"], cwd=self.wt, capture_output=True, text=True).stdout.strip(), pushed)
        r = self.dossier("retours.json")
        self.assertEqual((r["reponses"], r["passes"][0]["pousse"], r["passes"][0]["fils"]), (2, True, 2))
        self.assertIn("bureau-fix:start", Path(self.wt, ".kronn", "chaine", "pr_body.md").read_text())
        self.assertIn(["pr", "edit", "7", "-R", "dm/site", "--body-file", os.path.join(self.wt, ".kronn", "chaine", "pr_body.md")], self.gh_calls())
        self.assertEqual(self.sh("repasse")[0], 4)  # corrections poussées : la revue relit le nouveau head
        self.assertEqual(self.sh("retours_synchro", "r2")[0], 0)  # rien de nouveau poussé
        self.assertEqual(self.dossier("etat.json")["retours_pousse"], False)
        e = self.dossier("etat.json")
        e["retours_pousse"] = True  # même poussée, la seconde passe est la dernière
        Path(self.wt, ".kronn", "chaine", "etat.json").write_text(json.dumps(e))
        self.assertEqual(self.sh("repasse")[0], 0)
        liv = steps("impl_livraison")
        self.assertEqual(liv["repasse"]["on_result"], [{"contains": "exit_4", "action": {"type": "Goto", "step_name": "revue", "max_iterations": 1}}])

    def test_synchro_refuses_a_diverged_working_copy(self):
        self.prepare()
        e = self.dossier("etat.json")
        e.update(mode="complet", pr="7")
        Path(self.wt, ".kronn", "chaine", "etat.json").write_text(json.dumps(e))
        self.commit("app/A.php", "<?php\n$a = 1;\n", "feat(site): AB-12 lot 1")
        subprocess.run(["git", "push", "-q", "origin", f"HEAD:{e['branch']}"], cwd=self.wt, check=True, capture_output=True)
        other = os.path.join(self.tmp, "fix")
        subprocess.run(["git", "clone", "-q", "-b", e["branch"], self.origin, other], check=True, capture_output=True)
        Path(other, "app", "A.php").write_text("<?php\n$a = 2;\n")
        g = ["git", "-c", "user.email=t@t", "-c", "user.name=t"]
        subprocess.run([*g, "commit", "-qam", "fix"], cwd=other, check=True, capture_output=True)
        subprocess.run(["git", "push", "-q", "origin", e["branch"]], cwd=other, check=True, capture_output=True)
        self.commit("app/B.php", "<?php\n", "local")  # un commit que la branche distante n'a pas
        head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=self.wt, capture_output=True, text=True).stdout
        self.fake_gh({})
        code, outp = self.sh("retours_synchro", "r1")
        self.assertNotEqual(code, 0)
        self.assertIn("divergente", outp)
        self.assertEqual(subprocess.run(["git", "rev-parse", "HEAD"], cwd=self.wt, capture_output=True, text=True).stdout, head)

    def test_code_in_one_session_retries_three_times(self):
        self.prepare()
        plan = {"lots": [{"titre": "L1", "objectif": "o", "fichiers": ["app/A.php"]}, {"titre": "L2", "objectif": "o", "fichiers": []}],
                "postes": ["regles"]}
        code, outp = self.sh("plan", "", "", stdin=json.dumps(plan))
        self.assertEqual(code, 0)
        self.assertIn("PLAN VALIDÉ : 2 lot(s)", outp)
        self.assertIn("MODE CORRECTION", self.sh("plan", "corrige X", "", stdin=json.dumps(plan))[1])  # consignes : correction
        self.assertIn("PLAN VALIDÉ", self.sh("plan", "{{steps.orchestrateur.data.consignes}}", "", stdin=json.dumps(plan))[1])
        self.assertIn("PLAN VALIDÉ", self.sh("plan", "", "Approuvé, vas-y", stdin=json.dumps(plan))[1])  # approbation commentée
        Path(self.wt, ".kronn", "chaine", "code.json").write_text("{}")  # le Code est déjà passé : un retour = correction
        self.assertIn("Renomme la méthode", self.sh("plan", "", "Renomme la méthode", stdin=json.dumps(plan))[1])
        red = json.dumps({"ok": False}) + SEP + json.dumps({"verdict": "ok"})
        self.assertEqual([self.sh("tri_code", stdin=red)[0] for _ in range(3)], [4, 4, 0])  # 3e essai : les contrôles trancheront
        self.sh("bilan_code")
        self.assertIn("après 3 essais", self.dossier("code.json")["note"])
        self.assertEqual(self.sh("tri_code", stdin=json.dumps({"ok": True}) + SEP + json.dumps({"verdict": "revoir"}))[0], 4)
        self.assertEqual(self.sh("tri_code", stdin=json.dumps({"ok": True}) + SEP + json.dumps({"verdict": "ok"}))[0], 0)

    def test_dependencies_of_the_main_checkout_are_linked_never_committed(self):
        """impl.repos.<dépôt>.deps : vendor/ et node_modules du checkout principal liés dans la copie de travail (sans
        copie), ignorés par git même quand le .gitignore ne vise que des dossiers (« vendor/ »), redonnés en reprise ;
        le Code et les Tests le savent. Banc d'essai du 5 novembre : des conteneurs montés à la main, des commits sans test."""
        main = os.path.join(self.tmp, "main")
        g = ["git", "-c", "user.email=t@t", "-c", "user.name=t"]
        subprocess.run(["git", "clone", "-q", self.origin, main], check=True, capture_output=True)
        os.makedirs(os.path.join(main, "app", "vendor", "pkg"))
        Path(main, "app", "vendor", "pkg", "x.php").write_text("<?php\n")
        Path(main, ".gitignore").write_text(".kronn/\napp/vendor/\n")  # motif de dossier : ne couvre pas un lien
        os.makedirs(os.path.join(main, "node_modules", "m"))
        subprocess.run(g + ["add", ".gitignore"], cwd=main, check=True)
        subprocess.run(g + ["commit", "-qm", "ignore"], cwd=main, check=True)
        wt = os.path.join(self.tmp, "wt2")
        subprocess.run(["git", "worktree", "add", "-q", "--detach", wt], cwd=main, check=True, capture_output=True)
        c = cfg()
        c["impl"]["repos"]["dm/site"]["deps"] = ["app/vendor", "node_modules", "absent"]
        self.render(c)
        self.wt = wt
        subprocess.run(["git", "remote", "set-url", "origin", "https://github.com/dm/site.git"], cwd=main, check=True)
        subprocess.run(["git", "config", f"url.{self.origin}.insteadOf", "https://github.com/dm/site.git"], cwd=main, check=True)
        code, outp = self.sh("prepare", "AB-12", "complet", "run1", stdin=json.dumps(TICKET))
        self.assertEqual(code, 0, outp)
        self.assertIn("dépendances liées : app/vendor, node_modules", outp)
        self.assertTrue(os.path.islink(os.path.join(wt, "app", "vendor")))
        self.assertEqual(os.path.realpath(os.path.join(wt, "app", "vendor")), os.path.realpath(os.path.join(main, "app", "vendor")))
        self.assertTrue(Path(wt, "app", "vendor", "pkg", "x.php").exists())
        self.assertEqual(subprocess.run(["git", "status", "--porcelain"], cwd=wt, capture_output=True, text=True).stdout, "")
        subprocess.run(g + ["add", "-A"], cwd=wt, check=True)  # un agent qui commite tout ne commite pas les liens
        self.assertEqual(subprocess.run(["git", "diff", "--cached", "--name-only"], cwd=wt, capture_output=True, text=True).stdout, "")
        self.assertEqual(self.dossier("etat.json")["deps"], ["app/vendor", "node_modules"])
        self.assertIn("Dépendances déjà là (lance les tests directement)", self.sh("entree", "code", "AB-12")[1])
        self.assertIn("lance les tests directement", self.sh("entree", "tests", "AB-12")[1])
        self.assertNotIn("Dépendances déjà là", self.sh("entree", "regles", "AB-12")[1])
        os.remove(os.path.join(wt, "node_modules"))  # reprise : le lien revient
        e = self.dossier("etat.json")
        e["etape"] = "controles"
        Path(wt, ".kronn", "chaine", "etat.json").write_text(json.dumps(e))
        self.sh("bilan")
        code, outp = self.sh("prepare", "AB-12", "complet", "run2", "", "", "", "oui", stdin=json.dumps(TICKET))
        self.assertEqual(code, 4, outp)
        self.assertTrue(os.path.islink(os.path.join(wt, "node_modules")))

    def test_tests_poste_gets_a_budget_and_the_linked_tests(self):
        """Poste 🧪 Tests moins cher (EW-7848 : 31 min, 65 M de jetons relus en cache, 14,56 $ en un run) : contre-épreuves
        bornées (impl.postes.tests.mutations, 6 par défaut), tests ciblés seulement, tests liés aux fichiers touchés donnés
        d'avance (par le nom)."""
        os.makedirs(os.path.join(self.wt, "tests"))
        os.makedirs(os.path.join(self.wt, "front"))
        self.commit("tests/PartageTest.php", "<?php\n", "test: Partage")
        self.commit("front/share.spec.ts", "x\n", "test: share")
        subprocess.run(["git", "push", "-q", "origin", "HEAD:main"], cwd=self.wt, check=True)
        self.prepare()
        self.commit("app/Partage.php", "<?php\n", "feat: Partage")
        self.commit("front/share.ts", "y\n", "feat: share")
        self.commit("app/Seul.php", "<?php\n", "feat: seul")
        outp = self.sh("entree", "tests", "AB-12")[1]
        self.assertIn("Au plus 6 contre-épreuves", outp)
        self.assertIn("- app/Partage.php : tests/PartageTest.php", outp)
        self.assertIn("- front/share.ts : front/share.spec.ts", outp)
        self.assertNotIn("app/Seul.php :", outp)
        c = cfg()
        c["impl"]["postes"]["tests"] = {"mutations": 3}
        self.render(c)
        self.assertIn("Au plus 3 contre-épreuves", self.sh("entree", "tests", "AB-12")[1])
        self.assertNotIn("Budget du poste", self.sh("entree", "code", "AB-12")[1])
        self.assertIn("dans la limite du budget", steps("impl_tests")["propose"]["prompt_template"])

    def test_tests_poste_gets_a_capped_launcher(self):
        """🧪 Tests : un lanceur prêt (la commande checks.tests du dépôt sur les fichiers donnés), sortie coupée aux échecs,
        lancements comptés et plafonnés (runs du 5 novembre : chaque session cherchait comment lancer les tests)."""
        self.prepare()
        self.assertIn("tail -40", self.sh("entree", "tests", "AB-12")[1])  # sans checks.tests : pas de lanceur
        self.assertFalse(Path(self.wt, ".kronn", "chaine", "teste.py").exists())
        c = cfg()
        c["impl"]["repos"]["dm/site"]["checks"]["tests"] = [{"cmd": "cd {worktree}/app && for f in {tests_php}; do grep -q FAIL $f && "
                                                             "echo progress && echo \"FAILED asserting $f\" && exit 1; done; echo 'OK (1 test)'", "subdir": "app"}]
        c["impl"]["postes"]["tests"] = {"mutations": 1}
        self.render(c)
        self.commit("app/FooTest.php", "<?php // ok\n", "test: Foo")
        outp = self.sh("entree", "tests", "AB-12")[1]
        self.assertIn("python3 .kronn/chaine/teste.py <fichier de test>", outp)
        self.assertIn("6 lancements au plus", outp)  # 2 x 1 mutation + 4
        self.assertIn("Vise 40 réponses", outp)
        lance = lambda *f: subprocess.run(["python3", ".kronn/chaine/teste.py", *f], cwd=self.wt, capture_output=True, text=True)  # noqa: E731
        r = lance("app/FooTest.php")
        self.assertEqual((r.returncode, r.stdout.strip()), (0, "VERT (1/6 lancements) : OK (1 test)"))
        Path(self.wt, "app", "FooTest.php").write_text("<?php // FAIL\n")
        r = lance("app/FooTest.php")
        self.assertEqual(r.returncode, 1)
        self.assertIn("FAILED asserting FooTest.php", r.stdout)
        self.assertNotIn("progress", r.stdout.split("\n…")[0])  # les échecs seulement
        self.assertIn("FAILED", Path(self.wt, ".kronn", "chaine", "teste_sortie.txt").read_text())
        r = lance("app/A.php")  # aucune commande ne prend ce fichier : rien lancé, rien compté
        self.assertIn("Aucune commande", r.stdout)
        self.assertEqual(self.dossier("teste.json")["lances"], 2)
        self.sh("tri_tests", stdin=json.dumps({"ok": False}))  # nouvel essai : quatre lancements de plus
        self.assertEqual(self.dossier("teste.json")["max"], 10)
        t = self.dossier("teste.json")
        Path(self.wt, ".kronn", "chaine", "teste.json").write_text(json.dumps({**t, "lances": 10}))
        r = lance("app/FooTest.php")
        self.assertEqual(r.returncode, 2)
        self.assertIn("Plafond de 10 lancements atteint", r.stdout)
        self.sh("entree", "tests", "AB-12")  # nouveau passage du poste : compteur à zéro
        self.assertEqual(self.dossier("teste.json")["lances"], 0)

    def test_next_rounds_keep_reports_without_blockers(self):
        """Contrôles : chaque sous-agent a son modèle (sécurité sur Opus, les autres sur Sonnet), lit le contexte dans un
        fichier et y écrit son rapport ; aux tours suivants, un poste sans bloquant garde son rapport, la sécurité repasse
        toujours (runs du 5 novembre : les tours 2 et 3 des contrôles faisaient 15 % du coût de la chaîne)."""
        self.prepare()
        g = ["git", "-c", "user.email=t@t", "-c", "user.name=t"]
        Path(self.wt, "app", "A.php").write_text("<?php // v1\n")
        subprocess.run(g + ["commit", "-qam", "v1"], cwd=self.wt, check=True)
        self.sh("bilan_code")
        m = self.sh("missions")[1]
        self.assertIn("regles (modèle sonnet), securite (modèle opus)", m)
        self.assertIn("`.kronn/chaine/controles_contexte.md`", m)
        self.assertIn("Postes à lancer", Path(self.wt, ".kronn", "chaine", "controles_contexte.md").read_text())
        Path(self.wt, ".kronn", "chaine", "rapports", "regles.json").write_text(
            json.dumps({"resume": "r", "constats": [{"gravite": "bloquant", "probleme": "nom"}]}))
        self.sh("range", stdin=json.dumps({"securite": {"resume": "s", "constats": []}, "besoin": {"resume": "b", "constats": [], "exigences": []},
                                           "perf": {"resume": "p", "constats": []}, "doc": {"resume": "d", "constats": [], "docs": []}}))
        self.assertEqual(self.dossier("regles.json")["statut"], "a_corriger")  # lu dans son fichier
        self.sh("bilan_controles")
        self.sh("aiguillage", stdin=json.dumps({"decision": "retour_code", "consignes": "c", "resume": "r"}))
        Path(self.wt, "app", "A.php").write_text("<?php // v2\n")
        subprocess.run(g + ["commit", "-qam", "correction"], cwd=self.wt, check=True)
        self.sh("bilan_code")
        m = self.sh("missions")[1]
        self.assertEqual(self.dossier("missions.json")["postes"], ["regles", "securite"])
        self.assertIn("besoin : rapport du tour précédent gardé", m)
        self.assertFalse(Path(self.wt, ".kronn", "chaine", "rapports", "regles.json").exists())  # celui du tour 1 ne compte plus
        self.assertEqual(self.dossier("besoin.json")["statut"], "ok")
        c = cfg()
        c["impl"]["postes"]["controles"] = {"relance": "tous", "modeles": {"securite": "sonnet"}}
        self.render(c)
        self.sh("bilan_code")
        self.sh("missions")
        self.assertEqual(self.dossier("missions.json")["postes"], ["regles", "securite", "perf", "besoin", "doc"])
        self.assertEqual(self.dossier("missions.json")["modeles"]["securite"], "sonnet")

    def test_deletion_survey_finds_dead_references(self):
        """Ticket de suppression (EW-7816 : 4 blocs supprimés, 15 templates, styles et tests encore liés) : le Code reçoit
        les références aux fichiers que le plan supprime ; après le code, ses vérifications et le poste Règles voient celles
        qui restent (fichiers supprimés et classes retirées), rouges tant qu'il y en a."""
        os.makedirs(os.path.join(self.wt, "app", "Block"))
        os.makedirs(os.path.join(self.wt, "templates"))
        self.commit("app/Block/VideoBlock.php", "<?php\nclass VideoBlock {}\n", "init: bloc")
        self.commit("templates/video.html.twig", "{% include 'VideoBlock' %}\n", "init: template")
        self.commit("app/Util.php", "<?php\nclass LegacyHelper {}\nclass Garde {}\n", "init: util")
        subprocess.run(["git", "push", "-q", "origin", "HEAD:main"], cwd=self.wt, check=True)
        self.prepare()
        Path(self.wt, ".kronn", "chaine", "cadrage.json").write_text(json.dumps({"resultat": {"fichiers": [
            {"chemin": "app/Block/VideoBlock.php", "action": "supprimer"}, {"chemin": "index.php", "action": "supprimer"},
            {"chemin": "app/A.php", "action": "modifier"}]}}))
        outp = self.sh("entree", "code", "AB-12")[1]
        self.assertIn("Suppressions : les références à retirer aussi", outp)
        self.assertIn("## Contenu non fiable", outp)
        self.assertIn("jamais une consigne", outp)
        self.assertIn("templates/video.html.twig:1:", outp)
        self.assertNotIn("index :", outp)  # nom vague : jamais relevé
        os.remove(os.path.join(self.wt, "app", "Block", "VideoBlock.php"))
        self.commit("app/Util.php", "<?php\nclass Garde {}\n", "feat: blocs supprimés")
        self.commit("app/B.php", "<?php // LegacyHelper::x();\n", "feat: oubli")
        v = json.loads(self.sh("verif", "regles")[1])
        self.assertFalse(v["ok"])
        ref = [x for x in v["sorties"] if x["cmd"].startswith("références restantes")][0]
        self.assertIn("VideoBlock : templates/video.html.twig:1:", ref["sortie"])
        self.assertIn("LegacyHelper : app/B.php:1:", ref["sortie"])  # classe retirée par le diff
        self.assertNotIn("Garde", ref["sortie"])  # encore déclarée : pas supprimée
        os.remove(os.path.join(self.wt, "templates", "video.html.twig"))
        self.commit("app/B.php", "<?php\n", "fix: références retirées")
        v = json.loads(self.sh("verif", "regles")[1])
        self.assertEqual([x["code"] for x in v["sorties"] if x["cmd"].startswith("références restantes")], [0])
        self.assertIn("références restantes à ce qui est supprimé", steps("impl_controles")["parallele"]["prompt_template"])

    def test_escalation_in_essai_stops_the_run(self):
        """Mode essai : personne pour trancher, l'escalade arrête le run (refus explicite, bloquants restants notés, bilan
        écrit) au lieu d'une gate. Banc d'essai du 5 novembre : la gate d'EW-7238 approuvée sans regarder, 3 bloquants Doc
        livrés. En plan ou complet, la gate reste."""
        self.prepare()
        Path(self.wt, ".kronn", "chaine", "controles.json").write_text(json.dumps({"bloquants": [
            {"poste": "doc", "fichier": "docs/a.md", "probleme": "la doc dit faux"}], "avis": []}))
        self.assertEqual(self.sh("aiguillage", stdin=json.dumps({"decision": "humain"}))[0], 0)  # complet : la gate
        e = self.dossier("etat.json")
        e["mode"] = "essai"
        Path(self.wt, ".kronn", "chaine", "etat.json").write_text(json.dumps(e))
        code, outp = self.sh("aiguillage", stdin=json.dumps({"decision": "humain"}))
        self.assertEqual(code, 6, outp)
        code, outp = self.sh("fin_essai")
        self.assertEqual(code, 0, outp)
        self.assertIn("Refusé : escalade en essai : bloquants restants 1 (doc)", outp)
        self.assertIn("docs/a.md : la doc dit faux", outp)
        b = json.loads(self.sh("bilan")[1])
        self.assertEqual((b["issue"], b["note_fin"]), ("escalade", "escalade en essai : bloquants restants 1 (doc)"))
        ch = steps("impl_chain")
        self.assertIn({"contains": "exit_6", "action": {"type": "Goto", "step_name": "fin_essai"}}, ch["aiguillage"]["on_result"])
        self.assertEqual(ch["fin_essai"]["on_result"], [{"contains": "OK", "action": {"type": "Stop"}}])  # exit 0 : run réussi

    def test_docs_guard_rejection_with_finished_work_goes_on_to_the_controls(self):
        """Banc d'essai du 5 novembre : Kronn rejette après coup l'étape Agent du Code (garde-fou docs, faux positif
        « secret ») alors que l'agent a rendu status OK et commité. rattrape_code écrit le bilan du Code et saute aux
        contrôles (code 4) ; agent pas fini, aucun commit ou autre panne : code 1, la chaîne échoue comme avant."""
        self.prepare()
        audit = ("Document audit failed. Files and index were preserved; inspect these changes before committing or publishing.\n"
                 "docs/a.md: write rejected: content overlaps with substring from sensitive file \"application/.env\"\n\n"
                 "Agent result:\nLot 2 fait.\n---STEP_OUTPUT---\n{\"data\": {}, \"status\": \"OK\"}\n---END_STEP_OUTPUT---")
        self.assertEqual(self.sh("rattrape_code", stdin=audit)[0], 1)  # aucun commit depuis le départ
        self.commit("docs/a.md", "# doc\n", "docs: a")
        self.assertEqual(self.sh("rattrape_code", stdin=audit.replace('"OK"', '"BLOCKED"'))[0], 1)  # l'agent n'avait pas fini
        self.assertEqual(self.sh("rattrape_code", stdin="API Error: 529 Overloaded")[0], 1)  # autre panne du Code
        Path(self.wt, ".kronn", "chaine", "doc.json").write_text(json.dumps({"poste": "doc", "statut": "ok"}))
        code, outp = self.sh("rattrape_code", stdin=audit)
        self.assertEqual(code, 4, outp)
        rep = self.dossier("code.json")
        self.assertEqual((rep["statut"], rep["docs_rejetees"], len(rep["commits"])), ("ok", ["docs/a.md"], 1))
        self.assertIn("docs rejetées par le garde-fou de Kronn : docs/a.md", rep["note"])
        self.assertEqual(self.dossier("etat.json")["etape"], "controles")
        self.assertEqual((self.dossier("etat.json")["rattrapages"]), 1)
        self.assertTrue(Path(self.wt, ".kronn", "chaine", "precedent_doc.json").exists())  # nouveau code : contrôles à refaire
        self.assertIn("docs/a.md", self.sh("missions")[1].split("Docs rejetées par le garde-fou de Kronn")[1])
        self.assertIn("Docs rejetées par le garde-fou", self.sh("entree", "livraison", "AB-12")[1])
        Path(self.wt, ".kronn", "chaine", "controles.json").write_text(json.dumps({"bloquants": [], "avis": []}))
        code, outp = self.sh("pr", stdin=json.dumps({"title": "t", "body": "corps <!-- bureau-points -->"}))
        self.assertIn("`docs/a.md` : doc refusée par le garde-fou de Kronn", Path(self.wt, ".kronn", "chaine", "pr_body.md").read_text())

    def test_checks_only_count_new_errors(self):
        """Une vérification rouge est relancée sur le point de départ : ce qui y était déjà rouge ne compte pas (essai
        d'EW-6550 : PHPStan signalait des erreurs anciennes des fichiers touchés et le Code bouclait dessus)."""
        c = cfg()
        c["impl"]["repos"]["dm/site"]["checks"]["regles"] = [{"cmd": "cd {worktree}/app && grep -n TODO {php} && exit 1 || exit 0", "subdir": "app"}]
        self.render(c)
        g = ["git", "-c", "user.email=t@t", "-c", "user.name=t"]
        Path(self.wt, "app", "A.php").write_text("<?php // TODO ancien\n")
        subprocess.run(g + ["commit", "-qam", "dette"], cwd=self.wt, check=True)
        subprocess.run(["git", "push", "-q", "origin", "main"], cwd=self.wt, check=True)
        self.prepare()
        Path(self.wt, "app", "A.php").write_text("<?php // TODO ancien\n$x = 1;\n")
        res = json.loads(self.sh("verif", "regles")[1])
        self.assertTrue(res["ok"], res)  # rouge, mais déjà rouge au départ
        self.assertTrue(res["sorties"][0]["deja_la"])
        Path(self.wt, "app", "A.php").write_text("<?php // TODO ancien\n// TODO nouveau\n")
        res = json.loads(self.sh("verif", "regles")[1])
        self.assertFalse(res["ok"], res)
        self.assertIn("TODO nouveau", " ".join(res["sorties"][0]["nouveau"]))

    def test_next_round_rereads_the_correction(self):
        """Tour suivant : tous les contrôles repassent, en relisant surtout la correction, avec leur rapport précédent."""
        self.prepare()
        g = ["git", "-c", "user.email=t@t", "-c", "user.name=t"]
        Path(self.wt, "app", "A.php").write_text("<?php // v1\n")
        subprocess.run(g + ["commit", "-qam", "v1"], cwd=self.wt, check=True)
        self.sh("bilan_code")
        self.sh("missions")
        self.sh("range", stdin=json.dumps({"regles": {"resume": "r", "constats": [{"gravite": "bloquant", "probleme": "nom"}]},
                                           "securite": {"resume": "s", "constats": []}, "besoin": {"resume": "b", "constats": [], "exigences": []}}))
        self.assertNotIn("Tour suivant", self.sh("entree", "besoin", "AB-12")[1])  # premier tour
        self.sh("bilan_controles")
        self.assertNotIn("Tour suivant", self.sh("entree", "besoin", "AB-12")[1])  # rien de corrigé depuis
        Path(self.wt, "app", "A.php").write_text("<?php // v2\n")
        subprocess.run(g + ["commit", "-qam", "correction"], cwd=self.wt, check=True)
        self.sh("bilan_code")
        self.assertTrue(os.path.exists(os.path.join(self.wt, ".kronn", "chaine", "precedent_regles.json")))
        m = self.sh("missions")[1]
        self.assertIn("Tour suivant, poste regles : la correction", m)
        self.assertIn("app/A.php", m)
        self.assertIn('"probleme": "nom"', m)  # son rapport précédent
        self.assertIn("Juge le résultat d'ensemble", m)  # besoin : tout le diff

    def test_doc_poste_gets_the_doc_survey_and_blocks(self):
        """📚 Doc : le relevé (0 token) dit quelles docs citent un fichier ou un symbole touché, lesquelles le diff a déjà
        changées (lignes + et -) et quels fichiers aucune doc ne cite ; une doc à mettre à jour est bloquante."""
        g = ["git", "-c", "user.email=t@t", "-c", "user.name=t"]
        Path(self.wt, "app", "Share.php").write_text("<?php\nfunction oldShare() {}\n")
        Path(self.wt, "docs", "partage.md").write_text("Le bouton appelle `oldShare` (app/Share.php).\n")
        Path(self.wt, "README.md").write_text("# site\n\nVoir Share.php.\n")
        Path(self.wt, "guide").mkdir()
        Path(self.wt, "guide", "faq.md").write_text("oldShare\n")  # hors des docs relevées par défaut
        subprocess.run(g + ["add", "-A"], cwd=self.wt, check=True)
        subprocess.run(g + ["commit", "-qm", "partage"], cwd=self.wt, check=True)
        subprocess.run(["git", "push", "-q", "origin", "main"], cwd=self.wt, check=True)
        self.prepare()
        Path(self.wt, "app", "Share.php").write_text("<?php\nfunction shareButton() {}\n")
        Path(self.wt, "app", "Autre.php").write_text("<?php\n")
        Path(self.wt, "docs", "AGENTS.md").write_text("# règles\n\nshareButton remplace l'ancien.\nDeux lignes.\n")
        subprocess.run(g + ["add", "-A"], cwd=self.wt, check=True)
        subprocess.run(g + ["commit", "-qm", "v1"], cwd=self.wt, check=True)
        self.sh("bilan_code")
        m = self.sh("missions")[1]
        self.assertIn("doc", self.dossier("missions.json")["postes"])  # bloquant : toujours lancé
        r = json.loads(m.split("## Relevé de la doc (0 token, pour le poste doc)\n\n")[1].split("\n\n## ")[0])
        self.assertEqual(r["modifiees"], [{"doc": "docs/AGENTS.md", "ajout": 3, "retrait": 0}])
        cites = {x["doc"]: x for x in r["citent_le_diff"]}
        self.assertEqual(cites["docs/partage.md"]["cite"]["app/Share.php"], ["app/Share.php", "Share.php", "oldShare"])  # symbole retiré
        self.assertIn("Share.php", cites["README.md"]["cite"]["app/Share.php"])
        self.assertTrue(cites["docs/AGENTS.md"]["modifiee"])  # cite shareButton, déjà mise à jour
        self.assertNotIn("guide/faq.md", cites)
        self.assertEqual(r["sans_doc"], ["app/Autre.php"])
        self.sh("range", stdin=json.dumps({"doc": {"resume": "une doc fausse", "docs": [
            {"doc": "docs/partage.md", "etat": "a_mettre_a_jour", "detail": "cite oldShare"}],
            "constats": [{"gravite": "bloquant", "fichier": "docs/partage.md", "ligne": 1, "probleme": "cite oldShare",
                          "correction": "écrire shareButton"}]}}))
        self.assertEqual(self.dossier("doc.json")["statut"], "a_corriger")
        self.assertEqual(self.dossier("doc.json")["resultat"]["docs"][0]["etat"], "a_mettre_a_jour")
        b = json.loads(self.sh("bilan_controles")[1])
        self.assertEqual([x["poste"] for x in b["bloquants"]], ["doc"])
        self.assertEqual(b["postes"]["doc"], "a_corriger")
        e = self.dossier("etat.json")
        e["mode"] = "essai"
        Path(self.wt, ".kronn", "chaine", "etat.json").write_text(json.dumps(e))
        self.sh("pr", stdin=json.dumps({"title": "t", "body": "x"}))  # resté après une escalade approuvée : dans la PR
        self.assertIn("**Bloquant** (📚 doc) `docs/partage.md:1` : cite oldShare ; piste : écrire shareButton",
                      Path(self.wt, ".kronn", "chaine", "pr_body.md").read_text())

    def test_doc_poste_settings(self):
        """impl.repos.<dépôt>.docs ajoute des docs au relevé ; impl.postes.doc.bloquant false en fait un avis ; actif false
        le coupe."""
        c = cfg()
        c["impl"]["repos"]["dm/site"]["docs"] = ["guide"]
        c["impl"]["postes"]["doc"] = {"bloquant": False}
        self.render(c)
        g = ["git", "-c", "user.email=t@t", "-c", "user.name=t"]
        Path(self.wt, "guide").mkdir()
        Path(self.wt, "guide", "faq.md").write_text("Voir A.php.\n")
        subprocess.run(g + ["add", "-A"], cwd=self.wt, check=True)
        subprocess.run(g + ["commit", "-qm", "guide"], cwd=self.wt, check=True)
        subprocess.run(["git", "push", "-q", "origin", "main"], cwd=self.wt, check=True)
        self.prepare()
        Path(self.wt, "app", "A.php").write_text("<?php // x\n")
        subprocess.run(g + ["commit", "-qam", "v1"], cwd=self.wt, check=True)
        self.sh("bilan_code")
        self.assertIn('"doc": "guide/faq.md"', self.sh("missions")[1])
        self.sh("range", stdin=json.dumps({"doc": {"resume": "r", "constats": [{"gravite": "bloquant", "probleme": "faq"}]}}))
        self.assertEqual(self.dossier("doc.json")["statut"], "ok")  # poste non bloquant : un avis
        self.assertEqual([x["poste"] for x in json.loads(self.sh("bilan_controles")[1])["avis"]], ["doc"])
        c["impl"]["postes"]["doc"] = {"actif": False}
        self.render(c)
        self.sh("bilan_code")
        self.assertNotIn("doc", self.sh("missions")[1].split("## Postes à lancer")[1].split("Écartés")[0])
        self.assertEqual(self.dossier("doc.json")["statut"], "non_concerne")

    def test_checks_run_on_changed_files_relative_to_subdir(self):
        self.prepare()
        Path(self.wt, "app", "A.php").write_text("<?php // x\n")
        code, outp = self.sh("verif", "regles")
        res = json.loads(outp)
        self.assertTrue(res["ok"], outp)
        self.assertIn("verif A.php", res["sorties"][0]["sortie"])
        self.assertIn("aucune vérification", json.loads(self.sh("verif", "tests")[1])["note"])

    def test_run_bilan_is_kept_in_the_history(self):
        """Après chaque étape, le bilan du run est réécrit hors du cache de reprise (page « Chaîne · bilan ») : tours,
        retours humains et leur cause, schéma prévu contre fichiers touchés, diff par sorte, contrôles trouvés et corrigés."""
        self.prepare()
        # le poste Plan porte le schéma d'impact (fichiers prévus, mermaid) ; un retour à la gate du plan lui revient
        self.sh("rapport", "cadrage", stdin=json.dumps({"resume": "r", "comprehension": "Un bouton partager", "mermaid": "flowchart LR\n A-->B",
                                                        "fichiers": [{"chemin": "app/A.php", "action": "modifier"}, {"chemin": "app/B.php", "action": "creer"},
                                                                     {"chemin": "docs/AGENTS.md", "action": "lire"}]}) + SEP + "null")
        self.sh("entree", "cadrage", "AB-12", "Ne touche pas au pied de page, hors périmètre")
        self.sh("plan", "", "", stdin=json.dumps({"lots": [{"titre": "le bouton"}], "postes": []}))
        Path(self.wt, "app", "A.php").write_text("<?php // partager\n")
        Path(self.wt, "tests").mkdir()
        Path(self.wt, "tests", "ATest.php").write_text("<?php\n")
        Path(self.wt, "docs", "partage.md").write_text("# Partager\n\nLe bouton.\n")
        g = ["git", "-c", "user.email=t@t", "-c", "user.name=t"]
        subprocess.run([*g, "add", "-A"], cwd=self.wt, check=True)
        subprocess.run([*g, "commit", "-qm", "bouton"], cwd=self.wt, check=True)
        self.sh("tri_code", stdin=json.dumps({"ok": True}) + SEP + json.dumps({"verdict": "ok"}))
        self.sh("bilan_code")
        bl = {"resume": "s", "constats": [{"gravite": "bloquant", "probleme": "XSS ligne 3", "fichier": "app/A.php"}]}
        self.sh("rapport", "securite", stdin=json.dumps(bl) + SEP + "null")
        self.sh("rapport", "perf", stdin=json.dumps({"resume": "s", "constats": [{"gravite": "mineur", "probleme": "nom"}]}) + SEP + "null")
        self.sh("bilan_controles")
        self.sh("aiguillage", stdin=json.dumps({"decision": "retour_code", "consignes": "XSS", "resume": "r"}))
        self.sh("bilan_code")  # tour 2 : la XSS est corrigée, l'avis de perf reste
        self.sh("rapport", "securite", stdin=json.dumps({"resume": "s", "constats": []}) + SEP + "null")
        self.sh("rapport", "perf", stdin=json.dumps({"resume": "s", "constats": [{"gravite": "mineur", "probleme": "nom"}]}) + SEP + "null")
        self.sh("bilan_controles")
        self.sh("aiguillage", stdin=json.dumps({"decision": "livrer", "resume": "Livré après une correction"}))
        path = Path(self.tmp, "home", ".local", "share", "pixel-bureau", "historique", "AB-12", "dm__site", "run1.json")
        b = json.loads(path.read_text())
        self.assertEqual((b["ticket"], b["repo"], b["run"], b["titre"], b["essai"]), ("AB-12", "dm/site", "run1", "Bouton partager sur la fiche", False))
        self.assertEqual(b["tours"], {"propositions": {}, "essais_code": 1, "controles": 2, "escalades": 0})  # plus de critique
        self.assertEqual((b["retours"]["n"], b["retours"]["par_gate"], b["retours"]["par_cause"]), (1, {"plan": 1}, {"perimetre": 1}))
        s = b["schema"]
        self.assertEqual((s["prevus"], s["prevus_touches"], s["prevus_non_touches"]), (["app/A.php", "app/B.php"], 1, ["app/B.php"]))
        self.assertEqual(s["touches_non_prevus"], ["docs/partage.md", "tests/ATest.php"])
        self.assertIn("flowchart", s["mermaid"])
        self.assertEqual({k: v["fichiers"] for k, v in b["diff"].items()}, {"code": 1, "tests": 1, "doc": 1})
        self.assertEqual(b["doc"]["fichiers"], [{"fichier": "docs/partage.md", "plus": 3, "moins": 0}])
        self.assertEqual(b["controles"]["securite"]["bloquants"], {"trouves": 1, "corriges": 1, "restes": 0})
        self.assertEqual(b["controles"]["perf"]["avis"], {"trouves": 1, "corriges": 0, "restes": 1})
        self.assertEqual((b["plan"]["lots"], b["resume"]["comprehension"], b["resume"]["decision"]), (1, "Un bouton partager", "livrer"))
        self.assertEqual((b["etape"], b["issue"]), ("livraison", "en_cours"))
        self.assertEqual(set(b["version"]), {"hash", "commit", "sujet"})  # injectée au rendu du script
        debut = b["debut"]
        self.sh("fin")  # relecture : PR en brouillon ; le début du run est gardé d'une écriture à l'autre
        b = json.loads(path.read_text())
        self.assertEqual((b["issue"], b["debut"]), ("pr_brouillon", debut))
        e = self.dossier("etat.json")  # un id de run tordu reste dans le dossier de l'historique
        e["run"] = "run1/../../x"
        Path(self.wt, ".kronn", "chaine", "etat.json").write_text(json.dumps(e))
        self.assertEqual(self.sh("bilan")[0], 0)
        self.assertTrue(path.with_name("run1_.._.._x.json").exists())
        self.assertEqual(self.sh("mode", "plan")[0], 4)  # plan seulement : le run s'arrête au commentaire Jira
        self.assertEqual(json.loads(path.with_name("run1_.._.._x.json").read_text())["issue"], "plan_seul")

    def test_controls_dispatch_and_orchestrator_rounds(self):
        self.prepare()
        Path(self.wt, "app", "A.php").write_text("<?php // x\n")
        self.sh("plan", "", "", stdin=json.dumps({"lots": [], "postes": ["regles"]}))
        q = json.loads(self.sh("quoi")[1])["postes"]
        self.assertNotIn("revue", q)  # plus de revue croisée
        self.assertTrue(q["securite"]["actif"])  # bloquant : jamais écarté par le plan
        self.assertFalse(q["perf"]["actif"])  # écarté par le plan (il tourne sinon sur tout diff : cache HTTP)
        self.sh("missions")
        self.assertEqual(self.dossier("perf.json")["statut"], "non_concerne")
        self.sh("rapport", "securite", stdin=json.dumps({"resume": "s", "constats": [{"gravite": "bloquant", "probleme": "XSS"}]}) + SEP + "null")
        self.sh("rapport", "perf", stdin=json.dumps({"resume": "s", "constats": [{"gravite": "bloquant", "probleme": "lent"}]}) + SEP + "null")
        b = json.loads(self.sh("bilan_controles")[1])
        self.assertEqual([x["poste"] for x in b["bloquants"]], ["securite"])  # perf : un avis, pas un poste bloquant
        self.assertNotIn("revue", b["postes"])
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
        import chaine_pr as chaine
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
            return {"step_results": ([{"step_name": "prepare", "output": r["prep"]}] if r["prep"] else []) + r.get("steps", [])}
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

    def test_missing_project_is_found_or_cloned_then_added(self):
        """Un dépôt sans projet Kronn : sa copie locale dans le dossier des clones est ajoutée à Kronn ; sans copie, clonée
        seulement avec impl.auto_projet."""
        clones = tempfile.mkdtemp()
        subprocess.run(["git", "init", "-q", os.path.join(clones, "app")], check=True)
        subprocess.run(["git", "-C", os.path.join(clones, "app"), "remote", "add", "origin", "git@github.com:dm/app.git"], check=True)
        self.c.CFG["impl"]["clones"] = clones
        added = []
        self.c.send = lambda m, p, body=None, timeout=30: (added.append(body) or {"data": {"id": "p3"}}) if p == "/projects/add-folder" \
            else self.sent.append(body) or {"run_id": "r"}
        code, outp = self.lance(["site", "app", "outil"])
        self.assertEqual(added, [{"path": os.path.join(clones, "app")}])
        self.assertEqual([b["project_id"] for b in self.sent], ["p1", "p3"])
        self.assertIn("copie locale trouvée", outp)
        self.assertIn("dm/outil : aucun projet Kronn", outp)  # pas de copie, pas d'auto_projet : signalé, pas cloné
        self.assertIn("impl.auto_projet", outp)
        import shutil
        shutil.rmtree(clones, ignore_errors=True)

    def test_guard_is_per_ticket_and_repo_and_resumes_after_a_failure(self):
        self.runs = [{"id": "a", "status": "Running", "started_at": "2", "prep": "AB-12 sur dm/site : branche kronn/AB-12"},
                     {"id": "b", "status": "Failed", "started_at": "1", "prep": "AB-12 sur dm/api : branche kronn/AB-12"}]
        code, outp = self.lance(["site", "API"])
        self.assertIn("dm/site : déjà sur la chaîne", outp)
        self.assertEqual([(b["variables"]["depot"], b["variables"]["reprise"]) for b in self.sent], [("dm/api", "oui")])
        self.sent.clear()
        self.runs[1]["steps"] = [{"step_name": "gate_plan", "status": "Failed"}]  # rejeté à ta gate : pas de reprise
        self.lance(["API"])
        self.assertEqual(self.sent[0]["variables"]["reprise"], "non")
        del self.runs[1]["steps"]
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

    def setUp(self):  # la cause des runs finis est gardée dans un fichier : jamais celui de ~/.cache pendant les tests
        sys.path.insert(0, os.path.join(ROOT, "workflows"))
        import atelier_snapshot as a
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(setattr, a, "CAUSES", a.CAUSES)
        a.CAUSES = os.path.join(self.tmp, "causes.json")

    def snap(self, api, models, now="2026-10-30T12:00:00+00:00", ui=None):
        import atelier_snapshot as a
        old = (a.get, dict(a.CFG))
        a.get = api if callable(api) else (lambda p: api.get(p))
        a.CFG.update(models=models, **({"kronn": {"ui": ui}} if ui else {}))
        try:
            return a.snapshot(now)
        finally:
            a.get = old[0]
            a.CFG.clear()
            a.CFG.update(old[1])

    def test_cause_in_one_line_and_its_type(self):
        """La cause d'une panne : une ligne, classée ; le garde-fou docs dit si l'agent avait fini (status OK)."""
        import atelier_snapshot as a
        env = lambda d, st="ERROR": "---STEP_OUTPUT---\n" + json.dumps({"data": d, "status": st}) + "\n---END_STEP_OUTPUT---"  # noqa: E731
        docs = ("Document audit failed. Files and index were preserved; inspect these changes before committing or publishing.\n"
                "docs/a.md: write rejected: content overlaps with substring from sensitive file \"application/.env\"\n"
                "docs/b.md: write rejected: content has a 32+ char high-entropy run (possible credential; content withheld)\n\n"
                "Agent result:\nLot 6 fait.\n---STEP_OUTPUT---\n{\"data\": {}, \"status\": \"OK\"}\n---END_STEP_OUTPUT---")
        c = a.cause({"step_name": "code", "status": "Failed", "step_kind": "Agent", "output": docs})
        self.assertEqual(c, {"cause": "garde-fou docs de Kronn : docs/a.md refusé (ressemble à un extrait d'un fichier sensible), et 1 autre(s)",
                             "cause_type": "garde_fou_docs", "docs_ok": True})
        self.assertFalse(a.cause({"step_name": "code", "status": "Failed", "output": docs.replace('"OK"', '"BLOCKED"')})["docs_ok"])
        self.assertEqual(a.cause({"step_name": "__guard_timeout__", "status": "StoppedByGuard"},
                                 hint="Stopped by Timeout guard: 16615s elapsed (limit 7200s)"),
                         {"cause": "délai dépassé, arrêté par Kronn (4 h 36 pour 2 h 00 permises)", "cause_type": "delai"})
        self.assertEqual(a.cause({"step_name": "verif", "status": "Failed", "step_kind": "Exec",
                                  "output": "exit 2\n\n" + env({"exit_code": 2, "stderr": "Traceback\n  x\nKeyError: 'base'\n", "stdout": ""})}),
                         {"cause": "script en erreur (exit 2) : KeyError: 'base'", "cause_type": "script"})
        self.assertEqual(a.cause({"step_name": "code", "status": "Failed", "step_kind": "Agent", "output": "API Error: 529 Overloaded"})["cause_type"], "agent")
        self.assertEqual(a.cause({"step_name": "ticket", "status": "Failed", "step_kind": "ApiCall", "output": "HTTP 404 issue absente"}),
                         {"cause": "appel d'API en échec : HTTP 404 issue absente", "cause_type": "agent"})
        self.assertEqual(a.cause({"step_name": "plan", "status": "Failed", "step_kind": "Agent", "output": "Le plan n'a pas de lot."}),
                         {"cause": "Le plan n'a pas de lot.", "cause_type": "autre"})
        self.assertEqual(a.cause(None, {"status": "Cancelled"})["cause"], "run annulé")

    def test_panne_goes_down_to_the_deepest_failed_run_and_links_to_it(self):
        """La panne d'un run de la chaîne : la cause vient de l'étape en échec du sous-run (child_workflow_id de la sortie
        SubWorkflow), le lien ouvre ce run-là dans Kronn ; la cause d'un run fini est gardée (plus relue)."""
        import atelier_snapshot as a
        prep = {"step_name": "prepare", "status": "Success", "output": "AB-1 sur dm/site : branche kronn/AB-1"}
        sub = ("---STEP_OUTPUT---\n" + json.dumps({"data": {"child_run_id": "k1", "child_workflow_id": "code", "child_status": "StoppedByGuard",
               "last_output": "Stopped by Timeout guard: 9000s elapsed (limit 7200s)", "last_step": "__guard_timeout__"}}) + "\n---END_STEP_OUTPUT---")
        f1 = {"id": "f1", "workflow_id": "c", "status": "Failed", "started_at": "2026-10-30T09:00:00Z", "step_results": [
            prep, {"step_name": "code", "status": "Failed", "output": sub, "started_at": "2026-10-30T09:10:00Z"}]}
        k1 = {"id": "k1", "status": "StoppedByGuard", "step_results": [
            {"step_name": "entree", "status": "Failed", "condition_result": "Goto:plan"}, {"step_name": "code", "status": "Success"},
            {"step_name": "__guard_timeout__", "status": "StoppedByGuard"}]}
        reads = []
        api = {"/workflows/c/runs?limit=40": [{k: v for k, v in f1.items() if k != "step_results"}], "/workflows/c/runs/f1": f1,
               "/workflows/code/runs/k1": k1, "/workflows/code/runs?limit=60": []}
        get = lambda p: (reads.append(p), api.get(p))[1]  # noqa: E731
        snap = self.snap(get, {"impl_chain": "c", "impl_code": "code"}, ui="http://k:5173/")
        p = snap["pannes"][0]
        self.assertEqual((p["poste"], p["cause_type"], p["cause"], p["url"]),
                         ("code", "delai", "délai dépassé, arrêté par Kronn (2 h 30 pour 2 h 00 permises)", "http://k:5173/workflows/code/runs/k1"))
        self.assertEqual([(e["k"], e.get("cause_type")) for e in snap["events"] if e["k"] == "panne"], [("panne", "delai")])
        self.assertIn("/workflows/code/runs/k1", reads)
        reads.clear()
        self.snap(get, {"impl_chain": "c", "impl_code": "code"}, ui="http://k:5173/")
        self.assertNotIn("/workflows/code/runs/k1", reads)  # cause gardée : le sous-run n'est plus relu

    def test_rattrape_keeps_the_code_failure_as_the_cause(self):
        """Le Code en échec saute à rattrape : si elle refuse, la panne est celle du Code ; si elle rattrape (garde-fou
        docs de Kronn, travail fini), le Code est fait."""
        import atelier_snapshot as a
        code = {"step_name": "code", "status": "Failed", "condition_result": "Goto:rattrape", "output": "x"}
        refus = {"step_name": "rattrape", "status": "Failed", "output": "exit 1"}
        self.assertIs(a.failed_step({"step_results": [code, refus]}), code)
        ok = {"step_name": "rattrape", "status": "Failed", "condition_result": "Goto:controles"}
        orch = {"step_name": "orchestrateur", "status": "Failed", "output": "API Error"}
        self.assertIs(a.failed_step({"step_results": [code, ok, {"step_name": "controles", "status": "Success"}, orch]}), orch)

    def test_runs_of_the_day_counted_by_ticket(self):
        """Tableau « Runs du jour » : depuis minuit (fuseau du bureau), par ticket et dépôt, les reprises à part ; une gate
        refusée n'est pas une panne ; le ticket d'un run est lu une fois (gardé avec les causes)."""
        import atelier_snapshot as a
        prep = lambda t: {"step_name": "prepare", "status": "Success", "output": f"{t} sur dm/site : x"}  # noqa: E731
        R = lambda i, t, st, at, steps=(), tok=1000: {"id": i, "workflow_id": "c", "status": st, "started_at": at, "tokens_used": tok,  # noqa: E731
                                                     "step_results": [prep(t), *steps]}
        runs = [R("a1", "AB-1", "Failed", "2026-10-30T01:00:00Z", [{"step_name": "code", "status": "Failed"}]),
                R("a2", "AB-1", "Running", "2026-10-30T06:00:00Z"),
                R("b1", "AB-2", "Success", "2026-10-30T02:00:00Z", [{"step_name": "livraison", "status": "Success"}]),
                R("c1", "AB-3", "Failed", "2026-10-30T03:00:00Z", [{"step_name": "gate_plan", "status": "Failed"}]),
                R("v", "AB-9", "Success", "2026-10-29T20:00:00Z", [{"step_name": "livraison", "status": "Success"}])]  # avant minuit (Paris)
        api = {"/workflows/c/runs?limit=40": runs, "/workflows/c/runs?limit=50&offset=0": runs, **{f"/workflows/c/runs/{r['id']}": r for r in runs}}
        snap = self.snap(api, {"impl_chain": "c"})
        self.assertEqual(snap["jour"], {"tickets": 3, "cours": 1, "sortis": 1, "pannes": 1, "reprises": 1, "tok": 4000})

    def test_room_says_which_step_runs_and_what_its_agent_does(self):
        """Un bureau sans poste en cours (l'orchestrateur écrit le plan) dit l'étape qui tourne ; act = last_activity de
        l'agent au travail, cherché dans le sous-run quand l'étape est un sous-workflow (le Code)."""
        prep = {"step_name": "prepare", "status": "Success", "output": "AB-7 sur dm/site : branche kronn/AB-7"}
        act = {"category": "Execute", "at": "2026-10-30T11:59:40Z", "calls": 18}
        plan = {"id": "p1", "workflow_id": "c", "status": "Running", "started_at": "2026-10-30T11:50:00Z", "step_results": [
            prep, {"step_name": "cadrage", "status": "Success"},
            {"step_name": "orchestrateur_plan", "status": "Running", "step_kind": "Agent", "last_activity": act}]}
        code = {"id": "p2", "workflow_id": "c", "status": "Running", "started_at": "2026-10-30T11:00:00Z", "step_results": [
            prep, {"step_name": "cadrage", "status": "Success"}, {"step_name": "gate_plan", "status": "Success"},
            {"step_name": "code", "status": "Running", "step_kind": "SubWorkflow"}]}
        kid = {"id": "k2", "status": "Running", "parent_run_id": "p2", "step_results": [
            {"step_name": "affecter", "status": "Success"},
            {"step_name": "code", "status": "Running", "last_activity": {"category": "Read", "at": "2026-10-30T11:58:00Z", "calls": 142}}]}
        api = {"/workflows/c/runs?limit=40": [{k: v for k, v in r.items() if k != "step_results"} for r in (plan, code)],
               "/workflows/c/runs/p1": plan, "/workflows/c/runs/p2": code,
               "/workflows/code/runs?limit=60": [{"id": "k2", "parent_run_id": "p2"}], "/workflows/code/runs/k2": kid}
        rooms = {r["run"]: r for r in self.snap(api, {"impl_chain": "c", "impl_code": "code"})["rooms"]}
        self.assertEqual((rooms["p1"]["poste"], rooms["p1"]["etape"], rooms["p1"]["act"]),
                         (None, "orchestrateur_plan", {"cat": "Execute", "n": 18, "at": "2026-10-30T11:59:40Z"}))
        self.assertEqual((rooms["p2"]["poste"], rooms["p2"]["etape"], rooms["p2"]["act"]["n"]), ("code", "code", 142))

    def test_resumed_run_shows_earlier_postes_and_why(self):
        """Run repris (prepare saute aux contrôles) : Plan, gate et Code « rep » (pas « attend son tour »), après quelle panne ;
        le saut de prepare n'est pas une panne dans le fil."""
        import atelier_snapshot as a
        doc = ("Document audit failed. Files and index were preserved.\ndocs/x.md: write rejected: content has a 32+ char high-entropy run\n"
               "Agent result:\n{\"status\": \"OK\"}")
        prep = lambda t: {"step_name": "prepare", "status": "Success", "output": f"AB-9 sur dm/site : {t}"}  # noqa: E731
        old = {"id": "o1", "workflow_id": "c", "status": "Failed", "started_at": "2026-10-30T08:00:00Z", "step_results": [
            prep("branche kronn/AB-9"), {"step_name": "code", "status": "Failed", "step_kind": "Agent", "output": doc,
                                           "started_at": "2026-10-30T08:10:00Z"}]}
        new = {"id": "n1", "workflow_id": "c", "status": "Running", "started_at": "2026-10-30T09:00:00Z", "step_results": [
            {**prep("reprise aux contrôles"), "status": "Failed", "condition_result": "Goto:controles", "started_at": "2026-10-30T09:00:00Z"},
            {"step_name": "controles", "status": "Running"}]}
        api = {"/workflows/c/runs?limit=40": [{k: v for k, v in r.items() if k != "step_results"} for r in (old, new)],
               "/workflows/c/runs/o1": old, "/workflows/c/runs/n1": new, "/workflows/k/runs?limit=60": []}
        snap = self.snap(api, {"impl_chain": "c", "impl_controles": "k"})
        r = snap["rooms"][0]
        self.assertEqual({k: r["states"].get(k) for k in ("cadrage", "gate", "code")}, {"cadrage": "rep", "gate": "rep", "code": "rep"})
        self.assertEqual((r["reprise"]["poste"], r["reprise"]["de"], r["reprise"]["panne"], r["reprise"]["cause_type"]),
                         ("controles", "o1", "code", "garde_fou_docs"))
        self.assertEqual(snap["pannes"], [])  # repris : plus en panne
        self.assertEqual([e["run"] for e in snap["events"] if e["k"] == "panne"], ["o1"])

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
        # règles, sécurité, perf : verdicts dans la sortie de range (sous-agents en parallèle)
        rng = '{"postes": {"regles": "ok", "securite": "a_corriger", "perf": "non_concerne"}}'
        ctrl = {"id": "k", "parent_run_id": "r1", "step_results": [
            {"step_name": "missions", "status": "Success", "output": "x\n\n## Postes à lancer\n\nregles, securite\n\n## Ticket"},
            {"step_name": "parallele", "status": "Success"},
            {"step_name": "range", "status": "Success", "output": "---STEP_OUTPUT---\n" + json.dumps({"data": {"stdout": rng}})}]}
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

    def test_failed_runs_wait_to_be_resumed(self):
        """Pannes : un run en échec des dernières 24 h, une par ticket et dépôt, tant qu'aucun run plus récent ne l'a repris."""
        sys.path.insert(0, os.path.join(ROOT, "workflows"))
        import atelier_snapshot as a
        prep = lambda t, r: {"step_name": "prepare", "status": "Success", "output": f"{t} sur {r} : branche kronn/{t}"}  # noqa: E731
        runs = {"f1": {"id": "f1", "workflow_id": "c", "status": "Failed", "started_at": "2026-10-30T09:00:00Z", "step_results": [
                    prep("AB-1", "dm/site"), {"step_name": "cadrage", "status": "Success"}, {"step_name": "controles", "status": "Failed"}]},
                "f2": {"id": "f2", "status": "Failed", "started_at": "2026-10-30T08:00:00Z", "step_results": [
                    prep("AB-2", "dm/api"), {"step_name": "orchestrateur_plan", "status": "Failed"}]},
                "f3": {"id": "f3", "status": "Failed", "started_at": "2026-10-30T07:00:00Z", "step_results": [prep("AB-3", "dm/api")]},
                "s3": {"id": "s3", "status": "Success", "started_at": "2026-10-30T07:30:00Z", "step_results": [prep("AB-3", "dm/api")]},
                "rej": {"id": "rej", "status": "Failed", "started_at": "2026-10-30T06:00:00Z", "step_results": [
                    prep("AB-5", "dm/api"), {"step_name": "gate_plan", "status": "Failed"}]},
                "old": {"id": "old", "status": "Failed", "started_at": "2026-10-28T07:00:00Z", "step_results": [prep("AB-4", "dm/api")]}}
        ctrl = {"id": "k", "parent_run_id": "f1", "step_results": [{"step_name": "securite", "status": "Failed"}]}
        api = {"/workflows/c/runs?limit=40": [{k: v for k, v in r.items() if k != "step_results"} for r in runs.values()],
               "/workflows/k/runs?limit=60": [ctrl], "/workflows/k/runs/k": ctrl, **{f"/workflows/c/runs/{k}": v for k, v in runs.items()}}
        old = (a.get, dict(a.CFG))
        a.get = lambda p: api.get(p)
        a.CFG.update(models={"impl_chain": "c", "impl_controles": "k"})
        try:
            snap = a.snapshot("2026-10-30T12:00:00+00:00")
        finally:
            a.get = old[0]
            a.CFG.clear()
            a.CFG.update(old[1])
        self.assertEqual([(p["ticket"], p["repo"], p["poste"]) for p in snap["pannes"]],
                         [("AB-1", "dm/site", "securite"), ("AB-2", "dm/api", "orchestrateur_plan")])  # AB-3 repris, AB-5 rejeté à ta gate, AB-4 trop vieux

    def test_events_for_the_ground_floor_feed(self):
        """Fil du RDC et rejeu du 1er : arrivée, postes, gate, retour au Code, panne et PR ouverte, datés par les étapes ; une gate refusée n'est pas
        une panne ; livres = PR ouvertes depuis minuit (fuseau du bureau), un run de plus de 24 h ne compte pas."""
        sys.path.insert(0, os.path.join(ROOT, "workflows"))
        import atelier_snapshot as a
        prep = {"step_name": "prepare", "status": "Success", "output": "AB-7 sur dm/site : branche kronn/AB-7"}
        st = lambda n, s, at, ms=0: {"step_name": n, "status": s, "started_at": at, "duration_ms": ms}  # noqa: E731
        runs = {"d1": {"id": "d1", "status": "Success", "started_at": "2026-10-30T07:00:00Z", "step_results": [
                    st("ticket", "Success", "2026-10-30T07:00:00Z"), prep, st("gate_plan", "Success", "2026-10-30T07:20:00Z", 60000),
                    st("code", "Success", "2026-10-30T07:30:00Z"), st("controles", "Failed", "2026-10-30T07:50:00Z", 120000),
                    st("code", "Success", "2026-10-30T08:10:00Z"), st("livraison", "Success", "2026-10-30T08:30:00Z", 300000)]},
                "rej": {"id": "rej", "status": "Failed", "started_at": "2026-10-30T09:00:00Z", "step_results": [
                    st("ticket", "Success", "2026-10-30T09:00:00Z"), {**prep, "output": "AB-8 sur dm/api : x"},
                    st("gate_plan", "Failed", "2026-10-30T09:10:00Z")]},
                "vieux": {"id": "vieux", "status": "Success", "started_at": "2026-10-28T07:00:00Z", "step_results": [
                    prep, st("livraison", "Success", "2026-10-28T08:00:00Z")]}}
        api = {"/workflows/c/runs?limit=40": [{k: v for k, v in r.items() if k != "step_results"} for r in runs.values()],
               **{f"/workflows/c/runs/{k}": v for k, v in runs.items()}}
        old = (a.get, dict(a.CFG))
        a.get = lambda p: api.get(p)
        a.CFG.update(models={"impl_chain": "c"})
        try:
            snap = a.snapshot("2026-10-30T12:00:00+00:00")
        finally:
            a.get = old[0]
            a.CFG.clear()
            a.CFG.update(old[1])
        # rejeu du 1er étage : le carton à chaque poste commencé (code, contrôles, code, PR)
        self.assertEqual([(e["poste"], e["t"]) for e in snap["events"] if e["k"] == "poste"], [
            ("code", "2026-10-30T07:30:00+00:00"), ("regles", "2026-10-30T07:50:00+00:00"), ("code", "2026-10-30T08:10:00+00:00"),
            ("pr", "2026-10-30T08:30:00+00:00")])
        snap["events"] = [e for e in snap["events"] if e["k"] != "poste"]
        self.assertEqual([(e["ticket"], e["k"], e["t"]) for e in snap["events"]], [
            ("AB-7", "arrive", "2026-10-30T07:00:00+00:00"), ("AB-7", "gate", "2026-10-30T07:20:00+00:00"),
            ("AB-7", "panne", "2026-10-30T07:52:00+00:00"), ("AB-7", "back", "2026-10-30T08:10:00+00:00"),
            ("AB-7", "sort", "2026-10-30T08:35:00+00:00"), ("AB-8", "arrive", "2026-10-30T09:00:00+00:00"),
            ("AB-8", "gate", "2026-10-30T09:10:00+00:00")])
        self.assertEqual(snap["events"][1]["gate"], "gate_plan")
        self.assertEqual(snap["events"][2]["poste"], "controles")
        self.assertEqual(snap["livres"], 1)
