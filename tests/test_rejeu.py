"""Rejeu d'un ticket livré (python3 -m unittest tests/test_rejeu.py) : impl_rejeu dérivé d'impl_chain (sans gate, en essai,
fini par la note), workflows/rejeu.py dans un dépôt git jetable (fichiers touchés, tests de la vraie PR posés puis retirés,
note sur 100 et historique) et le choix d'une PR (jeu témoin, rotation variée) avec un faux gh."""
import copy, json, os, shutil, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURE = json.loads(Path(ROOT, "tests", "fixtures", "bureau.config.json").read_text())
sys.path.insert(0, os.path.join(ROOT, "tools"))
import templates  # noqa: E402

REPO = "acme/site"


class GabaritTest(unittest.TestCase):
    def setUp(self):
        self.tpl = templates.load_templates()
        self.d = self.tpl["impl_rejeu"]["definition"]
        self.steps = {s["name"]: s for s in self.d["steps"]}

    def test_sans_gate_ni_livraison(self):
        self.assertFalse([s for s in self.d["steps"] if s["step_type"]["type"] == "Gate"])
        for n in templates.REJEU_RETIRES:
            self.assertNotIn(n, self.steps)
        self.assertEqual(self.d["concurrency_limit"], 1)
        mode = next(v for v in self.d["variables"] if v["name"] == "mode")
        self.assertEqual([o["value"] for o in mode["control"]["options"]], ["essai"])

    def test_tout_mene_a_la_note(self):
        noms = [s["name"] for s in self.d["steps"]]
        self.assertEqual(noms[noms.index("fin_essai"):], ["fin_essai", "note", "juge", "range", "rattrape"])
        self.assertNotIn("on_result", self.steps["fin_essai"])  # l'escalade est notée aussi
        cibles = {a["action"]["step_name"] for s in self.d["steps"] for a in s.get("on_result") or [] if a["action"]["type"] == "Goto"}
        self.assertLessEqual(cibles, set(noms))
        self.assertIn("note", cibles)  # « livrer » de l'aiguillage
        self.assertEqual(self.steps["range"]["on_result"], [{"contains": "OK", "action": {"type": "Stop"}}])

    def test_suit_la_chaine(self):
        chaine = {s["name"] for s in self.tpl["impl_chain"]["definition"]["steps"]}
        self.assertLessEqual(set(self.steps) - {"note", "juge", "range"}, chaine)
        self.assertEqual(self.steps["code"], next(s for s in self.tpl["impl_chain"]["definition"]["steps"] if s["name"] == "code"))

    def test_rendu(self):
        cfg = copy.deepcopy(FIXTURE)
        cfg.setdefault("jira", {})["config_id"] = cfg.get("jira", {}).get("config_id") or "jira-1"
        out = templates.render(self.tpl["impl_rejeu"], cfg)
        juge = next(s for s in out["steps"] if s["name"] == "juge")
        self.assertIn("Tu es le juge d'un rejeu", juge["prompt_template"])
        self.assertEqual(juge["agent_settings"]["tier"], "reasoning")
        self.assertEqual(juge["agent_settings"]["tools"]["cli"], ["Read", "Grep", "Glob"])
        note = next(s for s in out["steps"] if s["name"] == "note")
        self.assertLess(len(note["exec_args"][1].encode()), templates.MAX_SCRIPT)
        self.assertIn("rejeu", templates.render(self.tpl["rejeu"], cfg)["steps"][0]["exec_args"][1])

    def test_reglage_du_pack(self):
        import assemble
        with tempfile.TemporaryDirectory() as d:
            Path(d, "team.json").write_text("{}")
            Path(d, "settings.json").write_text(json.dumps({"rejeu": {"depot": REPO, "temoin": [1, 2]}}))
            out = assemble.merged({"team": d, "rejeu": {"temoin": [3]}})
        self.assertEqual(out["rejeu"], {"depot": REPO, "temoin": [3]})  # la config surcharge clé à clé

    def test_installe_avec_la_chaine(self):
        import install
        self.assertTrue({"rejeu", "impl_rejeu"} <= install.with_posts({"impl"}))
        self.assertTrue(templates.skipped("rejeu", {"jira": {}}))


