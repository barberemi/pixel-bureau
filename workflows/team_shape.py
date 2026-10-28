import json, re, sys, unicodedata
from datetime import datetime, timedelta, timezone
import os
from _lib import CFG, TZ, dumps, read_json, write_json

D = json.load(sys.stdin)
# Changements de statut du sprint en cours (étape status_log, changelog/bulkfetch) rattachés à leur ticket par id,
# au format de expand=changelog : status_since et les événements du jour les lisent sans changer.
def _iso(ms):
    """bulkfetch date un changement en millisecondes epoch, expand=changelog en ISO : on ramène tout en ISO."""
    if isinstance(ms, (int, float)):
        return datetime.fromtimestamp(ms / 1000, timezone.utc).isoformat(timespec="milliseconds")
    return ms


_LOG = {str(l.get("issueId")): [dict(h, created=_iso(h.get("created"))) for h in l.get("changeHistories") or []]
        for l in D.get("status_log") or []}
for _it in D.get("issues") or []:
    if "changelog" not in _it and str(_it.get("id")) in _LOG:
        _it["changelog"] = {"histories": _LOG[str(_it.get("id"))]}
# GitHub regroupé dans une seule étape (github_snapshot.py) ; l'ancien format (une clé par étape gh) reste accepté
G = D.get("github") if isinstance(D.get("github"), dict) else {}
for _k in ("open", "merged", "releases", "staging", "prod"):
    if _k not in D:
        D[_k] = G.get(_k) or []
today = datetime.now(TZ).strftime("%Y-%m-%d")
J = CFG["jira"]
CAT = J["statuses"]                       # statut Jira -> colonne du Bureau (todo, doing, review, test, deploy, done)
KEY = re.compile(r"\b" + re.escape(J["project"]) + r"-\d+\b", re.I)
POINTS = J["points_fields"]              # champ(s) de story points, le premier non vide gagne (0 compte)
SPRINT_FIELD = J["sprint_field"]
DONE = J["done_status"]
# dépôt de chaque PR (#56) : owner/repo complet, celui du dépôt principal quand l'entrée ne le dit pas (ancien format)
MAIN_REPO = (CFG.get("github") or {}).get("repo") or ""
repo_of = lambda pr: pr.get("repo") or MAIN_REPO  # noqa: E731


def pr_keys(pr):
    """Clés Jira citées par une PR : dans son titre, puis dans sa branche (« feat/EW-7317-… » quand le titre dit « ew 7317 »)."""
    return sorted({k.upper() for k in KEY.findall(pr.get("title") or "") + KEY.findall(pr.get("headRefName") or "")})


def status_since(it):
    """Entrée dans le statut actuel : dernier changement de statut de l'historique, sinon la création du ticket.
    `updated` ne convient pas : une bascule de sprint ou une automatisation le réécrit pour tout le sprint."""
    moves = [h.get("created") for h in ((it.get("changelog") or {}).get("histories") or [])
             if h.get("created") and any(i.get("field") == "status" for i in h.get("items") or [])]
    return max(moves, key=jira_ts) if moves else (it.get("fields") or {}).get("created")


def jira_ts(iso):
    iso = re.sub(r"([+-]\d{2})(\d{2})$", r"\1:\2", (iso or "").replace("Z", "+00:00"))  # Jira : +0200 -> +02:00
    iso = re.sub(r"\.(\d{3})(?=[+-])", r".\g<1>000", iso)  # millisecondes -> microsecondes (Python < 3.11)
    return datetime.fromisoformat(iso)


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z ]", " ", s).split()


people, by_key, unassigned = {}, {}, []
# ordre du board (étape board_rank, API Agile) : le rang de chaque ticket du sprint, absent si la lecture a échoué
RANK = {it.get("key"): i for i, it in enumerate(D.get("rank") or []) if isinstance(it, dict) and it.get("key")}
for it in D.get("issues") or []:
    f = it.get("fields") or {}
    st = (f.get("status") or {}).get("name") or ""
    cat = CAT.get(st)
    if not cat:
        continue
    pts = next((f.get(k) for k in POINTS if f.get(k) is not None), None)
    t = {"key": it.get("key"), "summary": (f.get("summary") or "")[:110], "status": st, "cat": cat,
         "points": pts, "type": (f.get("issuetype") or {}).get("name"), "updated": f.get("updated"), "created": f.get("created"),
         "since": status_since(it)}
    if (f.get("priority") or {}).get("name"):
        t["prio"] = f["priority"]["name"]  # Highest, High, Medium, Low, Lowest (icône de la page)
    if it.get("key") in RANK:
        t["rank"] = RANK[it["key"]]
    a = f.get("assignee")
    if not a:
        unassigned.append(t)
        continue
    p = people.setdefault(a["accountId"], {"id": a["accountId"], "name": a.get("displayName"), "gh": [], "tickets": [], "prs": [], "merged": []})
    p["tickets"].append(t)
    by_key[t["key"].upper()] = p


