"""GitHub pour le cron équipe du Bureau : PR ouvertes et mergées, releases, déploiements staging et prod.

Ne fait jamais échouer le run : sans `gh` (absent, non connecté, sans accès au dépôt), chaque liste est vide et
l'erreur est notée dans `errors`. Sans dépôt ou sans workflow de déploiement configuré, la liste est vide sans erreur. Les tickets Jira sont publiés quand même par l'étape suivante (shape).
PR de plusieurs dépôts (#56) : `github.pr_repos` (liste « owner/repo »), par défaut le dépôt principal puis ceux de
`github.deploys`. Chaque PR porte son `repo` (owner/repo) : `front_api#16` et `front_web#16` ne se confondent jamais.
Un autre dépôt illisible ne coupe pas le reste : ses PR manquent et c'est noté dans `warnings` (panneau Fraîcheur, #8).
Releases et déploiements restent ceux du dépôt principal (ses MEP portent ticket et release).
État de fusion de chaque PR ouverte (#74) : `merge` = DIRTY si GitHub la dit en conflit (mergeable, requête des fils), `base`, et `behind` =
commits de la base absents de la PR (comparaison GitHub), gardé dans ~/.cache/pixel-bureau/behind.json tant que ni la
PR ni sa base ne bougent : une requête par PR seulement quand l'une des deux change. `threads` (#75) = fils de review non
résolus de la PR (une requête GraphQL par dépôt), ce que « Corriger » traiterait ; la même requête donne `ci` (état des
vérifications du dernier commit : ok, ko, run, ou None sans vérification) et les labels.
Env de branche : sur une PR qui porte le label d'env (`env.label`, défaut env-branch) d'un dépôt de `env.repos`, `env_url`
= la dernière adresse de ses commentaires qui répond à `env.url` (expression régulière, réglage d'équipe ; sans elle, rien)
et `env_at` = l'heure du commentaire. Le filtre jq ne sort que l'adresse : le reste du commentaire (des mots de passe,
souvent) ne quitte jamais gh.
PR ouvertes reprises : quand GitHub ne répond pas à temps, celles du dernier relevé réussi du dépôt (3 h au plus,
~/.cache/pixel-bureau/open_prs.json), avec un avertissement, plutôt qu'une liste vide.
Sortie (stdout) : {"open": [...], "merged": [...], "releases": [...], "staging": [...], "prod": [...], "errors": [...], "warnings": [...]}
"""
import json, os, subprocess, sys
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
from _lib import CFG, TZ, dumps, read_json, write_json

GH = CFG.get("github") or {}
REPO, STAGING_WF, PROD_WF = GH.get("repo"), GH.get("staging_workflow"), GH.get("prod_workflow")


def pr_repos():
    """Dépôts dont lire les PR : github.pr_repos, sinon le principal et ceux de github.deploys ; principal d'abord, sans doublon, 12 au plus."""
    raw = GH.get("pr_repos")
    if not isinstance(raw, list):
        raw = [REPO] + [d.get("repo") for d in GH.get("deploys") or [] if isinstance(d, dict)]
    out = []
    for r in raw:
        if isinstance(r, str) and r.count("/") == 1 and r.lower() not in (x.lower() for x in out):
            out.append(r)
    out.sort(key=lambda r: r.lower() != (REPO or "").lower())  # le principal d'abord : la coupe des 100 Ko le garde
    return out[:12]


REPOS = pr_repos()
# limites par dépôt : le principal garde ses 100 PR ouvertes et 40 mergées, les autres moins (sortie sous 100 Ko)
# l'état de fusion n'est pas demandé ici : GitHub le calcule pour chaque PR et la liste de 100 finit en 504 ; il vient de
# la requête GraphQL des fils (mergeable), dont l'échec ne coûte que les pastilles
OPEN_FIELDS = ("number,title,headRefName,author,isDraft,reviewDecision,url,updatedAt,createdAt,latestReviews,reviewRequests,"
               "baseRefName,headRefOid")
CALLS = {}
KEPT = []  # avertissements des PR reprises du relevé précédent
for repo in REPOS:
    main = repo.lower() == (REPO or "").lower()
    CALLS[("open", repo)] = ["pr", "list", "--repo", repo, "--state", "open", "--limit", "100" if main else "25", "--json", OPEN_FIELDS]
    CALLS[("merged", repo)] = ["pr", "list", "--repo", repo, "--state", "merged", "--limit", "40" if main else "10",
                               "--json", "number,title,author,mergedAt,url"]
