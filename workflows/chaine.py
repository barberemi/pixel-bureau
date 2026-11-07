"""Implémenter un ticket en chaîne de postes (#76, #125) : une sous-commande par étape Exec des modèles impl_*.json, 0 token.

La chaîne est en trois scripts, chacun passé à Kronn en un argument `python3 -c` (Linux : 128 Kio au plus par argument) :
chaine.py (dossier, postes, Code, bilan), chaine_controles.py (contrôles, aiguillage), chaine_pr.py (lanceur, PR, revue, retours, publication) ; le commun est dans _chaine.py, recopié dans chacun au rendu.

chaine.py : dossier, postes et Code.

  prepare <ticket> <mode> <run> [variante] [dépôt] [sœurs] [reprise] [base]
                                    # base : branche ou commit d'où rejouer le ticket (essai) ; stdin ticket Jira : dossier, réglages du dépôt, branche kronn/<ticket> ; en reprise,
                                    # dossier et branche du run d'avant, code 3/4/5 : on reprend au Code/aux contrôles/à la PR
  entree <poste> <ticket> [retours] [extra]
                                    # contexte du poste ; retours d'une gate ajoutés au dossier ; code 3 : poste non concerné
                                    # ou déjà fait (reprise) ; code 5 : poste Plan (cadrage) déjà fait (reprise), Code
                                    # en mode essai (affecter sauté), PR déjà ouverte (reprise)
  releve                            # poste Plan : fichiers du dépôt qui parlent du ticket (git grep), 0 token
  existe                            # stdin proposition du poste Plan : chemins cités qui n'existent pas
  rapport <poste>                   # stdin proposition ===SEP=== vérification : rapport du poste dans le dossier
  dossier                           # rapport du poste Plan (cadrage.json) pour le prompt de l'orchestrateur
  compris                           # « ce que j'ai compris » et les questions à trancher, en tête de ta gate du plan
  mode <plan|complet|essai>         # code 4 : plan seulement (commentaire Jira puis Stop), code 0 : on code
  plan [consignes] [retours]        # stdin plan de l'orchestrateur : plan.json en lots ; consignes ou retours : code 3
  lot                               # lot suivant du plan ; code 3 : plus de lot
  verif <regles|tests>              # commandes de vérification du dépôt (réglage impl.repos), en conteneur si réglé
  tri_lot                           # stdin vérif ===SEP=== relecture : code 4 = refaire le lot (3 essais), 0 = lot fini
  tri_tests                         # stdin lancement des tests : code 4 = le poste Tests reprend (3 essais)
  bilan_code                        # commits et fichiers de la branche
  rattrape_code                     # stdin dernière sortie du Code en échec : garde-fou docs de Kronn avec le travail fini
                                    # et commité, bilan du Code puis code 4 (contrôles) ; sinon code 1
  bilan                             # bilan du run (historique de la page « Chaîne · bilan »), aussi écrit après chaque étape
"""
import fnmatch, hashlib, json, os, re, shlex, subprocess, sys, time
from _lib import CFG, get, read_json, send, write_json, write_text
from _chaine import *  # noqa: F401,F403  (recopié au rendu, comme _lib)

SEP = "\n===SEP===\n"


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


REMONTES = {"description": "description", "summary": "summary"}  # champ du changelog Jira -> champ du ticket


def a_la_date(t, avant):
    """Le ticket tel qu'il était à la date `avant` (essai rejoué) : les changements de description et de titre postérieurs
    sont défaits un par un, du plus récent au plus ancien, depuis l'historique Jira (expand=changelog : items field,
    fromString). Banc d'essai du 5 novembre : la description réécrite après l'ouverture de la PR humaine (décisions
    produit) donnait à la chaîne une « info du futur ». Rend (ticket, champs remontés)."""
    f = dict(t.get("fields") or {})
    hist = [h for h in (t.get("changelog") or {}).get("histories") or [] if isinstance(h, dict) and quand(h.get("created"))]
    remontes = set()
    for h in sorted(hist, key=lambda h: quand(h.get("created")), reverse=True):
        if quand(h.get("created")) <= avant:
            break
        for it in h.get("items") or []:
            k = REMONTES.get(str(it.get("field") or "").lower())
            if k:
                f[k] = it.get("fromString") or ""
                remontes.add(k)
    return {**t, "fields": f}, sorted(remontes)


