"""Poids de la page, KT-28 (python3 -m unittest tests/test_compact.py) : JS et CSS compactés à l'assemblage
(tools/compact.py), sprites embarqués seulement s'ils servent."""
import json, os, re, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import assemble  # noqa: E402
from compact import alias_js, strip_css, strip_js  # noqa: E402


class CompactTest(unittest.TestCase):
    def test_js_comments_and_indentation_removed(self):
        src = "// en-tête\nfunction f(a){\n  return a+1; // fin de ligne\n  /* bloc\n  sur deux lignes */\n}\n"
        self.assertEqual(strip_js(src), "function f(a){return a+1;}\n")  # recollée après « { » et « ; »

    def test_js_lines_joined_only_where_no_semicolon_is_inserted(self):
        """Recollée après « ; », « { », « , » ; gardée ailleurs (return, ++ et lignes sans point-virgule) et dans un gabarit."""
        src = "const a=[1,\n  2];\nlet b=a\n++c\nreturn\nx;\nel.innerHTML=`<li>a;\n<li>b,\n`;\n"
        self.assertEqual(strip_js(src), "const a=[1,2];let b=a\n++c\nreturn\nx;el.innerHTML=`<li>a;\n<li>b,\n`;\n")

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

    def test_static_calls_bare_names_and_div_get_aliases(self):
        """#86 : Math.round répété -> _mr ; String nu -> _S, jamais dans toString ni x.String ; _ce('div') -> _cd()."""
        js = "a=Math.round(1);b=Math.round(2);c=Math.round(3);\n"
        self.assertEqual(alias_js(js), "const _mr=Math.round;\na=_mr(1);b=_mr(2);c=_mr(3);\n")
        js = "a=String(1);b=String(2);c=String(3);d=x.toString(4);e=y.String(5);\n"
        self.assertEqual(alias_js(js), "const _S=String;\na=_S(1);b=_S(2);c=_S(3);d=x.toString(4);e=y.String(5);\n")
        js = "a=document.createElement('div');b=document.createElement('div');c=document.createElement('div');\n"
        self.assertEqual(alias_js(js), "const _ce=t=>document.createElement(t);const _cd=()=>_ce('div');\na=_cd();b=_cd();c=_cd();\n")

    def test_repeated_dom_calls_get_a_short_alias(self):
        """document.createElement répété : alias _ce défini en tête ; pas d'alias sous 3 appels ni si le nom est déjà pris."""
        js = "a=document.createElement('a');b=document.createElement('b');c=document.createElement('c');\n"
        self.assertEqual(alias_js(js), "const _ce=t=>document.createElement(t);\na=_ce('a');b=_ce('b');c=_ce('c');\n")
        self.assertEqual(alias_js("x=document.createElement('a');\n"), "x=document.createElement('a');\n")
        taken = js + "let _ce=1;\n"
        self.assertEqual(alias_js(taken), taken)

    def test_js_multiline_template_keeps_its_text(self):
        src = "el.innerHTML=`<pre>\n  deux espaces\n</pre>`;\n"
        self.assertEqual(strip_js(src), src)

    def test_js_block_comment_between_words_keeps_a_space(self):
        self.assertEqual(strip_js("return/*x*/a;\n"), "return a;\n")

    def test_css_comments_removed_strings_kept(self):
        src = "/* titre */\n.a{\n  content:'/* x */'; /* fin */\n  color:red\n}\n"
        self.assertEqual(strip_css(src), ".a{content:'/* x */';color:red\n}\n")  # recollée après « { », « ; » et « } »
        self.assertEqual(strip_css(".a{color:red}\n.b,\n.c{margin:0}\n@media(x){.d{top:0}\n}\n"), ".a{color:red}.b,\n.c{margin:0}@media(x){.d{top:0}}\n")

    def test_js_lines_joined_after_a_plus_but_not_an_increment(self):
        """« + » en fin de ligne : recollée (concaténation) ; jamais après « ++ » ni devant une ligne qui commence par « + »."""
        self.assertEqual(strip_js("const s='a'+\n  b;\n"), "const s='a'+b;\n")
        self.assertEqual(strip_js("i++\nf();\n"), "i++\nf();\n")
        self.assertEqual(strip_js("a=b+\n+c;\n"), "a=b+\n+c;\n")

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
        self.assertEqual(sorted(assemble.sprites(cfg)), sorted(k for k in json.loads(Path(os.path.join(ROOT, "sprites", "common.json")).read_text()) if k in used))


    def test_weights_by_block_add_up_to_the_page(self):
        """Poids par bloc (smoke) : chaque bloc compte, la somme fait la page assemblée, la page de démo reste sous 950 Ko."""
        import smoke, contextlib, io
        cfg = assemble.demo_config()
        for demo in (True, False):
            w = assemble.weights(cfg, demo=demo)
            self.assertEqual(sum(w.values()), len(assemble.build(demo=demo, cfg=cfg).encode()), demo)
            self.assertTrue(all(v >= 0 for v in w.values()), w)
            self.assertEqual(bool(w["démo"]), demo)
        self.assertGreater(w["polices"], 0)  # police pixel des thèmes, en base64
        self.assertLess(sum(assemble.weights(cfg).values()), 950_000)  # KT-28, relevé de 900 000 pour #89 (docs/decisions.md)
        with contextlib.redirect_stdout(io.StringIO()) as out:
            smoke.weights({"JS": 300_000, "CSS": 50_000, "démo": 0})
        self.assertEqual(out.getvalue().strip(), "poids : JS 300 Ko (30 %) · CSS 50 Ko (5 %)")  # du plus lourd, sans bloc vide


    def test_size_limit_applies_to_the_published_page(self):
        """La limite de Kronn vaut pour la page publiée (sans démo) : l'aperçu d'un pack avec la démo peut la dépasser (#84)."""
        import smoke, contextlib, io
        cfg = assemble.demo_config()
        html = assemble.build(demo=True, cfg=cfg)
        for published, ok in ((900_000, True), (1_000_001, False)):
            smoke.fails.clear()
            with contextlib.redirect_stdout(io.StringIO()):
                smoke.static_checks(html + " " * 200_000, cfg, published)
            self.assertEqual(not [f for f in smoke.fails if "taille" in f], ok, smoke.fails)

if __name__ == "__main__":
    unittest.main()
