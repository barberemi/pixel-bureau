"""PR depuis le Bureau : la remettre à jour de sa base (#74) et corriger ses commentaires de review (#75).

Remettre à jour (page action « bureau-rebase ») : rebase sans squash, push protégé, CI relancée.

Sous-commandes (python3 pr_update.py <étape> <dépôt owner/name> <n° de PR> <id du run>) :
  prepare  PR ouverte et pas d'un fork ; copie du dépôt sous ~/.cache/pixel-bureau/pr/repos (clone partiel, gardé), puis
           un dossier de travail par run (worktree détaché sur la tête de la PR) sous ~/.cache/pixel-bureau/pr/work/<run>.
  rebase   rebase sur la base de la PR, commits gardés tels quels. Déjà à jour : rien à faire. Conflit : le rebase reste
           en cours pour l'agent qui le résout, code 3 (renvoi vers resolve).
  verify   après l'agent : plus de rebase en cours ni de marqueur de conflit (sinon code 4) ; résumé de la résolution.
  check    après un conflit seulement : les contrôles du dépôt (voir checks_of), dépendances reliées depuis ton dossier
           local du dépôt s'il est un projet Kronn ; leur résultat part dans la validation, jamais bloquant.
  push     push protégé (--force-with-lease sur la tête lue au départ), label de CI retiré puis reposé, dossier de travail
           retiré. Rien de nouveau : rien poussé.
  done     fin du chemin sans conflit (message seulement).
  abort    rebase abandonné et dossier de travail retiré : rien poussé.
Corriger les commentaires d'une PR (#75, page action « bureau-fixpr ») :
  fix_prepare  fils de review non résolus (aucun : code 9, renvoi vers la fin), dossier de travail, dépendances reliées
               depuis ton dossier local du dépôt, contexte de l'agent (.bureau-fix.json, jamais commité), version de
               la passe (voir version_of).
  fix_check    après l'agent : les contrôles du dépôt (voir checks_of) sur les fichiers de la PR ; une commande rouge
               est relancée sur la tête de la PR d'avant les corrections (déjà rouge pareil : rien de nouveau) ; le
               verdict part en tête de la validation, jamais bloquant.
  fix_diff     après l'agent : verdict des contrôles, fichiers changés, diff et réponse prévue à chaque fil, pour la
               validation (rien : code 9).
  fix_push     validé : commit signé (-s, message de l'agent), push protégé, une réponse dans chaque fil (résolu s'il est
               corrigé), « **Version N** » en tête de chaque réponse, bloc « Corrections de review » (et le compteur des
               versions) dans la description de la PR, CI relancée.
Codes : 2 réglage ou PR refusés, 3 conflit (renvoi), 4 conflit non résolu, 5 push refusé, 9 rien à faire (renvoi), 1 autre échec.
"""
import glob, json, os, re, shutil, subprocess, sys, time
from _lib import CFG, fil_col, get, read_json, write_json
from _checks import check_run

HOME = os.path.expanduser("~/.cache/pixel-bureau/pr")
GH = CFG.get("github") or {}
DEPS = ("vendor", "node_modules")  # dépendances non versionnées, reliées depuis ton dossier local du dépôt pour le contrôle


def fail(code, msg):
    print(msg)
    sys.exit(code)


def run(*cmd, cwd=None, check=True, timeout=600, env=None):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=env)
    if check and r.returncode:
        raise RuntimeError(f"{' '.join(cmd[:3])} : {(r.stderr or r.stdout).strip()[-300:]}")
    return r.stdout.strip()


def state_path(run_id):
    return os.path.join(HOME, "runs", re.sub(r"[^\w-]", "", run_id) + ".json")


def load(run_id):
    try:
        return read_json(state_path(run_id))
    except (OSError, ValueError):
        fail(1, "État du run introuvable : l'étape prepare n'a pas tourné.")


def save(run_id, st):
    os.makedirs(os.path.dirname(state_path(run_id)), exist_ok=True)
    write_json(state_path(run_id), st)


