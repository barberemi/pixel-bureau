"""Rejeu d'un ticket déjà en prod : la chaîne d'implémentation refait un ticket dont la PR est mergée, depuis le commit
d'avant la PR, en essai et sans gate (modèle impl_rejeu, dérivé d'impl_chain au rendu), puis son travail est comparé à
la vraie PR. Une sous-commande par étape Exec, 0 token.

  lance <jeu> <cas>   # lanceur (modèle rejeu) : jeu temoin|rotation ; cas = n° de PR ou clé de ticket (facultatif).
                      # Choisit la PR, le commit de départ (premier parent du merge), pose impl_rejeu dans le projet du dépôt
  note <run>          # dans le run d'impl_rejeu, après les contrôles : fichiers touchés, tests de la vraie PR lancés sur le
                      # code de la chaîne, ressemblance des lignes ; sort les deux diffs pour le juge
  range <run>         # stdin : l'avis du juge ; note sur 100, historique (rejeu.dossier, ~/.local/share/pixel-bureau/rejeu)

Réglage rejeu (pack ou config) : depot (owner/dépôt, sinon le premier de impl.repos), temoin (n° de PR du jeu témoin, jamais
source de leçons), lignes ([min, max] ajoutées + retirées), fichiers (au plus), exclus (motif des titres écartés), pause_jours
(une PR de la rotation ne revient pas avant), dossier.
"""
import collections, datetime, json, os, re, subprocess, sys, time
from _lib import CFG, get, read_json, send, write_json, write_text
from _checks import check_fill
from _chaine import dossier, etat, git, git_ok, impl, lie_deps, main_dir, parse, read_stdin, reglages, root, sorte  # noqa: F401  (recopié au rendu)

KEY = re.compile(r"\b([A-Z][A-Z0-9]+-\d+)\b")
# titres écartés de la rotation : faits par la chaîne elle-même (#autocode), dépendances, CI, traductions seules
TITRES_EXCLUS = r"(?i)#autocode|\((deps|ci|wording)\)|^\s*(ci|chore|docs|build)\b|translation"
DOSSIERS_VAGUES = {"application", "apps", "src", "assets", "ts", "js", "services", "lib", "app"}
BUDGET = 1500  # secondes de tests dans la note (l'étape Exec en a 1800 au plus dans Kronn)
POIDS = {"tests": 0.5, "fichiers": 0.2, "lignes": 0.1, "juge": 0.2}  # la note : les tests d'abord (le comportement)
CIBLE = 80


def conf():
    return CFG.get("rejeu") or {}


def depot():
    return conf().get("depot") or next(iter(impl().get("repos") or {}), "")


def store(*p):
    d = os.path.expanduser(conf().get("dossier") or "~/.local/share/pixel-bureau/rejeu")
    os.makedirs(os.path.join(d, *p[:-1]) if len(p) > 1 else d, exist_ok=True)
    return os.path.join(d, *p)


def lit(path, default=None):
    try:
        return read_json(path)
    except (OSError, ValueError):
        return default


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def gh_json(*args):
    r = subprocess.run(["gh", *args], capture_output=True, text=True, timeout=120)
    if r.returncode:
        raise RuntimeError("gh " + " ".join(args[:3]) + " : " + (r.stderr or r.stdout).strip()[:300])
    return json.loads(r.stdout or "null")


def genre(titre):
    m = re.match(r"\s*([A-Za-z]+)", titre or "")
    return m.group(1).lower() if m else "autre"


def zone(paths):
    """Coin du code d'une PR : les deux premiers dossiers parlants de son premier fichier de code."""
    code = [p for p in paths if sorte(p) == "code"] or list(paths)
    if not code:
        return "?"
    parts = [x for x in code[0].split("/")[:-1] if x.lower() not in DOSSIERS_VAGUES]
    return "/".join(parts[:2]) or "racine"


# ---------- lance ----------
def eligible(pr, temoin):
    files = [f["path"] for f in pr.get("files") or []]
    lo, hi = (conf().get("lignes") or [20, 600])[:2]
    sortes = {sorte(f) for f in files}
    return (KEY.search(f"{pr.get('title')} {pr.get('headRefName')}") and not re.search(conf().get("exclus") or TITRES_EXCLUS, pr.get("title") or "")
            and lo <= (pr.get("additions") or 0) + (pr.get("deletions") or 0) <= hi
            and len(files) <= int(conf().get("fichiers") or 30) and {"tests", "code"} <= sortes and pr["number"] not in temoin)


