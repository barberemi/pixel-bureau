"""Instantané « live » (toutes les minutes) : runs en cours ou récents, discussions récentes, déploiements du jour.

Entrée : aucune (déploiements lus chaque minute avec `gh api` et un ETag : GitHub répond 304 sans le décompter tant que rien ne change)
Sortie (stdout) : {generated_at, day, runs[], discussions[], deploys{staging{clé:run}, prod{clé:run}}, envs{…}, warnings[texte]}
Clé = la version pour le dépôt principal (github.repo, ses MEP ont ticket et release dans le dataset team), « projet version »
pour les autres dépôts suivis (github.deploys : [{repo, label?, staging_workflow?, prod_workflow}]) ; run.project = ce projet,
run.by = le login GitHub de qui a lancé le déploiement (la page en fait l'auteur de la MEP s'il n'en a pas d'autre).
envs : avec le modèle deploy (models.deploy), ce qui occupe chaque env hors prod du réglage deploy, « dépôt|env » ->
{ref, tag, by, status, conclusion, start, end, url} du dernier run de son workflow dont le titre nomme l'env (mot
entier) ; ref = la branche déployée, ou la version (tag vrai) quand le titre en porte une et pas la branche.
Même format de runs et de discussions que office_snapshot.py, pour que la page les superpose.
warnings (#8) : déploiements non relus (gh absent, accès refusé…), republiés depuis la lecture précédente ; écrit aussi
sur stderr (run Kronn). Un 304 (rien n'a changé) n'en est pas un.
"""
import json, os as _os, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from _lib import CFG, TZ, ACTIVE, dumps, get, is_bureau, is_bureau_disc, run_row, disc_row, read_json

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
DEPLOY_CACHE = _os.path.join(_os.path.expanduser("~"), ".cache", "pixel-bureau", "deploys.json")
FAILED = []  # (dépôt, workflow, raison) des lectures en échec, remplie par les lectures parallèles


def targets():
    """[(projet, dépôt, environnement, workflow)] à suivre : le dépôt principal (projet vide), puis github.deploys."""
    g = CFG.get("github") or {}
    repos = ([("", g["repo"], g.get("staging_workflow"), g.get("prod_workflow"))] if g.get("repo") else []) + [
        (d.get("label") or d["repo"].split("/")[-1].replace("front_", ""), d["repo"], d.get("staging_workflow"), d.get("prod_workflow"))
        for d in g.get("deploys") or [] if d.get("repo") and d["repo"] != g.get("repo")]
    out = [(label, repo, env, wf) for label, repo, st, pr in repos for env, wf in (("staging", st), ("prod", pr)) if wf]
    # déployer la branche d'une PR (modèle deploy) : le workflow hors prod de chaque dépôt réglé, s'il n'est pas déjà lu
    seen = {(r, w) for _, r, _, w in out}
    out += [("", r, "nonprod", w) for r, w in DEPLOY.items() if (r, w) not in seen]
    return out


def deploy_targets():
    """{dépôt: workflow} du réglage deploy (workflow, sinon le staging_workflow du dépôt) ; {} sans le modèle deploy."""
    if not (CFG.get("models") or {}).get("deploy"):
        return {}
    g = CFG.get("github") or {}
    staging = {d["repo"]: d.get("staging_workflow") for d in [g] + list(g.get("deploys") or []) if d.get("repo")}
    return {r: t.get("workflow") or staging.get(r) for r, t in ((CFG.get("deploy") or {}).get("repos") or {}).items()
            if isinstance(t, dict) and isinstance(t.get("envs"), dict) and (t.get("workflow") or staging.get(r))}


