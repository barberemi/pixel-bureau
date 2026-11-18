"""workflows/_lecteurs.py : « 👁 Ce qu'il fait », sur des journaux Claude Code FICTIFS (équipe Dunder Mifflin).

Règle de confidentialité : jamais une commande entière, jamais un chemin absolu (y compris dans les phrases), jamais une
phrase qui parle d'un secret ; choix de la session (provenance de Kronn, puis la plus récente du dossier du run) ;
sous-agents des contrôles ; repli sans lecteur ou sur un lecteur qui lève ; journaux tronqués ou illisibles ; taille plafonnée.
"""
import ast, contextlib, io, json, os, re, shutil, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("BUREAU_CONFIG", os.path.join(ROOT, "tests", "fixtures", "bureau.config.json"))
sys.path.insert(0, os.path.join(ROOT, "workflows"))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import _lecteurs as L  # noqa: E402

WS = "/Users/dwight/Sites/dm-site/.kronn/worktrees/Le-Bureau---chaine--a1b2c3d4"
KRONN_PROMPT = "=== ANTI-HALLUCINATION (pointer) ===\nTu codes le ticket DM-7854.\n---STEP_OUTPUT---\n{}\n---END_STEP_OUTPUT---"
ABS = re.compile(r"/(?:Users|home|private|tmp|var)/")


def ligne(kind, ts, content, **extra):
    return json.dumps({"type": kind, "timestamp": ts, "cwd": WS, "message": {"role": kind, "content": content}, **extra}) + "\n"


def outil(ts, name, **inp):
    return ligne("assistant", ts, [{"type": "tool_use", "id": "t" + ts[-6:], "name": name, "input": inp}])


def dit(ts, text):
    return ligne("assistant", ts, [{"type": "text", "text": text}])


def journal(prompt=KRONN_PROMPT):
    return [json.dumps({"type": "queue-operation", "timestamp": "2026-10-30T10:00:00Z"}) + "\n",
            ligne("user", "2026-10-30T10:00:01Z", prompt),
            outil("2026-10-30T10:00:02Z", "Read", file_path=WS + "/src/Block/MediaBlock.php"),
            outil("2026-10-30T10:00:03Z", "Bash", command="cd " + WS + " && rtk proxy timeout 60 git -C " + WS + " log --oneline -5"),
            outil("2026-10-30T10:00:04Z", "Bash", command="TOKEN=abc123 docker compose exec php vendor/bin/phpunit --filter MediaBlockTest"),
            outil("2026-10-30T10:00:05Z", "Grep", pattern="data-autoplay", path=WS),
            outil("2026-10-30T10:00:06Z", "Edit", file_path=WS + "/templates/blocks/media.html.twig", old_string="a", new_string="b"),
            outil("2026-10-30T10:00:07Z", "Bash", command="sed -n 1,40p " + WS + "/tests/Block/MediaBlockTest.php"),
            outil("2026-10-30T10:00:08Z", "TodoWrite", todos=[]),
            outil("2026-10-30T10:00:09Z", "Read", file_path="/Users/dwight/.ssh/config"),
            dit("2026-10-30T10:00:10Z", "Le lot 2 retire data-autoplay du gabarit : le bloc lit l'option du lecteur.\n"
                "J'ai lancé `docker compose exec php vendor/bin/phpunit --filter X` dans " + WS + "/tests sans erreur.\n"
                "Le token GitHub est dans le fichier d'env, je ne le touche pas.\n"
                "```\nrm -rf /Users/dwight/Sites\n```\nJe relance les tests du bloc média avant de commiter."),
            outil("2026-10-30T10:00:11Z", "Write", file_path=WS + "/.kronn/chaine/rapports/securite.json", content="{}")]


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.root = os.path.join(self.tmp, "projects")
        os.environ["BUREAU_SESSIONS_ROOT"] = self.root
        self.addCleanup(os.environ.pop, "BUREAU_SESSIONS_ROOT", None)
        self.addCleanup(setattr, L, "L_CACHE", L.L_CACHE)
        L.L_CACHE = os.path.join(self.tmp, "cache")

    def ecrit(self, sid, lignes, dossier=WS, mtime=None):
        d = L.sessions_de(dossier)
        os.makedirs(d, exist_ok=True)
        p = os.path.join(d, sid + ".jsonl")
        Path(p).write_text("".join(lignes))
        if mtime:
            os.utime(p, (mtime, mtime))
        return p