CALLS[("releases", REPO)] = ["release", "list", "--repo", REPO, "--limit", "15", "--json", "tagName,name,publishedAt"]
CALLS[("staging", REPO)] = ["run", "list", "--repo", REPO, "--workflow", STAGING_WF, "--limit", "15", "--json",
                            "status,conclusion,createdAt,updatedAt,displayTitle,url"]
CALLS[("prod", REPO)] = ["run", "list", "--repo", REPO, "--workflow", PROD_WF, "--limit", "15", "--json",
                         "status,conclusion,createdAt,updatedAt,displayTitle,url"]
KEYS = ("open", "merged", "releases", "staging", "prod")


def call(args, timeout=30):
    """(liste, erreur) d'un appel gh borné à timeout secondes ; l'erreur est None si tout va bien."""
    try:
        r = subprocess.run(["gh", *args], capture_output=True, text=True, timeout=timeout)
        if r.returncode != 0:
            msg = (r.stderr or r.stdout).strip()
            return [], msg.splitlines()[-1][:200] if msg else f"code {r.returncode}"
        return json.loads(r.stdout or "[]"), None
    except FileNotFoundError:
        return [], "gh introuvable sur la machine"
    except (subprocess.TimeoutExpired, ValueError) as e:
        return [], str(e)


todo = {k: a for k, a in CALLS.items()
        if REPO and k[1] and not (k[0] == "staging" and not STAGING_WF or k[0] == "prod" and not PROD_WF)}
with ThreadPoolExecutor(max_workers=8) as pool:  # en parallèle : 12 dépôts tiennent dans le délai de l'étape (120 s)
    # 60 s pour les PR ouvertes du principal : la liste la plus lourde, qui dépasse 30 s certains soirs
    res = dict(zip(todo, pool.map(lambda k: call(todo[k], 60 if k == ("open", REPO) else 30), todo)))

# PR ouvertes du dernier relevé réussi, par dépôt : GitHub qui tarde au-delà du délai (vu le soir sur les 100 PR du
# principal) ne vide plus la liste, la page garderait sinon ses fiches sans aucune PR ni bouton. Au plus 3 h.
OPEN_CACHE = os.path.expanduser("~/.cache/pixel-bureau/open_prs.json")
OPEN_MAX_AGE = 3 * 3600
try:
    open_cache = read_json(OPEN_CACHE)
except (OSError, ValueError):
    open_cache = {}
now = datetime.now(timezone.utc)
for (key, repo), (rows, err) in list(res.items()):
    c = open_cache.get(repo) or {}
    if key == "open" and err and isinstance(c.get("rows"), list) and c.get("at"):
        at = datetime.fromisoformat(c["at"])
        if (now - at).total_seconds() <= OPEN_MAX_AGE:
            res[(key, repo)] = (c["rows"], None)
            print(f"github : PR ouvertes de {repo} reprises du relevé de {at.astimezone(TZ):%H:%M} ({err})", file=sys.stderr)
            KEPT.append(f"PR ouvertes de {repo} : GitHub n'a pas répondu, relevé de {at.astimezone(TZ):%H:%M} repris"[:240])
    elif key == "open" and not err and isinstance(rows, list):
        open_cache[repo] = {"at": now.isoformat(), "rows": [dict(pr) for pr in rows]}
try:
    os.makedirs(os.path.dirname(OPEN_CACHE), exist_ok=True)
    write_json(OPEN_CACHE, open_cache)
except OSError:
    pass  # cache seulement : sans lui, un délai dépassé redevient une liste vide

out, errors, warnings = {k: [] for k in KEYS}, [], list(KEPT)
for (key, repo), (rows, err) in res.items():
    main = repo.lower() == (REPO or "").lower()
    if err:  # dépôt principal : une erreur GitHub (source absente) ; autre dépôt : un avertissement, le reste est lu
        if main:
            errors.append(f"{key} : {err}"[:240])
        else:
            warnings.append(f"PR {key} de {repo} illisibles : {err}"[:240])
        continue
    if key in ("open", "merged"):
        for pr in rows if isinstance(rows, list) else []:
            pr["repo"] = repo
    out[key] += rows if isinstance(rows, list) else []
