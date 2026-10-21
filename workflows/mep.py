"""Mise en prod d'une PR, pour tout projet de la config (#58) : une sous-commande par étape Exec du modèle mep.json.

  python3 -c <ce script> <étape> <projet> <n° de PR> <ticket forcé> <id du run> <simulation>

Projets : le dépôt principal (github) et ceux de github.deploys qui ont une clé « mep » :
  {"ci_workflow": "CI_Quality-test.yaml", "ci_label": "ci-test", "staging_inputs": {"envchoice": "stg",
   "versiontags": "{tag}"}, "prod_inputs": {"versiontags": "{tag}"}, "staging_url": "https://…", "logo": "…"}
  {tag} est remplacé par le tag de la release ; staging_workflow et prod_workflow restent ceux de github / github.deploys.
Le projet s'écrit owner/dépôt ou par son nom court (label, sinon le nom du dépôt).
Le ticket est déduit de la PR (branche, puis titre, puis description : première clé du projet Jira) ; « ticket forcé »
passe avant. Simulation (« oui ») : rien n'est poussé, mergé, créé ni déployé ; tout le reste est lu pour de vrai.
Git : une copie du dépôt dans ~/.cache/pixel-bureau/mep/repos (jamais le dossier du projet) ; état du run dans
~/.cache/pixel-bureau/mep/runs/<run>.json.
Annonce Teams (#59, clé mep.teams : {team, channel, test_team?, test_channel}) : une carte adaptative postée après la gate
du début (⏳), éditée au merge (chargeur animé, sprites/teams/loader.png), en prod (✅) ou en échec (❌ et la raison en
réponse dans le fil). Logo du projet : mep.logo (PNG, chemin relatif au pack d'équipe). Simulation : le canal de test.
Jeton : « az account get-access-token » (Microsoft Graph), gardé en mémoire le temps de l'étape. Sans mep.teams : rien.
Codes de sortie (signaux exit_N de Kronn) : 2 projet inconnu, 3 PR introuvable ou fermée, 6 ticket introuvable,
7 conflit de rebase, 8 push refusé, 9 merge refusé, 10 tag illisible, 11 release refusée, 12 déploiement non lancé,
4 CI ou déploiement en échec, 5 délai dépassé.
"""
import base64, json, os, re, subprocess, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone
from _lib import CFG, read_json, write_json

HOME = os.path.expanduser("~/.cache/pixel-bureau/mep")
POLL, TRIES = int(os.environ.get("MEP_POLL", "20")), 75  # 25 min au plus par attente (exec_timeout_secs plafonné à 1800 s) ; MEP_POLL : tests


LAST = [""]  # dernier message d'échec : la raison de la réponse ❌ dans le fil Teams (#59)


def fail(code, msg):
    print(msg)
    LAST[0] = msg
    sys.exit(code)


def projects():
    """[{repo, short, staging_workflow, prod_workflow, mep}] : les projets qu'on peut mettre en prod."""
    g = CFG.get("github") or {}
    out = []
    for d in [g] + list(g.get("deploys") or []):
        if d.get("repo") and isinstance(d.get("mep"), dict) and d.get("prod_workflow") and d["repo"] not in [p["repo"] for p in out]:
            out.append({"repo": d["repo"], "short": d.get("label") or d["repo"].split("/")[-1],
                        "staging_workflow": d.get("staging_workflow"), "prod_workflow": d["prod_workflow"], "mep": d["mep"]})
    return out


def project_of(name):
    name = (name or "").strip()
    return next((p for p in projects() if name in (p["repo"], p["short"], p["repo"].split("/")[-1])), None)


def run(*cmd, check=True, cwd=None, input=None):
    """Commande (gh, git) ; sa sortie, ou l'arrêt du script si elle échoue et que check est vrai."""
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd, input=input)
    if check and r.returncode:
        raise RuntimeError(f"{' '.join(cmd[:3])} : {(r.stderr or r.stdout).strip()[:400]}")
    return r.stdout.strip()


def state_path(run_id):
    return os.path.join(HOME, "runs", re.sub(r"[^\w-]", "", run_id or "local") + ".json")


def load(run_id):
    try:
        return read_json(state_path(run_id))
    except (OSError, ValueError):
        return {}


def save(run_id, st):
    os.makedirs(os.path.dirname(state_path(run_id)), exist_ok=True)
    write_json(state_path(run_id), st)