class CommandesTest(unittest.TestCase):
    def test_first_useful_word_never_the_whole_command(self):
        cas = {"cd /x && rtk proxy timeout 30 grep -rn foo .": "grep", "FOO=1 BAR=2 npm test -- --watch": "npm test",
               "docker compose exec php vendor/bin/phpstan analyse src": "phpstan", "php vendor/bin/phpunit --filter X": "phpunit",
               "git -C /Users/dwight/x -c core.pager=cat log --oneline": "git log", "rtk git status": "git status", "git": "git",
               'W="$(cd .. && pwd)"; V=/Users/dwight/vendor\nls $V': "ls", "python3 -c 'print(1)'": "python3",
               "/usr/bin/env bash -c 'curl -H \"Authorization: Bearer x\" https://dm'": "bash", "for f in a b; do cat $f; done": "script"}
        for cmd, w in cas.items():
            self.assertEqual(L.commande(cmd)[0], w, cmd)

    def test_a_long_path_keeps_its_file_name(self):
        longue = WS + "/application/src/Services/Article/Related/Widget/Image/RelatedWidgetImageInjector.php"
        cat, cible = L._action("Read", {"file_path": longue}, (WS,))
        self.assertTrue(cible.startswith("…") and cible.endswith("RelatedWidgetImageInjector.php") and len(cible) == 60, cible)
        self.assertEqual(L._action("Grep", {"pattern": "x" * 80}, (WS,))[1], "x" * 31 + "…")
        self.assertEqual(L._action("Grep", {"pattern": "Dupont"}, (WS,), texte=False), ("recherche", ""))

    def test_shell_categories(self):
        self.assertEqual(L.cat_shell("sed -i 's/a/b/' x.py")[0], "modification")
        self.assertEqual(L.cat_shell("cat README.md | head")[0], "lecture")
        self.assertEqual(L.cat_shell("git grep -n autoplay")[:2], ("recherche", "git grep"))
        self.assertEqual(L.cat_shell("find . -name '*.php'")[0], "recherche")
        self.assertEqual(L.cat_shell("git push origin HEAD")[:2], ("commande", "git push"))


class PhrasesTest(unittest.TestCase):
    def test_sensitive_sentences_are_hidden(self):
        for s in ("Le secret est en place.", "J'ai trouvé le token.", "Le password est faux", "Le mot de passe expire.",
                  "La clé de l'API change", "Ajoute une API key", "api_key manquante", "Les credentials sont en env.", "Bearer abc"):
            self.assertIsNone(L.phrase(s), s)

    def test_no_absolute_path_and_commands_cut_to_their_first_word(self):
        p = L.phrase("Lancé `docker run --rm -v /Users/dwight/x:/app img` puis lu " + WS + "/src/a.php et `MediaBlock` ok.")
        self.assertNotRegex(p, ABS)
        self.assertIn("docker…", p)
        self.assertNotIn("--rm", p)
        self.assertIn("MediaBlock", p)
        self.assertEqual(len(L.phrase("x" * 300)), 140)


