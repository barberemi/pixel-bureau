"""Implémenter un ticket en chaîne de postes (#76, #125) : une sous-commande par étape Exec des modèles impl_*.json, 0 token.

Le dossier du ticket vit dans la copie de travail du run, `.kronn/chaine/` (ignoré par git) : chaque poste (un
sous-workflow, qui partage la copie de son parent) y lit ce qu'ont écrit les précédents et y dépose son rapport.

  lance <ticket> <mode> <dépôt>     # lanceur : stdin ticket Jira ; projet Kronn déduit du composant, lance la chaîne
  prepare <ticket> <mode> <run>     # stdin ticket Jira : dossier, réglages du dépôt, branche kronn/<ticket>
  entree <poste> <ticket> [retours] [extra]
                                    # contexte du poste ; retours d'une gate ajoutés au dossier ; code 3 : poste non concerné
  releve                            # schéma d'impact : fichiers du dépôt qui parlent du ticket (git grep), 0 token
  existe                            # stdin proposition du schéma : chemins cités qui n'existent pas
  tri <poste>                       # stdin avis du critique : code 3 = « revoir » (Goto la proposition, 3 tours au plus)
  rapport <poste>                   # stdin proposition ===SEP=== critique : rapport du poste dans le dossier
  questions                         # code 0 : questions bloquantes du cadrage sans réponse (gate), code 3 : aucune
  mode <plan|complet>               # code 0 : plan seulement (Stop), code 3 : on code
  plan [consignes] [retours]        # stdin plan de l'orchestrateur : plan.json en lots ; consignes ou retours : code 3
  lot                               # lot suivant du plan ; code 3 : plus de lot
  verif <regles|tests>              # commandes de vérification du dépôt (réglage impl.repos), en conteneur si réglé
  tri_lot                           # stdin vérif ===SEP=== relecture : code 4 = refaire le lot (3 essais), 0 = lot fini
  tri_tests                         # stdin lancement des tests : code 4 = le poste Tests reprend (3 essais)
  bilan_code                        # commits et fichiers de la branche
  quoi                              # contrôles : fichiers touchés, postes à lancer (réglages et plan)
  bilan_controles                   # rapports des postes de contrôle : bloquants et avis
  aiguillage                        # stdin décision de l'orchestrateur : 3 livrer, 4 retour au code, 0 humain
  pousse | pr | ci | env | pret | reviewers | fin     # livraison et publication (gh)

Réglage impl (pack ou config) : repos.<owner/dépôt>.{base, checks.{regles,tests}, image, signoff, reviewers, ci_label,
env_label, front}, components.<composant> = owner/dépôt, postes.<poste>.{actif, bloquant}, max_tours, max_lots.
Une commande de vérification reçoit {worktree}, {main} (dossier du projet), {files}, {php}, {ts}, {tests} (fichiers
modifiés par rapport à la base, par type).
"""
import fnmatch, hashlib, json, os, re, subprocess, sys, time
from _lib import CFG, get, read_json, send, write_json, write_text

SEP = "\n===SEP===\n"
KEY = re.compile(r"^[A-Z][A-Z0-9]+-\d+$")
POSTES = ("cadrage", "schema", "patterns", "code", "regles", "securite", "tests", "perf", "revue", "livraison")
CONTROLES = ("regles", "securite", "tests", "perf", "revue")
BLOQUANTS = {"regles", "securite", "tests"}  # par défaut ; perf et revue : avis
FRONT = ["*.scss", "*.css", "*.twig", "*.html", "*.vue", "*.tsx", "*.jsx", "*.ts", "*.js"]
MAX_OUT = 60_000  # sortie Exec sous 100 Ko


def impl():
    return CFG.get("impl") or {}


def root():
    return os.environ.get("KRONN_WORKTREE") or os.getcwd()


def dossier(*p):
    d = os.path.join(root(), ".kronn", "chaine")
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, *p)


def load(name, default=None):
    try:
        return read_json(dossier(name))
    except (OSError, ValueError):
        return default


def git(*args, check=False):
    r = subprocess.run(["git", *args], cwd=root(), capture_output=True, text=True)
    if check and r.returncode:
        raise RuntimeError("git " + " ".join(args) + " : " + (r.stderr or r.stdout).strip()[:500])
    return r.stdout.strip()


