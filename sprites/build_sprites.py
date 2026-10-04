"""Compose LPC characters (CC-BY-SA / GPL, Universal LPC generator) into compact sheets.

Sheet layout (64x64 frames):
  rows 0-3 : walk up/left/down/right, 9 frames
  row 4    : idle up f0,f1 | idle down f0,f1 | idle left f0 | idle right f0
  row 5    : emote down f0..f2 | hurt f0..f5
"""
import base64, io, json, os, urllib.request
from PIL import Image

BASE = "https://raw.githubusercontent.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/master/spritesheets"
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lpc_cache")
os.makedirs(CACHE, exist_ok=True)
ANIMS = ["walk", "idle", "emote", "hurt"]


def fetch(path):
    local = os.path.join(CACHE, path.replace("/", "__"))
    if os.path.exists(local):
        return Image.open(local).convert("RGBA") if os.path.getsize(local) else None
    try:
        data = urllib.request.urlopen(f"{BASE}/{path}", timeout=20).read()
    except Exception:
        open(local, "wb").close()
        return None
    open(local, "wb").write(data)
    return Image.open(io.BytesIO(data)).convert("RGBA")


def layer(candidates, anim):
    for c in candidates:
        im = fetch(f"{c}/{anim}.png")
        if im is not None:
            return im
    return None


