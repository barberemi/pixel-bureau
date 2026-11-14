"""Sprint Quest (bouton « Préparer la partie » de la borne des Combles) : les données de la rétro du dernier sprint fermé.

Trois usages, choisis par le premier argument :
  mark                 stdout : {"running": true, "since": …} (publié d'abord : la fiche de la borne dit « en préparation »)
  pick                 stdin : graphique de vélocité Jira ; stdout : l'id du dernier sprint fermé (0 sans sprint)
  build <testé> <réouvert>
                       stdin : {"sprint": id, "issues": tickets du sprint (champ Sprint compris), "log": changelog/bulkfetch} ;
                       lit aussi, par gh, les PR mergées et les mises en prod de la fenêtre du sprint, et les incidents des
                       pages de statut (réglage statuts). stdout : {generated_at, sprint, data, warnings}, data au format
                       sprint/data de l'artefact Sprint Quest. Textes fixes (0 jeton), tirés des données ; une source en échec
                       laisse un avertissement et sa part du jeu se replie.
"""
import json, re, subprocess, sys, urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone
from _lib import CFG, TZ, dumps

warnings = []
MONTHS = ["JANV", "FÉVR", "MARS", "AVR", "MAI", "JUIN", "JUIL", "AOÛT", "SEPT", "OCT", "NOV", "DÉC"]
DAYS = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"]
DAYS_LONG = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI", "DIMANCHE"]
STATUTS = [{"n": "GitHub", "url": "https://www.githubstatus.com"},
           {"n": "Claude", "url": "https://status.claude.com", "components": ["Claude API (api.anthropic.com)", "Claude Code"]},
           {"n": "Jira", "url": "https://jira-software.status.atlassian.com"},
           {"n": "Confluence", "url": "https://confluence.status.atlassian.com"}]  # comme statuts_snapshot.py


def warn(msg):
    print("bureau : " + msg, file=sys.stderr)
    warnings.append(msg[:240])


def read_stdin():
    raw = sys.stdin.read().strip()
    try:
        return json.loads(raw) if raw else None
    except ValueError:
        warn("sprintquest : entrée illisible")
        return None


def parse(v):
    """Date Jira (ISO, ou millisecondes du changelog/bulkfetch) -> datetime aware, ou None."""
    if isinstance(v, (int, float)):
        return datetime.fromtimestamp(v / 1000, timezone.utc)
    try:
        return datetime.fromisoformat(re.sub(r"([+-]\d\d)(\d\d)$", r"\1:\2", str(v).replace("Z", "+00:00")))
    except ValueError:
        return None


up = lambda s: str(s or "").upper()  # noqa: E731
cut = lambda s, n: (s if len(s) <= n else s[:n - 1].rstrip() + ".")  # noqa: E731
first = lambda s: (str(s or "").split() or ["?"])[0]  # noqa: E731
day_txt = lambda d: f"{DAYS[d.weekday()]} {d.day}"  # noqa: E731