def ci_label(repo):
    """Label qui relance la CI du dépôt : github.ci_labels, sinon celui de ses réglages de mise en prod (mep.ci_label)."""
    labels = GH.get("ci_labels") or {}
    if repo in labels:
        return labels[repo] or ""
    for d in [GH] + list(GH.get("deploys") or []):
        if (d.get("repo") or "").lower() == repo.lower():
            return ((d.get("mep") or {}).get("ci_label")) or ""
    return ""


def local_checkout(repo):
    """Ton dossier local du dépôt, s'il est un projet Kronn (remote origin = le dépôt), pour ses dépendances ; sinon None."""
    try:
        projects = get("/projects")
    except Exception:  # noqa: BLE001 : Kronn injoignable, le contrôle tourne sans les dépendances
        return None
    for p in projects or []:
        path = p.get("path") or ""
        if not os.path.isdir(os.path.join(path, ".git")):
            continue
        url = subprocess.run(["git", "-C", path, "remote", "get-url", "origin"], capture_output=True, text=True).stdout
        if re.search(r"[:/]" + re.escape(repo) + r"(\.git)?\s*$", url, re.I):
            return path
    return None


def link_deps(src, dst):
    """Relie vendor et node_modules de ton dossier local (3 niveaux au plus) dans le dossier de travail ; liste des liens."""
    linked = []
    for depth in ("", "*/", "*/*/", "*/*/*/"):
        for d in DEPS:
            for path in glob.glob(os.path.join(src, depth + d)):
                rel = os.path.relpath(path, src)
                if "node_modules" in rel.split(os.sep)[:-1] or "vendor" in rel.split(os.sep)[:-1]:
                    continue
                target = os.path.join(dst, rel)
                if os.path.isdir(path) and not os.path.lexists(target) and os.path.isdir(os.path.dirname(target)):
                    os.symlink(path, target)
                    linked.append(rel)
    return linked


def prune(clone):
    """Dossiers de travail de plus d'un jour retirés (runs refusés ou interrompus)."""
    for path in glob.glob(os.path.join(HOME, "work", "*")):
        if time.time() - os.path.getmtime(path) > 86400:
            subprocess.run(["git", "-C", clone, "worktree", "remove", "--force", path], capture_output=True)
            shutil.rmtree(path, ignore_errors=True)
    subprocess.run(["git", "-C", clone, "worktree", "prune"], capture_output=True)


def setup(repo, n, run_id):
    """PR ouverte et pas d'un fork, copie du dépôt en cache, dossier de travail de ce run ; l'état du run."""
    if not re.fullmatch(r"[\w.-]+/[\w.-]+", repo) or not re.fullmatch(r"\d+", n):
        fail(2, f"PR invalide : « {repo}#{n} ».")
    try:
        pr = json.loads(run("gh", "pr", "view", n, "-R", repo, "--json",
                            "number,title,state,headRefName,headRefOid,baseRefName,isCrossRepository,url,author,body,comments"))
    except (RuntimeError, ValueError) as e:
        fail(2, f"PR {repo}#{n} introuvable ({e}).")
    if pr.get("state") != "OPEN":
        fail(2, f"PR {repo}#{n} : état {pr.get('state')}, une PR ouverte est attendue.")
    if pr.get("isCrossRepository"):
        fail(2, f"PR {repo}#{n} : elle vient d'un fork, sa branche n'est pas poussable d'ici.")
    clone = os.path.join(HOME, "repos", repo.replace("/", "__"))
    if not os.path.isdir(os.path.join(clone, ".git")):
        os.makedirs(os.path.dirname(clone), exist_ok=True)
        run("gh", "repo", "clone", repo, clone, "--", "--filter=blob:none")
    run("git", "fetch", "--prune", "origin", cwd=clone)
    prune(clone)
    work = os.path.join(HOME, "work", re.sub(r"[^\w-]", "", run_id))
    subprocess.run(["git", "-C", clone, "worktree", "remove", "--force", work], capture_output=True)
    run("git", "worktree", "add", "--detach", work, f"origin/{pr['headRefName']}", cwd=clone)
    st = {"repo": repo, "pr": int(n), "title": pr["title"], "branch": pr["headRefName"], "base": pr["baseRefName"],
          "author": (pr.get("author") or {}).get("login"),
          "expected": run("git", "rev-parse", f"origin/{pr['headRefName']}", cwd=clone), "clone": clone, "work": work}
    common = run("git", "rev-parse", "--git-common-dir", cwd=work)
    common = common if os.path.isabs(common) else os.path.join(work, common)
    os.makedirs(os.path.join(common, "info"), exist_ok=True)
    with open(os.path.join(common, "info", "exclude"), "a", encoding="utf-8") as f:
        f.write("\n/.bureau-*\n")  # fichiers d'échange avec l'agent (résumé, réponses) : jamais commités
    save(run_id, st)
    # description et commentaires de la PR : pour le compteur des versions (version_of), jamais gardés dans l'état du run
    return dict(st, body=pr.get("body") or "", comments=[str((c or {}).get("body") or "") for c in pr.get("comments") or []])


