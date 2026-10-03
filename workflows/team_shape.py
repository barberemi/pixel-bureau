import json, re, sys, unicodedata
from zoneinfo import ZoneInfo
from datetime import datetime, timedelta, timezone
# config d'installation : injectée par tools/publish.py (étape Kronn « python3 -c ») ; en local, lue dans bureau.config.json
import os as _os
_CFG = r"""__BUREAU_CONFIG__"""
CFG = json.loads(_CFG) if not _CFG.startswith("__") else json.load(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), _os.pardir, "bureau.config.json")))

D = json.load(sys.stdin)
# GitHub regroupé dans une seule étape (github_snapshot.py) ; l'ancien format (une clé par étape gh) reste accepté
G = D.get("github") if isinstance(D.get("github"), dict) else {}
for _k in ("open", "merged", "releases", "staging", "prod"):
    if _k not in D:
        D[_k] = G.get(_k) or []
TZ = ZoneInfo(CFG["rhythm"]["timezone"])  # fuseau du bureau, été comme hiver
today = datetime.now(TZ).strftime("%Y-%m-%d")
J = CFG["jira"]
CAT = J["statuses"]                       # statut Jira -> colonne du Bureau (todo, doing, review, test, deploy, done)
KEY = re.compile(r"\b" + re.escape(J["project"]) + r"-\d+\b", re.I)
POINTS = J["points_fields"]              # champ(s) de story points, le premier rempli gagne
SPRINT_FIELD = J["sprint_field"]
DONE = J["done_status"]


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z ]", " ", s).split()


people, by_key, unassigned = {}, {}, []
for it in D.get("issues") or []:
    f = it.get("fields") or {}
    st = (f.get("status") or {}).get("name") or ""
    cat = CAT.get(st)
    if not cat:
        continue
    pts = next((f.get(k) for k in POINTS if f.get(k)), None)
    t = {"key": it.get("key"), "summary": (f.get("summary") or "")[:110], "status": st, "cat": cat,
         "points": pts, "type": (f.get("issuetype") or {}).get("name"), "updated": f.get("updated")}
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
    row = {"n": pr["number"], "title": pr["title"][:110], "draft": pr.get("isDraft"), "review": review,
           "url": pr["url"], "updated": pr.get("updatedAt"), "keys": sorted({k.upper() for k in KEY.findall(pr["title"])}),
           "req": [x for x in pr.get("reviewRequests") or [] if isinstance(x, str)]}
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
    row = {"n": pr["number"], "title": pr["title"][:110], "mergedAt": m, "url": pr["url"],
           "who": p["id"] if p else None, "author": a.get("name") or a.get("login")}
    merged_today.append(row)
    if p:
        p["merged"].append(row)


VER = re.compile(r"(\d+\.\d+\.\d+)")


def is_today(iso):
    if not iso:
        return False
    iso = re.sub(r"([+-]\d{2})(\d{2})$", r"\1:\2", iso.replace("Z", "+00:00"))  # Jira : +0200 -> +02:00
    iso = re.sub(r"\.(\d{3})(?=[+-])", r".\g<1>000", iso)  # millisecondes -> microsecondes (Python < 3.11)
    return datetime.fromisoformat(iso).astimezone(TZ).strftime("%Y-%m-%d") == today


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

# ---------- événements d'équipe du jour : changements de statut Jira, tickets créés, PR ouvertes, reviews ----------
events = []
by_acc = {p["id"]: p for p in people.values()}
open_keys = {it.get("key") for it in D.get("issues") or []}
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
            if item.get("field") != "status":
                continue
            a = h.get("author") or {}
            events.append({"t": h["created"], "kind": "move", "key": key, "summary": (f.get("summary") or "")[:110],
                           "from": item.get("fromString"), "to": item.get("toString"), "cat": CAT.get(item.get("toString") or ""),
                           "who": a.get("accountId") if a.get("accountId") in by_acc else None, "who_name": a.get("displayName")})
gh_owner = {g.lower(): p["id"] for p in people.values() for g in p["gh"]}
for pr in D.get("open") or []:
    a = pr.get("author") or {}
    if a.get("is_bot"):
        continue
    author = gh_owner.get((a.get("login") or "").lower())
    keys = sorted({k.upper() for k in KEY.findall(pr["title"])})
    base = {"n": pr["number"], "title": pr["title"][:110], "keys": keys, "author": author, "author_name": a.get("name") or a.get("login")}
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

# ---------- dernier sprint fermé : points déployés par personne (employé du sprint tant que le nouveau n'a rien livré) ----------
def pts_of(f):
    return next((f.get(k) for k in POINTS if f.get(k)), 0)


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
    prev_sprint = {"name": last.get("name"), "end": last.get("completeDate"), "people": list(prev.values())}

# ---------- travail Jira des rôles sans tickets assignés (PO, SM, QA), 7 derniers jours ----------
# par compte Jira : tickets écrits, triés (PO, SM), recettes validées et renvoyées (QA) ; 50 max par requête (« 50+ »)
# comptes Jira des rôles, rendus dans l'entrée par le modèle (emplacements jira.role.po, .sm, .qa ; vide si personne)
ROSTER_ROLES = {r: a for r, a in (D.get("roles") or {}).items() if isinstance(a, str) and a}
W = D.get("work") if isinstance(D.get("work"), dict) else {}


def brief(issues):
    out_ = []
    for it in issues or []:
        f = it.get("fields") or {}
        out_.append({"key": it.get("key"), "summary": (f.get("summary") or "")[:100], "type": (f.get("issuetype") or {}).get("name")})
    return out_


work = {}


def wk(acc):
    return work.setdefault(acc, {"written": [], "triaged": [], "validated": [], "reopened": []})


for it in W.get("written") or []:
    rep = ((it.get("fields") or {}).get("reporter") or {}).get("accountId")
    if rep:
        wk(rep)["written"] += brief([it])
for role, key in (("po", "po_triage"), ("sm", "sm_triage")):
    if ROSTER_ROLES.get(role) and isinstance(W.get(key), list):
        wk(ROSTER_ROLES[role])["triaged"] = brief(W[key])
if ROSTER_ROLES.get("qa"):
    if isinstance(W.get("qa_ok"), list):
        wk(ROSTER_ROLES["qa"])["validated"] = brief(W["qa_ok"])
    if isinstance(W.get("qa_back"), list):
        wk(ROSTER_ROLES["qa"])["reopened"] = brief(W["qa_back"])

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
    # sources disponibles : la page masque ce qui manque au lieu d'afficher du vide trompeur
    "sources": {"jira": bool(D.get("issues")) or bool(D.get("sprint")), "github": not G.get("errors") if G else True,
                "github_errors": (G.get("errors") or [])[:5]},
}
print(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