def gh_runs(repo, workflow, prev):
    """{runs, etag} : les 10 derniers runs du workflow (champs de « gh run list »). prev = la lecture précédente,
    rendue telle quelle si GitHub répond 304 (rien n'a changé) ou si la lecture échoue."""
    prev = prev if isinstance(prev, dict) else {"runs": [], "etag": None}
    cmd = ["gh", "api", "-i", f"repos/{repo}/actions/workflows/{workflow}/runs?per_page=10"]
    if prev.get("etag") and all("branch" in r for r in prev.get("runs") or []):  # cache d'avant « branch » : relu en entier
        cmd[3:3] = ["-H", f"If-None-Match: {prev['etag']}"]
    try:  # gh sort en erreur sur un 304 : seule la ligne d'état compte
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        out = res.stdout.replace("\r\n", "\n")
        head, _, body = out.partition("\n\n")
        status = head.split("\n", 1)[0]
        if " 304" in status or "HTTP 304" in (res.stderr or ""):  # rien n'a changé : la lecture précédente reste
            return prev
        if " 200" not in status:  # erreur (pas d'accès, workflow inconnu…) : la lecture précédente reste, signalée
            FAILED.append((repo, workflow, status.strip()[:80] or (res.stderr or "").strip()[-120:] or f"gh : code {res.returncode}"))
            return prev
        etag = next((h.split(":", 1)[1].strip() for h in head.split("\n") if h.lower().startswith("etag:")), None)
        runs = [{"status": r.get("status"), "conclusion": r.get("conclusion"), "createdAt": r.get("created_at"),
                 "updatedAt": r.get("updated_at"), "displayTitle": r.get("display_title"), "url": r.get("html_url"),
                 "by": (r.get("triggering_actor") or r.get("actor") or {}).get("login"), "branch": r.get("head_branch")}
                for r in json.loads(body).get("workflow_runs") or []]
        return {"runs": runs, "etag": etag}
    except FileNotFoundError:
        FAILED.append((repo, workflow, "gh introuvable sur la machine"))
        return prev
    except Exception as e:
        FAILED.append((repo, workflow, str(e)[:120] or type(e).__name__))
        return prev


try:
    cache = read_json(DEPLOY_CACHE)
except (OSError, ValueError):
    cache = {}
DEPLOY = deploy_targets()
TARGETS = targets()
READS = sorted({(t[1], t[3]) for t in TARGETS})  # un workflow lu une fois, même suivi deux fois
with ThreadPoolExecutor(max_workers=8) as pool:  # un dépôt lent ne retarde pas les autres
    reads = list(pool.map(lambda t: gh_runs(t[0], t[1], cache.get(t[0] + "|" + t[1])), READS))
D = {t[0] + "|" + t[1]: r for t, r in zip(READS, reads)}
warnings = []
if FAILED:  # une ligne pour toutes les lectures en échec (gh absent : chaque workflow suivi échoue pareil)
    repo, workflow, why = FAILED[0]
    warnings.append(f"déploiements non relus ({len(FAILED)} workflow{'s' if len(FAILED) > 1 else ''}) : {repo} {workflow} : {why}"[:240])
    for repo, workflow, why in FAILED:
        print(f"live : déploiements de {repo} ({workflow}) non relus : {why}", file=sys.stderr)
try:  # cache seulement : un échec coûte une lecture complète au passage suivant, rien de faux n'est publié
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


def occupants():
    """Ce qui occupe chaque env hors prod du réglage deploy : « dépôt|env » -> le dernier run qui le nomme."""
    out = {}
    for repo, wf in DEPLOY.items():
        runs = sorted(D[repo + "|" + wf]["runs"], key=lambda x: x.get("createdAt") or "", reverse=True)
        for env in ((CFG.get("deploy") or {}).get("repos") or {})[repo]["envs"]:
            r = next((x for x in runs if re.search(r"(?<![\w-])" + re.escape(env) + r"(?![\w-])",  # hors du nom de la branche
                                                   (x.get("displayTitle") or "").replace(x.get("branch") or "\0", " "), re.I)), None)
            if not r:
                continue
            title, branch, m = r.get("displayTitle") or "", r.get("branch") or "", VER.search(r.get("displayTitle") or "")
            tag = bool(m) and not (branch and branch in title)
            out[repo + "|" + env] = {"ref": m.group(1) if tag else branch or None, "tag": tag, "by": r.get("by"),
                                     "status": r.get("status"), "conclusion": r.get("conclusion"), "start": r.get("createdAt"),
                                     "end": r.get("updatedAt") if r.get("status") == "completed" else None, "url": r.get("url")}
    return out


print(dumps({"generated_at": datetime.now(timezone.utc).isoformat(), "day": now.strftime("%Y-%m-%d"),
             "runs": runs, "discussions": discs,
             "deploys": {"staging": by_tag("staging"), "prod": by_tag("prod")}, "envs": occupants(), "warnings": warnings}))
