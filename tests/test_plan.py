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

    def test_seat_ids(self):
        ids = {(s["x"], s["y"]): s["id"] for s in plan.seats_of(BASE)}
        self.assertEqual(ids[(12, 15)], "I2.R2")  # la place de Rémi
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