def ticket_of(pr, forced):
    """Clé du ticket : forcée, sinon la première clé du projet Jira dans la branche, le titre puis la description."""
    if forced.strip():
        return forced.strip().upper()
    key = (CFG.get("jira") or {}).get("project") or "[A-Z][A-Z0-9]+"
    rx = re.compile(r"\b(" + key + r"-\d+)\b", re.I)
    for text in (pr.get("headRefName"), pr.get("title"), pr.get("body")):
        m = rx.search(text or "")
        if m:
            return m.group(1).upper()
    return ""


def bump(last, issue_type):
    """Tag suivant : Bug -> correctif (A.B.C+1), sinon fonctionnalité (A.B+1.0) ; None si la dernière version est illisible."""
    m = re.match(r"^(v?)(\d+)\.(\d+)\.(\d+)", last or "")
    if not m:
        return None
    pfx, a, b, c = m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4))
    return f"{pfx}{a}.{b}.{c + 1}" if (issue_type or "").strip().lower() == "bug" else f"{pfx}{a}.{b + 1}.0"


def inputs(p, env, tag):
    return {k: str(v).replace("{tag}", tag) for k, v in (p["mep"].get(env + "_inputs") or {}).items()}


def latest_run(repo, workflow, since, head_sha=None):
    """'pending', 'success' ou 'failed' : le dernier run du workflow créé après since (ou sur ce commit)."""
    q = f"repos/{repo}/actions/workflows/{workflow}/runs?per_page=10" + (f"&head_sha={head_sha}" if head_sha else "&event=workflow_dispatch")
    try:
        runs = json.loads(run("gh", "api", q)).get("workflow_runs") or []
    except (RuntimeError, ValueError):
        return "pending"
    runs = sorted((r for r in runs if head_sha or (r.get("created_at") or "") > since), key=lambda r: r.get("created_at") or "")
    if not runs or runs[-1].get("status") != "completed":
        return "pending"
    return "success" if runs[-1].get("conclusion") == "success" else "failed"