def owner(author, title):
    tokens = set(norm(author.get("name"))) | set(norm(author.get("login")))
    login = (author.get("login") or "").lower()
    for p in people.values():
        parts = [w for w in norm(p["name"]) if len(w) >= 3]
        if parts and (all(w in tokens for w in parts) or all(w in login for w in parts)):
            return p
    loose = [p for p in people.values() if any(len(w) >= 4 and w in login for w in norm(p["name"]))]
    return loose[0] if len(loose) == 1 else None


others = []
for pr in D.get("open") or []:
    a = pr.get("author") or {}
    if a.get("is_bot"):
        continue
    review = {"APPROVED": "approved", "CHANGES_REQUESTED": "changes", "REVIEW_REQUIRED": "pending"}.get(pr.get("reviewDecision") or "", "pending")
    row = {"n": pr["number"], "repo": repo_of(pr), "title": pr["title"][:110], "draft": pr.get("isDraft"), "review": review,
           "url": pr["url"], "updated": pr.get("updatedAt"), "created": pr.get("createdAt"),
           "keys": pr_keys(pr), "head": pr.get("headRefName"),  # branche : « 🚀 Déployer la branche », occupant d'un env
           "req": [x for x in pr.get("reviewRequests") or [] if isinstance(x, str)],
           # #74 : en conflit avec sa base (DIRTY), commits de retard (None : inconnu), branche de base
           "conflict": pr.get("merge") == "DIRTY", "behind": pr.get("behind"), "base": pr.get("base"),
           "threads": pr.get("threads"),  # #75 : fils de review non résolus (None : inconnu)
           # CI du dernier commit, adresse de l'env de branche et son heure : seulement quand ils sont connus
           **{k: pr[k] for k in ("ci", "env_url", "env_at") if pr.get(k)}}
    p = owner(a, pr["title"])
    if p:
        p["prs"].append(row)
        if a.get("login") and a["login"] not in p["gh"]:
            p["gh"].append(a["login"])
    else:
        row["author"] = a.get("name") or a.get("login")
        others.append(row)

merged_today = []
for pr in D.get("merged") or []:
    m = pr.get("mergedAt") or ""
    if not m:
        continue
    local = datetime.fromisoformat(m.replace("Z", "+00:00")).astimezone(TZ)
    if local.strftime("%Y-%m-%d") != today:
        continue
    a = pr.get("author") or {}
    p = owner(a, pr["title"])
    row = {"n": pr["number"], "repo": repo_of(pr), "title": pr["title"][:110], "mergedAt": m, "url": pr["url"],
           "who": p["id"] if p else None, "author": a.get("name") or a.get("login")}
    merged_today.append(row)
    if p:
        p["merged"].append(row)


VER = re.compile(r"(\d+\.\d+\.\d+)")


def is_today(iso):
    return bool(iso) and jira_ts(iso).astimezone(TZ).strftime("%Y-%m-%d") == today


def runs_by_tag(runs):
    out = {}
    for r in sorted(runs or [], key=lambda x: x.get("createdAt") or ""):
        m = VER.search(r.get("displayTitle") or "")
        if m:
            out[m.group(1)] = {"status": r.get("status"), "conclusion": r.get("conclusion"), "start": r.get("createdAt"),
                               "end": r.get("updatedAt") if r.get("status") == "completed" else None, "url": r.get("url")}
    return out


stg, prd = runs_by_tag(D.get("staging")), runs_by_tag(D.get("prod"))
meps = []
for rel in D.get("releases") or []:
    tag = rel.get("tagName")
    s_, p_ = stg.get(tag), prd.get(tag)
    if not (is_today(rel.get("publishedAt")) or (s_ and is_today(s_["start"])) or (p_ and is_today(p_["start"]))):
        continue
    keys = KEY.findall(rel.get("name") or "")
    key = keys[-1].upper() if keys else None
    p = by_key.get(key) if key else None
    t = next((x for x in (p["tickets"] if p else []) if x["key"] == key), None)
    meps.append({"tag": tag, "name": rel.get("name"), "ticket": key, "summary": t["summary"] if t else None,
                 "who": p["id"] if p else None, "who_name": p["name"] if p else None,
                 "released": rel.get("publishedAt"), "staging": s_, "prod": p_})
