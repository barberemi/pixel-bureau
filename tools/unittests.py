"""Tests Python du Bureau en parallèle : chaque test de tests/test_*.py tourne dans un pool de processus (un par cœur).

  python3 -W error::ResourceWarning tools/unittests.py            # tous les tests/test_*.py (lancé par tools/test.sh)
  python3 tools/unittests.py tests/test_mep.py tests/test_plan.py  # quelques fichiers
  BUREAU_TEST_JOBS=1 python3 tools/unittests.py                    # un seul processus (déboguer un test qui dépend d'un autre)

Avant, une seule commande `python3 -m unittest` enchaînait tous les fichiers (12 à 13 min en CI, dont 3 pour
test_install.py seul) : le grain est ici le test, pas le fichier, pour qu'un gros fichier ne fixe pas la durée.
Les tests tournaient déjà tous dans le même processus : un worker en enchaîne plusieurs, comme avant, dans un autre ordre.
Les plus gros fichiers partent en premier (taille du fichier), les petits bouchent les trous. La sortie d'un test n'est
montrée que s'il échoue (buffer), suivie de sa trace ; les 5 tests les plus lents sont rappelés à la fin.
"""
import glob, importlib, io, multiprocessing, os, sys, time, traceback, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def module_name(path):
    return os.path.relpath(os.path.abspath(path), ROOT)[:-3].replace(os.sep, ".")


def test_ids(suite):
    for t in suite:
        if isinstance(t, unittest.TestSuite):
            yield from test_ids(t)
        else:
            yield t.id()


def collect(paths):
    """Les identifiants de tous les tests, plus gros fichiers d'abord ; une erreur d'import échoue tout de suite."""
    loader = unittest.TestLoader()
    ids = []
    for path in sorted(paths, key=os.path.getsize, reverse=True):
        mod = importlib.import_module(module_name(path))
        found = list(test_ids(loader.loadTestsFromModule(mod)))
        if loader.errors:
            sys.exit("\n".join(loader.errors))
        ids += found
    return ids


def init():
    os.chdir(ROOT)
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)


def run_one(tid):
    """Lance un test dans le worker ; rend (id, durée, statut, détail) où statut vaut ok, skip, fail ou error."""
    result = unittest.TestResult()
    result.buffer = True
    t0 = time.monotonic()
    try:
        unittest.defaultTestLoader.loadTestsFromName(tid).run(result)
    except Exception:
        return tid, time.monotonic() - t0, "error", traceback.format_exc()
    dt = time.monotonic() - t0
    for kind, items in (("error", result.errors), ("fail", result.failures), ("fail", result.unexpectedSuccesses)):
        if items:
            item = items[0]
            return tid, dt, kind, item[1] if isinstance(item, tuple) else "succès inattendu (expectedFailure)"
    if result.skipped:
        return tid, dt, "skip", result.skipped[0][1]
    return tid, dt, "ok", ""


def main(argv):
    init()
    paths = argv or sorted(glob.glob(os.path.join(ROOT, "tests", "test_*.py")))
    ids = collect(paths)
    jobs = max(1, min(int(os.environ.get("BUREAU_TEST_JOBS") or os.cpu_count() or 1), len(ids)))
    t0 = time.monotonic()
    # spawn partout (défaut de macOS) : même comportement en local et en CI ; les options -W passent aux workers
    ctx = multiprocessing.get_context("spawn")
    with ctx.Pool(jobs, initializer=init) as pool:
        results = list(pool.imap_unordered(run_one, ids))
    wall = time.monotonic() - t0
    bad = [r for r in results if r[2] in ("fail", "error")]
    out = io.StringIO()
    for tid, _, kind, detail in sorted(bad):
        out.write("=" * 70 + f"\n{kind.upper()}: {tid}\n" + "-" * 70 + f"\n{detail}\n")
    skipped = sum(r[2] == "skip" for r in results)
    slow = sorted(results, key=lambda r: -r[1])[:5]
    out.write("-" * 70 + f"\nRan {len(results)} tests in {wall:.1f}s ({jobs} processus)\n")
    out.write("plus lents : " + ", ".join(f"{r[0].split('.', 1)[1]} {r[1]:.1f}s" for r in slow) + "\n")
    if bad:
        out.write(f"\nFAILED (failures={sum(r[2] == 'fail' for r in bad)}, errors={sum(r[2] == 'error' for r in bad)}"
                  + (f", skipped={skipped}" if skipped else "") + ")\n")
    else:
        out.write("\nOK" + (f" (skipped={skipped})" if skipped else "") + "\n")
    sys.stderr.write(out.getvalue())
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