def prepare(repo, n, run_id):
    st = setup(repo, n, run_id)
    work = st["work"]
    behind = run("git", "rev-list", "--count", f"HEAD..origin/{st['base']}", cwd=work)
    print(f"{repo}#{n} : {st['title']}\nBranche {st['branch']} sur {st['base']} : {behind} commit(s) de retard. Dossier de travail : {work}")


def rebase(repo, n, run_id):
    st = load(run_id)
    work, base = st["work"], st["base"]
    if run("git", "rev-list", "--count", f"HEAD..origin/{base}", cwd=work) == "0":
        print(f"Déjà à jour de {base} : rien à faire.")
        return
    count = run("git", "rev-list", "--count", f"origin/{base}..HEAD", cwd=work)
    env = dict(os.environ, GIT_EDITOR="true")  # auteurs gardés ; committer = l'identité git de la machine, comme un rebase à la main
    r = subprocess.run(["git", "rebase", f"origin/{base}"], cwd=work, capture_output=True, text=True, env=env)
    if r.returncode:
        files = run("git", "diff", "--name-only", "--diff-filter=U", cwd=work, check=False)
        st["conflict"] = True
        save(run_id, st)
        fail(3, f"Conflit en rejouant les {count} commit(s) de {st['branch']} sur {base} : "
                f"{', '.join(files.splitlines()) or 'fichiers inconnus'}. Résolution par l'agent, puis ta validation.")
    print(f"Rebase sans conflit : {count} commit(s) de {st['branch']} rejoués sur {base}, gardés tels quels.")


def in_rebase(work):
    git_dir = run("git", "rev-parse", "--git-dir", cwd=work)
    git_dir = git_dir if os.path.isabs(git_dir) else os.path.join(work, git_dir)
    return any(os.path.isdir(os.path.join(git_dir, d)) for d in ("rebase-merge", "rebase-apply"))


def verify(repo, n, run_id):
    st = load(run_id)
    work = st["work"]
    if in_rebase(work):
        fail(4, "Le rebase est toujours en cours : conflit non résolu par l'agent. Rien n'a été poussé.")
    marks = run("git", "grep", "-l", "-E", "^(<<<<<<<|>>>>>>>)( |$)", "HEAD", cwd=work, check=False)
    if marks.strip():
        fail(4, f"Marqueurs de conflit restés dans : {', '.join(marks.splitlines()[:5])}. Rien n'a été poussé.")
    note = os.path.join(work, ".bureau-resolution.md")
    summary = ""
    if os.path.exists(note):
        with open(note, encoding="utf-8") as f:
            summary = f.read().strip()[:1500]
        os.remove(note)
    count = run("git", "rev-list", "--count", f"origin/{st['base']}..HEAD", cwd=work)
    print(f"Conflit résolu : {count} commit(s) rejoués sur {st['base']}.\n\n{summary or '(pas de résumé de l’agent)'}")