meps.sort(key=lambda m: m["released"] or "")

# ---------- événements d'équipe du jour : changements de statut Jira, entrées au sprint, tickets créés, PR ouvertes, reviews ----------
events = []
by_acc = {p["id"]: p for p in people.values()}
# Ticket entré dans le sprint en cours après son démarrage (vaisseau-mère de la page). Jira écrit le champ Sprint en liste
# d'ids (« 41, 42 ») ; sans id de sprint, on compare les noms. La marge écarte les retouches juste après le planning.
_SP = D.get("sprint") or {}
SPRINT_ID, SPRINT_NAME = str(_SP.get("id") or ""), _SP.get("name") or ""
SPRINT_GRACE = timedelta(minutes=30)


def enters_sprint(item, at):
    if item.get("fieldId") != SPRINT_FIELD and item.get("field") != "Sprint":
        return False
    if not _SP.get("startDate") or jira_ts(at) < jira_ts(_SP["startDate"]) + SPRINT_GRACE:
        return False
    split = lambda s: {x.strip() for x in str(s or "").split(",") if x.strip()}  # noqa: E731
    if SPRINT_ID:
        return SPRINT_ID in split(item.get("to")) and SPRINT_ID not in split(item.get("from"))
    return bool(SPRINT_NAME) and SPRINT_NAME in split(item.get("toString")) and SPRINT_NAME not in split(item.get("fromString"))


open_keys = {it.get("key") for it in D.get("issues") or []}
# Les tickets du sprint fermé arrivent sans historique (étape jira_closed) : seuls leurs « créé aujourd'hui » comptent.
for it in (D.get("issues") or []) + [x for x in (D.get("closed") or []) if x.get("key") not in open_keys]:
    f = it.get("fields") or {}
    key = it.get("key")
    assignee = (f.get("assignee") or {}).get("accountId")
    if is_today(f.get("created")):
        events.append({"t": f["created"], "kind": "new", "key": key, "summary": (f.get("summary") or "")[:110],
                       "who": assignee if assignee in by_acc else None})
    for h in ((it.get("changelog") or {}).get("histories") or []):
        if not is_today(h.get("created")):
            continue
        for item in h.get("items") or []:
            a = h.get("author") or {}
            if enters_sprint(item, h["created"]):
                events.append({"t": h["created"], "kind": "sprint_in", "key": key, "summary": (f.get("summary") or "")[:110],
                               "points": next((f.get(k) for k in POINTS if f.get(k) is not None), None),
                               "who": assignee if assignee in by_acc else None, "who_name": (f.get("assignee") or {}).get("displayName"),
                               "by": a.get("accountId"), "by_name": a.get("displayName")})
                continue
            if item.get("field") != "status":
                continue
            events.append({"t": h["created"], "kind": "move", "key": key, "summary": (f.get("summary") or "")[:110],
                           "from": item.get("fromString"), "to": item.get("toString"), "cat": CAT.get(item.get("toString") or ""),
                           "who": a.get("accountId") if a.get("accountId") in by_acc else None, "who_name": a.get("displayName")})
gh_owner = {g.lower(): p["id"] for p in people.values() for g in p["gh"]}
for pr in D.get("open") or []:
    a = pr.get("author") or {}
    if a.get("is_bot"):
        continue
    author = gh_owner.get((a.get("login") or "").lower())
    keys = pr_keys(pr)
    base = {"n": pr["number"], "repo": repo_of(pr), "title": pr["title"][:110], "keys": keys, "author": author, "author_name": a.get("name") or a.get("login")}
    if is_today(pr.get("createdAt")) and not pr.get("isDraft"):
        events.append({"t": pr["createdAt"], "kind": "pr", **base})
    for rv in pr.get("latestReviews") or []:
        st = {"APPROVED": "approved", "CHANGES_REQUESTED": "changes", "COMMENTED": "commented"}.get(rv.get("state"))
        if not st or not is_today(rv.get("submittedAt")):
            continue
        login = ((rv.get("author") or {}).get("login") or "")
        events.append({"t": rv["submittedAt"], "kind": "review", "state": st, **base,
                       "by": gh_owner.get(login.lower()), "by_name": login})
events.sort(key=lambda e: e["t"])

