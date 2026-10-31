"""Implémenter un ticket en chaîne de postes (#76, #125) : une sous-commande par étape Exec des modèles impl_*.json, 0 token.

Le dossier du ticket vit dans la copie de travail du run, `.kronn/chaine/` (ignoré par git) : chaque poste (un
sous-workflow, qui partage la copie de son parent) y lit ce qu'ont écrit les précédents et y dépose son rapport.

  lance <ticket> <mode> <dépôt> [reprise]
                                    # lanceur : stdin ticket Jira ; une chaîne par dépôt (composants Jira), chacune dans
                                    # son projet Kronn ; reprise auto|oui|non (auto : reprend si le dernier run a échoué, pas s'il a été rejeté)
  prepare <ticket> <mode> <run> [variante] [dépôt] [sœurs] [reprise] [base]
                                    # base : branche ou commit d'où rejouer le ticket (essai) ; stdin ticket Jira : dossier, réglages du dépôt, branche kronn/<ticket> ; en reprise,
                                    # dossier et branche du run d'avant, code 3/4/5 : on reprend au Code/aux contrôles/à la PR
  entree <poste> <ticket> [retours] [extra]
                                    # contexte du poste ; retours d'une gate ajoutés au dossier ; code 3 : poste non concerné
                                    # ou déjà fait (reprise) ; code 5 : cadrage/schéma/patterns déjà faits (reprise), Code
                                    # en mode essai (affecter sauté), PR déjà ouverte (reprise)
  releve                            # schéma d'impact : fichiers du dépôt qui parlent du ticket (git grep), 0 token
  existe                            # stdin proposition du schéma : chemins cités qui n'existent pas
  tri <poste>                       # stdin avis du critique : code 3 = « revoir » (Goto la proposition, 3 tours au plus)
  rapport <poste>                   # stdin proposition ===SEP=== critique : rapport du poste dans le dossier
  dossier                           # rapports cadrage, schéma, patterns pour le prompt de l'orchestrateur
  questions                         # « ce que j'ai compris » pour ta gate (code 0) ; impl.gate_cadrage false et rien à
                                    # trancher : code 3, saut au schéma
  mode <plan|complet|essai>         # code 4 : plan seulement (commentaire Jira puis Stop), code 0 : on code
  plan [consignes] [retours]        # stdin plan de l'orchestrateur : plan.json en lots ; consignes ou retours : code 3
  lot                               # lot suivant du plan ; code 3 : plus de lot
  verif <regles|tests>              # commandes de vérification du dépôt (réglage impl.repos), en conteneur si réglé
  tri_lot                           # stdin vérif ===SEP=== relecture : code 4 = refaire le lot (3 essais), 0 = lot fini
  tri_tests                         # stdin lancement des tests : code 4 = le poste Tests reprend (3 essais)
  bilan_code                        # commits et fichiers de la branche
  quoi                              # contrôles : fichiers touchés, postes à lancer (réglages et plan)
  bilan_controles                   # rapports des postes de contrôle : bloquants et avis
  aiguillage                        # stdin décision de l'orchestrateur : 3 livrer, 4 retour au code, 0 humain
  pousse | pr | revue_prep | retours_lire | reponds   # PR, revue de la PR, retours des relecteurs (gh)
  pret | reviewers | fin                              # publication après ta relecture (gh)

L'étage ne traite que l'implémentation, la PR et ses retours : ni CI, ni env de branche, ni déploiement (le RDC s'en charge).
Le dossier est recopié après chaque étape dans ~/.cache/pixel-bureau/chaine/<ticket>/<owner__dépôt>/courant : Kronn
supprime la copie de travail d'un run (réussi ou non), la reprise y relit tout (étape atteinte dans etat.json « etape »).
Réglage impl (pack ou config) : repos.<owner/dépôt>.{base, checks.{regles,tests}, reviewers, front}, components.<composant> = owner/dépôt, postes.<poste>.{actif, bloquant}, max_tours, max_lots.
Une commande de vérification reçoit {worktree}, {main} (dossier du projet), {files}, {php}, {ts}, {tests} (fichiers
modifiés par rapport à la base, par type).
"""
import fnmatch, hashlib, json, os, re, subprocess, sys, time
from _lib import CFG, get, read_json, send, write_json, write_text

SEP = "\n===SEP===\n"
KEY = re.compile(r"^[A-Z][A-Z0-9]+-\d+$")
POSTES = ("cadrage", "schema", "patterns", "code", "regles", "securite", "tests", "perf", "revue", "besoin", "pr", "revue_pr", "retours")
CONTROLES = ("regles", "securite", "tests", "perf", "revue", "besoin")
PARALLELES = ("regles", "securite", "perf", "besoin")  # en lecture seule : sous-agents d'une même étape, en même temps
BLOQUANTS = {"regles", "securite", "tests", "besoin"}  # par défaut ; perf et revue : avis
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
    url = git("config", "--get", "remote.origin.url")  # l'adresse écrite, pas celle réécrite par url.*.insteadOf
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
def quand(s):
    """Date ISO (Jira : 2026-10-28T15:33:23.868+0100, git : 2026-10-26T10:32:55+01:00) en UTC, ou None."""
    import datetime
    m = re.match(r"(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.\d+)?(Z|[+-]\d\d:?\d\d)?", str(s or ""))
    if not m:
        return None
    tz = (m.group(2) or "+00:00").replace("Z", "+00:00")
    tz = tz if ":" in tz else tz[:3] + ":" + tz[3:]
    return datetime.datetime.fromisoformat(m.group(1) + tz).astimezone(datetime.timezone.utc)