def checks_of(repo):
    """Les contrôles du dépôt et d'où ils viennent : github.checks de ta config, sinon fix.checks du pack d'équipe, sinon
    ceux de la chaîne d'implémentation (impl.repos.<dépôt>.checks, règles puis tests, mêmes emplacements {worktree},
    {main}, {php}, {tests_php}…) ; ([], "") sans réglage."""
    for src, cmds in (("github.checks", GH.get("checks")), ("fix.checks", (CFG.get("fix") or {}).get("checks"))):
        own = next((v for k, v in (cmds or {}).items() if k.lower() == repo.lower()), None)
        if own:
            return ([own] if isinstance(own, (str, dict)) else list(own)), src
    conf = next((v for k, v in ((CFG.get("impl") or {}).get("repos") or {}).items() if k.lower() == repo.lower()), None) or {}
    c = conf.get("checks") or {}
    cmds = list(c.get("regles") or []) + list(c.get("tests") or [])
    return cmds, ("impl.repos" if cmds else "")


TOOLS = re.compile(r"\b(phpstan|phpunit|vitest|jest|eslint|stylelint|tsc|psalm|php-cs-fixer|(?:make|npm run|yarn|pnpm|composer) [\w:.-]+)")


def label(cmd):
    """Nom court d'une commande pour la validation et la PR : l'outil lancé (phpstan, vitest…), sinon la commande."""
    raw = cmd if isinstance(cmd, str) else cmd.get("cmd") or ""
    found = TOOLS.findall(raw)
    return found[-1] if found and len(raw) > 60 else raw[:60]


def pr_files(st):
    """Fichiers de la PR après les corrections (modifiés par rapport à sa base, ou nouveaux), sans les liens de dépendances."""
    work = st["work"]
    mb = run("git", "merge-base", f"origin/{st['base']}", "HEAD", cwd=work)
    out = run("git", "diff", "--name-only", mb, cwd=work).splitlines() + run("git", "ls-files", "--others", "--exclude-standard", cwd=work).splitlines()
    skip = set(st.get("linked") or [])
    return sorted({f for f in out if f and f not in skip and not f.startswith(".bureau-")})


def depart(st):
    """Copie de la tête de la PR d'avant le run (worktree détaché, dépendances reliées) pour relancer un contrôle rouge."""
    path = st["work"] + "-depart"
    if not os.path.exists(os.path.join(path, ".git")):
        shutil.rmtree(path, ignore_errors=True)
        if subprocess.run(["git", "-C", st["clone"], "worktree", "add", "--detach", path, st["expected"]], capture_output=True).returncode:
            return None
        if st.get("src"):
            link_deps(st["src"], path)
    return path


def controle(repo, st):
    """Les contrôles du dépôt sur la copie de travail : {cmd, verdict, tail} (cmd : les outils et leur source)."""
    cmds, src = checks_of(repo)
    if not cmds:
        return {"verdict": "non lancés par le Bureau (aucune commande pour ce dépôt : impl.repos.<dépôt>.checks, fix.checks ou github.checks)"}
    names = ", ".join(dict.fromkeys(label(c) for c in cmds)) + ("" if src in ("github.checks", "fix.checks") else f" · {src}")
    if not st.get("src") and any("{main}" in (c if isinstance(c, str) else c.get("cmd") or "") for c in cmds):
        return {"cmd": names, "verdict": "non lancés : ton dossier local du dépôt est inconnu de Kronn (les commandes ont besoin de {main})"}
    # l'étape check a 1800 s au plus (le maximum de Kronn) : une commande lancée juste avant la fin du budget peut encore
    # durer 600 s, d'où 1100 s de budget (1700 s au pire, avec la marge du reste de l'étape)
    r = check_run(cmds, pr_files(st), st["work"], st.get("src") or "", st["base"], depart=lambda: depart(st), budget=1100, timeout=600)
    lanc = [x for x in r["sorties"] if "saute" not in x]
    if not lanc:
        return {"cmd": names, "verdict": "rien à contrôler (aucun fichier concerné)"}
    rouges = [x for x in lanc if x["code"]]
    if rouges:
        verdict = f"en échec ❌ ({len(rouges)} sur {len(lanc)})" + (" ⏱ délai dépassé" if any(x["code"] == 124 for x in rouges) else "")
    else:
        verdict = "verts ✅" + (" (déjà rouge avant les corrections, rien de nouveau)" if any(x.get("deja_la") for x in lanc) else "")
    tail = "\n\n".join(f"$ {label(x['cmd'])}\n" + ("\n".join(x["nouveau"]) if x.get("nouveau") else
                                                  "\n".join(x["sortie"].strip().splitlines()[-12:])) for x in rouges)
    return {"cmd": names, "verdict": verdict, "tail": tail[-2400:]}