# Première vue (Gandalf, soucoupe-mère) : ce cron passe toutes les 10 min, une scène de 3 min datée par Jira serait
# déjà finie quand la page l'apprend. On garde l'heure où ce cron a vu chaque changement de statut ou entrée au sprint
# pour la première fois (cache hors du dépôt) ; vue avec plus d'une minute et au plus 20 min de retard, l'événement la
# porte (seen) et la page joue la scène à partir de là. Premier passage sans cache, ou retard plus long (cron arrêté,
# nuit) : rien n'est décalé, pour ne pas rejouer d'un coup des scènes passées.
SEEN = os.path.join(os.path.expanduser("~"), ".cache", "pixel-bureau", "team_seen.json")
try:
    _seen = read_json(SEEN) if os.path.exists(SEEN) else None
except (OSError, ValueError):
    _seen = None  # cache illisible : comme un premier passage, rien de décalé
_first, _seen, _keep = _seen is None, _seen or {}, {}
_now = datetime.now(timezone.utc)
for e in events:
    if e["kind"] not in ("move", "sprint_in"):
        continue
    k = f'{e["kind"]}|{e["key"]}|{e["t"]}'
    s = _keep[k] = _seen.get(k) or (e["t"] if _first else _now.isoformat(timespec="seconds"))
    late = jira_ts(s) - jira_ts(e["t"])
    if timedelta(minutes=1) < late <= timedelta(minutes=20):
        e["seen"] = s
try:
    os.makedirs(os.path.dirname(SEEN), exist_ok=True)
    write_json(SEEN, _keep)  # seulement les événements du jour : le cache ne grossit pas
except OSError:
    pass

# ---------- dernier sprint fermé : points déployés par personne (employé du sprint tant que le nouveau n'a rien livré) ----------
def pts_of(f):
    return next((f.get(k) for k in POINTS if f.get(k) is not None), 0) or 0


last = None
for it in D.get("closed") or []:
    for sp_ in (it.get("fields") or {}).get(SPRINT_FIELD) or []:
        if sp_.get("state") == "closed" and sp_.get("completeDate") and (not last or sp_["completeDate"] > last["completeDate"]):
            last = sp_
prev_sprint = None
if last:
    prev = {}
    for it in D.get("closed") or []:
        f = it.get("fields") or {}
        if not any(x.get("id") == last["id"] for x in f.get(SPRINT_FIELD) or []):
            continue
        if (f.get("status") or {}).get("name") != DONE or not f.get("assignee"):
            continue
        a = f["assignee"]
        p = prev.setdefault(a["accountId"], {"id": a["accountId"], "name": a.get("displayName"), "tickets": []})
        p["tickets"].append({"key": it.get("key"), "summary": (f.get("summary") or "")[:110], "points": pts_of(f), "cat": "done"})
    # end : clôture dans Jira ; planned_end : fin prévue, jour des pizzas même si l'équipe a clôturé le matin et ouvert le suivant
    prev_sprint = {"name": last.get("name"), "end": last.get("completeDate"), "planned_end": last.get("endDate"), "people": list(prev.values())}

# ---------- travail Jira des rôles sans tickets assignés (PO, SM, QA), 7 derniers jours ----------
# par compte Jira : tickets écrits, triés (PO, SM) sur 7 jours ; testés et réouverts (QA) depuis le dernier daily ; 50 max par requête
# comptes Jira des rôles, rendus dans l'entrée par le modèle (emplacements jira.role.po, .sm, .qa ; vide si personne)
ROSTER_ROLES = {r: a for r, a in (D.get("roles") or {}).items() if isinstance(a, str) and a}
W = D.get("work") if isinstance(D.get("work"), dict) else {}


def brief(issues):
    out_ = []
    for it in issues or []:
        f = it.get("fields") or {}
        stn = (f.get("status") or {}).get("name")
        out_.append({"key": it.get("key"), "summary": (f.get("summary") or "")[:100], "type": (f.get("issuetype") or {}).get("name"),
                     "status": stn, "cat": CAT.get(stn)})
    return out_


work = {}


def wk(acc):
    return work.setdefault(acc, {"written": [], "triaged": [], "tested": [], "reopened": []})


for it in W.get("written") or []:
    rep = ((it.get("fields") or {}).get("reporter") or {}).get("accountId")
    if rep:
        wk(rep)["written"] += brief([it])
