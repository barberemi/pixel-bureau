"""Sprint Quest (python3 -m unittest tests/test_sprintquest.py) : workflows/sprintquest.py, les données de la rétro du dernier
sprint fermé au format sprint/data de l'artefact, contre un faux gh et de fausses pages de statut ; horloge figée."""
import json, os, sys, unittest
from datetime import timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import test_scripts as ts  # noqa: E402  (module seulement : ses tests ne sont pas relancés ici)
import test_statuts as st  # noqa: E402

START = ts.NOW.astimezone(timezone.utc).replace(hour=8, minute=0, second=0, microsecond=0) - timedelta(days=14)
END = START + timedelta(days=13)
iso = lambda d: d.isoformat().replace("+00:00", "Z")  # noqa: E731
ms = lambda d: int(d.timestamp() * 1000)  # noqa: E731
SPRINT = {"id": 42, "name": "Sprint 26-45", "state": "closed", "startDate": iso(START), "endDate": iso(END), "completeDate": iso(END)}


def issue(n, typ, who, status, pts):
    return {"id": str(100 + n), "key": f"DM-{n}", "fields": {"summary": f"Ticket {n}", "issuetype": {"name": typ}, "status": {"name": status},
                                                             "assignee": {"displayName": who} if who else None, "customfield_10016": pts,
                                                             "customfield_10020": [SPRINT]}}


def log(n, moves):
    return {"issueId": str(100 + n), "changeHistories": [{"created": ms(START + timedelta(days=d)), "items": [{"fieldId": "status", "fromString": a, "toString": b}]}
                                                         for d, a, b in moves]}


ISSUES = [issue(1, "Story", "Jim Halpert", "Deployed", 3), issue(2, "Bug", "Pam Beesly", "Deployed", 2),
          issue(3, "Story", "Dwight Schrute", "En cours", 5), issue(4, "Tâche", "Jim Halpert", "Deployed", 1),
          issue(5, "Story", "Kevin Malone", "À faire", 0)]
LOG = [log(1, [(1, "À faire", "En cours"), (3, "En cours", "To Deploy"), (3.2, "To Deploy", "Deployed")]),
       log(2, [(1, "À faire", "En cours"), (2, "En cours", "To Test"), (2.5, "To Test", "Reopen"), (5, "Reopen", "To Deploy"), (6, "To Deploy", "Deployed")]),
       log(3, [(1, "À faire", "En cours")]),
       log(4, [(2, "À faire", "En cours"), (3.1, "En cours", "Deployed")])]
GH = {"merged": [{"number": 11, "title": "Ajoute le panier", "comments": [1, 2, 3], "reviews": [1, 2], "mergedAt": iso(START), "author": {"login": "jim"}},
                 {"number": 12, "title": "Corrige le pied de page", "comments": [], "reviews": [1], "mergedAt": iso(START), "author": {"login": "pam"}},
                 {"number": 13, "title": "Bump", "comments": [1] * 20, "reviews": [], "mergedAt": iso(START), "author": {"login": "bot", "is_bot": True}}],
      "prod": [{"conclusion": "success", "createdAt": iso(START + timedelta(days=4)), "displayTitle": "v1.2"},
               {"conclusion": "failure", "createdAt": iso(START + timedelta(days=6)), "displayTitle": "v1.3"},
               {"conclusion": "success", "createdAt": iso(START - timedelta(days=3)), "displayTitle": "v1.1 (avant le sprint)"}],
      "by_repo": {"dunder-mifflin/intranet": {"prod": []}}}


def check_format(test, d):
    """Les règles de l'écran « Coller » de Sprint Quest (checkSprint de l'artefact)."""
    test.assertTrue(d["name"])
    test.assertEqual(len(d["life"]), 5)
    test.assertTrue(all(0 <= v <= 5 for v in d["life"]))
    test.assertEqual(len(d["stops"]), 5)
    for s in d["stops"]:
        test.assertLessEqual(max(len(s["l1"]), len(s["l2"])), 38, s)
    test.assertTrue(1 <= len(d["vs"]) <= 5)
    test.assertTrue(1 <= len(d["quiz"]) <= 8)
    for q in d["quiz"]:
        test.assertEqual(len(q["a"]), 4, q)
        test.assertEqual(len(set(q["a"])), 4, q)
        test.assertTrue(all(len(a) <= 9 for a in q["a"]), q)
        test.assertIn(q["ok"], range(4))
        test.assertLessEqual(max(len(q["q1"]), len(q["q2"])), 38, q)
    test.assertTrue(1 <= len(d["boss"]) <= 6)
    for b in d["boss"]:
        test.assertIn(b["t"], ("snail", "hydra", "ghost"))
        test.assertTrue(b["n"])
    test.assertNotIn("—", json.dumps(d, ensure_ascii=False))


