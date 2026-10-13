"""Poids de la page, KT-28 (python3 -m unittest tests/test_compact.py) : JS et CSS compactés à l'assemblage
(tools/compact.py), sprites embarqués seulement s'ils servent."""
import json, os, re, subprocess, sys, tempfile, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import assemble  # noqa: E402
from compact import strip_css, strip_js  # noqa: E402


class CompactTest(unittest.TestCase):
    def test_js_comments_and_indentation_removed(self):
        src = "// en-tête\nfunction f(a){\n  return a+1; // fin de ligne\n  /* bloc\n  sur deux lignes */\n}\n"
        self.assertEqual(strip_js(src), "function f(a){\nreturn a+1;\n}\n")

    def test_js_strings_templates_and_regex_untouched(self):
        cases = [
            "const u='https://x.org/a'; // lien\n",  # « // » dans une chaîne
            'const q="/* pas un commentaire */";\n',
            "const t=`a ${b?'//':`${c}/*x*/`} d`;\n",  # gabarits imbriqués
            "const r=/^https:\\/\\/[^/]+\\/\\*$/i.test(s);\n",  # expression régulière avec // et /*
            "const s=`${/^https:\\/\\//.test(u)?u:''}`;\n",  # expression régulière juste après « ${ »
            "const d=a/b/c;\n",  # divisions
            "if(x)return /a\\/b/.test(y);\n",  # expression régulière après return
        ]
        for c in cases:
            with self.subTest(c=c):
                self.assertEqual(strip_js(c), c.split(" //")[0].rstrip() + "\n" if " // lien" in c else c)

    def test_js_multiline_template_keeps_its_text(self):
        src = "el.innerHTML=`<pre>\n  deux espaces\n</pre>`;\n"
        self.assertEqual(strip_js(src), src)

    def test_js_block_comment_between_words_keeps_a_space(self):
        self.assertEqual(strip_js("return/*x*/a;\n"), "return a;\n")

    def test_css_comments_removed_strings_kept(self):
        src = "/* titre */\n.a{\n  content:'/* x */'; /* fin */\n  color:red\n}\n"
        self.assertEqual(strip_css(src), ".a{\ncontent:'/* x */';\ncolor:red\n}\n")

    def test_assembled_page_parses_and_is_lighter(self):
        """Le JS assemblé (démo) se lit sans erreur de syntaxe et pèse moins que ses sources."""
        html = assemble.build(demo=True, cfg=assemble.demo_config())
        js = max(re.findall(r"<script>(.*?)</script>", html, re.S), key=len)
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
            f.write(js)
        try:
            r = subprocess.run(["node", "--check", f.name], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr[:500])
        finally:
            os.unlink(f.name)
        src = sum(os.path.getsize(os.path.join(assemble.SRC, n)) for n in assemble.JS_FILES)
        self.assertLess(len(assemble.page_html().encode()), src)  # squelette et CSS compris

    def test_only_used_sprites_are_embedded(self):
        cfg = assemble.demo_config()
        used = assemble.used_sprites(cfg)
        self.assertTrue({"temp", "v_claude", "mage", "yoda"} <= used)  # code de la page (temp, VISITOR), invités communs
        self.assertNotIn("g_inconnu", used)
        self.assertEqual(sorted(assemble.sprites(cfg)), sorted(k for k in json.load(open(os.path.join(ROOT, "sprites", "common.json"))) if k in used))


    def test_weights_by_block_add_up_to_the_page(self):
        """Poids par bloc (smoke) : chaque bloc compte, la somme fait la page assemblée, la page de démo reste sous 900 Ko."""
        import smoke, contextlib, io
        cfg = assemble.demo_config()
        for demo in (True, False):
            w = assemble.weights(cfg, demo=demo)
            self.assertEqual(sum(w.values()), len(assemble.build(demo=demo, cfg=cfg).encode()), demo)
            self.assertTrue(all(v >= 0 for v in w.values()), w)
            self.assertEqual(bool(w["démo"]), demo)
        self.assertGreater(w["polices"], 0)  # police pixel des thèmes, en base64
        self.assertLess(sum(assemble.weights(cfg).values()), 900_000)  # KT-28 : marge sous la limite Kronn (1 000 000)
        with contextlib.redirect_stdout(io.StringIO()) as out:
            smoke.weights({"JS": 300_000, "CSS": 50_000, "démo": 0})
        self.assertEqual(out.getvalue().strip(), "poids : JS 300 Ko (30 %) · CSS 50 Ko (5 %)")  # du plus lourd, sans bloc vide


if __name__ == "__main__":
    unittest.main()