def choisit(repo, jeu, joues):
    """Le témoin le moins récemment joué ; sinon, en rotation, une PR jamais jouée depuis pause_jours, du genre (fix, feat…)
    puis du coin du code les moins joués, la plus récente à égalité."""
    temoin = [int(x) for x in conf().get("temoin") or []]
    if jeu == "temoin":
        if not temoin:
            sys.exit("Aucun jeu témoin réglé (rejeu.temoin : les n° de PR, dans le pack ou la config).")
        return min(temoin, key=lambda n: (joues.get(str(n)) or {}).get("at") or "")
    prs = gh_json("pr", "list", "-R", repo, "--state", "merged", "--limit", "200", "--json",
                  "number,title,headRefName,additions,deletions,files,mergedAt")
    pause = datetime.timedelta(days=int(conf().get("pause_jours") or 60))
    limite = (datetime.datetime.now(datetime.timezone.utc) - pause).isoformat()
    pris = demandees(joues)
    ok = [p for p in prs if eligible(p, temoin) and (joues.get(str(p["number"])) or {}).get("at", "") < limite and p["number"] not in pris]
    if not ok:
        sys.exit(f"Aucune PR de {repo} ne passe les filtres du rejeu (taille, tests, déjà jouée) parmi les 200 dernières mergées.")
    par_genre = collections.Counter(v.get("genre") for v in joues.values())
    par_zone = collections.Counter(v.get("zone") for v in joues.values())
    ok.sort(key=lambda p: p.get("mergedAt") or "", reverse=True)
    return min(ok, key=lambda p: (par_genre[genre(p["title"])], par_zone[zone([f["path"] for f in p["files"]])]))["number"]


def demandees(joues):
    """N° des PR demandées depuis moins d'un jour et pas encore notées : un rejeu en cours ou en file (joues.json ne
    s'écrit qu'à la fin du run, la rotation reprendrait la même PR)."""
    veille = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1)).isoformat()
    out = set()
    for f in os.listdir(store("demandes")) if os.path.isdir(store("demandes")) else []:
        d = lit(store("demandes", f)) or {}
        if d.get("pr") and (d.get("lance_le") or "") > max(veille, (joues.get(str(d["pr"])) or {}).get("at") or ""):
            out.add(d["pr"])
    return out


def pr_de(repo, cas):
    cas = (cas or "").strip().lstrip("#")
    if cas.isdigit():
        return int(cas)
    m = KEY.fullmatch(cas.upper())
    if not m:
        sys.exit(f"Cas inconnu : {cas!r} (un n° de PR mergée ou une clé de ticket).")
    prs = gh_json("pr", "list", "-R", repo, "--state", "merged", "--search", m.group(1), "--json", "number,title,headRefName")
    hit = [p for p in prs or [] if m.group(1) in f"{p.get('title')} {p.get('headRefName')}".upper()]
    if not hit:
        sys.exit(f"Aucune PR mergée de {repo} ne porte {m.group(1)}.")
    return hit[0]["number"]


def project_for(repo):
    want = repo.lower()
    for p in get("/projects") or []:
        m = re.search(r"github\.com[:/]([\w.-]+/[\w.-]+?)(?:\.git)?/?$", str(p.get("repo_url") or ""))
        if m and m.group(1).lower() == want:
            return p["id"]
    return None


def en_cours(wf, ticket, pr):
    """Un run d'impl_rejeu actif sur ce ticket, ou sa PR déjà demandée et pas encore notée (run en file, pas encore
    préparé) : on ne relance pas. Les autres tickets passent, en file derrière (concurrency_limit 1)."""
    if pr in demandees(lit(store("joues.json"), {})):
        return "en file"
    for r in get(f"/workflows/{wf}/runs?limit=20") or []:
        if r.get("status") not in ("Running", "WaitingApproval", "Pending", "WaitingQuota"):
            continue
        steps = (get(f"/workflows/{wf}/runs/{r['id']}") or {}).get("step_results") or []
        prep = next((x.get("output") or "" for x in steps if x.get("step_name") == "prepare"), "")
        if prep and ticket.lower() in prep.lower():
            return r["id"]
    return None