def check(repo, n, run_id):
    st = load(run_id)
    if not st.get("conflict") or not checks_of(repo)[0]:
        print("Pas de contrôle : " + ("aucun conflit." if not st.get("conflict") else f"aucune commande pour {repo} (impl.repos, fix.checks ou github.checks)."))
        return
    st["src"] = local_checkout(repo)
    linked = link_deps(st["src"], st["work"]) if st["src"] else []
    st["linked"] = linked
    save(run_id, st)
    c = controle(repo, st)
    deps = f" ; dépendances reliées depuis {st['src']} ({len(linked)})" if st["src"] else " ; dépendances absentes (dépôt local inconnu de Kronn)"
    print(f"Contrôles ({c.get('cmd', '')}) : {c['verdict']}{deps}.\n{c.get('tail', '')}"[:2500])


def cleanup(st):
    for path in (st["work"], st["work"] + "-depart"):
        subprocess.run(["git", "-C", st["clone"], "worktree", "remove", "--force", path], capture_output=True)
        shutil.rmtree(path, ignore_errors=True)


def push(repo, n, run_id):
    st = load(run_id)
    head = run("git", "rev-parse", "HEAD", cwd=st["work"])
    if head == st["expected"]:
        cleanup(st)
        print(f"{repo}#{n} déjà à jour de {st['base']} : rien poussé.")
        return
    r = subprocess.run(["git", "push", "--no-verify", f"--force-with-lease=refs/heads/{st['branch']}:{st['expected']}",
                        "origin", f"HEAD:refs/heads/{st['branch']}"], cwd=st["work"], capture_output=True, text=True)
    if r.returncode:
        fail(5, f"Push refusé : la branche {st['branch']} a bougé depuis le début du run (rien écrasé). {r.stderr.strip()[-200:]}")
    label, ci = ci_label(repo), ""
    if label:
        subprocess.run(["gh", "pr", "edit", n, "-R", repo, "--remove-label", label], capture_output=True)
        ok = subprocess.run(["gh", "pr", "edit", n, "-R", repo, "--add-label", label], capture_output=True).returncode == 0
        ci = f" Label {label} reposé : CI relancée." if ok else f" Label {label} non reposé (relance la CI à la main)."
    cleanup(st)
    print(f"{repo}#{n} à jour de {st['base']} ({head[:8]}), poussé.{ci}")


def abort(repo, n, run_id):
    st = load(run_id)
    subprocess.run(["git", "rebase", "--abort"], cwd=st["work"], capture_output=True)
    cleanup(st)
    print(f"Rebase abandonné : rien poussé, {repo}#{n} reste en l'état.")


# ---------- corriger les commentaires d'une PR (#75, page action « bureau-fixpr ») ----------
THREADS_Q = ("query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100){nodes{"
             "id isResolved isOutdated path line comments(first:30){nodes{author{login} body createdAt}}}}}}}")


def threads(repo, n, resolved=False):
    """Fils de review non résolus de la PR (resolved : tous) : [{id, path, line, outdated, resolved, comments: [{author, body}]}]."""
    owner, name = repo.split("/", 1)
    raw = run("gh", "api", "graphql", "-f", "query=" + THREADS_Q, "-F", "o=" + owner, "-F", "r=" + name, "-F", "n=" + n)
    nodes = (((json.loads(raw).get("data") or {}).get("repository") or {}).get("pullRequest") or {}).get("reviewThreads", {}).get("nodes") or []
    return [{"id": t["id"], "path": t.get("path"), "line": t.get("line"), "outdated": t.get("isOutdated"), "resolved": bool(t.get("isResolved")),
             "comments": [{"author": (c.get("author") or {}).get("login"), "body": c.get("body")} for c in (t.get("comments") or {}).get("nodes") or []]}
            for t in nodes if resolved or not t.get("isResolved")]


