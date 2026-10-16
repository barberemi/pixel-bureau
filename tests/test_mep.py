"""Mise en prod d'une PR (#58, python3 -m unittest tests/test_mep.py) : workflows/mep.py étape par étape, avec un vrai git
(dépôt jetable et son remote nu) et un faux gh ; le modèle mep.json rendu pour une config à deux projets."""
import json, os, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import templates  # noqa: E402
FIXTURE = json.loads(Path(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json")).read_text())
MEP = {"ci_workflow": "ci.yml", "ci_label": "ci-test", "staging_inputs": {"envchoice": "stg", "versionTag": "{tag}"},
       "prod_inputs": {"versionTag": "{tag}"}, "staging_url": "https://staging.example"}


def config(**extra):
    g = dict(FIXTURE["github"], mep=MEP, deploys=[{"repo": "dunder-mifflin/intranet", "prod_workflow": "deploy-production.yml",
                                                   "staging_workflow": "deploy-staging.yml", "mep": dict(MEP, ci_workflow="")},
                                                  {"repo": "dunder-mifflin/sans-mep", "prod_workflow": "x.yml"}])
    return dict(FIXTURE, github=g, jira=dict(FIXTURE.get("jira") or {}, project="DM"), **extra)


FAKE_GH = r'''#!PY
import json, os, subprocess, sys
from pathlib import Path
a = sys.argv[1:]
d = json.loads(Path(os.environ["FAKE_GH"]).read_text())
with open(os.environ["FAKE_GH"] + ".calls", "a") as fh:
    fh.write(json.dumps(a) + "\n")
if a[:2] == ["repo", "clone"]:  # le « dépôt GitHub » est le remote nu local
    sys.exit(subprocess.run(["git", "clone", d["remote"], a[3]], capture_output=True).returncode)
if a[:2] == ["pr", "view"]:
    print(json.dumps(d["pr"])); sys.exit(0)
if a[:2] == ["pr", "list"]:
    print(json.dumps(d.get("list", {}).get(a[a.index("-R") + 1], []))); sys.exit(0)
if a[0] == "api" and a[1].endswith("releases/latest"):
    print(d["last"]); sys.exit(0)
if a[0] == "api" and "/runs" in a[1]:
    print(json.dumps({"workflow_runs": [{"status": "completed", "conclusion": d.get("conclusion", "success"), "created_at": "2099-01-01T00:00:00Z"}]}))
    sys.exit(0)
sys.exit(d.get("fail", {}).get(a[0] + " " + a[1], 0))
'''


class MepTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.bin = os.path.join(self.tmp, "bin")
        os.makedirs(self.bin)
        for tool in ("git",):
            os.symlink(subprocess.run(["which", tool], capture_output=True, text=True).stdout.strip(), os.path.join(self.bin, tool))
        gh = os.path.join(self.bin, "gh")
        Path(gh).write_text(FAKE_GH.replace("#!PY", "#!" + sys.executable))
        os.chmod(gh, 0o755)
        # le dépôt « GitHub » : main avec un commit, la branche de la PR avec deux commits
        self.remote = os.path.join(self.tmp, "remote.git")
        work = os.path.join(self.tmp, "work")
        g = lambda *c, cwd=work: subprocess.run(["git", *c], cwd=cwd, capture_output=True, check=True, env=self.env())  # noqa: E731
        subprocess.run(["git", "init", "--bare", "-b", "main", self.remote], capture_output=True, check=True)
        subprocess.run(["git", "clone", self.remote, work], capture_output=True, check=True)
        Path(work, "a.txt").write_text("a\n"); g("add", "."); g("commit", "-m", "init"); g("push", "origin", "HEAD:main")
        g("checkout", "-b", "kronn/DM-7801")
        for i in (1, 2):
            Path(work, f"b{i}.txt").write_text(f"{i}\n"); g("add", "."); g("commit", "-m", f"wip {i}")
        g("push", "origin", "kronn/DM-7801")
        self.data = {"remote": self.remote, "last": "2.4.0", "pr": {"number": 16, "title": "fix(Articles): pagination des tags vide",
                     "body": "", "headRefName": "kronn/DM-7801", "baseRefName": "main", "state": "OPEN", "reviewDecision": "APPROVED",
                     "url": "https://github.com/dunder-mifflin/site-web/pull/16", "commits": [{}, {}]}}

    def env(self):
        return {"PATH": self.bin + os.pathsep + "/usr/bin:/bin", "HOME": self.tmp, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
                "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t", "MEP_POLL": "0"}

    def mep(self, step, project="site-web", pr="16", forced="", dry="non", stdin="", cfg=None):
        Path(self.tmp, "gh.json").write_text(json.dumps(self.data))
        Path(self.tmp, "cfg.json").write_text(json.dumps(cfg or config()))
        env = dict(self.env(), BUREAU_CONFIG=os.path.join(self.tmp, "cfg.json"), FAKE_GH=os.path.join(self.tmp, "gh.json"))
        return subprocess.run([sys.executable, os.path.join(ROOT, "workflows", "mep.py"), step, project, pr, forced, "run-1", dry],
                              input=stdin, capture_output=True, text=True, env=env, timeout=60)

    def calls(self):
        p = Path(self.tmp, "gh.json.calls")
        return [json.loads(x) for x in p.read_text().splitlines()] if p.exists() else []

    def test_full_run_rebases_squashes_and_deploys_with_project_inputs(self):
        r = self.mep("resolve")
        self.assertEqual((r.returncode, r.stdout), (0, "DM-7801"), r.stdout + r.stderr)  # ticket trouvé dans la branche
        r = self.mep("tag", stdin="Bug")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("`2.4.0` → **`2.4.1`**", r.stdout)  # Bug : correctif
        r = self.mep("rebase")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        log = subprocess.run(["git", "--git-dir", self.remote, "log", "--format=%s", "kronn/DM-7801"], capture_output=True, text=True).stdout.split("\n")
        self.assertEqual(log[:2], ["fix(Articles): pagination des tags vide", "init"], "deux commits squashés en un, au titre de la PR")
        for step in ("citest", "merge", "release", "staging", "prod"):
            r = self.mep(step)
            self.assertEqual(r.returncode, 0, step + " : " + r.stdout + r.stderr)
        c = self.calls()
        self.assertIn(["pr", "edit", "16", "-R", "dunder-mifflin/site-web", "--add-label", "ci-test"], c)
        self.assertIn(["release", "create", "2.4.1", "-R", "dunder-mifflin/site-web", "--target", "main", "--generate-notes", "--title", "2.4.1 - DM-7801"], c)
        self.assertIn(["workflow", "run", "deploy-staging.yml", "-R", "dunder-mifflin/site-web", "--ref", "main", "-f", "envchoice=stg", "-f", "versionTag=2.4.1"], c)
        self.assertIn(["workflow", "run", "deploy-production.yml", "-R", "dunder-mifflin/site-web", "--ref", "main", "-f", "versionTag=2.4.1"], c)
        self.assertIn("PR du ticket DM-7801", r.stdout)  # la liste lue par la gate de fin

    def test_ticket_from_title_then_body_or_forced_and_refusals(self):
        self.data["pr"].update(headRefName="feature/x", title="Corrige DM-12 et DM-13", body="")
        self.assertEqual(self.mep("resolve").stdout, "DM-12")
        self.data["pr"].update(title="Sans clé", body="Voir dm-99")
        self.assertEqual(self.mep("resolve").stdout, "DM-99")
        self.assertEqual(self.mep("resolve", forced="dm-5").stdout, "DM-5", "le ticket forcé passe avant")
        self.data["pr"]["body"] = ""
        r = self.mep("resolve")
        self.assertEqual(r.returncode, 6)
        self.assertIn("relance avec « Ticket »", r.stdout)
        self.data["pr"]["state"] = "MERGED"
        self.assertEqual(self.mep("resolve").returncode, 3)
        self.assertEqual(self.mep("resolve", project="sans-mep").returncode, 2, "un dépôt sans clé mep n'est pas un projet")
        self.assertEqual(self.mep("resolve", pr="16; rm").returncode, 3)

    def test_feature_bump_project_by_full_name_and_no_ci(self):
        self.mep("resolve", project="dunder-mifflin/intranet")
        r = self.mep("tag", project="dunder-mifflin/intranet", stdin="null")  # pas de Jira : fonctionnalité
        self.assertIn("`2.4.0` → **`2.5.0`**", r.stdout)
        r = self.mep("citest", project="dunder-mifflin/intranet")
        self.assertEqual(r.returncode, 0)
        self.assertIn("Pas de CI déclarée", r.stdout)

    def test_dry_run_writes_nothing(self):
        self.mep("resolve", dry="oui")
        self.mep("tag", dry="oui", stdin="Story")
        before = subprocess.run(["git", "--git-dir", self.remote, "rev-parse", "kronn/DM-7801"], capture_output=True, text=True).stdout
        for step in ("rebase", "citest", "merge", "release", "staging", "prod"):
            r = self.mep(step, dry="oui")
            self.assertEqual(r.returncode, 0, step + " : " + r.stdout + r.stderr)
        after = subprocess.run(["git", "--git-dir", self.remote, "rev-parse", "kronn/DM-7801"], capture_output=True, text=True).stdout
        self.assertEqual(before, after, "rien poussé")
        writes = [c for c in self.calls() if c[:2] in (["pr", "edit"], ["pr", "merge"], ["release", "create"], ["workflow", "run"])]
        self.assertEqual(writes, [])

    def test_failures_give_their_exit_code(self):
        self.mep("resolve")
        self.mep("tag", stdin="Bug")
        self.mep("rebase")
        self.data["conclusion"] = "failure"
        self.assertEqual(self.mep("citest").returncode, 4)
        self.data["fail"] = {"pr merge": 1, "release create": 1, "workflow run": 1}
        self.assertEqual(self.mep("merge").returncode, 9)
        self.assertEqual(self.mep("release").returncode, 11)
        self.assertEqual(self.mep("staging").returncode, 12)
        self.data["last"] = "pas-une-version"
        self.assertEqual(self.mep("tag", stdin="Bug").returncode, 10)


class MepTemplateTest(unittest.TestCase):
    def test_rendered_for_two_projects(self):
        cfg = config(launch={"mep_pr": "w"}, mep={"feedback_qp": "qp-1", "feedback_vars": {"prs": ""}, "done_transition": "3"})
        d = templates.render(templates.load_templates()["mep"], cfg)
        names = [s["name"] for s in d["steps"]]
        self.assertLessEqual(len(names), 20, "limite Kronn")
        self.assertEqual(names[0], "resolve")
        for s in d["steps"]:
            for target in [s.get("gate_request_changes_target")] + [(r["action"].get("step_name")) for r in s.get("on_result") or []]:
                if target:
                    self.assertIn(target, names, s["name"])
        project = d["variables"][0]
        self.assertEqual([o["value"] for o in project["control"]["options"]], ["dunder-mifflin/site-web", "dunder-mifflin/intranet"])
        self.assertEqual(project["control"]["default_value"], "dunder-mifflin/site-web")
        fb = next(s for s in d["steps"] if s["name"] == "ai_feedback")
        self.assertEqual((fb["quick_prompt_id"], fb["quick_prompt_variables"]), ("qp-1", {"prs": "", "ticket": "{{steps.resolve.data.stdout}}"}))
        self.assertEqual(next(s for s in d["steps"] if s["name"] == "transition_deployed")["api_body"], {"transition": {"id": "3"}})
        self.assertNotIn("@@", json.dumps(d))
        bare = templates.render(templates.load_templates()["mep"], dict(config(), jira={}))
        self.assertEqual({"fetch_ticket_type", "gate_ticket_done", "ai_feedback", "transition_deployed"} & {s["name"] for s in bare["steps"]}, set(),
                         "sans Jira (ni retour IA ni transition) : ces étapes sont retirées")
        self.assertTrue(templates.skipped("mep", FIXTURE), "aucun projet avec une clé mep : pas créé")
        self.assertFalse(templates.skipped("mep", cfg))

    def test_its_id_never_counts_as_a_bureau_workflow(self):
        """Rangé dans launch (jamais workflows ni actions) : l'agent qui l'incarne garde sa fiche et « ▶ Lancer… »."""
        self.assertEqual(templates.TEMPLATES["mep"][1][0], "launch")


if __name__ == "__main__":
    unittest.main()