class PalpatineTest(unittest.TestCase):
    """Dans la page (lot 2) : Palpatine, l'agent du modèle rejeu, ses deux boutons et ses images de lancer."""

    def setUp(self):
        import assemble
        self.a = assemble
        self.cfg = copy.deepcopy(FIXTURE)  # la démo a le rejeu installé (models.rejeu, models.impl_rejeu)

    def test_boutons_et_runs(self):
        pc = self.a.page_config(self.cfg)
        self.assertEqual(pc["rejeu_wf"], self.cfg["models"]["impl_rejeu"][:8])  # ses runs, lus dans AT_RUNS
        self.assertEqual(pc["action_wf"]["rejeu"], self.cfg["models"]["rejeu"][:8])  # son visage sur les boutons
        self.assertEqual(self.a.action_ids(self.cfg)["rejeu"], self.cfg["models"]["rejeu"])
        self.assertEqual({self.a.ACTIONS[k] for k in ("bureau-rejeu", "bureau-rejeu-ticket")}, {("rejeu", "__REJEU_WF__")})
        cfg = copy.deepcopy(self.cfg)
        del cfg["models"]["rejeu"], cfg["models"]["impl_rejeu"]
        self.assertEqual(self.a.page_config(cfg)["rejeu_wf"], "")
        self.assertNotIn("rejeu", self.a.action_ids(cfg))

    def test_palpatine_et_ses_images_de_lancer(self):
        agents = {a["key"]: a for a in json.loads(Path(ROOT, "team", "agents.json").read_text())["agents"]}
        self.assertEqual((agents["palpatine"]["model"], agents["palpatine"]["sprite"]), ("rejeu", "palpatine"))
        common = json.loads(Path(ROOT, "sprites", "common.json").read_text())
        self.assertTrue(common["palpatine_cast"].startswith("data:image/png;base64,"))  # build_sprites.sheets : <nom>-cast.png
        self.assertTrue({"palpatine", "palpatine_cast"} <= set(self.a.sprites(self.a.merged(self.cfg))))  # embarqués avec lui (casting par défaut, comme build)
        cfg = copy.deepcopy(self.cfg)
        del cfg["models"]["rejeu"], cfg["models"]["impl_rejeu"]
        cfg["agents"] = [a for a in cfg["agents"] if a["key"] != "palpatine"]  # la démo l'a dans ses agents, rattaché au lanceur
        self.assertFalse({"palpatine", "palpatine_cast"} & set(self.a.sprites(self.a.merged(cfg))))  # sans le rejeu, rien de plus dans la page


class RejeuTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.wt = os.path.join(self.tmp, "wt")
        self.store = os.path.join(self.tmp, "rejeu")
        self.bin = os.path.join(self.tmp, "bin")
        os.makedirs(self.bin)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def git(self, *a):
        return subprocess.run(["git", "-C", self.wt, *a], check=True, capture_output=True, text=True).stdout.strip()

    def ecrit(self, path, text):
        p = Path(self.wt, path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)

    def depot(self, extra=None):
        """Départ : src/a.py ; vraie PR (merge) : a.py change et tests/test_a.txt arrive (et extra) ; la chaîne : a.py change, b.py en plus."""
        os.makedirs(self.wt)
        self.git("init", "-q", "-b", "main")
        self.git("config", "user.email", "t@t")
        self.git("config", "user.name", "t")
        self.git("remote", "add", "origin", f"https://github.com/{REPO}.git")
        self.ecrit("src/a.py", "def f():\n    return 1\n")
        self.git("add", ".")
        self.git("commit", "-qm", "départ")
        base = self.git("rev-parse", "HEAD")
        self.ecrit("src/a.py", "def f():\n    return 2\n")
        self.ecrit("tests/test_a.txt", "attend 2\n")
        for path, text in (extra or {}).items():
            self.ecrit(path, text)
        self.git("add", ".")
        self.git("commit", "-qm", "vraie PR")
        merge = self.git("rev-parse", "HEAD")
        self.git("checkout", "-q", "-b", "kronn/ABC-1", base)
        self.ecrit("src/a.py", "def f():\n    return 2  # changé\n")
        self.ecrit("src/b.py", "x = 1\n")
        self.git("add", ".")
        self.git("commit", "-qm", "chaîne")
        Path(self.wt, ".kronn", "chaine").mkdir(parents=True)
        Path(self.wt, ".kronn", "chaine", "etat.json").write_text(json.dumps(
            {"ticket": "ABC-1", "repo": REPO, "base": "main", "depart": base, "texte": "Faire rendre 2 à f", "tours": 1}))
        os.makedirs(os.path.join(self.store, "demandes"))
        Path(self.store, "demandes", "ABC-1.json").write_text(json.dumps(
            {"ticket": "ABC-1", "repo": REPO, "pr": 42, "titre": "feat(a): f rend 2", "merge": merge, "base": base, "jeu": "temoin",
             "genre": "feat", "zone": "a"}))
        return base, merge

    def run_(self, *args, stdin="", tests="test -f {tests} && grep -q 'return 2' src/a.py", **rejeu):
        cfg = copy.deepcopy(FIXTURE)
        cfg["impl"] = {"repos": {REPO: {"checks": {"tests": [tests]}}}}
        cfg["rejeu"] = {"dossier": self.store, "depot": REPO, **rejeu}
        Path(self.tmp, "cfg.json").write_text(json.dumps(cfg))
        env = {"PATH": self.bin + ":/usr/bin:/bin", "HOME": self.tmp, "BUREAU_CONFIG": os.path.join(self.tmp, "cfg.json"),
               "KRONN_WORKTREE": self.wt}
        return subprocess.run([sys.executable, os.path.join(ROOT, "workflows", "rejeu.py"), *args], input=stdin, capture_output=True,
                              text=True, cwd=self.wt, env=env, timeout=60)

    def test_note_puis_range(self):
        self.depot()
        r = self.run_("note", "run1")
        self.assertEqual(r.returncode, 0, r.stderr)
        n = json.loads(Path(self.wt, ".kronn/chaine/rejeu_note.json").read_text())
        self.assertEqual((n["fichiers"]["rappel"], n["fichiers"]["precision"]), (1.0, 0.5))
        self.assertEqual(n["fichiers"]["en_plus"], ["src/b.py"])
        self.assertEqual(n["tests"]["ratio"], 1.0)
        self.assertFalse(Path(self.wt, "tests/test_a.txt").exists())  # le test de la vraie PR est retiré après
        self.assertEqual(self.git("status", "--porcelain", "--", "src", "tests"), "")
        self.assertIn("return 2", Path(self.wt, ".kronn/chaine/rejeu_reference.diff").read_text())
        self.assertIn("rappel 100 %, précision 50 %", r.stdout)
        r = self.run_("range", "run1", stdin=json.dumps({"score": 70, "resume": "Même idée, un fichier de trop."}))
        self.assertEqual(r.returncode, 0, r.stderr)
        h = json.loads(Path(self.store, "ABC-1", "run1.json").read_text())
        self.assertEqual(h["lignes"]["score"], 0.4)  # « - return 1 » commun, sur 2 + 3 lignes
        # tests 1 × 0,5 + fichiers 0,67 × 0,2 + lignes 0,4 × 0,1 + juge 0,7 × 0,2 = 0,81
        self.assertEqual((h["note_sur_100"], h["atteint"]), (81, True))
        self.assertEqual(h["juge"]["resume"], "Même idée, un fichier de trop.")
        self.assertEqual(json.loads(Path(self.store, "joues.json").read_text())["42"]["note"], 81)
        self.assertIn("Tout se déroule comme je l’avais prévu", r.stdout)
        # la page relit la note dans cette sortie (_lib.rejeu_res, run_res du run) : Palpatine la dit dans sa bulle
        os.environ.setdefault("BUREAU_CONFIG", os.path.join(ROOT, "tests", "fixtures", "bureau.config.json"))
        sys.path.insert(0, os.path.join(ROOT, "workflows"))
        from _lib import rejeu_res
        self.assertEqual(rejeu_res(r.stdout), {"ticket": "ABC-1", "pr": 42, "note": 81, "cible": 80, "atteint": True,
                                               "parts": {"tests": 100, "fichiers": 67, "lignes": 40, "juge": 70}})
        self.assertIsNone(rejeu_res("Pas de note (étape note) : rien à ranger."))

    def test_tests_rouges_et_juge_absent(self):
        self.depot()
        r = self.run_("note", "run2", tests="test -f {tests} && grep -q 'return 2$' src/a.py")  # vert sur la vraie PR, rouge sur la chaîne
        self.assertEqual(r.returncode, 0, r.stderr)
        n = json.loads(Path(self.wt, ".kronn/chaine/rejeu_note.json").read_text())
        self.assertEqual((n["tests"]["ratio"], n["tests"]["rouges"]), (0.0, ["tests/test_a.txt"]))
        r = self.run_("range", "run2", stdin="null")
        h = json.loads(Path(self.store, "ABC-1", "run2.json").read_text())
        self.assertIsNone(h["parts"]["juge"])  # sans juge : la note se fait sur le reste, poids rapportés
        self.assertEqual(h["note_sur_100"], round(100 * (0.2 * 0.67 + 0.1 * 0.4) / 0.8))
        self.assertIn("Je sens un grand trouble", r.stdout)
        sys.path.insert(0, os.path.join(ROOT, "workflows"))
        from _lib import rejeu_res
        self.assertEqual(rejeu_res(r.stdout)["parts"]["juge"], None)  # « juge : non mesuré »

    # chaque fichier tests/*.test.js est un motif que src/a.py doit contenir ; les autres fichiers de test n'ont pas de commande
    MOTIFS = 'for t in {tests_ts}; do grep -q "$(cat "$t")" src/a.py || exit 1; done'

    def test_fichiers_de_support_hors_du_ratio(self):
        """Une fixture ou un fichier qu'aucune commande ne lance est posé mais ne compte pas rouge (rejeu de #2039 :
        une config de test et une classe de base comptées rouges)."""
        self.depot({"tests/a.test.js": "return 2", "tests/b.test.js": "return 2$", "tests/fixtures/data.json": "{}"})
        r = self.run_("note", "run5", tests=self.MOTIFS)
        self.assertEqual(r.returncode, 0, r.stderr)
        t = json.loads(Path(self.wt, ".kronn/chaine/rejeu_note.json").read_text())["tests"]
        # b rouge sur la chaîne (« return 2  # changé ») mais vert sur la vraie PR : la chaîne est en cause
        self.assertEqual((t["ratio"], t["verts"], t["rouges"], t["environnement"]), (0.5, ["tests/a.test.js"], ["tests/b.test.js"], []))
        self.assertEqual(t["support"], ["tests/fixtures/data.json", "tests/test_a.txt"])
        self.assertIn("Posés sans être lancés", r.stdout)
        self.assertFalse(Path(self.wt, "tests/fixtures/data.json").exists())  # retirés après, comme les autres
        self.assertFalse(Path(self.wt, ".kronn/chaine/reference").exists())  # la copie de la contre-épreuve aussi
        self.assertNotIn("reference", self.git("worktree", "list"))

    def test_contre_epreuve_environnement(self):
        """Rouge aussi sur la vraie PR : l'environnement, hors du ratio (rejeu de #2073 : images absentes, toutes les pages en 500)."""
        self.depot({"tests/a.test.js": "return 2", "tests/b.test.js": "return 3"})
        r = self.run_("note", "run6", tests=self.MOTIFS)
        self.assertEqual(r.returncode, 0, r.stderr)
        t = json.loads(Path(self.wt, ".kronn/chaine/rejeu_note.json").read_text())["tests"]
        self.assertEqual((t["ratio"], t["rouges"], t["environnement"]), (1.0, [], ["tests/b.test.js"]))
        self.assertIn("Rouges aussi sur la vraie PR (environnement, hors note) : tests/b.test.js", r.stdout)
        # tout rouge des deux côtés (rejeu de #2015 : vendor sans un paquet) : non mesuré, la note se fait sur le reste
        shutil.rmtree(self.wt)
        shutil.rmtree(self.store)
        self.depot({"tests/a.test.js": "return 9", "tests/b.test.js": "return 3"})
        self.run_("note", "run7", tests=self.MOTIFS)
        t = json.loads(Path(self.wt, ".kronn/chaine/rejeu_note.json").read_text())["tests"]
        self.assertFalse(t["mesure"])
        self.assertIn("environnement", t["pourquoi"])

    def test_tests_non_mesures(self):
        self.depot()
        self.run_("note", "run3", tests="phpunit {tests_php}")
        n = json.loads(Path(self.wt, ".kronn/chaine/rejeu_note.json").read_text())
        self.assertFalse(n["tests"]["mesure"])

    def test_sans_demande(self):
        self.depot()
        os.remove(os.path.join(self.store, "demandes", "ABC-1.json"))
        r = self.run_("note", "run4")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("Pas de demande de rejeu", r.stderr)

    # ---------- choix d'une PR (faux gh) ----------
    def faux_gh(self, prs):
        Path(self.tmp, "prs.json").write_text(json.dumps(prs))
        g = Path(self.bin, "gh")
        g.write_text(f"#!/bin/sh\ncat {os.path.join(self.tmp, 'prs.json')}\n")
        g.chmod(0o755)

    def choisit(self, jeu, joues=None, **rejeu):
        os.makedirs(self.wt, exist_ok=True)
        if joues is not None:
            os.makedirs(self.store, exist_ok=True)
            Path(self.store, "joues.json").write_text(json.dumps(joues))
        code = ("import json, rejeu; print(rejeu.choisit(rejeu.depot(), %r, rejeu.lit(rejeu.store('joues.json'), {})))" % jeu)
        cfg = copy.deepcopy(FIXTURE)
        cfg["rejeu"] = {"dossier": self.store, "depot": REPO, **rejeu}
        Path(self.tmp, "cfg.json").write_text(json.dumps(cfg))
        env = {"PATH": self.bin + ":/usr/bin:/bin", "HOME": self.tmp, "BUREAU_CONFIG": os.path.join(self.tmp, "cfg.json"),
               "PYTHONPATH": os.path.join(ROOT, "workflows")}
        return subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, cwd=self.wt, env=env, timeout=60)

    @staticmethod
    def pr(n, titre, files, lignes=60, quand="2026-11-20T10:00:00Z"):
        return {"number": n, "title": titre, "headRefName": "x", "additions": lignes, "deletions": 0, "mergedAt": quand,
                "files": [{"path": f} for f in files]}

    def test_temoin_le_moins_recemment_joue(self):
        r = self.choisit("temoin", {"10": {"at": "2026-11-01"}, "11": {"at": "2026-10-01"}}, temoin=[10, 11, 12])
        self.assertEqual(r.stdout.strip(), "12", r.stderr)  # jamais joué
        r = self.choisit("temoin", {"10": {"at": "2026-11-01"}, "11": {"at": "2026-10-01"}, "12": {"at": "2026-11-02"}}, temoin=[10, 11, 12])
        self.assertEqual(r.stdout.strip(), "11")

    def test_rotation_filtre_et_varie(self):
        code, test = "application/apps/website/src/Builder/X.php", "application/apps/website/tests/Builder/XTest.php"
        self.faux_gh([
            self.pr(1, "fix(Deps):ABC-1 bump", [code, test]),                       # dépendances : écarté
            self.pr(2, "fix(SEO):ABC-2 sans test", [code]),                        # sans test : écarté
            self.pr(3, "feat(SEO):ABC-3 trop gros", [code, test], lignes=5000),    # trop gros : écarté
            self.pr(4, "fix(Cache):ABC-4 #autocode", [code, test]),               # fait par la chaîne : écarté
            self.pr(5, "fix(Cache):ABC-5 récent", [code, test], quand="2026-11-25T00:00:00Z"),
            self.pr(6, "feat(Iris):ABC-6 autre genre", ["application/apps/iris/src/F.php", "application/apps/iris/tests/FTest.php"]),
            self.pr(7, "fix(SEO):sans ticket", [code, test]),                      # sans ticket : écarté
            self.pr(8, "fix(SEO):ABC-8 témoin", [code, test]),                     # du jeu témoin : écarté
        ])
        r = self.choisit("rotation", {}, temoin=[8])
        self.assertEqual(r.stdout.strip(), "5", r.stderr)  # à égalité : la plus récente
        r = self.choisit("rotation", {"99": {"at": "2026-11-26", "genre": "fix", "zone": "website/Builder"}}, temoin=[8])
        self.assertEqual(r.stdout.strip(), "6")  # un fix déjà joué : un autre genre, un autre coin

    def test_rotation_saute_une_pr_deja_demandee(self):
        """joues.json ne s'écrit qu'à la fin du run : sans ça, un 2e lancement reprenait la PR en cours, et le lanceur la refusait."""
        from datetime import datetime, timezone
        code, test = "application/apps/website/src/Builder/X.php", "application/apps/website/tests/Builder/XTest.php"
        self.faux_gh([self.pr(5, "fix(Cache):ABC-5", [code, test], quand="2026-11-25T00:00:00Z"), self.pr(6, "fix(Cache):ABC-6", [code, test])])
        os.makedirs(os.path.join(self.store, "demandes"))
        Path(self.store, "demandes", "ABC-5.json").write_text(json.dumps({"pr": 5, "lance_le": datetime.now(timezone.utc).isoformat()}))
        self.assertEqual(self.choisit("rotation", {}).stdout.strip(), "6")
        Path(self.store, "demandes", "ABC-5.json").write_text(json.dumps({"pr": 5, "lance_le": "2026-01-01T00:00:00+00:00"}))
        self.assertEqual(self.choisit("rotation", {}).stdout.strip(), "5")  # demande de plus d'un jour (run perdu) : ne la retient plus

    def test_rotation_ne_rejoue_pas_trop_tot(self):
        self.faux_gh([self.pr(5, "fix(Cache):ABC-5", ["src/a.php", "tests/aTest.php"])])
        from datetime import datetime, timezone
        r = self.choisit("rotation", {"5": {"at": datetime.now(timezone.utc).isoformat()}})
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("Aucune PR", r.stderr)


if __name__ == "__main__":
    unittest.main()
