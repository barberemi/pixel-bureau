"""Découpe d'une planche générée (fond magenta uni) au format des sprites fournis (sprites/common/<nom>/), pour les
invités qui ne sont pas composés de calques LPC : Yoda et Palpatine (2026-11-27). Les sources ne sont pas gardées
dans le dépôt : les relancer avec les mêmes planches redonne les mêmes fichiers.

    .venv/bin/python sprites/decoupe.py marche <planche.png> <nom> [--taille 42]
        planche régulière de 3 rangées de 9 (dos, face, profil tourné vers la droite) : <nom>-walk.png (9 x 4, rangées
        LPC dos, gauche, face, droite ; gauche = miroir de la droite) et <nom>-idle.png (2 x 4, la 1re image de chaque
        rangée). Chaque rangée est ramenée à --taille px de haut, les pieds sur la même ligne, la tête centrée.
    .venv/bin/python sprites/decoupe.py eclairs <planche.png> <nom> [--taille 44]
        grille de 3 x 3 cases (lancer d'éclairs de profil, tourné vers la droite) : <nom>-cast.png, 9 images de 128 x 64,
        le corps seul (l'éclair est dessiné par la page, depuis la main) calé à x = 30 comme la marche, et
        <nom>-cast.json, la main de chaque image ([x, y] dans sa case, null sans éclair).
"""
import argparse, json, os
from PIL import Image, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
F = 64


def key(im):
    """Fond magenta transparent ; le liseré rosé du détourage perd sa teinte et son opacité à proportion."""
    im = im.convert("RGBA")
    px = im.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            r, g, b, _ = px[x, y]
            m = min(r, b) - g
            if m > 70 and r > 120 and b > 120:
                px[x, y] = (0, 0, 0, 0)
            elif m > 25 and r > 100 and b > 90:
                t = min(1, (m - 25) / 45)
                px[x, y] = (int(g + (r - g) * 0.3), g, int(g + (b - g) * 0.3), int(255 * (1 - t)))
    return im


def bands(im, mingap=12):
    """Rangées de la planche : bandes horizontales séparées d'au moins mingap lignes vides."""
    a = im.getchannel("A").load()
    w, h = im.size
    full = [sum(1 for x in range(0, w, 2) if a[x, y]) > 3 for y in range(h)]
    out, start, gap = [], None, 0
    for y, f in enumerate(full + [False] * (mingap + 1)):
        if f:
            start, gap = (y if start is None else start), 0
        elif start is not None:
            gap += 1
            if gap > mingap:
                out.append((start, y - gap + 1))
                start = None
    return out


def largest(im, ratio=0.02):
    """Garde les morceaux opaques d'au moins ratio fois le plus gros (le voisin qui déborde dans la case part)."""
    w, h = im.size
    a, src = im.getchannel("A").load(), im.load()
    seen, comps = set(), []
    for y in range(h):
        for x in range(w):
            if a[x, y] and (x, y) not in seen:
                stack, pts = [(x, y)], []
                seen.add((x, y))
                while stack:
                    p = stack.pop()
                    pts.append(p)
                    for q in ((p[0] + 1, p[1]), (p[0] - 1, p[1]), (p[0], p[1] + 1), (p[0], p[1] - 1)):
                        if 0 <= q[0] < w and 0 <= q[1] < h and q not in seen and a[q]:
                            seen.add(q)
                            stack.append(q)
                comps.append(pts)
    comps.sort(key=len, reverse=True)
    out = Image.new("RGBA", im.size)
    op = out.load()
    for pts in comps:
        if len(pts) < len(comps[0]) * ratio:
            break
        for p in pts:
            op[p] = src[p]
    return out


def down(im, s):
    """Réduction à l'échelle s, couleurs prémultipliées, opacité tranchée (pixel art : opaque ou vide)."""
    r, g, b, a = im.split()
    size = (max(1, round(im.size[0] * s)), max(1, round(im.size[1] * s)))
    pm = Image.merge("RGB", [ImageChops.multiply(c, a) for c in (r, g, b)]).resize(size, Image.LANCZOS).load()
    al = a.resize(size, Image.LANCZOS).load()
    out = Image.new("RGBA", size)
    op = out.load()
    for y in range(size[1]):
        for x in range(size[0]):
            if al[x, y] >= 110:
                k = 255 / al[x, y]
                op[x, y] = tuple(min(255, int(v * k)) for v in pm[x, y]) + (255,)
    return out


def head_x(im, top, bot, dark=False):
    """Centre de la tête : moyenne des x opaques (sombres seulement si dark, pour ignorer l'éclair) des 40 % du haut."""
    p = im.load()
    xs = [x for y in range(top, int(top + (bot - top) * 0.4)) for x in range(im.size[0])
          if p[x, y][3] > 100 and (not dark or sum(p[x, y][:3]) < 240)]
    return sum(xs) / len(xs)


