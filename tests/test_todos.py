"""Mes todos (python3 -m unittest tests/test_todos.py) : workflows/todos.py, relevé et enregistrement, contre le faux Kronn
de test_scripts.py complété des routes des tâches (/planning/tasks) ; horloge figée comme pour les autres scripts."""
import base64, json, os, re, shutil, subprocess, sys, tempfile, unittest
from datetime import timedelta, timezone
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import test_scripts as ts  # noqa: E402  (module seulement : ses tests ne sont pas relancés ici)

TAG = "bureau-todo"


def ago(hours):
    return (ts.NOW.astimezone(timezone.utc) - timedelta(hours=hours)).isoformat().replace("+00:00", "Z")


def task(i, title, status="todo", hours=1, discs=(), tags=(TAG,), priority="normal", rank=None):
    return {"id": f"t{i}", "reference": f"KT-{i}", "title": title, "status": status, "priority": priority, "rank": rank if rank is not None else i,
            "tags": list(tags), "discussion_ids": list(discs), "created_at": ago(hours + 1), "updated_at": ago(hours)}


class FakeTasks(ts.FakeKronn):
    """Le faux Kronn de test_scripts.py, avec les tâches : liste filtrée par tag (archivées exclues, comme Kronn), création
    idempotente, PATCH de statut, liaison d'une discussion."""

    def __init__(self, tasks=(), missing=False):
        super().__init__()
        self.tasks, self.missing, self.patches, self.keys = [dict(t) for t in tasks], missing, [], {}

    def route(self, path):
        u = urlparse(path)
        if u.path == "/api/planning/tasks":
            if self.missing:
                raise KeyError(path)
            tag = parse_qs(u.query).get("tag", [""])[0]
            return {"items": [t for t in self.tasks if tag in t["tags"] and t["status"] != "archived"], "next_cursor": None}
        return super().route(path)

    def post(self, path, body):
        p = urlparse(path).path.removeprefix("/api")
        if p == "/planning/tasks":
            self.posts.append((p, body))
            if body.get("idempotency_key") in self.keys:
                return self.keys[body["idempotency_key"]]
            t = task(100 + len(self.tasks), body["title"], body.get("status", "todo"), 0, tags=body.get("tags") or [], priority=body.get("priority"))
            self.tasks.append(t)
            self.keys[body.get("idempotency_key")] = t
            return t
        m = re.fullmatch(r"/planning/tasks/([\w-]+)/discussions", p)
        if m:
            self.posts.append((p, body))
            t = next(t for t in self.tasks if t["id"] == m.group(1))
            t["discussion_ids"].append(body["discussion_id"])
            return t
        return super().post(path, body)

    def patch(self, path, body):
        m = re.fullmatch(r"/api/planning/tasks/([\w-]+)", urlparse(path).path)
        t = next(t for t in self.tasks if t["id"] == m.group(1))
        self.patches.append((t["id"], body))
        t.update({k: v for k, v in body.items() if k != "actor"}, updated_at=ago(0))
        return t


def code(*ops):
    return "TODO1:" + base64.b64encode(json.dumps({"at": 1, "ops": list(ops)}).encode()).decode()


class TodosTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.srv = None

    def tearDown(self):
        if self.srv:
            self.srv.shutdown()
            self.srv.server_close()
        shutil.rmtree(self.tmp)

    def run_todos(self, fake, *args, stdin=""):
        self.srv = self.srv or ts.serve(fake)
        cfg = dict(ts.FIXTURE, kronn=dict(ts.FIXTURE["kronn"], api=f"http://127.0.0.1:{self.srv.server_address[1]}/api"))
        path = os.path.join(self.tmp, "bureau.config.json")
        with open(path, "w") as fh:
            json.dump(cfg, fh)
        return subprocess.run([sys.executable, os.path.join(ts.ROOT, "workflows", "todos.py"), *args], input=stdin, capture_output=True,
                              text=True, env={"BUREAU_CONFIG": path, "HOME": self.tmp, "PATH": "/usr/bin:/bin", **ts.CLOCK}, timeout=60)

    def snap(self, fake, *args, stdin=""):
        r = self.run_todos(fake, *args, stdin=stdin)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertLess(len(r.stdout.encode()), ts.LIMIT)
        return json.loads(r.stdout)

    def test_snapshot_columns_order_and_recent_done_only(self):
        fake = FakeTasks([task(1, "Relire la spec", rank=2), task(2, "Répondre à Holly", rank=1), task(3, "Fastly", "in_progress", discs=["d9"]),
                          task(4, "Faite à l'instant", "done", 0.5), task(5, "Faite il y a 3 jours", "done", 72), task(6, "Archivée", "archived"),
                          task(7, "Autre tâche Kronn", tags=("autre",)), task(8, "Idée", "idea", priority="critical")])
        out = self.snap(fake)
        rows = [(t["title"], t["col"]) for t in out["todos"]]
        self.assertEqual(rows, [("Répondre à Holly", "todo"), ("Relire la spec", "todo"), ("Idée", "todo"), ("Fastly", "duck"),
                                ("Faite à l'instant", "done")])
        fastly = next(t for t in out["todos"] if t["col"] == "duck")
        self.assertEqual((fastly["disc"], fastly["ref"]), ("d9", "KT-3"))
        self.assertEqual(next(t for t in out["todos"] if t["title"] == "Idée")["priority"], "high")  # critical : urgent

    def test_snapshot_without_the_tasks_api_is_empty(self):
        self.assertEqual(self.snap(FakeTasks(missing=True))["todos"], [])

    def test_save_applies_every_change_then_publishes(self):
        fake = FakeTasks([task(1, "Relire la spec"), task(2, "Répondre à Holly"), task(3, "Vieille idée")])
        out = self.snap(fake, "save", stdin=code({"op": "add", "key": "tmp-abc1", "title": "  Appeler Jan  ", "priority": "high"},
                                                  {"op": "move", "id": "t1", "to": "done"}, {"op": "delete", "id": "t3"},
                                                  {"op": "duck", "id": "t2"}))
        created = next(b for p, b in fake.posts if p == "/planning/tasks")
        self.assertEqual((created["title"], created["tags"], created["priority"], created["idempotency_key"]),
                         ("Appeler Jan", [TAG], "high", "bureau-todo:tmp-abc1"))
        self.assertIn(("t1", {"status": "done", "actor": {"kind": "human", "id": "bureau"}}), fake.patches)
        self.assertEqual(next(t for t in fake.tasks if t["id"] == "t3")["status"], "archived")
        # le canard : une discussion « 🦆 <titre> », lancée, liée à la tâche, qui passe en cours
        disc = next(b for p, b in fake.posts if p == "/discussions")
        self.assertEqual(disc["title"], "🦆 Répondre à Holly")
        self.assertIn("/discussions/dd000001/run", [p for p, _ in fake.posts])
        self.assertEqual(next(t for t in fake.tasks if t["id"] == "t2")["discussion_ids"], ["dd000001"])
        cols = {t["title"]: t["col"] for t in out["todos"]}
        self.assertEqual(cols, {"Appeler Jan": "todo", "Répondre à Holly": "duck", "Relire la spec": "done"})

    def test_same_code_twice_creates_one_task_and_one_discussion(self):
        fake = FakeTasks([task(2, "Répondre à Holly")])
        c = code({"op": "add", "key": "tmp-abc1", "title": "Appeler Jan"}, {"op": "duck", "id": "t2"})
        self.snap(fake, "save", stdin=c)
        self.snap(fake, "save", stdin=c)
        self.assertEqual(sum(1 for t in fake.tasks if t["title"] == "Appeler Jan"), 1)
        self.assertEqual(sum(1 for p, _ in fake.posts if p == "/discussions"), 1, "déjà liée à sa discussion : pas une seconde")

    def test_bad_codes_change_nothing(self):
        fake = FakeTasks([task(1, "Relire la spec"), task(7, "Autre tâche Kronn", tags=("autre",))])
        for c, why in ((" pas un code ", "TODO1:"), ("TODO1:Zm9v", "illisible"), (code(), "aucun changement"),
                       (code({"op": "move", "id": "t7", "to": "done"}), "n'existe pas"),  # pas taguée : jamais touchée
                       (code({"op": "move", "id": "t1", "to": "done"}, {"op": "add", "key": "tmp-abc1", "title": ""}), "titre"),
                       (code({"op": "move", "id": "t1", "to": "archived"}), "colonne"), (code({"op": "wipe"}), "inconnue"),
                       (code(*[{"op": "move", "id": "t1", "to": "done"}] * 51), "trop")):
            r = self.run_todos(fake, "save", stdin=c)
            self.assertEqual(r.returncode, 1, c)
            self.assertIn(why, r.stderr)
        self.assertEqual((fake.patches, [p for p, _ in fake.posts]), ([], []))


if __name__ == "__main__":
    unittest.main()
