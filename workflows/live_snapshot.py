"""Instantané « live » (toutes les minutes) : runs en cours ou récents, discussions récentes, déploiements du jour.

Entrée : aucune (déploiements lus chaque minute avec `gh api` et un ETag : GitHub répond 304 sans le décompter tant que rien ne change)
Sortie (stdout) : {generated_at, day, runs[], discussions[], deploys{staging{clé:run}, prod{clé:run}}}
Clé = la version pour le dépôt principal (github.repo, ses MEP ont ticket et release dans le dataset team), « projet version »
pour les autres dépôts suivis (github.deploys : [{repo, label?, staging_workflow?, prod_workflow}]) ; run.project = ce projet,
run.by = le login GitHub de qui a lancé le déploiement (la page en fait l'auteur de la MEP s'il n'en a pas d'autre).
Même format de runs et de discussions que office_snapshot.py, pour que la page les superpose.
"""
import json, os as _os, re, subprocess
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from _lib import CFG, TZ, ACTIVE, dumps, get, is_bureau, is_bureau_disc, run_row, disc_row

now = datetime.now(TZ)
day_start = now.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
since = day_start.isoformat().replace("+00:00", "Z")
recent = (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat().replace("+00:00", "Z")


runs = []
for wf in get("/workflows"):
    if not wf.get("enabled") or is_bureau(wf):
        continue
    lr = wf.get("last_run") or {}
    if lr.get("status") not in ACTIVE and (lr.get("started_at") or "") < recent and (lr.get("finished_at") or "") < recent:
        continue
    for r in get(f"/workflows/{wf['id']}/runs?limit=5"):
        if (r.get("started_at") or "") < since:
            continue
        if r.get("status") not in ACTIVE and (r.get("finished_at") or "") < recent:
            continue
        runs.append(run_row(wf, r))

discs = [disc_row(d) for d in get("/discussions?page=1&per_page=20")
         if d["updated_at"] >= since and not d.get("archived") and not is_bureau_disc(d)]

VER = re.compile(r"(\d+\.\d+\.\d+)")
# Déploiements staging/prod : derniers runs des workflows de déploiement GitHub Actions, relus à chaque passage. La
# requête est conditionnelle (If-None-Match) : tant que rien ne bouge, GitHub répond 304 sans la compter dans la limite
# d'appels. Les runs et leur ETag sont gardés hors du dépôt, puis republiés tels quels sur un 304 ou une erreur.
DEPLOY_CACHE = _os.path.join(_os.path.expanduser("~"), ".cache", "kronn-bureau", "deploys.json")


def targets():
    """[(projet, dépôt, environnement, workflow)] à suivre : le dépôt principal (projet vide), puis github.deploys."""
    g = CFG.get("github") or {}
    repos = ([("", g["repo"], g.get("staging_workflow"), g.get("prod_workflow"))] if g.get("repo") else []) + [
        (d.get("label") or d["repo"].split("/")[-1].replace("front_", ""), d["repo"], d.get("staging_workflow"), d.get("prod_workflow"))
        for d in g.get("deploys") or [] if d.get("repo") and d["repo"] != g.get("repo")]
    return [(label, repo, env, wf) for label, repo, st, pr in repos for env, wf in (("staging", st), ("prod", pr)) if wf]


def gh_runs(repo, workflow, prev):
    """{runs, etag} : les 5 derniers runs du workflow (champs de « gh run list »). prev = la lecture précédente,
    rendue telle quelle si GitHub répond 304 (rien n'a changé) ou si la lecture échoue."""
    prev = prev if isinstance(prev, dict) else {"runs": [], "etag": None}
    cmd = ["gh", "api", "-i", f"repos/{repo}/actions/workflows/{workflow}/runs?per_page=5"]
    if prev.get("etag") and all("by" in r for r in prev.get("runs") or []):  # cache d'avant « by » : relu en entier
        cmd[3:3] = ["-H", f"If-None-Match: {prev['etag']}"]
    try:  # gh sort en erreur sur un 304 : seule la ligne d'état compte
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=60).stdout.replace("\r\n", "\n")
        head, _, body = out.partition("\n\n")
        status = head.split("\n", 1)[0]
        if " 200" not in status:  # 304, ou erreur (gh absent, pas d'accès) : la lecture précédente reste
            return prev
        etag = next((h.split(":", 1)[1].strip() for h in head.split("\n") if h.lower().startswith("etag:")), None)
        runs = [{"status": r.get("status"), "conclusion": r.get("conclusion"), "createdAt": r.get("created_at"),
                 "updatedAt": r.get("updated_at"), "displayTitle": r.get("display_title"), "url": r.get("html_url"),
                 "by": (r.get("triggering_actor") or r.get("actor") or {}).get("login")}
                for r in json.loads(body).get("workflow_runs") or []]
        return {"runs": runs, "etag": etag}
    except Exception:
        return prev


try:
    cache = json.load(open(DEPLOY_CACHE))
except (OSError, ValueError):
    cache = {}
TARGETS = targets()
with ThreadPoolExecutor(max_workers=8) as pool:  # un dépôt lent ne retarde pas les autres
    reads = list(pool.map(lambda t: gh_runs(t[1], t[3], cache.get(t[1] + "|" + t[3])), TARGETS))
D = {t[1] + "|" + t[3]: r for t, r in zip(TARGETS, reads)}
try:
    _os.makedirs(_os.path.dirname(DEPLOY_CACHE), exist_ok=True)
    with open(DEPLOY_CACHE, "w") as fh:
        json.dump(D, fh)
except OSError:
    pass


def by_tag(env):
    """Déploiements du jour d'un environnement, par version (« projet version » hors dépôt principal)."""
    out = {}
    for label, repo, e, wf in TARGETS:
        if e != env:
            continue
        for r in sorted(D[repo + "|" + wf]["runs"], key=lambda x: x.get("createdAt") or ""):
            m = VER.search(r.get("displayTitle") or "")
            if m and (r.get("createdAt") or "") >= since:
                out[(label + " " if label else "") + m.group(1)] = {
                    "status": r.get("status"), "conclusion": r.get("conclusion"), "start": r.get("createdAt"),
                    "end": r.get("updatedAt") if r.get("status") == "completed" else None, "url": r.get("url"),
                    "project": label or None, "repo": repo, "by": r.get("by")}
    return out


print(dumps({"generated_at": datetime.now(timezone.utc).isoformat(), "day": now.strftime("%Y-%m-%d"),
             "runs": runs, "discussions": discs,
             "deploys": {"staging": by_tag("staging"), "prod": by_tag("prod")}}))