def ticket_md(t, avant=None, remontes=()):
    """Le ticket en Markdown ; essai rejoué (avant = date du commit rejoué) : ni statut ni commentaire postérieur,
    essai d'EW-7945 : le retour d'usage de l'IA, posté après la livraison, donnait ses suites à la PR."""
    f = t.get("fields") or {}
    statut = "(essai rejoué : statut masqué)" if avant else (f.get('status') or {}).get('name') or '?'
    lines = [f"# {t.get('key')} : {f.get('summary') or ''}", "",
             f"- Type : {(f.get('issuetype') or {}).get('name') or '?'} ; priorité : {(f.get('priority') or {}).get('name') or '?'}"
             f" ; statut : {statut}",
             f"- Composants : {', '.join(c.get('name', '') for c in f.get('components') or []) or 'aucun'}",
             f"- Labels : {', '.join(f.get('labels') or []) or 'aucun'}", "", "## Description", ""]
    if remontes:
        lines += [f"(essai rejoué : {' et '.join({'summary': 'titre', 'description': 'description'}[k] for k in remontes)} tels qu'au "
                  f"{avant:%Y-%m-%d %H:%M} UTC, reconstruits depuis l'historique Jira)", ""]
    lines.append(f.get("description") or "(vide)")
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


# étape atteinte (etat.json « etape ») -> où la reprise repart : 0 du début (postes déjà faits sautés), 3 au Code,
# 4 aux contrôles (ceux déjà faits sautés), 5 à la PR (déjà ouverte : droit à ta relecture)
REPRISE = {"code": 3, "controles": 4, "orchestrateur": 4, "escalade": 4, "livraison": 5, "relecture": 5, "publication": 5}


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


# Lanceur du poste 🧪 Tests (0 token) : checks.tests du dépôt sur les fichiers donnés, sortie coupée aux échecs, plafonné.
TESTE = r"""import json, os, re, shlex, subprocess, sys
D = os.path.dirname(os.path.abspath(__file__))
P = os.path.join(D, "teste.json")
c = json.load(open(P))
if c["lances"] >= c["max"]:
    print("Plafond de %d lancements atteint : ne lance plus rien. Rends tes constats ; les contre-épreuves restantes sont "
          "« non éprouvées »." % c["max"])
    sys.exit(2)
wt = os.path.realpath(c["wt"])
fs = [os.path.relpath(os.path.realpath(a), wt) for a in sys.argv[1:]]
if not fs:
    sys.exit("usage : python3 " + os.path.relpath(__file__, wt) + " <fichier de test> [autres]")
K = {"files": r".", "php": r"\.php$", "ts": r"\.(ts|tsx|js|vue)$", "tests": r"(?i)(test|spec)", "tests_php": r"Test\.php$",
     "tests_ts": r"\.(test|spec)\.(ts|tsx|js)$"}
outs, code = [], 0
for ch in c["checks"]:
    cmd, sub = ch["cmd"], ch["subdir"]
    mine = [f[len(sub) + 1:] if sub else f for f in fs if not sub or f.startswith(sub + "/")]
    mine = [f for f in mine if os.path.exists(os.path.join(wt, sub, f))]
    need = re.findall(r"\{(" + "|".join(K) + r")\}", cmd)
    got = dict((k, [f for f in mine if re.search(v, f)]) for k, v in K.items())
    if not mine or need and not any(got[k] for k in need):  # sans emplacement : toute la commande, si un fichier est à elle
        continue
    for k in K:
        cmd = cmd.replace("{" + k + "}", " ".join(shlex.quote(f) for f in got[k]))  # noms venus du dépôt : cités pour sh
    try:
        r = subprocess.run(["sh", "-c", cmd], cwd=wt, capture_output=True, text=True, timeout=900)
        rc, txt = r.returncode, r.stdout + r.stderr
    except subprocess.TimeoutExpired:
        rc, txt = 124, "délai dépassé (15 min)"
    outs.append(txt)
    code = code or rc
if not outs:
    print("Aucune commande de test réglée ne prend ces fichiers (chemin depuis la racine du dépôt ?) : rien lancé, rien compté.")
    sys.exit(1)
c["lances"] += 1
json.dump(c, open(P, "w"))
full = re.sub(r"\x1b\[[0-9;]*m", "", "\n".join(outs))
open(os.path.join(D, "teste_sortie.txt"), "w").write(full)
L = [x for x in full.splitlines() if x.strip()]
reste = "(%d/%d lancements)" % (c["lances"], c["max"])
if not code:
    print("VERT " + reste + " : " + " | ".join(L[-2:])[-300:])
    sys.exit(0)
keep, seen = [], set()
for i, x in enumerate(L):
    if re.search(r"(?i)fail|error|exception|assert|expected|✗|×", x):
        for y in L[i:i + 3]:
            if y not in seen:
                seen.add(y)
                keep.append(y)
txt = "\n".join(keep[:50] + ["…"] + L[-4:])
print("ROUGE " + reste + " :\n" + txt[:3500] + "\n(sortie complète : " + os.path.relpath(os.path.join(D, "teste_sortie.txt"), wt) + ")")
sys.exit(1)
"""


