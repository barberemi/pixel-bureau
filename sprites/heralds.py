"""Planches des invités communs (sprites/common/) : le mage (Gandalf) et le sage (Yoda), composés le 2026-10-05 à partir
de calques du générateur LPC, le facteur du courrier (#30, 2026-10-14), l'amiral Ackbar des grosses PR (2026-11-20) et le
marchand de sable de la mémoire du soir (2026-11-25). Leurs recettes servent aussi à les créditer (credits.py). Le LPC n'a
pas de képi : celui du facteur est dessiné ici, case par case, sur sa tête (« KEPI ») ; ni de tête de Mon Calamari : celle
d'Ackbar aussi (« CALAMARI ») ; ni d'écharpe : celle du marchand de sable aussi (« ECHARPE »). Son ours et son nuage ne sont
pas des planches : la page les dessine (page/src/49-marchand.js).

    .venv/bin/python sprites/heralds.py    # refait sprites/common/<nom>/<nom>-walk.png et -idle.png (identiques au pixel)
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ANIMS = ("walk", "idle")
GRAY, ROBE, WHITE, GREEN, BROWN = "#8d8f97", "#7c7f88", "#ecebe6", "#9fc46a", "#6b5038"
NAVY, SKY, YELLOW = "#24357a", "#a9c8ec", "#f2c230"
KEPI = "KEPI"  # pas un calque LPC : le képi dessiné par kepi()
CALAMARI = "CALAMARI"  # pas un calque LPC : la tête de Mon Calamari dessinée par calamari()
ECHARPE = "ECHARPE"  # pas un calque LPC : l'écharpe rayée du marchand de sable dessinée par echarpe()
VERT, VERT_L, BRUN_C, NUIT_P = "#2f6b3a", "#3f8a4c", "#4a2f1e", "#3a3346"
ECH, ECH_L = "#b8342e", "#e8d7a0"
SALMON, UNIFORM = "#c8743a", "#e9e6dc"
# animations par invité : la sacoche LPC n'a pas d'attente ; sans planche idle, la page prend la 1re image de la marche
ANIMS_OF = {"facteur": ("walk",)}
anims = lambda name: ANIMS_OF.get(name, ANIMS)  # noqa: E731
PALE = "pale"  # teinte de peau de build_sprites.SKIN
# calques du bas vers le haut : (calque LPC, couleur, mode de build_sprites.recolor) ; « {a} » = l'animation, pour un
# fichier pris tel quel (le chapeau gris)
RECIPES = {
    "mage": ("Le mage (Gandalf)", [
        ("cape/solid/bg", ROBE, "lum"), ("body/bodies/male", PALE, "mul"), ("feet/shoes/basic/male", "#4a3a2c", "lum"),
        ("legs/pants/male", ROBE, "lum"), ("torso/clothes/longsleeve/longsleeve/male", GRAY, "lum"),
        ("cape/solid/fg", ROBE, "lum"), ("head/heads/human/male", PALE, "mul"), ("eyes/human/adult/default", None, None),
        ("hair/long/adult", WHITE, "lum"), ("beards/beard/winter/male", WHITE, "lum"),
        ("hat/magic/wizard/base/adult/{a}/gray.png", None, None)]),
    "yoda": ("Le sage (Yoda)", [
        ("cape/solid/bg", BROWN, "lum"), ("body/bodies/child", GREEN, "mul"), ("head/heads/human/child", GREEN, "mul"),
        ("head/ears/long/adult", GREEN, "mul"), ("eyes/human/adult/default", None, None), ("cape/solid/fg", BROWN, "lum")]),
    "facteur": ("Le facteur (képi dessiné pour le Bureau)", [
        ("body/bodies/male", PALE, "mul"), ("feet/shoes/basic/male", "#222222", "lum"), ("legs/pants/male", NAVY, "lum"),
        ("torso/clothes/longsleeve/longsleeve/male", SKY, "lum"), ("torso/clothes/vest/male/{a}/navy.png", None, None),
        ("neck/tie/necktie/male", YELLOW, "lum"), ("head/heads/human/male", PALE, "mul"), ("eyes/human/adult/default", None, None),
        ("hair/plain/adult", "#6b4a2e", "lum"), ("backpack/straps/male/{a}/leather.png", None, None),
        ("backpack/squarepack/male/{a}/leather.png", None, None), (KEPI, None, None)]),
    "ackbar": ("L'amiral Ackbar (tête de Mon Calamari dessinée pour le Bureau)", [
        ("body/bodies/male", SALMON, "mul"), ("feet/shoes/basic/male", "#1d1d22", "lum"), ("legs/pants/male", "#3a3e48", "lum"),
        ("torso/clothes/longsleeve/longsleeve/male", UNIFORM, "lum"), ("head/heads/human/male", SALMON, "mul"), (CALAMARI, None, None)]),
    "marchand": ("Le marchand de sable (écharpe dessinée pour le Bureau)", [
        ("cape/solid/bg", VERT, "lum"), ("body/bodies/male", PALE, "mul"), ("feet/shoes/basic/male", "#3b2a1e", "lum"),
        ("legs/pants/male", NUIT_P, "lum"), ("torso/clothes/longsleeve/longsleeve/male", VERT_L, "lum"),
        ("head/heads/human/male", PALE, "mul"), ("eyes/human/adult/default", None, None), ("hair/parted/adult", BRUN_C, "lum"),
        (ECHARPE, None, None)]),
}
DRAWN = (KEPI, CALAMARI, ECHARPE)  # pas des calques LPC : dessinés case par case


def files(name):
    """Fichiers LPC de la recette, pour toutes ses animations (chemins du générateur)."""
    return [p.format(a=a) if "{a}" in p else f"{p}/{a}.png" for p, _, _ in RECIPES[name][1] if p not in DRAWN for a in anims(name)]


def kepi(sheet, head):
    """Képi sur chaque case de 64 px (rangées LPC : dos, gauche, face, droite) : calotte bleu marine aux coins arrondis,
    reflet, bandeau jaune, visière noire du côté où il regarde. head : le calque de la tête, pour la placer."""
    from PIL import ImageDraw
    out, hp, F = sheet.copy(), head.load(), 64
    dr = ImageDraw.Draw(out)
    for row in range(sheet.size[1] // F):
        for col in range(sheet.size[0] // F):
            ox, oy = col * F, row * F
            pts = [(x, y) for y in range(oy, oy + F) for x in range(ox, ox + F) if hp[x, y][3]]
            if not pts:
                continue
            top = min(y for _, y in pts) + 1
            xs = [x for x, y in pts if y <= top + 5]
            x0, x1 = min(xs), max(xs)
            dr.rectangle((x0 + 1, top - 2, x1 - 1, top + 3), fill=NAVY)
            dr.rectangle((x0, top - 1, x1, top + 3), fill=NAVY)
            dr.rectangle((x0 + 2, top - 2, x1 - 2, top - 2), fill="#3a54b0")
            dr.rectangle((x0, top + 3, x1, top + 4), fill=YELLOW)
            if row % 4 == 2:
                dr.rectangle((x0 + 1, top + 5, x1 - 1, top + 6), fill="#14161c")
            elif row % 4 == 1:
                dr.rectangle((x0 - 3, top + 5, x0 + 4, top + 6), fill="#14161c")
            elif row % 4 == 3:
                dr.rectangle((x1 - 4, top + 5, x1 + 3, top + 6), fill="#14161c")
    return out


def calamari(sheet, head):
    """Tête de Mon Calamari sur chaque case de 64 px (rangées LPC : dos, gauche, face, droite) : crâne en dôme plus haut et
    plus clair, gros yeux jaunes sur les côtés, barbillons sous la bouche. head : le calque de la tête, pour la placer."""
    from PIL import ImageDraw
    out, hp, F = sheet.copy(), head.load(), 64
    dr = ImageDraw.Draw(out)
    for row in range(sheet.size[1] // F):
        for col in range(sheet.size[0] // F):
            ox, oy = col * F, row * F
            pts = [(x, y) for y in range(oy, oy + F) for x in range(ox, ox + F) if hp[x, y][3]]
            if not pts:
                continue
            top, bot = min(y for _, y in pts), max(y for _, y in pts)
            x0, x1 = min(x for x, _ in pts), max(x for x, _ in pts)
            cx, d = (x0 + x1) // 2, row % 4
            dr.ellipse((x0, top - 4, x1, top + 9), fill="#c8743a")  # le dôme, au-dessus du crâne
            dr.ellipse((x0 + 2, top - 3, x1 - 3, top + 4), fill="#e0915a")  # reflet
            if d == 0:  # de dos : le dôme seul
                continue
            ey = top + 7
            eyes = [x0 - 1, x1 - 2] if d == 2 else [x0 - 1] if d == 1 else [x1 - 2]
            for ex in eyes:
                dr.ellipse((ex, ey - 2, ex + 3, ey + 3), fill="#ffd040")
                dr.point((ex + (1 if d != 1 else 0), ey), fill="#1a1010")
            mx = cx if d == 2 else cx - 3 if d == 1 else cx + 3
            for k in (-2, 0, 2):  # barbillons
                dr.line((mx + k, bot - 2, mx + k, bot + 1), fill="#a85a2a")
    return out


def echarpe(sheet, head):
    """Écharpe rayée rouge et crème sur chaque case de 64 px (rangées LPC : dos, gauche, face, droite), au cou, sous la
    tête : de face, un pan qui tombe sur la poitrine ; de profil, un pan qui flotte derrière. head : le calque de la tête."""
    from PIL import ImageDraw
    out, hp, F = sheet.copy(), head.load(), 64
    dr = ImageDraw.Draw(out)
    for row in range(sheet.size[1] // F):
        for col in range(sheet.size[0] // F):
            ox, oy = col * F, row * F
            pts = [(x, y) for y in range(oy, oy + F) for x in range(ox, ox + F) if hp[x, y][3]]
            if not pts:
                continue
            bot = max(y for _, y in pts)
            xs = [x for x, y in pts if y >= bot - 3]
            x0, x1, d = min(xs), max(xs), row % 4
            dr.rectangle((x0 - 1, bot - 1, x1 + 1, bot + 2), fill=ECH, outline="#2a1c14")
            for x in range(x0, x1 + 1, 3):
                dr.line((x, bot, x, bot + 1), fill=ECH_L)
            if d == 2:
                dr.rectangle((x0 + 1, bot + 2, x0 + 4, bot + 10), fill=ECH, outline="#2a1c14")
                for y in (bot + 5, bot + 8):
                    dr.line((x0 + 2, y, x0 + 3, y), fill=ECH_L)
            elif d in (1, 3):
                tx = x1 + 1 if d == 1 else x0 - 4
                dr.rectangle((tx, bot, tx + 3, bot + 7), fill=ECH, outline="#2a1c14")
                dr.line((tx + 1, bot + 4, tx + 2, bot + 4), fill=ECH_L)
    return out


def compose(name, anim):
    import build_sprites as bs
    from PIL import Image
    base = None
    for p, color, mode in RECIPES[name][1]:
        if p in DRAWN:
            hl = next(x for x in RECIPES[name][1] if x[0].startswith("head/heads"))
            draw = {KEPI: kepi, CALAMARI: calamari, ECHARPE: echarpe}[p]
            base = draw(base, bs.recolor(bs.layer([hl[0]], anim), bs.SKIN[hl[1]] if hl[1] in bs.SKIN else hl[1], hl[2]))
            continue
        im = bs.fetch(p.format(a=anim)) if "{a}" in p else bs.layer([p], anim)
        if im is None:
            raise SystemExit(f"calque absent : {p} ({anim})")
        if color:
            im = bs.recolor(im, bs.SKIN[color] if color in bs.SKIN else color, mode)
        base = im.copy() if base is None else Image.alpha_composite(base, im)
    return base


if __name__ == "__main__":
    import sys
    sys.path.insert(0, HERE)
    for name in RECIPES:
        os.makedirs(os.path.join(HERE, "common", name), exist_ok=True)
        for a in anims(name):
            out = os.path.join(HERE, "common", name, f"{name}-{a}.png")
            compose(name, a).save(out)
            print(out)
