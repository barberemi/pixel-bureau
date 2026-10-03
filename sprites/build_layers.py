"""Bibliothèque de calques LPC pour l'éditeur d'avatars de la page (assemblage dans le navigateur).

Chaque calque est mis à la même planche 576x384 que build_sprites.build(), puis encodé au plus compact :
  - 'lum' (vêtements, cheveux, barbe, chapeau) : niveaux de gris normalisés + alpha (PNG LA),
    la page applique la couleur choisie comme build_sprites.recolor(mode='lum') ;
  - 'mul' (corps, tête) : couleurs d'origine, la page multiplie par la teinte de peau ;
  - 'raw' (yeux, lunettes) : tel quel.
Sortie : layers.json {catalog, layers{id: {m, src}}}.
"""
import base64, io, json, os
from PIL import Image
from build_sprites import SKIN, frame, layer

ANIMS = ["walk", "idle", "emote"]

HERE = os.path.dirname(os.path.abspath(__file__))

HAIRS = ["plain", "buzzcut", "high_and_tight", "bangslong", "long", "lob", "long_messy", "curly_short",
         "curly_short2", "messy1", "messy2", "parted2", "bob", "bangs_bun", "balding", "spiked", "cowlick",
         "twists_fade", "pixie", "afro", "bedhead", "page", "shorthawk", "dreadlocks_long",
         "loose", "swoop", "long_straight", "curtains_long", "parted3"]
BEARDS = ["beard/5oclock_shadow", "beard/trimmed", "beard/basic", "mustache/basic"]
HATS = ["cloth/leather_cap", "cloth/bandana", "formal/bowler", "cloth/hood", "headband/thick"]
GLASSES = ["glasses", "halfmoon", "sunglasses"]
TORSOS = ["longsleeve/longsleeve", "shortsleeve/tshirt"]  # longsleeve/formal n'existe pas dans LPC
LEGS = ["pants", "formal"]
HEADS = ["male", "male_plump", "male_elderly"]


# la « leather_cap » LPC porte une plume rouge (bonnet de Robin des Bois) : on l'enlève pour une casquette sobre
FEATHER = {(177, 78, 69), (105, 21, 3), (56, 5, 16)}
OUTLINE = (29, 19, 30)


def defeather(im):
    im = im.copy()
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            if px[x, y][3] and px[x, y][:3] in FEATHER:
                px[x, y] = (0, 0, 0, 0)
    # contour devenu orphelin : pixel de contour sans voisin opaque qui ne soit pas du contour
    orphan = [(x, y) for y in range(h) for x in range(w)
              if px[x, y][3] and px[x, y][:3] == OUTLINE and not any(
                  0 <= x + dx < w and 0 <= y + dy < h and px[x + dx, y + dy][3] == 255 and px[x + dx, y + dy][:3] != OUTLINE
                  for dx in (-1, 0, 1) for dy in (-1, 0, 1))]
    for x, y in orphan:
        px[x, y] = (0, 0, 0, 0)
    return im


POST = {"hat/cloth/leather_cap": defeather}


def sheet(candidates, post=None):
    """Planche 576x384 d'un calque (mêmes cases que build_sprites.build), ou None."""
    s = {}
    for a in ANIMS:
        s[a] = layer(candidates, a)
        if s[a] is None:
            return None
        if post:
            s[a] = post(s[a])
    out = Image.new("RGBA", (576, 384), (0, 0, 0, 0))
    for r in range(4):
        for c in range(9):
            out.paste(frame(s["walk"], r, c), (c * 64, r * 64))
    idle = s["idle"]
    for c, f in enumerate([frame(idle, 0, 0), frame(idle, 0, 1), frame(idle, 2, 0), frame(idle, 2, 1), frame(idle, 1, 0), frame(idle, 3, 0)]):
        out.paste(f, (c * 64, 256))
    # rangée 5 : seuls les 3 cadres « emote » servent (pose bras levés) ; « hurt » n'est jamais affiché
    for c, f in enumerate([frame(s["emote"], 2, c) for c in range(3)]):
        out.paste(f, (c * 64, 320))
    return out if out.getbbox() else None


def encode(im, mode):
    buf = io.BytesIO()
    if mode == "lum":
        px = list(im.getdata())
        lums = [0.3 * r + 0.59 * g + 0.11 * b for (r, g, b, a) in px if a]
        mx = max(lums) or 1
        la = Image.new("LA", im.size)
        la.putdata([(min(255, round((0.3 * r + 0.59 * g + 0.11 * b) / mx * 255)), a) for (r, g, b, a) in px])
        la.save(buf, "PNG", optimize=True)
    else:
        im.quantize(colors=32, method=Image.Quantize.FASTOCTREE).save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def main():
    layers, cat = {}, {"hair": [], "beard": [], "hat": [], "glasses": [], "torso": [], "legs": [], "head": []}
    sizes = {}

    def add(lid, candidates, mode, group=None, opt=None):
        im = sheet(candidates, POST.get(lid))
        if im is None:
            print("  absent", lid)
            return False
        layers[lid] = {"m": mode, "src": encode(im, mode)}
        sizes[lid] = len(layers[lid]["src"])
        if group and opt not in cat[group]:
            cat[group].append(opt)
        return True

    for sex in ("male", "female"):
        thin = "thin" if sex == "female" else "male"
        add(f"body/{sex}", [f"body/bodies/{sex}"], "mul")
        add(f"feet/{sex}", [f"feet/shoes/basic/{thin}"], "lum")
        for lg in LEGS:
            add(f"legs/{lg}/{sex}", [f"legs/{lg}/{thin}", f"legs/{lg}/male"], "lum", "legs", lg)
        for t in TORSOS:
            add(f"torso/{t}/{sex}", [f"torso/clothes/{t}/{sex}", f"torso/clothes/{t}/male"], "lum", "torso", t)
        for h in HAIRS:
            # un style 'adult' sert aux deux silhouettes : ne le stocke qu'une fois
            if sex == "female" and f"hair/{h}/male" in layers and layer([f"hair/{h}/adult"], "walk") is not None:
                continue
            add(f"hair/{h}/{sex}", [f"hair/{h}/adult", f"hair/{h}/{sex}", f"hair/{h}"], "lum", "hair", h)
    add("head/female", ["head/heads/human/female"], "mul")
    for hd in HEADS:
        add(f"head/{hd}", [f"head/heads/human/{hd}"], "mul", "head", hd)
    add("eyes", ["eyes/human/adult/default"], "raw")
    for b in BEARDS:
        add(f"beard/{b}", [f"beards/{b}"], "lum", "beard", b)
    for h in HATS:
        add(f"hat/{h}", [f"hat/{h}/adult", f"hat/{h}"], "lum", "hat", h)
    for g in GLASSES:
        add(f"glasses/{g}", [f"facial/glasses/{g}/adult"], "raw", "glasses", g)

    out = {"catalog": cat, "skin": SKIN, "layers": layers}
    json.dump(out, open(os.path.join(HERE, "layers.json"), "w"), separators=(",", ":"))
    tot = sum(sizes.values())
    print(len(layers), "calques,", tot, "octets en data URI")
    for k, v in sorted(sizes.items(), key=lambda x: -x[1])[:8]:
        print("  ", k, v)


if __name__ == "__main__":
    main()