def repo_of():
    url = git("remote", "get-url", "origin")
    m = re.search(r"github\.com[:/]([\w.-]+/[\w.-]+?)(?:\.git)?$", url)
    return m.group(1) if m else ""


def reglages(repo=None):
    """Réglages du dépôt : impl.repos.<dépôt>, base main par défaut."""
    r = dict((impl().get("repos") or {}).get(repo or etat().get("repo") or repo_of()) or {})
    r.setdefault("base", "main")
    return r


def etat():
    return load("etat.json", {}) or {}


def poste_conf(p):
    return (impl().get("postes") or {}).get(p) or {}


def out(obj):
    s = obj if isinstance(obj, str) else json.dumps(obj, ensure_ascii=False, indent=1)
    sys.stdout.write(s[:MAX_OUT])


def read_stdin():
    return sys.stdin.read() if not sys.stdin.isatty() else ""


def parse(s):
    s = (s or "").strip()
    if not s or s == "null" or s.startswith("{" + "{"):  # référence Kronn restée telle quelle : pas encore produite
        return None
    try:
        return json.loads(s)
    except ValueError:
        return {"texte": s}


# ---------- ticket ----------
def ticket_md(t):
    f = t.get("fields") or {}
    lines = [f"# {t.get('key')} : {f.get('summary') or ''}", "",
             f"- Type : {(f.get('issuetype') or {}).get('name') or '?'} ; priorité : {(f.get('priority') or {}).get('name') or '?'}"
             f" ; statut : {(f.get('status') or {}).get('name') or '?'}",
             f"- Composants : {', '.join(c.get('name', '') for c in f.get('components') or []) or 'aucun'}",
             f"- Labels : {', '.join(f.get('labels') or []) or 'aucun'}", "", "## Description", "", f.get("description") or "(vide)"]
    subs = f.get("subtasks") or []
    if subs:
        lines += ["", "## Sous-tâches"] + [f"- {s.get('key')} : {(s.get('fields') or {}).get('summary')}" for s in subs]
    links = f.get("issuelinks") or []
    if links:
        lines += ["", "## Liens"]
        for ln in links:
            o = ln.get("outwardIssue") or ln.get("inwardIssue") or {}
            lines.append(f"- {(ln.get('type') or {}).get('name')} {o.get('key')} : {(o.get('fields') or {}).get('summary')}")
    comments = ((f.get("comment") or {}).get("comments") or [])[-8:]
    if comments:
        lines += ["", "## Derniers commentaires"]
        lines += [f"- {(c.get('author') or {}).get('displayName')} ({str(c.get('created'))[:10]}) : {(c.get('body') or '')[:1200]}"
                  for c in comments]
    return "\n".join(lines)


def project_for(repo):
    """Projet Kronn dont l'origine est ce dépôt GitHub."""
    want = repo.lower()
    for p in get("/projects") or []:
        m = re.search(r"github\.com[:/]([\w.-]+/[\w.-]+?)(?:\.git)?/?$", str(p.get("repo_url") or ""))
        if m and m.group(1).lower() == want:
            return p["id"]
    return None


def repo_for(t, depot):
    """Dépôt du ticket : celui donné, sinon le composant Jira (impl.components, sinon un dépôt réglé du même nom)."""
    if depot and "/" in depot:
        return depot
    comps = [c.get("name") for c in ((t.get("fields") or {}).get("components") or [])]
    mapping = impl().get("components") or {}
    known = list((impl().get("repos") or {}).keys())
    owner = ((CFG.get("github") or {}).get("repo") or "/").split("/")[0]
    for c in ([depot] if depot else []) + comps:
        if c in mapping:
            return mapping[c]
        for r in known:
            if r.split("/")[-1] == c:
                return r
        if owner and c:
            return f"{owner}/{c}"
    return ""


