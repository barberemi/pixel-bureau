"""Remettre une PR à jour (#74, python3 -m unittest tests/test_pr_update.py) : workflows/pr_update.py étape par étape,
avec un vrai git (dépôt jetable et son remote nu) et un faux gh ; le modèle rebase.json rendu."""
import json, os, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import templates  # noqa: E402
FIXTURE = json.loads(Path(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json")).read_text())
REPO = FIXTURE["github"]["repo"]

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
sys.exit(0)
'''


class PrUpdateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.bin = os.path.join(self.tmp, "bin")
        os.makedirs(self.bin)
        os.symlink(subprocess.run(["which", "git"], capture_output=True, text=True).stdout.strip(), os.path.join(self.bin, "git"))
        gh = os.path.join(self.bin, "gh")
        Path(gh).write_text(FAKE_GH.replace("#!PY", "#!" + sys.executable))
        os.chmod(gh, 0o755)
        self.remote = os.path.join(self.tmp, "remote.git")
        self.work = os.path.join(self.tmp, "work")
        subprocess.run(["git", "init", "--bare", "-b", "main", self.remote], capture_output=True, check=True)
        subprocess.run(["git", "clone", self.remote, self.work], capture_output=True, check=True)
        self.commit("a.txt", "a\n", "init")
        self.g("push", "origin", "HEAD:main")
        self.g("checkout", "-b", "feat/export")
        self.commit("b.txt", "1\n", "wip 1")
        self.commit("a.txt", "a\nde la PR\n", "wip 2")
        self.g("push", "origin", "feat/export")
        self.g("checkout", "main")
        self.data = {"remote": self.remote, "pr": {"number": 16, "title": "feat: export", "state": "OPEN", "headRefName": "feat/export",
                     "headRefOid": "", "baseRefName": "main", "isCrossRepository": False, "url": ""}}

    def env(self):
        return {"PATH": self.bin + os.pathsep + "/usr/bin:/bin", "HOME": self.tmp, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t",
                "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}

    def g(self, *c, cwd=None):
        return subprocess.run(["git", *c], cwd=cwd or self.work, capture_output=True, text=True, check=True, env=self.env()).stdout.strip()

    def commit(self, name, text, msg):
        Path(self.work, name).write_text(text)
        self.g("add", ".")
        self.g("commit", "-m", msg)

    def main_moves(self, name="c.txt", text="main\n"):
        self.g("checkout", "main")
        self.commit(name, text, "sur main")
        self.g("push", "origin", "main")

    def step(self, name, cfg=None):
        Path(self.tmp, "gh.json").write_text(json.dumps(self.data))
        Path(self.tmp, "cfg.json").write_text(json.dumps(cfg or FIXTURE))
        env = dict(self.env(), BUREAU_CONFIG=os.path.join(self.tmp, "cfg.json"), FAKE_GH=os.path.join(self.tmp, "gh.json"))
        return subprocess.run([sys.executable, os.path.join(ROOT, "workflows", "pr_update.py"), name, REPO, "16", "run-1"],
                              capture_output=True, text=True, env=env, timeout=60)

    def remote_log(self):
        return self.g("--git-dir", self.remote, "log", "--format=%s", "feat/export").splitlines()

    def test_behind_without_conflict_rebases_keeps_commits_and_pushes(self):
        self.main_moves()
        for s in ("prepare", "rebase", "push", "done"):
            r = self.step(s)
            self.assertEqual(r.returncode, 0, s + " : " + r.stdout + r.stderr)
        self.assertEqual(self.remote_log(), ["wip 2", "wip 1", "sur main", "init"], "rejoués sur main, sans squash")
        work = os.path.join(self.tmp, ".cache", "pixel-bureau", "pr", "work", "run-1")
        self.assertFalse(os.path.exists(work), "dossier de travail retiré après le push")

    def test_already_up_to_date_pushes_nothing(self):
        before = self.remote_log()
        for s in ("prepare", "rebase"):
            self.assertEqual(self.step(s).returncode, 0)
        r = self.step("push")
        self.assertIn("rien poussé", r.stdout)
        self.assertEqual(self.remote_log(), before)

    def test_conflict_stops_for_the_agent_then_verify_and_push(self):
        self.main_moves("a.txt", "a\nde main\n")
        self.assertEqual(self.step("prepare").returncode, 0)
        r = self.step("rebase")
        self.assertEqual(r.returncode, 3, r.stdout + r.stderr)
        self.assertIn("a.txt", r.stdout)
        v = self.step("verify")
        self.assertEqual(v.returncode, 4, "rebase encore en cours : refusé")
        # ce que fait l'agent : résoudre, add, continuer ; son résumé hors de git
        work = os.path.join(self.tmp, ".cache", "pixel-bureau", "pr", "work", "run-1")
        Path(work, "a.txt").write_text("a\nde main\nde la PR\n")
        Path(work, ".bureau-resolution.md").write_text("a.txt : les deux lignes gardées")
        subprocess.run(["git", "add", "a.txt"], cwd=work, check=True, env=self.env())
        subprocess.run(["git", "rebase", "--continue"], cwd=work, check=True, capture_output=True, env=dict(self.env(), GIT_EDITOR="true"))
        v = self.step("verify")
        self.assertEqual(v.returncode, 0, v.stdout + v.stderr)
        self.assertIn("a.txt : les deux lignes gardées", v.stdout)
        self.assertIn("aucune commande", self.step("check").stdout)
        self.assertEqual(self.step("push").returncode, 0)
        self.assertEqual(self.remote_log(), ["wip 2", "wip 1", "sur main", "init"])

    def test_conflict_markers_left_are_refused(self):
        self.main_moves("a.txt", "a\nde main\n")
        self.step("prepare"), self.step("rebase")
        work = os.path.join(self.tmp, ".cache", "pixel-bureau", "pr", "work", "run-1")
        subprocess.run(["git", "add", "a.txt"], cwd=work, check=True, env=self.env())  # marqueurs laissés tels quels
        subprocess.run(["git", "rebase", "--continue"], cwd=work, capture_output=True, env=dict(self.env(), GIT_EDITOR="true"))
        v = self.step("verify")
        self.assertEqual(v.returncode, 4)
        self.assertIn("Marqueurs de conflit", v.stdout)

    def test_abort_pushes_nothing_and_cleans(self):
        before = self.remote_log()
        self.main_moves("a.txt", "a\nde main\n")
        self.step("prepare"), self.step("rebase")
        r = self.step("abort")
        self.assertEqual(r.returncode, 0)
        self.assertIn("rien poussé", r.stdout)
        self.assertEqual(self.remote_log(), before)

    def test_push_refused_if_the_branch_moved_meanwhile(self):
        self.main_moves()
        self.step("prepare"), self.step("rebase")
        self.g("checkout", "feat/export")
        self.commit("d.txt", "x\n", "poussé par quelqu'un d'autre")
        self.g("push", "origin", "feat/export")
        r = self.step("push")
        self.assertEqual(r.returncode, 5, r.stdout)
        self.assertEqual(self.remote_log()[0], "poussé par quelqu'un d'autre", "rien écrasé")

    def test_fork_and_closed_pr_refused(self):
        self.data["pr"]["isCrossRepository"] = True
        self.assertEqual(self.step("prepare").returncode, 2)
        self.data["pr"].update(isCrossRepository=False, state="MERGED")
        self.assertEqual(self.step("prepare").returncode, 2)

    def test_ci_label_relaunched_after_push(self):
        self.main_moves()
        cfg = dict(FIXTURE, github=dict(FIXTURE["github"], ci_labels={REPO: "ci-test"}))
        for s in ("prepare", "rebase", "push"):
            r = self.step(s, cfg)
        self.assertIn("ci-test reposé", r.stdout)
        calls = [json.loads(x) for x in Path(self.tmp, "gh.json.calls").read_text().splitlines()]
        self.assertIn(["pr", "edit", "16", "-R", REPO, "--add-label", "ci-test"], calls)


class RebaseTemplateTest(unittest.TestCase):
    def test_rendered_paths(self):
        d = templates.render(templates.load_templates()["rebase"], FIXTURE)
        names = [s["name"] for s in d["steps"]]
        self.assertEqual(names, ["prepare", "rebase", "push", "done", "resolve", "verify", "check", "gate_conflict", "push_resolved", "abort"])
        by = {s["name"]: s for s in d["steps"]}
        # Kronn retient une ligne qui finit par « [SIGNAL: <contains>] » : le code exact du conflit
        self.assertEqual(by["rebase"]["on_result"], [{"contains": "exit_3", "action": {"type": "Goto", "step_name": "resolve"}}])
        self.assertEqual(by["done"]["on_result"], [{"contains": "OK", "action": {"type": "Stop"}}])
        self.assertEqual(by["push_resolved"]["on_result"], [{"contains": "OK", "action": {"type": "Stop"}}])
        self.assertEqual(by["gate_conflict"]["gate_request_changes_target"], "abort")
        self.assertEqual(by["resolve"]["step_type"]["type"], "Agent")
        self.assertIn("{{run.id}}", by["resolve"]["prompt_template"])
        self.assertNotIn("@@", json.dumps(d))


if __name__ == "__main__":
    unittest.main()
