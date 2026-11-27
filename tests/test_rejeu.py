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

    def depot(self):
        """Départ : src/a.py ; vraie PR (merge) : a.py change et tests/test_a.txt arrive ; la chaîne : a.py change, b.py en plus."""
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

    def test_tests_rouges_et_juge_absent(self):
        self.depot()
        r = self.run_("note", "run2", tests="test -f {tests} && grep -q 'return 3' src/a.py")
        self.assertEqual(r.returncode, 0, r.stderr)
        n = json.loads(Path(self.wt, ".kronn/chaine/rejeu_note.json").read_text())
        self.assertEqual((n["tests"]["ratio"], n["tests"]["rouges"]), (0.0, ["tests/test_a.txt"]))
        r = self.run_("range", "run2", stdin="null")
        h = json.loads(Path(self.store, "ABC-1", "run2.json").read_text())
        self.assertIsNone(h["parts"]["juge"])  # sans juge : la note se fait sur le reste, poids rapportés
        self.assertEqual(h["note_sur_100"], round(100 * (0.2 * 0.67 + 0.1 * 0.4) / 0.8))
        self.assertIn("Je sens un grand trouble", r.stdout)

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

    def test_rotation_ne_rejoue_pas_trop_tot(self):
        self.faux_gh([self.pr(5, "fix(Cache):ABC-5", ["src/a.php", "tests/aTest.php"])])
        from datetime import datetime, timezone
        r = self.choisit("rotation", {"5": {"at": datetime.now(timezone.utc).isoformat()}})
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("Aucune PR", r.stderr)


if __name__ == "__main__":
    unittest.main()