def cmd_lance(jeu="", cas=""):
    repo = depot()
    if not repo:
        sys.exit("Aucun dépôt pour le rejeu (rejeu.depot, ou un dépôt dans impl.repos).")
    wf = (CFG.get("models") or {}).get("impl_rejeu")
    if not wf:
        sys.exit("Le rejeu n'est pas installé (models.impl_rejeu) : python3 tools/upgrade.py l'ajoute avec la chaîne.")
    jeu = "temoin" if (jeu or "").strip().lower() in ("temoin", "témoin") else "rotation"
    joues = lit(store("joues.json"), {})
    n = pr_de(repo, cas) if (cas or "").strip() else choisit(repo, jeu, joues)
    pr = gh_json("pr", "view", str(n), "-R", repo, "--json", "number,title,state,headRefName,mergeCommit,mergedAt,files,url")
    if pr.get("state") != "MERGED" or not (pr.get("mergeCommit") or {}).get("oid"):
        sys.exit(f"{repo}#{n} n'est pas mergée : rien à rejouer.")
    m = KEY.search(f"{pr['title']} {pr.get('headRefName')}")
    if not m:
        sys.exit(f"{repo}#{n} ne cite aucun ticket Jira (titre, branche) : la chaîne part d'un ticket.")
    ticket, merge = m.group(1), pr["mergeCommit"]["oid"]
    base = gh_json("api", f"repos/{repo}/commits/{merge}", "--jq", "[.parents[0].sha]")[0]
    busy = en_cours(wf, ticket, n)
    if busy:
        sys.exit(f"Un rejeu tourne déjà ({busy[:8]}) sur {ticket} ou n'est pas encore préparé : réessaie plus tard.")
    pid = project_for(repo)
    if not pid:
        sys.exit(f"Aucun projet Kronn n'a {repo} pour origine : ajoute-le dans Kronn (Projets), puis relance.")
    files = [f["path"] for f in pr.get("files") or []]
    write_json(store("demandes", f"{ticket}.json"), {"ticket": ticket, "repo": repo, "pr": n, "titre": pr["title"], "url": pr.get("url"),
                                                     "merge": merge, "base": base, "jeu": jeu, "genre": genre(pr["title"]),
                                                     "zone": zone(files), "lance_le": now()})
    res = send("POST", "/mcp/workflow-trigger", {"workflow_id": wf, "project_id": pid, "variables": {
        "ticket": ticket, "mode": "essai", "depot": repo, "soeurs": "", "partie": "", "reprise": "non", "base": base}}, timeout=120)
    run = str((res or {}).get("run_id") or "")
    if not run:
        os.remove(store("demandes", f"{ticket}.json"))  # pas de run : la demande ne bloque ni ce ticket ni la rotation
        sys.exit(f"Kronn n'a pas lancé le rejeu de {repo}#{n} : {res}")
    print(f"Rejeu de {repo}#{n} ({ticket}, {'jeu témoin' if jeu == 'temoin' else 'rotation'}) : run {run[:8]}, départ {base[:10]}, "
          f"sans gate ni effet ; la note tombe à la fin du run.\n{pr['title']}")


# ---------- note ----------
def diff_lignes(a, b, paths):
    """Lignes ajoutées et retirées (signe compris), sans les blancs ni les lignes de ponctuation seule."""
    if not paths:
        return collections.Counter()
    out = git("diff", "-U0", "--no-color", a, b, "--", *paths)
    c = collections.Counter()
    for ln in out.splitlines():
        if ln[:1] in "+-" and not ln.startswith(("+++", "---")):
            t = " ".join(ln[1:].split())
            if len(t) > 2 and re.search(r"\w", t):
                c[ln[0] + t] += 1
    return c


def touches(a, b):
    out = git("diff", "--name-status", "--no-renames", a, b, "--", ".", ":(exclude).kronn")
    return {ln.split("\t")[-1]: ln[:1] for ln in out.splitlines() if "\t" in ln}


