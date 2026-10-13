"""Versions et release, KT-66 (python3 -m unittest tests/test_release.py) : VERSION au format 0.MINOR.PATCH, affichée en
pied de page ; notes de la GitHub Release tirées de CHANGELOG.md, tag cohérent avec VERSION."""
import contextlib, io, os, re, sys, unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import assemble, release_notes  # noqa: E402

LOG = """# Changelog

## [Unreleased]

### Ajouté
- à venir

## [0.2.0] - 2026-11-02

### Ajouté
- le facteur

## [0.1.0] - 2026-10-14

### Ajouté
- première version
"""


class ReleaseTest(unittest.TestCase):
    def test_version_format_and_footer(self):
        self.assertRegex(assemble.version(), r"^0\.\d+\.\d+$")
        html = assemble.build(demo=True, cfg=assemble.demo_config())
        self.assertIn(f"<footer>Le Bureau {assemble.version()} · ", html)

    def test_section_of_a_version(self):
        self.assertEqual(release_notes.section(LOG, "0.2.0"), "### Ajouté\n- le facteur")
        self.assertEqual(release_notes.section(LOG, "0.1.0"), "### Ajouté\n- première version")  # la dernière, jusqu'à la fin
        self.assertIsNone(release_notes.section(LOG, "0.3.0"))
        self.assertIsNone(release_notes.section(LOG, "0.1"))  # pas de correspondance partielle

    def test_tag_must_match_version_and_changelog(self):
        files = {"CHANGELOG.md": LOG, "VERSION": "0.2.0\n"}
        real_open = open

        def fake_open(path, *a, **k):
            name = os.path.basename(path)
            return io.StringIO(files[name]) if name in files and os.path.dirname(path) == ROOT else real_open(path, *a, **k)
        with mock.patch("builtins.open", fake_open), contextlib.redirect_stdout(io.StringIO()) as out, \
                contextlib.redirect_stderr(io.StringIO()) as err:
            self.assertEqual(release_notes.main(["0.2.0"]), 0)
            self.assertEqual(release_notes.main(["--check", "0.1.0"]), 1)  # section présente, mais VERSION dit 0.2.0
            self.assertEqual(release_notes.main(["--check", "0.3.0"]), 1)
        self.assertIn("le facteur", out.getvalue())
        self.assertIn("différent de VERSION", err.getvalue())

    def test_changelog_has_unreleased_and_workflow_checks_the_tag(self):
        log = open(os.path.join(ROOT, "CHANGELOG.md"), encoding="utf-8").read()
        self.assertTrue(re.search(r"^## \[Unreleased\]", log, re.M))
        wf = open(os.path.join(ROOT, ".github", "workflows", "release.yml")).read()
        self.assertIn('tools/release_notes.py --check "$GITHUB_REF_NAME"', wf)
        self.assertIn("gh release create", wf)


if __name__ == "__main__":
    unittest.main()
