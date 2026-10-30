"""Ouvre une discussion avec le canard depuis la page Le Bureau (page action « bureau-duck »).

Arguments : project_id, relu par Kronn dans le dataset `gates` (liste `projects`, « none » = sans projet), puis le
sujet saisi dans la carte Kronn (texte libre ou numéro de ticket).
Création et lancement : open_duck (_lib.py), partagé avec les todos du boss (todos.py).
Titre « 🦆 … » : is_bureau_disc (_lib.py) le retire des visiteurs ; la page le liste dans la fiche du canard.
Sortie : {discussion_id, url}.
"""
import json, sys
from _lib import CFG, open_duck, refresh


def fail(msg):
    print(msg, file=sys.stderr)
    sys.exit(1)


project = (sys.argv[1] if len(sys.argv) > 1 else "").strip()
topic = (sys.argv[2] if len(sys.argv) > 2 else "").strip()
asked = (sys.argv[3] if len(sys.argv) > 3 else "").strip()  # titre donné (facultatif)
if not project:
    fail("Projet manquant : recharge la page.")
if not topic:
    fail("Dis au canard de quoi tu veux parler.")
try:
    did = open_duck(topic, asked, None if project == "none" else project)
except RuntimeError as e:
    fail(str(e))
print(json.dumps({"discussion_id": did, "url": ((CFG.get("kronn") or {}).get("ui") or "") + "#discussion-" + did}, ensure_ascii=False))
refresh("live")  # le cron live le montre tout de suite (sauf s'il tourne déjà), sans faire échouer l'action