def commandes(files, wt):
    """Les commandes de test du dépôt (impl.repos.<dépôt>.checks.tests) qui prennent ces fichiers, remplies pour wt."""
    for ch in (reglages().get("checks") or {}).get("tests") or []:
        raw = ch if isinstance(ch, str) else ch.get("cmd") or ""
        cmd, kinds = check_fill(ch, files, wt, main_dir(), etat().get("base") or "main")
        need = [k for k in kinds if "{" + k + "}" in raw]
        if kinds["files"] and not (need and not any(kinds[k] for k in need)):
            yield cmd


def lance_tests(files, fin, wt=None):
    """Les commandes de test sur ces fichiers dans wt (la copie du run par défaut), avant l'heure fin : (code, sortie) ;
    None si aucune ne les prend."""
    wt, outs, code = wt or root(), [], 0
    for cmd in commandes(files, wt):
        try:
            r = subprocess.run(["sh", "-c", cmd], cwd=wt, capture_output=True, text=True, timeout=max(30, fin - time.time()))
            rc, txt = r.returncode, r.stdout + r.stderr
        except subprocess.TimeoutExpired:
            rc, txt = 124, "délai dépassé"
        outs.append(re.sub(r"\x1b\[[0-9;]*m", "", txt))
        code = code or rc
    return None if not outs else (code, "\n".join(outs))


def echecs(txt):
    keep = [x for x in (txt or "").splitlines() if re.search(r"(?i)fail|error|exception|assert|expected|✗|×", x)]
    return "\n".join(keep[:30])[:2500]


def rouges_partout(merge, rouges, fin):
    """Contre-épreuve : les fichiers rouges lancés sur la vraie PR (son merge, dans une copie à part, mêmes dépendances et
    mêmes commandes). Rouges là aussi : l'environnement de test est en cause, pas la chaîne. Rend ces fichiers."""
    ref = dossier("reference")
    if time.time() > fin - 60 or not git_ok("worktree", "add", "-f", "--detach", ref, merge):
        return []
    try:
        lie_deps(ref)
        tout = lance_tests(rouges, fin, ref)
        if not tout or tout[0] == 0:
            return []
        if len(rouges) == 1:
            return list(rouges)
        return [f for f in rouges if time.time() < fin - 60 and (lambda r: bool(r and r[0]))(lance_tests([f], fin, ref))]
    finally:
        git_ok("worktree", "remove", "--force", ref)


def tests_reference(merge, files):
    """Les tests de la vraie PR posés sur le code de la chaîne, lancés, puis retirés : ratio des fichiers verts. Un fichier
    qu'aucune commande ne lance (fixture, mock, config de test, classe de base) est posé mais hors du ratio ; un fichier
    rouge aussi sur la vraie PR (contre-épreuve) en sort : c'est l'environnement."""
    if not files:
        return {"mesure": False, "pourquoi": "la vraie PR n'a pas de fichier de test"}
    gardes = {f: git_ok("cat-file", "-e", f"HEAD:{f}") for f in files}
    try:
        for f in files:
            body = subprocess.run(["git", "show", f"{merge}:{f}"], cwd=root(), capture_output=True).stdout
            os.makedirs(os.path.dirname(os.path.join(root(), f)) or root(), exist_ok=True)
            with open(os.path.join(root(), f), "wb") as h:
                h.write(body)
        lances = [f for f in files if any(commandes([f], root()))]
        support = [f for f in files if f not in lances]
        if not lances:
            return {"mesure": False, "pourquoi": "aucune commande de test réglée ne prend ces fichiers (impl.repos.<dépôt>.checks.tests)"}
        fin = time.time() + BUDGET
        tout = lance_tests(lances, fin)
        if tout[0] == 0:
            return {"mesure": True, "ratio": 1.0, "verts": lances, "rouges": [], "support": support, "environnement": [], "sortie": ""}
        verts, rouges, sortie = [], [], ""
        if len(lances) == 1:
            rouges, sortie = list(lances), f"### {lances[0]}\n{echecs(tout[1])}\n"
        for i, f in enumerate(lances if len(lances) > 1 else []):  # rouge : fichier par fichier, pour le ratio, tant qu'il reste du temps
            if time.time() > fin - 60:
                rouges += lances[i:]  # pas relancés : comptés rouges, la suite entière l'était
                sortie += f"(pas relancés faute de temps : {', '.join(lances[i:])})\n"
                break
            r = lance_tests([f], fin)
            (verts if r and r[0] == 0 else rouges).append(f)
            if r and r[0]:
                sortie += f"### {f}\n{echecs(r[1])}\n"
        env = rouges_partout(merge, rouges, fin)
        mesures = [f for f in lances if f not in env]
        if env:
            sortie += f"(rouges aussi sur la vraie PR, environnement : {', '.join(env)})\n"
        if not mesures:
            return {"mesure": False, "pourquoi": "les tests de la vraie PR sont rouges sur la vraie PR aussi : environnement de test",
                    "support": support, "environnement": env, "sortie": sortie[:6000]}
        return {"mesure": True, "ratio": round(len(verts) / len(mesures), 2), "verts": verts, "rouges": [f for f in rouges if f not in env],
                "support": support, "environnement": env, "sortie": sortie[:6000] or echecs(tout[1])}
    finally:
        for f, avant in gardes.items():
            if avant:
                git("checkout", "HEAD", "--", f)
            elif os.path.exists(os.path.join(root(), f)):
                os.remove(os.path.join(root(), f))