class JournalTest(Base):
    def test_actions_phrases_and_counts(self):
        p = self.ecrit("s1", journal())
        r = L.lis_journal(p, (WS,))
        cats = [a[1] for a in r["actions"]]
        self.assertEqual(r["compte"], {"lecture": 3, "commande": 2, "recherche": 1, "modification": 1, "rapport": 1})
        self.assertEqual(r["actions"][0], ["2026-10-30T10:00:11Z", "rapport", ".kronn/chaine/rapports/securite.json"])
        self.assertIn(["2026-10-30T10:00:03Z", "commande", "git log"], r["actions"])
        self.assertIn(["2026-10-30T10:00:04Z", "commande", "phpunit"], r["actions"])
        self.assertIn(["2026-10-30T10:00:07Z", "lecture", "tests/Block/MediaBlockTest.php (sed)"], r["actions"])
        self.assertIn(["2026-10-30T10:00:09Z", "lecture", "config"], r["actions"])  # hors du dossier du run : le nom seul
        self.assertNotIn("autre", cats)  # TodoWrite : tenue interne
        self.assertEqual(r["depuis"], "2026-10-30T10:00:01Z")
        self.assertEqual(r["phrases"][-1], "Je relance les tests du bloc média avant de commiter.")
        blob = json.dumps(r, ensure_ascii=False)
        self.assertNotRegex(blob, ABS)
        for interdit in ("abc123", "--filter", "--oneline", "rm -rf", "token", "TOKEN"):
            self.assertNotIn(interdit, blob)

    def test_only_the_new_end_is_read_and_a_cut_line_waits(self):
        lignes = journal()
        p = self.ecrit("s2", lignes[:4])
        r1 = L.lis_journal(p, (WS,))
        self.assertEqual(sum(r1["compte"].values()), 2)
        dernier = outil("2026-10-30T10:01:00Z", "Read", file_path=WS + "/docs/blocs.md")
        with open(p, "a") as f:
            f.write("{pas du json}\n" + dernier[:30])  # une ligne illisible, puis une ligne coupée en cours d'écriture
        r2 = L.lis_journal(p, (WS,))
        self.assertEqual(sum(r2["compte"].values()), 2)
        with open(p, "a") as f:
            f.write(dernier[30:])
        r3 = L.lis_journal(p, (WS,))
        self.assertEqual(r3["actions"][0], ["2026-10-30T10:01:00Z", "lecture", "docs/blocs.md"])
        self.assertEqual(sum(r3["compte"].values()), 3)
        cache = json.loads(Path(L._cle(p)).read_text())
        self.assertEqual(cache["pos"], os.path.getsize(p))
        Path(p).write_text(lignes[0] + lignes[1])  # réécrit plus court : relu depuis le début
        self.assertEqual(L.lis_journal(p, (WS,))["compte"], {})

    def test_big_journal_read_from_its_end_only(self):
        self.addCleanup(setattr, L, "LU_MAX", L.LU_MAX)
        L.LU_MAX = 1500
        p = self.ecrit("s3", journal() * 4)
        r = L.lis_journal(p, (WS,))
        self.assertTrue(r["partiel"])
        self.assertLess(sum(r["compte"].values()), 32)
        self.assertEqual(r["actions"][0][1], "rapport")