def wait(what, check):
    for i in range(1, TRIES + 1):
        res = check()
        if res == "success":
            print(f"{what} : vert (tentative {i})")
            return
        if res == "failed":
            fail(4, f"{what} : ÉCHEC, arrêt.")
        time.sleep(POLL)
    fail(5, f"{what} : délai dépassé (~{TRIES * POLL // 60} min).")


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------- annonce Teams (#59) ----------
GRAPH = os.environ.get("MEP_GRAPH") or "https://graph.microsoft.com/v1.0"  # MEP_GRAPH : tests
TOKEN = [None]
STATUS = {"wait": "⏳", "ok": "✅", "ko": "❌"}


def channel(dry):
    t = (CFG.get("mep") or {}).get("teams") or {}
    team, chan = (t.get("test_team") or t.get("team"), t.get("test_channel")) if dry == "oui" else (t.get("team"), t.get("channel"))
    return (team, chan) if team and chan else None


def graph(method, path, body=None):
    if not TOKEN[0]:
        TOKEN[0] = run("az", "account", "get-access-token", "--resource", "https://graph.microsoft.com", "--query", "accessToken", "-o", "tsv")
    req = urllib.request.Request(GRAPH + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": "Bearer " + TOKEN[0], "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
    return json.loads(raw) if raw else None


def data_uri(path):
    try:
        with open(path, "rb") as f:
            return "data:image/png;base64," + base64.b64encode(f.read()).decode()
    except OSError:
        return None


def logo_of(p):
    path = p["mep"].get("logo") or ""
    if path and not os.path.isabs(path):
        path = os.path.join(os.path.expanduser(str(CFG.get("team") or "")), path)
    return data_uri(path) if path else None


def card(p, st, state):
    """Le message Teams : une carte adaptative sur trois lignes (projet, MEP tag, titre de la PR) à côté du logo ; devant,
    l'état (⏳ ✅ ❌) ou le chargeur animé pendant la mise en prod. Le logo ne change jamais de taille ni de place."""
    mid = lambda items: {"type": "Column", "width": "auto", "verticalContentAlignment": "Center", "items": items}  # noqa: E731
    loader = data_uri(os.path.join(str(CFG.get("root") or os.path.dirname(os.path.dirname(os.path.abspath(sys.argv[0])))), "sprites", "teams", "loader.png"))
    cols = [mid([{"type": "Image", "url": loader, "width": "22px", "height": "22px"}] if state == "run" and loader
                else [{"type": "TextBlock", "text": STATUS.get(state, "⏳"), "size": "Medium"}])]
    logo = logo_of(p)
    if logo:
        cols.append(mid([{"type": "Image", "url": logo, "width": "36px", "height": "36px"}]))
    cols.append({"type": "Column", "width": "stretch", "verticalContentAlignment": "Center", "items": [
        {"type": "TextBlock", "text": p["short"], "weight": "Bolder"},
        {"type": "TextBlock", "text": f"MEP `{st.get('tag', '')}`", "spacing": "None"},
        {"type": "TextBlock", "text": st.get("title", ""), "wrap": True, "spacing": "None", "isSubtle": True}]})
    return {"body": {"contentType": "html", "content": '<attachment id="mep"></attachment>'},
            "attachments": [{"id": "mep", "contentType": "application/vnd.microsoft.card.adaptive", "content": json.dumps(
                {"type": "AdaptiveCard", "version": "1.4", "body": [{"type": "ColumnSet", "columns": cols}]})}]}


def announce(p, st, state, run_id, reply=None):
    """Poste la carte (première fois) ou l'édite ; une réponse dans le fil si reply. Une erreur Teams n'arrête jamais
    la mise en prod : elle est seulement signalée dans le run."""
    ch = channel(st.get("dry", "non"))
    if not ch:
        return
    base = f"/teams/{ch[0]}/channels/{urllib.parse.quote(ch[1])}/messages"
    try:
        if st.get("msg"):
            graph("PATCH", f"{base}/{st['msg']}", card(p, st, state))
        else:
            st["msg"] = graph("POST", base, card(p, st, state))["id"]
            save(run_id, st)
        if reply:
            graph("POST", f"{base}/{st['msg']}/replies", {"body": {"contentType": "html", "content": reply}})
    except (urllib.error.URLError, RuntimeError, KeyError, ValueError) as e:
        print(f"(annonce Teams non mise à jour : {str(e)[:200]})")


def teams_post(p, n, forced, run_id, dry):
    st = load(run_id)
    if not channel(dry):
        print("Pas d'annonce Teams (mep.teams absent).")
        return
    announce(p, st, "wait", run_id)
    print(f"Annonce Teams postée{' (canal de test)' if dry == 'oui' else ''} : ⏳ {p['short']} · MEP {st['tag']}.")


def teams_failed(p, n, forced, run_id, dry):
    """Atteinte seulement par Goto, après l'échec d'une étape : carte ❌ et la raison en réponse ; le run finit en échec."""
    st = load(run_id)
    err = st.get("error") or {}
    reason = (err.get("msg") or "étape en échec").replace("<", "&lt;")
    if st.get("msg"):
        announce(p, st, "ko", run_id, reply=f"❌ {reason} (étape <code>{err.get('step', '?')}</code>, run {run_id[:8]} dans Kronn)")
    fail(1, f"Mise en prod en échec à l'étape {err.get('step', '?')} : {reason}")


# ---------- les étapes ----------
def resolve(p, n, forced, run_id, dry):
    """PR ouverte, ticket déduit ; sortie = la clé du ticket seule (lue par l'étape Jira)."""
    if not re.fullmatch(r"\d+", n):
        fail(3, f"N° de PR invalide : « {n} ».")
    try:
        pr = json.loads(run("gh", "pr", "view", n, "-R", p["repo"], "--json",
                            "number,title,body,headRefName,headRefOid,baseRefName,state,url,reviewDecision,commits"))
    except (RuntimeError, ValueError) as e:
        fail(3, f"PR {p['repo']}#{n} introuvable ({e}).")
    if pr.get("state") != "OPEN":
        fail(3, f"PR {p['repo']}#{n} : état {pr.get('state')}, une PR ouverte est attendue.")
    key = ticket_of(pr, forced)
    if not key:
        fail(6, f"Aucun ticket trouvé dans la branche, le titre ni la description de {p['repo']}#{n} : relance avec « Ticket ».")
    save(run_id, {"repo": p["repo"], "short": p["short"], "pr": int(n), "ticket": key, "title": pr.get("title") or "",
                  "branch": pr.get("headRefName"), "base": pr.get("baseRefName") or "main", "url": pr.get("url"),
                  "review": pr.get("reviewDecision") or "", "commits": len(pr.get("commits") or []), "dry": dry})
    sys.stdout.write(key)


def tag(p, n, forced, run_id, dry):
    """Tag de la release d'après le type Jira (stdin) ; sortie = le résumé que montre la gate du début."""
    st = load(run_id)
    issue_type = sys.stdin.read().strip()
    issue_type = "" if issue_type in ("", "null") else issue_type
    last = run("gh", "api", f"repos/{p['repo']}/releases/latest", "--jq", ".tag_name", check=False)
    new = bump(last, issue_type)
    if not new:
        fail(10, f"Dernière release illisible : « {last} ».")
    st["tag"] = new
    save(run_id, st)
    review = {"APPROVED": "approuvée", "CHANGES_REQUESTED": "changements demandés", "REVIEW_REQUIRED": "relecture attendue"}.get(st["review"], st["review"] or "pas de relecture")
    print(f"**{st['short']}#{st['pr']}** : {st['title']}")
    print(f"Branche `{st['branch']}` vers `{st['base']}` · {st['commits']} commit(s), squashés en 1 · {review}")
    print(f"Ticket **{st['ticket']}** · type {issue_type or 'inconnu (fonctionnalité)'}")
    print(f"Release : `{last}` → **`{new}`** (« {new} - {st['ticket']} »)")
    print(f"Déploiements : {p['staging_workflow'] or 'pas de staging'} puis {p['prod_workflow']}")
    ch = channel(dry)
    if ch:
        print(f"Annonce Teams{' (canal de test)' if dry == 'oui' else ''}, postée à l'approbation : ⏳ **{p['short']}** · MEP `{new}` · {st['title']}")
    if dry == "oui":
        print("**Simulation** : rien ne sera poussé, mergé, créé ni déployé.")


def clone(repo):
    path = os.path.join(HOME, "repos", repo.replace("/", "__"))
    if not os.path.isdir(os.path.join(path, ".git")):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        run("gh", "repo", "clone", repo, path, "--", "--filter=blob:none")
    run("git", "fetch", "--prune", "origin", cwd=path)
    return path


def rebase(p, n, forced, run_id, dry):
    """Rebase de la branche sur sa base, squash en un commit au titre de la PR, push protégé (force-with-lease)."""
    st = load(run_id)
    path = clone(p["repo"])
    b, base = st["branch"], st["base"]
    expected = run("git", "rev-parse", f"origin/{b}", cwd=path)
    run("git", "checkout", "-f", "--detach", f"origin/{b}", cwd=path)
    count = run("git", "rev-list", "--count", f"origin/{base}..HEAD", cwd=path)
    if subprocess.run(["git", "rebase", f"origin/{base}"], cwd=path, capture_output=True).returncode:
        subprocess.run(["git", "rebase", "--abort"], cwd=path, capture_output=True)
        fail(7, f"CONFLIT de rebase de {b} sur origin/{base} : abandon, rien poussé.")
    run("git", "reset", "--soft", f"origin/{base}", cwd=path)
    run("git", "commit", "--no-verify", "-m", st["title"], cwd=path)
    sha = run("git", "rev-parse", "HEAD", cwd=path)
    if dry == "oui":
        print(f"Simulation : rebase et squash faits en local ({count} commit(s) → 1, {sha[:8]}), rien poussé.")
        st["sha"] = expected
    else:
        r = subprocess.run(["git", "push", "--no-verify", f"--force-with-lease=refs/heads/{b}:{expected}", "origin", f"HEAD:refs/heads/{b}"],
                           cwd=path, capture_output=True, text=True)
        if r.returncode:
            fail(8, f"Push refusé (force-with-lease) : la branche distante a bougé. {r.stderr.strip()[:300]}")
        st["sha"] = sha
        print(f"Rebase et squash : {count} commit(s) de {b} → 1 commit sur origin/{base} ({sha[:8]}), poussé.")
    save(run_id, st)


def citest(p, n, forced, run_id, dry):
    """Label de la CI reposé (tests relancés sur le commit final), puis attente du résultat."""
    st, wf, label = load(run_id), p["mep"].get("ci_workflow"), p["mep"].get("ci_label")
    if not wf:
        print("Pas de CI déclarée pour ce projet (mep.ci_workflow) : étape passée.")
        return
    if dry == "oui":
        print(f"Simulation : label {label} non reposé ; CI {wf} lue sur le commit actuel.")
    elif label:
        run("gh", "pr", "edit", str(st["pr"]), "-R", p["repo"], "--remove-label", label, check=False)
        run("gh", "pr", "edit", str(st["pr"]), "-R", p["repo"], "--add-label", label)
    wait(f"CI {wf}", lambda: latest_run(p["repo"], wf, "", head_sha=st["sha"]))


def merge(p, n, forced, run_id, dry):
    st = load(run_id)
    announce(p, st, "run", run_id)  # merge cliqué : la mise en prod est en cours (chargeur)
    if dry == "oui":
        print(f"Simulation : {p['repo']}#{st['pr']} non mergée.")
        return
    try:
        run("gh", "pr", "merge", str(st["pr"]), "-R", p["repo"], "--rebase")
    except RuntimeError as e:
        fail(9, f"Merge (rebase) refusé pour #{st['pr']} : {e}")
    print(f"{p['repo']}#{st['pr']} mergée en rebase sur {st['base']}.")


def release(p, n, forced, run_id, dry):
    st = load(run_id)
    title = f"{st['tag']} - {st['ticket']}"
    if dry == "oui":
        print(f"Simulation : release « {title} » non créée.")
        return
    try:
        run("gh", "release", "create", st["tag"], "-R", p["repo"], "--target", st["base"], "--generate-notes", "--title", title)
    except RuntimeError as e:
        fail(11, f"Release {st['tag']} refusée : {e}")
    print(f"Release créée : {title} (notes générées).")


def deploy(env):
    def step(p, n, forced, run_id, dry):
        st, wf = load(run_id), p[env + "_workflow"]
        if not wf:
            print(f"Pas de déploiement {env} pour ce projet : étape passée.")
            return
        args = [x for k, v in inputs(p, env, st["tag"]).items() for x in ("-f", f"{k}={v}")]
        if dry == "oui":
            print(f"Simulation : {wf} non lancé (gh workflow run {wf} --ref {st['base']} {' '.join(args)}).")
        else:
            t0 = now()
            try:
                run("gh", "workflow", "run", wf, "-R", p["repo"], "--ref", st["base"], *args)
            except RuntimeError as e:
                fail(12, f"Déploiement {env} non lancé : {e}")
            print(f"{wf} lancé (tag {st['tag']}).")
            wait(f"Déploiement {env} ({wf})", lambda: latest_run(p["repo"], wf, t0))
        if env == "staging" and p["mep"].get("staging_url"):
            print(f"À vérifier : {p['mep']['staging_url']}")
        if env == "prod":
            announce(p, st, "ok", run_id)
            print(others(st))
    return step


def others(st):
    """Les PR du ticket dans les projets, pour la gate de fin (ticket terminé ou pas)."""
    lines = [f"- {st['short']}#{st['pr']} : en prod à l'instant ({st['tag']})"]
    for q in projects():
        try:
            found = json.loads(run("gh", "pr", "list", "-R", q["repo"], "--state", "all", "--search", f"{st['ticket']} in:title,body",
                                   "-L", "10", "--json", "number,state,title", check=False) or "[]")
        except ValueError:
            continue
        for x in found:
            if q["repo"] == st["repo"] and x["number"] == st["pr"]:
                continue
            what = {"OPEN": "**encore ouverte**", "MERGED": "mergée", "CLOSED": "fermée sans merge"}.get(x["state"], x["state"])
            lines.append(f"- {q['short']}#{x['number']} : {what}")
    return f"PR du ticket {st['ticket']} :\n" + "\n".join(lines)


def dry_guard(p, n, forced, run_id, dry):
    """Après la gate de fin : en simulation, sort en 9 (renvoi vers done) pour sauter le retour IA et le statut de fin,
    seules étapes qui écrivent dans Jira ; sinon continue."""
    st = load(run_id)
    if dry == "oui":
        fail(9, f"Simulation : {st.get('ticket', 'le ticket')} ni commenté (retour IA) ni passé au statut de fin.")
    print(f"{st.get('ticket', 'Le ticket')} : retour IA puis statut de fin.")


def end(p, n, forced, run_id, dry):
    st = load(run_id)
    what = "simulation de la MEP" if dry == "oui" else "MEP"
    print(f"Fin : {what} de {st.get('short')}#{st.get('pr')} réussie ; {st.get('ticket', 'le ticket')} n'a pas été touché par cette étape.")


STEPS = {"resolve": resolve, "tag": tag, "rebase": rebase, "citest": citest, "merge": merge, "release": release,
         "staging": deploy("staging"), "prod": deploy("prod"), "done": end, "dry_guard": dry_guard,
         "teams_post": teams_post, "teams_failed": teams_failed}

if __name__ == "__main__":
    step, name, n, forced, run_id, dry = (sys.argv[1:] + [""] * 6)[:6]
    dry = "oui" if dry.strip().lower() in ("oui", "yes", "true", "1") else "non"
    proj = project_of(name)
    if not proj:
        fail(2, f"Projet inconnu : « {name} » (projets : {', '.join(x['short'] for x in projects()) or 'aucun'}).")
    try:
        try:
            STEPS[step](proj, n.strip().lstrip("#"), forced, run_id, dry)
        except RuntimeError as e:  # une commande gh ou git a échoué hors des cas prévus
            fail(1, str(e))
    except SystemExit as e:  # échec : étape et raison gardées pour teams_failed (#59)
        if e.code and step not in ("teams_failed", "dry_guard"):  # dry_guard : renvoi voulu, pas un échec
            st = load(run_id)
            st["error"] = {"step": step, "msg": LAST[0][:300]}
            save(run_id, st)
        raise
