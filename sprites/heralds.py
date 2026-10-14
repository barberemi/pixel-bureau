"""Planches des invités communs (sprites/common/) : le mage (Gandalf) et le sage (Yoda), composés le 2026-10-05 à partir
de calques du générateur LPC, et le facteur du courrier (#30, 2026-10-14). Leurs recettes servent aussi à les créditer
(credits.py). Le LPC n'a pas de képi : celui du facteur est dessiné ici, case par case, sur sa tête (« KEPI »).

    .venv/bin/python sprites/heralds.py    # refait sprites/common/<nom>/<nom>-walk.png et -idle.png (identiques au pixel)
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ANIMS = ("walk", "idle")
GRAY, ROBE, WHITE, GREEN, BROWN = "#8d8f97", "#7c7f88", "#ecebe6", "#9fc46a", "#6b5038"
NAVY, SKY, YELLOW = "#24357a", "#a9c8ec", "#f2c230"
KEPI = "KEPI"  # pas un calque LPC : le képi dessiné par kepi()
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
}


def files(name):
    """Fichiers LPC de la recette, pour toutes ses animations (chemins du générateur)."""
    return [p.format(a=a) if "{a}" in p else f"{p}/{a}.png" for p, _, _ in RECIPES[name][1] if p != KEPI for a in anims(name)]


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


def compose(name, anim):
    import build_sprites as bs
    from PIL import Image
    base = None
    for p, color, mode in RECIPES[name][1]:
        if p == KEPI:
            hl = next(x for x in RECIPES[name][1] if x[0].startswith("head/heads"))
            base = kepi(base, bs.recolor(bs.layer([hl[0]], anim), bs.SKIN[hl[1]] if hl[1] in bs.SKIN else hl[1], hl[2]))
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
