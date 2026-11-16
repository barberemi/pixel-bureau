"""Feuille du planning des absences pour le mois en cours (argument 0) ou le suivant (1), heure du bureau ; avec « item »
en second argument, l'id du classeur où la lire.

Les feuilles d'un classeur sont nommées sans accents (janvier, fevrier… aout… decembre). Un classeur par année :
microsoft.planning.item est celui par défaut, microsoft.planning.years ({"2027": {"item": …}}) ceux des autres années, sur
le même site. Fin décembre, le calendrier de la page couvre déjà janvier : il est lu dans le classeur de l'année suivante
s'il est déclaré, sinon « le mois suivant » reste decembre (comme avant). En janvier, le classeur de l'année est pris
de lui-même.
Sortie (stdout) : le nom ou l'id seul, sans retour à la ligne (il va tel quel dans le chemin de l'appel Graph).
"""
import sys
from datetime import datetime
from _lib import CFG, TZ

MONTHS = ("janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre")


def target(offset, now):
    """(feuille, id du classeur) du mois visé."""
    planning = (CFG.get("microsoft") or {}).get("planning") or {}
    years = planning.get("years") or {}
    item = lambda y: ((years.get(str(y)) or {}).get("item") or "").strip()  # noqa: E731
    m, y = now.month - 1 + offset, now.year
    if m > 11:
        if not item(y + 1):  # pas de classeur pour l'année suivante : decembre, dans celui de l'année
            return MONTHS[11], item(y) or planning.get("item") or ""
        m, y = m - 12, y + 1
    return MONTHS[m], item(y) or planning.get("item") or ""


if __name__ == "__main__":
    sheet, item = target(int(sys.argv[1]) if len(sys.argv) > 1 else 0, datetime.now(TZ))
    sys.stdout.write(item if sys.argv[2:3] == ["item"] else sheet)
