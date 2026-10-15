"""CREDITS.md : auteurs et licences de ce que Le Bureau redistribue (KT-29).

    python3 sprites/credits.py            # régénère CREDITS.md
    python3 sprites/credits.py --check    # code 1 si CREDITS.md n'est plus à jour (test)

Sprites : les fichiers LPC embarqués dans la page (sprites/lpc_used.json, écrit par build_layers.py) croisés avec le
CREDITS.csv du générateur LPC (auteurs, licences, sources de chaque fichier), téléchargé une fois dans
sprites/lpc_cache/. Un fichier absent du CSV prend les crédits de son dossier le plus proche. Planches fournies
(sprites/common/) : les recettes de heralds.py. Police : Press Start 2P.
"""
import csv, json, os, sys, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import heralds  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LPC_COMMIT = "9bf06be193b053db256b2536824af426de046aa2"  # le même commit que build_sprites.py (#9)
CSV_URL = f"https://raw.githubusercontent.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/{LPC_COMMIT}/CREDITS.csv"
CSV = os.path.join(HERE, "lpc_cache", "CREDITS.csv")
OUT = os.path.join(ROOT, "CREDITS.md")
ANIMS = ("walk", "idle", "emote", "hurt")
# planches fournies (sprites/common/), composées de calques LPC : {dossier: (nom, [fichiers LPC])}
HERALDS = {f"sprites/common/{n}": (heralds.RECIPES[n][0], heralds.files(n)) for n in heralds.RECIPES}


def credits_csv():
    if not os.path.exists(CSV):
        os.makedirs(os.path.dirname(CSV), exist_ok=True)
        open(CSV, "wb").write(urllib.request.urlopen(CSV_URL, timeout=60).read())
    return {r["filename"]: r for r in csv.DictReader(open(CSV, encoding="utf-8"))}


def split(v):
    return [x.strip() for x in (v or "").split(",") if x.strip() and x.strip() != "??"]  # « ?? » : auteur non renseigné


def byname(names):
    return sorted(names, key=lambda s: (s.lower(), s))  # ordre stable, même pour deux noms qui ne diffèrent que par la casse


def entry(path, rows):
    """(auteurs, licences, sources) d'un fichier LPC ; à défaut, ceux des fichiers de son dossier le plus proche."""
    if path in rows:
        found = [rows[path]]
    else:
        d, found = os.path.dirname(path), []
        while d and not found:
            found = [r for k, r in rows.items() if k.startswith(d + "/")]
            d = os.path.dirname(d)
    pick = lambda f: sorted({x for r in found for x in split(r[f])})  # noqa: E731
    return pick("authors"), pick("licenses"), pick("urls")


def asset(path):
    """Le calque d'un fichier : son chemin sans l'animation (« hair/plain/adult/walk.png » -> « hair/plain/adult »)."""
    parts = path[:-len(".png")].split("/")
    return "/".join(p for p in parts if p not in ANIMS)


def render(used, rows):
    groups = {}
    for p in used:
        a, l, u = entry(p, rows)
        g = groups.setdefault(asset(p), {"authors": set(), "licenses": set(), "urls": set()})
        g["authors"] |= set(a); g["licenses"] |= set(l); g["urls"] |= set(u)
    herald_authors = {x for _, fs in HERALDS.values() for f in fs for x in entry(f, rows)[0]}
    everyone = byname({x for g in groups.values() for x in g["authors"]} | herald_authors)
    lines = ["# Crédits", "",
             "Fichier généré par `python3 sprites/credits.py` : ne pas l'éditer à la main.", "",
             "## Code", "",
             "Le code du Bureau est sous licence [GNU AGPL 3.0](LICENSE).", "",
             "## Police", "",
             "[Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P), de CodeMan38, sous SIL Open Font License 1.1 "
             "(`page/fonts/OFL-PressStart2P.txt`).", "",
             "## Sprites LPC", "",
             "Les personnages sont composés de calques du [Universal LPC Spritesheet Character Generator]"
             "(https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator), issus du Liberated Pixel Cup. "
             "Chaque calque garde sa licence, au choix parmi celles indiquées (CC-BY-SA 3.0, GPL 3.0, OGA-BY 3.0, CC0…) ; "
             "Le Bureau les redistribue sous GPL 3.0 quand elle est proposée, compatible avec l'AGPL 3.0 du code, et crédite "
             "chaque artiste ci-dessous. Calques embarqués dans la page : `sprites/layers.json` (liste des fichiers : "
             "`sprites/lpc_used.json`).", "",
             f"### Les {len(everyone)} artistes", "", ", ".join(everyone) + ".", "",
             "### Calque par calque", "",
             "| Calque | Auteurs | Licences | Sources |", "| --- | --- | --- | --- |"]
    for a in sorted(groups):
        g = groups[a]
        src = " ".join(f"[{i + 1}]({u})" for i, u in enumerate(sorted(g["urls"])))
        lines.append(f"| `{a}` | {', '.join(byname(g['authors'])) or 'non renseigné dans le CSV du générateur'} | {', '.join(sorted(g['licenses']))} | {src} |")
    lines += ["", "## Planches fournies", ""]
    for d, (name, files) in HERALDS.items():
        if files:
            a = byname({x for f in files for x in entry(f, rows)[0]})
            layers = list(dict.fromkeys(asset(f) for f in files))
            lines.append(f"- {name} (`{d}/`, recette `sprites/heralds.py`) : calques LPC {', '.join('`' + x + '`' for x in layers)} ; "
                         f"artistes : {', '.join(a)}.")
        else:
            lines.append(f"- {name} (`{d}/`) : générateur LPC ; calques à relever.")
    lines.append("- Le sorcier du pack d'exemple (`tests/fixtures/pack-exemple/sprites/sorcier/`) : copie du mage, mêmes crédits.")
    lines += ["", "## Personnages", "",
              "La démo et les agents sont un clin d'œil de fan à *The Office*, les hérauts à Yoda (*Star Wars*) et à Gandalf "
              "(*Le Seigneur des anneaux*). Ces noms et ces personnages appartiennent à leurs ayants droit ; Le Bureau n'a "
              "aucun lien avec eux, ni leur approbation, et n'en fait aucun usage commercial.", ""]
    return "\n".join(lines)


def main(argv):
    used = json.load(open(os.path.join(HERE, "lpc_used.json")))
    text = render(used, credits_csv())
    if "--check" in argv:
        same = os.path.exists(OUT) and open(OUT, encoding="utf-8").read() == text
        print("CREDITS.md à jour" if same else "CREDITS.md à régénérer : python3 sprites/credits.py")
        return 0 if same else 1
    open(OUT, "w", encoding="utf-8").write(text)
    print(f"CREDITS.md : {len(used)} fichiers LPC")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
