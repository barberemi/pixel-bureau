"""Services extérieurs (cron office, toutes les 10 min) : l'état des pages de statut de GitHub, Claude, Jira et Confluence.

Chaque service a une page Statuspage publique, sans clé : /api/v2/summary.json donne l'état de ses composants,
/api/v2/incidents.json ses 50 derniers incidents, résolus compris, datés par la page de statut. Réglage statuts :
liste de {n, url, components} ; components borne le relevé aux composants qui comptent pour l'équipe (pour Claude, l'API
et Claude Code, pas les connecteurs de claude.ai) ; [] = pas de relevé. Sans réglage : les quatre services de DEFAULT.
Sortie : services (état actuel) et incidents des 36 dernières heures ; la page rejoue l'état à toute heure (bandeau du
plateau TV, fil de la journée). Un service injoignable garde son nom, sans état, et laisse un avertissement (#8).
"""
import json, re, sys, urllib.request
from datetime import datetime, timedelta, timezone
from _lib import CFG, dumps

DEFAULT = [{"n": "GitHub", "url": "https://www.githubstatus.com"},
           {"n": "Claude", "url": "https://status.claude.com", "components": ["Claude API (api.anthropic.com)", "Claude Code"]},
           {"n": "Jira", "url": "https://jira-software.status.atlassian.com"},
           {"n": "Confluence", "url": "https://confluence.status.atlassian.com"}]
# état d'un composant, impact d'un incident -> état de la page (op, maint, degraded, partial, major : du moins grave au pire)
COMPONENT = {"operational": "op", "under_maintenance": "maint", "degraded_performance": "degraded", "partial_outage": "partial",
             "major_outage": "major"}
IMPACT = {"maintenance": "maint", "minor": "degraded", "major": "partial", "critical": "major"}
RANK = ["op", "maint", "degraded", "partial", "major"]
KEEP_HOURS = 36
warnings = []


def warn(msg):
    print("bureau : " + msg, file=sys.stderr)
    warnings.append(msg)


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "pixel-bureau", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.loads(r.read().decode("utf-8"), strict=False)  # des pages de statut laissent passer des sauts de ligne bruts


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "service"


def worst(states):
    return max(states, key=RANK.index) if states else "op"


def counts(names, keep):
    """Un composant ou un incident compte si le service n'est pas borné, ou s'il touche un composant gardé ; un incident
    sans composant déclaré compte (la page de statut ne dit pas ce qu'il touche)."""
    return not keep or not names or any(n in keep for n in names)


def service(conf, now):
    name, url = str(conf.get("n") or "").strip(), str(conf.get("url") or "").rstrip("/")
    keep = set(conf.get("components") or [])
    row = {"k": slug(name), "n": name, "url": url, "st": None}
    incidents = []
    try:
        summary = fetch(url + "/api/v2/summary.json")
        comps = [c for c in summary.get("components") or [] if not c.get("group") and counts([c.get("name")], keep)]
        row["st"] = worst([COMPONENT.get(c.get("status"), "op") for c in comps])
    except Exception as e:  # noqa: BLE001 (réseau, JSON, page déplacée : le service reste affiché, sans état)
        warn(f"statuts : {name} injoignable ({type(e).__name__})")
        return row, incidents
    try:
        listed = fetch(url + "/api/v2/incidents.json").get("incidents") or []
    except Exception as e:  # noqa: BLE001
        warn(f"statuts : incidents de {name} illisibles ({type(e).__name__})")
        listed = summary.get("incidents") or []
    since = now - timedelta(hours=KEEP_HOURS)
    for i in listed:
        impact = IMPACT.get(i.get("impact"))
        start = i.get("started_at") or i.get("created_at")
        end = i.get("resolved_at") if i.get("status") in ("resolved", "postmortem") else None
        if not impact or not start or not counts([c.get("name") for c in i.get("components") or []], keep):
            continue
        if end and datetime.fromisoformat(end.replace("Z", "+00:00")) < since:
            continue
        incidents.append({"k": row["k"], "name": str(i.get("name") or "")[:160], "impact": impact, "from": start, "to": end,
                          "link": i.get("shortlink") or url})
    # un incident ouvert pèse sur l'état même quand aucun composant gardé n'a changé (page mise à jour en retard)
    row["st"] = worst([row["st"]] + [x["impact"] for x in incidents if not x["to"]])
    return row, incidents


def main():
    now = datetime.now(timezone.utc)
    confs = CFG.get("statuts")
    confs = DEFAULT if confs is None else [c for c in confs if isinstance(c, dict) and c.get("n") and c.get("url")]
    services, incidents = [], []
    for conf in confs:
        row, inc = service(conf, now)
        services.append(row)
        incidents += inc
    incidents.sort(key=lambda x: x["from"])
    print(dumps({"generated_at": now.isoformat().replace("+00:00", "Z"), "services": services, "incidents": incidents,
                 "warnings": warnings}))


main()