VERSION_MARK = re.compile(r"<!-- bureau-fix:version=(\d+) -->")
VERSION_HEAD = re.compile(r"^\W*Version\s+(\d+)\b", re.I)


def version_of(st, ts):
    """Numéro de cette passe de corrections (passe n : Version n) : la dernière version comptée dans la description de
    la PR (bloc bureau-fix), ou le plus grand « Version N » en tête d'une réponse ou d'un commentaire déjà posté (passes
    faites à la main, au même format), plus un."""
    seen = [int(v) for v in VERSION_MARK.findall(st.get("body") or "")]
    texts = list(st.get("comments") or []) + [c.get("body") or "" for t in ts for c in t["comments"]]
    seen += [int(m.group(1)) for m in (VERSION_HEAD.match(str(x).strip()) for x in texts) if m]
    return max(seen, default=0) + 1


def fix_prepare(repo, n, run_id):
    """Les fils non résolus (aucun : code 9, renvoi vers la fin), le dossier de travail et ses dépendances, le contexte de l'agent."""
    tous = threads(repo, n, resolved=True)
    ts = [t for t in tous if not t["resolved"]]
    if not ts:
        fail(9, f"{repo}#{n} : aucun fil de review non résolu, rien à corriger.")
    st = setup(repo, n, run_id)
    src = st["src"] = local_checkout(repo)
    st["linked"] = link_deps(src, st["work"]) if src else []
    st["version"] = version_of(st, tous)
    for k in ("body", "comments"):
        st.pop(k, None)
    st["threads"] = [t["id"] for t in ts]
    # le Kanban du 3e étage (retours_snapshot.py) : chaque fil en bref, gardé après le dossier de travail
    st["fils"] = [{"id": t["id"], "path": t.get("path"), "line": t.get("line"), "who": (t["comments"][0] if t["comments"] else {}).get("author"),
                   "text": str((t["comments"][0] if t["comments"] else {}).get("body") or "").strip()[:160]} for t in ts]
    save(run_id, st)
    write_json(os.path.join(st["work"], ".bureau-fix.json"), ts)
    deps = f"dépendances reliées depuis {src}" if src else "sans dépendances (dossier local du dépôt inconnu de Kronn)"
    print(f"{repo}#{n} : {st['title']}\n{len(ts)} fil(s) de review non résolu(s), branche {st['branch']} ; {deps}.\n"
          f"Passe de corrections : Version {st['version']}.")


def fix_check(repo, n, run_id):
    """Après l'agent : les contrôles du dépôt sur la PR corrigée ; verdict gardé pour la validation et la PR."""
    st = load(run_id)
    st["check"] = controle(repo, st)
    save(run_id, st)
    c = st["check"]
    print(f"Contrôles ({c['cmd']}) : {c['verdict']}.\n{c.get('tail', '')}"[:2500] if c.get("cmd") else f"Pas de contrôle : {c['verdict']}.")


def check_line(st):
    c = st.get("check") or {}
    if not c:
        return ""
    return f"🧪 **Contrôles du Bureau** : {c['verdict']}" + (f" (`{c['cmd']}`)" if c.get("cmd") else "")


def versioned(st, reply):
    """La réponse postée, avec « **Version N** » en tête (la passe de corrections, voir version_of)."""
    reply = str(reply).strip()
    return f"**Version {st['version']}**\n\n{reply}" if st.get("version") else reply


def replies(st):
    try:
        out = read_json(os.path.join(st["work"], ".bureau-fix-replies.json"))
    except (OSError, ValueError):
        return []
    return [r for r in out if isinstance(r, dict) and r.get("thread") in st.get("threads", []) and str(r.get("reply") or "").strip()]


def staged(st):
    """Tout ce que l'agent a changé, sans les liens de dépendances ni les fichiers d'échange : la liste des fichiers."""
    work = st["work"]
    run("git", "add", "-A", cwd=work)
    for rel in st.get("linked") or []:
        subprocess.run(["git", "reset", "-q", "--", rel], cwd=work, capture_output=True)
    return run("git", "diff", "--cached", "--name-only", cwd=work).splitlines()


