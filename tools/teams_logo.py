"""Images de l'annonce Teams des mises en prod (#59), en PNG de 48 px (affichées en 22 et 36 px, nettes en Retina).

  .venv/bin/python tools/teams_logo.py loader                       # sprites/teams/loader.png : chargeur animé (APNG), commun
  .venv/bin/python tools/teams_logo.py badge API "#7c3aed" out.png  # pastille à initiales pour un projet sans logo
  .venv/bin/python tools/teams_logo.py logo source.png out.png      # un vrai logo réduit à 48 px

Teams n'accepte que PNG et JPEG ; un APNG s'y anime. L'édition d'une carte est limitée à 28 Ko : chargeur et logo restent
sous 8 Ko chacun (test_teams_logo).
"""
import io, os, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S, K = 48, 4  # taille finale, suréchantillonnage (bords lisses)
LOADER = os.path.join(ROOT, "sprites", "teams", "loader.png")


def loader(n=12, color=(1, 114, 240), track=(200, 210, 225)):
    frames = []
    for k in range(n):
        im = Image.new("RGBA", (S * K, S * K), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        box, w = [6 * K, 6 * K, (S - 6) * K, (S - 6) * K], 6 * K
        d.ellipse(box, outline=track + (255,), width=w)
        a0 = k * 360 / n - 90
        d.arc(box, a0, a0 + 100, fill=color + (255,), width=w)
        frames.append(im.resize((S, S), Image.LANCZOS))
    # couleurs et transparence ramenées à quelques paliers (bords encore lisses) : quelques Ko au lieu d'une trentaine
    frames = [f.point(lambda v: min(255, round(v / 85) * 85)) for f in frames]
    buf = io.BytesIO()
    frames[0].save(buf, "PNG", save_all=True, append_images=frames[1:], duration=80, loop=0, disposal=1, optimize=True)
    return buf.getvalue()


def badge(text, color):
    rgb = tuple(int(color.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))
    im = Image.new("RGBA", (S * K, S * K), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([2 * K, 2 * K, (S - 2) * K, (S - 2) * K], radius=9 * K, fill=rgb + (255,))
    font = None
    for f in ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
        if os.path.exists(f):
            font = ImageFont.truetype(f, (20 if len(text) <= 2 else 15) * K)
            break
    d.text((S * K / 2, S * K / 2), text, fill="white", font=font or ImageFont.load_default(), anchor="mm")
    buf = io.BytesIO()
    im.resize((S, S), Image.LANCZOS).save(buf, "PNG", optimize=True)
    return buf.getvalue()


def logo(src):
    im = Image.open(src).convert("RGBA")
    im.thumbnail((S, S), Image.LANCZOS)
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    out.paste(im, ((S - im.width) // 2, (S - im.height) // 2))
    buf = io.BytesIO()
    out.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def write(path, data):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    print(f"✓ {path} ({len(data)} octets)")


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["loader"]:
        write(LOADER, loader())
    elif a[:1] == ["badge"] and len(a) == 4:
        write(a[3], badge(a[1], a[2]))
    elif a[:1] == ["logo"] and len(a) == 3:
        write(a[2], logo(a[1]))
    else:
        sys.exit(__doc__)
