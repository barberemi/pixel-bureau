"""Planche LPC d'un personnage -> planche du Bureau (9 x 6 cases de 64 px, la planche fournie d'un pack).

  .venv/bin/python tools/lpc_sheet.py <dossier> <préfixe> <sortie.png> [--cut=47] [--spread=6,3] [--joint=5]
                                      [--idle-face] [--etoffer=1.3,1.15] [--brut]

Entrée : <préfixe>-lpc-walk.png (9 x 4 : haut, gauche, bas, droite) et <préfixe>-lpc-idle.png (2 x 4), comme les
packs générés (format « ULPC-compatible »). Sortie : rangées 1-4, la marche ; rangée 5, l'attente (haut x2, bas x2,
gauche, droite) ; rangée 6, les mains (bas x3). La planche se met dans sprites.json du pack (data:image/png;base64,...).

Les planches générées ont des défauts que la page montre (le mainteneur les a vus) ; sans --brut :
- le liseré violet du détourage est retiré ;
- la marche de côté est refaite comme celle du pompier : jambes écartées (2 images), jointes (2), et ainsi de suite.
  Les bustes viennent des images de la marche vers la droite qui regardent vraiment à droite (certaines sont tournées :
  le personnage se retournait en marchant) ; les jambes, sous la coupe --cut, des images --spread (écartées) et --joint
  (jointes), retournées si leurs pieds pointent en arrière, recalées sur la hanche. La marche vers la gauche est le
  miroir de celle vers la droite (la gauche livrée peut, elle aussi, avoir des images tournées).
--idle-face : la planche d'attente n'est juste que de face (dos et côtés : l'image debout de la marche).
--etoffer=sx,sy : la tête agrandie (sx en largeur, sy en hauteur) et un pixel de plus de chaque côté des jambes, pour un
personnage plus fin que les autres (le libraire : tête de 16 px contre 21 pour le saxophoniste).
"""
import argparse, os, sys
from PIL import Image, ImageChops, ImageStat

C = 64
OUTLINE = (34, 26, 30, 255)


def tinted(p):
    """Un pixel teinté de violet par le détourage : rouge et bleu proches, bien au-dessus du vert."""
    r, g, b, a = p
    return a > 0 and min(r, b) >= 16 and g < min(r, b) * .7 and abs(r - b) <= max(12, .3 * max(r, b))


