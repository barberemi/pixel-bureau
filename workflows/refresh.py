"""Relance des crons du Bureau à la fin d'un modèle qui ne publie rien lui-même (étape Exec « refresh », 0 token).

  python3 -c <ce script> team|live|office [...]

La page se met à jour dès qu'un cron publie dans un de ses datasets (Kronn 0.15.1) : relancer team (Jira, PR), live
(runs, gates, discussions) ou office (la journée, l'Œil du RDC) tout de suite montre l'effet de l'action sans attendre
leur passage suivant. Un cron à la fois, dans l'ordre ; rien pour celui qui tourne déjà. Ne fait jamais échouer le
run : une ligne de compte rendu par cron, code de sortie toujours 0.
"""
import sys
from _lib import refresh

for which in [x.strip() for x in sys.argv[1:] if x.strip()] or [""]:
    refresh(which, out=sys.stdout)
