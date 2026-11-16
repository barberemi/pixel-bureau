"""Page « Revue · bilan » (python3 -m unittest tests/test_revue_bilan.py) : workflows/revue_bilan.py lit l'historique des
revues (bloquants posés, suite donnée par la passe suivante) et l'état des PR relues (faux gh) ; horloge figée. Puis le
modèle du cron, la page reprise de review.page_id et le rendu des scripts."""
import json, os, sys, unittest
from datetime import timedelta, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import test_scripts as ts  # noqa: E402  (module seulement : ses tests ne sont pas relancés ici)

ROOT = ts.ROOT
sys.path.insert(0, os.path.join(ROOT, "tools"))
import templates  # noqa: E402

iso = lambda d: d.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")  # noqa: E731


class RevueBilanTest(unittest.TestCase):
    setUp, tearDown, run_script = ts.ScriptsTest.setUp, ts.ScriptsTest.tearDown, ts.ScriptsTest.run_script

    def passe(self, repo, pr, days_ago, blockers=(), suivi=(), postee=True, n=0):
        d = Path(self.tmp, ".local/share/pixel-bureau/revues", repo.replace("/", "__"), f"pr-{pr}")
        d.mkdir(parents=True, exist_ok=True)
        at = ts.NOW - timedelta(days=days_ago)
        (d / f"{at.strftime('%Y%m%dT%H%M%S')}{n}.json").write_text(json.dumps(
            {"repo": repo, "pr": pr, "at": iso(at), "postee": postee, "blockers": list(blockers),
             "suivi": [{"point": p, "etat": e, "preuve": "vu au head"} for p, e in suivi]}))

    def gh(self, states, fail=False):
        """Faux gh : « pr view <n> -R <dépôt> --json state,mergedAt » répond par states["dépôt#n"]."""
        data = os.path.join(self.tmp, "states.json")
        Path(data).write_text(json.dumps(states))
        path = os.path.join(self.bin, "gh")
        Path(path).write_text(f"""#!{sys.executable}
import json, sys
a = sys.argv[1:]
if {fail!r}:
    sys.exit("gh: boom")
s = json.load(open({data!r})).get(a[a.index("-R") + 1] + "#" + a[2])
print(json.dumps(s or {{}}))
""")
        os.chmod(path, 0o755)

    def test_blockers_and_what_the_next_pass_says(self):
        self.passe("dm/site", 12, 5, blockers=["P1 cache", "P2 test"])
        self.passe("dm/site", 12, 3, blockers=["P2 test"], suivi=[("P1", "corrigé"), ("P2", "ouvert")], n=1)
        self.passe("dm/site", 12, 1, suivi=[("P1", "refute")], n=2)
        self.passe("dm/site", 13, 2, blockers=["P1 nom"])
        self.passe("dm/site", 14, 2, blockers=["pas postée"], postee=False)
        self.passe("dm/old", 3, 90, blockers=["trop vieux"])
        self.gh({"dm/site#12": {"state": "MERGED", "mergedAt": "2026-11-08T10:00:00Z"}, "dm/site#13": {"state": "OPEN"}})
        out = self.run_script("revue_bilan.py", args=("bilan",), review={"schedule": "30 7,13 * * 1-5", "pedago": ["jim"]})
        self.assertEqual(out["bloquants"], {"poses": 4, "repris": 3, "corriges": 1, "refutes": 1, "ouverts": 1})
        self.assertEqual(out["prs"]["dm/site#12"], {"poses": 3, "repris": 3, "corriges": 1, "refutes": 1, "ouverts": 1,
                                                    "etat": "merged", "merged_at": "2026-11-08T10:00:00Z"})
        self.assertEqual(sorted(out["prs"]), ["dm/site#12", "dm/site#13"], "ni la passe non postée seule, ni la PR de 90 jours")
        self.assertEqual(out["merges"], {"relues": 2, "mergees": 1, "ouvertes": 1, "fermees": 0})
        self.assertEqual(out["pedago"], ["jim"])
        self.assertRegex(out["horaire"], r"^\d+ h 30 · \d+ h 30, du lundi au vendredi$")  # heures UTC dites à l'heure du bureau
        self.assertIsNone(out["error"])
        self.assertEqual(out["warnings"], [])

    def test_github_down_keeps_the_blockers(self):
        self.passe("dm/site", 12, 1, blockers=["P1"])
        self.gh({}, fail=True)
        out = self.run_script("revue_bilan.py", args=("bilan",))
        self.assertEqual(out["bloquants"]["poses"], 1)
        self.assertNotIn("etat", out["prs"]["dm/site#12"])
        self.assertTrue(any("illisible sur GitHub" in w for w in out["warnings"]))

    def test_no_history_says_so(self):
        out = self.run_script("revue_bilan.py", args=("bilan",))
        self.assertEqual(out["prs"], {})
        self.assertIn("aucune revue postée", out["error"])


class RevuePageTest(unittest.TestCase):
    CFG = json.loads(Path(ROOT, "tests", "fixtures", "bureau.config.json").read_text(encoding="utf-8"))

    def test_the_recap_page_already_set_becomes_the_bilan(self):
        """Une installation qui avait réglé sa page de récap (review.page_id) la garde : le cron et la revue y écrivent,
        publish.py y pousse page/revue-bilan.html ; une installation neuve prend la page de l'installateur."""
        old = dict(self.CFG, review={"page_id": "recap"}, models={"review_child": "w1"})
        self.assertEqual(templates.side_page_id(old, "revue_bilan_page_id"), "recap")
        self.assertEqual(templates.values(old)["revue_bilan.page_id"], "recap")
        self.assertEqual(templates.values(old)["review.page_id"], "recap")
        self.assertFalse(templates.skipped("revue_bilan", old))
        new = dict(self.CFG, revue_bilan_page_id="bilan", models={"review_child": "w1"})
        self.assertEqual(templates.values(new)["review.page_id"], "bilan")
        review = json.loads(templates.script_code("workflows/review.py", new).split('_CFG = r"""', 1)[1].split('"""', 1)[0])
        self.assertEqual(review["review"]["page_id"], "bilan", "couts écrit review_sessions dans la page du bilan")
        self.assertTrue(templates.skipped("revue_bilan", dict(self.CFG, review={"page_id": "recap"})), "sans revue installée : pas de cron")

    def test_the_cron_publishes_its_dataset_to_the_page(self):
        tpl = json.loads(Path(ROOT, "workflows", "templates", "revue_bilan.json").read_text(encoding="utf-8"))
        pub = next(s for s in tpl["definition"]["steps"] if s["name"] == "publish")
        self.assertEqual(pub["page_publish"]["page_id"], "@@revue_bilan.page_id@@")
        self.assertEqual(pub["page_publish"]["writes"][0]["dataset"], "revue_bilan")
        title, datasets, fichier = templates.SIDE_PAGES["revue_bilan_page_id"]
        self.assertEqual((title, fichier), ("Revue · bilan", "revue-bilan.html"))
        self.assertTrue(set(datasets) >= {"revue_bilan", "reviews", "review_meta", "review_sessions"})
        html = Path(ROOT, "page", fichier).read_text(encoding="utf-8")
        self.assertIn("<title>Revue · bilan</title>", html)
        for name in ("revue_bilan", "reviews", "review_meta", "review_sessions"):
            self.assertIn('"' + name + '"', html, name)


if __name__ == "__main__":
    unittest.main()