def teste_ecrit():
    """Lanceur du poste Tests et ses commandes ; None sans checks.tests."""
    checks = (reglages().get("checks") or {}).get("tests") or []
    if not checks:
        return None
    q = lambda v: shlex.quote(v) if v else ""  # cités pour sh : la branche de base vient de la PR
    rep = {"worktree": q(root()), "main": q(main_dir()), "base": q(etat().get("base") or "main")}
    cmds = []
    for ch in checks:
        cmd, sub = (ch, "") if isinstance(ch, str) else (ch.get("cmd") or "", (ch.get("subdir") or "").strip("/"))
        for k, v in rep.items():
            cmd = cmd.replace("{" + k + "}", v)
        cmds.append({"cmd": cmd, "subdir": sub})
    n = int(poste_conf("tests").get("mutations") or 6)
    write_json(dossier("teste.json"), {"checks": cmds, "wt": root(), "lances": 0,
                                       "max": int(poste_conf("tests").get("lancements") or 2 * n + 4)})
    write_text(dossier("teste.py"), TESTE)
    return os.path.relpath(dossier("teste.py"), root())


def tests_budget():
    """Cadre du poste 🧪 Tests (le coût vient des tours) : contre-épreuves et lancements plafonnés, lanceur, tests liés."""
    pc = poste_conf("tests")
    n = int(pc.get("mutations") or 6)
    files = [f for f in changed() if not f.endswith(".md")]
    lies = tests_lies(lambda: git("ls-files"), files)  # relevé commun avec la revue (_releves.py)
    lanceur = teste_ecrit()
    lance = (f"Lance un test avec `python3 {lanceur} <fichier de test> [autres]` (chemins depuis la racine), rien d'autre : "
             "commande réglée du dépôt, conteneur compris (ni docker, ni make, ni `sleep`). Vert : une ligne ; rouge : les "
             "échecs (sortie complète : `.kronn/chaine/teste_sortie.txt`, grep dedans). "
             f"{json.load(open(dossier('teste.json')))['max']} lancements au plus pour tout le poste, contre-épreuves comprises : "
             "au-delà il refuse, rends alors tes constats.") if lanceur else (
             "Lance seulement le fichier de test ciblé (ex. `phpunit tests/…/FooTest.php`, `vitest run foo.test.ts`), sortie "
             "coupée (`2>&1 | tail -40`).")
    return section("Budget du poste (à tenir)",
                   f"Au plus {n} contre-épreuves (mutations), choisies sur les gardes, bornes et retours qui comptent le plus ; "
                   "les autres, note-les « non éprouvées » dans le résumé. " + lance + " Jamais toute la suite, l'analyse "
                   "statique ni un build : l'étape suivante lance les tests du dépôt. Pas d'exploration au-delà des fichiers "
                   "touchés et de leurs tests. Fichier de plus de 300 lignes : `grep -n`, puis Read avec offset et limit ; "
                   "ne relis pas un fichier déjà lu. "
                   f"Vise {int(pc.get('reponses') or 40)} réponses ; à {int(pc.get('reponses') or 40) * 3 // 2}, arrête et rends "
                   "ce que tu as.") + section(
                   "Tests liés aux fichiers touchés (par le nom, 0 token)",
                   "\n".join(f"- {f} : {', '.join(t[:3])}" for f, t in sorted(lies.items())) or
                   "aucun test trouvé par le nom : cherche les tests voisins du fichier touché avant d'en créer un")


