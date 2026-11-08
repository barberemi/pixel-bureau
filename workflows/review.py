"""Relire une PR en postes (2e étage, salle de revue) : le modèle review_child, lancé pour chaque PR (foreach) par la
revue à la demande (review_one), le cron des revues (review_cron) et la chaîne (impl_revue_pr), enchaîne des postes, un
sous-workflow chacun (review_<poste>, un agent), puis le poste 🧐 avis (étape Agent du parent : sa sortie typée nourrit
la review postée, les réactions, les réponses et la page de récap) :

  🗺 contexte   le sens de la PR, la stack, les fichiers à risque, les tests ; décide si la passe sécurité est utile
  📚 docs       les conventions du projet suivies par son routeur (docs/AGENTS.md), la doc tenue à jour, ses citations
  🔍 lecture    correction, tests, passe « mutation », duplication, lisibilité, patterns (des constats, pas l'avis)
  🔒 securite   la passe sécurité dédiée, sautée quand le contexte n'a rien vu de sensible (review.securite = "toujours")
Kronn plafonne un workflow à 20 étapes : l'avis lit les rapports lui-même, la passe sécurité décide seule de se sauter.

  python3 -c <ce script> contexte <pr> <login>  (stdin : {reviews, comments, files})   code 5 si le Bureau a déjà
                                                relu la PR à son head ; sinon le contexte de la revue, le diff annoté, le
                                                dossier vidé, et les états du run (---STATE:…---) sur stdout
  python3 -c <ce script> ticket_cle <pr> <repo>   la PR lue par gh (titre, branche, description -> pr.md) et l'adresse
                                                Jira de son ticket (clé du titre, de la branche ou de la description ;
                                                aucune : /myself), lue par l'étape suivante du poste contexte
  python3 -c <ce script> ticket <pr> <réponse JSON>   le ticket lu (description, commentaires, liens) -> ticket.md
  python3 -c <ce script> poste <poste> <pr> <repo>     consigne du poste (stdout = son prompt, 0 token) ; code 5 pour
                                                la sécurité quand le contexte a écrit « Sécurité : non »
  python3 -c <ce script> rapport <poste> <pr>  (stdin : sortie de l'agent)   le rapport, rangé dans le dossier
  python3 -c <ce script> garde <pr> <verdict> <is_own>  (stdin : sortie de l'avis)   avant de poster (0 token) : avis
                                                sans matière ou entrées absentes : rien n'est posté, code 7 (l'avis est relancé
                                                une fois) puis 8 (marqueur .kronn/vide-<n>, fin) ; sinon la review vérifiée par
                                                des règles fixes et mise en page -> review.json, l'action GitHub sur stdout
  python3 -c <ce script> poster <pr> <repo> <login> <head> <agent> <modèle>   poste review.json par gh (sans inline si
                                                GitHub la refuse), la garde dans l'historique ; stdout = la ligne review_meta ;
                                                code 3 en mode essai (rien n'est posté), 9 si GitHub refuse tout
  python3 -c <ce script> ligne <pr> <repo> <auteur> <base> <run_at> <fichiers> <ajouts> <retraits> <passe>
                                                la ligne du dataset reviews de la page de récap, depuis la review postée
  python3 -c <ce script> couts <worktree>|--all   coût et durée de chaque revue -> dataset review_sessions de la page de
                                                récap (DRY_RUN=1 : affiche sans publier)

Fichiers, dans la copie de travail du run (jamais le dossier du projet) : .kronn/pr-<n>/ (le worktree de la PR et son
.review-context.json, lu par l'avis) et .kronn/review-<n>/ (diff.md annoté, observation.md : CI au head, retard et
conflits, fichiers de déploiement touchés ; pr.md : titre, description et conversation ; ticket.md : le ticket Jira ;
releves.md : les relevés à 0 token du diff ; precedent.md : la passe d'avant sur cette PR ; ancres.json : les lignes
où un commentaire inline peut se poser ; un rapport par poste ; review.json : la review vérifiée).
Historique : chaque revue, postée ou en essai, dans review.historique (~/.local/share/pixel-bureau/revues par défaut),
avec la version de la revue : la passe suivante y lit ses points ouverts, et une modification se juge sur les PR qui l'ont
suivie.
Coût : chaque poste ouvre son prompt par « Review la PR #<n> (`<repo>`) · poste <poste> » ; couts regroupe les sessions
Claude Code d'une même revue en une ligne (coûts et jetons additionnés, durée du premier au dernier poste, détail dans
postes), sous l'id de la première session : la page de récap rapproche une ligne par revue.
"""
import datetime, glob, json, os, re, subprocess, sys, urllib.request
from _lib import API, CFG, readable
from _releves import garde_fous_lignes, noms_retires, references_restantes, releve_doc, tests_lies, DOC_FICHIER, NON_FIABLE, RECHERCHES

POSTES = ("contexte", "docs", "lecture", "securite")
TITRES = {"contexte": "🗺 contexte", "docs": "📚 docs", "lecture": "🔍 lecture", "securite": "🔒 sécurité", "avis": "🧐 avis"}
CONV_FILES = ("docs/review.md", "docs/CONVENTIONS.md", "docs/AGENTS.md", "AGENTS.md", "CLAUDE.md", ".github/CONTRIBUTING.md",
              "CONTRIBUTING.md")
FORMAT = ("Rends un rapport court en Markdown, une puce par constat, au format : `- [bloquant|remarque|conseil] <icône> "
          "<chemin>:R<ligne> : le problème, pourquoi, le correctif proposé`. Le chemin est tel quel dans DIFF_FILES ; la ligne "
          "vient du diff annoté (R<n> = ligne de la nouvelle version, L<n> = ligne supprimée) ; un constat hors du diff n'a pas "
          "de ligne (`<chemin> : …`). Icônes : 🐛 Bug · 🔒 Sécurité · 🧪 Test · 🧬 Test faible · 🔁 Duplication · 📖 "
          "Lisibilité · ⚡ Perf · 💡 Suggestion · 📚 Doc. Bloquant = bug, faille, test manquant sur une logique critique, doc "
          "devenue fausse. Rien à signaler : écris « Rien à signaler. » N'invente rien : chaque constat se vérifie dans le code. "
          "Termine par une section `## Traces` : une puce par recherche faite, `- R<n> · <cible> · `<commande exacte>` → "
          "<résultat : fichiers trouvés, ou « aucun »> → ok | constat`, puis une ligne `Revus : <chemins lus>` (les fichiers "
          "du diff que tu as lus) et, s'il y en a, `Écartés : <chemin> (raison)` (généré, binaire, illisible).")