def cmd_lance(ticket, mode, depot):
    if not KEY.match(ticket or ""):
        sys.exit(f"Clé de ticket invalide : {ticket!r}")
    t = parse(read_stdin()) or {}
    repo = repo_for(t, (depot or "").strip())
    if not repo:
        sys.exit("Aucun dépôt : pose un composant Jira sur le ticket, ou donne le dépôt (owner/dépôt) au lancement.")
    pid = project_for(repo)
    if not pid:
        sys.exit(f"Aucun projet Kronn n'a {repo} pour origine : ajoute-le dans Kronn (Projets), puis relance.")
    chain = (CFG.get("models") or {}).get("impl_chain")
    if not chain:
        sys.exit("La chaîne n'est pas installée (models.impl_chain) : python3 tools/install.py la propose.")
    for r in get(f"/workflows/{chain}/runs?limit=50") or []:
        if r.get("status") not in ("Running", "WaitingApproval", "Pending", "WaitingQuota"):
            continue
        # les variables d'un run sont chiffrées (instantané) : le ticket se lit dans la sortie de son étape prepare
        steps = (get(f"/workflows/{chain}/runs/{r['id']}") or {}).get("step_results") or []
        prep = next((x.get("output") or "" for x in steps if x.get("step_name") == "prepare"), "")
        if f"{ticket} sur " in prep or not prep:
            sys.exit(f"{ticket} est peut-être déjà sur la chaîne (run {r['id'][:8]}, {r['status']}"
                     + (", pas encore préparé" if not prep else "") + ") : un poste de travail par ticket, réessaie plus tard.")
    # route JSON qui lance détaché : /workflows/{id}/trigger est un flux SSE qui ne répond qu'à la première pause du run
    res = send("POST", "/mcp/workflow-trigger", {"workflow_id": chain, "variables": {"ticket": ticket, "mode": mode or "plan"},
                                                 "project_id": pid}, timeout=120)
    run = (res or {}).get("run_id") or "?"
    print(f"{ticket} posé sur la chaîne ({mode or 'plan'}) : {repo}, run {str(run)[:8]}")


def cmd_prepare(ticket, mode, run):
    t = parse(read_stdin()) or {}
    repo = repo_of()
    reg = reglages(repo)
    base = reg["base"]
    git("fetch", "origin", base, check=True)
    branch = f"kronn/{ticket}"
    git("checkout", "-f", "-B", branch, f"origin/{base}", check=True)
    write_text(dossier("ticket.md"), ticket_md(t))
    docs = git("ls-files", "docs", "AGENTS.md", "CLAUDE.md", ".github/pull_request_template.md").splitlines()
    f = t.get("fields") or {}
    write_json(dossier("etat.json"), {"ticket": ticket, "mode": mode, "repo": repo, "base": base, "branch": branch,
                                      "run": run, "tours": 0, "docs": docs[:200],
                                      "texte": f"{f.get('summary') or ''}\n{f.get('description') or ''}"[:8000]})
    for f in ("retours.md", "plan.json", "lots.json", "controles.json", "orchestrateur.json"):
        if os.path.exists(dossier(f)):
            os.remove(dossier(f))
    print(f"{ticket} sur {repo} : branche {branch} depuis origin/{base}, {len(docs)} fichiers de doc, mode {mode}")


# ---------- postes ----------
def note_retours(retours, source):
    retours = (retours or "").strip()
    if not retours or retours.startswith("{" + "{"):
        return
    h = hashlib.sha1(retours.encode()).hexdigest()[:10]
    path = dossier("retours.md")
    old = open(path, encoding="utf-8").read() if os.path.exists(path) else ""
    if h in old:
        return
    write_text(path, old + f"\n## Retour humain ({source}, {time.strftime('%Y-%m-%d %H:%M')}) <!-- {h} -->\n\n{retours}\n")


def changed(base=None):
    e = etat()
    b = base or e.get("base") or "main"
    files = git("diff", "--name-only", f"origin/{b}...HEAD").splitlines()
    files += git("diff", "--name-only", "HEAD").splitlines() + git("ls-files", "--others", "--exclude-standard").splitlines()  # pas commités
    return sorted(set(f for f in files if f and not f.startswith(".kronn/")))


def actif(p, files):
    """Un poste tourne s'il n'est pas coupé (réglages), s'il est dans les postes du plan et, pour perf, si du front est touché."""
    c = poste_conf(p)
    if c.get("actif") is False:
        return False, "coupé dans les réglages"
    plan = load("plan.json") or {}
    wanted = plan.get("postes")
    bloquant = c.get("bloquant", p in BLOQUANTS)  # un poste bloquant ne s'écarte que par les réglages, jamais par le plan
    if isinstance(wanted, list) and p in CONTROLES and wanted and p not in wanted and not bloquant:
        return False, "écarté par l'orchestrateur (plan)"
    if p == "perf":
        pats = reglages().get("front") or FRONT
        if not any(fnmatch.fnmatch(f, x) for f in files for x in pats):
            return False, "aucun fichier front touché"
    return True, ""


