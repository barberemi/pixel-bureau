"""Chaîne d'implémentation (#76, #125), le lanceur et la sortie : PR, revue, retours, publication ; une sous-commande
par étape Exec.

La chaîne est en trois scripts, chacun passé à Kronn en un argument `python3 -c` (Linux : 128 Kio au plus par argument) :
chaine.py (dossier, postes, Code, bilan), chaine_controles.py (contrôles, aiguillage), chaine_pr.py (lanceur, PR, revue, retours, publication) ; le commun est dans _chaine.py, recopié dans chacun au rendu.

  lance <ticket> <mode> <dépôt> [reprise]
                                    # lanceur : stdin ticket Jira ; une chaîne par dépôt (composants Jira), chacune dans
                                    # son projet Kronn ; reprise auto|oui|non (auto : reprend si le dernier run a échoué, pas s'il a été rejeté)
  pousse | pr | revue_prep                          # PR et sa revue (gh)
  revue_locale | retours_local                      # mode essai : revue de la PR sur le diff local (code 6 de revue_prep et
                                    # retours_pr), constats corrigés en commits locaux, rien de poussé ni posté
  retours_pr | retours_synchro <run> | repasse      # retours des relecteurs par pr_update.py (fix_*, sans gate) : la PR
                                    # en « dépôt#n » (code 3 : essai ou pas de PR), puis la copie de travail resynchronisée
                                    # et la description à jour ; repasse code 4 : seconde revue et retours (2 passes au plus)
  pret | reviewers | fin                              # publication après ta relecture (gh)
"""
import fnmatch, hashlib, json, os, re, subprocess, sys, time
from _lib import CFG, get, read_json, send, write_json, write_text
from _chaine import *  # noqa: F401,F403  (recopié au rendu, comme _lib)