class SessionTest(Base):
    def test_provenance_first_then_the_newest_kronn_session_of_the_run(self):
        self.ecrit("vieille", journal(), mtime=1e9)
        self.ecrit("humain", journal("salut, peux-tu m'aider ?"))
        neuve = self.ecrit("neuve", journal())
        self.assertEqual(L.trouve_session(WS, "2020-01-01T00:00:00Z"), neuve)
        self.assertIsNone(L.trouve_session(WS, "2099-01-01T00:00:00Z"))
        exacte = self.ecrit("exacte", journal(), mtime=1e9)
        etape = {"status": "Success", "agent_provenance": {"attempts": [{"agent": "ClaudeCode", "session_id": "exacte"}]}}
        self.assertEqual(L.session_de(etape), "exacte")
        d = L.lecteur_claude(None, etape, "exacte", WS)
        self.assertEqual(d["depuis"], "2026-10-30T10:00:01Z")
        self.assertTrue(os.path.exists(exacte))
        self.assertIsNone(L.lecteur_claude(None, etape, "../../etc/passwd", WS))  # un id qui sort du dossier est ignoré

    def test_shared_folder_needs_the_hint(self):
        projet = "/Users/dwight/Sites/Kronn"
        self.ecrit("autre", journal(KRONN_PROMPT + " run 11112222"), dossier=projet)
        bon = self.ecrit("bon", journal(KRONN_PROMPT + " work/99998888"), dossier=projet, mtime=1e9 + 10)
        self.assertEqual(L.trouve_session(projet, "2001-01-01T00:00:00Z", indice="99998888"), bon)

    def test_sub_agents_of_the_controls(self):
        p = self.ecrit("coord", journal())
        sd = os.path.join(p[:-6], "subagents")
        os.makedirs(sd)
        Path(sd, "agent-a1.jsonl").write_text("".join(journal("Tu es chargé du poste **securite** pour le ticket DM-7854.")))
        Path(sd, "agent-a1.meta.json").write_text(json.dumps({"model": "opus", "description": "Security review"}))
        Path(sd, "agent-a2.jsonl").write_text("".join(journal("Tu es chargé du poste **regles** pour le ticket DM-7854.")[:3]))
        s = L.sous_agents(p, (WS,))
        self.assertEqual([(x["poste"], x["modele"], x["n"]) for x in s], [("securite", "opus", 8), ("regles", None, 1)])
        self.assertEqual(s[0]["a"][1], "rapport")
        self.assertIn("p", s[0])
        self.assertNotIn("p", L.sous_agents(p, (WS,), texte=False)[0])
        d = L.lecteur_claude(None, {"status": "Success"}, "coord", WS, mission="regles")
        self.assertEqual(sum(d["compte"].values()), 1)


class DetailTest(Base):
    def test_agent_from_kronn_never_guessed_and_fallbacks(self):
        self.assertIsNone(L.detail({"status": "Running"}, WS))  # aucun agent enregistré : rien
        k = {"category": "Read", "calls": 4, "at": "2026-10-30T10:00:00Z"}
        self.assertEqual(L.detail({"status": "Running", "step_agent": "Codex", "last_activity": k}, WS),
                         {"ag": "Codex", "lu": False, "k": {"cat": "Read", "n": 4, "at": "2026-10-30T10:00:00Z"}})
        boom = lambda *a, **kw: 1 / 0  # noqa: E731
        self.addCleanup(L.LECTEURS.update, {"ClaudeCode": L.LECTEURS["ClaudeCode"]})
        L.LECTEURS["ClaudeCode"] = boom
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            d = L.detail({"status": "Running", "step_agent": "ClaudeCode", "last_activity": k}, WS)
        self.assertEqual((d["ag"], d["lu"], "d" in d, d["k"]["n"]), ("ClaudeCode", True, False, 4))
        self.assertIn("ZeroDivisionError", err.getvalue())

    def test_registry_by_agent_type(self):
        self.ecrit("s", journal())
        etape = {"status": "Success", "agent_provenance": {"attempts": [{"agent": "Codex"}, {"agent": "ClaudeCode", "session_id": "s"}]}}
        d = L.detail(etape, WS)
        self.assertEqual(d["ag"], "ClaudeCode")
        self.assertEqual(sum(d["d"]["compte"].values()), 8)

    def test_size_capped(self):
        f = {"ag": "ClaudeCode", "d": {"actions": [["t", "lecture", "x" * 60]] * 10, "phrases": ["y" * 140] * 3},
             "sous": [{"poste": "regles", "p": "z" * 140}] * 5, "diff": {"l": [["f" * 60, 1, 2, 3]] * 7}}
        self.assertLessEqual(len(json.dumps(L.plafonne(f, 900)).encode()), 900)


