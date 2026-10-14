"""Notes d'une version, tirées de CHANGELOG.md (format Keep a Changelog) : le texte de la GitHub Release (KT-66).

    python3 tools/release_notes.py 0.1.0        # la section « ## [0.1.0] - … », sans son titre
    python3 tools/release_notes.py --check 0.1.0  # code 1 si le tag ne correspond pas au fichier VERSION ou si la section manque
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def section(changelog, version):
    """Le texte de la section « ## [version] » (jusqu'à la suivante), sans son titre ; None si elle n'existe pas."""
    m = re.search(r"^## \[" + re.escape(version) + r"\][^\n]*\n(.*?)(?=^## \[|\Z)", changelog, re.S | re.M)
    return m.group(1).strip() if m else None


def main(argv):
    check = "--check" in argv
    args = [a for a in argv if a != "--check"]
    if len(args) != 1:
        print(__doc__)
        return 2
    tag = args[0]
    with open(os.path.join(ROOT, "CHANGELOG.md"), encoding="utf-8") as f:
        notes = section(f.read(), tag)
    with open(os.path.join(ROOT, "VERSION")) as f:
        current = f.read().strip()
    errors = ([] if notes else [f"pas de section « ## [{tag}] » dans CHANGELOG.md"]) + \
             ([] if tag == current else [f"tag {tag} différent de VERSION ({current})"])
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    if not check:
        print(notes)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
