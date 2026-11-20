"""L'Œil du RDC : tes PR ouvertes, de tous les dépôts que ton `gh` sait lire, et celles dont on te demande la relecture,
pour le cron office (étape oeil, toutes les 10 min), 0 token. Une seule requête GraphQL (deux recherches) par relevé.

Sortie (stdout) : {generated_at, me, mine: [{id, repo, n, title, url, draft, review, threads, ci, conflict, updated,
                    last: {who, at, text} | null}], asked: [{id, repo, n, title, url, author, since}], warnings}
- id = « owner/repo#n », la clé que relisent les boutons (dataset actions, actions_snapshot.py l'y ajoute) ;
- review = changes, approved, review (relecture attendue) ou "" ; ci = ok, ko, run ou null ; conflict = GitHub la dit en conflit ;
- threads = fils non résolus dont le dernier mot n'est ni le tien ni celui d'un bot (ce que « Corriger » aurait de neuf) ;
- last = le dernier retour d'un relecteur : commentaire d'un de ces fils ou review « changements demandés » (première
  ligne, 140 caractères au plus).
Les PR des dépôts archivés sont écartées par la recherche. Sans `gh` (absent, non connecté) : listes vides et warning,
le run ne tombe pas (#8).
Avec notify_mac (config) : une notification du Mac par retour nouveau (changements demandés, fil d'un relecteur) et par
demande de relecture nouvelle. Ce qui a déjà été signalé est retenu dans ~/.cache/pixel-bureau/oeil.json, écrit avant
l'envoi (s'il ne s'écrit pas, rien n'est envoyé) ; au premier relevé, tout est retenu sans rien envoyer.
"""
import json, os, shutil, subprocess, sys
from datetime import datetime, timezone
from _lib import CFG, dumps, read_json, write_json

SEEN = os.path.expanduser("~/.cache/pixel-bureau/oeil.json")
PR = ("number title url isDraft updatedAt repository{nameWithOwner} ")
Q = ("query{viewer{login} "
     "mine:search(query:\"is:pr is:open author:@me archived:false sort:updated-desc\",type:ISSUE,first:40){nodes{...on PullRequest{" + PR +
     "reviewDecision mergeable reviewThreads(first:100){nodes{isResolved comments(last:1){nodes{author{login __typename} createdAt body}}}} "
     "reviews(last:10,states:[CHANGES_REQUESTED]){nodes{author{login} submittedAt body}} "
     "commits(last:1){nodes{commit{statusCheckRollup{state}}}}}}} "
     "asked:search(query:\"is:pr is:open review-requested:@me archived:false sort:updated-desc\",type:ISSUE,first:30){nodes{...on PullRequest{" + PR +
     "createdAt author{login}}}}}")
CI = {"SUCCESS": "ok", "FAILURE": "ko", "ERROR": "ko", "PENDING": "run", "EXPECTED": "run"}
REVIEW = {"CHANGES_REQUESTED": "changes", "APPROVED": "approved", "REVIEW_REQUIRED": "review"}
warnings = []


def warn(msg):
    print("oeil : " + msg, file=sys.stderr)
    warnings.append(msg)


def line(s):
    return next((x.strip().lstrip("#>*- ").strip() for x in str(s or "").splitlines() if x.strip().lstrip("#>*- ").strip()), "")[:140]


def bot(a):
    return not a or a.get("__typename") == "Bot" or str(a.get("login") or "").endswith("[bot]")


def fetch():
    if not shutil.which("gh"):
        warn("gh introuvable : l'Œil ne voit pas tes PR")
        return {}
    try:
        r = subprocess.run(["gh", "api", "graphql", "-f", "query=" + Q], capture_output=True, text=True, timeout=60)
    except subprocess.TimeoutExpired:
        warn("GitHub n'a pas répondu à temps")
        return {}
    if r.returncode:
        warn("lecture GitHub en échec (" + ((r.stderr or "").strip().splitlines() or ["?"])[-1][:160] + ")")
        return {}
    try:
        return json.loads(r.stdout).get("data") or {}
    except ValueError:
        warn("réponse GitHub illisible")
        return {}