def fix_diff(repo, n, run_id):
    """Ce que la validation montre : fichiers changés, diff tronqué, réponse prévue à chaque fil ; rien du tout : code 9."""
    st = load(run_id)
    files, rs = staged(st), replies(st)
    by = {r["thread"]: r["reply"] for r in rs}
    st["cols"] = {t: fil_col(by.get(t)) for t in st.get("threads", [])}  # la colonne de chaque fil, pour le Kanban du 3e étage
    save(run_id, st)
    if not files and not rs:
        cleanup(st)
        fail(9, "L'agent n'a rien changé ni rien répondu : rien à pousser.")
    diff = run("git", "diff", "--cached", "--stat", cwd=st["work"]) + "\n\n" + run("git", "diff", "--cached", "-U2", cwd=st["work"])
    try:
        with open(os.path.join(st["work"], ".bureau-fix-summary.md"), encoding="utf-8") as f:
            summary = f.read().strip()[:1200]
    except OSError:
        summary = ""
    c = st.get("check") or {}
    head = check_line(st) + (f"\n```\n{c['tail'][-800:]}\n```" if c.get("tail") and not c["verdict"].startswith("verts") else "")
    msg = commit_message(st)
    lines = [f"- {'résolu' if r.get('fixed') else 'laissé ouvert'} : {str(r['reply']).strip()[:300]}" for r in rs]
    ver = f"🔢 **Version {st['version']}** : en tête de chaque réponse, passe n° {st['version']} de corrections sur cette PR\n\n" if st.get("version") else ""
    print((head + "\n\n" if head else "") + ver + (summary + "\n\n" if summary else "")
          + (f"**Commit** : `{msg.splitlines()[0]}`\n\n" if files else "")
          + f"**{len(files)} fichier(s) changé(s)**\n```\n{diff[:5000]}\n```\n\n"
          + f"**Réponses prévues ({len(rs)} sur {len(st.get('threads', []))} fils)**\n" + "\n".join(lines))


def commit_message(st):
    """Message de commit écrit par l'agent (.bureau-fix-commit.txt, conventions du dépôt), sinon un message par défaut."""
    try:
        with open(os.path.join(st["work"], ".bureau-fix-commit.txt"), encoding="utf-8") as f:
            msg = f.read().strip()
    except OSError:
        msg = ""
    lines = msg.splitlines()
    if not lines or not lines[0].strip():
        return f"fix: retours de review de #{st['pr']}"
    return "\n".join([lines[0].strip()[:100]] + lines[1:])[:4000]


START, END = "<!-- bureau-fix:start -->", "<!-- bureau-fix:end -->"
OLD = ("<!-- kronn-fix:start -->", "<!-- kronn-fix:end -->")  # bloc de l'ancien workflow « Fix comments on Review »


def pr_body(body, st, rs, sha):
    """Description de la PR avec le bloc « Corrections de review » à jour : l'ancien bloc (le sien ou celui de l'ancien
    workflow) retiré, puis reposé en fin ; rejouable sans empiler."""
    for a, b in ((START, END), OLD):
        body = re.sub(re.escape(a) + ".*?" + re.escape(b), "", body or "", flags=re.S)
    try:
        with open(os.path.join(st["work"], ".bureau-fix-summary.md"), encoding="utf-8") as f:
            summary = f.read().strip()[:1500]
    except OSError:
        summary = ""
    fixed = sum(1 for r in rs if r.get("fixed"))
    lines = [f"- ✅ {fixed} fil(s) corrigé(s) et résolu(s) · ⏭️ {len(rs) - fixed} laissé(s) ouvert(s) avec une réponse"]
    if sha:
        lines.append(f"- 📦 Commit {sha}")
    if check_line(st):
        lines.append("- " + check_line(st))
    ver = f" · Version {st['version']}" if st.get("version") else ""
    mark = f"<!-- bureau-fix:version={st['version']} -->\n" if st.get("version") else ""  # compteur des passes (version_of)
    blk = (START + "\n" + mark + "---\n### 🤖 Corrections de review" + ver + "\n\n" + (summary + "\n\n" if summary else "")
           + "\n".join(lines) + "\n" + END)
    body = body.rstrip()
    return (body + "\n\n" + blk) if body else blk