def travail_humain(ticket, repos):
    """Essai : branches et PR humaines du ticket (dépôt et sœurs), hors de portée des postes (non_fiable)."""
    out_ = []
    key = ticket.lower()
    for b in git("ls-remote", "--heads", "origin").splitlines():
        ref = b.split("refs/heads/", 1)[-1]
        if key in ref.lower() and not ref.startswith("kronn/"):
            out_.append(f"branche {ref} ({repo_of()})")
    for r in repos:
        try:
            res = subprocess.run(["gh", "pr", "list", "--repo", r, "--state", "all", "--search", ticket, "--json",
                                  "number,headRefName"], capture_output=True, text=True, timeout=30)
            prs = json.loads(res.stdout or "[]") if res.returncode == 0 else []
        except (OSError, ValueError, subprocess.TimeoutExpired):
            prs = []
        out_ += [f"PR {r}#{x['number']} (branche {x['headRefName']})" for x in prs
                 if not str(x.get("headRefName") or "").startswith("kronn/")]
    return sorted(set(out_))


def contrat_soeurs():
    """Plusieurs dépôts : le plan validé des sœurs (cache) et où lire ce qu'elles ont écrit (EW-7901 : clés divergentes)."""
    e = etat()
    if not e.get("soeurs"):
        return ""
    lignes = []
    for r in e["soeurs"]:
        d = cache_dir(e.get("ticket"), r)
        plan = read_json(os.path.join(d, "plan.json")) if d and os.path.exists(os.path.join(d, "plan.json")) else {}
        lots = [f"  - {x.get('titre')} : {cellule(x.get('objectif'), 300)}" for x in (plan or {}).get("lots") or [] if isinstance(x, dict)]
        copie_ = (e.get("lecture") or {}).get(r)
        lignes.append(f"- {r}" + (f", copie locale {copie_}, branche kronn/{e.get('ticket')}" if copie_ else "") + " :\n"
                      + ("\n".join(lots)[:3000] if lots else "  plan pas encore validé"))
    return section("Contrat avec les bureaux sœurs (même nom des deux côtés)",
                   "Les noms échangés entre dépôts (clés, champs, routes, formats) sont identiques des deux côtés : reprends "
                   "ceux déjà écrits sur la branche de la sœur (`git -C <copie> grep <motif> kronn/<ticket>`), sinon fixe-les "
                   "et liste-les dans ton rapport (« Contrat partagé »).\n"
                   + "\n".join(lignes))


def deps_md():
    """Ce que le Code et les Tests savent des dépendances de leur copie de travail."""
    deps = etat().get("deps") or []
    if not deps:
        return ""
    return section("Dépendances déjà là (lance les tests directement)",
                   f"{', '.join(deps)} : liés depuis le checkout principal ({main_dir()}), ni copiés ni commités. Lance les "
                   "tests et l'analyse du dépôt directement dans la copie de travail, sans installer de dépendances ni monter "
                   "de conteneur à la main ; une commande de vérification réglée en conteneur (impl.repos.<dépôt>.checks) "
                   "garde son conteneur. Ne modifie rien dans ces dossiers.")


