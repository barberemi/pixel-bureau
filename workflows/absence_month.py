"""Nom de la feuille du planning des absences pour le mois en cours (argument 0) ou le suivant (1), heure du bureau.

Les feuilles du classeur sont nommées sans accents (janvier, fevrier… aout… decembre). Un classeur par année : en
décembre, « le mois suivant » reste decembre (janvier est dans le classeur de l'année suivante).
Sortie (stdout) : le nom seul, sans retour à la ligne (il va tel quel dans le chemin de l'appel Graph).
"""
import sys
from datetime import datetime
from _lib import TZ

MONTHS = ("janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre")
offset = int(sys.argv[1]) if len(sys.argv) > 1 else 0
m = datetime.now(TZ).month - 1
sys.stdout.write(MONTHS[min(m + offset, 11)])