def paste(sheet, im, s, cx, below, col, row, cw=F, ax=F / 2, foot=62):
    """im réduit à l'échelle s dans la case (col, row) de largeur cw : tête (cx) en ax, bas du corps (below px source
    sous le bas de im) sur la ligne foot ; ce qui déborde de la case est coupé."""
    d = down(im, s)
    x, y = round(ax - cx * s), foot - d.size[1] + round(below * s)
    cell = Image.new("RGBA", (cw, F))
    cell.alpha_composite(d, (max(0, x), max(0, y)), (max(0, -x), max(0, -y)))
    sheet.alpha_composite(cell, (col * cw, row * F))


def marche(src, nom, taille):
    im = key(Image.open(src))
    rows = bands(im)
    if len(rows) != 3:
        raise SystemExit(f"{src} : 3 rangées attendues (dos, face, profil), {len(rows)} trouvées")
    walk = Image.new("RGBA", (9 * F, 4 * F))
    cw = im.size[0] / 9
    for (y0, y1), row in zip(rows, (0, 2, 3)):
        figs = []
        for c in range(9):
            f = largest(im.crop((int(c * cw), y0, int((c + 1) * cw), y1)))
            bb = f.getbbox()
            figs.append((f.crop(bb), bb[3]))
        s, base = taille / max(f.size[1] for f, _ in figs), max(b for _, b in figs)
        for c, (f, b) in enumerate(figs):
            paste(walk, f, s, head_x(f, 0, f.size[1]), b - base, c, row)
    for c in range(9):  # gauche = miroir de la droite
        walk.paste(walk.crop((c * F, 3 * F, c * F + F, 4 * F)).transpose(Image.FLIP_LEFT_RIGHT), (c * F, F))
    idle = Image.new("RGBA", (2 * F, 4 * F))
    for r in range(4):
        for c in range(2):
            idle.paste(walk.crop((0, r * F, F, r * F + F)), (c * F, r * F))
    return {f"{nom}-walk.png": walk, f"{nom}-idle.png": idle}


def eclairs(src, nom, taille):
    im = key(Image.open(src))
    W, H = im.size
    figs = []
    for r in range(3):
        for c in range(3):  # 6 px de marge : le trait noir de la grille
            f = largest(im.crop((c * W // 3 + 6, r * H // 3 + 6, (c + 1) * W // 3 - 6, (r + 1) * H // 3 - 6)), 0.01)
            a = f.getchannel("A").crop((0, 0, int(f.size[0] * 0.3), f.size[1])).getbbox()  # le corps, à gauche de l'éclair
            figs.append((f, a[1], a[3] - 1))
    s = taille / max(b - t for _, t, b in figs)
    cast = Image.new("RGBA", (9 * 128, F))
    for i, (f, t, b) in enumerate(figs):
        paste(cast, f, s, head_x(f, t, b, dark=True), -(f.size[1] - 1 - b), i, 0, cw=128, ax=30)
    px, hands = cast.load(), []
    bolt = lambda p: p[3] and p[2] > p[0] + 30  # noqa: E731  bleu : l'éclair (le corps est noir, les yeux jaunes)
    for i in range(9):
        pts = [(x - i * 128, y) for x in range(i * 128, i * 128 + 128) for y in range(F) if bolt(px[x, y])]
        if not pts:
            hands.append(None)
            continue
        hx = min(x for x, _ in pts)
        ys = [y for x, y in pts if x <= hx + 2]
        for x in range(i * 128 + hx + 4, i * 128 + 128):  # l'éclair et ses étincelles, sauf le crépitement de la main
            for y in range(F):
                if bolt(px[x, y]) or px[x, y][3] and sum(px[x, y][:3]) > 450:
                    px[x, y] = (0, 0, 0, 0)
        hands.append([hx + 3, round(sum(ys) / len(ys))])
    return {f"{nom}-cast.png": cast, f"{nom}-cast.json": hands}


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("mode", choices=("marche", "eclairs"))
    ap.add_argument("planche")
    ap.add_argument("nom")
    ap.add_argument("--taille", type=int)
    a = ap.parse_args()
    out = (marche if a.mode == "marche" else eclairs)(a.planche, a.nom, a.taille or (42 if a.mode == "marche" else 44))
    d = os.path.join(HERE, "common", a.nom)
    os.makedirs(d, exist_ok=True)
    for name, v in out.items():
        path = os.path.join(d, name)
        if name.endswith(".json"):
            open(path, "w").write(json.dumps(v) + "\n")
        else:
            # palette réduite, sans tramage : la planche est embarquée dans la page en data URI
            v.quantize(colors=48, method=Image.FASTOCTREE, dither=Image.Dither.NONE).save(path, optimize=True)
        print(path)