class DossierTest(Base):
    def git(self, *a):
        subprocess.run(["git", "-C", self.repo, *a], check=True, capture_output=True,
                       env=dict(os.environ, GIT_AUTHOR_NAME="Dwight", GIT_AUTHOR_EMAIL="d@dm.example", GIT_COMMITTER_NAME="Dwight",
                                GIT_COMMITTER_EMAIL="d@dm.example"))

    def test_files_touched_rapport_and_carnet(self):
        self.repo = os.path.join(self.tmp, "dm-site")
        os.makedirs(os.path.join(self.repo, "src"))
        self.git("init", "-q", "-b", "main")
        Path(self.repo, "src", "a.php").write_text("a\n")
        self.git("add", ".")
        self.git("commit", "-qm", "init")
        self.git("branch", "depart")
        Path(self.repo, "src", "a.php").write_text("a\nb\nc\n")
        self.git("commit", "-qam", "feat(bloc-media): les options du lecteur acceptent autoplay : un secret de plus")
        Path(self.repo, "src", "b.php").write_text("x\ny\n")
        Path(self.repo, ".kronn", "chaine").mkdir(parents=True)
        f = L.fichiers(self.repo, "depart")
        self.assertEqual((f["n"], f["plus"], f["encours"]), (2, 4, 1))
        self.assertEqual({x[0] for x in f["l"]}, {"src/a.php", "src/b.php"})
        self.assertEqual(f["commits"], [])  # le sujet parle d'un secret : écarté (seul type(portée) part, et pas celui-là)
        Path(self.repo, "src", "a.php").write_text("a\nb\nc\nd\n")
        self.git("commit", "-qam", "fix(cache): durée lue dans la config")
        self.assertEqual([c[1] for c in L.fichiers(self.repo, "depart")["commits"]], ["fix(cache)"])
        self.assertIsNone(L.fichiers(os.path.join(self.tmp, "pas-un-depot")))
        ch = os.path.join(self.repo, ".kronn", "chaine")
        Path(ch, "securite.json").write_text(json.dumps({"poste": "securite", "statut": "a_corriger", "resultat": {
            "resume": "L'option s'affiche brute dans " + WS + "/templates/x.twig.", "constats": [
                {"gravite": "avis", "fichier": "src/Player/PlayerOptions.php", "ligne": 31, "probleme": "liste ouverte", "correction": "la fermer"},
                {"gravite": "bloquant", "fichier": "templates/blocks/media.html.twig", "ligne": 14, "probleme": "valeur affichée avec |raw",
                 "correction": "lancer `php bin/console cache:clear --env=prod` puis échapper"}]}}))
        r = L.rapport(ch, "securite")
        self.assertEqual((r["statut"], r["n"]), ("a_corriger", {"bloquant": 1, "avis": 1}))
        self.assertEqual(r["constats"][0][:2], ["bloquant", "media.html.twig:14"])
        self.assertNotRegex(json.dumps(r), ABS)
        self.assertNotIn("--env", json.dumps(r))
        Path(ch, "securite.json").write_text("{tronqué")
        self.assertIsNone(L.rapport(ch, "securite"))
        self.assertIsNone(L.carnet(ch))
        Path(ch, "journal.md").write_text("- Lot 1 commité.\n\n- Le token est dans .env\n- Je relance les tests du bloc média.\n")
        self.assertEqual(L.carnet(ch), ["Je relance les tests du bloc média.", "Lot 1 commité."])

    def test_carnet_written_by_the_chain_is_filtered_and_bounded(self):
        """Le carnet de la chaîne (consigne de templates.CARNET_POSTES) : « HH:MM · poste · texte », les postes demandés
        seulement, la plus récente d'abord, 5 au plus, 120 signes ; une ligne avec un secret, une valeur de jeton ou une
        commande entière est écartée, un chemin absolu devient le nom du fichier."""
        ch = os.path.join(self.tmp, "ch")
        os.makedirs(ch)
        Path(ch, "journal.md").write_text("\n".join([
            "09:58 · plan · Je cherche où le bloc média est rendu.",
            "10:02 · code · Je lis " + WS + "/src/Block/MediaBlock.php avant de toucher aux options.",
            "10:03 · code · Je lance docker compose exec php vendor/bin/phpunit tests/Block",
            "10:04 · code · Lancé: git commit --no-verify -s -m lot 1",
            "10:05 · code · cd " + WS + " && rtk proxy make test",
            "10:06 · code · Le mot de passe de la base est dans le .env",
            "10:07 · code · J'utilise ghp_abcdefghijklmnopqrstuvwxyz0123 pour lire la PR.",
            "10:08 · code · Lot 1 commité avec son test, le php du contrôleur est relu.",
            "9h09 · code · " + "Je relance les tests ciblés du bloc média " * 5,
            "10:10 · regles · Je compare le diff aux conventions du dépôt.",
            "texte hors format",
            "10:11 · code · Lot 2 : la traduction de l'option.",
            "10:12 · code · Lot 3 : le cache suit l'option.",
            "10:13 · code · Lot 4 : la doc du bloc.",
        ]) + "\n")
        c = L.carnet(ch, ("code",))
        self.assertEqual(len(c), 5)
        self.assertEqual(c[0], "10:13 · code · Lot 4 : la doc du bloc.")
        self.assertEqual(c[3][:15], "09:09 · code · ")
        self.assertLessEqual(len(c[3]) - 15, 120)
        self.assertEqual(c[4], "10:08 · code · Lot 1 commité avec son test, le php du contrôleur est relu.")
        tout = L.carnet(ch, ("code",), n=50)
        self.assertEqual(tout[-1], "10:02 · code · Je lis MediaBlock.php avant de toucher aux options.")
        blob = json.dumps(tout)
        for x in ("phpunit", "--no-verify", "rtk", "mot de passe", "ghp_", "plan ·", "regles", "hors format"):
            self.assertNotIn(x, blob)
        self.assertNotRegex(blob, ABS)
        self.assertEqual(L.carnet(ch, ("regles", "doc")), ["10:10 · regles · Je compare le diff aux conventions du dépôt."])
        self.assertIsNone(L.carnet(ch, ()))
        self.assertIn("texte hors format", L.carnet(ch, n=50))  # sans filtre : une ligne hors format reste montrée