def default_branch():
    """Branche par défaut du dépôt distant (front_tools est sur master)."""
    m = re.search(r"ref: refs/heads/(\S+)\s+HEAD", git("ls-remote", "--symref", "origin", "HEAD"))
    return m.group(1) if m else ""


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
            e["deps"] = lie_deps(repo=repo)
            write_json(dossier("etat.json"), e)
            print(f"{ticket} sur {repo} : reprise {why}, branche {e.get('branch')}, mode {mode}"
                  + (f", dépendances liées : {', '.join(e['deps'])}" if e["deps"] else ""))
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
    avant, remontes = (quand(git("show", "-s", "--format=%cI", fixed)) if fixed else None), []
    if avant:  # essai rejoué : le ticket tel qu'au commit de départ (description et titre réécrits depuis : défaits)
        t, remontes = a_la_date(t, avant)
    write_text(dossier("ticket.md"), ticket_md(t, avant, remontes))
    docs = git("ls-files", "docs", "AGENTS.md", "CLAUDE.md", ".github/pull_request_template.md").splitlines()
    f = t.get("fields") or {}
    write_json(dossier("etat.json"), {"ticket": ticket, "mode": mode, "repo": repo, "base": base, "branch": branch,
                                      "run": run, "tours": 0, "docs": docs[:200], "soeurs": sisters, "etape": "cadrage", "depart": fixed,
                                      "lecture": chemins([r for r in sisters + list(impl().get("references") or []) if r.lower() != repo.lower()]),
                                      "texte": f"{f.get('summary') or ''}\n{f.get('description') or ''}"[:8000],
                                      "deps": lie_deps(repo=repo),
                                      "humain": travail_humain(ticket, [repo] + sisters) if mode.strip().lower() == "essai" else []})
    src = cache_dir(ticket, repo)
    if src and os.path.isdir(src):  # nouveau départ : l'ancien dossier ne doit plus servir à une reprise
        for x in os.listdir(src):
            os.remove(os.path.join(src, x))
    print(f"{ticket} sur {repo} : branche {branch} depuis {fixed[:10] or 'origin/' + base}, {len(docs)} fichiers de doc, mode {mode}"
          + (f", dépôts sœurs : {', '.join(sisters)}" if sisters else "")
          + (f", dépendances liées : {', '.join(etat().get('deps') or [])}" if etat().get("deps") else ""))


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


