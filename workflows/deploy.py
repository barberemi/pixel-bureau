"""Déployer la branche d'une PR sur un environnement hors prod (DEV, STG…), jamais la prod : bouton « 🚀 » des fiches.

  python3 -c <ce script> <dépôt owner/nom> <n° de PR> <env>

Réglage d'équipe deploy (settings.json du pack, ou la config) :
  {"repos": {"owner/depot": {"workflow": "CD_Deploy-NONPROD.yaml",
                             "envs": {"dev": {"envchoice": "dev", "versiontags": "", "validation": "oui"}, "stg": {…}}}}}
workflow : facultatif, sinon le staging_workflow du dépôt (github ou github.deploys). envs : les inputs envoyés tels quels
au workflow_dispatch ; la version laissée vide fait construire la branche (gh workflow run --ref <branche de la PR>).
Garde-fous : dépôt et env du réglage seulement ; jamais un workflow de prod (prod_workflow de la config, ou « prod » dans
son nom hors « nonprod ») ; PR ouverte et pas d'une fork. Le suivi du run est celui du cron live (deploy.envs).
Codes de sortie (signaux exit_N de Kronn) : 2 dépôt ou env hors réglage, 3 PR introuvable, fermée ou d'une fork,
4 workflow de prod refusé, 5 déploiement refusé par GitHub.
"""
import json, re, subprocess, sys
from _lib import CFG


def fail(code, msg):
    print(msg)
    sys.exit(code)


def targets(cfg):
    """{dépôt: {workflow, envs}} : les dépôts du réglage deploy qui ont un workflow et au moins un env."""
    g = cfg.get("github") or {}
    staging = {d["repo"]: d.get("staging_workflow") for d in [g] + list(g.get("deploys") or []) if d.get("repo")}
    out = {}
    for repo, t in ((cfg.get("deploy") or {}).get("repos") or {}).items():
        t = t if isinstance(t, dict) else {}
        wf, envs = t.get("workflow") or staging.get(repo), t.get("envs")
        if wf and isinstance(envs, dict) and envs:
            out[repo] = {"workflow": wf, "envs": envs}
    return out


def is_prod(cfg, workflow):
    """Vrai pour un workflow de prod : un prod_workflow de la config, ou « prod » dans son nom hors « nonprod »."""
    g = cfg.get("github") or {}
    prods = {d.get("prod_workflow") for d in [g] + list(g.get("deploys") or [])} - {None}
    return workflow in prods or bool(re.search(r"(?<!non)(?<!non-)(?<!non_)prod", workflow.lower()))


def gh(*args):
    return subprocess.run(["gh", *args], capture_output=True, text=True)


def main(repo, n, env):
    t = targets(CFG).get(repo)
    if not t or env not in t["envs"]:
        fail(2, f"{repo} {env} : hors du réglage deploy, rien n'est lancé.")
    wf = t["workflow"]
    if is_prod(CFG, wf):
        fail(4, f"{wf} est un workflow de prod : refusé, ce bouton ne déploie jamais la prod.")
    r = gh("pr", "view", n, "-R", repo, "--json", "state,headRefName,isCrossRepository")
    try:
        pr = json.loads(r.stdout)
    except ValueError:
        pr = None
    if r.returncode or not pr:
        fail(3, f"PR #{n} introuvable sur {repo}.")
    if pr.get("state") != "OPEN" or pr.get("isCrossRepository"):
        why = "fermée" if pr.get("state") != "OPEN" else "branche d'une fork"
        fail(3, f"PR #{n} de {repo} : {why}, rien n'est lancé.")
    branch = pr["headRefName"]
    args = [a for k, v in t["envs"][env].items() for a in ("-f", f"{k}={v}")]
    r = gh("workflow", "run", wf, "-R", repo, "--ref", branch, *args)
    if r.returncode:
        fail(5, f"GitHub refuse le déploiement de {branch} sur {env} : {(r.stderr or r.stdout).strip()[:300]}")
    print(f"{branch} part sur {env.upper()} ({repo}, {wf}). Le Bureau suit le run sur la fiche de la PR.")


if __name__ == "__main__":
    a = (sys.argv[1:] + ["", "", ""])[:3]
    main(a[0].strip(), a[1].strip(), a[2].strip())
