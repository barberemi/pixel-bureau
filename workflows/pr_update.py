"""Remettre une PR à jour de sa base (#74, page action « bureau-rebase ») : rebase sans squash, push protégé, CI relancée.

Sous-commandes (python3 pr_update.py <étape> <dépôt owner/name> <n° de PR> <id du run>) :
  prepare  PR ouverte et pas d'un fork ; copie du dépôt sous ~/.cache/pixel-bureau/pr/repos (clone partiel, gardé), puis
           un dossier de travail par run (worktree détaché sur la tête de la PR) sous ~/.cache/pixel-bureau/pr/work/<run>.
  rebase   rebase sur la base de la PR, commits gardés tels quels. Déjà à jour : rien à faire. Conflit : le rebase reste
           en cours pour l'agent qui le résout, code 3 (renvoi vers resolve).
  verify   après l'agent : plus de rebase en cours ni de marqueur de conflit (sinon code 4) ; résumé de la résolution.
  check    après un conflit seulement : la commande de contrôle du dépôt (github.checks), dépendances reliées depuis ton
           dossier local du dépôt s'il est un projet Kronn ; son résultat part dans la validation, jamais bloquant.
  push     push protégé (--force-with-lease sur la tête lue au départ), label de CI retiré puis reposé, dossier de travail
           retiré. Rien de nouveau : rien poussé.
  done     fin du chemin sans conflit (message seulement).
  abort    rebase abandonné et dossier de travail retiré : rien poussé.
Codes : 2 réglage ou PR refusés, 3 conflit (renvoi), 4 conflit non résolu, 5 push refusé, 1 autre échec.
"""
import glob, json, os, re, shutil, subprocess, sys, time
from _lib import CFG, get, read_json, write_json

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


def prepare(repo, n, run_id):
    if not re.fullmatch(r"[\w.-]+/[\w.-]+", repo) or not re.fullmatch(r"\d+", n):
        fail(2, f"PR invalide : « {repo}#{n} ».")
    try:
        pr = json.loads(run("gh", "pr", "view", n, "-R", repo, "--json",
                            "number,title,state,headRefName,headRefOid,baseRefName,isCrossRepository,url"))
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
          "expected": run("git", "rev-parse", f"origin/{pr['headRefName']}", cwd=clone), "clone": clone, "work": work}
    save(run_id, st)
    behind = run("git", "rev-list", "--count", f"HEAD..origin/{st['base']}", cwd=work)
    print(f"{repo}#{n} : {pr['title']}\nBranche {st['branch']} sur {st['base']} : {behind} commit(s) de retard. Dossier de travail : {work}")


def rebase(repo, n, run_id):
    st = load(run_id)
    work, base = st["work"], st["base"]
    if run("git", "rev-list", "--count", f"HEAD..origin/{base}", cwd=work) == "0":
        print(f"Déjà à jour de {base} : rien à faire.")
        return
    count = run("git", "rev-list", "--count", f"origin/{base}..HEAD", cwd=work)
    env = dict(os.environ, GIT_EDITOR="true", GIT_COMMITTER_NAME=run("git", "log", "-1", "--format=%cn", cwd=work),
               GIT_COMMITTER_EMAIL=run("git", "log", "-1", "--format=%ce", cwd=work))
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


def check(repo, n, run_id):
    st = load(run_id)
    cmd = (GH.get("checks") or {}).get(repo)
    if not st.get("conflict") or not cmd:
        print("Pas de contrôle : " + ("aucun conflit." if not st.get("conflict") else f"aucune commande pour {repo} (github.checks)."))
        return
    src = local_checkout(repo)
    linked = link_deps(src, st["work"]) if src else []
    try:
        r = subprocess.run(cmd, shell=True, cwd=st["work"], capture_output=True, text=True, timeout=900)
        tail = "\n".join((r.stdout + r.stderr).strip().splitlines()[-12:])
        verdict = "verts ✅" if r.returncode == 0 else f"en échec ❌ (code {r.returncode})"
    except subprocess.TimeoutExpired:
        tail, verdict = "", "trop longs (15 min) ⏱"
    deps = f" ; dépendances reliées depuis {src} ({len(linked)})" if src else " ; dépendances absentes (dépôt local inconnu de Kronn)"
    print(f"Contrôle « {cmd} » : {verdict}{deps}.\n{tail}"[:2500])


def cleanup(st):
    subprocess.run(["git", "-C", st["clone"], "worktree", "remove", "--force", st["work"]], capture_output=True)
    shutil.rmtree(st["work"], ignore_errors=True)


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


def done(repo, n, run_id):
    st = load(run_id)
    print(f"Fin : {repo}#{n} ({st['branch']}) remise à jour de {st['base']}, sans conflit.")


STEPS = {"prepare": prepare, "rebase": rebase, "verify": verify, "check": check, "push": push, "done": done, "abort": abort}

if __name__ == "__main__":
    step, repo, n, run_id = (sys.argv[1:] + [""] * 4)[:4]
    if step not in STEPS:
        fail(2, f"Étape inconnue : « {step} ».")
    try:
        STEPS[step](repo.strip(), n.strip().lstrip("#"), run_id.strip())
    except (RuntimeError, subprocess.TimeoutExpired) as e:
        fail(1, str(e))