def cmd_entree(p, ticket, retours="", extra=""):
    if p == "cadrage" and not given(retours) and deja_fait(p):
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
    for f in (f"essais_{p}.json",) + (("tests_essais.json", "teste.json") if p == "tests" else ()):  # nouveau passage du poste : essais à zéro
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
    parts.append(non_fiable())
    parts.append(section("Ticket", open(dossier("ticket.md"), encoding="utf-8").read() if os.path.exists(dossier("ticket.md")) else ""))
    if os.path.exists(dossier("retours.md")):
        parts.append(section("Retours de l'humain (à respecter en priorité)", open(dossier("retours.md"), encoding="utf-8").read()))
    if p == "cadrage":
        docs = e.get("docs") or []
        parts.append(section("Documentation du dépôt (à lire avant tout)", "\n".join(docs[:80]) + (f"\n… et {len(docs) - 80} autres" if len(docs) > 80 else "")
                             if docs else "aucune"))
        prev = load("cadrage.json")  # après un « Changements » à la gate du plan : il corrige son rapport au lieu de tout refaire
        txt = json.dumps(prev["resultat"], ensure_ascii=False, indent=1) if prev and prev.get("resultat") else ""
        if txt and cite_humain(txt):  # essai d'EW-7901 : le rapport d'avant décrivait la PR humaine, le nouveau plan la reprenait
            parts.append(section("Ton rapport précédent", "Écarté : il citait le travail humain du ticket (essai de comparaison). "
                                 "Repars du ticket et du dépôt."))
        elif txt:
            parts.append(section("Ton rapport précédent (à corriger d'après les retours de l'humain)", txt[:12000]))
    deps = {"code": ["cadrage"], "livraison": ["cadrage"] + list(CONTROLES)}.get(p, ["cadrage"] if p in CONTROLES else [])
    for d in deps:
        r = load(d + ".json")
        if r:
            cap = 24000 if d == "cadrage" else 12000  # le poste Plan porte aussi les fichiers impactés et les façons de faire
            cap = 6000 if p == "tests" else cap  # les Tests relisent ce rapport à chaque tour : critères et fichiers suffisent
            parts.append(section(f"Rapport du poste {d}", json.dumps(r.get("resultat") or r, ensure_ascii=False, indent=1)[:cap]))
    if p in ("doc", "livraison"):
        parts.append(rejets_md())
    if p in CONTROLES or p == "livraison":
        parts.append(section("Fichiers modifiés", "\n".join(files)))
        parts.append(section("Plan validé", json.dumps((load("plan.json") or {}).get("lots") or [], ensure_ascii=False, indent=1)[:4000 if p == "tests" else 8000]))
    if p in CONTROLES:
        stat = git("diff", "--stat", f"{depart()}...HEAD")
        parts.append(section("Volume du diff", stat[-3000:]))
        parts.append(correction(p))
    if p in ("cadrage", "code", "livraison"):
        parts.append(contrat_soeurs())
    if p in ("code", "tests"):
        parts.append(deps_md())
    if p == "tests":
        parts.append(tests_budget())
    if p == "code":
        morts = references_mortes(plan_seul=True)
        if morts:
            parts.append(section("Suppressions : les références à retirer aussi (git grep, 0 token)",
                                 "Le plan supprime des fichiers ; ces endroits les citent encore (templates, styles, tests, config, routes, "
                                 "traductions, doc). Retire-les ou adapte-les dans le même travail, sauf un homonyme sans rapport. Les "
                                 "vérifications du Code et le poste Règles refont ce relevé : une référence morte qui reste est bloquante.\n"
                                 + "\n".join(f"- {n} : " + " | ".join(h) for n, h in morts.items())[:8000]))
    if extra and not extra.startswith("{" + "{"):
        parts.append(section("Consignes de l'orchestrateur", extra))
    out("".join(parts))
    if p == "code" and essai():  # mode essai : l'étape affecter (Jira) est sautée, droit au plan
        sys.exit(5)


def cmd_releve():
    """Poste 📋 Plan : fichiers du dépôt qui citent les mots du ticket (git grep), du plus cité au moins cité."""
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


def cmd_rapport(p):
    raw = read_stdin().split(SEP)
    prop, crit = parse(raw[0]) if raw else None, parse(raw[1]) if len(raw) > 1 else None
    if prop is None:
        prev = load(p + ".json") or {"poste": p, "statut": "non_concerne"}
        out(prev)
        return
    rep = ecrit_rapport(p, prop, crit)
    out({"poste": p, "statut": rep["statut"], "resume": prop.get("resume") or ""})


def cmd_dossier():
    """Le dossier pour l'orchestrateur, dans son prompt : il n'a aucun fichier à lire (essai du 2026-10-30 : une lecture
    du dossier par l'agent a été coupée par les garde-fous de l'API)."""
    parts = [perimetre(), lecture(), rejoue(), non_fiable(), section("Ticket", open(dossier("ticket.md"), encoding="utf-8").read() if os.path.exists(dossier("ticket.md")) else "")]
    if os.path.exists(dossier("retours.md")):
        parts.append(section("Retours de l'humain", open(dossier("retours.md"), encoding="utf-8").read()))
    r = load("cadrage.json")
    body = json.dumps({"proposition": r.get("resultat"), "chemins": r.get("critique")}, ensure_ascii=False, indent=1)[:24000] \
        if r else "ABSENT : poste en panne, fais son travail toi-même et dis-le dans decisions"
    parts.append(section("Rapport du poste Plan (cadrage : compris, fichiers impactés, façons de faire du dépôt)", body))
    out("".join(parts))