def section(title, body):
    return f"\n\n## {title}\n\n{body.strip() if body and body.strip() else '(rien)'}"


def cmd_entree(p, ticket, retours="", extra=""):
    note_retours(retours, p)
    e = etat()
    files = changed() if p in CONTROLES + ("livraison",) else []
    ok, why = actif(p, files) if p in CONTROLES else (True, "")
    if not ok:
        write_json(dossier(p + ".json"), {"poste": p, "statut": "non_concerne", "raison": why})
        print(f"{p} : non concerné ({why})")
        sys.exit(3)
    parts = [f"Ticket {ticket}, dépôt {e.get('repo')}, branche {e.get('branch')} (base {e.get('base')}), tour {e.get('tours', 0) + 1}."]
    parts.append(section("Ticket", open(dossier("ticket.md"), encoding="utf-8").read() if os.path.exists(dossier("ticket.md")) else ""))
    if os.path.exists(dossier("retours.md")):
        parts.append(section("Retours de l'humain (à respecter en priorité)", open(dossier("retours.md"), encoding="utf-8").read()))
    if p in ("cadrage", "schema", "patterns"):
        docs = e.get("docs") or []
        parts.append(section("Documentation du dépôt (à lire avant tout)", "\n".join(docs[:80]) + (f"\n… et {len(docs) - 80} autres" if len(docs) > 80 else "")
                             if docs else "aucune"))
    deps = {"schema": ["cadrage"], "patterns": ["cadrage", "schema"], "code": ["cadrage", "schema", "patterns"],
            "livraison": ["cadrage"] + list(CONTROLES)}.get(p, ["cadrage", "schema"] if p in CONTROLES else [])
    for d in deps:
        r = load(d + ".json")
        if r:
            parts.append(section(f"Rapport du poste {d}", json.dumps(r.get("resultat") or r, ensure_ascii=False, indent=1)[:12000]))
    if p in CONTROLES or p == "livraison":
        parts.append(section("Fichiers modifiés", "\n".join(files)))
        parts.append(section("Plan validé", json.dumps((load("plan.json") or {}).get("lots") or [], ensure_ascii=False, indent=1)[:8000]))
    if p in CONTROLES:
        stat = git("diff", "--stat", f"origin/{e.get('base', 'main')}...HEAD")
        parts.append(section("Volume du diff", stat[-3000:]))
    if extra and not extra.startswith("{" + "{"):
        parts.append(section("Consignes de l'orchestrateur", extra))
    out("".join(parts))


def cmd_releve():
    """Schéma d'impact : fichiers du dépôt qui citent les mots du ticket (git grep), du plus cité au moins cité."""
    t = etat().get("texte") or ""  # résumé et description seulement : pas les intitulés du dossier
    words = {w.lower() for w in re.findall(r"[A-Za-z_][A-Za-z0-9_]{4,}", t) if not w.isupper()}
    stop = {"should", "would", "because", "which", "there", "their", "about", "after", "before", "where", "these", "those",
            "dans", "pour", "avec", "sans", "comme", "cette", "faire", "quand", "alors", "aussi", "toutes", "entre", "être"}
    hits = {}
    for w in sorted(words - stop, key=lambda x: (-len(x), x))[:40]:  # les mots longs d'abord : plus parlants
        for f in git("grep", "-l", "-i", "-F", w, "--", ".", ":!*.lock", ":!vendor", ":!node_modules").splitlines()[:60]:
            hits.setdefault(f, set()).add(w)
    top = sorted(hits.items(), key=lambda kv: (-len(kv[1]), kv[0]))[:80]
    tree = git("ls-files").splitlines()
    dirs = {}
    for f in tree:
        d = "/".join(f.split("/")[:2])
        dirs[d] = dirs.get(d, 0) + 1
    out("Fichiers qui citent les mots du ticket (mots trouvés) :\n" + "\n".join(f"- {f} ({', '.join(sorted(ws)[:6])})" for f, ws in top)
        + "\n\nCarte du dépôt (dossier : fichiers suivis) :\n" + "\n".join(f"- {d} : {n}" for d, n in sorted(dirs.items())[:150]))