def gh(args):
    try:
        r = subprocess.run(["gh", *args], capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise RuntimeError(f"gh introuvable ou trop lent ({e.__class__.__name__})")
    if r.returncode:
        raise RuntimeError((r.stderr or r.stdout).strip()[:200] or f"gh {args[0]} : code {r.returncode}")
    return json.loads(r.stdout or "[]")


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "pixel-bureau", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.loads(r.read().decode("utf-8"), strict=False)


# ---------- mark, pick ----------
def mark():
    print(dumps({"running": True, "since": datetime.now(timezone.utc).isoformat(timespec="seconds")}))


def pick(vel):
    """Le graphique de vélocité liste les derniers sprints fermés, du plus récent au plus ancien."""
    for s in (vel.get("sprints") if isinstance(vel, dict) else None) or []:
        if str(s.get("state") or "").upper() == "CLOSED" and s.get("id"):
            print(int(s["id"]), end="")
            return
    warn("sprintquest : aucun sprint fermé dans le graphique de vélocité")
    print(0, end="")


# ---------- le sprint, ses tickets, leurs statuts ----------
def sprint_of(issues, sid, field):
    for it in issues:
        for s in ((it.get("fields") or {}).get(field) or []):
            if isinstance(s, dict) and str(s.get("id")) == str(sid):
                return s
    return {}


def histories(log):
    """changelog/bulkfetch -> {id du ticket: [(date, ancien statut, nouveau statut)]}, dans l'ordre."""
    out = {}
    for l in log or []:
        rows = []
        for h in l.get("changeHistories") or []:
            at = parse(h.get("created"))
            for i in h.get("items") or []:
                if at and (i.get("fieldId") or i.get("field")) == "status":
                    rows.append((at, i.get("fromString") or "", i.get("toString") or ""))
        out[str(l.get("issueId"))] = sorted(rows, key=lambda r: r[0])
    return out


def tickets(issues, log, start, end):
    J = CFG.get("jira") or {}
    pts_fields, cols = J.get("points_fields") or [], J.get("statuses") or {}
    H = histories(log)
    out = []
    for it in issues:
        f = it.get("fields") or {}
        moves = H.get(str(it.get("id")), [])
        status = (f.get("status") or {}).get("name") or ""
        before = [m for m in moves if m[0] <= end]
        at_end = before[-1][2] if before else (moves[0][1] if moves else status)
        pts = next((f.get(k) for k in pts_fields if f.get(k) is not None), None)
        # temps passé dans une colonne « en cours » pendant le sprint, en jours
        doing, since = 0.0, None
        pre = [m for m in moves if m[0] < start]
        state = pre[-1][2] if pre else (moves[0][1] if moves else status)
        if cols.get(state) == "doing":
            since = start
        for at, _, to in (m for m in moves if start <= m[0] <= end):
            t = at
            if since is not None:
                doing += (t - since).total_seconds()
                since = None
            if cols.get(to) == "doing":
                since = t
        if since is not None:
            doing += (end - since).total_seconds()
        out.append({"key": it.get("key") or "", "summary": f.get("summary") or "", "type": (f.get("issuetype") or {}).get("name") or "",
                    "who": (f.get("assignee") or {}).get("displayName") or "", "at_end": at_end, "points": pts if isinstance(pts, (int, float)) else 0,
                    "moves": [m for m in moves if start <= m[0] <= end], "doing_days": round(doing / 86400)})
    return out


# ---------- GitHub et pages de statut ----------
def repos():
    G = CFG.get("github") or {}
    rs = list(G.get("pr_repos") or []) or [G.get("repo")]
    return [r for r in dict.fromkeys(rs) if r][:12]


def merged_prs(a, b):
    out = []
    for r in repos():
        try:
            for p in gh(["pr", "list", "--repo", r, "--state", "merged", "--limit", "200", "--search", f"merged:{a:%Y-%m-%d}..{b:%Y-%m-%d}",
                         "--json", "number,title,comments,reviews,mergedAt,author"]):
                if (p.get("author") or {}).get("is_bot"):
                    continue
                out.append({"repo": r, "n": p.get("number"), "title": p.get("title") or "", "talk": len(p.get("comments") or []) + len(p.get("reviews") or [])})
        except Exception as e:  # noqa: BLE001
            warn(f"sprintquest : PR de {r} illisibles ({e})")
    return out


def prod_runs(start, end):
    G = CFG.get("github") or {}
    prods = [(G.get("repo"), G.get("prod_workflow"))] + [(d.get("repo"), d.get("prod_workflow")) for d in G.get("deploys") or []]
    out = []
    for repo, wf in dict.fromkeys((r, w) for r, w in prods if r and w):
        try:
            for r in gh(["run", "list", "--repo", repo, "--workflow", wf, "--limit", "100", "--json", "conclusion,createdAt,displayTitle"]):
                at = parse(r.get("createdAt"))
                if at and start <= at <= end and r.get("conclusion") in ("success", "failure"):
                    out.append({"at": at, "ok": r.get("conclusion") == "success", "title": r.get("displayTitle") or repo})
        except Exception as e:  # noqa: BLE001
            warn(f"sprintquest : mises en prod de {repo} illisibles ({e})")
    return sorted(out, key=lambda r: r["at"])


def incidents(start, end):
    conf = CFG.get("statuts")
    out = []
    for s in (conf if isinstance(conf, list) else STATUTS):
        url, keep = str(s.get("url") or "").rstrip("/"), set(s.get("components") or [])
        try:
            listed = fetch(url + "/api/v2/incidents.json").get("incidents") or []
        except Exception as e:  # noqa: BLE001 (une page de statut injoignable : pas de fantôme de ce côté)
            warn(f"sprintquest : incidents de {s.get('n')} illisibles ({type(e).__name__})")
            continue
        for i in listed:
            a, b = parse(i.get("started_at") or i.get("created_at")), parse(i.get("resolved_at")) or end
            comps = [c.get("name") for c in i.get("components") or []]
            if not a or b < start or a > end or i.get("impact") in (None, "none", "maintenance"):
                continue
            if keep and comps and not any(c in keep for c in comps):
                continue
            out.append({"n": s.get("n") or "", "name": i.get("name") or "", "impact": i.get("impact"), "a": a, "hours": (b - a).total_seconds() / 3600})
    rank = {"minor": 1, "major": 2, "critical": 3}
    return sorted(out, key=lambda i: (-rank.get(i["impact"], 0), -i["hours"]))


# ---------- les textes ----------
def options(right, others, seed):
    """4 réponses distinctes, la bonne à une place tirée du sprint (la même à chaque préparation)."""
    opts = [right] + [o for o in dict.fromkeys(others) if o != right][:3]
    if len(opts) < 4:
        return None, None
    k = seed % 4
    opts[0], opts[k] = opts[k], opts[0]
    return opts, k


def numbers(n, spread):
    return [str(n)] + [str(v) for v in (n + spread, max(0, n - spread - 1), n + 2 * spread + 1, n + 1) if v != n]


def hours_txt(h):
    return f"{round(h)} H" if h >= 1 else f"{max(1, round(h * 60))} MIN"


def build(D, validated, reopened):
    J = CFG.get("jira") or {}
    sid, issues = (D or {}).get("sprint"), (D or {}).get("issues") or []
    sp = sprint_of(issues, sid, J.get("sprint_field") or "")
    start, end = parse(sp.get("startDate")), parse(sp.get("completeDate") or sp.get("endDate"))
    if not sid or not issues or not start or not end:
        warn("sprintquest : sprint fermé ou tickets introuvables, rien à préparer")
        return {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "data": None, "warnings": warnings}
    done = J.get("done_status") or "Done"
    T = tickets(issues, (D or {}).get("log"), start, end)
    s0, s1 = start.astimezone(TZ), end.astimezone(TZ)
    name = cut(up(sp.get("name") or f"SPRINT {sid}"), 20)
    dates = f"{s0.day}-{s1.day} {MONTHS[s1.month - 1]}" if s0.month == s1.month else f"{s0.day} {MONTHS[s0.month - 1]}-{s1.day} {MONTHS[s1.month - 1]}"
    seed = int(sid) if str(sid).isdigit() else 7

    delivered = [t for t in T if t["at_end"] == done]
    pts_all, pts_done = sum(t["points"] for t in T), sum(t["points"] for t in delivered)
    tested = {t["key"] for t in T if any(m[2] == validated for m in t["moves"])}
    reopen = Counter(t["key"] for t in T for m in t["moves"] if m[2] == reopened)
    prs, runs, incs = merged_prs(s0, s1), prod_runs(start, end), incidents(start, end)
    meps, failed = [r for r in runs if r["ok"]], [r for r in runs if not r["ok"]]

    vs = [{"l": "TICKETS LIVRÉS", "v": f"{len(delivered)} / {len(T)}"}, {"l": "MISES EN PROD", "v": str(len(meps))},
          {"l": "POINTS LIVRÉS", "v": f"{pts_done:g} / {pts_all:g}"}, {"l": "TICKETS TESTÉS / RÉOPEN", "v": f"{len(tested)} / {len(reopen)}"},
          {"l": "CAFÉS (1/PR + 2/MEP)", "v": str(len(prs) + 2 * len(meps))}]
    ratio = pts_done / pts_all if pts_all else (len(delivered) / len(T) if T else 1)
    life = [5, 5 if ratio >= .8 else 4 if ratio >= .5 else 3, 5 - min(3, len(reopen) // 2), 5 - min(3, len(incs)), max(2, 5 - len(failed))]

    stops = [{"l1": cut(f"LE {name} COMMENCE.", 38), "l2": cut(f"{len(T)} TICKETS AU PROGRAMME.", 38)},
             {"l1": "PREMIER ARRÊT :", "l2": "L'ÉQUIPE CONTRE LE SPRINT."},
             {"l1": "DEUXIÈME ARRÊT :", "l2": "LE QUIZ DU SPRINT."},
             {"l1": "TROISIÈME ARRÊT :", "l2": "LES BOSS DU SPRINT."},
             {"l1": "FIN DU NIVEAU.", "l2": "DRAPEAU ATTEINT !"}]
    if incs:
        i = incs[0]
        stops[3] = {"l1": cut(f"{day_txt(i['a'].astimezone(TZ))} : {up(i['n'])} TOMBE {hours_txt(i['hours'])}.", 38), "l2": "LES BOSS SORTENT DU BROUILLARD."}
    if meps:
        stops[4] = {"l1": cut(f"{day_txt(meps[-1]['at'].astimezone(TZ))} : LA DERNIÈRE MEP.", 38), "l2": "DRAPEAU ATTEINT !"}

    quiz = []
    # le jour où le plus de tickets ont atteint le statut fini
    per_day = Counter(m[0].astimezone(TZ).date() for t in T for m in t["moves"] if m[2] == done)
    if per_day:
        best, n = per_day.most_common(1)[0]
        days = [s0.date() + timedelta(days=k) for k in range((s1.date() - s0.date()).days + 1)]
        others = [day_txt(d) for d in sorted(days, key=lambda d: (per_day.get(d, 0), d)) if d.weekday() < 5 and d != best]
        opts, ok = options(day_txt(best), others, seed)
        if opts:
            quiz.append({"q1": "QUEL JOUR LE PLUS DE TICKETS", "q2": cut(f"SONT PASSÉS EN {up(done)} ?", 38), "a": opts, "ok": ok,
                         "fact": cut(f"{DAYS_LONG[best.weekday()]} {best.day} : {n} TICKETS {up(done)}", 40)})
    # qui a livré le plus de tickets
    by_who = Counter(first(t["who"]) for t in delivered if t["who"])
    names = list(dict.fromkeys([first(t["who"]) for t in T if t["who"]]))
    if by_who:
        top, n = by_who.most_common(1)[0]
        opts, ok = options(cut(up(top), 9), [cut(up(x), 9) for x in names], seed + 1)
        if opts:
            quiz.append({"q1": "QUI A LIVRÉ LE PLUS", "q2": "DE TICKETS ?", "a": opts, "ok": ok, "fact": cut(f"{up(top)} : {n} TICKETS LIVRÉS", 40)})
    # combien de PR mergées
    if not any("PR de" in w for w in warnings) and repos():
        opts, ok = options(str(len(prs)), numbers(len(prs), max(2, len(prs) // 4)), seed + 2)
        if opts:
            quiz.append({"q1": "COMBIEN DE PR ONT ÉTÉ", "q2": "MERGÉES PENDANT LE SPRINT ?", "a": opts, "ok": ok, "fact": cut(f"{len(prs)} PR MERGÉES EN {(s1.date() - s0.date()).days + 1} JOURS", 40)})
    # le ticket resté le plus longtemps en cours
    slow = max(T, key=lambda t: t["doing_days"]) if T else None
    if slow and slow["doing_days"] >= 1:
        d = slow["doing_days"]
        opts, ok = options(f"{d} J", [f"{v} J" for v in numbers(d, 2)[1:]], seed + 3)
        if opts:
            quiz.append({"q1": "LE TICKET LE PLUS LONG EN COURS :", "q2": "COMBIEN DE JOURS ?", "a": opts, "ok": ok, "fact": cut(f"{slow['key']} : {d} JOURS EN COURS", 40)})
    # le type de ticket le plus fréquent
    types = Counter(cut(up(t["type"]), 9) for t in T if t["type"])
    if len(types) >= 2:
        top, n = types.most_common(1)[0]
        opts, ok = options(top, [k for k, _ in types.most_common()] + ["BUG", "STORY", "TÂCHE", "EPIC"], seed + 4)
        if opts:
            quiz.append({"q1": "QUEL TYPE DE TICKET", "q2": "A ÉTÉ LE PLUS FRÉQUENT ?", "a": opts, "ok": ok, "fact": cut(f"{n} TICKETS {top} SUR {len(T)}", 40)})

    boss = []
    if slow and slow["doing_days"] >= 1:
        boss.append({"t": "snail", "n": slow["key"], "s": cut(up(f"{slow['doing_days']} jours en cours : {slow['summary']}"), 60), "pv": f"{slow['doing_days']} J"})
    talk = max(prs, key=lambda p: p["talk"]) if prs else None
    if talk and talk["talk"]:
        boss.append({"t": "hydra", "n": f"PR #{talk['n']}", "s": cut(up(talk["title"]), 60), "pv": cut(f"{talk['talk']} COMM.", 16), "heads": min(9, talk["talk"])})
    if incs:
        i = incs[0]
        boss.append({"t": "ghost", "n": cut(f"{up(i['n'])} EN PANNE", 40), "s": cut(up(i["name"]), 60), "pv": hours_txt(i["hours"])})
    elif failed:
        boss.append({"t": "ghost", "n": "MEP RATÉE", "s": cut(up(failed[-1]["title"]), 60), "pv": day_txt(failed[-1]["at"].astimezone(TZ))})
    elif reopen:
        k, n = reopen.most_common(1)[0]
        boss.append({"t": "ghost", "n": k, "s": cut(up(f"Réouvert {n} fois : " + next(t["summary"] for t in T if t["key"] == k)), 60), "pv": f"{n} REOPEN"})
    if not boss:
        boss.append({"t": "ghost", "n": "LE SPRINT TRANQUILLE", "s": "AUCUNE PANNE, AUCUNE MEP RATÉE, AUCUN REOPEN", "pv": ""})
    if not quiz:
        quiz.append({"q1": "COMBIEN DE TICKETS", "q2": "DANS LE SPRINT ?", "a": None, "ok": 0, "fact": ""})
        opts, ok = options(str(len(T)), numbers(len(T), 3), seed)
        quiz[0].update(a=opts, ok=ok, fact=cut(f"{len(T)} TICKETS AU PROGRAMME", 40))

    data = {"ex": False, "name": name, "dates": dates, "life": life, "stops": stops, "vs": vs, "quiz": quiz[:5], "boss": boss[:3]}
    company = ((CFG.get("combles") or {}).get("company") or "").strip()
    if company:
        data["company"] = company[:16]
    return {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "sprint": {"id": sid, "name": sp.get("name") or "", "start": start.isoformat(), "end": end.isoformat()}, "data": data, "warnings": warnings}


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "build"
    if mode == "mark":
        mark()
    elif mode == "pick":
        pick(read_stdin())
    else:
        print(dumps(build(read_stdin(), *(sys.argv[2:4] + ["To Deploy", "Reopen"])[:2])))