BEHIND_CACHE = os.path.expanduser("~/.cache/pixel-bureau/behind.json")


def api_text(path, args=None):
    """Une valeur de l'API GitHub (gh api <chemin> --jq <filtre>, ou les arguments args), None en cas d'échec : un plus
    (retard, fils non résolus), jamais bloquant."""
    try:
        r = subprocess.run(["gh", *(args or ["api", path[0], "--jq", path[1]])], capture_output=True, text=True, timeout=20)
        return r.stdout.strip() if r.returncode == 0 and r.stdout.strip() else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def behind_counts(prs):
    """Retard de chaque PR ouverte sur sa base ({repo#n: commits}) : la tête de chaque base (une requête par base), puis
    une comparaison par PR dont la tête ou la base a bougé depuis le passage précédent (cache)."""
    try:
        cache = read_json(BEHIND_CACHE)
    except (OSError, ValueError):
        cache = {}
    bases = sorted({(pr["repo"], pr["baseRefName"]) for pr in prs if pr.get("baseRefName")})
    with ThreadPoolExecutor(max_workers=8) as pool:
        tips = dict(zip(bases, pool.map(api_text, [(f"repos/{r}/commits/{b}", ".sha") for r, b in bases])))
    todo, res = {}, {}
    for pr in prs:
        key, tip = f"{pr['repo']}#{pr['number']}", tips.get((pr["repo"], pr.get("baseRefName")))
        if not tip or not pr.get("headRefOid"):
            continue
        c = cache.get(key) or {}
        if c.get("head") == pr["headRefOid"] and c.get("base") == tip:
            res[key] = c["behind"]
        else:
            todo[key] = (tip, pr["headRefOid"], pr["repo"])
    with ThreadPoolExecutor(max_workers=8) as pool:
        got = dict(zip(todo, pool.map(api_text, [(f"repos/{r}/compare/{t}...{h}", ".behind_by") for t, h, r in todo.values()])))
    for key, v in got.items():
        if v and v.isdigit():
            res[key] = int(v)
            cache[key] = {"head": todo[key][1], "base": todo[key][0], "behind": int(v)}
    keep = {f"{pr['repo']}#{pr['number']}" for pr in prs}
    try:
        os.makedirs(os.path.dirname(BEHIND_CACHE), exist_ok=True)
        write_json(BEHIND_CACHE, {k: v for k, v in cache.items() if k in keep})
    except OSError:
        pass  # cache seulement : refait au passage suivant
    return res


THREADS_Q = ("query($o:String!,$r:String!){repository(owner:$o,name:$r){pullRequests(states:OPEN,first:100,"
             "orderBy:{field:UPDATED_AT,direction:DESC}){nodes{number mergeable reviewThreads(first:100){nodes{isResolved}} "
             "labels(first:20){nodes{name}} commits(last:1){nodes{commit{statusCheckRollup{state}}}}}}}}")
CI = {"SUCCESS": "ok", "FAILURE": "ko", "ERROR": "ko", "PENDING": "run", "EXPECTED": "run"}


def thread_counts(repo):
    """Fils de review non résolus, état de fusion, CI et labels de chaque PR ouverte du dépôt ({n: (fils, mergeable, ci,
    labels)}), une requête GraphQL ; {} en cas d'échec (pas de pastilles, les PR restent)."""
    owner, name = repo.split("/", 1)
    raw = api_text(None, ["api", "graphql", "-f", "query=" + THREADS_Q, "-F", "o=" + owner, "-F", "r=" + name, "--jq",
                          "[.data.repository.pullRequests.nodes[]|[.number,([.reviewThreads.nodes[]|select(.isResolved|not)]|length),.mergeable,"
                          "(.commits.nodes[0].commit.statusCheckRollup.state // null),[.labels.nodes[].name]]]"])
    try:
        return {int(row[0]): (row[1], row[2] if len(row) > 2 else None, CI.get(row[3]) if len(row) > 3 else None,
                              row[4] if len(row) > 4 else []) for row in json.loads(raw or "[]")}
    except (ValueError, TypeError, IndexError):
        return {}


ENV = CFG.get("env") or {}
ENV_LABEL = ENV.get("label") or "env-branch"
ENV_REPOS = {r.lower() for r in (((CFG.get("launch") or {}).get("env") or {}).get("repos") if isinstance((CFG.get("launch") or {}).get("env"), dict) else None)
             or ENV.get("repos") or [REPO] if r}


