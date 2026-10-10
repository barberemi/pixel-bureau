"""Le canard d'équipe (KT-7) : cible du sprint, sprints tenus (canetons) et succès, pour le cron « Le Bureau · canard ».

Entrée (stdin) : {"sprint": sprint actif (sprint_info), "velocity": graphique de vélocité Jira (sprints fermés et points
terminés de chacun), "reopens": tickets réouverts pendant le sprint précédent}. Lit aussi les runs Kronn (pannes de la
semaine), les discussions du canard, et `gh` (mises en prod du sprint, reviews de la semaine).
Sortie (stdout) : {generated_at, sprint{name,start,end}, target, sprints[{id,name,done,target,held}], canetons, streak,
trophies{id: {ok, at?, period?, detail?, progress?}}, errors[]}
- Un sprint est tenu quand ses points terminés atteignent la moyenne des 4 sprints fermés avant lui ; la cible du sprint
  en cours est la moyenne des 4 derniers. Un caneton par sprint tenu parmi ceux que Jira donne (12 au plus, donc 8 jugés).
- Tout est collectif : aucun chiffre par personne. Une source muette n'arrête rien, elle est notée dans `errors`.
"""
import json, subprocess, sys
from datetime import datetime, timedelta, timezone
from _lib import CFG, TZ, dumps, get, is_bureau

_IN = sys.stdin.read()
D = (json.loads(_IN) if _IN.strip() else {}) or {}
errors = []
now = datetime.now(TZ)
TARGET_N = 4  # sprints de référence de la cible


def parse(iso):
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except ValueError:
        return None


def history(vel):
    """Sprints fermés jugés, du plus récent au plus ancien : points terminés, cible (moyenne des 4 d'avant), tenu."""
    vel = vel if isinstance(vel, dict) else {}
    stats = vel.get("velocityStatEntries") or {}
    rows = []
    for s in vel.get("sprints") or []:  # du plus récent au plus ancien
        e = stats.get(str(s.get("id"))) or {}
        rows.append({"id": s.get("id"), "name": s.get("name"), "done": float((e.get("completed") or {}).get("value") or 0)})
    out = []
    for i, r in enumerate(rows):
        ref = rows[i + 1:i + 1 + TARGET_N]
        if len(ref) < TARGET_N:
            break
        target = round(sum(x["done"] for x in ref) / TARGET_N, 1)
        out.append(dict(r, target=target, held=bool(target) and r["done"] >= target))
    target = round(sum(x["done"] for x in rows[:TARGET_N]) / TARGET_N, 1) if len(rows) >= TARGET_N else None
    return out, target


def week_bounds(t):
    """Lundi 0h et samedi 0h de la dernière semaine ouvrée finie (le week-end : celle qui vient de finir)."""
    monday = (t - timedelta(days=t.weekday() + (0 if t.weekday() >= 5 else 7))).replace(hour=0, minute=0, second=0, microsecond=0)
    return monday, monday + timedelta(days=5)


def day_label(d):
    months = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]
    return f"{d.day} {months[d.month - 1]}"


def worst_streak(statuses):
    """Plus longue suite d'échecs d'affilée (Success remet à zéro ; annulé, en cours : ignorés)."""
    best = cur = 0
    for s in statuses:
        if s == "Failed":
            cur += 1
            best = max(best, cur)
        elif s == "Success":
            cur = 0
    return best


def business_hours(a, b):
    """Heures entre a et b sans compter samedi et dimanche (heure du bureau)."""
    a, b = a.astimezone(TZ), b.astimezone(TZ)
    total, t = 0.0, a
    while t < b:
        nxt = min(b, (t + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0))
        if t.weekday() < 5:
            total += (nxt - t).total_seconds()
        t = nxt
    return total / 3600