class ReleveTest(Base):
    """Les relevés des étages : le fait d'un bureau, et rien ne casse quand le lecteur manque ou lève."""

    def chaine(self, agent="ClaudeCode"):
        ws = os.path.join(self.tmp, "ws")
        ch = os.path.join(ws, ".kronn", "chaine")
        os.makedirs(ch, exist_ok=True)
        Path(ch, "etat.json").write_text(json.dumps({"depart": "origin/main"}))
        Path(ch, "securite.json").write_text(json.dumps({"poste": "securite", "statut": "a_corriger", "resultat": {
            "resume": "L'option s'affiche brute.", "constats": [{"gravite": "bloquant", "fichier": "t/media.html.twig", "ligne": 14,
                                                                  "probleme": "|raw", "correction": "échapper"}]}}))
        self.ecrit("code", journal(), dossier=ws)
        prep = {"step_name": "prepare", "status": "Success", "output": "DM-7854 sur dm/site : branche kronn/DM-7854"}
        run = {"id": "r1", "workflow_id": "c", "status": "Running", "started_at": "2001-01-01T00:00:00Z", "workspace_path": ws, "step_results": [
            prep, {"step_name": "cadrage", "status": "Success"}, {"step_name": "gate_plan", "status": "Success"},
            {"step_name": "controles", "status": "Success"}, {"step_name": "code", "status": "Running", "step_kind": "SubWorkflow"}]}
        kid = {"id": "k1", "status": "Running", "parent_run_id": "r1", "step_results": [
            {"step_name": "code", "status": "Running", "step_kind": "Agent", "step_agent": agent, "started_at": "2001-01-01T00:00:00Z",
             "last_activity": {"category": "Edit", "at": "2026-10-30T10:00:11Z", "calls": 8}}]}
        ctrl = {"id": "k2", "status": "Success", "parent_run_id": "r1", "step_results": [
            {"step_name": "range", "status": "Success", "output": '{"securite": "a_corriger"}'}]}
        return {"/workflows/c/runs?limit=40": [{k: v for k, v in run.items() if k != "step_results"}], "/workflows/c/runs/r1": run,
                "/workflows/code/runs?limit=60": [{"id": "k1", "parent_run_id": "r1"}], "/workflows/code/runs/k1": kid,
                "/workflows/ctl/runs?limit=60": [{"id": "k2", "parent_run_id": "r1"}], "/workflows/ctl/runs/k2": ctrl}

    def snap(self, api):
        import atelier_snapshot as a
        old = (a.get, dict(a.CFG), a.CAUSES)
        a.get, a.CAUSES = (lambda p: api.get(p)), os.path.join(self.tmp, "causes.json")
        a.CFG["models"] = {"impl_chain": "c", "impl_code": "code", "impl_controles": "ctl"}
        try:
            return a.snapshot("2026-10-30T12:00:00+00:00")
        finally:
            a.get, a.CAUSES = old[0], old[2]
            a.CFG.clear()
            a.CFG.update(old[1])

    def test_atelier_room_says_what_its_agent_does(self):
        rm = self.snap(self.chaine())["rooms"][0]
        f = rm["fait"]
        self.assertEqual((f["ag"], f["lu"], f["poste"], f["k"]["n"]), ("ClaudeCode", True, "code", 8))
        self.assertEqual(f["d"]["actions"][0][1], "rapport")
        self.assertEqual((f["fini"]["poste"], f["fini"]["rapport"]["n"]), ("securite", {"bloquant": 1, "avis": 0}))
        self.assertNotRegex(json.dumps(f), ABS)
        self.assertLess(len(json.dumps(f).encode()), 6000)

    def test_atelier_shows_the_carnet_of_the_agent_at_work_only(self):
        """Le carnet tient toute la chaîne : le bureau du Code ne montre que les lignes du poste code (pas celles du Plan),
        et la bulle les reprend sans « HH:MM · poste · » (tests/fait.test.js)."""
        api = self.chaine()
        Path(self.tmp, "ws", ".kronn", "chaine", "journal.md").write_text(
            "09:58 · plan · Je cherche où le bloc média est rendu.\n10:02 · code · Lot 1 : les options du lecteur.\n")
        f = self.snap(api)["rooms"][0]["fait"]
        self.assertEqual(f["carnet"], ["10:02 · code · Lot 1 : les options du lecteur."])
        import atelier_snapshot as a
        import templates
        self.assertEqual(set(a.CARNET_DE.values()) - {(p,) for p in ("plan", "code", "tests", "retours")},
                         {("controles", *templates.CARNET_SOUS)})  # les noms que la consigne fait écrire
        self.assertEqual(set(templates.CARNET_POSTES.values()), {x for v in a.CARNET_DE.values() for x in v} - set(templates.CARNET_SOUS))

    def test_atelier_without_reader_or_with_a_failing_one_keeps_the_room(self):
        f = self.snap(self.chaine("Codex"))["rooms"][0]["fait"]
        self.assertEqual((f["ag"], f["lu"], "d" in f, f["k"]["n"]), ("Codex", False, False, 8))
        self.addCleanup(L.LECTEURS.update, {"ClaudeCode": L.LECTEURS["ClaudeCode"]})
        L.LECTEURS["ClaudeCode"] = lambda *a, **k: [][1]
        with contextlib.redirect_stderr(io.StringIO()):
            rm = self.snap(self.chaine())["rooms"][0]
        self.assertEqual((rm["ticket"], rm["poste"], "d" in rm["fait"], rm["fait"]["fini"]["poste"]), ("DM-7854", "code", False, "securite"))

    def test_retours_and_redaction(self):
        import retours_snapshot as rt
        import redaction_snapshot as rd
        work = os.path.join(self.tmp, "work")
        os.makedirs(work)
        self.ecrit("fix", journal(KRONN_PROMPT + " pr/work/run-fix"), dossier="/Users/dwight/Sites/Kronn")
        self.addCleanup(setattr, rt, "get", rt.get)
        rt.get = lambda p: [{"id": "p1", "path": "/Users/dwight/Sites/Kronn"}] if p == "/projects" else None
        rt.PROJETS.clear()
        s = {"step_name": "fix", "status": "Running", "step_agent": "ClaudeCode", "started_at": "2001-01-01T00:00:00Z"}
        f = rt.fait({"id": "run-fix", "status": "Running", "project_id": "p1"}, s, {"work": work})
        self.assertEqual(sum(f["d"]["compte"].values()), 8)
        self.assertIsNone(rt.fait({"id": "run-fix", "status": "Success", "project_id": "p1"}, s, {"work": work}))
        rv = os.path.join(self.tmp, "rv")
        self.ecrit("lecture", journal(KRONN_PROMPT + " Review la PR #2084 (`dm/site`) · poste lecture"), dossier=rv)
        self.addCleanup(setattr, rd, "get", rd.get)
        rd.CFG.setdefault("models", {})["review_lecture"] = "rl"
        kid = {"id": "q1", "parent_run_id": "v1", "step_results": [{"step_name": "agent", "status": "Running", "step_agent": "ClaudeCode",
                                                                     "started_at": "2001-01-01T00:00:00Z"}]}
        rd.get = lambda p: {"/workflows/rl/runs?limit=30": [{"id": "q1", "parent_run_id": "v1"}], "/workflows/rl/runs/q1": kid}.get(p)
        run = {"id": "v1", "workspace_path": rv, "state": {"pr": "2084"}, "step_results": [{"step_name": "lecture", "status": "Running", "step_kind": "SubWorkflow"}]}
        f = rd.fait_poste(run, ("contexte", "docs", "lecture", "securite"), "review_", {}, indice="#2084")
        self.assertEqual(f["poste"], "lecture")
        self.assertEqual(f["lus"][:2], ["config", "tests/Block/MediaBlockTest.php"])
        self.assertIsNone(rd.fait_poste(run, ("contexte",), "review_", {}, indice="#9999"))