def liste(items):
    return "\n".join(f"- {x}" for x in items if x) or "- (rien)"


def cmd_compris():
    """« ✋ Ce que j'ai compris », en tête de ta gate du plan (une seule gate avant le code, à chaque ticket) : la
    compréhension du poste Plan, ce qui est à trancher, les chemins qu'il cite et qui n'existent pas. Changements = ta
    correction repart au poste Plan puis à l'orchestrateur, autant de tours que tu veux. Essai d'EW-6550 : le cadrage avait
    compris de travers, la chaîne a filé jusqu'au code ; la gate s'ouvre donc toujours (impl.gate_cadrage n'a plus d'effet)."""
    r = load("cadrage.json") or {}
    c = r.get("resultat") or {}
    qs = [q for q in c.get("questions") or [] if isinstance(q, dict) and q.get("question")]
    absents = (r.get("critique") or {}).get("absents") if isinstance(r.get("critique"), dict) else None
    parts = []
    if c.get("concerne") is False:
        parts.append(f"**🚫 Rien à faire dans {etat().get('repo')} ?** {c.get('hors_perimetre') or '(sans raison)'}\n"
                     "Rejeter : ce bureau s'arrête sans PR. Approuver : on continue quand même.")
    parts.append("**🎯 Compréhension**\n" + (c.get("comprehension") or c.get("resume") or "(absente)"))
    if c.get("inclus") or c.get("exclus"):
        parts.append("**📦 Inclus**\n" + liste(c.get("inclus") or []) + "\n\n**🚧 Exclus**\n" + liste(c.get("exclus") or []))
    parts.append("**✅ Critères d'acceptation**\n" + liste(c.get("criteres_acceptation") or []))
    if qs:
        bloq = [q for q in qs if q.get("bloquante")]
        parts.append(f"**❓ À trancher** ({len(bloq)} bloquante{'s' if len(bloq) > 1 else ''})\n" + "\n".join(
            f"{i}. {'(bloquante) ' if q.get('bloquante') else ''}{q.get('question')}"
            + (f"\n   Hypothèse si pas de réponse : {q['hypothese']}" if q.get("hypothese") else "") for i, q in enumerate(qs, 1)))
    if absents:
        parts.append("**⚠️ Chemins cités introuvables** (l'orchestrateur les a vus)\n" + liste(absents[:10]))
    print("\n\n".join(parts))


def cmd_mode(mode):
    """Plan seulement : code 4, saut au commentaire Jira (dernière étape) puis Stop. Complet ou essai : code 0, le poste
    Code suit dans l'ordre. Essai d'EW-6550 : Kronn reprend un « Changements » de gate à l'étape qui SUIT la dernière
    gardée ; avec commente_plan juste après mode, un retour au Code a posté le plan dans Jira en mode essai."""
    avance("code")  # plan validé : une reprise (même en plan seulement, relancé en complet) repart au Code
    if (mode or "plan").strip().lower() in ("plan", "plan seulement", "plan_seulement"):
        print(f"Plan seulement : le plan part en commentaire du ticket, puis la chaîne s'arrête. Dossier gardé : {garde()}")
        sys.exit(4)
    print("Mode " + ("essai : tout jusqu'à la PR, sans rien pousser ni écrire dans Jira." if essai() else "complet : au poste Code."))


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
    compte("essais_code")
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
        lz = load("teste.json")
        if lz:  # l'essai suivant corrige des tests rouges : quelques lancements de plus
            lz["max"] = max(int(lz.get("max") or 0), int(lz.get("lances") or 0)) + 4
            write_json(dossier("teste.json"), lz)
        print(f"Tests rouges : nouvel essai ({st['n']} sur 3)")
        sys.exit(4)
    print("Tests verts" if v.get("ok", True) else "Tests encore rouges après 3 essais : bloquant pour l'orchestrateur")