def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def recolor(im, color, mode):
    """mode 'lum': map luminance onto target color ramp; 'mul': multiply."""
    if im is None or color is None:
        return im
    t = hexrgb(color)
    px = im.load()
    w, h = im.size
    if mode == "lum":
        lums = [0.3 * r + 0.59 * g + 0.11 * b for (r, g, b, a) in im.getdata() if a]
        mx = max(lums) if lums else 255
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if not a:
                continue
            if mode == "mul":
                px[x, y] = (r * t[0] // 255, g * t[1] // 255, b * t[2] // 255, a)
            else:
                l = (0.3 * r + 0.59 * g + 0.11 * b) / mx
                k = 0.15 + 1.0 * l
                px[x, y] = tuple(min(255, int(c * k)) for c in t) + (a,)
    return im


SKIN = {"light": "#ffffff", "pale": "#f4e2d4", "tan": "#d7a57e", "brown": "#a8724e", "dark": "#7a5038"}


def char_layers(spec, anim):
    sex = spec["sex"]
    thin = "thin" if sex == "female" else "male"
    L = []
    L.append(recolor(layer([f"body/bodies/{sex}"], anim), SKIN[spec.get("skin", "light")], "mul"))
    L.append(recolor(layer([f"feet/shoes/basic/{thin}"], anim), spec.get("shoes", "#3a2a22"), "lum"))
    legs = spec.get("legs", "pants")
    L.append(recolor(layer([f"legs/{legs}/{thin}", f"legs/{legs}/male", f"legs/pants/{thin}"], anim), spec.get("legs_color", "#3b4a63"), "lum"))
    torso = spec.get("torso", "longsleeve/longsleeve")
    L.append(recolor(layer([f"torso/clothes/{torso}/{sex}", f"torso/clothes/{torso}/male", f"torso/clothes/longsleeve/longsleeve/{sex}"], anim), spec["shirt"], "lum"))
    head = "human/female" if sex == "female" else "human/" + spec.get("head", "male")
    L.append(recolor(layer([f"head/heads/{head}"], anim), SKIN[spec.get("skin", "light")], "mul"))
    L.append(layer(["eyes/human/adult/default"], anim))
    if spec.get("beard"):
        L.append(recolor(layer([f"beards/{spec['beard']}"], anim), spec["hair_color"], "lum"))
    if spec.get("hair"):
        L.append(recolor(layer([f"hair/{spec['hair']}/adult", f"hair/{spec['hair']}/{sex}", f"hair/{spec['hair']}"], anim), spec["hair_color"], "lum"))
    if spec.get("hat"):
        L.append(recolor(layer([f"hat/{spec['hat']}", f"hat/{spec['hat']}/adult"], anim), spec.get("hat_color"), "lum"))
    if spec.get("glasses"):
        L.append(layer([f"facial/glasses/{spec['glasses']}/adult"], anim))
    base = None
    for im in L:
        if im is None:
            continue
        base = im.copy() if base is None else Image.alpha_composite(base, im)
    return base


def frame(sheet, row, col):
    return sheet.crop((col * 64, row * 64, col * 64 + 64, row * 64 + 64))


def build(spec):
    sheets = {a: char_layers(spec, a) for a in ANIMS}
    out = Image.new("RGBA", (576, 384), (0, 0, 0, 0))
    for r in range(4):
        for c in range(9):
            out.paste(frame(sheets["walk"], r, c), (c * 64, r * 64))
    idle = sheets["idle"]
    row4 = [frame(idle, 0, 0), frame(idle, 0, 1), frame(idle, 2, 0), frame(idle, 2, 1), frame(idle, 1, 0), frame(idle, 3, 0)]
    for c, f in enumerate(row4):
        out.paste(f, (c * 64, 256))
    emote, hurt = sheets["emote"], sheets["hurt"]
    row5 = [frame(emote, 2, c) for c in range(3)] + [frame(hurt, 0, c) for c in range(6)]
    for c, f in enumerate(row5):
        out.paste(f, (c * 64, 320))
    q = out.quantize(colors=48, method=Image.Quantize.FASTOCTREE)
    buf = io.BytesIO()
    q.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def build_custom(folder):
    """Sprite fourni -> même planche que les avatars composés. Deux formats acceptés :
    - planche complète exportée du générateur LPC (832 px de large) : marche rangées 8-11,
      attente 22-25 (dos, gauche, face, droite), bras levés (emote) 34-37 ;
    - deux fichiers séparés au format LPC : *walk*.png (9x4) et *idle*.png (2x4), *emote*.png (3x1, facultatif).
    """
    files = sorted(f for f in os.listdir(folder) if f.lower().endswith(".png"))
    full = next((f for f in files if Image.open(os.path.join(folder, f)).size[0] == 832), None)
    if full:
        im = Image.open(os.path.join(folder, full)).convert("RGBA")
        walk = im.crop((0, 8 * 64, 576, 12 * 64))
        idle = im.crop((0, 22 * 64, 128, 26 * 64))
        emote = [frame(im, 36, c) for c in range(3)] if im.size[1] >= 38 * 64 else None
    else:
        pick = lambda k: next(f for f in files if k in f.lower())
        walk = Image.open(os.path.join(folder, pick("walk"))).convert("RGBA")
        idle = Image.open(os.path.join(folder, pick("idle"))).convert("RGBA")
        em = next((f for f in files if "emote" in f.lower()), None)
        emote = [frame(Image.open(os.path.join(folder, em)).convert("RGBA"), 0, c) for c in range(3)] if em else None
    out = Image.new("RGBA", (576, 384), (0, 0, 0, 0))
    for r in range(4):
        for c in range(9):
            out.paste(frame(walk, r, c), (c * 64, r * 64))
    row4 = [frame(idle, 0, 0), frame(idle, 0, 1), frame(idle, 2, 0), frame(idle, 2, 1), frame(idle, 1, 0), frame(idle, 3, 0)]
    for c, f in enumerate(row4):
        out.paste(f, (c * 64, 256))
    for c, f in enumerate(emote or [frame(idle, 2, 0), frame(idle, 2, 1), frame(idle, 2, 0)]):
        out.paste(f, (c * 64, 320))
    q = out.quantize(colors=64, method=Image.Quantize.FASTOCTREE)
    buf = io.BytesIO()
    q.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def sheets(custom_dir):
    """Planches des sprites fournis d'un dossier (un sous-dossier par sprite)."""
    out = {}
    for name in sorted(os.listdir(custom_dir)) if os.path.isdir(custom_dir) else []:
        png = build_custom(os.path.join(custom_dir, name))
        out[name] = "data:image/png;base64," + base64.b64encode(png).decode()
        print(name, len(png), "(sprite fourni)")
    return out


if __name__ == "__main__":
    # sprites/sprites.json (local, non commité) : avatars des recettes communes + sprites fournis de l'installation (custom/)
    # teams/<équipe>/sprites.json : sprites fournis de l'équipe (teams/<équipe>/sprites/)
    here = os.path.dirname(os.path.abspath(__file__))
    specs = json.load(open(os.path.join(here, "cast.json")))
    result = {}
    preview = Image.new("RGBA", (64 * 9, 64 * len(specs)), (210, 210, 210, 255))
    for i, (key, spec) in enumerate(specs.items()):
        png = build(spec)
        result[key] = "data:image/png;base64," + base64.b64encode(png).decode()
        im = Image.open(io.BytesIO(png)).convert("RGBA")
        preview.alpha_composite(im.crop((0, 128, 576, 192)), (0, i * 64))
        print(key, len(png))
    result.update(sheets(os.path.join(here, "custom")))
    json.dump(result, open(os.path.join(here, "sprites.json"), "w"))
    preview.resize((preview.width * 2, preview.height * 2), Image.NEAREST).save(os.path.join(here, "cast_preview.png"))
    print("total b64", sum(len(v) for v in result.values()))
    teams = os.path.join(os.path.dirname(here), "teams")
    for t in sorted(os.listdir(teams)) if os.path.isdir(teams) else []:
        if os.path.isdir(os.path.join(teams, t, "sprites")):
            json.dump(sheets(os.path.join(teams, t, "sprites")), open(os.path.join(teams, t, "sprites.json"), "w"))
            print(f"teams/{t}/sprites.json")
