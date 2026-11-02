"""Régression visuelle (KT-57) : les captures clés de la page de démo comparées à leurs références (tests/visual/).

  .venv/bin/python tools/visual.py              # compare (échec si une capture s'écarte de sa référence)
  .venv/bin/python tools/visual.py --update     # refait les références (changement visuel voulu)
  .venv/bin/python tools/visual.py --guide-rule origin/main   # règle de PR : références changées => guide/ changé
                                                              # (label « références seules » : règle levée par la CI)

Les captures sont celles de tools/shots.py (même mise en scène), sur un temps qui ne dépend pas de la machine : Date
figée à l'heure de l'instantané de démo (la page lit Date.now() pour les âges et les « il y a »), animations du canvas
sur un temps virtuel avancé d'exactement FRAMES images, animations CSS coupées (prefers-reduced-motion). Deux rendus
donnent la même image (0 % mesuré, macOS et Linux). Une capture s'écarte quand plus de TOLERANCE de ses pixels
diffèrent de plus de SEUIL (sur 255). Les différences sont écrites dans dist/visual/.

Les références sont faites par la CI (Linux) : le texte ne se dessine pas pareil sous macOS. Sur une autre plateforme
que celle des références, la comparaison n'est qu'indicative (avertissement, jamais d'échec) ; --strict l'impose.
Pour les refaire sur une PR : poser le label « références visuelles » (workflow .github/workflows/visual-refs.yml).
"""
import io, json, os, platform, subprocess, sys
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import shots  # noqa: E402

REF = os.path.join(ROOT, "tests", "visual")
DIFF = os.path.join(ROOT, "dist", "visual")
META = os.path.join(REF, "references.json")
# captures clés : le plan (personnages, bureaux, scènes), les fiches, le fil, les murs, la TV, le mobile, le 1er étage
NAMES = ["plan", "fiche-agent", "fiche-collegue", "fiche-ticket", "fil", "kanban", "tv", "mobile", "atelier", "atelier-calme", "atelier-menage", "caserne", "caserne-calme"]  # le 1er étage (#125) : occupé, au calme, le ménage du soir ; le -1 : la caserne Support, occupée et le soir
SEUIL = 24
FRAMES = 60  # images jouées avant chaque capture (2 s de temps virtuel)
TOLERANCE = 0.003


def frozen_clock():
    """Script lancé avant la page : le temps ne dépend plus de la machine. Date figée à l'heure de l'instantané de démo
    (data/office_snapshot.json) ; performance.now et requestAnimationFrame sur un temps virtuel qui n'avance que par
    __advance(n) (n images de 1/30 s) : la CI, lente ou rapide, dessine exactement la même image."""
    at = json.loads(Path(os.path.join(ROOT, "data", "office_snapshot.json")).read_text())["generated_at"]
    return ("(()=>{const F=Date.parse(%s),R=Date;class D extends R{constructor(...a){super(...(a.length?a:[F]))}"
            "static now(){return F}}D.parse=R.parse;D.UTC=R.UTC;window.Date=D;"
            "let vt=1000,q=[];performance.now=()=>vt;window.requestAnimationFrame=cb=>{q.push(cb);return q.length};"
            "window.__advance=n=>{for(let i=0;i<n;i++){vt+=1000/30;const f=q;q=[];f.forEach(cb=>cb(vt));}};})()" % json.dumps(at))


def plat():
    return platform.system().lower()


def capture_all(names):
    """Les captures de tools/shots.py (même mise en scène), sur le temps virtuel : la page charge et décode ses images
    (2,5 s réelles, rien n'anime), puis avance d'exactement FRAMES images avant la capture."""
    import base64, time
    from PIL import Image
    page, out = shots.build_page(), {}
    with shots.chrome() as call:
        call("Page.enable")
        call("Page.addScriptToEvaluateOnNewDocument", source=frozen_clock())
        call("Emulation.setEmulatedMedia", features=[{"name": "prefers-reduced-motion", "value": "reduce"}])  # animations CSS
        for n in names:
            w, h, js, sel, *rest = shots.SHOTS[n]
            scale = (rest + [1])[0]
            call("Emulation.setDeviceMetricsOverride", width=w, height=h, deviceScaleFactor=1, mobile=w < 600)
            call("Page.navigate", url="file://" + page)
            time.sleep(3)
            r = call("Runtime.evaluate", expression=js + shots.WAIT, awaitPromise=True)
            if "exceptionDetails" in r:
                raise SystemExit(f"✗ {n} : {json.dumps(r['exceptionDetails'])[:300]}")
            call("Runtime.evaluate", expression=f"__advance({FRAMES})")
            clip = None
            if sel:
                clip = call("Runtime.evaluate", returnByValue=True, expression=(
                    f"(()=>{{const e=document.querySelector({sel!r});if(!e)return null;const r=e.getBoundingClientRect();"
                    f"return {{x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,scale:{scale}}};}})()"))["result"].get("value")
                if not clip or not clip["width"]:
                    raise SystemExit(f"✗ {n} : élément {sel} absent ou vide")
            shot = call("Page.captureScreenshot", format="png", captureBeyondViewport=bool(clip), **({"clip": clip} if clip else {}))
            out[n] = Image.open(io.BytesIO(base64.b64decode(shot["data"]))).convert("RGB")
    return out