def env_url(pr):
    """(adresse, heure) de l'env de branche d'une PR, lue dans ses commentaires (env.url), sinon (None, None)."""
    pat = ENV.get("url")
    if not pat or pr["repo"].lower() not in ENV_REPOS or ENV_LABEL not in (pr.get("labels") or []):
        return None, None
    jq = f'[.[]|select(.body|test({json.dumps(pat)}))|[.created_at,(.body|capture({json.dumps("(?<u>" + pat + ")")}).u)]]|last'
    raw = api_text((f"repos/{pr['repo']}/issues/{pr['number']}/comments?per_page=100", jq))
    try:
        at, url = json.loads(raw or "null") or (None, None)
        return (url, at) if isinstance(url, str) and url.startswith("https://") else (None, None)
    except (ValueError, TypeError):
        return None, None


BEHIND = behind_counts(out["open"])
with ThreadPoolExecutor(max_workers=8) as pool:
    _repos = sorted({pr["repo"] for pr in out["open"]})
    THREADS = dict(zip(_repos, pool.map(thread_counts, _repos)))
for pr in out["open"]:
    t = THREADS.get(pr["repo"], {}).get(pr["number"]) or (None, None, None, [])
    pr["merge"] = "DIRTY" if t[1] == "CONFLICTING" else None
    pr["labels"] = t[3]
    if t[2]:  # seulement s'il est connu : la sortie reste sous 100 Ko
        pr["ci"] = t[2]
    pr["base"] = pr.pop("baseRefName", None)
    pr.pop("headRefOid", None)
    pr["behind"] = BEHIND.get(f"{pr['repo']}#{pr['number']}")
    pr["threads"] = t[0]
with ThreadPoolExecutor(max_workers=8) as pool:  # un appel par PR qui porte le label d'env, seulement
    for pr, (url, at) in zip(out["open"], pool.map(env_url, out["open"])):
        if url:
            pr["env_url"], pr["env_at"] = url, at
        pr.pop("labels", None)
for w in warnings:
    print("github : " + w, file=sys.stderr)
# Kronn coupe la sortie d'une étape Exec à 100 Ko (exec_step.rs) : on ne garde que ce que lit team_shape.py
for pr in out["open"]:
    a = pr.get("author") or {}
    pr["author"] = {"login": a.get("login"), "name": a.get("name"), "is_bot": a.get("is_bot")}
    pr["latestReviews"] = [{"author": {"login": (r.get("author") or {}).get("login")}, "state": r.get("state"),
                            "submittedAt": r.get("submittedAt")} for r in pr.get("latestReviews") or []]
    # relecteurs demandés (personnes seulement : une équipe GitHub n'a pas de login)
    pr["reviewRequests"] = [r["login"] for r in pr.get("reviewRequests") or [] if r.get("login")]
for pr in out["merged"]:
    a = pr.get("author") or {}
    pr["author"] = {"login": a.get("login"), "name": a.get("name")}
out["errors"], out["warnings"] = errors, warnings
LIMIT = 95 * 1024


def shorten(with_main):
    """Raccourcit d'un quart les PR de chaque autre dépôt (2 gardées au moins), et du principal avec with_main (5 au
    moins) : chaque dépôt garde ses PR les plus récentes. False si rien n'a bougé."""
    moved = False
    for k in ("open", "merged"):
        total, seen, keep = {}, {}, []
        for pr in out[k]:
            total[pr["repo"]] = total.get(pr["repo"], 0) + 1
        for pr in out[k]:
            main = pr["repo"].lower() == (REPO or "").lower()
            seen[pr["repo"]] = seen.get(pr["repo"], 0) + 1
            if (with_main or not main) and seen[pr["repo"]] > max(5 if main else 2, total[pr["repo"]] * 3 // 4):
                moved = True
                continue
            keep.append(pr)
        out[k] = keep
    return moved


text = dumps(out)
while len(text.encode()) > LIMIT:  # sécurité : les autres dépôts d'abord, puis le principal, puis le reste
    if not shorten(False) and not shorten(True):
        if not any(len(out[k]) > 5 for k in KEYS):
            break
        for k in KEYS:
            out[k] = out[k][:max(5, len(out[k]) * 3 // 4)]
    text = dumps(out)
print(text)