def demande():
    e = etat()
    d = lit(store("demandes", f"{e.get('ticket')}.json"))
    if not d or not e.get("depart") or d.get("base") != e["depart"]:
        sys.exit(f"Pas de demande de rejeu pour {e.get('ticket')} depuis {str(e.get('depart'))[:10]} : lance le rejeu par le "
                 "modèle « rejeu », pas impl_rejeu à la main.")
    return d


def cmd_note(run=""):
    e, d = etat(), demande()
    depart, merge = e["depart"], d["merge"]
    if not git_ok("cat-file", "-e", merge + "^{commit}"):
        git("fetch", "origin", merge, check=True)
    ref, mien = touches(depart, merge), touches(depart, "HEAD")
    code_r = {f for f in ref if sorte(f) == "code"} or {f for f in ref if sorte(f) != "doc"}
    code_m = {f for f in mien if sorte(f) == "code"} or {f for f in mien if sorte(f) != "doc"}
    commun = code_r & code_m
    rappel = len(commun) / len(code_r) if code_r else 0.0
    precision = len(commun) / len(code_m) if code_m else 0.0
    f1 = 2 * rappel * precision / (rappel + precision) if rappel + precision else 0.0
    lr, lm = diff_lignes(depart, merge, sorted(code_r)), diff_lignes(depart, "HEAD", sorted(code_m))
    lignes = 2 * sum((lr & lm).values()) / (sum(lr.values()) + sum(lm.values())) if lr or lm else 0.0
    tests = tests_reference(merge, sorted(f for f, s in ref.items() if sorte(f) == "tests" and s != "D"))
    note = {"ticket": e["ticket"], "run": run, "pr": d["pr"], "repo": d["repo"], "merge": merge, "depart": depart,
            "fichiers": {"score": round(f1, 2), "rappel": round(rappel, 2), "precision": round(precision, 2),
                         "manques": sorted(code_r - code_m), "en_plus": sorted(code_m - code_r), "communs": sorted(commun)},
            "lignes": {"score": round(lignes, 2), "reference": sum(lr.values()), "chaine": sum(lm.values())},
            "tests": tests, "escalade": bool(e.get("refus")), "tours": e.get("tours") or 0}
    write_json(dossier("rejeu_note.json"), note)
    # les diffs vont au juge par fichiers, pas par la sortie : un template Twig y met des {{ }} que Kronn lirait comme les siens
    exclu = ["--", ".", ":(exclude).kronn"]
    write_text(dossier("rejeu_reference.diff"), git("diff", "--no-color", depart, merge, *exclu))
    write_text(dossier("rejeu_chaine.diff"), git("diff", "--no-color", depart, "HEAD", *exclu))
    write_text(dossier("rejeu_tests.txt"), tests.get("sortie") or "aucun échec")
    pct = lambda v: f"{round(100 * v)} %"
    out = (f"# Rejeu de {d['repo']}#{d['pr']} ({e['ticket']}) : {d.get('titre')}\n\n"
           f"Fichiers de code : rappel {pct(rappel)}, précision {pct(precision)} ; manquent {', '.join(note['fichiers']['manques']) or 'aucun'} ; "
           f"en plus {', '.join(note['fichiers']['en_plus']) or 'aucun'}.\n"
           f"Lignes communes : {pct(lignes)} ({sum(lr.values())} dans la vraie PR, {sum(lm.values())} dans la chaîne).\n"
           + (f"Tests de la vraie PR sur le code de la chaîne : {pct(tests['ratio'])} des fichiers verts ; rouges : "
              f"{', '.join(tests['rouges']) or 'aucun'}.\n" if tests.get("mesure") else f"Tests non mesurés : {tests.get('pourquoi')}.\n")
           + (f"Rouges aussi sur la vraie PR (environnement, hors note) : {', '.join(tests['environnement'])}.\n" if tests.get("environnement") else "")
           + (f"Posés sans être lancés (aucune commande ne les prend) : {', '.join(tests['support'])}.\n" if tests.get("support") else "")
           + ("La chaîne s'est arrêtée sur une escalade (bloquants restants).\n" if note["escalade"] else ""))
    print(out.replace("{" + "{", "{ {"))