for role, key in (("po", "po_triage"), ("sm", "sm_triage")):
    if ROSTER_ROLES.get(role) and isinstance(W.get(key), list):
        wk(ROSTER_ROLES[role])["triaged"] = brief(W[key])
if ROSTER_ROLES.get("qa"):
    if isinstance(W.get("qa_ok"), list):
        wk(ROSTER_ROLES["qa"])["tested"] = brief(W["qa_ok"])  # passés en test depuis le dernier daily
    if isinstance(W.get("qa_back"), list):
        wk(ROSTER_ROLES["qa"])["reopened"] = brief(W["qa_back"])

# tickets créés depuis le dernier daily (étape new_tickets), avec leur auteur : la page ne garde que ceux de l'équipe
# (stand-up de la facilitatrice, fil, pile de documents sur son bureau)
new_tickets = []
for it in D.get("new_tickets") or []:
    f = it.get("fields") or {}
    rep = f.get("reporter") or {}
    stn = (f.get("status") or {}).get("name")
    new_tickets.append({"key": it.get("key"), "summary": (f.get("summary") or "")[:110], "type": (f.get("issuetype") or {}).get("name"),
                        "status": stn, "cat": CAT.get(stn), "created": f.get("created"),
                        "by": rep.get("accountId"), "by_name": rep.get("displayName")})

# ---------- sprint planning : tickets des 2 prochains sprints sans story points (étapes future_sprints, planning_tickets) ----------
PL = D.get("planning") if isinstance(D.get("planning"), dict) else {}
nexts = [s_ for s_ in (PL.get("sprints") if isinstance(PL.get("sprints"), list) else []) if isinstance(s_, dict) and s_.get("id")][:2]
planning = None
if nexts:
    ids = {s_["id"] for s_ in nexts}
    pl_tickets = []
    for it in PL.get("issues") if isinstance(PL.get("issues"), list) else []:
        f = it.get("fields") or {}
        if any(f.get(k) for k in POINTS):  # estimé entre-temps
            continue
        sp_ = next((x for x in f.get(SPRINT_FIELD) or [] if x.get("id") in ids), None)
        if not sp_:
            continue
        stn = (f.get("status") or {}).get("name")
        pl_tickets.append({"key": it.get("key"), "summary": (f.get("summary") or "")[:110], "type": (f.get("issuetype") or {}).get("name"),
                           "status": stn, "cat": CAT.get(stn), "sprint": sp_["id"], "who": ((f.get("assignee") or {}).get("displayName"))})
    planning = {"sprints": [{"id": s_["id"], "name": s_.get("name"), "start": s_.get("startDate"), "end": s_.get("endDate")} for s_ in nexts],
                "tickets": pl_tickets}

sp = D.get("sprint") or {}
out = {
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "sprint": {"name": sp.get("name"), "start": sp.get("startDate"), "end": sp.get("endDate")},
    "people": sorted(people.values(), key=lambda p: p["name"] or ""),
    "unassigned": unassigned,
    "other_prs": others,
    "merged_today": merged_today,
    "meps": meps,
    "events": events,
    "prev_sprint": prev_sprint,
    "work": work,
    "new_tickets": new_tickets,
    "planning": planning,
    # sources disponibles : la page masque ce qui manque au lieu d'afficher du vide trompeur
    "sources": {"jira": bool(D.get("issues")) or bool(D.get("sprint")), "github": not G.get("errors") if G else True,
                "github_errors": (G.get("errors") or [])[:5]},
    # échecs partiels (#8) : un autre dépôt de PR illisible (#56), affiché par le panneau Fraîcheur
    "warnings": [w for w in G.get("warnings") or [] if isinstance(w, str)][:10],
}
# Kronn coupe la sortie d'une étape Exec à 100 Ko : au-delà, le JSON tronqué casserait la publication.
# On raccourcit d'abord la plus longue liste secondaire (les plus vieux événements du jour en premier).
LIMIT = 95 * 1024
text = dumps(out)
while len(text.encode()) > LIMIT:
    lists = [(out["events"], True), (out["unassigned"], False), (out["other_prs"], False), (out["merged_today"], False),
             (out["new_tickets"], False)] + ([(planning["tickets"], False)] if planning else [])
    lists += [(w[k], False) for w in work.values() for k in w]
    lst, oldest_first = max(lists, key=lambda x: len(x[0]))
    if len(lst) <= 5:
        break
    n = max(1, len(lst) // 4)
    del lst[slice(0, n) if oldest_first else slice(-n, None)]
    out["truncated"] = True
    text = dumps(out)
print(text)