MISSIONS = {
    "contexte": "Cadre la revue pour les postes suivants, sans juger le style. Rapport en Markdown, court : `Sens :` ce que "
                "fait la PR (deux phrases) ; `Ticket :` si pr.md ou ticket.md donnent un ticket, chacun de ses critères "
                "d'acceptation (et ce que promet la description de la PR) en une puce `✅ livré` (le fichier qui le fait), "
                "`❌ manquant` ou `❔ non vérifiable` (ce qu'il faudrait observer : env, prod, décision produit) ; une décision "
                "produit, SEO ou juridique que le ticket exige d'être tracée et qui ne l'est pas : ❌ ; sans ticket, `Ticket : "
                "aucun`. Les exigences et leur état suivent le skill « Bureau · conformité au ticket ». `Stack :` les langages et frameworks du diff ; `À risque :` les fichiers qui "
                "méritent une lecture attentive, une puce chacun avec la raison ; `Tests :` ceux que la PR ajoute ou modifie, "
                "et la logique changée qui n'en a pas. Termine par une ligne exacte `Sécurité : oui` ou `Sécurité : non`. "
                "« oui » dès que le diff touche une surface sensible (entrée utilisateur, authentification ou droits, "
                "secrets ou configuration, requêtes SQL ou appels sortants, en-têtes, cookies ou CORS, upload, "
                "désérialisation, HTML rendu sans échappement, dépendances) ou dans le doute ; « non » seulement si rien de "
                "tout cela n'est touché (doc, style, tests seuls, refacto interne).",
    "docs": "Applique le skill « Bureau · doc à jour ». Contrôle la PR au regard de la documentation du projet, dans le worktree (dossier docs/, AGENTS.md, CLAUDE.md, "
            "CONTRIBUTING.md). 1. Conventions : si docs/AGENTS.md existe, suis son routage (le tableau des tâches, puis la "
            "recherche) pour les fichiers du diff, charge seulement les fichiers qu'il indique, et relève les écarts du diff à "
            "ces règles en citant la règle (fichier:ligne). 2. Doc à jour : la PR change un comportement documenté (chemin, "
            "commande, configuration, API, architecture, règle) sans mettre à jour le passage qui le décrit : BLOQUANT, cite "
            "le passage devenu faux (fichier:ligne). Une doc utile à ajouter sans qu'aucune devienne fausse : conseil. "
            "3. Citations : dans chaque fichier de docs/ que la PR modifie, les références `[src: file: <chemin>:<ligne>]` "
            "doivent viser un fichier qui existe et une ligne qui dit ce qu'on lui fait dire ; une citation que la PR ajoute "
            "ou casse et qui ne tient plus : bloquant. Sans docs/ ni fichier de conventions : écris « Pas de documentation "
            "projet. » et arrête-toi. Icône 📚 pour la doc, celle du problème sinon. Pars de la section « Docs » de "
            "releves.md (docs que le diff modifie, docs qui citent un fichier ou un symbole touché, fichiers qu'aucune doc ne "
            "cite) : chaque doc qui cite le diff est lue et jugée, une trace par doc.",
    "lecture": "Lis le diff et le code autour, et relève ce qui compte, par ordre de priorité : correction (bugs, cas limites, "
               "régressions, logique), tests (un changement de comportement sans test ajouté ou mis à jour dans la même PR ; "
               "bloquant si la logique est critique), lisibilité et maintenabilité (nommage voisin, complexité, code dupliqué "
               "ou logique réimplémentée alors qu'un helper existe : cite le point de mutualisation). Motifs transversaux : "
               "silence d'analyse statique ou de lint au lieu de corriger la cause, code réservé aux tests exposé en prod, "
               "refacto hors sujet. Suis chaque valeur modifiée jusqu'à son rendu ou son consommateur : le template et "
               "son échappement (un filtre après une macro échappe-t-il deux fois ?), le CSS qui s'y applique, les "
               "listeners et la méthode du framework appelée (lis sa source dans vendor/ ou node_modules : que fait-elle "
               "sur une entrée invalide ?), l'appelant ou le client d'une API. Regarde aussi ce que la grille liste à part : "
               "ordre de mise en prod et config, cache HTTP et CDN (ETag, Cache-Control, purge), SEO et indexation, contrat "
               "avec les consommateurs. Un bloquant s'écrit avec son scénario concret (la requête, l'entrée ou l'état qui "
               "casse, et ce qu'on obtient) ; « bloquant sauf preuve que … » quand tu ne peux pas trancher. Passe « mutation », purement informative, selon le skill « Bureau · tests et contre-épreuve » (sans rien lancer) : une mutation qui "
               "survivrait aux tests est un conseil 🧬 Test faible. Design patterns : seulement si le symptôme "
               "est dans le diff et que le bénéfice dépasse l'indirection ; un conseil 💡, jamais bloquant. N'applique que "
               "les règles des langages présents dans le diff ; ignore le style que le linter gère. La sécurité a son poste : "
               "ne signale ici qu'une faille évidente. " + RECHERCHES,
    "securite": "Passe sécurité du diff, et seulement du diff : entrées non validées, injections (SQL, commande, HTML et XSS, "
                "chemin), authentification et droits, secrets ou jetons en clair, appels sortants contrôlés par l'utilisateur "
                "(SSRF), désérialisation, en-têtes, cookies et CORS, upload, dépendances ajoutées. Pour chaque constat, le "
                "chemin d'attaque concret en une phrase ; bloquant seulement pour un risque réel et exploitable, sinon "
                "remarque. Pas de liste de bonnes pratiques génériques. Les garde-fous de releves.md (clé sensible, "
                "en-tête de contournement) sont à trancher un par un.",
}


def lien(wt, rel):
    """SRV-03 : rel passe par un lien symbolique dans la copie de la PR (la PR le choisit) : jamais lu en le suivant."""
    return os.path.realpath(os.path.join(wt, rel)) != os.path.join(os.path.realpath(wt), rel)


def ecrit(path, text, append=False):
    """SRV-03 : écrit dans la copie de la PR sans suivre de lien : un lien posé par la PR est remplacé par le fichier."""
    if os.path.islink(path):
        os.remove(path)
    flags = os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW | (os.O_APPEND if append else os.O_TRUNC)
    with open(os.open(path, flags, 0o666), "a" if append else "w", encoding="utf-8") as f:
        f.write(text)


def ddir(pr):
    d =os.path.join(".kronn", "review-" + re.sub(r"\D", "", str(pr)))
    os.makedirs(d, exist_ok=True)
    return d