class SprintQuestTest(unittest.TestCase):
    setUp, tearDown, run_script, fake_gh = ts.ScriptsTest.setUp, ts.ScriptsTest.tearDown, ts.ScriptsTest.run_script, ts.ScriptsTest.fake_gh

    def build(self, issues=ISSUES, statuts=(), gh=GH):
        if gh is not None:
            self.fake_gh(gh)
        return self.run_script("sprintquest.py", {"sprint": 42, "issues": issues, "log": LOG}, args=("build", "To Deploy", "Reopen"), statuts=list(statuts))

    def test_mark_says_running(self):
        out = self.run_script("sprintquest.py", args=("mark",))
        self.assertIs(out["running"], True)
        self.assertTrue(out["since"])

    def test_pick_is_the_last_closed_sprint(self):
        vel = {"sprints": [{"id": 43, "state": "ACTIVE"}, {"id": 42, "state": "CLOSED"}, {"id": 41, "state": "CLOSED"}]}
        self.assertEqual(self.run_script("sprintquest.py", vel, args=("pick",)), 42)
        self.assertEqual(self.run_script("sprintquest.py", {}, args=("pick",)), 0)
        self.assertIn("aucun sprint fermé", self.stderr)

    def test_build_reads_the_sprint_github_and_status_pages(self):
        pages = {"gh": {"components": st.OK, "incidents": [st.incident("Panne des webhooks", "major", 24 * 8, 24 * 8 - 2)]}}
        fake = st.FakePages(pages)
        self.addCleanup(fake.close)
        out = self.build(statuts=[{"n": "GitHub", "url": fake.url("gh")}])
        d = out["data"]
        check_format(self, d)
        self.assertEqual(out["sprint"]["id"], 42)
        self.assertEqual(d["name"], "SPRINT 26-45")
        self.assertIs(d["ex"], False)
        vs = {x["l"]: x["v"] for x in d["vs"]}
        self.assertEqual(vs["TICKETS LIVRÉS"], "3 / 5")
        self.assertEqual(vs["POINTS LIVRÉS"], "6 / 11")
        self.assertEqual(vs["TICKETS TESTÉS / RÉOPEN"], "2 / 1")
        self.assertEqual(vs["MISES EN PROD"], "1", "seulement dans la fenêtre du sprint, la MEP ratée à part")
        self.assertEqual(vs["CAFÉS (1/PR + 2/MEP)"], "4", "2 PR (hors bot) + 2 × 1 MEP")
        self.assertEqual(d["life"], [5, 4, 5, 4, 4])
        self.assertIn("GITHUB TOMBE 2 H", d["stops"][3]["l1"])
        quiz = {q["q1"]: q for q in d["quiz"]}
        right = lambda q: q["a"][q["ok"]]  # noqa: E731
        self.assertEqual(right(quiz["QUI A LIVRÉ LE PLUS"]), "JIM")
        self.assertEqual(right(quiz["COMBIEN DE PR ONT ÉTÉ"]), "2")
        self.assertEqual(right(quiz["LE TICKET LE PLUS LONG EN COURS :"]), "12 J")
        self.assertEqual(right(quiz["QUEL TYPE DE TICKET"]), "STORY")
        self.assertIn("2 TICKETS DEPLOYED", quiz["QUEL JOUR LE PLUS DE TICKETS"]["fact"])
        boss = {b["t"]: b for b in d["boss"]}
        self.assertEqual(boss["snail"]["n"], "DM-3")
        self.assertEqual((boss["hydra"]["n"], boss["hydra"]["heads"]), ("PR #11", 5))
        self.assertEqual(boss["ghost"]["n"], "GITHUB EN PANNE")
        self.assertEqual(out["warnings"], [])
        self.assertEqual(self.build(statuts=[{"n": "GitHub", "url": fake.url("gh")}])["data"], d, "rejouable : la même partie à chaque préparation")

    def test_without_gh_nor_status_pages_the_game_still_holds(self):
        out = self.build(gh=None)
        d = out["data"]
        check_format(self, d)
        self.assertTrue(any("PR de" in w for w in out["warnings"]))
        self.assertNotIn("hydra", [b["t"] for b in d["boss"]])
        self.assertNotIn("COMBIEN DE PR ONT ÉTÉ", [q["q1"] for q in d["quiz"]])
        self.assertEqual(d["stops"][3]["l1"], "TROISIÈME ARRÊT :")

    def test_no_sprint_no_data(self):
        out = self.build(issues=[])
        self.assertIsNone(out["data"])
        self.assertTrue(any("rien à préparer" in w for w in out["warnings"]))


if __name__ == "__main__":
    unittest.main()
