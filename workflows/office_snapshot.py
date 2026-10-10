"""Instantané de la journée (toutes les 10 min) : runs et discussions du jour, crons, purge des vieux runs du Bureau."""
import json, os as _os, urllib.request
from datetime import datetime, timedelta, timezone
from _lib import API, CFG, TZ, ACTIVE, dumps, get, is_bureau, is_bureau_disc, run_row, disc_row, err_of


now = datetime.now(TZ)
PURGE_HOURS = (7, 13)  # heures de Paris du nettoyage des vieux runs (premier passage de l'heure)
PURGE_LOG = _os.path.join(_os.path.expanduser("~"), ".cache", "kronn-bureau", "purge.json")
day_start = now.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
since = day_start.isoformat().replace("+00:00", "Z")


WFS = get("/workflows")
runs = []
for wf in WFS:
    if not wf.get("enabled") or is_bureau(wf):
        continue
    lr = wf.get("last_run") or {}
    if (lr.get("started_at") or "") < since and lr.get("status") not in ACTIVE:
        continue
    page, off = [], 0
    while True:
        batch = get(f"/workflows/{wf['id']}/runs?limit=15&offset={off}")
        page += batch
        off += 15
        if len(batch) < 15 or min((b.get("started_at") or "") for b in batch) < since:
            break
    for r in page:
        if (r.get("started_at") or "") < since and r.get("status") not in ACTIVE:
            continue
        runs.append(run_row(wf, r))

projects = {p["id"]: p.get("name") for p in get("/projects")}
discs = [disc_row(d, projects) for d in get("/discussions?per_page=200")
         if d["updated_at"] >= since and not d.get("archived") and not is_bureau_disc(d)]


# Nettoyage : uniquement les runs des crons du Bureau, terminés depuis plus de 7 jours.
# (Kronn n'a qu'une purge globale ; on ne touche ici à aucun autre workflow.)
# Kronn ne sait pas lister « les runs de plus de 7 jours » : il faut relire tous les runs (~6 000, ~120 GET).
# On ne le fait donc qu'au premier passage de 7h et de 13h (heure de Paris), pas toutes les 10 min ;
# 13h rattrape une matinée où le Mac dormait.
BUREAU_WORKFLOWS = [w for w in (CFG.get("workflows") or {}).values() if w]
cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat().replace("+00:00", "Z")
purge = {"at": None, "deleted": 0, "errors": 0, "last_error": None}
if now.hour in PURGE_HOURS and now.minute < 10:
    purge["at"] = datetime.now(timezone.utc).isoformat()
    for wid in BUREAU_WORKFLOWS:
        try:
            old = []
            off = 0
            while True:
                batch = get(f"/workflows/{wid}/runs?limit=50&offset={off}")
                old += [r["id"] for r in batch if r.get("finished_at") and r["finished_at"] < cutoff
                        and r.get("status") in ("Success", "Failed", "Cancelled", "Partial", "Interrupted")]
                off += 50
                if len(batch) < 50:
                    break
        except Exception as e:
            purge["errors"] += 1
            purge["last_error"] = f"liste des runs de {wid[:8]} : {e}"[:200]
            continue
        for rid in old:
            try:
                urllib.request.urlopen(urllib.request.Request(f"{API}/workflows/{wid}/runs/{rid}", method="DELETE"), timeout=30)
                purge["deleted"] += 1
            except Exception as e:
                purge["errors"] += 1
                purge["last_error"] = f"suppression du run {rid[:8]} : {e}"[:200]
    try:  # bilan gardé hors du dépôt : la page l'affiche jusqu'au nettoyage suivant
        _os.makedirs(_os.path.dirname(PURGE_LOG), exist_ok=True)
        json.dump(purge, open(PURGE_LOG, "w"))
    except Exception:
        pass
else:
    try:
        purge = json.load(open(PURGE_LOG))
    except Exception:
        pass

runs.sort(key=lambda x: x["start"] or "")
crons = []
# workflows désactivés : leurs échecs passés ne sont plus à traiter (la page les montre « désactivé »)
disabled = [w["id"] for w in WFS if not w.get("enabled")]
for w in WFS:
    if w.get("enabled") and w.get("trigger_type") == "cron" and not is_bureau(w):
        tr = (get("/workflows/" + w["id"]).get("trigger") or {})
        if tr.get("schedule"):
            crons.append({"wf": w["id"], "name": w["name"], "schedule": tr["schedule"]})

# crons du Bureau dont le dernier passage a échoué (Jira refusé, script en erreur…) : la page le dit dans le panneau
# Fraîcheur au lieu d'un simple retard. Un GET de plus seulement pour un cron en échec.
health = {}
for key, wid in (CFG.get("workflows") or {}).items():
    lr = next(((w.get("last_run") or {}) for w in WFS if w["id"] == wid), {})
    if lr.get("status") != "Failed":
        continue
    last = next(iter(get(f"/workflows/{wid}/runs?limit=1")), {})
    bad = next((s for s in last.get("step_results") or [] if s.get("status") == "Failed"), None)
    health[key] = {"at": last.get("finished_at") or lr.get("finished_at"), "step": bad and bad["step_name"], "err": bad and err_of(bad)}

snap = {"generated_at": datetime.now(timezone.utc).isoformat(), "day": now.strftime("%Y-%m-%d"), "runs": runs, "discussions": discs,
        "crons": crons, "disabled": disabled, "purge": purge, "bureau_failed": health}
out = dumps(snap)
# Sous la limite de 100 Ko d'une sortie Exec, par paliers : étapes des runs réussis finis depuis plus de 3 h (sauf Gate),
# puis de tous les runs réussis, puis les plus vieux runs réussis eux-mêmes (comptés dans « truncated »).
cut = (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat()
for older in (cut, "9999"):
    for r in runs:
        if len(out.encode()) < 90000:
            break
        if r["status"] == "Success" and any(s.get("k") != "Gate" for s in r["steps"]) and (r["end"] or "") < older:
            r["steps"] = [s for s in r["steps"] if s.get("k") == "Gate"]  # la page date tes validations par leur étape Gate
            out = dumps(snap)
while len(out.encode()) >= 90000 and any(r["status"] == "Success" for r in runs):
    ok = [i for i, r in enumerate(runs) if r["status"] == "Success"][:max(1, len(runs) // 10)]
    for i in reversed(ok):
        del runs[i]
    snap["truncated"] = snap.get("truncated", 0) + len(ok)
    out = dumps(snap)
print(out)