def dread(pr, name):
    try:
        with open(os.path.join(ddir(pr), name), encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def dwrite(pr, name, text):
    with open(os.path.join(ddir(pr), name), "w", encoding="utf-8") as f:
        f.write(text)


HUNK = re.compile("^" + "@" * 2 + r" -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? " + "@" * 2)  # en-tête de hunk (jamais deux @ d'affilée ici : variable Kronn)


def annotate(patch):
    """Patch d'un fichier (API GitHub) -> lignes numérotées : R<n> pour la nouvelle version (ajoutée ou contexte),
    L<n> pour une ligne supprimée ; l'avis en tire line et side (RIGHT ou LEFT) de chaque commentaire inline."""
    out, old, new = [], 0, 0
    for line in (patch or "").split("\n"):
        m = HUNK.match(line)
        if m:
            old, new = int(m.group(1)), int(m.group(2))
            out.append(line)
        elif line.startswith("-"):
            out.append("L%d-%s" % (old, line[1:]))
            old += 1
        elif line.startswith("+"):
            out.append("R%d+%s" % (new, line[1:]))
            new += 1
        elif not line.startswith("\\"):
            out.append("R%d %s" % (new, line[1:]))
            old += 1
            new += 1
    return "\n".join(out)


def ancres(files):
    """Les lignes où GitHub accepte un commentaire inline, par fichier : {chemin: {"RIGHT": [n…], "LEFT": [n…]}} (lignes
    du patch, dans un hunk). Une review dont un seul commentaire tombe ailleurs est refusée en entier."""
    out = {}
    for f in files:
        old = new = None
        sides = out.setdefault(f.get("filename") or "", {"RIGHT": [], "LEFT": []})
        for line in (f.get("patch") or "").split("\n"):
            m = HUNK.match(line)
            if m:
                old, new = int(m.group(1)), int(m.group(2))
            elif old is not None and line[:1] in (" ", "+", "-"):
                if line[0] != "+":
                    sides["LEFT"].append(old)
                    old += 1
                if line[0] != "-":
                    sides["RIGHT"].append(new)
                    new += 1
    return out


def releves(wt, files):
    """Les relevés à 0 token du diff, communs avec la chaîne d'implémentation (_releves.py) : références restantes aux
    noms retirés, garde-fous des lignes ajoutées, tests liés aux fichiers touchés, docs à regarder. Les postes les traitent
    chacun ; une ligne d'un relevé n'est pas un constat, c'est un endroit à vérifier."""
    def grep(*args):
        return subprocess.run(["git", "-C", wt, "grep", *args], capture_output=True, text=True).stdout

    def ls():
        return subprocess.run(["git", "-C", wt, "ls-files"], capture_output=True, text=True).stdout
    nl, out = "\n", ["# Relevés du diff (0 token, au head de la PR)"]
    morts = references_restantes(grep, files)
    out += ["", "## Retraits encore référencés (R3 : à traiter chacun)"]
    out += [f"- `{n}` : " + " ; ".join(h) for n, h in morts.items()] or ["- aucun nom retiré n'est encore cité"]
    retires = noms_retires(files)
    if retires and not morts:
        out.append("- noms retirés vérifiés : " + ", ".join(f"`{n}`" for n in retires[:20]))
    hits = garde_fous_lignes(files)
    out += ["", "## Garde-fous des lignes ajoutées"] + ([f"- {h}" for h in hits] or ["- rien"])
    code = [f.get("filename") or "" for f in files if f.get("status") != "removed" and not DOC_FICHIER.search(f.get("filename") or "")]
    lies = tests_lies(ls, code)
    out += ["", "## Tests liés aux fichiers touchés (R9 : à lire en entier)"]
    out += [f"- `{f}` : " + ", ".join(f"`{t}`" for t in ts) for f, ts in lies.items()] or ["- aucun test lié par le nom"]
    sans = [f for f in code if f not in lies]
    if sans:
        out.append("- sans test lié : " + ", ".join(f"`{f}`" for f in sans[:20]))
    doc = releve_doc(grep, files)
    out += ["", "## Docs (pour le poste 📚 docs)", "```json", json.dumps(doc, ensure_ascii=False, indent=1)[:8000], "```"]
    return nl.join(out) + nl


def historique():
    return os.path.expanduser(str((CFG.get("review") or {}).get("historique") or "~/.local/share/pixel-bureau/revues"))


def hdir(repo, pr):
    return os.path.join(historique(), re.sub(r"[^\w.-]", "_", repo.replace("/", "__")), "pr-" + re.sub(r"\D", "", str(pr)))


def precedent(pr, repo):
    """La dernière passe postée du Bureau sur cette PR (historique) : son head, son verdict et ses bloquants, numérotés P1…
    L'avis dit pour chacun s'il est corrigé, toujours ouvert ou réfuté ; sans preuve, la garde refuse d'approuver."""
    last = None
    for path in sorted(glob.glob(os.path.join(hdir(repo, pr), "*.json"))):
        try:
            with open(path, encoding="utf-8") as f:
                h = json.load(f)
        except (OSError, ValueError):
            continue
        if h.get("postee"):
            last = h
    if not last:
        return "Première passe du Bureau sur cette PR.\n"
    out = ["# Passe précédente du Bureau (%s, head %s, verdict %s)" % (str(last.get("at") or "")[:16], str(last.get("head") or "")[:10],
                                                                      last.get("verdict") or "?")]
    bl = last.get("blockers") or []
    out += ["P%d. %s" % (i, b) for i, b in enumerate(bl, 1)] or ["Aucun bloquant ouvert à cette passe."]
    return "\n".join(out) + "\n"


def contexte(pr, me, raw):
    """Étape write_ctx : .review-context.json du worktree (lu par l'avis), le diff annoté et le dossier des postes vidé
    (une revue d'avant dans la même copie de travail), puis les états du run."""
    d = json.loads(raw or "{}")
    wt = os.path.join(".kronn", "pr-" + str(pr))
    head = subprocess.run(["git", "-C", wt, "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    sha = head  # « head » sert plus bas aux titres du diff
    for marque in ("vide", "essai", "echec"):  # issue d'une revue d'avant dans la même copie de travail (garde, poster)
        try:
            os.remove(os.path.join(".kronn", marque + "-" + str(pr)))
        except OSError:
            pass
    redemandee = bool(task().get("rerequest"))  # relecteur re-demandé au même head (cron) : on relit quand même
    if head and not redemandee and any((r.get("user") or {}).get("login") == me and "Review automatique" in (r.get("body") or "") and r.get("commit_id") == head
                                       for r in d.get("reviews") or []):  # déjà relue par le Bureau à ce head : marqueur pour skip_note
        with open(os.path.join(".kronn", "skip-" + str(pr)), "w", encoding="utf-8"):
            pass
        print("skip_check: ALREADY (head %s)" % head)
        sys.exit(5)
    allc = d.get("comments") or []
    cs = [c for c in allc if ((c.get("user") or {}).get("login")) != me]
    answered = sorted({(c.get("in_reply_to_id") or c.get("id")) for c in allc if ((c.get("user") or {}).get("login")) == me})
    rv = d.get("reviews") or []
    fl = d.get("files") or []
    files = [(f.get("filename") or "") for f in fl]
    conv = "NO_PROJECT_CONVENTIONS"
    for rel in CONV_FILES:
        p = os.path.join(wt, rel)
        if os.path.isfile(p) and not lien(wt, rel):  # SRV-03 : une convention en lien (choisi par la PR) est ignorée
            with open(p, encoding="utf-8", errors="replace") as f:
                conv = "### " + rel + "\n" + f.read()[:16000]
            break
    nl = "\n"
    out = ("DIFF_FILES:" + nl + nl.join(files) + nl + "---REVIEWS---" + nl + json.dumps(rv) + nl + "---COMMENTS---" + nl
           + json.dumps(cs) + nl + "---ANSWERED_ROOTS---" + nl + json.dumps(answered) + nl + "---PROJECT_CONVENTIONS---" + nl + conv)
    ecrit(os.path.join(wt, ".review-context.json"), out)
    for old in glob.glob(os.path.join(ddir(pr), "*")):
        os.remove(old)
    diff = []
    for f in fl:
        head = "### %s (%s, +%s -%s)" % (f.get("filename"), f.get("status") or "modified", f.get("additions") or 0, f.get("deletions") or 0)
        body = annotate(f.get("patch")) if f.get("patch") else "(diff absent de l'API, fichier trop gros ou binaire : lis-le avec git dans le worktree)"
        diff.append(head + nl + "```diff" + nl + body + nl + "```")
    dwrite(pr, "diff.md", (nl + nl).join(diff)[:400000])
    dwrite(pr, "ancres.json", json.dumps(ancres(fl)))
    dwrite(pr, "releves.md", releves(wt, fl))
    dwrite(pr, "precedent.md", precedent(pr, str(task().get("repo") or "")))
    obs = observe(pr, sha, files)
    ecrit(os.path.join(wt, ".review-context.json"), nl + "---OBSERVATION---" + nl + obs, append=True)
    try:
        with open(os.path.join(".kronn", "current_task.json"), encoding="utf-8") as f:
            au = json.load(f).get("author") or ""
    except (OSError, ValueError):
        au = ""
    adds = sum(int(f.get("additions") or 0) for f in fl)
    dels = sum(int(f.get("deletions") or 0) for f in fl)
    npass = len([r for r in rv if ((r.get("user") or {}).get("login")) == me]) + 1
    run_at = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    for k, v in (("is_own", "true" if au == me else "false"), ("diff_files", len(files)), ("diff_add", adds),
                 ("diff_del", dels), ("review_pass", npass), ("run_at", run_at)):
        print("---STATE:%s=%s---" % (k, v))
    print("write_ctx OK : %d fichiers diff, %d non-self, %d fils repondus ; conventions=%s"
          % (len(files), len(cs), len(answered), "oui" if conv != "NO_PROJECT_CONVENTIONS" else "non"))


DEPLOY = re.compile(r"(^|/)(\.github/workflows/|infrastructure/|infra/|terraform/|helm/|k8s/|deploy/|docker/|migrations?/)|Dockerfile"
                    r"|docker-compose|\.(tf|vcl)$|(^|/)\.env|(^|/)(composer\.(json|lock)|package(-lock)?\.json|yarn\.lock|pnpm-lock\.yaml)$"
                    r"|config/packages/.*prod|(^|/)config/.*\.(ya?ml|php|json)$", re.I)


def gh(*args):
    """Une lecture gh (20 s au plus) : sa sortie, ou None."""
    try:
        r = subprocess.run(["gh", *args], capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return r.stdout if r.stdout.strip() else None


def task():
    try:
        with open(os.path.join(".kronn", "current_task.json"), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def observe(pr, head, files):
    """Ce qu'on observe de la PR sans agent (observation.md) : la CI au head, l'état de fusion (conflits), le retard sur sa
    base, les fichiers de déploiement, de config ou de dépendances touchés. Une lecture qui échoue : « indisponible »."""
    t = task()
    repo, base, nl = str(t.get("repo") or ""), str(t.get("baseRef") or "main"), "\n"
    out = ["# Observation (sans agent, au head %s)" % (head[:10] or "?")]
    raw = gh("pr", "checks", str(pr), "-R", repo, "--json", "name,bucket") if repo else None
    try:
        cs = json.loads(raw) if raw else None
    except ValueError:
        cs = None
    if cs is None:
        out.append("- CI : indisponible (gh pr checks).")
    elif not cs:
        out.append("- CI : aucun check n'a tourné sur ce head.")
    else:
        by = {}
        for c in cs:
            by.setdefault(c.get("bucket") or "?", []).append(c.get("name") or "?")
        out.append("- CI : " + ", ".join("%d %s" % (len(v), k) for k, v in sorted(by.items()))
                   + ("" if not by.get("fail") else " ; en échec : " + ", ".join(by["fail"][:8])))
    raw = gh("pr", "view", str(pr), "-R", repo, "--json", "mergeable,mergeStateStatus,isDraft") if repo else None
    try:
        m = json.loads(raw) if raw else None
    except ValueError:
        m = None
    out.append("- Fusion : indisponible." if m is None else "- Fusion : %s (%s)%s" % (
        {"CONFLICTING": "⛔ en conflit avec la base", "MERGEABLE": "sans conflit"}.get(m.get("mergeable"), m.get("mergeable") or "?"),
        m.get("mergeStateStatus") or "?", ", brouillon" if m.get("isDraft") else ""))
    behind = gh("api", "repos/%s/compare/%s...%s" % (repo, base, head), "-q", ".behind_by") if repo and head else None
    out.append("- Retard sur %s : %s" % (base, (behind.strip() + " commit(s)") if behind else "indisponible"))
    dep = [f for f in files if DEPLOY.search(f)]
    out.append("- Déploiement, config ou dépendances touchés : " + (", ".join(dep[:20]) if dep else "aucun"))
    text = nl.join(out)
    dwrite(pr, "observation.md", text + nl)
    return text


PR_KEY = re.compile(r"\b([A-Z][A-Z0-9]+-\d+)\b")


def ticket_cle(pr, repo):
    """La PR lue par gh (pr.md : titre, branche, description) et l'adresse Jira de son ticket : la clé du titre, sinon de
    la branche, sinon de la description, du projet Jira de l'installation s'il est connu ; aucune : /myself (rien à lire)."""
    raw = gh("pr", "view", str(pr), "-R", repo, "--json", "title,body,headRefName,comments")
    try:
        p = json.loads(raw) if raw else {}
    except ValueError:
        p = {}
    title, branch, body = str(p.get("title") or ""), str(p.get("headRefName") or ""), str(p.get("body") or "")
    conv = ["- %s, %s : %s" % ((c.get("author") or {}).get("login") or "?", str(c.get("createdAt") or "")[:10],
                                re.sub(r"\s+", " ", str(c.get("body") or ""))[:800])
            for c in (p.get("comments") or [])[-15:] if "Review automatique" not in str(c.get("body") or "")]
    dwrite(pr, "pr.md", "# %s\n\nBranche : %s\n\n%s\n%s" % (
        title or "(titre indisponible)", branch or "?", body.strip()[:8000] or "(sans description)",
        ("\n## Conversation de la PR (hors commentaires de code, les plus récents)\n" + "\n".join(conv) + "\n") if conv else ""))
    proj = str((CFG.get("jira") or {}).get("project") or "")
    keys = [k for txt in (title, branch.upper(), body) for k in PR_KEY.findall(txt)]
    keys = [k for k in keys if not proj or k.startswith(proj + "-")]
    print("/rest/api/2/issue/" + keys[0] if keys else "/rest/api/2/myself", end="")


def ticket(pr, raw):
    """Le ticket lu dans Jira -> ticket.md (titre, statut, description en texte, 8 derniers commentaires, liens), pour
    les postes et l'avis ; pas de ticket ou Jira en erreur : une ligne qui le dit."""
    try:
        o = json.loads(raw or "{}")
    except ValueError:
        o = {}
    if isinstance(o, dict) and "fields" not in o and isinstance(o.get("data"), dict):
        o = o["data"]
    f = (o.get("fields") if isinstance(o, dict) else None) or {}
    if not o.get("key") or not f:
        msg = "Pas de ticket Jira : aucune clé dans le titre, la branche ou la description de la PR." if isinstance(o, dict) and (
            o.get("accountId") or o.get("emailAddress") or o.get("displayName")) else "Ticket Jira indisponible (lecture en échec)."
        dwrite(pr, "ticket.md", msg + "\n")
        print(msg)
        return
    nl = "\n"
    out = ["# %s · %s" % (o["key"], f.get("summary") or ""), "Statut : %s" % ((f.get("status") or {}).get("name") or "?"), "",
           "## Description", readable(f.get("description") or "") or "(vide)"]
    coms = ((f.get("comment") or {}).get("comments")) or []
    if coms:
        out += ["", "## Commentaires (les plus récents)"]
        for c in coms[-8:]:
            out.append("- %s, %s : %s" % ((c.get("author") or {}).get("displayName") or "?", str(c.get("created") or "")[:10],
                                          re.sub(r"\s+", " ", readable(c.get("body") or ""))[:800]))
    links = f.get("issuelinks") or []
    if links:
        out += ["", "## Liens"]
        for ln in links[:12]:
            other = ln.get("outwardIssue") or ln.get("inwardIssue") or {}
            kind = (ln.get("type") or {}).get("outward" if ln.get("outwardIssue") else "inward") or "lié à"
            out.append("- %s %s · %s" % (kind, other.get("key") or "?", ((other.get("fields") or {}).get("summary")) or ""))
    text = nl.join(out)[:20000]
    dwrite(pr, "ticket.md", text + nl)
    print(text[:1500])


def guidelines():
    return str((CFG.get("review") or {}).get("guidelines") or "Aucune consigne d'équipe en plus de la grille.")


def poste(k, pr, repo):
    if k not in MISSIONS:
        sys.exit("Poste inconnu : " + k)
    if k == "securite" and not securite_utile(pr):  # code 5 : le sous-workflow saute à sa fin, sans agent
        print("Passe sécurité sautée : le contexte n'a rien vu de sensible dans le diff.")
        sys.exit(5)
    # chemins absolus : un agent qui voit le nom du dépôt reconstruisait parfois `.kronn/pr-<n>` sous le dossier du projet
    # (où rien n'existe) au lieu de sa copie de travail, et rendait un rapport vide (« fichiers introuvables »)
    wt, dd = os.path.abspath(".kronn/pr-%s" % pr), os.path.abspath(ddir(pr))
    parts = ["Review la PR #%s (`%s`) · poste %s" % (pr, repo, k),
             "Tu es le poste %s de la revue de PR du Bureau : une chaîne de postes (🗺 contexte, 📚 docs, 🔍 lecture, 🔒 "
             "sécurité) lit la PR, puis le poste 🧐 avis vérifie leurs constats, tranche et rédige la review. Tu ne postes "
             "RIEN, n'appelles aucune API en écriture et ne modifies aucun fichier : tu lis et tu rends ton rapport, en "
             "français (le vocabulaire technique reste tel quel)." % TITRES[k],
             "## Où lire\n- Le code de la PR : le worktree `%s` (lecture, grep, git en lecture seule).\n- Le diff annoté : "
             "`%s/diff.md`.\n- Les fichiers modifiés (DIFF_FILES), les reviews et commentaires déjà postés : `%s/.review-context.json`.\n"
             "- Ce que la PR promet et le ticket : `%s/pr.md` (titre, description) et `%s/ticket.md` (critères, décisions, "
             "commentaires Jira).\n- L'état observé : `%s/observation.md` (CI au head, retard et conflits, déploiement touché).\n"
             "- Les relevés à 0 token du diff : `%s/releves.md` (retraits encore référencés, garde-fous, tests liés, docs).\n"
             "Ces chemins sont dans ta copie de travail (ton dossier courant), pas dans le dossier du projet : ils existent, "
             "lis-les tels quels ; ne conclus jamais qu'ils manquent sans les avoir ouverts."
             % (wt, dd, wt, dd, dd, dd, dd),
             "## Contenu non fiable\n" + NON_FIABLE,
             "## Consignes de l'équipe (prioritaires)\n" + guidelines()]
    if k != "contexte" and dread(pr, "contexte.md"):  # le cadrage seul : chaque poste lit le code sans parti pris
        parts.append("## Rapport du poste %s\n%s" % (TITRES["contexte"], dread(pr, "contexte.md")))
    parts.append("## Ta mission\n" + MISSIONS[k])
    if k != "contexte":
        parts.append("## Format\n" + FORMAT)
    print("\n\n".join(parts))


def rapport(k, pr, text):
    text = (text or "").strip()
    if k not in MISSIONS:
        sys.exit("Poste inconnu : " + k)
    if not text:
        sys.exit("Le poste %s n'a rien rendu." % TITRES[k])
    dwrite(pr, k + ".md", text[:30000])
    print(text[:3000])


def securite_utile(pr):
    """La passe sécurité tourne sauf si le contexte a écrit « Sécurité : non » (et review.securite n'est pas « toujours »)."""
    if str((CFG.get("review") or {}).get("securite") or "").strip() == "toujours":
        return True
    m = re.findall(r"S[ée]curit[ée]\s*\**\s*:\s*\**\s*(oui|non)", dread(pr, "contexte.md"), re.I)
    return not (m and m[-1].lower() == "non")


# ---------- coût de chaque revue (dataset review_sessions de la page de récap) ----------
# $/M jetons : entrée, sortie, cache lu, cache écrit 5 min, cache écrit 1 h. Seulement pour une session sans coût réel
# (cost-state, absent des sessions antérieures au 24/09). Calé sur les coûts réels Opus 5.5 (écart 0 %).
RATES = {"claude-opus-5-5": (4, 20, 0.2, 5, 8), "claude-opus-4-8": (5, 25, 0.5, 6.25, 10)}
FIRST = re.compile(r"Review la PR #(\d+) \(`([^`]+)`")
GAP_MS = 20 * 60 * 1000  # deux sessions de la même PR à plus de 20 min d'écart : deux revues


def ms(ts):
    return datetime.datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp() * 1000


def session(path):
    """Une session Claude Code (jsonl) -> {repo, pr, poste, coût, jetons, début, fin} ; None si ce n'est pas une revue."""
    first = cost = t0 = t1 = sid = None
    seen = {}
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            try:
                o = json.loads(line)
            except ValueError:
                continue
            ts = o.get("timestamp")
            if ts:
                t0, t1 = t0 or ts, ts
            sid = sid or o.get("sessionId")
            m = o.get("message") or {}
            if first is None and o.get("type") == "user":
                c = m.get("content")
                first = c if isinstance(c, str) else json.dumps(c, ensure_ascii=False)
            if o.get("type") == "cost-state":
                cost = o
            if o.get("type") == "assistant" and m.get("usage") and m.get("model") and not m["model"].startswith("<"):
                seen[m.get("id") or len(seen)] = (m["model"], m["usage"])
    g = first and FIRST.search(first)
    if not g or not (seen or cost):
        return None
    p = re.search(r"· poste (\w+)", first[:300])
    per = {}
    for model, u in seen.values():
        cc = u.get("cache_creation") or {}
        t = per.setdefault(model, [0, 0, 0, 0, 0])
        c5, c1 = cc.get("ephemeral_5m_input_tokens"), cc.get("ephemeral_1h_input_tokens")
        if c5 is None and c1 is None:
            c5 = u.get("cache_creation_input_tokens", 0)
        for i, v in enumerate([u.get("input_tokens", 0), u.get("output_tokens", 0), u.get("cache_read_input_tokens", 0), c5, c1]):
            t[i] += v or 0
    if cost:
        usd, est = float(cost.get("totalCostUSD") or 0), False
        if not per:
            mu = cost.get("modelUsage") or {}
            per = {k: [v.get("inputTokens", 0), v.get("outputTokens", 0), v.get("cacheReadInputTokens", 0),
                       v.get("cacheCreationInputTokens", 0), 0] for k, v in mu.items()}
    elif all(m in RATES for m in per):
        usd, est = sum(sum(a * b for a, b in zip(per[m], RATES[m])) / 1e6 for m in per), True
    else:
        return {"skip": os.path.basename(path) + " (modèle sans tarif connu : " + ", ".join(sorted(per)) + ")"}
    tot = [sum(x[i] for x in per.values()) for i in range(5)]
    return {"session_id": sid or os.path.basename(path)[:-6], "repo": g.group(2), "pr": int(g.group(1)),
            "poste": p.group(1) if p else "avis", "cost_usd": usd, "estimated": est,
            "model": max(per, key=lambda k: sum(per[k])) if per else "", "input": tot[0], "output": tot[1],
            "cache_read": tot[2], "cache_write": tot[3] + tot[4], "t0": t0, "t1": t1,
            "api_ms": int(cost.get("totalAPIDuration") or 0) if cost else None}


def revues(sessions):
    """Sessions d'un dossier -> une ligne par revue : les postes d'une même PR, à moins de 20 min l'un de l'autre."""
    rows, groups = [], {}
    for s in sorted(sessions, key=lambda s: s["t0"] or ""):
        gl = groups.setdefault((s["repo"], s["pr"]), [])
        if gl and s["t0"] and gl[-1][-1]["t1"] and ms(s["t0"]) - ms(gl[-1][-1]["t1"]) <= GAP_MS:
            gl[-1].append(s)
        else:
            gl.append([s])
    for gl in groups.values():
        for g in gl:
            a = g[0]
            t1 = max((s["t1"] for s in g if s["t1"]), default=None)
            costs = {}
            for s in g:
                costs[s["poste"]] = round(costs.get(s["poste"], 0) + s["cost_usd"], 4)
            row = {"session_id": a["session_id"], "repo": a["repo"], "pr": a["pr"],
                   "cost_usd": round(sum(s["cost_usd"] for s in g), 4), "estimated": any(s["estimated"] for s in g),
                   "model": max(g, key=lambda s: s["cost_usd"])["model"],
                   **{k: sum(s[k] for s in g) for k in ("input", "output", "cache_read", "cache_write")},
                   "started_at": a["t0"], "session_ms": int(ms(t1) - ms(a["t0"])) if a["t0"] and t1 else None,
                   "api_ms": sum(s["api_ms"] or 0 for s in g) if any(s["api_ms"] is not None for s in g) else None}
            if len(g) > 1:
                row["postes"] = costs
            rows.append(row)
    return rows


def couts(arg):
    root = os.environ.get("REVIEW_SESSIONS_ROOT") or os.path.expanduser("~/.claude/projects/")
    dirs = glob.glob(root + "*kronn-worktrees*") if arg == "--all" else [root + re.sub(r"[^A-Za-z0-9]", "-", arg)]
    rows, skipped = [], []
    for d in dirs:
        ss = [s for s in (session(f) for f in glob.glob(d + "/*.jsonl")) if s]
        skipped += [s["skip"] for s in ss if "skip" in s]
        rows += revues([s for s in ss if "skip" not in s])
    for s in skipped:
        print("ignoré : " + s)
    if not rows:
        print("review_sessions : aucune session de review dans " + (arg if arg != "--all" else "les worktrees"))
        return
    rows.sort(key=lambda r: r["started_at"] or "")
    total = sum(r["cost_usd"] for r in rows)
    if os.environ.get("DRY_RUN") == "1":
        print(json.dumps(rows[-3:], indent=1, ensure_ascii=False))
        print("%d revues, %.2f $" % (len(rows), total))
        return
    page = (CFG.get("review") or {}).get("page_id")
    for i in range(0, len(rows), 100):
        body = {"writes": [{"dataset": "review_sessions", "operation": "upsert", "value": rows[i:i + 100], "key_field": "session_id"}]}
        req = urllib.request.Request(API + "/pages/" + page + "/publish", data=json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=30) as f:
            res = json.loads(f.read().decode(), strict=False)
        if not res.get("success"):
            sys.exit("review_sessions ERREUR : " + str(res.get("error")))
    print("review_sessions OK : %d review(s), %.2f $" % (len(rows), total))


SANS_MATIERE = re.compile(r"impossible|introuvable|absent|manquant|\bvide\b|missing|not found|cannot|unable|n'existe pas|aucun fichier", re.I)
SUJET_ENTREES = re.compile(r"fichier|worktree|contexte|dossier|context|file|diff|\.kronn|copie de travail", re.I)
EVENTS = {"approve": "APPROVE", "request_changes": "REQUEST_CHANGES", "comment": "COMMENT"}
LIBELLES = {
    "fr": {"approve": "## ✅ Approuvé", "comment": "## 💬 Commentaires", "request_changes": "## 🔧 Changements demandés",
           "bloquants": "**Bloquants**", "aussi": "**Aussi** (hors des lignes du diff)", "positif": "👍 Positif : ",
           "criteres": "critères", "non_verif": "non vérifiables"},
    "en": {"approve": "## ✅ Approved", "comment": "## 💬 Comments", "request_changes": "## 🔧 Changes requested",
           "bloquants": "**Blocking**", "aussi": "**Also** (outside the diff lines)", "positif": "👍 Good: ",
           "criteres": "criteria", "non_verif": "not verifiable"},
}
SUGGESTION = re.compile(r"```suggestion[^\n]*\n(.*?)```", re.S)
TITRE = re.compile(r"^\s*(?:[🔴🟡🔵🐛🔒🧪🧬🔁📖⚡💡📚]️?\s*)*")


def resume(d):
    """La synthèse de l'avis : `summary`, sinon `generalComment` (sortie d'avant la mise en page par le Bureau)."""
    return str(d.get("summary") or d.get("generalComment") or "").strip()


def sans_matiere(pr, d):
    """Pourquoi l'avis ne doit pas être posté, ou "" : entrées de la revue absentes, sortie illisible, échec déclaré par
    l'avis, ou avis sans constat qui dit n'avoir pas trouvé ses fichiers (#2060 : « Impossible de produire la review : les
    fichiers d'entrée attendus … sont absents du worktree, qui est lui-même vide », posté en COMMENT)."""
    n = re.sub(r"\D", "", str(pr))
    wt = os.path.join(".kronn", "pr-" + n)
    manque = [x for x in (os.path.join(wt, ".review-context.json"), os.path.join(".kronn", "review-" + n, "diff.md"))
              if not os.path.isfile(x)]
    if not os.path.isdir(wt) or not [x for x in os.listdir(wt) if x != ".git"]:
        manque.insert(0, wt + " (vide)")
    if manque:
        return "entrées de la revue absentes : " + ", ".join(manque)
    if not isinstance(d, dict) or not resume(d):
        return "sortie de l'avis illisible ou sans synthèse"
    if str(d.get("statut") or "").lower() == "echec":
        return "l'avis déclare un échec : " + resume(d)[:200]
    txt = resume(d)
    if not d.get("comments") and SANS_MATIERE.search(txt[:600]) and SUJET_ENTREES.search(txt[:600]):
        return "avis sans matière (il dit n'avoir pas trouvé ses fichiers) : " + txt[:200]
    return ""


def titre(body):
    """La ligne qui nomme un commentaire : son titre en gras, sans icône."""
    first = next((ln for ln in str(body or "").splitlines() if ln.strip()), "")
    first = TITRE.sub("", first).strip()
    return re.sub(r"^\*\*(.+?)\*\*.*$", r"\1", first)[:160] or " ".join(str(body or "").split())[:160]


def liste(v):
    return [x for x in v if x] if isinstance(v, list) else []


REF = re.compile(r"`([^`\s]+):(\d+)`")


def ancre_bloquant(b, anchors):
    """Un bloquant de la synthèse (« **titre** — pourquoi · `chemin:ligne` ») -> (chemin du diff, ligne, texte sans le
    renvoi) quand son dernier renvoi tombe sur une ligne de la nouvelle version du diff ; sinon (None, None, b). Le
    chemin peut être complet ou seulement sa fin (`f.php:12`), s'il ne désigne qu'un fichier du diff."""
    refs = REF.findall(b)
    if not refs:
        return None, None, b
    ref, n = refs[-1][0], int(refs[-1][1])
    paths = [p for p in anchors if p == ref] or [p for p in anchors if p.endswith("/" + ref)]
    if len(paths) != 1 or n not in ((anchors.get(paths[0]) or {}).get("RIGHT") or []):
        return None, None, b
    texte = re.sub(r"\s*·\s*`[^`]+`\s*$", "", b).strip()
    return paths[0], n, texte


def verifie(d, files, anchors, obs, prec, own):
    """La review de l'avis vérifiée par des règles fixes, avant tout envoi (comme la passe « validate » de PR Review v3.4) :
    une review que GitHub refuserait en entier, ou dont le verdict contredit ses bloquants, est réparée, jamais rejetée ;
    chaque réparation est listée (`corrections`, gardée dans l'historique). Rend (review, corrections)."""
    fixes = []
    verdict = str(d.get("verdict") or "comment").strip().lower()
    verdict = verdict if verdict in EVENTS else "comment"
    blockers = [str(b) for b in liste(d.get("blockers"))]
    aussi, kept, seen = [], [], {}
    for c in liste(d.get("comments")):
        if not isinstance(c, dict):
            continue
        path, line, side = str(c.get("path") or ""), c.get("line"), str(c.get("side") or "RIGHT").upper()
        body, grav = str(c.get("body") or ""), str(c.get("gravite") or "").lower()
        lines = set((anchors.get(path) or {}).get(side) or [])
        if not (isinstance(line, int) and line in lines):
            puce = "%s · `%s:%s`" % (titre(body), path.rsplit("/", 1)[-1] or "?", line)
            (blockers if grav == "bloquant" else aussi).append(puce)
            fixes.append("commentaire hors des lignes du diff (%s:%s) remonté dans la synthèse" % (path, line))
            continue
        out = {"path": path, "line": line, "side": side, "body": body}
        start = c.get("start_line")
        if isinstance(start, int) and start < line and all(x in lines for x in range(start, line + 1)):
            out.update(start_line=start, start_side=side)
        elif start not in (None, line):
            fixes.append("plage %s:%s-%s hors du diff : commentaire réduit à la ligne %s" % (path, start, line, line))
        if "start_line" not in out:  # un bloc suggestion remplace exactement la ligne commentée : plusieurs lignes, simple exemple
            for block in SUGGESTION.findall(body):
                if block.rstrip("\n").count("\n") >= 1:
                    out["body"] = body = body.replace("```suggestion", "```", 1)
                    fixes.append("bloc suggestion de plusieurs lignes sur une seule (%s:%s) : changé en exemple" % (path, line))
                    break
        key = (path, line, side)
        if key in seen:
            seen[key]["body"] += "\n\n" + body
            fixes.append("deux commentaires sur %s:%s fusionnés" % (path, line))
            continue
        seen[key] = out
        kept.append(out)
        if grav == "bloquant" and not any(path.rsplit("/", 1)[-1] in b or titre(body)[:40] in b for b in blockers):
            blockers.append("%s · `%s:%s`" % (titre(body), path.rsplit("/", 1)[-1], line))
            fixes.append("commentaire bloquant absent des bloquants de la synthèse : ajouté")
    for b in liste(d.get("blockers")):  # un bloquant de la synthèse sur une ligne du diff a son inline (#2074 : aucun posé)
        path, line, texte = ancre_bloquant(str(b), anchors)
        deja = any(c["path"] == path and titre(c["body"])[:40] in str(b) for c in kept)  # son inline posé ailleurs dans le fichier
        if path and (path, line, "RIGHT") not in seen and not deja:
            seen[(path, line, "RIGHT")] = out = {"path": path, "line": line, "side": "RIGHT", "body": "🔴 " + texte}
            kept.append(out)
            fixes.append("bloquant sans commentaire inline (%s:%s) : commentaire ancré ajouté" % (path.rsplit("/", 1)[-1], line))
    if blockers and verdict != "request_changes":
        fixes.append("%d bloquant(s) avec le verdict « %s » : request_changes" % (len(blockers), verdict))
        verdict = "request_changes"
    if verdict == "request_changes" and not blockers:
        fixes.append("request_changes sans bloquant : comment")
        verdict = "comment"
    if verdict == "approve":
        why = []
        if re.search(r"CI : .*en échec", obs):
            why.append("CI en échec au head")
        if "en conflit" in obs:
            why.append("conflit avec la base")
        code = [f for f in files if not DOC_FICHIER.search(f)]
        traces = [t for t in liste(d.get("traces")) if isinstance(t, dict) and str(t.get("recherche") or "").strip()
                  and str(t.get("resultat") or "").strip()]
        if code and not traces:
            why.append("aucune trace de recherche hors du diff")
        couverts = set(str(x) for x in liste(d.get("revus"))) | {str((s or {}).get("path") or "") for s in liste(d.get("skipped")) if isinstance(s, dict)}
        oublies = [f for f in files if f not in couverts]
        if oublies:
            why.append("%d fichier(s) du diff ni revus ni écartés (%s)" % (len(oublies), ", ".join(oublies[:5])))
        if prec:
            prouves = {str(s.get("point") or "").upper() for s in liste(d.get("suivi")) if isinstance(s, dict)
                       and str(s.get("etat") or "").lower() in ("corrige", "corrigé", "refute", "réfuté") and str(s.get("preuve") or "").strip()}
            ouverts = [p for p in prec if p not in prouves]
            if ouverts:
                why.append("point(s) de la passe précédente sans preuve : " + ", ".join(ouverts))
        if why:
            fixes.append("approve refusé (" + " ; ".join(why) + ") : comment")
            verdict = "comment"
    lang = str(d.get("lang") or "fr").lower()[:2]
    lab = LIBELLES.get(lang, LIBELLES["fr"])
    parts = [lab[verdict], "", resume(d)]
    tk = d.get("ticket") if isinstance(d.get("ticket"), dict) else {}
    if tk.get("cle"):
        parts.append("🎫 %s · ✅ %s/%s %s%s" % (tk["cle"], tk.get("ok", "?"), tk.get("total", "?"), lab["criteres"],
                                               " · %s %s" % (tk["non_verifiables"], lab["non_verif"]) if tk.get("non_verifiables") else ""))
    if blockers:
        parts += ["", lab["bloquants"]] + ["- " + b for b in blockers]
    if aussi:
        parts += ["", lab["aussi"]] + ["- " + a for a in aussi]
    if str(d.get("positive") or "").strip():
        parts += ["", lab["positif"] + str(d["positive"]).strip()]
    body = "\n".join(parts).strip() if (d.get("summary") or not d.get("generalComment")) else str(d.get("generalComment")).strip()
    event = "COMMENT" if own == "true" else EVENTS[verdict]
    return {"verdict": verdict, "event": event, "body": body, "comments": kept, "blockers": blockers, "lang": lang,
            "traces": liste(d.get("traces")), "revus": liste(d.get("revus")), "suivi": liste(d.get("suivi"))}, fixes


def garde(pr, verdict, own, raw):
    """Avant de poster (étape map_event, 0 token). Un avis sans matière n'est jamais posté : code 7 la 1re fois (l'avis est
    relancé, Goto avis), code 8 ensuite ou si les entrées manquent (relancer n'y changerait rien) : marqueur
    .kronn/vide-<n> et Goto skip_note. Sinon la review vérifiée et mise en page -> review.json (lue par poster et ligne),
    l'action GitHub sur stdout, code 0."""
    try:
        d = json.loads(raw) if (raw or "").strip() not in ("", "null") else None
    except ValueError:
        d = None
    why = sans_matiere(pr, d)
    n = re.sub(r"\D", "", str(pr))
    if not why:
        if verdict and not d.get("verdict"):
            d["verdict"] = verdict
        try:
            anchors = json.loads(dread(n, "ancres.json") or "{}")
        except ValueError:
            anchors = {}
        prec = re.findall(r"^(P\d+)\. ", dread(n, "precedent.md"), re.M)
        review, fixes = verifie(d, list(anchors), anchors, dread(n, "observation.md"), prec, own)
        review.update(corrections=fixes, verdict_avis=str(d.get("verdict") or ""))
        dwrite(n, "review.json", json.dumps(review, ensure_ascii=False))
        sys.stdout.write(review["event"])
        sys.stderr.write("".join("correction : %s\n" % f for f in fixes))
        return
    path = os.path.join(ddir(n), "garde.json")
    try:
        with open(path, encoding="utf-8") as f:
            essais = int(json.load(f).get("essais") or 0)
    except (OSError, ValueError):
        essais = 0
    essais += 1
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"essais": essais, "raison": why}, f, ensure_ascii=False)
    if essais == 1 and not why.startswith("entrées"):
        print(f"Review non postée : {why}. L'avis est relancé une fois.")
        sys.exit(7)
    with open(os.path.join(".kronn", "vide-" + n), "w", encoding="utf-8") as f:
        f.write(why + "\n")
    print(f"Review non postée : {why}.")
    sys.exit(8)


def essai(repo):
    """Mode essai (review.essai : true, ou la liste des dépôts) : la revue va jusqu'au bout, rien n'est posté, elle est
    gardée dans l'historique pour être comparée (le shadow de Kronn ne rejoue pas un workflow lancé en foreach)."""
    e = (CFG.get("review") or {}).get("essai")
    return e is True or (isinstance(e, list) and repo.lower() in {str(x).lower() for x in e})


def garde_historique(repo, pr, head, review, postee, url=""):
    """La revue dans l'historique (review.historique), jamais vidé : la passe suivante y lit ses points ouverts."""
    now = datetime.datetime.now(datetime.timezone.utc)
    at = now.isoformat(timespec="seconds").replace("+00:00", "Z")
    rec = {"repo": repo, "pr": int(re.sub(r"\D", "", str(pr)) or 0), "head": head, "at": at, "postee": postee, "url": url,
           "version": CFG.get("review_version") or {}, **{k: review.get(k) for k in (
               "verdict", "verdict_avis", "event", "body", "comments", "blockers", "corrections", "traces", "revus", "suivi")}}
    try:
        d = hdir(repo, pr)
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, now.strftime("%Y%m%dT%H%M%S%fZ") + ".json"), "w", encoding="utf-8") as f:
            json.dump(rec, f, ensure_ascii=False, indent=1)
    except OSError as e:  # l'historique ne bloque jamais l'envoi
        sys.stderr.write("historique : %s\n" % e)


def gh_post(path, body):
    r = subprocess.run(["gh", "api", "-X", "POST", path, "--input", "-"], input=json.dumps(body), capture_output=True, text=True, timeout=120)
    if r.returncode:
        return None, (r.stderr or r.stdout).strip()[:400]
    return json.loads(r.stdout or "null"), ""


def poster(pr, repo, me, head, agent, model):
    """La review vérifiée (review.json) postée par gh, avec la signature que write_ctx reconnaît ; GitHub refuse-t-il les
    commentaires inline, elle repart sans eux, leur contenu dans la synthèse. stdout = la ligne review_meta de la page."""
    n = re.sub(r"\D", "", str(pr))
    try:
        review = json.loads(dread(n, "review.json"))
    except ValueError:
        sys.exit("review.json illisible : la garde n'a pas tourné")
    sig = "\n\n— 🤖 *Review automatique · Le Bureau (%s - %s)*" % (agent or "?", model or "?")
    if essai(repo):
        garde_historique(repo, n, head, review, False)
        with open(os.path.join(".kronn", "essai-" + n), "w", encoding="utf-8") as f:
            f.write(review["verdict"] + "\n")
        print("Mode essai : review non postée, gardée dans l'historique (%s)." % hdir(repo, n))
        sys.exit(3)
    login = (gh("api", "user", "-q", ".login") or "").strip()
    if me and login and login != me:  # write_ctx ne reconnaîtrait pas la review au head suivant : elle serait refaite
        sys.exit("gh est connecté en %s, la connexion GitHub de Kronn en %s : rien n'est posté" % (login, me))
    path = "repos/%s/pulls/%s/reviews" % (repo, n)
    body = {"body": review["body"] + sig, "event": review["event"], "commit_id": head, "comments": review["comments"]}
    res, err = gh_post(path, body)
    if res is None and review["comments"]:
        review["corrections"].append("GitHub a refusé les commentaires inline (%s) : postés dans la synthèse" % err[:160])
        extra = "\n".join("- `%s:%s` %s" % (c["path"], c["line"], c["body"].replace("\n", " ")[:600]) for c in review["comments"])
        body.update(body=review["body"] + "\n\n" + extra + sig, comments=[])
        res, err = gh_post(path, body)
    if res is None:
        garde_historique(repo, n, head, review, False)
        with open(os.path.join(".kronn", "echec-" + n), "w", encoding="utf-8") as f:
            f.write(err + "\n")
        print("Review refusée par GitHub : " + err)
        sys.exit(9)
    review["posted_comments"] = len(body["comments"])
    dwrite(n, "review.json", json.dumps(review, ensure_ascii=False))
    garde_historique(repo, n, head, review, True, res.get("html_url") or "")
    print(json.dumps({"pr_url": res.get("pull_request_url") or "", "review_url": res.get("html_url") or "",
                      "signature": res.get("body") or "", "submitted_at": res.get("submitted_at") or "",
                      "verdict": review["verdict"]}, ensure_ascii=False))


def ligne(pr, repo, author, base, run_at, nfiles, adds, dels, npass):
    """La ligne du dataset reviews (page de récap) : les champs d'avant la vérification par le Bureau, depuis la review
    postée (verdict après correction, synthèse sans signature), et la version de la revue."""
    n = re.sub(r"\D", "", str(pr))
    try:
        r = json.loads(dread(n, "review.json"))
    except ValueError:
        sys.exit("review.json illisible")
    num = lambda v: int(v) if str(v).isdigit() else 0
    print(json.dumps({"pr": num(n), "repo": repo, "verdict": r.get("verdict") or "comment", "summary": r.get("body") or "",
                      "rebase": False, "author": author, "base": base or "main", "run_at": run_at,
                      "inline": int(r.get("posted_comments", len(r.get("comments") or []))), "reactions": 0, "replies": 0,
                      "diff_files": num(nfiles), "diff_add": num(adds), "diff_del": num(dels), "review_pass": num(npass),
                      "corrections": len(r.get("corrections") or []), "version": (CFG.get("review_version") or {}).get("hash") or ""},
                     ensure_ascii=False))


if __name__ == "__main__":
    cmd, a = sys.argv[1], sys.argv[2:] + [""] * 9
    if cmd == "contexte":
        contexte(a[0], a[1], sys.stdin.read())
    elif cmd == "ticket_cle":
        ticket_cle(a[0], a[1])
    elif cmd == "ticket":
        ticket(a[0], a[1])
    elif cmd == "poste":
        poste(a[0], a[1], a[2])
    elif cmd == "rapport":
        rapport(a[0], a[1], sys.stdin.read())
    elif cmd == "garde":
        garde(a[0], a[1], a[2], sys.stdin.read())
    elif cmd == "poster":
        poster(*a[:6])
    elif cmd == "ligne":
        ligne(*a[:9])
    elif cmd == "couts":
        couts(a[0] or os.getcwd())
    else:
        sys.exit("commande inconnue : " + cmd)
