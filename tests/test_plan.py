"""Vérificateur de plans (python3 -m unittest tests/test_plan.py) : le plan par défaut passe, chaque défaut est signalé."""
import copy, json, os, sys, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import plan  # noqa: E402

BASE = json.load(open(os.path.join(ROOT, "layouts", "equipe.json")))


def broken(**changes):
    L = copy.deepcopy(BASE)
    for k, f in changes.items():
        f(L)
    return plan.validate(L)[0]


def set_tile(L, x, y, ch):
    L["tiles"][y] = L["tiles"][y][:x] + ch + L["tiles"][y][x + 1:]


class PlanTest(unittest.TestCase):
    def test_default_plan_is_valid(self):
        err, warn = plan.validate(BASE)
        self.assertEqual(err, [])

    def test_example_plan_is_valid(self):
        L = json.load(open(os.path.join(ROOT, "layouts", "exemple-startup.json")))
        err, warn = plan.validate(L)
        self.assertEqual(err, [])
        self.assertTrue(any("stage" in w for w in warn))  # sans plateau TV : repli, simple avertissement

    def test_sketch_example_is_valid(self):
        """Brouillon tiré de docs/img/croquis.png par plan.py from-image (capture croquis-brouillon de la doc)."""
        L = json.load(open(os.path.join(ROOT, "docs", "exemples", "plan-croquis.json")))
        self.assertEqual(plan.validate(L)[0], [])

    def test_seat_ids(self):
        ids = {(s["x"], s["y"]): s["id"] for s in plan.seats_of(BASE)}
        self.assertEqual(ids[(12, 15)], "I2.R2")  # exemple de numéro
        self.assertEqual(ids[(23, 14)], "I4.L1")  # Dwight
        self.assertEqual(len(ids), 36)

    def assertErr(self, errors, fragment):
        self.assertTrue(any(fragment in e for e in errors), f"« {fragment} » absent de {errors}")

    def test_shape_errors(self):
        self.assertErr(broken(a=lambda L: L["tiles"].__setitem__(3, L["tiles"][3][:-1])), "rangée 3")
        self.assertErr(broken(a=lambda L: set_tile(L, 5, 5, "?")), "absent de legend")
        self.assertErr(broken(a=lambda L: L.__setitem__("format", "autre")), "format")
        self.assertErr(broken(a=lambda L: set_tile(L, 3, 1, ".")), "mur du fond")

    def test_exit_and_doors(self):
        self.assertErr(broken(a=lambda L: L.__setitem__("exit", [20, 12])), "exit")
        self.assertErr(broken(a=lambda L: L["plants"].append([12, 6])), "porte [12, 6] bloquée")

    def test_unreachable_seat(self):
        # une rangée de plantes entre l'open space et les îlots de droite : les allées ne sont plus accessibles
        def wall_off(L):
            L["plants"] += [[34, y] for y in range(6, 19)]
        self.assertErr(broken(a=wall_off), "n'est pas accessible depuis la sortie")

    def test_zones(self):
        self.assertErr(broken(a=lambda L: L["spots"].pop("wc")), "zone « wc »")
        self.assertErr(broken(a=lambda L: L["spots"]["meet"].__setitem__(0, [19, 3, "down"])), "sur un meuble")
        self.assertErr(broken(a=lambda L: L["spots"]["srv"].append([0, 0, "up"])), "pas sur du sol")

    def test_malformed_plan_is_an_error_not_a_crash(self):
        self.assertErr(broken(a=lambda L: L.update(islands="x")), "structure inattendue")
        self.assertErr(broken(a=lambda L: L["spots"]["wc"].append(None)), "structure inattendue")

    def test_boss_is_required(self):
        self.assertErr(broken(a=lambda L: L.pop("boss")), "boss : seat")
        self.assertErr(broken(a=lambda L: L["boss"].pop("desk")), "boss : seat")

    def test_objects_and_seats(self):
        self.assertErr(broken(a=lambda L: L["objects"].pop("tv")), "objet « tv »")
        self.assertErr(broken(a=lambda L: L["free_seats"].append([20, 12])), "n'est pas un siège")

    def test_check_json_output(self):
        import io, contextlib
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = plan.main(["check", os.path.join(ROOT, "layouts", "equipe.json"), "--json"])
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(buf.getvalue())["errors"], [])


