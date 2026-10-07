"""Tickets et PR que les boutons de la page peuvent viser (dataset actions), pour le cron équipe.

Les cartes d'action de Kronn relisent côté serveur la valeur d'un bouton (clé du ticket, n° de PR) dans un dataset, par
une liste et un champ (« tickets.find(key).key ») : il leur faut du JSON, en listes plates. Le dataset team est publié en
texte et range ses tickets par personne ; ce script le relit dans Kronn juste après sa publication et en tire :

Sortie (stdout) : {generated_at, repo, tickets[{key, cat, pr}], prs[{n, repo}]}
- tickets : ceux du sprint (assignés ou non) ; pr = n° de la PR ouverte qui cite la clé dans son titre (une PR prête
  plutôt qu'un brouillon), sinon "" (le workflow de mise en prod la cherche alors lui-même).
- prs : PR ouvertes du dépôt suivi (github.repo).
"""
import json
from datetime import datetime
from _lib import CFG, TZ, dumps, get

repo = (CFG.get("github") or {}).get("repo") or ""
team = {}
try:
    ds = {d.get("name"): d.get("current") for d in get(f"/pages/{CFG['page_id']}").get("datasets") or []}
    team = ds.get("team") or {}
    team = json.loads(team) if isinstance(team, str) else team
except Exception:
    team = {}
people = team.get("people") or []
prs = [x for p in people for x in p.get("prs") or []] + list(team.get("other_prs") or [])


def pr_of(key):
    cited = sorted((x for x in prs if key in (x.get("keys") or [])), key=lambda x: (bool(x.get("draft")), -int(x.get("n") or 0)))
    return str(cited[0]["n"]) if cited else ""


tickets = [x for p in people for x in p.get("tickets") or []] + list(team.get("unassigned") or [])
out = {"generated_at": datetime.now(TZ).isoformat(), "repo": repo,
       "tickets": [{"key": t["key"], "cat": t.get("cat"), "pr": pr_of(t["key"])} for t in tickets if t.get("key")],
       "prs": [{"n": str(x["n"]), "repo": repo} for x in prs if x.get("n")]}
print(dumps(out))
