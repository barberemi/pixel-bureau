"""Relance un cron du Bureau à la fin d'un modèle qui ne publie rien lui-même (étape Exec « refresh », 0 token).

  python3 -c <ce script> team|live

La page se met à jour dès qu'un cron publie dans un de ses datasets (Kronn 0.15.1) : relancer team (Jira, PR) ou live
(runs, gates, discussions) tout de suite montre l'effet de l'action sans attendre leur passage suivant. Rien s'il
tourne déjà. Ne fait jamais échouer le run : une ligne de compte rendu, code de sortie toujours 0.
"""
import sys
from _lib import refresh

which = (sys.argv[1] if len(sys.argv) > 1 else "").strip()
refresh(which, out=sys.stdout)
