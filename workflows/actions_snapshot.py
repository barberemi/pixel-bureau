"""Tickets et PR que les boutons de la page peuvent viser (dataset actions), pour le cron équipe.

Les cartes d'action de Kronn relisent côté serveur la valeur d'un bouton (clé du ticket, n° de PR) dans un dataset, par
une liste et un champ (« tickets.find(key).key », « prs.find(id).repo ») : il leur faut du JSON, en listes plates. Le dataset team est publié en
texte et range ses tickets par personne ; ce script le relit dans Kronn juste après sa publication et en tire :

Sortie (stdout) : {generated_at, repo, tickets[{key, cat, pr}], prs[{id, n, repo}], warnings[texte]}
- tickets : ceux du sprint (assignés ou non) ; pr = n° de la PR ouverte du dépôt principal qui cite la clé (une PR
  prête plutôt qu'un brouillon), sinon "" (le workflow de mise en prod, qui travaille sur ce dépôt, la cherche alors).
- prs : PR ouvertes de tous les dépôts suivis (#56), chacune avec son vrai dépôt ; id = « owner/repo#n », la clé que
  relisent « Faire relire » (repo, pr) et « Corriger » (pr) : deux #16 de deux dépôts ne se confondent jamais.
- moves : les déplacements d'un ticket d'une colonne (◀ / ▶ de sa fiche, workflow « déplacer un ticket »), une ligne par
  sens : id « clé|prev » ou « clé|next », key, dir, to = le statut Jira visé, que Kronn relit (le bouton n'envoie que l'id).
  Avancer d'une colonne jusqu'à « Déployé », reculer d'une colonne depuis « En cours » jusqu'à « À déployer » ; le statut
  visé est le premier que jira.statuses range dans la colonne voisine. jira.moves les règle par colonne :
  {"review": {"prev": "En cours", "next": "To Test"}}, null pour retirer un sens.
- warnings (#8) : dataset team illisible, listes vides publiées quand même ; écrit aussi sur stderr (run Kronn).
"""
import json, sys
from datetime import datetime
from _lib import CFG, TZ, dumps, get

repo = (CFG.get("github") or {}).get("repo") or ""
team, warnings = {}, []
try:
    ds = {d.get("name"): d.get("current") for d in get(f"/pages/{CFG['page_id']}").get("datasets") or []}
    team = ds.get("team") or {}
    team = json.loads(team) if isinstance(team, str) else team
except Exception as e:
    team = {}
    warnings.append(f"dataset team illisible : boutons sans ticket ni PR ({str(e)[:120] or type(e).__name__})")
    print("actions : " + warnings[-1], file=sys.stderr)
people = team.get("people") or []
prs = [x for p in people for x in p.get("prs") or []] + list(team.get("other_prs") or [])


def repo_of(x):
    return x.get("repo") or repo  # ancien dataset team, sans dépôt par PR : le dépôt principal


def pr_of(key):
    cited = sorted((x for x in prs if key in (x.get("keys") or []) and repo_of(x).lower() == repo.lower()), key=lambda x: (bool(x.get("draft")), -int(x.get("n") or 0)))
    return str(cited[0]["n"]) if cited else ""


ORDER = ["todo", "doing", "review", "test", "deploy", "done"]
JIRA = CFG.get("jira") or {}
first = {}
for st, cat in (JIRA.get("statuses") or {}).items():
    first.setdefault(cat, st)
MOVES = {c: {"prev": first.get(ORDER[i - 1]) if 1 <= i <= 4 else None, "next": first.get(ORDER[i + 1]) if i <= 4 else None}
         for i, c in enumerate(ORDER)}
for c, m in (JIRA.get("moves") or {}).items():
    MOVES.setdefault(c, {}).update(m or {})


def moves_of(t):
    m = MOVES.get(t.get("cat")) or {}
    return [{"id": f"{t['key']}|{d}", "key": t["key"], "dir": d, "to": m[d]} for d in ("prev", "next") if m.get(d)]


tickets = [x for p in people for x in p.get("tickets") or []] + list(team.get("unassigned") or [])
out = {"generated_at": datetime.now(TZ).isoformat(), "repo": repo,
       "tickets": [{"key": t["key"], "cat": t.get("cat"), "pr": pr_of(t["key"])} for t in tickets if t.get("key")],
       "prs": [{"id": f"{repo_of(x)}#{x['n']}", "n": str(x["n"]), "repo": repo_of(x)} for x in prs if x.get("n")],
       "moves": [m for t in tickets if t.get("key") for m in moves_of(t)],
       "warnings": warnings}
print(dumps(out))