if __name__ == "__main__":
    unittest.main()


class CatalogueTest(unittest.TestCase):
    def test_python_and_page_catalogues_agree(self):
        import subprocess
        js = ("const {load}=require('./tests/helpers/page.js');const p=load();"
              "console.log(p.run('JSON.stringify(Object.fromEntries(Object.entries(FURN_TYPES).map(([k,t])=>[k,t.foot])))'))")
        page = json.loads(subprocess.run(["node", "-e", js], cwd=ROOT, capture_output=True, text=True, check=True).stdout)
        self.assertEqual(page, plan.FURNITURE)

    def test_unknown_furniture_and_decor(self):
        self.assertTrue(any("inconnu" in e for e in broken(a=lambda L: L["furniture"].append({"type": "trampoline", "at": [20, 12]}))))
        self.assertTrue(any("il faut un mur" in e for e in broken(a=lambda L: L["wall"].append({"type": "mirror", "at": [20, 12]}))))

    def test_optional_zone_is_a_warning(self):
        L = copy.deepcopy(BASE)
        L["spots"].pop("sofa")
        err, warn = plan.validate(L)
        self.assertEqual(err, [])
        self.assertTrue(any("sofa" in w for w in warn))


class SeatingTest(unittest.TestCase):
    PEOPLE = [{"key": "a"}, {"key": "b", "seat": [12, 14]}, {"key": "c", "seat": "I6.R3"}, {"key": "d"}]

    def test_plan_is_master(self):
        L = dict(BASE, seating={"I1.L1": "b"})
        got, _ = plan.assign(L, self.PEOPLE)
        self.assertEqual(got["b"], "I1.L1")  # le plan l'emporte sur la place [12, 14] de la personne
        self.assertEqual(got["c"], "I6.R3")  # place de repli au nouveau format
        self.assertNotIn(got["a"], {"I1.L1", "I6.R3"})

    def test_stable_when_someone_arrives(self):
        L = dict(BASE, seating={})
        before, _ = plan.assign(L, self.PEOPLE)
        after, _ = plan.assign(L, self.PEOPLE + [{"key": "e"}])
        self.assertEqual({k: after[k] for k in before}, before)

    def test_boss_seat_goes_to_temps(self):
        got, temps = plan.assign(BASE, [{"key": "p_pam"}], owner="p_pam")
        self.assertNotIn("p_pam", got)
        self.assertIn("I2.R2", temps)

    def test_seating_errors(self):
        self.assertErr(broken(a=lambda L: L["seating"].update({"I9.L1": "x"})), "pas un siège de ce plan")
        self.assertErr(broken(a=lambda L: L["seating"].update({"I6.L1": next(iter(L["seating"].values()))})), "plusieurs sièges")
        self.assertErr(broken(a=lambda L: L.update(seating=["p_pam"])), "seating : un objet")

    assertErr = PlanTest.assertErr


# faux CLI claude : note ses arguments et rend, appel après appel, les réponses de answers.json (la dernière ensuite)
FAKE_CLAUDE = """#!/usr/bin/env python3
import json, os, sys
d = os.path.dirname(os.path.abspath(__file__))
log = os.path.join(d, "calls.json")
calls = json.load(open(log)) if os.path.exists(log) else []
calls.append(sys.argv[1:])
json.dump(calls, open(log, "w"))
answers = json.load(open(os.path.join(d, "answers.json")))
print(json.dumps({"type": "result", "is_error": False, "session_id": "s1", "result": answers[min(len(calls), len(answers)) - 1]}))
"""


