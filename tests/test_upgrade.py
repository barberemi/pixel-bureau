"""Mise à jour en une commande (python3 -m unittest tests/test_upgrade.py) : tools/upgrade.py contre le faux Kronn de
test_install.py, après une vraie installation. Aucune question, rien en double, ce qui manque créé, la config sauvegardée."""
import builtins, datetime, io, json, os, sys, unittest
from pathlib import Path
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
sys.path.insert(0, os.path.join(ROOT, "tests"))
import install, upgrade  # noqa: E402
import test_install  # noqa: E402  (pas « from … import InstallTest » : ses tests tourneraient ici aussi)
ANSWERS = test_install.ANSWERS

CREATE = ("/pages", "/workflows", "/quick-prompts", "/skills")


class NoQuestion(install.Asker):
    def _get(self, *a, **k):
        raise AssertionError("la mise à jour ne pose aucune question")


class UpgradeTest(unittest.TestCase):
    """Le décor de test_install.py (équipe du pack fictif, faux Kronn) sans ses tests : une installation, puis la mise à jour."""
    write_answers, run_install, tearDown = test_install.InstallTest.write_answers, test_install.InstallTest.run_install, test_install.InstallTest.tearDown

    def setUp(self):
        test_install.InstallTest.setUp(self)
        self.assertEqual(self.run_install(ANSWERS), 0)
        self.k = self.fakes[-1]
        self.backups = os.path.join(self.tmp, "sauvegardes")
        for p in (mock.patch.object(install, "Kronn", return_value=self.k), mock.patch.object(upgrade, "BACKUPS", self.backups),
                  mock.patch.object(install, "Asker", NoQuestion),
                  mock.patch.object(builtins, "input", side_effect=AssertionError("aucune question"))):
            p.start()
            self.patches.append(p)
        self.k.calls.clear()

    def cfg(self):
        return json.loads(Path(self.cfg_path).read_text())

    def save(self, cfg):
        Path(self.cfg_path).write_text(json.dumps(cfg))

    def run_upgrade(self, *extra):
        with mock.patch("sys.stdout", new=io.StringIO()) as out:
            self.assertEqual(upgrade.main(["--config", self.cfg_path, *extra]), 0)
        self.out = out.getvalue()
        return self.out

    def creations(self):
        return [(p, b) for m, p, b in self.k.calls if m == "POST" and (p in CREATE or p.endswith("/datasets"))]

    def test_relaunch_creates_nothing_and_publishes(self):
        """Juste après l'installation, deux fois : rien de créé, tout republié."""
        self.run_upgrade()
        self.run_upgrade()
        self.assertEqual(self.creations(), [])
        self.assertIn("créé : rien", self.out)
        self.assertIn("page du Bureau", self.out)
        self.assertFalse([p for _m, p, _b in self.k.calls if p == "/mcp/workflow-trigger"], "pas de premier lancement")

    def test_creates_what_is_missing_for_what_is_installed(self):
        """Ce qu'une version du dépôt ajoute à une installation : datasets, page à part, skill, cron, bouton, poste d'un
        modèle installé. Le cron est créé activé, sans être lancé."""
        cfg = self.cfg()
        page = self.k.store[cfg["page_id"]]
        page["datasets"] = [d for d in page["datasets"] if d["name"] not in ("statuts", "sprintquest", "oeil")]
        retours = cfg.pop("retours_bilan_page_id")
        del self.k.store[retours]
        del self.k.store[cfg["workflows"].pop("canard")]
        del self.k.store[cfg["actions"].pop("todo")]
        del self.k.store[cfg["models"].pop("ticket_un")]
        del self.k.skills[cfg["skills"].pop("doc")]
        self.save(cfg)
        self.run_upgrade()
        new = self.cfg()
        self.assertTrue(new.get("retours_bilan_page_id"))
        self.assertTrue(new["workflows"]["canard"] and new["actions"]["todo"] and new["models"]["ticket_un"] and new["skills"]["doc"])
        self.assertEqual([d["name"] for d in page["datasets"]], install.DATASETS)
        canard = self.k.store[new["workflows"]["canard"]]
        self.assertIs(canard.get("enabled"), True)
        self.assertFalse([p for _m, p, _b in self.k.calls if p == "/mcp/workflow-trigger"])
        for word in ("dataset statuts", "page « Retours · bilan »", "skill doc", "canard (workflow)", "todo (workflow)", "ticket_un (workflow)",
                     "workflows.canard (ajoutée)"):
            self.assertIn(word, self.out)
        # relancée : plus rien à créer
        self.k.calls.clear()
        self.run_upgrade()
        self.assertEqual(self.creations(), [])

    def test_optional_models_are_listed_not_created(self):
        out = self.run_upgrade("--no-publish")
        self.assertIn("disponibles, non installés : impl", out)
        self.assertIn("install.py les propose", out)
        self.assertNotIn("impl", self.cfg().get("models") or {})

    def test_homonym_in_kronn_is_not_duplicated(self):
        """Un workflow du Bureau sans id dans la config mais présent dans Kronn (config perdue) : pas de doublon."""
        cfg = self.cfg()
        cfg["actions"].pop("todo")
        self.save(cfg)
        self.run_upgrade("--no-publish")
        self.assertEqual(self.creations(), [])
        self.assertIn("todo (« ", self.out)
        self.assertNotIn("todo", self.cfg()["actions"])

    def test_ask_without_known_agent_is_skipped(self):
        """La vraie config n'a pas forcément _answers : le Quick Prompt « interroger un agent » n'est pas créé sans agent."""
        cfg = self.cfg()
        cfg.pop("_answers")
        del self.k.qps[cfg["actions"].pop("ask")]
        self.save(cfg)
        self.run_upgrade("--no-publish")
        self.assertEqual(self.creations(), [])
        self.assertIn("ask (aucun agent IA connu", self.out)

    def test_backup_before_writing_and_rotation(self):
        before = Path(self.cfg_path).read_text()
        self.run_upgrade("--no-publish")
        files = os.listdir(self.backups)
        self.assertEqual(len(files), 1)
        self.assertRegex(files[0], r"^config-\d{8}T\d{6}\.json$")
        self.assertEqual(Path(self.backups, files[0]).read_text(), before)
        t = datetime.datetime(2026, 1, 1, 9, 0, 0)
        for i in range(12):
            upgrade.backup(self.cfg_path, now=t + datetime.timedelta(seconds=i))
        upgrade.backup(self.cfg_path, now=t + datetime.timedelta(seconds=11))  # même seconde : une copie de plus
        kept = sorted(os.listdir(self.backups))
        self.assertEqual(len(kept), 10)
        self.assertIn(files[0], kept, "la plus récente, celle de la mise à jour, reste")
        self.assertIn("config-20260101T090011-2.json", kept)
        self.assertNotIn("config-20260101T090000.json", kept)

    def test_dry_run_writes_nothing(self):
        cfg = self.cfg()
        del self.k.store[cfg["workflows"].pop("canard")]
        self.save(cfg)
        before = Path(self.cfg_path).read_text()
        out = self.run_upgrade("--dry-run")
        self.assertEqual(Path(self.cfg_path).read_text(), before)
        self.assertFalse(os.path.exists(self.backups))
        self.assertFalse([m for m, _p, _b in self.k.calls if m != "GET"])
        self.assertIn("serait créé : canard (workflow)", out)

    def test_publishes_workflows_then_page(self):
        self.run_upgrade()
        puts = [p for m, p, _b in self.k.calls if m == "PUT"]
        wf = [i for i, p in enumerate(puts) if p.startswith(("/workflows/", "/quick-prompts/"))]
        pages = [i for i, p in enumerate(puts) if p.startswith("/pages/")]
        self.assertTrue(wf and pages)
        self.assertLess(max(wf), min(pages), "les workflows, puis la page")
        self.assertIn(f"/pages/{self.cfg()['page_id']}/html", puts)

    def test_no_publish_puts_nothing(self):
        self.run_upgrade("--no-publish")
        self.assertFalse([p for m, p, _b in self.k.calls if m == "PUT"])

    def test_migrations_are_named_and_idempotent(self):
        def m(cfg):
            if cfg.get("ui", {}).get("migre"):
                return False
            cfg.setdefault("ui", {})["migre"] = True
            return True
        with mock.patch.object(upgrade, "MIGRATIONS", [("ui.migre", m)]):
            self.run_upgrade("--no-publish")
            self.assertIn("migration : ui.migre", self.out)
            self.assertIn("ui.migre (ajoutée)", self.out)
            self.assertTrue(self.cfg()["ui"]["migre"])
            self.run_upgrade("--no-publish")
            self.assertNotIn("migration : ui.migre", self.out)

    def test_not_installed_is_refused(self):
        os.remove(self.cfg_path)
        with self.assertRaisesRegex(install.InstallError, "install.py"):
            upgrade.upgrade(self.cfg_path)

    def old_kronn(self, size):
        """Kronn dit 0.15.1 et garde la page du Bureau à size octets."""
        orig, pid = self.k.call, self.cfg()["page_id"]

        def call(method, path, body=None, timeout=60):
            if path == "/health":
                return {"ok": True, "version": "0.15.1"}
            if method == "GET" and path == f"/pages/{pid}":
                return {**(orig(method, path, body, timeout) or {}), "html_size_bytes": size}
            return orig(method, path, body, timeout)
        return mock.patch.object(self.k, "call", call)

    def test_old_kronn_that_keeps_the_big_page_goes_on(self):
        """Un Kronn construit depuis main après le tag 0.15.1 garde déjà une page de plus de 1 Mo : la mise à jour
        continue et le dit."""
        with self.old_kronn(1_642_528):
            self.run_upgrade("--no-publish")
        self.assertIn("Kronn dit 0.15.1", self.out)
        self.assertIn("0.15.2 ou plus", self.out)

    def test_old_kronn_with_a_small_page_is_refused(self):
        """Sans preuve qu'il garde une page de plus de 1 Mo, un Kronn d'avant 0.15.2 est refusé, avant toute écriture."""
        with self.old_kronn(900_000), self.assertRaisesRegex(install.InstallError, "0.15.2 ou plus"):
            upgrade.upgrade(self.cfg_path)
        self.assertFalse([1 for m, _p, _b in self.k.calls if m in ("POST", "PUT")])
        self.assertFalse(os.path.isdir(self.backups) and os.listdir(self.backups))


if __name__ == "__main__":
    unittest.main()
