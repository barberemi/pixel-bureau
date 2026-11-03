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
  python3 -c <ce script> poste <poste> <pr> <repo>     consigne du poste (stdout = son prompt, 0 token) ; code 5 pour
                                                la sécurité quand le contexte a écrit « Sécurité : non »
  python3 -c <ce script> rapport <poste> <pr>  (stdin : sortie de l'agent)   le rapport, rangé dans le dossier
  python3 -c <ce script> couts <worktree>|--all   coût et durée de chaque revue -> dataset review_sessions de la page de
                                                récap (DRY_RUN=1 : affiche sans publier)

Fichiers, dans la copie de travail du run (jamais le dossier du projet) : .kronn/pr-<n>/ (le worktree de la PR et son
.review-context.json, lu par l'avis) et .kronn/review-<n>/ (diff.md annoté, un rapport par poste).
Coût : chaque poste ouvre son prompt par « Review la PR #<n> (`<repo>`) · poste <poste> » ; couts regroupe les sessions
Claude Code d'une même revue en une ligne (coûts et jetons additionnés, durée du premier au dernier poste, détail dans
postes), sous l'id de la première session : la page de récap rapproche une ligne par revue.
"""
import datetime, glob, json, os, re, subprocess, sys, urllib.request
from _lib import API, CFG

POSTES = ("contexte", "docs", "lecture", "securite")
TITRES = {"contexte": "🗺 contexte", "docs": "📚 docs", "lecture": "🔍 lecture", "securite": "🔒 sécurité", "avis": "🧐 avis"}
CONV_FILES = ("docs/review.md", "docs/CONVENTIONS.md", "docs/AGENTS.md", "AGENTS.md", "CLAUDE.md", ".github/CONTRIBUTING.md",
              "CONTRIBUTING.md")
FORMAT = ("Rends un rapport court en Markdown, une puce par constat, au format : `- [bloquant|remarque|conseil] <icône> "
          "<chemin>:R<ligne> : le problème, pourquoi, le correctif proposé`. Le chemin est tel quel dans DIFF_FILES ; la ligne "
          "vient du diff annoté (R<n> = ligne de la nouvelle version, L<n> = ligne supprimée) ; un constat hors du diff n'a pas "
          "de ligne (`<chemin> : …`). Icônes : 🐛 Bug · 🔒 Sécurité · 🧪 Test · 🧬 Test faible · 🔁 Duplication · 📖 "
          "Lisibilité · ⚡ Perf · 💡 Suggestion · 📚 Doc. Bloquant = bug, faille, test manquant sur une logique critique, doc "
          "devenue fausse. Rien à signaler : écris « Rien à signaler. » N'invente rien : chaque constat se vérifie dans le code.")
MISSIONS = {
    "contexte": "Cadre la revue pour les postes suivants, sans juger le code. Rapport en Markdown, court : `Sens :` ce que "
                "fait la PR (deux phrases) ; `Stack :` les langages et frameworks du diff ; `À risque :` les fichiers qui "
                "méritent une lecture attentive, une puce chacun avec la raison ; `Tests :` ceux que la PR ajoute ou modifie, "
                "et la logique changée qui n'en a pas. Termine par une ligne exacte `Sécurité : oui` ou `Sécurité : non`. "
                "« oui » dès que le diff touche une surface sensible (entrée utilisateur, authentification ou droits, "
                "secrets ou configuration, requêtes SQL ou appels sortants, en-têtes, cookies ou CORS, upload, "
                "désérialisation, HTML rendu sans échappement, dépendances) ou dans le doute ; « non » seulement si rien de "
                "tout cela n'est touché (doc, style, tests seuls, refacto interne).",
    "docs": "Contrôle la PR au regard de la documentation du projet, dans le worktree (dossier docs/, AGENTS.md, CLAUDE.md, "
            "CONTRIBUTING.md). 1. Conventions : si docs/AGENTS.md existe, suis son routage (le tableau des tâches, puis la "
            "recherche) pour les fichiers du diff, charge seulement les fichiers qu'il indique, et relève les écarts du diff à "
            "ces règles en citant la règle (fichier:ligne). 2. Doc à jour : la PR change un comportement documenté (chemin, "
            "commande, configuration, API, architecture, règle) sans mettre à jour le passage qui le décrit : BLOQUANT, cite "
            "le passage devenu faux (fichier:ligne). Une doc utile à ajouter sans qu'aucune devienne fausse : conseil. "
            "3. Citations : dans chaque fichier de docs/ que la PR modifie, les références `[src: file: <chemin>:<ligne>]` "
            "doivent viser un fichier qui existe et une ligne qui dit ce qu'on lui fait dire ; une citation que la PR ajoute "
            "ou casse et qui ne tient plus : bloquant. Sans docs/ ni fichier de conventions : écris « Pas de documentation "
            "projet. » et arrête-toi. Icône 📚 pour la doc, celle du problème sinon.",
    "lecture": "Lis le diff et le code autour, et relève ce qui compte, par ordre de priorité : correction (bugs, cas limites, "
               "régressions, logique), tests (un changement de comportement sans test ajouté ou mis à jour dans la même PR ; "
               "bloquant si la logique est critique), lisibilité et maintenabilité (nommage voisin, complexité, code dupliqué "
               "ou logique réimplémentée alors qu'un helper existe : cite le point de mutualisation). Motifs transversaux : "
               "silence d'analyse statique ou de lint au lieu de corriger la cause, code réservé aux tests exposé en prod, "
               "refacto hors sujet. Passe « mutation », purement informative : pour chaque ligne de logique, une petite "
               "mutation (bornes, ===/!==, &&/||, garde supprimée, off-by-one, ?. vers ., ?? vers ||, await supprimé) "
               "survivrait-elle aux tests ? Si oui, un conseil 🧬 Test faible. Design patterns : seulement si le symptôme "
               "est dans le diff et que le bénéfice dépasse l'indirection ; un conseil 💡, jamais bloquant. N'applique que "
               "les règles des langages présents dans le diff ; ignore le style que le linter gère. La sécurité a son poste : "
               "ne signale ici qu'une faille évidente.",
    "securite": "Passe sécurité du diff, et seulement du diff : entrées non validées, injections (SQL, commande, HTML et XSS, "
                "chemin), authentification et droits, secrets ou jetons en clair, appels sortants contrôlés par l'utilisateur "
                "(SSRF), désérialisation, en-têtes, cookies et CORS, upload, dépendances ajoutées. Pour chaque constat, le "
                "chemin d'attaque concret en une phrase ; bloquant seulement pour un risque réel et exploitable, sinon "
                "remarque. Pas de liste de bonnes pratiques génériques.",
}


def ddir(pr):
    d = os.path.join(".kronn", "review-" + re.sub(r"\D", "", str(pr)))
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


def contexte(pr, me, raw):
    """Étape write_ctx : .review-context.json du worktree (lu par l'avis), le diff annoté et le dossier des postes vidé
    (une revue d'avant dans la même copie de travail), puis les états du run."""
    d = json.loads(raw or "{}")
    wt = os.path.join(".kronn", "pr-" + str(pr))
    head = subprocess.run(["git", "-C", wt, "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    if head and any((r.get("user") or {}).get("login") == me and "Review automatique" in (r.get("body") or "") and r.get("commit_id") == head
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
        if os.path.isfile(p):
            with open(p, encoding="utf-8", errors="replace") as f:
                conv = "### " + rel + "\n" + f.read()[:16000]
            break
    nl = "\n"
    out = ("DIFF_FILES:" + nl + nl.join(files) + nl + "---REVIEWS---" + nl + json.dumps(rv) + nl + "---COMMENTS---" + nl
           + json.dumps(cs) + nl + "---ANSWERED_ROOTS---" + nl + json.dumps(answered) + nl + "---PROJECT_CONVENTIONS---" + nl + conv)
    with open(os.path.join(wt, ".review-context.json"), "w", encoding="utf-8") as f:
        f.write(out)
    for old in glob.glob(os.path.join(ddir(pr), "*")):
        os.remove(old)
    diff = []
    for f in fl:
        head = "### %s (%s, +%s -%s)" % (f.get("filename"), f.get("status") or "modified", f.get("additions") or 0, f.get("deletions") or 0)
        body = annotate(f.get("patch")) if f.get("patch") else "(diff absent de l'API, fichier trop gros ou binaire : lis-le avec git dans le worktree)"
        diff.append(head + nl + "```diff" + nl + body + nl + "```")
    dwrite(pr, "diff.md", (nl + nl).join(diff)[:400000])
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


def guidelines():
    return str((CFG.get("review") or {}).get("guidelines") or "Aucune consigne d'équipe en plus de la grille.")


def poste(k, pr, repo):
    if k not in MISSIONS:
        sys.exit("Poste inconnu : " + k)
    if k == "securite" and not securite_utile(pr):  # code 5 : le sous-workflow saute à sa fin, sans agent
        print("Passe sécurité sautée : le contexte n'a rien vu de sensible dans le diff.")
        sys.exit(5)
    wt = ".kronn/pr-%s" % pr
    parts = ["Review la PR #%s (`%s`) · poste %s" % (pr, repo, k),
             "Tu es le poste %s de la revue de PR du Bureau : une chaîne de postes (🗺 contexte, 📚 docs, 🔍 lecture, 🔒 "
             "sécurité) lit la PR, puis le poste 🧐 avis vérifie leurs constats, tranche et rédige la review. Tu ne postes "
             "RIEN, n'appelles aucune API en écriture et ne modifies aucun fichier : tu lis et tu rends ton rapport, en "
             "français (le vocabulaire technique reste tel quel)." % TITRES[k],
             "## Où lire\n- Le code de la PR : le worktree `%s` (lecture, grep, git en lecture seule).\n- Le diff annoté : "
             "`%s/diff.md`.\n- Les fichiers modifiés (DIFF_FILES), les reviews et commentaires déjà postés : `%s/.review-context.json`."
             % (wt, ddir(pr), wt),
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


if __name__ == "__main__":
    cmd, a = sys.argv[1], sys.argv[2:] + [""] * 4
    if cmd == "contexte":
        contexte(a[0], a[1], sys.stdin.read())
    elif cmd == "poste":
        poste(a[0], a[1], a[2])
    elif cmd == "rapport":
        rapport(a[0], a[1], sys.stdin.read())
    elif cmd == "couts":
        couts(a[0] or os.getcwd())
    else:
        sys.exit("commande inconnue : " + cmd)
