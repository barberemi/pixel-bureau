"""Contrôle d'un thème de page (theme-<id>.css), du dépôt ou d'un pack d'équipe : son nom (« /* @nom: … */ »), puis
les contrastes WCAG de ses couleurs (texte >= 4,5:1 sur ses fonds, texte des aplats >= 4,5:1, de même en mode TV).

    python3 tools/theme.py check page/src/theme-classique.css
    python3 tools/theme.py check ~/Sites/bureau-monequipe/themes/theme-*.css   # CI d'un pack

Un thème de pack peut ne redéfinir que quelques couleurs : seules les paires qu'il définit sont vérifiées, et une
couleur de texte ou de fond qui manque est signalée (elle reste celle du Classique, sombre). Code de sortie 1 si un
contraste est insuffisant ou si le nom manque. Les thèmes de page/src/ doivent tout définir (tests/test_theme.py).
"""
import os, re, sys

TEXT = ("ink", "muted", "accent", "ok", "warn", "err")  # couleurs de texte
GROUNDS = ("panel", "chip", "bg")                      # fonds sur lesquels elles s'affichent
FILLS = ("line", "err", "warn", "brand")               # aplats qui portent du texte (--on-<aplat>, blanc par défaut ; brand : facultatif)
# mode TV (bloc :root[data-skin="<id>"] body.tv, facultatif) : textes sur les fonds de l'écran mural, et texte des aplats
TV_TEXT = ("tv-ink", "tv-muted", "tv-h2", "tv-hint", "tv-ok", "tv-warn", "tv-err", "tv-mep")
TV_GROUNDS = ("tv-bg", "tv-bar", "tv-deep", "tv-card", "tv-chip")
TV_FILLS = (("tv-stand-ink", "tv-stand"), ("tv-retro-ink", "tv-retro"))
MIN = 4.5


def lum(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def ratio(a, b):
    a, b = lum(a), lum(b)
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)


def theme_id(path):
    return os.path.basename(path)[len("theme-"):-len(".css")]


def name(path):
    m = re.match(r"/\*\s*@nom:\s*(.+?)\s*\*/", open(path).read())
    return m.group(1) if m else None


def _vars(block):
    return dict(re.findall(r"--([\w-]+):\s*(#[0-9a-fA-F]{6})\b", block))


def palette(path):
    """Variables du premier bloc :root[data-skin="<id>"] du thème ({} s'il n'y en a pas)."""
    css = open(path).read()
    block = re.search(r':root\[data-skin="%s"\][^{]*\{(.*?)\}' % re.escape(theme_id(path)), css, re.S)
    return _vars(block.group(1)) if block else {}


def tv_palette(path):
    """Variables du bloc mode TV du thème ({} s'il n'en a pas : le mode TV garde alors ses couleurs de styles.css)."""
    css = open(path).read()
    block = re.search(r':root\[data-skin="%s"\] body\.tv\s*\{(.*?)\}' % re.escape(theme_id(path)), css, re.S)
    return _vars(block.group(1)) if block else {}


def _pairs(v, texts, grounds, fills, where=""):
    errors = []
    for fg in texts:
        for bg in grounds:
            if fg in v and bg in v and ratio(v[fg], v[bg]) < MIN:
                errors.append(f"{where}--{fg} sur --{bg} : {ratio(v[fg], v[bg]):.2f}:1 (minimum {MIN}:1)")
    for on, fill in fills:
        if fill in v and ratio(v.get(on, "#ffffff"), v[fill]) < MIN:
            errors.append(f"{where}--{on} sur --{fill} : {ratio(v.get(on, '#ffffff'), v[fill]):.2f}:1 (minimum {MIN}:1)")
    return errors


def check(path):
    """(erreurs, avertissements) d'un fichier de thème."""
    errors, warnings = [], []
    if not name(path):
        errors.append("première ligne « /* @nom: Nom affiché */ » absente")
    v = palette(path)
    if not v:
        errors.append(f':root[data-skin="{theme_id(path)}"] : aucune couleur #rrggbb')
    else:
        errors += _pairs(v, TEXT, GROUNDS, [("on-" + f, f) for f in FILLS])
        missing = [k for k in TEXT + GROUNDS if k not in v]
        if missing:
            warnings.append("non redéfinies (restent celles du Classique, sombre) : " + ", ".join("--" + k for k in missing))
    tv = tv_palette(path)
    if tv:
        errors += _pairs(tv, TV_TEXT, TV_GROUNDS, TV_FILLS, "mode TV : ")
    return errors, warnings


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) < 2 or argv[0] != "check":
        print(__doc__)
        return 2
    bad = 0
    for path in argv[1:]:
        errors, warnings = check(path)
        for w in warnings:
            print(f"! {path} : {w}")
        for e in errors:
            print(f"✗ {path} : {e}")
        if errors:
            bad += 1
        else:
            print(f"✓ thème valide : {path} ({name(path)})")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