ARRONDI = 2  # écart de taille (px) pris pour un arrondi de la zone capturée, pas pour un changement


def ratio(a, b):
    """Part des pixels qui diffèrent de plus de SEUIL. Tailles différentes de plus de ARRONDI px : 1.0. Jusqu'à ARRONDI px
    (Chrome 156 arrondit la hauteur de certaines zones d'une ligne de plus que Chrome 155, contenu identique), la partie
    commune est comparée et les lignes ou colonnes en trop comptent comme différentes."""
    from PIL import ImageChops
    (wa, ha), (wb, hb) = a.size, b.size
    if abs(wa - wb) > ARRONDI or abs(ha - hb) > ARRONDI:
        return 1.0, None
    w, h = min(wa, wb), min(ha, hb)
    d = ImageChops.difference(a.crop((0, 0, w, h)), b.crop((0, 0, w, h))).convert("L").point(lambda v: 255 if v > SEUIL else 0)
    extra = max(wa * ha, wb * hb) - w * h
    return (d.histogram()[255] + extra) / max(wa * ha, wb * hb), d


def update(names):
    os.makedirs(REF, exist_ok=True)
    for n, im in capture_all(names).items():
        im.save(os.path.join(REF, n + ".png"), optimize=True)
        print(f"✓ tests/visual/{n}.png")
    Path(META).write_text(json.dumps({"platform": plat(), "chrome": chrome_version(), "names": names}, indent=1))
    return 0


def chrome_version():
    try:
        return subprocess.run([shots.CHROME, "--version"], capture_output=True, text=True, timeout=20).stdout.strip()
    except OSError:
        return ""


def compare(names, strict):
    if not os.path.exists(META):
        print("visuel : pas encore de références (tests/visual/) ; label « références visuelles » sur la PR pour les faire")
        return 1 if strict else 0
    meta = json.loads(Path(META).read_text())
    indicative = meta.get("platform") != plat() and not strict
    os.makedirs(DIFF, exist_ok=True)
    bad = []
    from PIL import Image
    for n, im in capture_all(names).items():
        ref = os.path.join(REF, n + ".png")
        if not os.path.exists(ref):
            bad.append(n)
            print(f"FAIL visuel {n} : pas de référence")
            continue
        r, d = ratio(im, Image.open(ref).convert("RGB"))
        ok = r <= TOLERANCE
        print(f"{'ok  ' if ok else 'info' if indicative else 'FAIL'} visuel {n} : {r * 100:.2f} % de pixels différents (tolérance {TOLERANCE * 100:.1f} %)")
        if not ok:
            bad.append(n)
            im.save(os.path.join(DIFF, n + ".png"))
            if d is not None:
                d.save(os.path.join(DIFF, n + "-diff.png"))
    if bad and indicative:
        print(f"visuel : références faites sous {meta.get('platform')}, ici {plat()} : écarts indicatifs seulement ({', '.join(bad)})")
        return 0
    if bad:
        print("visuel : captures et différences dans dist/visual/ ; si le changement est voulu, label « références visuelles » sur la PR")
    return 1 if bad else 0


def guide_rule(base, cwd=ROOT):
    """Règle de PR (option 3, KT-57) : une PR qui change des références visuelles change aussi guide/."""
    first = subprocess.run(["git", "cat-file", "-e", f"{base}:tests/visual/references.json"], cwd=cwd, capture_output=True).returncode
    if first:  # la base n'a pas encore de références : la PR qui les crée ne change pas l'affichage
        print("ok   règle du guide : premières références visuelles, rien à comparer")
        return 0
    files = subprocess.run(["git", "diff", "--name-only", f"{base}...HEAD"], capture_output=True, text=True, cwd=cwd, check=True).stdout.split()
    refs = [f for f in files if f.startswith("tests/visual/") and f.endswith(".png")]
    guide = [f for f in files if f.startswith("guide/")]
    if refs and not guide:
        print("FAIL règle du guide : l'affichage change (" + ", ".join(refs) + ") mais rien dans guide/ : "
              "mets à jour la page de la fonctionnalité (guide/fonctionnalites/) ou ses captures (tools/shots.py) ; "
              "références refaites sans changement visible (mise à jour de Chrome) : label « références seules »")
        return 1
    print(f"ok   règle du guide : {len(refs)} référence(s) changée(s), {len(guide)} fichier(s) de guide/")
    return 0


def main(argv):
    if "--guide-rule" in argv:
        return guide_rule(argv[argv.index("--guide-rule") + 1])
    names = [a for a in argv if not a.startswith("--")] or NAMES
    if "--update" in argv:
        return update(names)
    return compare(names, "--strict" in argv)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