def clean(im):
    """Le liseré : sur le bord, le contour sombre ; dedans, la couleur des voisins (magenta vif) ou un gris de même
    luminosité (contour teinté)."""
    im = im.copy()
    px, (w, h) = im.load(), im.size
    for x, y in [(x, y) for y in range(h) for x in range(w) if tinted(px[x, y])]:
        r, g, b, _ = px[x, y]
        nb = [px[x + dx, y + dy] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= x + dx < w and 0 <= y + dy < h]
        if r > 90 and any(q[3] == 0 for q in nb):
            px[x, y] = OUTLINE
        elif r > 90:
            ok = [q for q in nb if q[3] and not tinted(q)]
            px[x, y] = tuple(sum(q[i] for q in ok) // len(ok) for i in range(3)) + (255,) if ok else OUTLINE
        else:
            v = int(.3 * r + .59 * g + .11 * b)
            px[x, y] = (v, v, v, 255)
    return im


def cell(im, f, r):
    return im.crop((f * C, r * C, f * C + C, r * C + C))


def hip_x(c, y):
    """Le milieu des pixels de la rangée y (la hanche) ; à défaut, de la plus proche en dessous."""
    for yy in range(y, C):
        xs = [x for x in range(C) if c.getpixel((x, yy))[3]]
        if xs:
            return (xs[0] + xs[-1]) / 2
    return C / 2


def with_legs(torso, legs, cut):
    """Le buste de torso sur les jambes de legs (sous la rangée cut), recalées sur la hanche."""
    out = torso.copy()
    out.paste((0, 0, 0, 0), (0, cut, C, C))
    out.alpha_composite(legs.crop((0, cut, C, C)), (round(hip_x(torso, cut) - hip_x(legs, cut)), cut))
    return out


def skin(p):
    r, g, b, a = p
    return bool(a) and r > 150 and 90 < g < r - 20 and b < g and r - b > 50


def faces_right(c):
    """De profil, la peau du visage est du côté où il regarde : à droite du milieu de la tête."""
    px = c.load()
    xs = [x for y in range(30) for x in range(C) if px[x, y][3]]
    sk = [x for y in range(30) for x in range(C) if skin(px[x, y])]
    return bool(sk) and sum(sk) / len(sk) > (min(xs) + max(xs)) / 2 + 1


def shoe_band(c):
    bb = c.getbbox()
    return c.crop((0, bb[3] - 6, C, bb[3]))


def shoe_template(c):
    """La chaussure du pied avant d'une image jambes écartées vers la droite (le bloc le plus à droite des 6 dernières
    rangées) : en marchant vers la droite, elle pointe vers l'avant."""
    px = shoe_band(c).load()
    xs = [x for x in range(C) if any(px[x, y][3] for y in range(6))]
    runs = [[xs[0]]]
    for x in xs[1:]:
        if x == runs[-1][-1] + 1:
            runs[-1].append(x)
        else:
            runs.append([x])
    return shoe_band(c).crop((runs[-1][0], 0, runs[-1][-1] + 1, 6))


def shoe_score(c, t):
    band, best = shoe_band(c), 1e9
    for x in range(C - t.width):
        part = band.crop((x, 0, x + t.width, 6))
        d = ImageStat.Stat(ImageChops.difference(part.convert("RGB"), t.convert("RGB"))).mean
        a = ImageStat.Stat(ImageChops.difference(part.split()[3], t.split()[3])).mean[0]
        best = min(best, sum(d) + a)
    return best


def feet_right(c, t):
    """Les pieds pointent à droite : ils ressemblent plus à la chaussure gabarit qu'à son miroir (la semelle contre la
    cheville se trompait quand les deux pieds se touchent)."""
    return shoe_score(c, t) < shoe_score(c, t.transpose(Image.FLIP_LEFT_RIGHT))


def legs_right(c, cut, t):
    """Les jambes de c, pieds vers la droite : retournées autour de la hanche s'ils pointent à gauche."""
    if feet_right(c, t):
        return c
    hx = hip_x(c, cut)
    out = Image.new("RGBA", (C, C))
    out.alpha_composite(c.transpose(Image.FLIP_LEFT_RIGHT), (round(hx - (C - 1 - hx)), 0))
    return out


def mirror_onto(c, ref):
    """Le miroir de c, recentré sur la place qu'occupe ref."""
    m = c.transpose(Image.FLIP_LEFT_RIGHT)
    b1, b2 = m.getbbox(), ref.getbbox() or m.getbbox()
    out = Image.new("RGBA", (C, C))
    out.alpha_composite(m, (round((b2[0] + b2[2]) / 2 - (b1[0] + b1[2]) / 2), 0))
    return out


def beef(c, sx, sy, cut):
    """La tête agrandie (au-dessus du cou : la rangée la plus étroite sous elle) et un pixel de plus de chaque côté
    des jambes."""
    bb = c.getbbox()
    if not bb:
        return c
    width = lambda y: (lambda xs: xs[-1] - xs[0] if xs else 99)([x for x in range(C) if c.getpixel((x, y))[3]])  # noqa: E731
    top = bb[1]
    neck = min(range(top + 10, min(top + 21, cut)), key=width)
    head = c.crop((0, top, C, neck))
    hb = head.getbbox()
    head = head.crop(hb)
    big = head.resize((round(head.width * sx), round(head.height * sy)), Image.NEAREST)
    out = c.copy()
    out.paste((0, 0, 0, 0), (0, 0, C, neck))
    out.alpha_composite(big, (round((hb[0] + hb[2]) / 2 - big.width / 2), max(0, neck - big.height)))
    px, src = out.load(), out.copy().load()
    for y in range(cut, C):
        for x in range(1, C - 1):
            if not src[x, y][3]:
                if src[x - 1, y][3]:
                    px[x, y] = src[x - 1, y]
                elif src[x + 1, y][3]:
                    px[x, y] = src[x + 1, y]
    return out


def build(walk, idle, cut=47, spread=(6, 3), joint=5, idle_face=False, etoffer=None, brut=False, log=None):
    """walk (9 x 4) et idle (2 x 4) -> la planche du Bureau (9 x 6). log(texte) : ce qui a été corrigé."""
    log = log or (lambda s: None)
    walk, idle = walk.convert("RGBA"), idle.convert("RGBA")
    if not brut:
        walk, idle = clean(walk), clean(idle)
    out = Image.new("RGBA", (9 * C, 6 * C))
    for r in range(4):
        for f in range(9):
            out.alpha_composite(cell(walk, f, r), (f * C, r * C))
    if not brut:
        t = shoe_template(cell(walk, spread[0], 3))
        flip = [f for f in list(spread) + [joint] if not feet_right(cell(walk, f, 3), t)]
        if flip:
            log(f"jambes retournées (pieds à l'envers) : images {flip}")
        sp = [legs_right(cell(walk, f, 3), cut, t) for f in spread]
        jt = legs_right(cell(walk, joint, 3), cut, t)
        torsos = [cell(walk, f, 3) for f in range(1, 9) if faces_right(cell(walk, f, 3))] or [cell(walk, f, 3) for f in range(1, 9)]
        log(f"bustes de profil droit : {len(torsos)} / 8")
        pattern = [jt, sp[0], sp[1], jt, jt, sp[1], sp[0], jt, jt]  # debout, écartées x2, jointes x2, comme le pompier
        for f in range(9):
            right = with_legs(torsos[0] if f == 0 else torsos[(f - 1) % len(torsos)], pattern[f], cut)
            for r, im in ((3, right), (1, mirror_onto(right, cell(walk, f, 1)))):
                out.paste((0, 0, 0, 0), (f * C, r * C, f * C + C, r * C + C))
                out.alpha_composite(im, (f * C, r * C))
    for i, (f, r) in enumerate([(0, 0), (1, 0), (0, 2), (1, 2), (0, 1), (0, 3)]):
        out.alpha_composite(out.crop((0, r * C, C, r * C + C)) if idle_face and r != 2 else cell(idle, f, r), (i * C, 4 * C))
    for i, f in enumerate([0, 1, 0]):
        out.alpha_composite(cell(idle, f, 2), (i * C, 5 * C))
    if etoffer:
        big = Image.new("RGBA", out.size)
        for r in range(6):
            for f in range(9):
                big.alpha_composite(beef(cell(out, f, r), etoffer[0], etoffer[1], cut), (f * C, r * C))
        out = big
    return out


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dossier")
    ap.add_argument("prefixe")
    ap.add_argument("sortie")
    ap.add_argument("--cut", type=int, default=47, help="la rangée où commencent les jambes (sous les mains)")
    ap.add_argument("--spread", default="6,3", help="deux images de la marche vers la droite, jambes écartées")
    ap.add_argument("--joint", type=int, default=5, help="une image de la marche vers la droite, jambes jointes")
    ap.add_argument("--idle-face", action="store_true")
    ap.add_argument("--etoffer", help="sx,sy : la tête agrandie, les jambes élargies")
    ap.add_argument("--brut", action="store_true", help="la planche telle quelle, sans correction")
    a = ap.parse_args(argv)
    p = lambda k: os.path.join(a.dossier, f"{a.prefixe}-lpc-{k}.png")  # noqa: E731
    im = build(Image.open(p("walk")), Image.open(p("idle")), cut=a.cut, spread=tuple(int(v) for v in a.spread.split(",")),
               joint=a.joint, idle_face=a.idle_face, etoffer=tuple(float(v) for v in a.etoffer.split(",")) if a.etoffer else None,
               brut=a.brut, log=lambda s: print(s, file=sys.stderr))
    im.save(a.sortie)
    print(f"✓ {a.sortie} {im.size[0]} x {im.size[1]}")


if __name__ == "__main__":
    main(sys.argv[1:])