def gh(args):
    try:
        r = subprocess.run(["gh", *args], capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise RuntimeError(f"gh introuvable ou trop lent ({e.__class__.__name__})")
    if r.returncode:
        raise RuntimeError((r.stderr or r.stdout).strip()[:200] or f"gh {args[0]} : code {r.returncode}")
    return json.loads(r.stdout or "[]")


sp = D.get("sprint") or {}
sprints, target = history(D.get("velocity"))
streak = 0
for s in sprints:
    if not s["held"]:
        break
    streak += 1
start = parse(sp.get("startDate")) or now - timedelta(days=14)
w0, w1 = week_bounds(now)
week = f"sem. du {day_label(w0)}"
# date de chaque succès (la page ne le porte qu'à partir de là, et joue sa scène à cette heure) : ceux de la semaine passée,
# le lundi suivant à l'ouverture du bureau ; ceux du sprint, à son début
OPEN_H = int(((CFG.get("rhythm") or {}).get("office_hours") or [8, 20])[0])
week_at = (w0 + timedelta(days=7)).replace(hour=OPEN_H).astimezone(timezone.utc).isoformat()
sprint_at = start.astimezone(timezone.utc).isoformat()
trophies = {}

# Zéro panne : aucun agent (workflow hors Bureau) n'a eu 3 échecs d'affilée la semaine dernière
try:
    since, until = w0.astimezone(timezone.utc).isoformat(), w1.astimezone(timezone.utc).isoformat()
    down = []
    for wf in get("/workflows"):
        if is_bureau(wf) or ((wf.get("last_run") or {}).get("started_at") or "") < since:
            continue
        runs, off = [], 0
        while True:
            batch = get(f"/workflows/{wf['id']}/runs?limit=25&offset={off}")
            runs += [r for r in batch if not r.get("parent_run_id") and since <= (r.get("started_at") or "") < until]
            off += 25
            if len(batch) < 25 or min((b.get("started_at") or "") for b in batch) < since:
                break
        runs.sort(key=lambda r: r["started_at"])
        if worst_streak([r.get("status") for r in runs]) >= 3:
            down.append(wf.get("name") or "?")
    trophies["zero_panne"] = {"ok": not down, "period": week, "at": week_at, "detail": f"{len(down)} agent(s) en panne" if down else "aucun agent en panne"}
except Exception as e:
    errors.append(f"runs Kronn : {e}")

# Pas un reopen : aucun ticket réouvert pendant le sprint précédent
if D.get("reopens") is not None and sprints:
    n = len(D.get("reopens") or [])
    trophies["pas_reopen"] = {"ok": n == 0, "period": sprints[0]["name"], "at": sprint_at, "detail": f"{n} réouverture(s)" if n else "aucune réouverture"}

# Bavard : 10 discussions avec le canard (titre « 🦆 … »), depuis toujours
try:
    ducks = sorted(str(d.get("created_at") or d.get("updated_at") or "") for d in get("/discussions?per_page=200")
                   if str(d.get("title") or "").startswith("🦆"))
    n = len(ducks)
    trophies["bavard"] = {"ok": n >= 10, "progress": f"{min(n, 10)} / 10", **({"at": ducks[9]} if n >= 10 and ducks[9] else {})}
except Exception as e:
    errors.append(f"discussions : {e}")

# Triplé : les 3 derniers sprints tenus
if sprints:
    trophies["triple"] = {"ok": streak >= 3, "progress": f"{min(streak, 3)} / 3", "at": sprint_at}

G = CFG.get("github") or {}
# Lève-tôt : une mise en prod réussie avant 11h depuis le début du sprint (tous les dépôts suivis)
prods = [(G.get("repo"), G.get("prod_workflow"))] + [(d.get("repo"), d.get("prod_workflow")) for d in G.get("deploys") or []
                                                      if d.get("repo") and d.get("repo") != G.get("repo")]
early = None
for repo, wf in prods:
    if not repo or not wf:
        continue
    try:
        for r in gh(["run", "list", "--repo", repo, "--workflow", wf, "--limit", "40", "--json", "conclusion,createdAt,updatedAt,displayTitle"]):
            end = parse(r.get("updatedAt"))
            if r.get("conclusion") == "success" and end and end >= start and end.astimezone(TZ).hour < 11:
                if not early or end < early[0]:
                    early = (end, r.get("displayTitle") or repo)
    except Exception as e:
        errors.append(f"gh {repo} : {e}")
if any(r and w for r, w in prods):
    trophies["leve_tot"] = {"ok": bool(early), "period": sp.get("name") or "", **({"at": early[0].astimezone(timezone.utc).isoformat()} if early else {}),
                            "detail": f"{early[1][:60]} à {early[0].astimezone(TZ):%H:%M}" if early else "pas encore de MEP avant 11h"}

# Relu dans la journée : chaque PR ouverte la semaine dernière a eu sa première review en moins de 24 h ouvrées
if G.get("repo"):
    try:
        prs = gh(["pr", "list", "--repo", G["repo"], "--state", "all", "--limit", "100", "--search",
                  f"created:{w0:%Y-%m-%d}..{(w1 - timedelta(days=1)):%Y-%m-%d}", "--json", "number,createdAt,author,isDraft,reviews"])
        fast = total = 0
        for p in prs:
            if p.get("isDraft") or (p.get("author") or {}).get("is_bot"):
                continue
            total += 1
            me = (p.get("author") or {}).get("login")
            first = min((parse(r.get("submittedAt")) for r in p.get("reviews") or []
                         if (r.get("author") or {}).get("login") != me and parse(r.get("submittedAt"))), default=None)
            created = parse(p.get("createdAt"))
            if first and created and business_hours(created, first) <= 24:
                fast += 1
        trophies["relu_24h"] = {"ok": bool(total) and fast == total, "period": week, "at": week_at, "progress": f"{fast} / {total}"}
    except Exception as e:
        errors.append(f"gh reviews : {e}")

print(dumps({"generated_at": datetime.now(timezone.utc).isoformat(),
             "sprint": {"name": sp.get("name"), "start": sp.get("startDate"), "end": sp.get("endDate")},
             "target": target, "sprints": sprints[:8], "canetons": sum(1 for s in sprints if s["held"]), "streak": streak,
             "trophies": trophies, "errors": errors}))
