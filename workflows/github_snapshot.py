"""GitHub pour le cron équipe du Bureau : PR ouvertes et mergées, releases, déploiements staging et prod.

Ne fait jamais échouer le run : sans `gh` (absent, non connecté, sans accès au dépôt), chaque liste est vide et
l'erreur est notée dans `errors`. Les tickets Jira sont publiés quand même par l'étape suivante (shape).
Sortie (stdout) : {"open": [...], "merged": [...], "releases": [...], "staging": [...], "prod": [...], "errors": [...]}
"""
import json, subprocess
# config d'installation : injectée par tools/publish.py (étape Kronn « python3 -c ») ; en local, lue dans bureau.config.json
import os as _os
_CFG = r"""__BUREAU_CONFIG__"""
CFG = json.loads(_CFG) if not _CFG.startswith("__") else json.load(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), _os.pardir, "bureau.config.json")))

REPO = CFG["github"]["repo"]
STAGING_WF = CFG["github"]["staging_workflow"]
PROD_WF = CFG["github"]["prod_workflow"]
CALLS = {
    "open": ["pr", "list", "--repo", REPO, "--state", "open", "--limit", "100", "--json",
             "number,title,author,isDraft,reviewDecision,url,updatedAt,createdAt,latestReviews"],
    "merged": ["pr", "list", "--repo", REPO, "--state", "merged", "--limit", "40", "--json", "number,title,author,mergedAt,url"],
    "releases": ["release", "list", "--repo", REPO, "--limit", "15", "--json", "tagName,name,publishedAt"],
    "staging": ["run", "list", "--repo", REPO, "--workflow", STAGING_WF, "--limit", "15", "--json",
                "status,conclusion,createdAt,updatedAt,displayTitle,url"],
    "prod": ["run", "list", "--repo", REPO, "--workflow", PROD_WF, "--limit", "15", "--json",
             "status,conclusion,createdAt,updatedAt,displayTitle,url"],
}

out, errors = {}, []
for key, args in CALLS.items():
    try:
        r = subprocess.run(["gh", *args], capture_output=True, text=True, timeout=40)
        if r.returncode != 0:
            raise RuntimeError((r.stderr or r.stdout).strip().splitlines()[-1][:200] if (r.stderr or r.stdout).strip() else f"code {r.returncode}")
        out[key] = json.loads(r.stdout or "[]")
    except FileNotFoundError:
        out[key] = []
        errors.append(f"{key} : gh introuvable sur la machine")
    except (RuntimeError, subprocess.TimeoutExpired, ValueError) as e:
        out[key] = []
        errors.append(f"{key} : {e}"[:240])
# Kronn coupe la sortie d'une étape Exec à 100 Ko (exec_step.rs) : on ne garde que ce que lit team_shape.py
for pr in out.get("open") or []:
    a = pr.get("author") or {}
    pr["author"] = {"login": a.get("login"), "name": a.get("name"), "is_bot": a.get("is_bot")}
    pr["latestReviews"] = [{"author": {"login": (r.get("author") or {}).get("login")}, "state": r.get("state"),
                            "submittedAt": r.get("submittedAt")} for r in pr.get("latestReviews") or []]
for pr in out.get("merged") or []:
    a = pr.get("author") or {}
    pr["author"] = {"login": a.get("login"), "name": a.get("name")}
out["errors"] = errors
LIMIT = 95 * 1024
text = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
while len(text.encode()) > LIMIT and any(len(out[k]) > 5 for k in CALLS):  # sécurité : on raccourcit les listes
    for k in CALLS:
        out[k] = out[k][:max(5, len(out[k]) * 3 // 4)]
    text = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
print(text)