def mine_row(p, me):
    repo = p["repository"]["nameWithOwner"]
    fresh = []  # derniers commentaires des fils non résolus, d'un relecteur (ni toi ni un bot)
    for t in (p.get("reviewThreads") or {}).get("nodes") or []:
        c = ((t.get("comments") or {}).get("nodes") or [None])[-1]
        if not t.get("isResolved") and c and not bot(c.get("author")) and c["author"].get("login", "").lower() != me.lower():
            fresh.append({"who": c["author"]["login"], "at": c.get("createdAt"), "text": line(c.get("body")), "k": "fil"})
    review = REVIEW.get(p.get("reviewDecision") or "", "")
    asks = [{"who": (r.get("author") or {}).get("login") or "?", "at": r.get("submittedAt"), "text": line(r.get("body")), "k": "changes"}
            for r in (p.get("reviews") or {}).get("nodes") or []] if review == "changes" else []
    last = max(fresh + asks, key=lambda x: x["at"] or "", default=None)
    roll = ((((p.get("commits") or {}).get("nodes") or [{}])[-1].get("commit") or {}).get("statusCheckRollup") or {}).get("state")
    return {"id": f"{repo}#{p['number']}", "repo": repo, "n": p["number"], "title": p.get("title") or "", "url": p.get("url"),
            "draft": bool(p.get("isDraft")), "review": review, "threads": len(fresh), "ci": CI.get(roll), "conflict": p.get("mergeable") == "CONFLICTING",
            "updated": p.get("updatedAt"), "last": {k: last[k] for k in ("who", "at", "text", "k")} if last else None}


def asked_row(p):
    repo = p["repository"]["nameWithOwner"]
    return {"id": f"{repo}#{p['number']}", "repo": repo, "n": p["number"], "title": p.get("title") or "", "url": p.get("url"),
            "author": (p.get("author") or {}).get("login") or "", "since": p.get("createdAt")}


def notify(mine, asked):
    """Une notification du Mac par retour ou demande de relecture nouveaux (voir l'en-tête)."""
    if not CFG.get("notify_mac") or not shutil.which("osascript"):
        return
    now = {}
    for p in mine:
        if p["last"]:
            what = "changements demandés" if p["last"]["k"] == "changes" else plural_fils(p["threads"])
            now[f"{p['id']}|{p['last']['k']}|{p['last']['at']}"] = (p["id"], f"{what} · {p['last']['who']}", p["last"]["text"] or p["title"])
    for p in asked:
        now[f"{p['id']}|asked"] = (p["id"], f"relecture demandée par {p['author']}", p["title"])
    try:
        seen, first = set(read_json(SEEN)), False
    except Exception:  # premier relevé (ou cache illisible) : tout est retenu, rien n'est envoyé
        seen, first = set(), True
    new = [] if first else [v for k, v in now.items() if k not in seen]
    try:
        os.makedirs(os.path.dirname(SEEN), exist_ok=True)
        write_json(SEEN, sorted(set(now) | (seen if warnings else set())))  # lecture en échec : on n'oublie rien
    except Exception as e:
        print("oeil : notification du Mac sautée, cache non écrit (" + str(e)[:120] + ")", file=sys.stderr)
        return
    if not new:
        return
    if len(new) == 1:
        sub, title, text = new[0][0], "Le Bureau · 👁 " + new[0][1], new[0][2]
    else:
        sub, title, text = ", ".join(v[0] for v in new[:3]) + (" …" if len(new) > 3 else ""), f"Le Bureau · 👁 {len(new)} retours t'attendent", "L'Œil les montre au RDC."
    try:
        r = subprocess.run(["osascript", "-e", "on run argv", "-e",
                            'display notification (item 1 of argv) with title (item 2 of argv) subtitle (item 3 of argv) sound name "Glass"',
                            "-e", "end run", text, title, str(sub)[:120]], capture_output=True, text=True, timeout=15)
        if r.returncode:
            raise RuntimeError((r.stderr or "osascript a échoué").strip()[:120])
    except Exception as e:
        warn("notification du Mac non envoyée (" + str(e)[:120] + ")")


def plural_fils(n):
    return f"{n} fil" if n == 1 else f"{n} fils"


d = fetch()
me = ((d.get("viewer") or {}).get("login")) or ""
nodes = lambda k: [p for p in (d.get(k) or {}).get("nodes") or [] if p and p.get("repository")]
mine = [mine_row(p, me) for p in nodes("mine")]
asked = [asked_row(p) for p in nodes("asked")]
if d:
    notify(mine, asked)
print(dumps({"generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "me": me, "mine": mine, "asked": asked, "warnings": warnings}))