KEY = re.compile(r"^[A-Z][A-Z0-9]+-\d+$")


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
    (None, pourquoi). Essai d'DM-7945 : front_api était cloné dans ~/Sites mais n'avait pas de projet Kronn."""
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


def sauter(what):
    if essai():
        print(f"Mode essai : {what} sauté, rien n'est envoyé.")
        return True
    return False


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


def bloc(nom, corps):
    return f"<!-- bureau-{nom} -->\n{corps}\n<!-- /bureau-{nom} -->" if corps else ""


def exigences_md():
    """Le tableau exigence par exigence, tiré du rapport du poste 🎯 Besoin (pas réécrit par l'agent qui rédige)."""
    ex = [x for x in ((load("besoin.json") or {}).get("resultat") or {}).get("exigences") or [] if isinstance(x, dict)]
    if not ex:
        return ""
    return ("## Ce que le ticket demandait, et où ça atterrit\n\n| Exigence du ticket | État | Détail |\n|---|---|---|\n"
            + "\n".join(f"| {cellule(x.get('exigence'))} | {ETATS.get(x.get('etat'), cellule(x.get('etat')))} | {cellule(x.get('detail'))} |"
                        for x in ex))


def points_md():
    """Points ouverts : bloquants restés (gate d'escalade approuvée) et avis des contrôles, écrits par le script. Essai
    d'DM-7945 : l'orchestrateur disait « à reporter dans la PR », le rédacteur les a omis et la PR annonçait « qat retiré »."""
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
    rows += [f"- (Code) `{f}` : doc refusée par le garde-fou de Kronn (faux positif possible), à relire" for f in docs_rejetees()]
    if not rows:
        return ""
    more = f"\n- … et {len(rows) - 15} autres (rapports des contrôles)" if len(rows) > 15 else ""
    return "## Points ouverts\n\nRelevés par les contrôles de la chaîne, non corrigés dans cette PR.\n\n" + "\n".join(rows[:15]) + more


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
    e["passes_retours"] = 0  # passes revue puis retours de cette livraison (repasse)
    write_json(dossier("etat.json"), e)
    sisters = e.get("soeurs") or []
    prs = {} if essai() else {r: pr_of(r, f"kronn/{e['ticket']}") for r in sisters}
    body = place(place(SOEURS.sub("", d.get("body") or ""), "exigences", exigences_md()), "points", points_md())
    body += (soeurs_md(e["ticket"], sisters, prs) if sisters else "") + "\n\n<!-- bureau-chaine -->"
    path = dossier("pr_body.md")
    write_text(path, body)
    write_text(dossier("commit.txt"), (str(d.get("commit") or "").strip() or d.get("title") or e["ticket"]) + "\n")  # le commit unique (pret)
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
    """Revue de la PR par le modèle de revue du Bureau (sous-workflow en foreach) : la PR en .kronn/prs.json. Pas de PR :
    code 3, rien n'est relu. Mode essai : code 6, revue locale (étape locale du poste, diff de la branche, rien n'est
    posté) ; son contexte est la sortie de l'étape."""
    e = etat()
    if essai():
        passe = int(e.get("passes_retours") or 0) + 1
        out(f"REVUE LOCALE (mode essai, passe {passe} sur {MAX_PASSES}) : rien n'est poussé ni posté, la PR n'existe pas.\n"
            f"Diff à relire : `git diff {depart()}...HEAD` dans la copie de travail {root()} (branche {e.get('branch')}).\n"
            f"Ticket : {dossier('ticket.md')} ; description de la PR prévue : {dossier('pr_body.md')} ; rapports des "
            f"contrôles : {dossier('controles.json')}." + rejoue() + perimetre() + non_fiable() + releves() + recherches()
            + (section("Ta revue de la passe précédente (relis surtout ce qui a changé depuis)",
                       json.dumps((load("revue_pr.json") or {}).get("resultat") or {}, ensure_ascii=False, indent=1)[:6000])
               if passe > 1 and load("revue_pr.json") else ""))
        sys.exit(6)
    n = e.get("pr") or pr_number()
    if not n:
        print("Aucune PR ouverte : rien à relire.")
        sys.exit(3)
    _, me, _ = gh("api", "user", "--jq", ".login")
    os.makedirs(os.path.join(root(), ".kronn"), exist_ok=True)
    write_json(os.path.join(root(), ".kronn", "prs.json"), [{"number": int(n), "author": me, "repo": e["repo"]}])
    print(f"PR #{n} confiée à la revue")


PR_RUNS = os.path.expanduser("~/.cache/pixel-bureau/pr/runs")  # états des runs de pr_update.py (fix_prepare … fix_push)


MAX_PASSES = 2  # revue puis retours : une seconde passe au plus, si la première a poussé des corrections


def cmd_revue_locale():
    """Mode essai : le rapport de la revue locale (stdin, sortie de l'agent) rangé dans revue_pr.json, rien de posté."""
    d = parse(read_stdin())
    if not isinstance(d, dict):
        write_json(dossier("revue_pr.json"), {"poste": "revue_pr", "statut": "en_panne", "raison": "aucun rapport de la revue locale"})
        print("Revue locale : aucun rapport (sortie invalide)")
        return
    d.setdefault("constats", [])
    passe = int(etat().get("passes_retours") or 0) + 1
    write_json(dossier("revue_pr.json"), {"poste": "revue_pr", "statut": "ok", "locale": True, "passe": passe, "resultat": d,
                                          "head": git("rev-parse", "HEAD"), "at": time.strftime("%Y-%m-%dT%H:%M:%S")})
    write_json(dossier(f"revue_pr_passe{passe}.json"), d)
    bl = sum(1 for x in d["constats"] if isinstance(x, dict) and x.get("gravite") == "bloquant")
    print(f"Revue locale, passe {passe} : {d.get('verdict') or '?'}, {len(d['constats'])} constat(s) dont {bl} bloquant(s) ; rien n'est posté.")


def cmd_retours_pr():
    """Poste 💬 retours : le même code que « corriger les commentaires d'une PR » (pr_update.py fix_*), sans sa gate. Il
    lui faut la PR, en « dépôt#n » (seule sortie de l'étape) ; pas de PR : code 3, rien n'est lu ni posté. Mode essai :
    les constats de la revue locale (code 6, correction locale sans push) ; aucun : code 3."""
    e = etat()
    if essai():
        cs = revue_locale_constats()
        e.update(retours_pousse=False, retours_sha=git("rev-parse", "HEAD"))
        write_json(dossier("etat.json"), e)
        if not cs:
            print("Mode essai : la revue locale n'a rien relevé, pas de retours.")
            sys.exit(3)
        out(f"RETOURS DE LA REVUE LOCALE (mode essai) : {len(cs)} constat(s) à traiter dans la copie de travail {root()} "
            f"(branche {e.get('branch')}, diff depuis {depart()}). Rien n'est poussé ni posté.\n\n"
            + json.dumps(cs, ensure_ascii=False, indent=1)[:12000])
        sys.exit(6)
    n = e.get("pr") or pr_number()
    if not n:
        print("Aucune PR ouverte : pas de retours.")
        sys.exit(3)
    e.update(pr=n, retours_pousse=False)
    write_json(dossier("etat.json"), e)
    sys.stdout.write(f"{e['repo']}#{n}")


def cmd_retours_synchro(run=""):
    """Après fix_push : la copie de travail de la chaîne reprend les commits poussés par pr_update.py (qui travaille dans
    son propre dossier, sur la branche distante de la PR) : fetch puis avance rapide sur origin/<branche>, sans quoi le
    squash de la publication les écraserait ; une copie divergente échoue sans rien toucher. La description de la PR,
    relue sur GitHub (le bloc « Corrections de review » de fix_push y reste), garde ses blocs exigences et points à
    jour. La passe est notée (retours.json) pour le bilan et pour la seconde passe (repasse)."""
    if sauter("reprise des corrections poussées"):
        return
    e = etat()
    b, n = e["branch"], e.get("pr") or pr_number()
    git("fetch", "--no-tags", "origin", f"+refs/heads/{b}:refs/remotes/origin/{b}", check=True)
    remote, head = git("rev-parse", f"origin/{b}"), git("rev-parse", "HEAD")
    pousse = bool(remote) and remote != head
    if pousse:
        if not git_ok("merge-base", "--is-ancestor", head, remote):
            sys.exit(f"Copie de travail divergente de origin/{b} : corrections non reprises, à régler avant la publication.")
        git("merge", "--ff-only", remote, check=True)
    try:
        st = read_json(os.path.join(PR_RUNS, re.sub(r"[^\w-]", "", run) + ".json"))
    except (OSError, ValueError):
        st = {}
    cols = {}
    for c in (st.get("cols") or {}).values():
        cols[c] = cols.get(c, 0) + 1
    r = load("retours.json", {}) or {}
    if not isinstance(r, dict) or "passes" not in r:
        r = {"pr": n, "passes": []}
    r["passes"].append({"run": run, "version": st.get("version"), "fils": len(st.get("threads") or []),
                        "hors_fil": len(st.get("generaux") or []), "colonnes": cols, "pousse": pousse,
                        "commit": remote[:8] if pousse else None})
    r["reponses"] = sum(sum(v for k, v in (p.get("colonnes") or {}).items() if k != "laisse") + int(p.get("hors_fil") or 0)
                        for p in r["passes"])
    write_json(dossier("retours.json"), r)
    e = etat()
    e["retours_pousse"] = pousse
    write_json(dossier("etat.json"), e)
    path, maj = dossier("pr_body.md"), ""
    code, body, _ = gh("pr", "view", str(n), "-R", e["repo"], "--json", "body", "-q", ".body") if n else (1, "", "")
    if code == 0 and body:
        write_text(path, place(place(body, "exigences", exigences_md()), "points", points_md()))
        maj = " ; description remise à jour" if gh("pr", "edit", str(n), "-R", e["repo"], "--body-file", path)[0] == 0 else ""
    print((f"Corrections reprises dans la copie de travail ({remote[:8]})" if pousse else "Rien de poussé") + f", PR #{n}{maj}")


def cmd_repasse():
    """Après le poste 💬 retours : des corrections poussées et moins de MAX_PASSES passes, code 4 (la revue relit le
    nouveau head, puis les retours) ; sinon 0, fin. Le compteur repart de zéro à l'étape pr (cmd_pr)."""
    e = etat()
    e["passes_retours"] = int(e.get("passes_retours") or 0) + 1
    again = bool(e.get("retours_pousse")) and e["passes_retours"] < MAX_PASSES  # en essai : corrections locales
    e["retours_pousse"] = False
    write_json(dossier("etat.json"), e)
    if again:
        print(f"Passe {e['passes_retours']} : corrections poussées, la revue relit la PR (passe {e['passes_retours'] + 1} sur {MAX_PASSES}).")
        sys.exit(4)
    print(f"Passe {e['passes_retours']} : " + ("dernière passe faite." if e.get("passes_retours", 0) >= MAX_PASSES else "rien de poussé, fin."))


def ci_label():
    """Le label qui lance la CI complète, posé au passage en prête : impl.repos.<dépôt>.ci_label, sinon impl.ci_label ; « »
    ou absent : aucun."""
    reg = reglages()
    return str(reg["ci_label"] if "ci_label" in reg else impl().get("ci_label") or "").strip()


def squash():
    """Les commits de la branche (un par lot, puis ceux de la revue et des retours) en un seul, au format des commits du
    dépôt (le message du rédacteur, commit.txt) : les PR de l'équipe sont mergées en un commit (règle de leur
    doc/GIT-workflow.md). impl.squash (ou impl.repos.<dépôt>.squash) à false : rien. Rend le texte du compte rendu."""
    reg = reglages()
    if not reg.get("squash", impl().get("squash", True)):
        return "commits gardés (squash coupé)"
    n = git("rev-list", "--count", f"{depart()}..HEAD").strip()
    if not n.isdigit() or int(n) < 2:
        return "un seul commit"
    msg = dossier("commit.txt")
    if not os.path.exists(msg):
        write_text(msg, (etat().get("ticket") or "chore") + "\n")
    if not git_ok("reset", "--soft", depart()) or not git_ok("commit", "--no-verify", "-s", "-F", msg):
        git("reset", "--soft", "ORIG_HEAD")
        return "squash impossible, commits gardés"
    e = etat()
    git("push", "--no-verify", "--force-with-lease", "origin", f"HEAD:{e['branch']}", check=True)
    return f"{n} commits réunis en un"


def cmd_pret():
    avance("publication")
    if sauter("passage en prête"):
        return
    e = etat()
    n = e.get("pr") or pr_number()
    sq = squash()
    code, _, err = gh("pr", "ready", n, "-R", e["repo"])
    label = ci_label()
    if label and code == 0:
        gh("pr", "edit", n, "-R", e["repo"], "--remove-label", label)
        lc, _, _ = gh("pr", "edit", n, "-R", e["repo"], "--add-label", label)
        label = f", label {label} posé (CI complète)" if lc == 0 else f", label {label} non posé"
    else:
        label = ""
    print((f"PR #{n} prête à relire" if code == 0 else f"PR #{n} : passage en prête impossible ({err[:200]})") + f" ; {sq}{label}")


def cmd_reviewers():
    if sauter("demande de relecture et commentaire Jira"):
        sys.exit(5)  # code 5 : le modèle saute l'étape Jira qui suit
    e, reg = etat(), reglages()
    n = e.get("pr") or pr_number()
    who = [r for r in reg.get("reviewers") or [] if r]
    if who:
        gh("pr", "edit", n, "-R", e["repo"], "--add-reviewer", ",".join(who))
    url = f"https://github.com/{e['repo']}/pull/{n}"
    out(f"PR prête à relire : [{url}|{url}] (chaîne d'implémentation du Bureau, {e.get('tours', 0)} tour(s) de contrôle, revue IA traitée)."
        + ecarts_jira())


def ecarts_jira():
    """Les écarts au ticket, actés dans Jira (wiki) : les relecteurs lisent la PR contre le ticket, et un écart qui n'est
    écrit que dans la PR bloque (#2038, #2031) ; ce que le diff fait sans exigence (périmètre) aussi."""
    b = (load("besoin.json") or {}).get("resultat") or {}
    ex = [x for x in b.get("exigences") or [] if isinstance(x, dict) and x.get("etat") not in (None, "fait")]
    hors = [x for x in b.get("hors_ticket") or [] if isinstance(x, dict)]
    if not ex and not hors:
        return ""
    t = ""
    if ex:
        t += "\n\nh4. Écarts au ticket (à valider)\n||Exigence||État||Détail||\n" + "\n".join(
            f"|{cellule(x.get('exigence'), 300) or ' '}|{ETATS.get(x.get('etat'), cellule(x.get('etat')))}|{cellule(x.get('detail'), 400) or ' '}|" for x in ex)
    if hors:
        t += "\n\nh4. Changé sans exigence du ticket\n" + "\n".join(
            "* " + "{" * 2 + cellule(x.get("fichier"), 160) + "}" * 2 + f" : {cellule(x.get('changement'), 300)}"  # accolades doubles : monospace Jira, jamais écrites telles quelles (Kronn y verrait une variable) + (f" ({cellule(x.get('justification'), 300)})" if x.get("justification") else "")
            for x in hors)
    return t


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
    simple = {"pousse": cmd_pousse, "pr": cmd_pr, "pret": cmd_pret, "reviewers": cmd_reviewers, "fin": cmd_fin, "revue_prep": cmd_revue_prep, "retours_pr": cmd_retours_pr, "repasse": cmd_repasse, "revue_locale": cmd_revue_locale}
    if cmd in simple:
        return simple[cmd]()
    if cmd == "lance":
        return cmd_lance(*(args + ["", "", "", ""])[:4])
    if cmd == "retours_synchro":
        return cmd_retours_synchro(args[0] if args else "")
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