# ---------- range ----------
def cmd_range(run=""):
    j = parse(read_stdin()) or {}
    n = lit(dossier("rejeu_note.json")) or sys.exit("Pas de note (étape note) : rien à ranger.")
    d = lit(store("demandes", f"{n['ticket']}.json")) or {}
    juge = j.get("score") if isinstance(j.get("score"), (int, float)) else None
    parts = {"tests": n["tests"].get("ratio") if n["tests"].get("mesure") else None, "fichiers": n["fichiers"]["score"],
             "lignes": n["lignes"]["score"], "juge": max(0, min(100, juge)) / 100 if juge is not None else None}
    pris = {k: v for k, v in parts.items() if v is not None}
    total = round(100 * sum(POIDS[k] * v for k, v in pris.items()) / sum(POIDS[k] for k in pris))
    bilan = lit(os.path.expanduser(f"~/.local/share/pixel-bureau/historique/{n['ticket']}/{n['repo'].replace('/', '__')}/{run}.json")) or {}
    out = {**{k: d.get(k) for k in ("titre", "url", "jeu", "genre", "zone", "lance_le")}, **n, "run": run, "fini_le": now(),
           "parts": parts, "note_sur_100": total, "atteint": total >= CIBLE, "version": bilan.get("version"),
           "juge": {k: j.get(k) for k in ("resume", "approche", "ecarts", "echecs_tests") if k in j}}
    write_json(store(n["ticket"], f"{run or 'run'}.json"), out)
    joues = lit(store("joues.json"), {})
    joues[str(n["pr"])] = {"at": out["fini_le"], "run": run, "ticket": n["ticket"], "genre": d.get("genre"), "zone": d.get("zone"),
                           "note": total, "jeu": d.get("jeu")}
    write_json(store("joues.json"), joues)
    pct = lambda v: "non mesuré" if v is None else f"{round(100 * v)} %"
    print(f"{'Tout se déroule comme je l’avais prévu.' if out['atteint'] else 'Je sens un grand trouble.'} "
          f"Rejeu de {n['repo']}#{n['pr']} ({n['ticket']}) : {total}/100 (cible {CIBLE}).\n"
          f"- tests de la vraie PR : {pct(parts['tests'])}\n- fichiers touchés : {pct(parts['fichiers'])}\n"
          f"- lignes communes : {pct(parts['lignes'])}\n- juge : {pct(parts['juge'])}"
          + (f"\n\n{j['resume']}" if j.get("resume") else ""))


if __name__ == "__main__":
    cmd, args = (sys.argv[1] if len(sys.argv) > 1 else ""), sys.argv[2:]
    fn = {"lance": cmd_lance, "note": cmd_note, "range": cmd_range}.get(cmd)
    if not fn:
        sys.exit(f"sous-commande inconnue : {cmd!r}")
    fn(*args)