def cmd_existe():
    prop = parse(read_stdin()) or {}
    missing = []
    for n in prop.get("fichiers") or []:
        path = n.get("chemin") if isinstance(n, dict) else str(n)
        new = isinstance(n, dict) and n.get("action") == "creer"
        if path and not new and not os.path.exists(os.path.join(root(), path)):
            missing.append(path)
    out({"absents": missing, "note": "chemins cités comme existants mais introuvables : à corriger" if missing else "tous les chemins existent"})


def cmd_tri(p):
    c = parse(read_stdin()) or {}
    if str(c.get("verdict") or "").lower() in ("revoir", "a_revoir", "rejet") and (c.get("remarques") or []):
        print(f"{p} : le critique demande un nouveau tour ({len(c['remarques'])} remarque(s))")
        sys.exit(3)
    print(f"{p} : proposition retenue")


def cmd_rapport(p):
    raw = read_stdin().split(SEP)
    prop, crit = parse(raw[0]) if raw else None, parse(raw[1]) if len(raw) > 1 else None
    if prop is None:
        prev = load(p + ".json") or {"poste": p, "statut": "non_concerne"}
        out(prev)
        return
    rep = {"poste": p, "statut": "ok", "resultat": prop, "critique": crit, "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
    if p == "tests" and isinstance(crit, dict) and crit.get("ok") is False:  # lancement rouge : bloquant, sorties citées
        rouges = [x for x in crit.get("sorties") or [] if x.get("code")]
        prop.setdefault("constats", []).append({"gravite": "bloquant", "probleme": "tests rouges après 3 essais",
                                                "correction": "\n".join(f"{x.get('cmd')} : {x.get('sortie', '')[-1500:]}" for x in rouges)})
    if p in CONTROLES:
        bl = [x for x in (prop.get("constats") or []) if isinstance(x, dict) and x.get("gravite") == "bloquant"]
        rep["bloquants"] = bl
        rep["bloquant_poste"] = poste_conf(p).get("bloquant", p in BLOQUANTS)
        rep["statut"] = "a_corriger" if bl and rep["bloquant_poste"] else "ok"
    write_json(dossier(p + ".json"), rep)
    out({"poste": p, "statut": rep["statut"], "resume": prop.get("resume") or ""})


def cmd_questions():
    c = (load("cadrage.json") or {}).get("resultat") or {}
    qs = [q for q in c.get("questions") or [] if isinstance(q, dict) and q.get("bloquante")]
    if not qs:
        print("Aucune question bloquante : on continue sans gate.")
        sys.exit(3)
    print("\n".join(f"{i}. {q.get('question')}" + (f" (hypothèse si pas de réponse : {q['hypothese']})" if q.get("hypothese") else "")
                    for i, q in enumerate(qs, 1)))


def cmd_mode(mode):
    if (mode or "plan").strip().lower() in ("plan", "plan seulement", "plan_seulement"):
        print("Plan seulement : le plan est en commentaire du ticket, la chaîne s'arrête ici.")
        return
    print("Mode complet : on passe au poste Code.")
    sys.exit(3)


def given(v):
    v = (v or "").strip()
    return bool(v) and not v.startswith("{" + "{")


def cmd_plan(consignes="", retours=""):
    """Premier passage : le plan en lots. Consignes de l'orchestrateur ou retours de l'humain : mode correction (code 3)."""
    if given(consignes) or given(retours):
        print("Mode correction : consignes ou retours à traiter, pas de nouveau découpage.")
        sys.exit(3)
    plan = parse(read_stdin()) or {}
    lots = [x for x in plan.get("lots") or [] if isinstance(x, dict)][: int(impl().get("max_lots") or 6)]
    for i, x in enumerate(lots, 1):
        x["n"] = i
    plan["lots"] = lots
    write_json(dossier("plan.json"), plan)
    write_json(dossier("lots.json"), {"fait": [], "essais": {}})
    print(f"Plan : {len(lots)} lot(s), postes de contrôle : {', '.join(plan.get('postes') or CONTROLES)}")


def cmd_lot():
    plan = load("plan.json") or {}
    st = load("lots.json") or {"fait": [], "essais": {}}
    for x in plan.get("lots") or []:
        if x["n"] not in st["fait"]:
            st["courant"] = x["n"]
            write_json(dossier("lots.json"), st)
            out({"lot": x, "essai": st["essais"].get(str(x["n"]), 0) + 1, "reste": len(plan["lots"]) - len(st["fait"]) - 1})
            return
    print("Tous les lots sont écrits.")
    sys.exit(3)


def fill(check, files):
    """Une commande de vérification : chaîne, ou {cmd, subdir} (chemins relatifs à ce sous-dossier, fichiers hors de lui
    écartés). Emplacements : {worktree}, {main}, {base}, {files}, {php}, {ts}, {tests}, {tests_php}, {tests_ts}."""
    cmd, sub = (check, "") if isinstance(check, str) else (check.get("cmd") or "", (check.get("subdir") or "").strip("/"))
    if sub:
        files = [f[len(sub) + 1:] for f in files if f.startswith(sub + "/")]
    files = [f for f in files if os.path.exists(os.path.join(root(), sub, f))]  # fichiers supprimés : rien à vérifier
    main = ""
    common = git("rev-parse", "--path-format=absolute", "--git-common-dir")
    if common.endswith("/.git"):
        main = common[:-5]
    kinds = {"files": files, "php": [f for f in files if f.endswith(".php")],
             "ts": [f for f in files if re.search(r"\.(ts|tsx|js|vue)$", f)],
             "tests": [f for f in files if re.search(r"(test|spec)", f, re.I)],
             "tests_php": [f for f in files if f.endswith("Test.php")],
             "tests_ts": [f for f in files if re.search(r"\.(test|spec)\.(ts|tsx|js)$", f)]}
    rep = {"worktree": root(), "main": main, "base": etat().get("base") or "main"}
    rep.update({k: " ".join(v) for k, v in kinds.items()})
    for k, v in rep.items():
        cmd = cmd.replace("{" + k + "}", v)
    return cmd, kinds


def cmd_verif(phase):
    files = changed()
    checks = ((reglages().get("checks") or {}).get(phase)) or []
    if not checks:
        out({"ok": True, "phase": phase, "sorties": [], "note": f"aucune vérification « {phase} » réglée pour ce dépôt (impl.repos)"})
        return
    res, ok = [], True
    for c in checks:
        raw = c if isinstance(c, str) else c.get("cmd") or ""
        need = re.findall(r"\{(php|ts|tests|tests_php|tests_ts|files)\}", raw)
        cmd, kinds = fill(c, files)
        if need and not any(kinds[k] for k in need):
            res.append({"cmd": raw[:200], "saute": "aucun fichier concerné"})
            continue
        try:
            r = subprocess.run(["sh", "-c", cmd], cwd=root(), capture_output=True, text=True, timeout=900)
            code, txt = r.returncode, (r.stdout + r.stderr)
        except subprocess.TimeoutExpired:
            code, txt = 124, "délai dépassé (15 min)"
        ok = ok and code == 0
        res.append({"cmd": raw[:200], "code": code, "sortie": txt[-6000:]})
    out({"ok": ok, "phase": phase, "sorties": res})


def cmd_tri_lot():
    raw = read_stdin().split(SEP)
    v, rel = parse(raw[0]) or {}, parse(raw[1]) if len(raw) > 1 else None
    st = load("lots.json") or {"fait": [], "essais": {}}
    n = str(st.get("courant"))
    st["essais"][n] = st["essais"].get(n, 0) + 1
    bad = (not v.get("ok", True)) or str((rel or {}).get("verdict") or "").lower() == "revoir"
    if bad and st["essais"][n] < 3:
        write_json(dossier("lots.json"), st)
        print(f"Lot {n} : à reprendre (essai {st['essais'][n]} sur 3)")
        sys.exit(4)
    if n.isdigit():
        st["fait"].append(int(n))
    st.setdefault("notes", {})[n] = "vérifs rouges après 3 essais : laissé aux contrôles" if bad else "ok"
    write_json(dossier("lots.json"), st)
    print(f"Lot {n} : terminé" + (" (encore rouge, les contrôles trancheront)" if bad else ""))


def cmd_tri_tests():
    """Tests rouges : le poste Tests reprend, 3 essais (compteur à lui, pas celui des lots du Code)."""
    v = parse(read_stdin().split(SEP)[0]) or {}
    st = load("tests_essais.json", {"n": 0}) or {"n": 0}
    st["n"] += 1
    write_json(dossier("tests_essais.json"), st)
    if not v.get("ok", True) and st["n"] < 3:
        print(f"Tests rouges : nouvel essai ({st['n']} sur 3)")
        sys.exit(4)
    print("Tests verts" if v.get("ok", True) else "Tests encore rouges après 3 essais : bloquant pour l'orchestrateur")


def cmd_bilan_code():
    e = etat()
    log = git("log", "--oneline", f"origin/{e.get('base', 'main')}..HEAD")
    st = load("lots.json") or {}
    rep = {"poste": "code", "statut": "ok" if log else "vide", "commits": log.splitlines(), "fichiers": changed(), "lots": st.get("notes")}
    write_json(dossier("code.json"), rep)
    out(rep)


def cmd_quoi():
    files = changed()
    res = {p: dict(zip(("actif", "raison"), actif(p, files))) for p in CONTROLES}
    write_json(dossier("quoi.json"), {"fichiers": files, "postes": res})
    out({"fichiers": files, "postes": res})


def cmd_bilan_controles():
    rep = {"bloquants": [], "avis": [], "postes": {}}
    for p in CONTROLES:
        r = load(p + ".json") or {"statut": "en_panne"}
        rep["postes"][p] = r.get("statut")
        for x in (r.get("resultat") or {}).get("constats") or []:
            if not isinstance(x, dict):
                continue
            item = {"poste": p, **x}
            (rep["bloquants"] if x.get("gravite") == "bloquant" and r.get("bloquant_poste", p in BLOQUANTS) else rep["avis"]).append(item)
    write_json(dossier("controles.json"), rep)
    out(rep)


def cmd_aiguillage():
    d = parse(read_stdin()) or {}
    e = etat()
    e["tours"] = int(e.get("tours") or 0) + 1
    write_json(dossier("etat.json"), e)
    write_json(dossier("orchestrateur.json"), d)
    dec = str(d.get("decision") or "").lower()
    maxt = int(impl().get("max_tours") or 3)
    if dec == "livrer":
        print(f"Tour {e['tours']} : l'orchestrateur livre.")
        sys.exit(3)
    if dec == "retour_code" and e["tours"] < maxt:
        print(f"Tour {e['tours']} sur {maxt} : retour au poste Code avec les consignes de l'orchestrateur.")
        sys.exit(4)
    print(f"Tour {e['tours']} : un humain tranche ({'plus de tours' if dec == 'retour_code' else dec or 'décision illisible'}).")


# ---------- livraison (gh, 0 token) ----------
def gh(*args):
    r = subprocess.run(["gh", *args], cwd=root(), capture_output=True, text=True)
    return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()


def pr_number():
    e = etat()
    code, o, _ = gh("pr", "list", "-R", e["repo"], "--head", e["branch"], "--state", "open", "--json", "number", "-q", ".[0].number")
    return o if code == 0 and o.isdigit() else ""


def cmd_pousse():
    e = etat()
    git("push", "--no-verify", "--force-with-lease", "origin", f"HEAD:{e['branch']}", check=True)
    print(f"{e['branch']} poussée")


def cmd_pr():
    d = parse(read_stdin()) or {}
    e = etat()
    body = (d.get("body") or "") + "\n\n<!-- bureau-chaine -->"
    path = dossier("pr_body.md")
    write_text(path, body)
    n = pr_number()
    if n:
        gh("pr", "edit", n, "-R", e["repo"], "--title", d.get("title") or e["ticket"], "--body-file", path)
    else:
        code, o, err = gh("pr", "create", "-R", e["repo"], "--draft", "--base", e["base"], "--head", e["branch"],
                          "--title", d.get("title") or e["ticket"], "--body-file", path, "--assignee", "@me")
        if code:
            sys.exit("PR non créée : " + err[:400])
        n = o.rstrip("/").split("/")[-1]
    e["pr"] = n
    write_json(dossier("etat.json"), e)
    print(f"PR #{n} (brouillon) : https://github.com/{e['repo']}/pull/{n}")


def cmd_ci():
    e, reg = etat(), reglages()
    n = e.get("pr") or pr_number()
    lab = reg.get("ci_label")
    if lab:
        gh("pr", "edit", n, "-R", e["repo"], "--remove-label", lab)
        time.sleep(3)
        gh("pr", "edit", n, "-R", e["repo"], "--add-label", lab)
    end = time.time() + int(reg.get("ci_wait_min") or 25) * 60
    state = "absente"
    while time.time() < end:
        code, o, _ = gh("pr", "checks", n, "-R", e["repo"], "--json", "state", "-q", "[.[].state] | join(\",\")")
        states = [s for s in o.split(",") if s]
        if states and not any(s in ("PENDING", "QUEUED", "IN_PROGRESS", "EXPECTED", "WAITING") for s in states):
            state = "verte" if all(s in ("SUCCESS", "SKIPPED", "NEUTRAL") for s in states) else "rouge"
            break
        state = "en cours" if states else state
        time.sleep(30)
    e["ci"] = state
    write_json(dossier("etat.json"), e)
    print(f"CI de la PR #{n} : {state}")


def cmd_env():
    e, reg = etat(), reglages()
    lab = reg.get("env_label")
    n = e.get("pr") or pr_number()
    if not lab:
        print("Pas d'env de branche réglé pour ce dépôt.")
        return
    if reg.get("env_needs_ready"):  # dépôt dont l'env ne se construit pas sur un brouillon
        gh("pr", "ready", n, "-R", e["repo"])
    gh("pr", "edit", n, "-R", e["repo"], "--add-label", lab)
    pat = reg.get("env_url") or (CFG.get("env") or {}).get("url") or ""
    url = ""
    for _ in range(16 if pat else 0):
        _, o, _ = gh("pr", "view", n, "-R", e["repo"], "--json", "comments", "-q", ".comments[].body")
        m = re.search(pat, o)
        if m:
            url = m.group(0)
            break
        time.sleep(30)
    e["env"] = url
    write_json(dossier("etat.json"), e)
    print(f"Env de branche : {url or 'en construction (adresse pas encore publiée)'}")


def cmd_pret():
    e = etat()
    n = e.get("pr") or pr_number()
    code, _, err = gh("pr", "ready", n, "-R", e["repo"])
    print(f"PR #{n} prête à relire" if code == 0 else f"PR #{n} : passage en prête impossible ({err[:200]})")


def cmd_reviewers():
    e, reg = etat(), reglages()
    n = e.get("pr") or pr_number()
    who = [r for r in reg.get("reviewers") or [] if r]
    if who:
        gh("pr", "edit", n, "-R", e["repo"], "--add-reviewer", ",".join(who))
    url = f"https://github.com/{e['repo']}/pull/{n}"
    out(f"PR prête à relire : [{url}|{url}]" + (f" ; env de branche : {e['env']}" if e.get("env") else "")
        + f" ; CI : {e.get('ci') or '?'} (chaîne d'implémentation du Bureau, {e.get('tours', 0)} tour(s) de contrôle).")


def cmd_fin():
    e = etat()
    out({"ticket": e.get("ticket"), "repo": e.get("repo"), "pr": e.get("pr"), "ci": e.get("ci"), "env": e.get("env"), "tours": e.get("tours")})


def main(argv):
    cmd, args = (argv[1] if len(argv) > 1 else ""), argv[2:]
    simple = {"releve": cmd_releve, "existe": cmd_existe, "questions": cmd_questions, "lot": cmd_lot,
              "tri_lot": cmd_tri_lot, "tri_tests": cmd_tri_tests, "bilan_code": cmd_bilan_code, "quoi": cmd_quoi, "bilan_controles": cmd_bilan_controles,
              "aiguillage": cmd_aiguillage, "pousse": cmd_pousse, "pr": cmd_pr, "ci": cmd_ci, "env": cmd_env, "pret": cmd_pret,
              "reviewers": cmd_reviewers, "fin": cmd_fin}
    if cmd in simple:
        return simple[cmd]()
    if cmd == "lance":
        return cmd_lance(*(args + ["", "", ""])[:3])
    if cmd == "prepare":
        return cmd_prepare(*(args + ["", "", ""])[:3])
    if cmd == "entree":
        return cmd_entree(*(args + ["", "", "", ""])[:4])
    if cmd in ("tri", "rapport"):
        return (cmd_tri if cmd == "tri" else cmd_rapport)(args[0] if args else "?")
    if cmd == "plan":
        return cmd_plan(*(args + ["", ""])[:2])
    if cmd == "mode":
        return cmd_mode(args[0] if args else "plan")
    if cmd == "verif":
        return cmd_verif(args[0] if args else "regles")
    sys.exit(f"sous-commande inconnue : {cmd!r}")


if __name__ == "__main__":
    main(sys.argv)