REPLY_Q = "mutation($t:ID!,$b:String!){addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$t,body:$b}){comment{id}}}"
RESOLVE_Q = "mutation($t:ID!){resolveReviewThread(input:{threadId:$t}){thread{isResolved}}}"


def fix_push(repo, n, run_id):
    """Validé : commit des corrections, push protégé, une réponse dans chaque fil (résolu s'il est corrigé), CI relancée."""
    st = load(run_id)
    work, files = st["work"], staged(st)
    pushed = ""
    if files:
        msg = os.path.join(HOME, "runs", re.sub(r"[^\w-]", "", run_id) + ".msg")
        with open(msg, "w", encoding="utf-8") as f:
            f.write(commit_message(st) + "\n")
        run("git", "commit", "--no-verify", "--signoff", "-F", msg, cwd=work)  # signé (DCO) avec ton identité git
        os.remove(msg)
        r = subprocess.run(["git", "push", "--no-verify", f"--force-with-lease=refs/heads/{st['branch']}:{st['expected']}",
                            "origin", f"HEAD:refs/heads/{st['branch']}"], cwd=work, capture_output=True, text=True)
        if r.returncode:
            fail(5, f"Push refusé : la branche {st['branch']} a bougé depuis le début du run (rien écrasé). {r.stderr.strip()[-200:]}")
        pushed = f"{len(files)} fichier(s) poussé(s) ({run('git', 'rev-parse', '--short', 'HEAD', cwd=work)}). "
    done, failed, rs = 0, 0, replies(st)
    for r in rs:
        ok = subprocess.run(["gh", "api", "graphql", "-f", "query=" + REPLY_Q, "-F", "t=" + r["thread"], "-f", "b=" + versioned(st, r["reply"])[:4000]],
                            capture_output=True).returncode == 0
        if ok and r.get("fixed"):
            subprocess.run(["gh", "api", "graphql", "-f", "query=" + RESOLVE_Q, "-F", "t=" + r["thread"]], capture_output=True)
        done, failed = done + ok, failed + (not ok)
    label, ci = ci_label(repo), ""
    if label and files:
        subprocess.run(["gh", "pr", "edit", n, "-R", repo, "--remove-label", label], capture_output=True)
        ok = subprocess.run(["gh", "pr", "edit", n, "-R", repo, "--add-label", label], capture_output=True).returncode == 0
        ci = f" Label {label} reposé : CI relancée." if ok else f" Label {label} non reposé (relance la CI à la main)."
    desc = ""
    if files or done:  # bloc « Corrections de review » de la description, best-effort
        try:
            body = json.loads(run("gh", "pr", "view", n, "-R", repo, "--json", "body")).get("body") or ""
            sha = run("git", "rev-parse", "--short", "HEAD", cwd=work) if files else ""
            run("gh", "pr", "edit", n, "-R", repo, "--body", pr_body(body, st, rs, sha))
            desc = " Description de la PR mise à jour."
        except (RuntimeError, ValueError):
            desc = " Description de la PR non mise à jour."
    cleanup(st)
    print(f"{repo}#{n} : {pushed}{done} réponse(s) postée(s){f', {failed} en échec' if failed else ''}.{desc}{ci}")


def done(repo, n, run_id):
    st = load(run_id)
    print(f"Fin : {repo}#{n} ({st['branch']}) remise à jour de {st['base']}, sans conflit.")


def end(repo, n, run_id):
    print(f"Fin : {repo}#{n}, rien de plus à faire.")


STEPS = {"end": end, "prepare": prepare, "rebase": rebase, "verify": verify, "check": check, "push": push, "done": done, "abort": abort,
         "fix_prepare": fix_prepare, "fix_check": fix_check, "fix_diff": fix_diff, "fix_push": fix_push}

if __name__ == "__main__":
    step, repo, n, run_id = (sys.argv[1:] + [""] * 4)[:4]
    if step not in STEPS:
        fail(2, f"Étape inconnue : « {step} ».")
    try:
        STEPS[step](repo.strip(), n.strip().lstrip("#"), run_id.strip())
    except (RuntimeError, subprocess.TimeoutExpired) as e:
        fail(1, str(e))
