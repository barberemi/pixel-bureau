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
if a[:2] == ["api", "user"]:  # ton login (le jeton de gh)
    print(d.get("me", "")); sys.exit(0)
if a[:2] == ["api", "graphql"]:  # #75 : fils, reviews et commentaires (requête), réponse et résolution (mutations)
    q = next(x for x in a if x.startswith("query="))
    if "reviewThreads" in q:
        print(json.dumps({"data": {"repository": {"pullRequest": {"reviewThreads": {"nodes": d.get("threads", [])},
                                                                    "reviews": {"nodes": d.get("reviews", [])},
                                                                    "comments": {"nodes": d.get("comments", [])}}}}}))
    if "resolveReviewThread" in q and d.get("resolve_fails"):
        sys.exit(1)
    sys.exit(0)
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


    # ---------- corriger les commentaires (#75) ----------
    def thread(self, tid, resolved=False):
        return {"id": tid, "isResolved": resolved, "isOutdated": False, "path": "a.txt", "line": 2,
                "comments": {"nodes": [{"author": {"login": "jim"}, "body": "Renomme ça", "createdAt": "2026-10-01T08:00:00Z"}]}}

    def test_fix_without_unresolved_thread_ends_at_once(self):
        self.data["threads"] = [self.thread("T1", resolved=True)]
        r = self.step("fix_prepare")
        self.assertEqual(r.returncode, 9, r.stdout + r.stderr)
        self.assertIn("aucun fil de review non résolu", r.stdout)

    def test_fix_prepare_diff_then_push_replies_and_resolves(self):
        self.data["threads"] = [self.thread("T1"), self.thread("T2"), self.thread("T3", resolved=True)]
        r = self.step("fix_prepare")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("2 fil(s) de review non résolu(s)", r.stdout)
        work = os.path.join(self.tmp, ".cache", "pixel-bureau", "pr", "work", "run-1")
        self.assertEqual([t["id"] for t in json.loads(Path(work, ".bureau-fix.json").read_text())], ["T1", "T2"])
        # ce que fait l'agent : un correctif, une réponse par fil, un résumé ; rien dans git
        Path(work, "a.txt").write_text("a\nde la PR, renommé\n")
        Path(work, ".bureau-fix-replies.json").write_text(json.dumps([
            {"thread": "T1", "fixed": True, "reply": "Renommé, merci."}, {"thread": "T2", "fixed": False, "reply": "Gardé : c'est voulu."},
            {"thread": "INCONNU", "fixed": True, "reply": "ignoré"}]))
        Path(work, ".bureau-fix-summary.md").write_text("Un renommage.")
        d = self.step("fix_diff")
        self.assertEqual(d.returncode, 0, d.stdout + d.stderr)
        # le Kanban du 3e étage : les fils en bref et leur colonne restent dans l'état du run, après le dossier de travail
        st = json.loads(Path(self.tmp, ".cache", "pixel-bureau", "pr", "runs", "run-1.json").read_text())
        self.assertEqual([f["id"] for f in st["fils"]], ["T1", "T2"])
        self.assertEqual(st["cols"], {"T1": "reponse", "T2": "reponse"})
        self.assertIn("1 fichier(s) changé(s)", d.stdout)
        self.assertIn("Un renommage.", d.stdout)
        self.assertIn("Réponses prévues (2 sur 2 fils)", d.stdout)
        self.assertNotIn(".bureau-fix", d.stdout.split("Réponses prévues")[0].split("```")[1], "fichiers d'échange jamais commités")
        p = self.step("fix_push")
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
        self.assertEqual(self.remote_log()[0], "fix: retours de review de #16")
        self.assertIn("2 réponse(s) postée(s)", p.stdout)
        calls = [json.loads(x) for x in Path(self.tmp, "gh.json.calls").read_text().splitlines()]
        self.assertEqual(sum(1 for c in calls if "t=T1" in c), 2, "T1 : réponse puis résolution")
        self.assertEqual(sum(1 for c in calls if "t=T2" in c), 1, "T2 : réponse seulement (pas corrigé)")
        self.assertFalse(os.path.exists(work))
        self.assertNotIn(".bureau", self.g("--git-dir", self.remote, "show", "--name-only", "--format=", "feat/export"))
        self.assertIn("Signed-off-by: t <t@t>", self.g("--git-dir", self.remote, "log", "-1", "--format=%B", "feat/export"), "commit signé (DCO)")
        edit = next(c for c in calls if c[:2] == ["pr", "edit"] and "--body" in c)
        body = edit[edit.index("--body") + 1]
        self.assertIn("### 🤖 Corrections de review", body)
        self.assertIn("✅ 1 fil(s) corrigé(s) et résolu(s) · ⏭️ 1 laissé(s) ouvert(s)", body)
        self.assertIn("Un renommage.", body)

    def test_fix_commit_message_checks_and_description_block(self):
        self.data["threads"] = [self.thread("T1")]
        self.data["pr"]["body"] = ("Ma description.\n\n<!-- kronn-fix:start -->\nancien bloc\n<!-- kronn-fix:end -->\n\n"
                                   "<!-- bureau-fix:start -->\nbloc d'avant\n<!-- bureau-fix:end -->")
        cfg = dict(FIXTURE, fix={"checks": {REPO: "test -f a.txt && echo tout vert"}})
        self.assertEqual(self.step("fix_prepare", cfg).returncode, 0)
        work = os.path.join(self.tmp, ".cache", "pixel-bureau", "pr", "work", "run-1")
        Path(work, "a.txt").write_text("a\nrenommé\n")
        Path(work, ".bureau-fix-replies.json").write_text(json.dumps([{"thread": "T1", "fixed": True, "reply": "✅ **Corrigé** : renommé."}]))
        Path(work, ".bureau-fix-commit.txt").write_text("fix(export): renomme la colonne demandée en review\n\nDétail.\n")
        c = self.step("fix_check", cfg)
        self.assertEqual(c.returncode, 0, c.stdout + c.stderr)
        self.assertIn("verts ✅", c.stdout)
        d = self.step("fix_diff", cfg)
        self.assertTrue(d.stdout.startswith("🧪 **Contrôles du Bureau** : verts ✅"), d.stdout[:200])
        self.assertIn("**Commit** : `fix(export): renomme la colonne demandée en review`", d.stdout)
        self.assertIn("résolu : ✅ **Corrigé** : renommé.", d.stdout)
        self.assertEqual(self.step("fix_push", cfg).returncode, 0)
        self.assertEqual(self.remote_log()[0], "fix(export): renomme la colonne demandée en review")
        calls = [json.loads(x) for x in Path(self.tmp, "gh.json.calls").read_text().splitlines()]
        edit = next(c for c in calls if c[:2] == ["pr", "edit"] and "--body" in c)
        body = edit[edit.index("--body") + 1]
        self.assertTrue(body.startswith("Ma description."))
        self.assertNotIn("ancien bloc", body)
        self.assertNotIn("bloc d'avant", body)
        self.assertEqual(body.count("<!-- bureau-fix:start -->"), 1, "rejouable sans empiler")
        self.assertIn("verts ✅", body)

    def test_fix_check_without_command_says_so(self):
        self.data["threads"] = [self.thread("T1")]
        self.step("fix_prepare")
        r = self.step("fix_check")
        self.assertEqual(r.returncode, 0)
        self.assertIn("aucune commande", r.stdout)
        work = os.path.join(self.tmp, ".cache", "pixel-bureau", "pr", "work", "run-1")
        Path(work, ".bureau-fix-replies.json").write_text(json.dumps([{"thread": "T1", "fixed": False, "reply": "💬 **Réponse** : voulu."}]))
        self.assertIn("non lancés par le Bureau", self.step("fix_diff").stdout)

    def fix_run(self, cfg, reply="✅ **Corrigé** : renommé."):
        """fix_prepare, puis ce que fait l'agent (a.txt corrigé, une réponse au fil T1) ; le dossier de travail."""
        r = self.step("fix_prepare", cfg)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        work = os.path.join(self.tmp, ".cache", "pixel-bureau", "pr", "work", "run-1")
        Path(work, "a.txt").write_text("a\nde la PR, renommé\n")
        Path(work, ".bureau-fix-replies.json").write_text(json.dumps([{"thread": "T1", "fixed": True, "reply": reply}]))
        return r, work

    def test_fix_reuses_the_chain_checks(self):
        """Sans fix.checks ni github.checks : les contrôles de la chaîne (impl.repos.<dépôt>.checks), emplacements remplis,
        sur les fichiers de la PR ; une commande déjà rouge avant les corrections n'est pas comptée, une nouvelle l'est."""
        self.data["threads"] = [self.thread("T1")]
        out = os.path.join(self.tmp, "vu.txt")
        cfg = dict(FIXTURE, impl={"repos": {REPO.upper(): {"checks": {
            "regles": [f"echo \"{{files}}|{{php}}|{{base}}\" > {out} && test -d {{worktree}}"],
            "tests": ["grep -q introuvable a.txt", {"cmd": "echo {tests_php}", "subdir": "app"}]}}}})
        _, work = self.fix_run(cfg)
        c = self.step("fix_check", cfg)
        self.assertEqual(c.returncode, 0, c.stdout + c.stderr)
        self.assertEqual(Path(out).read_text().strip(), "a.txt b.txt||main", "fichiers de la PR depuis sa base, dossier de travail")
        self.assertIn("verts ✅ (déjà rouge avant les corrections, rien de nouveau)", c.stdout)
        self.assertIn("· impl.repos", c.stdout)
        # une commande que les corrections font passer au rouge : en échec, avec sa sortie
        cfg["impl"]["repos"][REPO.upper()]["checks"]["tests"] = ["grep renommé a.txt && echo 'ligne renommée trouvée' && false"]
        c = self.step("fix_check", cfg)
        self.assertIn("en échec ❌ (1 sur 2)", c.stdout)
        self.assertIn("ligne renommée trouvée", c.stdout)
        self.assertEqual(self.step("fix_push", cfg).returncode, 0)
        self.assertFalse(os.path.exists(work + "-depart"), "copie du point de départ retirée avec le dossier de travail")

    def test_fix_chain_checks_need_the_local_checkout_for_main(self):
        self.data["threads"] = [self.thread("T1")]
        cfg = dict(FIXTURE, impl={"repos": {REPO: {"checks": {"regles": ["ls {main}/vendor"]}}}})
        self.fix_run(cfg)
        c = self.step("fix_check", cfg)
        self.assertIn("dossier local du dépôt est inconnu de Kronn", c.stdout)

    def test_fix_own_command_wins_over_the_chain_checks(self):
        self.data["threads"] = [self.thread("T1")]
        cfg = dict(FIXTURE, fix={"checks": {REPO: "echo à part"}}, impl={"repos": {REPO: {"checks": {"regles": ["false"]}}}})
        self.fix_run(cfg)
        c = self.step("fix_check", cfg)
        self.assertIn("Contrôles (echo à part) : verts ✅", c.stdout)

    def test_fix_version_of_the_pass(self):
        """Passe n : « **Version n** » en tête de chaque réponse, compteur dans le bloc de la description ; sans bloc, le
        plus grand « Version N » déjà posté en tête d'une réponse (fil résolu compris) ou d'un commentaire, plus un."""
        self.data["threads"] = [self.thread("T1")]
        r, _ = self.fix_run(FIXTURE)
        self.assertIn("Passe de corrections : Version 1.", r.stdout)
        self.assertIn("🔢 **Version 1**", self.step("fix_diff").stdout)
        self.assertEqual(self.step("fix_push").returncode, 0)
        calls = [json.loads(x) for x in Path(self.tmp, "gh.json.calls").read_text().splitlines()]
        reply = next(c for c in calls if any("addPullRequestReviewThreadReply" in x for x in c))
        self.assertIn("b=**Version 1**\n\n✅ **Corrigé** : renommé.", reply)
        edit = next(c for c in calls if c[:2] == ["pr", "edit"] and "--body" in c)
        body = edit[edit.index("--body") + 1]
        self.assertIn("<!-- bureau-fix:version=1 -->", body)
        self.assertIn("### 🤖 Corrections de review · Version 1", body)
        # passe suivante : le compteur de la description
        self.data["pr"]["body"] = body
        self.assertIn("Version 2.", self.step("fix_prepare").stdout)
        # sans bloc : une passe faite à la main (« Version 3 » en tête d'une réponse, fil résolu) et un commentaire
        resolved = self.thread("T0", resolved=True)
        resolved["comments"]["nodes"].append({"author": {"login": "moi"}, "body": "**Version 3**\n\n✅ Corrigé à la main.", "createdAt": ""})
        self.data["threads"] = [resolved, self.thread("T1")]
        self.data["pr"]["body"] = "Ma description."
        self.data["pr"]["comments"] = [{"body": "Version 2 : merci pour les retours"}, {"body": "La version 9 de PHP"}]
        self.assertIn("Version 4.", self.step("fix_prepare").stdout)

    def test_fix_reads_review_bodies_and_pr_comments_outside_threads(self):
        """Hors des fils : le corps d'une review « changements demandés » et les commentaires de la PR, sans les bots ni
        ce qui précède la dernière réponse générale du Bureau ; une seule réponse, un commentaire de la PR qui les cite."""
        self.data["threads"] = []
        self.data["reviews"] = [{"id": "R1", "state": "CHANGES_REQUESTED", "body": "Il manque la gestion des erreurs réseau.",
                                 "submittedAt": "2026-11-02T10:00:00Z", "author": {"login": "jim", "__typename": "User"}},
                                {"id": "R2", "state": "APPROVED", "body": "OK pour moi", "submittedAt": "2026-11-02T11:00:00Z",
                                 "author": {"login": "pam", "__typename": "User"}},
                                {"id": "R3", "state": "COMMENTED", "body": "", "submittedAt": "2026-11-02T11:30:00Z", "author": {"login": "jim"}}]
        self.data["comments"] = [
            {"id": "C0", "body": "Ancienne remarque", "createdAt": "2026-11-01T09:00:00Z", "author": {"login": "jim", "__typename": "User"}},
            {"id": "C1", "body": "**Version 1**\n\n> **@jim** …", "createdAt": "2026-11-01T10:00:00Z", "author": {"login": "moi", "__typename": "User"}},
            {"id": "C2", "body": "Env de branche prête", "createdAt": "2026-11-02T12:00:00Z", "author": {"login": "github-actions", "__typename": "Bot"}},
            {"id": "C3", "body": "Et le cas sans locale ?", "createdAt": "2026-11-02T13:00:00Z", "author": {"login": "pam", "__typename": "User"}}]
        r = self.step("fix_prepare")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("0 fil(s) de review non résolu(s), 2 commentaire(s) hors fil", r.stdout)
        self.assertIn("Passe de corrections : Version 2.", r.stdout)
        work = os.path.join(self.tmp, ".cache", "pixel-bureau", "pr", "work", "run-1")
        ctx = json.loads(Path(work, ".bureau-fix.json").read_text())
        self.assertEqual([(x["id"], x["kind"], x["quoi"]) for x in ctx],
                         [("review:R1", "general", "changements demandés"), ("comment:C3", "general", "commentaire de la PR")])
        Path(work, "a.txt").write_text("a\nde la PR, avec erreurs réseau\n")
        Path(work, ".bureau-fix-replies.json").write_text(json.dumps([
            {"thread": "review:R1", "fixed": False, "reply": "✅ **Corrigé** : erreurs réseau gérées."},
            {"thread": "comment:C3", "fixed": False, "reply": "💬 **Réponse** : la locale par défaut s'applique."}]))
        d = self.step("fix_diff")
        self.assertIn("Réponses prévues (2 sur 0 fils et 2 commentaire(s) hors fil", d.stdout)
        self.assertIn("- hors fil : ✅ **Corrigé** : erreurs réseau gérées.", d.stdout)
        p = self.step("fix_push")
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
        self.assertIn("2 réponse(s) postée(s)", p.stdout)
        calls = [json.loads(x) for x in Path(self.tmp, "gh.json.calls").read_text().splitlines()]
        com = [c for c in calls if c[:2] == ["pr", "comment"]]
        self.assertEqual(len(com), 1, "un seul commentaire pour les réponses hors fil")
        body = com[0][com[0].index("--body") + 1]
        self.assertTrue(body.startswith("**Version 2**\n\n> **@jim** (changements demandés) : Il manque la gestion"), body[:120])
        self.assertIn("> **@pam** (commentaire de la PR) : Et le cas sans locale ?\n\n💬 **Réponse**", body)
        self.assertFalse(any("addPullRequestReviewThreadReply" in x for c in calls for x in c))
        edit = next(c for c in calls if c[:2] == ["pr", "edit"] and "--body" in c)
        self.assertIn("💬 2 commentaire(s) hors fil", edit[edit.index("--body") + 1])

    def test_fix_knows_the_threads_it_already_answered(self):
        mine = lambda tid, *extra: {**self.thread(tid), "comments": {"nodes": [  # noqa: E731
            {"author": {"login": "jim"}, "body": "Renomme ça"}, {"author": {"login": "moi"}, "body": "**Version 1**\n\n⏭️ **Laissé tel quel** : voulu."},
            *extra]}}
        self.data["threads"] = [mine("T1"), mine("T2", {"author": {"login": "jim"}, "body": "Pas d'accord"}), self.thread("T3")]
        r = self.step("fix_prepare")
        self.assertIn("3 fil(s) de review non résolu(s) (dont 1 déjà répondu(s) par le Bureau, sans relance)", r.stdout)
        work = os.path.join(self.tmp, ".cache", "pixel-bureau", "pr", "work", "run-1")
        ctx = {x["id"]: x for x in json.loads(Path(work, ".bureau-fix.json").read_text())}
        self.assertEqual((ctx["T1"]["deja_repondu"], ctx["T1"]["relance"]), ("Version 1", False))
        self.assertEqual((ctx["T2"]["deja_repondu"], ctx["T2"]["relance"]), ("Version 1", True))
        self.assertEqual((ctx["T3"]["deja_repondu"], ctx["T3"]["relance"]), (None, False))

    def test_fix_gives_the_agent_the_bureau_checks(self):
        self.data["threads"] = [self.thread("T1")]
        cfg = dict(FIXTURE, impl={"repos": {REPO: {"checks": {"regles": [{"cmd": "phpstan -c {worktree}/x.neon {php}", "subdir": "app"}],
                                                               "tests": ["vitest {tests_ts}"]}}}})
        r = self.step("fix_prepare", cfg)
        work = os.path.join(self.tmp, ".cache", "pixel-bureau", "pr", "work", "run-1")
        self.assertIn("Contrôles que le Bureau lancera après toi sur les fichiers de la PR (impl.repos)", r.stdout)
        self.assertIn(f"- `phpstan -c {work}/x.neon {{php}}` (chemins relatifs au sous-dossier app/)", r.stdout)
        self.assertIn("- `vitest {tests_ts}`", r.stdout)
        self.assertIn("aucun réglé pour ce dépôt", self.step("fix_prepare").stdout)

    def test_fix_commits_only_declared_new_files_and_warns(self):
        """Fichiers suivis modifiés : commités ; nouveaux : seulement ceux de .bureau-fix-new.txt, les autres signalés à la
        validation. PR d'un autre : signalée. Un fil corrigé dont la résolution échoue : compté."""
        self.data["threads"] = [self.thread("T1")]
        self.data["pr"]["author"] = {"login": "jim"}
        self.data["me"] = "moi"
        _, work = self.fix_run(FIXTURE)
        Path(work, "a.test.ts").write_text("test\n")
        Path(work, "coverage.json").write_text("{}\n")
        Path(work, ".bureau-fix-new.txt").write_text("a.test.ts\n")
        d = self.step("fix_diff")
        self.assertTrue(d.stdout.startswith("⚠ **PR de jim** : le commit et le push iront sur sa branche"), d.stdout[:200])
        self.assertIn("⚠ **Fichiers nouveaux non déclarés, laissés hors du commit** : `coverage.json`", d.stdout)
        self.assertIn("2 fichier(s) changé(s)", d.stdout)
        self.data["resolve_fails"] = True
        p = self.step("fix_push")
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
        self.assertIn("1 fil(s) corrigé(s) non marqué(s) résolu(s)", p.stdout)
        pushed = self.g("--git-dir", self.remote, "show", "--name-only", "--format=", "feat/export").split()
        self.assertEqual(sorted(pushed), ["a.test.ts", "a.txt"])

    def test_fix_with_nothing_changed_nor_answered_ends(self):
        self.data["threads"] = [self.thread("T1")]
        self.step("fix_prepare")
        r = self.step("fix_diff")
        self.assertEqual(r.returncode, 9, r.stdout + r.stderr)


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

    def test_fix_rendered_paths(self):
        d = templates.render(templates.load_templates()["fix"], FIXTURE)
        names = [s["name"] for s in d["steps"]]
        self.assertEqual(names, ["prepare", "fix", "check", "diff", "gate", "push", "abort", "end"])
        by = {s["name"]: s for s in d["steps"]}
        for n in ("prepare", "diff"):  # rien à faire : renvoi vers la fin (code 9, signal exact)
            self.assertEqual(by[n]["on_result"], [{"contains": "exit_9", "action": {"type": "Goto", "step_name": "end"}}])
        self.assertEqual(by["gate"]["gate_request_changes_target"], "abort")
        self.assertIn("{{notes}}", by["fix"]["prompt_template"])
        self.assertEqual([v["name"] for v in d["variables"]], ["repo", "pr", "notes"])
        self.assertNotIn("@@", json.dumps(d))
        self.assertEqual((d["concurrency_limit"], d["concurrency_key"]), (1, "{{repo}}|{{pr}}"), "un seul run par PR")
        for st in d["steps"]:  # forme python3 -c CODE ARGS, la seule que Kronn vérifie seul (KT-1017)
            if st["step_type"]["type"] == "Exec":
                self.assertEqual(st["exec_args"][0], "-c", st["name"])
        self.assertEqual(by["fix"]["agent_settings"], {"tier": "reasoning"})
        self.assertEqual(by["fix"]["skill_ids"][:2], ["testing", "security"])
        self.assertNotIn("_skills_from", by["fix"])
        self.assertIn("Aucune consigne d'équipe", by["fix"]["prompt_template"])

    def test_fix_team_section(self):
        cfg = dict(FIXTURE, review={"skill_ids": ["php"], "guidelines": "consigne de revue"})
        by = {s["name"]: s for s in templates.render(templates.load_templates()["fix"], cfg)["steps"]}
        self.assertEqual(by["fix"]["skill_ids"], ["testing", "security", "php"], "sans section fix : skills de la revue")
        self.assertNotIn("consigne de revue", by["fix"]["prompt_template"], "jamais les consignes de la revue")
        cfg = dict(cfg, fix={"skill_ids": ["typescript"], "guidelines": "Conventions maison : dunder/paper seulement."})
        by = {s["name"]: s for s in templates.render(templates.load_templates()["fix"], cfg)["steps"]}
        self.assertEqual(by["fix"]["skill_ids"], ["testing", "security", "typescript"])
        self.assertIn("Conventions maison : dunder/paper seulement.", by["fix"]["prompt_template"])


if __name__ == "__main__":
    unittest.main()