def bilan_code(**more):
    """Le rapport du Code (commits et fichiers depuis le départ) ; les contrôles du passage d'avant deviennent précédents."""
    log = git("log", "--oneline", f"{depart()}..HEAD")
    st = load("essais_code.json") or {}
    rep = {"poste": "code", "statut": "ok" if log else "vide", "commits": log.splitlines(), "fichiers": changed(), "note": st.get("note"), **more}
    write_json(dossier("code.json"), rep)
    for c in CONTROLES:  # nouveau code : les contrôles sont à refaire ; leur rapport sert au tour suivant (correction)
        if os.path.exists(dossier(c + ".json")):
            os.replace(dossier(c + ".json"), dossier(f"precedent_{c}.json"))
    for f in ("controles.json", "quoi.json", "missions.json", "essais_code.json"):
        if os.path.exists(dossier(f)):
            os.remove(dossier(f))
    avance("controles", consignes_reprise="")
    return rep


def cmd_bilan_code():
    out(bilan_code())


AUDIT_DOCS = "Document audit failed"


REJET_DOC = re.compile(r"^(\S+): write rejected: ([^\n]+)$", re.M)


def cmd_rattrape_code():
    """Le poste Code en échec (stdin : dernière sortie de son sous-run). Kronn rejette après coup une étape Agent dont une
    doc modifiée ressemble à un secret (faux positif sur un contenu déjà là) : « Document audit failed », mais l'agent a
    rendu status OK et ses commits sont faits (banc d'essai du 5 novembre). Travail fini et commits : le bilan du Code est
    écrit (docs rejetées notées pour le poste Doc et la PR), code 4, Goto controles. Sinon : code 1, la chaîne échoue
    comme avant (la cause de la panne reste celle du Code)."""
    txt = read_stdin()
    if AUDIT_DOCS not in txt:
        sys.exit("Poste Code en échec (pas le garde-fou docs de Kronn) : la chaîne s'arrête.")
    agent = txt.split("Agent result:", 1)[1] if "Agent result:" in txt else ""
    if not re.search(r'"status":\s*"OK"', agent):
        sys.exit("Garde-fou docs de Kronn, mais l'agent du Code n'avait pas fini (pas de status OK) : la chaîne s'arrête.")
    if not git("log", "--oneline", f"{depart()}..HEAD"):
        sys.exit("Garde-fou docs de Kronn, mais aucun commit depuis le départ : la chaîne s'arrête.")
    rejets = list(dict.fromkeys(f for f, _ in REJET_DOC.findall(txt.split("Agent result:", 1)[0])))
    note = "docs rejetées par le garde-fou de Kronn : " + (", ".join(rejets) or "(fichiers non nommés)")
    compte("rattrapages")
    rep = bilan_code(docs_rejetees=rejets, note=note + " ; vérifications du Code sautées, les contrôles les refont")
    print(f"Code rattrapé : {len(rep['commits'])} commit(s), {note}. On passe aux contrôles.")
    sys.exit(4)


def cmd_bilan():
    if not etat().get("ticket"):
        sys.exit("Aucun dossier de ticket dans cette copie de travail.")
    out(bilan())


def main(argv):
    cmd, args = (argv[1] if len(argv) > 1 else ""), argv[2:]
    simple = {"releve": cmd_releve, "dossier": cmd_dossier, "existe": cmd_existe, "compris": cmd_compris, "tri_code": cmd_tri_code, "tri_tests": cmd_tri_tests, "bilan_code": cmd_bilan_code, "rattrape_code": cmd_rattrape_code, "bilan": cmd_bilan}
    if cmd in simple:
        return simple[cmd]()
    if cmd == "prepare":
        return cmd_prepare(*(args + [""] * 8)[:8])
    if cmd == "entree":
        return cmd_entree(*(args + ["", "", "", ""])[:4])
    if cmd == "rapport":
        return cmd_rapport(args[0] if args else "?")
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
