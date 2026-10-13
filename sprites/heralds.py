"""Planches des hérauts communs (sprites/common/) : le mage (Gandalf) et le sage (Yoda), composés le 2026-10-05 à partir
de calques du générateur LPC. Leurs recettes servent aussi à les créditer (credits.py).

    .venv/bin/python sprites/heralds.py    # refait sprites/common/<nom>/<nom>-walk.png et -idle.png (identiques au pixel)
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ANIMS = ("walk", "idle")
GRAY, ROBE, WHITE, GREEN, BROWN = "#8d8f97", "#7c7f88", "#ecebe6", "#9fc46a", "#6b5038"
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
}


def files(name):
    """Fichiers LPC de la recette, pour toutes ses animations (chemins du générateur)."""
    return [p.format(a=a) if "{a}" in p else f"{p}/{a}.png" for p, _, _ in RECIPES[name][1] for a in ANIMS]


def compose(name, anim):
    import build_sprites as bs
    from PIL import Image
    base = None
    for p, color, mode in RECIPES[name][1]:
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
        for a in ANIMS:
            out = os.path.join(HERE, "common", name, f"{name}-{a}.png")
            compose(name, a).save(out)
            print(out)