class FromImageTest(unittest.TestCase):
    """plan.py from-image sans appeler Claude : brouillon, vérification, corrections, abandon, refus, formats."""

    def setUp(self):
        import tempfile
        from unittest import mock
        self.dir = tempfile.mkdtemp()
        self.addCleanup(__import__("shutil").rmtree, self.dir)
        fake = os.path.join(self.dir, "claude")
        with open(fake, "w") as f:
            f.write(FAKE_CLAUDE)
        os.chmod(fake, 0o755)
        self.image = os.path.join(self.dir, "croquis.png")
        with open(self.image, "wb") as f:
            f.write(b"\x89PNG\r\n\x1a\n" + b"0" * 20)
        self.out = os.path.join(self.dir, "plan.json")
        for p in (mock.patch.object(plan, "CLAUDE", fake), mock.patch.object(plan, "cmd_preview", lambda *a: 0),
                  mock.patch("sys.stdin", __import__("io").StringIO())):  # pas un terminal : pas de question avant share
            p.start()
            self.addCleanup(p.stop)

    def answers(self, *plans):
        json.dump([x if isinstance(x, str) else "Voici le plan :\n```json\n" + json.dumps(x) + "\n```" for x in plans],
                  open(os.path.join(self.dir, "answers.json"), "w"))

    def calls(self):
        path = os.path.join(self.dir, "calls.json")
        return json.load(open(path)) if os.path.exists(path) else []

    def run_cmd(self, image=None):
        import io, contextlib
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = plan.main(["from-image", image or self.image, "-o", self.out])
        return code, buf.getvalue()

    def test_draft_corrected_until_valid(self):
        bad = copy.deepcopy(BASE)
        bad["tiles"][3] = bad["tiles"][3][:-1]
        self.answers(dict(bad, _notes=["salle serveurs ajoutée"]), dict(BASE, _notes=["salle serveurs ajoutée"]))
        code, out = self.run_cmd()
        self.assertEqual(code, 0, out)
        self.assertIn("plan valide en 2 tour(s)", out)
        self.assertIn("hypothèse : salle serveurs ajoutée", out)
        saved = json.load(open(self.out))
        self.assertNotIn("_notes", saved)
        self.assertEqual(plan.validate(saved)[0], [])
        first, second = self.calls()
        self.assertIn(self.image, first[1])  # l'image et le format dans le premier message
        self.assertIn("bureau-layout/1", first[1])
        self.assertNotIn("--resume", first)
        self.assertEqual(second[second.index("--resume") + 1], "s1")  # même conversation
        self.assertIn("rangée 3", second[1])  # les erreurs du vérificateur
        self.assertEqual(first[first.index("--tools") + 1], "Read")  # lecture seule

    def test_gives_up_after_rounds(self):
        self.answers("pas de JSON ici")
        code, out = self.run_cmd()
        self.assertEqual(code, 1)
        self.assertEqual(len(self.calls()), plan.ROUNDS)
        self.assertIn(f"après {plan.ROUNDS} tours", out)

    def test_refusal_stops_at_once(self):
        self.answers('{"_error": "c\'est une photo de chat"}')
        code, out = self.run_cmd()
        self.assertEqual(code, 1)
        self.assertEqual(len(self.calls()), 1)
        self.assertIn("photo de chat", out)

    def test_image_formats(self):
        pdf = os.path.join(self.dir, "plan.pdf")
        with open(pdf, "wb") as f:
            f.write(b"%PDF-1.7 ...")
        code, out = self.run_cmd(pdf)
        self.assertEqual(code, 1)
        self.assertIn("PNG, JPEG ou WebP", out)
        self.assertEqual(self.calls(), [])
        for head, kind in ((b"\xff\xd8\xff\xe0", "jpeg"), (b"RIFF\x00\x00\x00\x00WEBPVP8 ", "webp")):
            with open(pdf, "wb") as f:
                f.write(head + b"0" * 8)
            self.assertEqual(plan.image_kind(pdf), kind)
