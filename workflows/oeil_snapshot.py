"""L'Œil du RDC : tes PR ouvertes, de tous les dépôts que ton `gh` sait lire, et celles dont on te demande la relecture,
pour le cron office (étape oeil, toutes les 10 min), 0 token. Une seule requête GraphQL (deux recherches) par relevé.

Sortie (stdout) : {generated_at, me, mine: [{id, repo, n, title, url, draft, review, threads, ci, conflict, updated,
                    last: {who, at, text, k} | null}], asked: [{id, repo, n, title, url, author, since, draft, ci, conflict}], warnings}
- id = « owner/repo#n », la clé que relisent les boutons (dataset actions, actions_snapshot.py l'y ajoute) ;
- threads = fils non résolus, pas périmés (outdated), dont le dernier mot vient d'un membre ou collaborateur du dépôt, ni toi
  ni un bot : la règle de « Corriger » (comptes de confiance, AI-03) ;
- review = changes seulement si une review « changements demandés » est plus récente que ton dernier commit (GitHub la
  garde après ta correction, tant que le relecteur n'a pas relu), approved, review (relecture attendue) ou "" ;
- ci = ok, ko, run ou null (aucune vérification sur le dernier commit) ; conflict = GitHub la dit en conflit ;
- last = le dernier retour compté : commentaire d'un de ces fils ou review « changements demandés » (première ligne, 140
  caractères au plus) ;
- asked = les demandes faites à toi (user-review-requested : pas celles faites à une de tes équipes), sans les PR d'un bot
  ni celles qui portent le label skip-auto-review, comme la revue automatique.
Brouillons, PR qui dorment, PR pas prêtes : la page en décide (69-oeil.js), le relevé les garde pour la fiche.
Sans `gh` (absent, non connecté) : listes vides et warning, le run ne tombe pas (#8).
"""
import json, shutil, subprocess, sys
from datetime import datetime, timezone
from _lib import dumps

PR = ("number title url isDraft updatedAt repository{nameWithOwner} mergeable commits(last:1){nodes{commit{committedDate pushedDate statusCheckRollup{state}}}} ")
Q = ("query{viewer{login} "
     "mine:search(query:\"is:pr is:open author:@me archived:false sort:updated-desc\",type:ISSUE,first:40){nodes{...on PullRequest{" + PR +
     "reviewDecision reviewThreads(first:100){nodes{isResolved isOutdated comments(last:1){nodes{author{login __typename} authorAssociation createdAt body}}}} "
     "reviews(last:10,states:[CHANGES_REQUESTED]){nodes{author{login} submittedAt body}}}}} "
     "asked:search(query:\"is:pr is:open user-review-requested:@me archived:false sort:updated-desc\",type:ISSUE,first:30){nodes{...on PullRequest{" + PR +
     "createdAt author{login __typename} labels(first:20){nodes{name}}}}}}")
CI = {"SUCCESS": "ok", "FAILURE": "ko", "ERROR": "ko", "PENDING": "run", "EXPECTED": "run"}
REVIEW = {"APPROVED": "approved", "REVIEW_REQUIRED": "review"}
TRUSTED = {"MEMBER", "OWNER", "COLLABORATOR"}
SKIP = "skip-auto-review"
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


def head(p):
    """Le dernier commit : (date de son push, sinon de son commit ; état de sa CI)."""
    c = (((p.get("commits") or {}).get("nodes") or [{}])[-1] or {}).get("commit") or {}
    return c.get("pushedDate") or c.get("committedDate") or "", CI.get((c.get("statusCheckRollup") or {}).get("state"))


def base(p):
    repo = p["repository"]["nameWithOwner"]
    at, ci = head(p)
    return {"id": f"{repo}#{p['number']}", "repo": repo, "n": p["number"], "title": p.get("title") or "", "url": p.get("url"),
            "draft": bool(p.get("isDraft")), "ci": ci, "conflict": p.get("mergeable") == "CONFLICTING"}, at


def mine_row(p, me):
    row, pushed = base(p)
    fresh = []  # derniers commentaires des fils comptés (voir l'en-tête)
    for t in (p.get("reviewThreads") or {}).get("nodes") or []:
        c = ((t.get("comments") or {}).get("nodes") or [None])[-1]
        if t.get("isResolved") or t.get("isOutdated") or not c or bot(c.get("author")) or c.get("authorAssociation") not in TRUSTED \
                or c["author"].get("login", "").lower() == me.lower():
            continue
        fresh.append({"who": c["author"]["login"], "at": c.get("createdAt"), "text": line(c.get("body")), "k": "fil"})
    asks = [{"who": (r.get("author") or {}).get("login") or "?", "at": r.get("submittedAt"), "text": line(r.get("body")), "k": "changes"}
            for r in (p.get("reviews") or {}).get("nodes") or []
            if p.get("reviewDecision") == "CHANGES_REQUESTED" and (r.get("submittedAt") or "") > pushed]
    last = max(fresh + asks, key=lambda x: x["at"] or "", default=None)
    return {**row, "review": "changes" if asks else REVIEW.get(p.get("reviewDecision") or "", ""), "threads": len(fresh),
            "updated": p.get("updatedAt"), "last": last}


def asked_row(p):
    row, _ = base(p)
    return {**row, "author": (p.get("author") or {}).get("login") or "", "since": p.get("createdAt")}


d = fetch()
me = ((d.get("viewer") or {}).get("login")) or ""
nodes = lambda k: [p for p in (d.get(k) or {}).get("nodes") or [] if p and p.get("repository")]  # noqa: E731
mine = [mine_row(p, me) for p in nodes("mine")]
asked = [asked_row(p) for p in nodes("asked") if not bot(p.get("author"))
         and SKIP not in [x.get("name") for x in (p.get("labels") or {}).get("nodes") or []]]
print(dumps({"generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "me": me, "mine": mine, "asked": asked, "warnings": warnings}))
