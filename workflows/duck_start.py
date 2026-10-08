"""Ouvre une discussion avec le canard depuis la page Le Bureau (page action « bureau-duck »).

Arguments : project_id, relu par Kronn dans le dataset `gates` (liste `projects`, « none » = sans projet), puis le
sujet saisi dans la carte Kronn (texte libre ou numéro de ticket).
POST /api/discussions crée la discussion et son premier message sans lancer l'agent (l'interface de Kronn enchaîne
avec POST /api/discussions/{id}/run) : on fait de même. /run met le tour de l'agent en file (durable) avant de
répondre en flux SSE : on n'attend que les en-têtes, l'agent continue sans nous.
Titre « 🦆 … » : is_bureau_disc (_lib.py) le retire des visiteurs ; la page le liste dans la fiche du canard.
Sortie : {discussion_id, url}.
"""
import json, sys, urllib.request, urllib.error, uuid
from _lib import API, CFG

NOTE = "(Discussion ouverte depuis Le Bureau, par le canard. Si un numéro de ticket Jira est cité, va le lire.)"


def fail(msg):
    print(msg, file=sys.stderr)
    sys.exit(1)


def post(path, body, timeout=30):
    req = urllib.request.Request(API + path, method="POST", headers={"content-type": "application/json"},
                                 data=json.dumps(body).encode())
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError as e:
        fail(f"Kronn a refusé {path} ({e.code}) : {e.read()[:300].decode(errors='replace')}")
    except OSError as e:
        fail(f"Kronn injoignable ({path}) : {e}")


project = (sys.argv[1] if len(sys.argv) > 1 else "").strip()
topic = (sys.argv[2] if len(sys.argv) > 2 else "").strip()
if not project:
    fail("Projet manquant : recharge la page.")
if not topic:
    fail("Dis au canard de quoi tu veux parler.")
first = topic.splitlines()[0].strip()
title = "🦆 " + (first if len(first) <= 70 else first[:69].rstrip() + "…")
with post("/discussions", {"project_id": None if project == "none" else project, "title": title, "agent": "ClaudeCode",
                           "language": "fr", "initial_prompt": topic + "\n\n" + NOTE}) as r:
    res = json.load(r)
if not res.get("success", True) or not isinstance(res.get("data", res), dict) or not res.get("data", res).get("id"):
    fail("Kronn n'a pas créé la discussion : " + str(res.get("error")))
did = res.get("data", res)["id"]
with post(f"/discussions/{did}/run", {"idempotency_key": str(uuid.uuid4())}):
    pass  # file d'attente remplie : on ne lit pas le flux
print(json.dumps({"discussion_id": did, "url": ((CFG.get("kronn") or {}).get("ui") or "") + "#discussion-" + did}, ensure_ascii=False))
