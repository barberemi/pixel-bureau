"""Instantané « live » (toutes les minutes) : runs en cours ou récents, discussions récentes, déploiements du jour.

Entrée : aucune (déploiements lus avec `gh run list`)
Sortie (stdout) : {generated_at, day, runs[], discussions[], deploys{staging{tag:run}, prod{tag:run}}}
Même format de runs et de discussions que office_snapshot.py, pour que la page les superpose.
"""
import json, re, subprocess
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
def gh_runs(workflow):
    try:
        out = subprocess.run(["gh", "run", "list", "--repo", CFG["github"]["repo"], "--workflow", workflow, "--limit", "5",
                              "--json", "status,conclusion,createdAt,updatedAt,displayTitle,url"], capture_output=True, text=True, timeout=60)
        return json.loads(out.stdout or "[]")
    except Exception:
        return []


# déploiements staging/prod : lus ici avec gh (le script tourne dans une étape CollectApiData, sans stdin)
D = {"staging": gh_runs(CFG["github"]["staging_workflow"]), "prod": gh_runs(CFG["github"]["prod_workflow"])}


def by_tag(lst):
    out = {}
    for r in sorted(lst or [], key=lambda x: x.get("createdAt") or ""):
        m = VER.search(r.get("displayTitle") or "")
        if m and (r.get("createdAt") or "") >= since:
            out[m.group(1)] = {"status": r.get("status"), "conclusion": r.get("conclusion"), "start": r.get("createdAt"),
                               "end": r.get("updatedAt") if r.get("status") == "completed" else None, "url": r.get("url")}
    return out


print(dumps({"generated_at": datetime.now(timezone.utc).isoformat(), "day": now.strftime("%Y-%m-%d"),
             "runs": runs, "discussions": discs,
             "deploys": {"staging": by_tag(D.get("staging")), "prod": by_tag(D.get("prod"))}}))