class RenduTest(unittest.TestCase):
    def test_only_the_relevés_that_import_it_carry_it(self):
        import templates
        cfg = json.loads(Path(ROOT, "tests", "fixtures", "bureau.config.json").read_text())
        for rel in ("workflows/atelier_snapshot.py", "workflows/retours_snapshot.py", "workflows/redaction_snapshot.py", "workflows/live_snapshot.py"):
            code = templates.script_code(rel, cfg)
            self.assertEqual(code.count("def lis_journal("), 1, rel)
            self.assertEqual(code.count("def read_json("), 1, rel)
            compile(code, rel, "exec")
        for rel in ("workflows/chaine.py", "workflows/support.py", "workflows/review.py", "workflows/office_snapshot.py"):
            self.assertNotIn("def lis_journal(", templates.script_code(rel, cfg), rel)

    def test_no_name_of_the_module_is_redefined_by_a_host_script(self):
        def top(path):
            t, out = ast.parse(Path(path).read_text()), set()
            for n in t.body:
                if isinstance(n, (ast.FunctionDef, ast.ClassDef)):
                    out.add(n.name)
                elif isinstance(n, ast.Assign):
                    out |= {x.id for tg in n.targets for x in ast.walk(tg) if isinstance(x, ast.Name)}
            return out
        mine = top(os.path.join(ROOT, "workflows", "_lecteurs.py"))
        for f in ("_lib.py", "atelier_snapshot.py", "retours_snapshot.py", "redaction_snapshot.py", "live_snapshot.py"):
            self.assertEqual(mine & top(os.path.join(ROOT, "workflows", f)), set(), f)


if __name__ == "__main__":
    unittest.main()
