"""Variables de lancement reconstituées (workflows/_vars.py, python3 -m unittest tests/test_vars.py) : Kronn ne les rend
plus dans trigger_context ; elles viennent du cache local d'un workflow ou de la sortie d'une étape connue, jamais
inventées. Données fictives (équipe Dunder Mifflin)."""
import json, os, sys, tempfile, shutil, unittest
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "workflows"))
os.environ.setdefault("BUREAU_CONFIG", os.path.join(ROOT, "tests", "fixtures", "bureau.config.json"))  # _lib sans installation
import _vars as V  # noqa: E402

IMPL, REVUE, SUPPORT = "11111111-impl", "22222222-revue", "33333333-support"


def output(data):
    return "---STEP_OUTPUT---\n" + json.dumps({"data": data, "status": "OK"}) + "\n---END_STEP_OUTPUT---\n[SIGNAL: OK]"


class RunVarsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.old = (V.CACHE, V.get, dict(V._M), dict(V._STEPS), list(V._SUPPORT))
        V.CACHE = self.tmp
        V._M.update(impl=IMPL, review_one=REVUE, support=SUPPORT)
        V._STEPS.update({IMPL: ("ticket", "jira"), REVUE: ("fetch_meta", "github")})
        V._SUPPORT.clear()
        self.details, self.calls = {}, []

        def get(path):
            self.calls.append(path)
            return {"step_results": self.details.get(path.rsplit("/", 1)[1], [])}
        V.get = get

    def tearDown(self):
        V.CACHE, V.get = self.old[0], self.old[1]
        for d, o in ((V._M, self.old[2]), (V._STEPS, self.old[3])):
            d.clear()
            d.update(o)
        V._SUPPORT[:] = self.old[4]
        shutil.rmtree(self.tmp)

    def run_of(self, rid, step, status="Success"):
        return {"id": rid, "status": "Success", "step_results": [{"step_name": step, "status": status}]}

    def test_kept_trigger_context_wins(self):
        self.assertEqual(V.run_vars({"id": IMPL}, self.run_of("r1", "ticket"), {"jira_ticket_key": "DM-1"}), {"jira_ticket_key": "DM-1"})
        self.assertEqual(self.calls, [])  # rien relu

    def test_jira_answer_of_the_ticket_step(self):
        self.details["r2"] = [{"step_name": "ticket", "output": output({"key": "DM-4", "fields": {"summary": "Papier"}})}]
        self.assertEqual(V.run_vars({"id": IMPL}, self.run_of("r2", "ticket"), {}), {"jira_ticket_key": "DM-4"})
        self.assertEqual(V.run_vars({"id": IMPL}, self.run_of("r2", "ticket"), {}), {"jira_ticket_key": "DM-4"})
        self.assertEqual(len(self.calls), 1, "lue une fois, gardée dans vars/<run>.json")

    def test_github_answer_of_fetch_meta(self):
        self.details["r3"] = [{"step_name": "fetch_meta", "output": output(
            {"number": 12, "title": "DM-2 b", "base": {"ref": "main", "repo": {"full_name": "dunder-mifflin/site-web"}}})}]
        self.assertEqual(V.run_vars({"id": REVUE}, self.run_of("r3", "fetch_meta"), {}), {"pr": "12", "repo": "dunder-mifflin/site-web"})

    def test_no_reliable_source_leaves_vars_empty(self):
        self.assertEqual(V.run_vars({"id": IMPL}, self.run_of("r4", "ticket", "Running"), {}), {})  # étape pas finie
        self.details["r5"] = [{"step_name": "ticket", "output": output({"errorMessages": ["introuvable"]})}]
        self.assertEqual(V.run_vars({"id": IMPL}, self.run_of("r5", "ticket"), {}), {})
        self.details["r6"] = [{"step_name": "ticket", "output": "pas de sortie lisible"}]
        self.assertEqual(V.run_vars({"id": IMPL}, self.run_of("r6", "ticket"), {}), {})
        self.assertEqual(V.run_vars({"id": "99999999-autre"}, self.run_of("r7", "ticket"), {}), {})  # workflow inconnu
        self.assertFalse(os.path.isdir(os.path.join(self.tmp, "vars")), "rien gardé sans valeur")

    def test_support_thread_from_the_support_cache(self):
        Path(self.tmp, "support.json").write_text(json.dumps({"runs": {"r8": {"msg": "1700000000001", "disc": "d1"}}}))
        self.assertEqual(V.run_vars({"id": SUPPORT}, {"id": "r8"}, {}), {"message_id": "1700000000001"})
        self.assertEqual(V.run_vars({"id": SUPPORT}, {"id": "r9"}, {}), {})


if __name__ == "__main__":
    unittest.main()