def ticket_md(t, avant=None):
    """Le ticket en Markdown ; essai rejoué (avant = date du commit rejoué) : ni statut ni commentaire postérieur,
    essai d'EW-7945 : le retour d'usage de l'IA, posté après la livraison, donnait ses suites à la PR."""
    f = t.get("fields") or {}
    statut = "(essai rejoué : statut masqué)" if avant else (f.get('status') or {}).get('name') or '?'
    lines = [f"# {t.get('key')} : {f.get('summary') or ''}", "",
             f"- Type : {(f.get('issuetype') or {}).get('name') or '?'} ; priorité : {(f.get('priority') or {}).get('name') or '?'}"
             f" ; statut : {statut}",
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
    comments = (f.get("comment") or {}).get("comments") or []
    if avant:
        comments = [c for c in comments if (quand(c.get("created")) or avant) < avant]
    comments = comments[-8:]
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


def origine(path):
    """owner/dépôt GitHub de la copie locale, ou ""."""
    r = subprocess.run(["git", "-C", path, "config", "--get", "remote.origin.url"], capture_output=True, text=True)
    m = re.search(r"github\.com[:/]([\w.-]+/[\w.-]+?)(?:\.git)?/?$", r.stdout.strip())
    return m.group(1) if m else ""


def projet_auto(repo):
    """Aucun projet Kronn pour ce dépôt : sa copie locale dans le dossier des clones (impl.clones, ~/Sites par défaut),
    sinon clonée là si impl.auto_projet, puis ajoutée à Kronn comme projet. Rend (id du projet, ce qui a été fait) ou
    (None, pourquoi). Essai d'EW-7945 : front_api était cloné dans ~/Sites mais n'avait pas de projet Kronn."""
    base = os.path.expanduser(impl().get("clones") or "~/Sites")
    path = next((os.path.join(base, d) for d in sorted(os.listdir(base)) if os.path.isdir(os.path.join(base, d, ".git"))
                 and origine(os.path.join(base, d)).lower() == repo.lower()), None) if os.path.isdir(base) else None
    fait = "copie locale trouvée"
    if not path:
        if not impl().get("auto_projet"):
            return None, f"aucune copie locale dans {base} (impl.auto_projet : la cloner d'office)"
        path, fait = os.path.join(base, repo.split("/")[-1]), "cloné"
        if os.path.exists(path):
            return None, f"{path} existe déjà et n'est pas une copie de {repo}"
        r = subprocess.run(["gh", "repo", "clone", repo, path], capture_output=True, text=True, timeout=1800)
        if r.returncode:
            return None, "clonage impossible : " + (r.stderr or r.stdout).strip()[:300]
    res = send("POST", "/projects/add-folder", {"path": path}) or {}
    pid = (res.get("data") or res).get("id") if isinstance(res, dict) else None
    if not pid:
        return None, f"{path} : ajout à Kronn refusé ({str(res.get('error') if isinstance(res, dict) else res)[:200]})"
    return pid, f"{fait} ({path}) et ajouté à Kronn"


def repos_for(t, depot):
    """Dépôts du ticket, un par composant Jira (impl.components, sinon un dépôt réglé du même nom, sinon owner/composant) ;
    le champ dépôt (owner/dépôt, ou un nom de composant) force un seul dépôt."""
    depot = (depot or "").strip()
    if "/" in depot:
        return [depot]
    comps = [depot] if depot else [c.get("name") for c in ((t.get("fields") or {}).get("components") or [])]
    mapping = impl().get("components") or {}
    known = list((impl().get("repos") or {}).keys())
    owner = ((CFG.get("github") or {}).get("repo") or "/").split("/")[0]
    out = []
    for c in comps:
        r = mapping.get(c) or next((k for k in known if k.split("/")[-1] == c), None) or (f"{owner}/{c}" if owner and c else "")
        if r and r.lower() not in [x.lower() for x in out]:
            out.append(r)
    return out


def chain_runs(chain, limit=50):
    """Runs de la chaîne, les plus récents d'abord, avec leur sortie prepare (« <ticket> sur <dépôt> ») : les variables
    d'un run sont chiffrées (instantané), le ticket et le dépôt ne se lisent que là. Détail lu pour les runs actifs et les
    15 plus récents des autres (reprise)."""
    runs = sorted(get(f"/workflows/{chain}/runs?limit={limit}") or [], key=lambda r: r.get("started_at") or "", reverse=True)
    done = 0
    for r in runs:
        act = r.get("status") in ("Running", "WaitingApproval", "Pending", "WaitingQuota")
        if not act and done >= 15:
            r["prep"] = None
            continue
        done += not act
        steps = (get(f"/workflows/{chain}/runs/{r['id']}") or {}).get("step_results") or []
        r["active"], r["prep"] = act, next((x.get("output") or "" for x in steps if x.get("step_name") == "prepare"), "")
        # un rejet à une gate finit lui aussi en Failed : sa dernière étape est la gate refusée, pas une panne
        last = steps[-1] if steps else {}
        r["rejete"] = str(last.get("step_name") or "").startswith("gate_") and last.get("status") == "Failed"
    return runs


def cmd_lance(ticket, mode, depot, reprise=""):
    """Une chaîne par dépôt du ticket (méthode A) : chacune dans le projet Kronn du dépôt, sur son bureau, avec ses sœurs
    (les autres dépôts) pour son périmètre et ses liens de PR. Un passage par ticket ET par dépôt."""
    if not KEY.match(ticket or ""):
        sys.exit(f"Clé de ticket invalide : {ticket!r}")
    t = parse(read_stdin()) or {}
    repos = repos_for(t, depot)
    if not repos:
        sys.exit("Aucun dépôt : pose un composant Jira sur le ticket, ou donne le dépôt (owner/dépôt) au lancement.")
    chain = (CFG.get("models") or {}).get("impl_chain")
    if not chain:
        sys.exit("La chaîne n'est pas installée (models.impl_chain) : python3 tools/install.py la propose.")
    pids, notes = {r: project_for(r) for r in repos}, {}
    for r in repos:
        if not pids[r]:
            pids[r], notes[r] = projet_auto(r)
    manque = [r for r in repos if not pids[r]]
    runs = chain_runs(chain)
    pending = next((r for r in runs if r.get("active") and not r.get("prep")), None)
    if pending:  # un run pas encore préparé : on ne sait pas encore quel ticket il porte
        sys.exit(f"Un run de la chaîne n'est pas encore préparé ({pending['id'][:8]}, {pending['status']}) : "
                 f"{ticket} y est peut-être déjà, réessaie dans une minute.")
    lines, launched = [], []
    targets = [r for r in repos if pids[r]]
    reprise = (reprise or "auto").strip().lower()
    reprise = reprise if reprise in ("oui", "non") else "auto"
    for i, repo in enumerate(targets, 1):
        mine = [r for r in runs if r.get("prep") and f"{ticket} sur {repo}".lower() in r["prep"].lower()]
        busy = next((r for r in mine if r.get("active")), None)
        if busy:
            lines.append(f"- {repo} : déjà sur la chaîne (run {busy['id'][:8]}, {busy['status']}), pas relancé")
            continue
        rep = reprise if reprise != "auto" else "oui" if mine and mine[0].get("status") == "Failed" and not mine[0].get("rejete") else "non"
        soeurs = [r for r in repos if r != repo]
        partie = f"h3. Partie {repo} ({i} sur {len(targets)})\n\n" if len(repos) > 1 else ""
        # route JSON qui lance détaché : /workflows/{id}/trigger est un flux SSE qui ne répond qu'à la première pause du run
        res = send("POST", "/mcp/workflow-trigger", {"workflow_id": chain, "project_id": pids[repo], "variables": {
            "ticket": ticket, "mode": mode or "plan", "depot": repo, "soeurs": ",".join(soeurs), "partie": partie, "reprise": rep}},
            timeout=120)
        run = str((res or {}).get("run_id") or "?")
        launched.append(repo)
        lines.append(f"- {repo} : run {run[:8]}" + (" (reprise là où le run d'avant s'est arrêté)" if rep == "oui" else "")
                     + (f", projet Kronn : {notes[repo]}" if notes.get(repo) else ""))
    for r in manque:
        lines.append(f"- {r} : aucun projet Kronn n'a ce dépôt pour origine, pas de bureau ({notes.get(r)} ; ajoute-le dans Kronn, "
                     "Projets, puis relance)")
    head = (f"{ticket} posé sur la chaîne ({mode or 'plan'}) : {len(launched)} bureau(x), une PR par dépôt"
            if launched else f"{ticket} : aucun bureau lancé")
    print(head + "\n" + "\n".join(lines))
    if not launched:
        sys.exit(1)


def cache_dir(ticket=None, repo=None):
    """Copie du dossier hors de la copie de travail, par ticket et par dépôt : la reprise y relit tout."""
    e = etat() if not (ticket and repo) else {}
    ticket, repo = ticket or e.get("ticket"), repo or e.get("repo")
    if not (ticket and repo):
        return ""
    return os.path.join(os.path.expanduser("~/.cache/pixel-bureau/chaine"), ticket, repo.replace("/", "__"), "courant")


def copie(src, dest):
    if not (src and dest and os.path.isdir(src)):
        return
    os.makedirs(dest, exist_ok=True)
    for f in os.listdir(src):
        if os.path.isfile(os.path.join(src, f)):
            with open(os.path.join(src, f), "rb") as a, open(os.path.join(dest, f), "wb") as b:
                b.write(a.read())


def sauve():
    """Après chaque étape : le dossier recopié dans le cache (Kronn supprime la copie de travail d'un run en échec)."""
    if os.path.isdir(os.path.join(root(), ".kronn", "chaine")) and etat().get("ticket"):
        copie(dossier(), cache_dir())


# étape atteinte (etat.json « etape ») -> où la reprise repart : 0 du début (postes déjà faits sautés), 3 au Code,
# 4 aux contrôles (ceux déjà faits sautés), 5 à la PR (déjà ouverte : droit à ta relecture)
REPRISE = {"code": 3, "controles": 4, "orchestrateur": 4, "escalade": 4, "livraison": 5, "relecture": 5, "publication": 5}


def avance(etape, **more):
    e = etat()
    e.update(etape=etape, **more)
    write_json(dossier("etat.json"), e)


def git_ok(*args):
    return subprocess.run(["git", *args], cwd=root(), capture_output=True).returncode == 0


def reprend(ticket, repo, mode, run):
    """Reprise : dossier et branche du run d'avant ; rend le code de sortie de prepare, ou None (rien à reprendre)."""
    src = cache_dir(ticket, repo)
    try:
        old = read_json(os.path.join(src, "etat.json"))
    except (OSError, ValueError):
        return None, "aucun dossier gardé pour ce ticket et ce dépôt"
    if old.get("etape") in (None, "fini"):
        return None, "le run d'avant est allé au bout"
    branch = old.get("branch") or f"kronn/{ticket}"
    step = old.get("etape")
    if git_ok("rev-parse", "--verify", "-q", f"refs/heads/{branch}"):
        # Kronn garde la copie de travail d'un run en échec qui a des fichiers non commités : elle tient encore la branche
        # (essai d'EW-7945, gigya) ; ce run est fini, on reprend la branche quand même
        git("checkout", "--ignore-other-worktrees", "-f", "-B", branch, branch, check=True)
    elif git_ok("fetch", "origin", branch):
        git("checkout", "-f", "-B", branch, f"origin/{branch}", check=True)
    elif REPRISE.get(step, 0) >= 3:
        return None, f"branche {branch} introuvable, le code est perdu"
    copie(src, dossier())
    e = etat()
    if step == "publication":
        step = "relecture"
    cons = ""
    o = load("orchestrateur.json") or {}
    if step == "code" and str(o.get("decision") or "").lower() == "retour_code":
        cons = o.get("consignes") or ""
    e.update(mode=mode, run=run, reprise=True, etape=step, reprises=int(e.get("reprises") or 0) + 1, consignes_reprise=cons)
    write_json(dossier("etat.json"), e)
    return REPRISE.get(step, 0), {"code": "au poste Code" + (" (consignes de l'orchestrateur)" if cons else ""),
                                  "controles": "aux contrôles", "orchestrateur": "aux contrôles", "escalade": "aux contrôles",
                                  "livraison": "à la PR", "relecture": "à ta relecture de la PR"}.get(step, "au début, postes déjà faits sautés")


def default_branch():
    """Branche par défaut du dépôt distant (front_tools est sur master)."""
    m = re.search(r"ref: refs/heads/(\S+)\s+HEAD", git("ls-remote", "--symref", "origin", "HEAD"))
    return m.group(1) if m else ""


def depart():
    """Le point de départ de la branche : un commit fixé (essai rejoué), sinon la base distante."""
    e = etat()
    return e.get("depart") or f"origin/{e.get('base') or 'main'}"


def cmd_prepare(ticket, mode, run, variant="", depot="", soeurs="", reprise="", rejoue=""):
    t = parse(read_stdin()) or {}
    repo = repo_of()
    if given(depot) and depot.strip().lower() != repo.lower():
        sys.exit(f"Cette copie de travail est celle de {repo or '?'}, pas de {depot} : lance la chaîne dans le projet du dépôt.")
    sisters = [x.strip() for x in (soeurs if given(soeurs) else "").split(",") if x.strip()]
    if (reprise or "").strip().lower() == "oui":
        code, why = reprend(ticket, repo, mode, run)
        if code is not None:
            e = etat()
            e["soeurs"] = sisters or e.get("soeurs") or []
            write_json(dossier("etat.json"), e)
            print(f"{ticket} sur {repo} : reprise {why}, branche {e.get('branch')}, mode {mode}")
            sauve()
            if code:
                sys.exit(code)
            return
        print(f"Rien à reprendre ({why}) : on repart du début.")
    reg = reglages(repo)
    base = reg["base"]
    if not git_ok("fetch", "origin", base):  # base réglée absente (front_tools : master) : la branche par défaut
        base = default_branch() or base
        git("fetch", "origin", base, check=True)
    start, fixed = f"origin/{base}", ""
    if given(rejoue):  # rejouer un ticket sur un état passé (essai comparé à une PR déjà faite) : branche ou commit
        ref = rejoue.strip()
        fixed = git("rev-parse", "--verify", "-q", ref + "^{commit}")  # SHA court ou branche déjà connus en local
        if not fixed or "/" in ref or not re.fullmatch(r"[0-9a-f]{7,40}", ref):
            git("fetch", "origin", ref, check=True)  # GitHub ne sert un commit que par son SHA complet
            fixed = git("rev-parse", "FETCH_HEAD", check=True)
        start = fixed
    # run shadow de Kronn (essai sans effet externe, à côté d'un run normal) : sa propre branche, l'autre la tient déjà
    branch = f"kronn/{ticket}" + ("-shadow" if (variant or "").strip() == "shadow" else "")
    git("checkout", "-f", "-B", branch, start, check=True)
    for f in os.listdir(dossier()):  # le dossier d'un autre passage, s'il en reste un
        if os.path.isfile(dossier(f)):
            os.remove(dossier(f))
    write_text(dossier("ticket.md"), ticket_md(t, quand(git("show", "-s", "--format=%cI", fixed)) if fixed else None))
    docs = git("ls-files", "docs", "AGENTS.md", "CLAUDE.md", ".github/pull_request_template.md").splitlines()
    f = t.get("fields") or {}
    write_json(dossier("etat.json"), {"ticket": ticket, "mode": mode, "repo": repo, "base": base, "branch": branch,
                                      "run": run, "tours": 0, "docs": docs[:200], "soeurs": sisters, "etape": "cadrage", "depart": fixed,
                                      "lecture": chemins([r for r in sisters + list(impl().get("references") or []) if r.lower() != repo.lower()]),
                                      "texte": f"{f.get('summary') or ''}\n{f.get('description') or ''}"[:8000]})
    src = cache_dir(ticket, repo)
    if src and os.path.isdir(src):  # nouveau départ : l'ancien dossier ne doit plus servir à une reprise
        for x in os.listdir(src):
            os.remove(os.path.join(src, x))
    print(f"{ticket} sur {repo} : branche {branch} depuis {fixed[:10] or 'origin/' + base}, {len(docs)} fichiers de doc, mode {mode}"
          + (f", dépôts sœurs : {', '.join(sisters)}" if sisters else ""))


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


def changed():
    files = git("diff", "--name-only", f"{depart()}...HEAD").splitlines()
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


def rejoue():
    """Essai rejoué depuis un commit passé : la base distante contient peut-être déjà le ticket (livré depuis) ; essai
    d'EW-7945 : la revue l'a vu et le Code a rebasé sur main."""
    e = etat()
    if not e.get("depart"):
        return ""
    return section("Essai rejoué (à respecter)",
                   f"Ce ticket est rejoué depuis le commit {e['depart'][:10]} : c'est TA base, l'état du dépôt avant le ticket. "
                   f"origin/{e.get('base') or 'main'} peut déjà contenir une livraison de ce ticket : ne le lis pas, ne compare pas "
                   "avec, ne rebase pas dessus, ne le signale pas. Juge le travail par rapport à ta base seulement.")


def lecture():
    """Dépôts à lire, jamais à modifier : les sœurs et les références de l'équipe (impl.references) qui ont une copie
    locale dans Kronn. Essais d'EW-6550 et EW-7945 : un bureau qui ne voit que son dépôt ne sait pas que le travail se fait
    dans un dépôt sœur, ni reprendre le job déjà écrit dans le dépôt de référence."""
    e = etat()
    paths = e.get("lecture") or {}
    if not paths:
        return ""
    return section("Dépôts à lire (jamais à modifier)", "Copies locales : la branche courante peut être une autre que la "
                   "principale, lis la version de référence avec `git -C <chemin> show origin/<branche>:<fichier>` ou "
                   "`git -C <chemin> grep <motif> origin/<branche>`. Reprends ce qui y est déjà fait plutôt que de réinventer.\n"
                   + "\n".join(f"- {r} : {p}" for r, p in paths.items()))


def chemins(repos):
    """Copie locale (projet Kronn) de chaque dépôt, quand elle existe."""
    if not repos:
        return {}
    try:
        projects = get("/projects") or []
    except Exception:  # Kronn injoignable : pas de dépôt à lire, la chaîne continue
        return {}
    out = {}
    for r in repos:
        for p in projects:
            m = re.search(r"github\.com[:/]([\w.-]+/[\w.-]+?)(?:\.git)?/?$", str(p.get("repo_url") or ""))
            if m and m.group(1).lower() == r.lower() and p.get("path"):
                out[r] = p["path"]
    return out


def perimetre():
    """Ticket à plusieurs dépôts : un bureau par dépôt, chacun ne traite que sa part."""
    e = etat()
    if not e.get("soeurs"):
        return ""
    return section("Périmètre de ce bureau (un bureau et une PR par dépôt)",
                   f"Ce ticket touche plusieurs dépôts. Ce bureau ne traite QUE la part du ticket qui concerne {e.get('repo')}. "
                   f"{', '.join(e['soeurs'])} : chacun a son propre bureau et sa propre PR, n'y touche pas. Note dans ton rapport "
                   "ce qui leur revient et ce qui en dépend (contrat d'API, ordre de mise en prod).")


def correction(p):
    """Tour suivant des contrôles : ce que le Code a changé depuis leur dernier passage, et le rapport précédent du poste.
    Tous les postes repassent (une correction peut casser autre chose), mais en relisant surtout ce diff ; 🎯 Besoin
    juge toujours l'ensemble."""
    e = etat()
    sha = e.get("controle_sha")
    if not sha:
        return ""
    stat = git("diff", "--stat", f"{sha}..HEAD")
    if not stat:  # rien de corrigé depuis le dernier passage
        return ""
    prev = load(f"precedent_{p}.json") or {}
    body = (f"Les contrôles ont déjà relu la branche jusqu'à {sha[:10]}. Depuis, le Code a corrigé (`git diff {sha}..HEAD`) :\n"
            + stat[-2500:] + "\n\n" + ("Juge le résultat d'ensemble, correction comprise." if p == "besoin" else
            "Relis surtout cette correction : ce qu'elle règle de ton rapport précédent, et ce qu'elle a pu casser. Ne refais pas "
            "le reste du diff, déjà relu ; garde les constats précédents encore vrais."))
    if prev:
        body += "\n\nTon rapport précédent :\n" + json.dumps(prev.get("resultat") or prev, ensure_ascii=False, indent=1)[:6000]
    return section("Tour suivant : la correction", body)


def deja_fait(p):
    """Reprise : le rapport d'un poste fait au run d'avant (le Code efface ceux des contrôles à chaque passage)."""
    r = load(p + ".json") or {}
    return bool(etat().get("reprise")) and r.get("statut") in ("ok", "a_corriger", "non_concerne")


def cmd_entree(p, ticket, retours="", extra=""):
    if p in ("cadrage", "schema", "patterns") and not given(retours) and deja_fait(p):
        print(f"{p} : déjà fait au run d'avant (reprise), rapport gardé")
        sys.exit(5)
    if p in CONTROLES and deja_fait(p):
        print(f"{p} : déjà fait au run d'avant (reprise), rapport gardé")
        sys.exit(3)
    e = etat()
    if p == "livraison" and e.get("reprise") and e.get("etape") == "relecture":
        print("PR déjà ouverte et relue au run d'avant (reprise) : droit à ta relecture")
        sys.exit(5)
    if p == "code" and not given(extra) and e.get("consignes_reprise"):
        extra = e["consignes_reprise"]
    note_retours(retours, p)
    for f in (f"essais_{p}.json",) + (("tests_essais.json",) if p == "tests" else ()):  # nouveau passage du poste : essais à zéro
        if os.path.exists(dossier(f)):
            os.remove(dossier(f))
    files = changed() if p in CONTROLES + ("livraison",) else []
    ok, why = actif(p, files) if p in CONTROLES else (True, "")
    if not ok:
        write_json(dossier(p + ".json"), {"poste": p, "statut": "non_concerne", "raison": why})
        print(f"{p} : non concerné ({why})")
        sys.exit(3)
    parts = [f"Ticket {ticket}, dépôt {e.get('repo')}, branche {e.get('branch')} (base {e.get('base')}), tour {e.get('tours', 0) + 1}. "
             f"Point de départ du diff : {depart()} (`git diff {depart()}...HEAD`)."]
    parts.append(perimetre())
    parts.append(lecture())
    parts.append(rejoue())
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
        stat = git("diff", "--stat", f"{depart()}...HEAD")
        parts.append(section("Volume du diff", stat[-3000:]))
        parts.append(correction(p))
    if extra and not extra.startswith("{" + "{"):
        parts.append(section("Consignes de l'orchestrateur", extra))
    out("".join(parts))
    if p == "code" and essai():  # mode essai : l'étape affecter (Jira) est sautée, droit au plan
        sys.exit(5)


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
    """Le script compte les tours : un Goto qui a épuisé son max_iterations sur un code non nul fait échouer l'étape
    (essai du 2026-10-30), donc au 3e avis « revoir » on rend 0 et la dernière proposition est gardée."""
    c = parse(read_stdin()) or {}
    st = load(f"essais_{p}.json", {"n": 0}) or {"n": 0}
    st["n"] += 1
    write_json(dossier(f"essais_{p}.json"), st)
    if str(c.get("verdict") or "").lower() in ("revoir", "a_revoir", "rejet") and (c.get("remarques") or []):
        if st["n"] < 3:
            print(f"{p} : le critique demande un nouveau tour ({len(c['remarques'])} remarque(s)), proposition {st['n'] + 1} sur 3")
            sys.exit(3)
        print(f"{p} : 3 propositions faites, la dernière est gardée ; remarques restantes dans le rapport")
        return
    print(f"{p} : proposition retenue")


def ecrit_rapport(p, prop, crit=None):
    rep = {"poste": p, "statut": "ok", "resultat": prop, "critique": crit, "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
    if p == "tests" and isinstance(crit, dict) and crit.get("ok") is False:  # lancement rouge : bloquant, sorties citées
        rouges = [x for x in crit.get("sorties") or [] if x.get("code") and not x.get("deja_la")]
        prop.setdefault("constats", []).append({"gravite": "bloquant", "probleme": "tests rouges après 3 essais",
                                                "correction": "\n".join(f"{x.get('cmd')} : {x.get('sortie', '')[-1500:]}" for x in rouges)})
    if p in CONTROLES:
        bl = [x for x in (prop.get("constats") or []) if isinstance(x, dict) and x.get("gravite") == "bloquant"]
        rep["bloquants"] = bl
        rep["bloquant_poste"] = poste_conf(p).get("bloquant", p in BLOQUANTS)
        rep["statut"] = "a_corriger" if bl and rep["bloquant_poste"] else "ok"
    write_json(dossier(p + ".json"), rep)
    return rep


def cmd_rapport(p):
    raw = read_stdin().split(SEP)
    prop, crit = parse(raw[0]) if raw else None, parse(raw[1]) if len(raw) > 1 else None
    if prop is None:
        prev = load(p + ".json") or {"poste": p, "statut": "non_concerne"}
        out(prev)
        return
    rep = ecrit_rapport(p, prop, crit)
    out({"poste": p, "statut": rep["statut"], "resume": prop.get("resume") or ""})


def cmd_missions():
    """Contrôles en parallèle : le contexte commun et les postes à lancer (règles, sécurité, perf, besoin) pour l'étape
    Agent qui les confie à des sous-agents en même temps ; vérifications des règles lancées ici (0 token). Kronn ne lance
    pas de sous-workflows en parallèle (foreach séquentiel) : 45 min par tour en série à l'essai d'EW-7851. Aucun poste
    à lancer : code 3, saut à la revue."""
    files = changed()
    postes, ecartes = [], []
    for p in PARALLELES:
        if deja_fait(p):
            ecartes.append(f"{p} : déjà fait au run d'avant (reprise)")
            continue
        ok, why = actif(p, files)
        if ok:
            postes.append(p)
        else:
            write_json(dossier(p + ".json"), {"poste": p, "statut": "non_concerne", "raison": why})
            ecartes.append(f"{p} : non concerné ({why})")
    write_json(dossier("missions.json"), {"postes": postes})
    if not postes:
        print("Aucun contrôle parallèle à lancer.\n" + "\n".join(ecartes))
        sys.exit(3)
    e = etat()
    parts = [f"Ticket {e.get('ticket')}, dépôt {e.get('repo')}, branche {e.get('branch')}, tour {e.get('tours', 0) + 1}. "
             f"Point de départ du diff : {depart()} (`git diff {depart()}...HEAD`).",
             section("Postes à lancer", ", ".join(postes) + ("\n\nÉcartés : " + " ; ".join(ecartes) if ecartes else "")),
             perimetre(), lecture(), rejoue(),
             section("Ticket", open(dossier("ticket.md"), encoding="utf-8").read() if os.path.exists(dossier("ticket.md")) else "")]
    if os.path.exists(dossier("retours.md")):
        parts.append(section("Retours de l'humain (à respecter en priorité)", open(dossier("retours.md"), encoding="utf-8").read()))
    for d in ("cadrage", "schema"):
        r = load(d + ".json")
        if r:
            parts.append(section(f"Rapport du poste {d}", json.dumps(r.get("resultat") or r, ensure_ascii=False, indent=1)[:10000]))
    parts.append(section("Fichiers modifiés", "\n".join(files)))
    parts.append(section("Plan validé", json.dumps((load("plan.json") or {}).get("lots") or [], ensure_ascii=False, indent=1)[:6000]))
    parts.append(section("Volume du diff", git("diff", "--stat", f"{depart()}...HEAD")[-3000:]))
    if "regles" in postes:
        v = verifie("regles", files)
        parts.append(section("Vérifications des règles lancées (0 token, pour le poste regles)", json.dumps(v, ensure_ascii=False, indent=1)[-8000:]))
    for p in postes:
        c = correction(p)
        if c:
            parts.append(c.replace("## Tour suivant : la correction", f"## Tour suivant, poste {p} : la correction"))
    out("".join(parts))


def cmd_range():
    """Les rapports des sous-agents (stdin : la sortie de l'étape parallèle) rangés poste par poste ; un poste lancé sans
    rapport est noté en panne (le bilan le signale)."""
    d = parse(read_stdin()) or {}
    postes = (load("missions.json") or {}).get("postes") or []
    res = {}
    for p in postes:
        prop = d.get(p) if isinstance(d, dict) else None
        if isinstance(prop, dict) and ("constats" in prop or "exigences" in prop or "resume" in prop):
            prop.setdefault("constats", [])
            res[p] = ecrit_rapport(p, prop)["statut"]
        else:
            write_json(dossier(p + ".json"), {"poste": p, "statut": "en_panne", "raison": "aucun rapport du sous-agent"})
            res[p] = "en_panne"
    out({"postes": res})


def cmd_dossier():
    """Le dossier pour l'orchestrateur, dans son prompt : il n'a aucun fichier à lire (essai du 2026-10-30 : une lecture
    du dossier par l'agent a été coupée par les garde-fous de l'API)."""
    parts = [perimetre(), lecture(), rejoue(), section("Ticket", open(dossier("ticket.md"), encoding="utf-8").read() if os.path.exists(dossier("ticket.md")) else "")]
    if os.path.exists(dossier("retours.md")):
        parts.append(section("Retours de l'humain", open(dossier("retours.md"), encoding="utf-8").read()))
    for p in ("cadrage", "schema", "patterns"):
        r = load(p + ".json")
        body = json.dumps({"proposition": r.get("resultat"), "critique": r.get("critique")}, ensure_ascii=False, indent=1)[:16000] \
            if r else "ABSENT : poste en panne, fais son travail toi-même et dis-le dans decisions"
        parts.append(section(f"Rapport du poste {p}", body))
    out("".join(parts))


def liste(items):
    return "\n".join(f"- {x}" for x in items if x) or "- (rien)"


def cmd_questions():
    """« ✋ Ce que j'ai compris » : la compréhension du cadrage, à chaque ticket, pour ta gate (sortie 0 : l'étape suivante
    est la gate). Changements = ta correction repart au cadrage, autant de tours que tu veux. impl.gate_cadrage false :
    la gate ne s'ouvre que pour une question bloquante, un dépôt hors périmètre ou un critique pas d'accord (sinon code 3,
    saut au schéma). Essai d'EW-6550 : le cadrage avait compris de travers et son critique l'avait dit, la chaîne a filé."""
    r = load("cadrage.json") or {}
    c = r.get("resultat") or {}
    crit = r.get("critique") or {}
    qs = [q for q in c.get("questions") or [] if isinstance(q, dict) and q.get("question")]
    bloq = [q for q in qs if q.get("bloquante")]
    desaccord = str(crit.get("verdict") or "").lower() in ("revoir", "a_revoir", "rejet") and crit.get("remarques")
    hors = c.get("concerne") is False
    parts = []
    if hors:
        parts.append(f"**🚫 Rien à faire dans {etat().get('repo')} ?** {c.get('hors_perimetre') or '(sans raison)'}\n"
                     "Rejeter : ce bureau s'arrête sans PR. Approuver : on continue quand même.")
    parts.append("**🎯 Compréhension**\n" + (c.get("comprehension") or c.get("resume") or "(absente)"))
    if c.get("inclus") or c.get("exclus"):
        parts.append("**📦 Inclus**\n" + liste(c.get("inclus") or []) + "\n\n**🚧 Exclus**\n" + liste(c.get("exclus") or []))
    parts.append("**✅ Critères d'acceptation**\n" + liste(c.get("criteres_acceptation") or []))
    if qs:
        parts.append("**❓ Questions**\n" + "\n".join(
            f"{i}. {'(bloquante) ' if q.get('bloquante') else ''}{q.get('question')}"
            + (f"\n   Hypothèse si pas de réponse : {q['hypothese']}" if q.get("hypothese") else "") for i, q in enumerate(qs, 1)))
    if desaccord:
        parts.append("**⚠️ Le critique n'est pas d'accord** (3 propositions faites, ses remarques restent)\n" + liste(crit["remarques"]))
    print("\n\n".join(parts))
    if impl().get("gate_cadrage") is False and not (bloq or desaccord or hors):
        sys.exit(3)


def garde():
    """Copie du dossier dans ~/.cache/pixel-bureau/chaine/<ticket>/<run>/ : Kronn supprime la copie de travail d'un run."""
    e = etat()
    if not e.get("ticket"):
        return ""
    dest = os.path.join(os.path.expanduser("~/.cache/pixel-bureau/chaine"), e["ticket"], str(e.get("run") or "run")[:8])
    copie(dossier(), dest)
    return dest


def cmd_mode(mode):
    """Plan seulement : code 4, saut au commentaire Jira (dernière étape) puis Stop. Complet ou essai : code 0, le poste
    Code suit dans l'ordre. Essai d'EW-6550 : Kronn reprend un « Changements » de gate à l'étape qui SUIT la dernière
    gardée ; avec commente_plan juste après mode, un retour au Code a posté le plan dans Jira en mode essai."""
    avance("code")  # plan validé : une reprise (même en plan seulement, relancé en complet) repart au Code
    if (mode or "plan").strip().lower() in ("plan", "plan seulement", "plan_seulement"):
        print(f"Plan seulement : le plan part en commentaire du ticket, puis la chaîne s'arrête. Dossier gardé : {garde()}")
        sys.exit(4)
    print("Mode " + ("essai : tout jusqu'à la PR, sans rien pousser ni écrire dans Jira." if essai() else "complet : au poste Code."))


def essai():
    """Mode essai : la chaîne entière, sans effet externe (ni push, ni PR, ni Jira) : le shadow de Kronn ne sait pas
    rejouer un workflow à variables (instantané chiffré rangé sous l'id du run normal)."""
    return (etat().get("mode") or "").strip().lower() == "essai"


def sauter(what):
    if essai():
        print(f"Mode essai : {what} sauté, rien n'est envoyé.")
        return True
    return False


def given(v):
    v = (v or "").strip()
    return bool(v) and not v.startswith("{" + "{")


def cmd_plan(consignes="", retours=""):
    """Ce que le poste Code a à faire, en une session : le plan en lots au premier passage, sinon les consignes de
    l'orchestrateur ou les retours de l'humain (mode correction). Toujours code 0 : l'étape code suit."""
    # le commentaire d'une approbation arrive aussi dans retours (essai du 2026-10-30) : au premier passage du Code, il
    # s'ajoute au dossier mais ne déclenche pas le mode correction ; ensuite, consignes ou retours = correction
    e = etat()
    cons = consignes if given(consignes) else e.get("consignes_reprise") or ""
    if cons or (given(retours) and os.path.exists(dossier("code.json"))):
        out("MODE CORRECTION : pas de nouveau découpage, traite ces points dans l'ordre, un commit par sujet."
            + section("Consignes de l'orchestrateur", cons or "(aucune)")
            + section("Retours de l'humain", retours if given(retours) else "(voir le dossier)")
            + section("Rapports des contrôles", "Lis `.kronn/chaine/controles.json` et `.kronn/chaine/<poste>.json`."))
        return
    plan = parse(read_stdin())
    if not plan and load("plan.json"):  # reprise : le plan validé au run d'avant ; les lots déjà commités restent
        plan = load("plan.json")
        deja = git("log", "--oneline", f"{depart()}..HEAD")
        out("PLAN DU RUN D'AVANT (reprise) : des lots sont peut-être déjà commités, ne les refais pas.\n\nCommits déjà faits :\n"
            + (deja or "(aucun)") + "\n\nLots :\n" + json.dumps(plan.get("lots") or [], ensure_ascii=False, indent=1))
        return
    plan = plan or {}
    lots = [x for x in plan.get("lots") or [] if isinstance(x, dict)][: int(impl().get("max_lots") or 6)]
    for i, x in enumerate(lots, 1):
        x["n"] = i
    plan["lots"] = lots
    write_json(dossier("plan.json"), plan)
    out(f"PLAN VALIDÉ : {len(lots)} lot(s), un commit par lot, dans l'ordre.\n\n" + json.dumps(lots, ensure_ascii=False, indent=1))


def fill(check, files, wt=None):
    """Une commande de vérification : chaîne, ou {cmd, subdir} (chemins relatifs à ce sous-dossier, fichiers hors de lui
    écartés). Emplacements : {worktree}, {main}, {base}, {files}, {php}, {ts}, {tests}, {tests_php}, {tests_ts}."""
    cmd, sub = (check, "") if isinstance(check, str) else (check.get("cmd") or "", (check.get("subdir") or "").strip("/"))
    if sub:
        files = [f[len(sub) + 1:] for f in files if f.startswith(sub + "/")]
    files = [f for f in files if os.path.exists(os.path.join(wt or root(), sub, f))]  # absents (supprimés, ou nouveaux au départ)
    main = ""
    common = git("rev-parse", "--path-format=absolute", "--git-common-dir")
    if common.endswith("/.git"):
        main = common[:-5]
    kinds = {"files": files, "php": [f for f in files if f.endswith(".php")],
             "ts": [f for f in files if re.search(r"\.(ts|tsx|js|vue)$", f)],
             "tests": [f for f in files if re.search(r"(test|spec)", f, re.I)],
             "tests_php": [f for f in files if f.endswith("Test.php")],
             "tests_ts": [f for f in files if re.search(r"\.(test|spec)\.(ts|tsx|js)$", f)]}
    rep = {"worktree": wt or root(), "main": main, "base": etat().get("base") or "main"}
    rep.update({k: " ".join(v) for k, v in kinds.items()})
    for k, v in rep.items():
        cmd = cmd.replace("{" + k + "}", v)
    return cmd, kinds


def norm(txt):
    """Lignes d'une sortie de vérification sans chiffres ni chemins de copie de travail : une erreur déjà là au départ
    se retrouve à l'identique, même décalée de quelques lignes."""
    out_ = set()
    for ln in (txt or "").splitlines():
        ln = re.sub(r"\x1b\[[0-9;]*m", "", ln)
        ln = re.sub(r"/\S*?/(?=application/|src/|tests/)", "", ln)
        ln = re.sub(r"\d+", "#", ln).strip(" -|─━═│┃")
        if len(ln) > 8 and not re.fullmatch(r"[#\s:.,/()%a-z]*", ln):
            out_.add(ln)
    return out_


def lance(cmd, cwd):
    try:
        r = subprocess.run(["sh", "-c", cmd], cwd=cwd, capture_output=True, text=True, timeout=900)
        return r.returncode, (r.stdout + r.stderr)
    except subprocess.TimeoutExpired:
        return 124, "délai dépassé (15 min)"


def base_worktree():
    """Copie du point de départ (git worktree détaché, dans le dossier) pour relancer une vérification rouge : ce qui
    était déjà rouge au départ n'est pas à corriger (essai d'EW-6550 : PHPStan signalait des erreurs anciennes des
    fichiers touchés, le Code bouclait dessus)."""
    path = dossier("depart")
    if not os.path.isdir(os.path.join(path, ".git")) and not os.path.isfile(os.path.join(path, ".git")):
        if os.path.exists(path):
            subprocess.run(["rm", "-rf", path])
        if not git_ok("worktree", "add", "--detach", "-f", path, depart()):
            return None
    return path


def verifie(phase, files=None):
    files = changed() if files is None else files
    checks = ((reglages().get("checks") or {}).get(phase)) or []
    if not checks:
        return {"ok": True, "phase": phase, "sorties": [], "note": f"aucune vérification « {phase} » réglée pour ce dépôt (impl.repos)"}
    res, ok = [], True
    for c in checks:
        raw = c if isinstance(c, str) else c.get("cmd") or ""
        need = re.findall(r"\{(php|ts|tests|tests_php|tests_ts|files)\}", raw)
        cmd, kinds = fill(c, files)
        if need and not any(kinds[k] for k in need):
            res.append({"cmd": raw[:200], "saute": "aucun fichier concerné"})
            continue
        code, txt = lance(cmd, root())
        item = {"cmd": raw[:200], "code": code, "sortie": txt[-6000:]}
        if code:  # rouge : est-ce déjà rouge au point de départ, sur les mêmes fichiers ?
            base = base_worktree()
            if base:
                bcmd, _ = fill(c, files, base)
                bcode, btxt = lance(bcmd, base)
                nouveaux = sorted(norm(txt) - norm(btxt))
                if bcode and not nouveaux:
                    item.update(code=0, deja_la=True, note="rouge, mais déjà rouge au point de départ : rien de nouveau")
                elif bcode:
                    item["nouveau"] = nouveaux[:60]
        ok = ok and not item["code"]
        res.append(item)
    return {"ok": ok, "phase": phase, "sorties": res}


def cmd_verif(phase):
    out(verifie(phase))


def cmd_tri_code():
    """Après les vérifications et la relecture : code 4 = le Code reprend (3 essais, compteur du script : un Goto épuisé
    sur un code non nul fait échouer l'étape), 0 = fini (encore rouge au 3e essai : les contrôles trancheront)."""
    raw = read_stdin().split(SEP)
    v, rel = parse(raw[0]) or {}, parse(raw[1]) if len(raw) > 1 else None
    st = load("essais_code.json", {"n": 0}) or {"n": 0}
    st["n"] += 1
    write_json(dossier("essais_code.json"), st)
    bad = (not v.get("ok", True)) or str((rel or {}).get("verdict") or "").lower() == "revoir"
    if bad and st["n"] < 3:
        print(f"Code : à reprendre (essai {st['n']} sur 3)")
        sys.exit(4)
    st["note"] = "vérifs rouges ou relecture « revoir » après 3 essais : laissé aux contrôles" if bad else "ok"
    write_json(dossier("essais_code.json"), st)
    print("Code : terminé" + (" (encore rouge, les contrôles trancheront)" if bad else ""))


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
    log = git("log", "--oneline", f"{depart()}..HEAD")
    st = load("essais_code.json") or {}
    rep = {"poste": "code", "statut": "ok" if log else "vide", "commits": log.splitlines(), "fichiers": changed(), "note": st.get("note")}
    write_json(dossier("code.json"), rep)
    for c in CONTROLES:  # nouveau code : les contrôles sont à refaire ; leur rapport sert au tour suivant (correction)
        if os.path.exists(dossier(c + ".json")):
            os.replace(dossier(c + ".json"), dossier(f"precedent_{c}.json"))
    for f in ("controles.json", "quoi.json", "missions.json", "essais_code.json"):
        if os.path.exists(dossier(f)):
            os.remove(dossier(f))
    avance("controles", consignes_reprise="")
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
    avance("orchestrateur", controle_sha=git("rev-parse", "HEAD"))
    code = load("code.json") or {}
    out({**rep, "code": {"commits": code.get("commits"), "fichiers": code.get("fichiers"), "note": code.get("note")},
         "tours": etat().get("tours", 0), **({"essai_rejoue": rejoue().strip()} if etat().get("depart") else {})})  # tout ce que l'orchestrateur lit, sans fichier à ouvrir


def cmd_aiguillage():
    d = parse(read_stdin()) or {}
    e = etat()
    e["tours"] = int(e.get("tours") or 0) + 1
    write_json(dossier("etat.json"), e)
    write_json(dossier("orchestrateur.json"), d)
    dec = str(d.get("decision") or "").lower()
    maxt = int(impl().get("max_tours") or 3)
    if dec == "livrer":
        avance("livraison")
        print(f"Tour {e['tours']} : l'orchestrateur livre.")
        sys.exit(3)
    if dec == "retour_code" and e["tours"] < maxt:
        avance("code")
        print(f"Tour {e['tours']} sur {maxt} : retour au poste Code avec les consignes de l'orchestrateur.")
        sys.exit(4)
    avance("escalade")
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
    if sauter("push de la branche"):
        return
    e = etat()
    git("push", "--no-verify", "--force-with-lease", "origin", f"HEAD:{e['branch']}", check=True)
    print(f"{e['branch']} poussée")


SOEURS = re.compile(r"\n*<!-- bureau-soeurs -->.*?<!-- /bureau-soeurs -->", re.S)


def pr_of(repo, branch):
    code, o, _ = gh("pr", "list", "-R", repo, "--head", branch, "--state", "all", "--json", "number", "-q", ".[0].number")
    return o if code == 0 and o.isdigit() else ""


def soeurs_md(ticket, repos, prs):
    """Bloc « PR sœurs » d'une PR : les autres dépôts du ticket, leur PR si elle est ouverte."""
    rows = [f"- {r} : " + (f"https://github.com/{r}/pull/{prs[r]}" if prs.get(r) else f"pas encore ouverte (branche `kronn/{ticket}`)")
            for r in repos]
    return ("\n\n<!-- bureau-soeurs -->\n### PR sœurs\n\nCe ticket touche plusieurs dépôts : une PR par dépôt, à relire et à "
            "mettre en prod ensemble.\n\n" + "\n".join(rows) + "\n<!-- /bureau-soeurs -->")


def lie_soeurs(e, n):
    """Notre PR ajoutée au bloc « PR sœurs » des PR déjà ouvertes des autres dépôts (chacune liste toutes les autres)."""
    tous = [e["repo"]] + e["soeurs"]
    prs = {r: pr_of(r, f"kronn/{e['ticket']}") for r in e["soeurs"]}
    prs[e["repo"]] = n
    for r, m in prs.items():
        if r == e["repo"] or not m:
            continue
        code, body, _ = gh("pr", "view", m, "-R", r, "--json", "body", "-q", ".body")
        if code:
            continue
        path = dossier(f"pr_soeur_{r.replace('/', '__')}.md")
        write_text(path, SOEURS.sub("", body) + soeurs_md(e["ticket"], [x for x in tous if x != r], prs))
        gh("pr", "edit", m, "-R", r, "--body-file", path)
    return prs


ETATS = {"fait": "✅ livré", "partiel": "🟡 partiel", "non": "❌ pas fait", "autrement": "🔀 autrement", "hors_scope": "⏭️ hors scope"}
NOMS = {"regles": "📏 règles", "securite": "🔒 sécurité", "tests": "🧪 tests", "perf": "⚡ perf", "revue": "🔁 revue", "besoin": "🎯 besoin"}


ANSI = re.compile(r"\x1b\[[0-9;]*m|\[[0-9;]{1,8}m")


def cellule(x, n=None):
    """Une ligne de tableau ou de liste Markdown : sans codes couleur de terminal, sans retour à la ligne, tronquée."""
    s = " ".join(ANSI.sub("", str(x or "")).split()).replace("|", "\\|")
    return s if not n or len(s) <= n else s[: n - 1] + "…"


def bloc(nom, corps):
    return f"<!-- bureau-{nom} -->\n{corps}\n<!-- /bureau-{nom} -->" if corps else ""


def exigences_md():
    """Le tableau exigence par exigence, tiré du rapport du poste 🎯 Besoin (pas réécrit par l'agent qui rédige)."""
    ex = [x for x in ((load("besoin.json") or {}).get("resultat") or {}).get("exigences") or [] if isinstance(x, dict)]
    if not ex:
        return ""
    return ("## 📋 Ce que le ticket demandait, et où ça atterrit\n\n| Exigence | État | Détail |\n|---|---|---|\n"
            + "\n".join(f"| {cellule(x.get('exigence'))} | {ETATS.get(x.get('etat'), cellule(x.get('etat')))} | {cellule(x.get('detail'))} |"
                        for x in ex))


def points_md():
    """Points ouverts : bloquants restés (gate d'escalade approuvée) et avis des contrôles, écrits par le script. Essai
    d'EW-7945 : l'orchestrateur disait « à reporter dans la PR », le rédacteur les a omis et la PR annonçait « qat retiré »."""
    c = load("controles.json") or {}
    rows, seen = [], set()
    for kind, items in (("bloquant", c.get("bloquants") or []), ("avis", c.get("avis") or [])):
        for x in items:
            where = f"`{x.get('fichier')}" + (f":{x.get('ligne')}" if x.get("ligne") else "") + "` : " if x.get("fichier") else ""
            key = (where, str(x.get("probleme"))[:120])
            if key in seen or not x.get("probleme"):
                continue
            seen.add(key)
            rows.append(f"- {'**Bloquant** ' if kind == 'bloquant' else ''}({NOMS.get(x.get('poste'), x.get('poste'))}) {where}"
                        f"{cellule(x.get('probleme'), 600)}" + (f" ; piste : {cellule(x.get('correction'), 600)}" if x.get("correction") else ""))
    if not rows:
        return ""
    more = f"\n- … et {len(rows) - 15} autres (rapports des contrôles)" if len(rows) > 15 else ""
    return "## ⚠️ Points ouverts\n\nRelevés par les contrôles de la chaîne, non corrigés dans cette PR.\n\n" + "\n".join(rows[:15]) + more


def place(body, nom, corps):
    """Le bloc généré à l'emplacement <!-- bureau-<nom> --> laissé par le rédacteur, sinon à la fin."""
    body = re.sub(rf"<!-- bureau-{nom} -->.*?<!-- /bureau-{nom} -->", f"<!-- bureau-{nom} -->", body, flags=re.S)
    if not corps:
        return body.replace(f"<!-- bureau-{nom} -->", "")
    if f"<!-- bureau-{nom} -->" in body:
        return body.replace(f"<!-- bureau-{nom} -->", bloc(nom, corps), 1)
    return body.rstrip() + "\n\n" + bloc(nom, corps)


def cmd_pr():
    d = parse(read_stdin()) or {}
    e = etat()
    sisters = e.get("soeurs") or []
    prs = {} if essai() else {r: pr_of(r, f"kronn/{e['ticket']}") for r in sisters}
    body = place(place(SOEURS.sub("", d.get("body") or ""), "exigences", exigences_md()), "points", points_md())
    body += (soeurs_md(e["ticket"], sisters, prs) if sisters else "") + "\n\n<!-- bureau-chaine -->"
    path = dossier("pr_body.md")
    write_text(path, body)
    if sauter("création de la PR"):  # le titre et la description restent dans le dossier (pr_body.md)
        print(f"Titre : {d.get('title')}\nDescription : .kronn/chaine/pr_body.md ({len(body)} caractères)")
        return
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
    linked = [r for r, m in (lie_soeurs(e, n) if sisters else {}).items() if m and r != e["repo"]]
    print(f"PR #{n} (brouillon) : https://github.com/{e['repo']}/pull/{n}" + (f" ; liée à ses sœurs : {', '.join(linked)}" if linked else ""))


def cmd_revue_prep():
    """Revue de la PR par le modèle de revue du Bureau (sous-workflow en foreach) : la PR en .kronn/prs.json. Mode essai
    ou pas de PR : code 3, rien n'est relu."""
    e = etat()
    n = e.get("pr") or ("" if essai() else pr_number())
    if essai() or not n:
        print("Mode essai : pas de PR à relire." if essai() else "Aucune PR ouverte : rien à relire.")
        sys.exit(3)
    _, me, _ = gh("api", "user", "--jq", ".login")
    os.makedirs(os.path.join(root(), ".kronn"), exist_ok=True)
    write_json(os.path.join(root(), ".kronn", "prs.json"), [{"number": int(n), "author": me, "repo": e["repo"]}])
    print(f"PR #{n} confiée à la revue")


def cmd_retours_lire():
    """Commentaires de revue de la PR qui n'ont pas encore de réponse (fils ouverts) ; aucun, ou mode essai : code 3."""
    e = etat()
    n = e.get("pr") or ("" if essai() else pr_number())
    if essai() or not n:
        print("Mode essai : pas de retours à traiter." if essai() else "Aucune PR ouverte : pas de retours.")
        sys.exit(3)
    code, o, err = gh("api", f"repos/{e['repo']}/pulls/{n}/comments", "--paginate")
    try:
        cs = json.loads(o) if code == 0 and o else []
    except ValueError:
        cs = []
    answered = {c.get("in_reply_to_id") for c in cs if c.get("in_reply_to_id")}
    todo = [{"id": c["id"], "path": c.get("path"), "line": c.get("line") or c.get("original_line"), "body": (c.get("body") or "")[:3000]}
            for c in cs if not c.get("in_reply_to_id") and c["id"] not in answered]
    if not todo:
        print(f"PR #{n} : aucun commentaire sans réponse")
        sys.exit(3)
    write_json(dossier("retours.json"), {"pr": n, "fils": todo})
    out({"pr": n, "fils": todo})


def cmd_reponds():
    """Réponses de l'agent dans les fils de la PR (gh) ; mode essai : rien n'est posté."""
    d = parse(read_stdin()) or {}
    replies = [r for r in d.get("replies") or [] if isinstance(r, dict) and r.get("commentId") and r.get("body")]
    if sauter("réponses dans les fils de la PR"):
        return
    e = etat()
    n = e.get("pr") or pr_number()
    ok = 0
    for r in replies:
        code, _, _ = gh("api", "-X", "POST", f"repos/{e['repo']}/pulls/{n}/comments/{r['commentId']}/replies", "-f", f"body={r['body']}")
        ok += code == 0
    st = load("retours.json", {}) or {}
    st.update({"reponses": ok, "resume": d.get("resume")})
    write_json(dossier("retours.json"), st)
    print(f"PR #{n} : {ok} réponse(s) postée(s) sur {len(replies)}")


def cmd_pret():
    avance("publication")
    if sauter("passage en prête"):
        return
    e = etat()
    n = e.get("pr") or pr_number()
    code, _, err = gh("pr", "ready", n, "-R", e["repo"])
    print(f"PR #{n} prête à relire" if code == 0 else f"PR #{n} : passage en prête impossible ({err[:200]})")


def cmd_reviewers():
    if sauter("demande de relecture et commentaire Jira"):
        sys.exit(5)  # code 5 : le modèle saute l'étape Jira qui suit
    e, reg = etat(), reglages()
    n = e.get("pr") or pr_number()
    who = [r for r in reg.get("reviewers") or [] if r]
    if who:
        gh("pr", "edit", n, "-R", e["repo"], "--add-reviewer", ",".join(who))
    url = f"https://github.com/{e['repo']}/pull/{n}"
    out(f"PR prête à relire : [{url}|{url}] (chaîne d'implémentation du Bureau, {e.get('tours', 0)} tour(s) de contrôle, revue IA traitée).")


def cmd_fin():
    """Fin du poste PR (ta relecture attend) ou de la publication (le ticket est au bout de la chaîne)."""
    avance("fini" if etat().get("etape") == "publication" else "relecture")
    if os.path.exists(dossier("depart")):  # copie du point de départ des vérifications : plus utile
        git("worktree", "remove", "--force", dossier("depart"))
    e = etat()
    e["dossier"] = garde()
    out({"ticket": e.get("ticket"), "repo": e.get("repo"), "pr": e.get("pr"), "tours": e.get("tours"), "dossier": e["dossier"],
         "retours": (load("retours.json") or {}).get("reponses")})


def main(argv):
    cmd, args = (argv[1] if len(argv) > 1 else ""), argv[2:]
    simple = {"releve": cmd_releve, "dossier": cmd_dossier, "existe": cmd_existe, "questions": cmd_questions, "missions": cmd_missions,
              "range": cmd_range, "tri_code": cmd_tri_code, "tri_tests": cmd_tri_tests, "bilan_code": cmd_bilan_code, "quoi": cmd_quoi,
              "bilan_controles": cmd_bilan_controles,
              "aiguillage": cmd_aiguillage, "pousse": cmd_pousse, "pr": cmd_pr, "pret": cmd_pret,
              "reviewers": cmd_reviewers, "fin": cmd_fin, "revue_prep": cmd_revue_prep, "retours_lire": cmd_retours_lire,
              "reponds": cmd_reponds}
    if cmd in simple:
        return simple[cmd]()
    if cmd == "lance":
        return cmd_lance(*(args + ["", "", "", ""])[:4])
    if cmd == "prepare":
        return cmd_prepare(*(args + [""] * 8)[:8])
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
    try:
        main(sys.argv)
    finally:  # même en sortie 3/4/5 ou en erreur : la reprise relit le dossier dans le cache
        if len(sys.argv) > 1 and sys.argv[1] != "lance":
            try:
                sauve()
            except OSError:
                pass
