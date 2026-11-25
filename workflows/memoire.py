"""Mémoire du soir (amélioration continue) : les retours du jour deviennent des leçons courtes, que le boss valide.

  python3 -c <ce script> releve [maintenant]   # 1. les retours humains au journal, le dossier de l'agent (stdout) ; le
                                               #    passage du cron qui ne tombe pas à memoire.heure s'arrête (code 3)
  python3 -c <ce script> propose     # 3. la proposition de l'agent (stdin) vérifiée et mise en diff pour la gate (stdout)
  python3 -c <ce script> applique    # 5. validée : les fiches réécrites, les précédentes gardées dans versions/
  python3 -c <ce script> fin         #    rien de nouveau, ou rien à changer : fin du run (0 token)

Étapes 2 (agent « consolide », seule étape avec des jetons) et 4 (ta gate) dans workflows/templates/memoire.json. Le relevé
lit ce que les workflows gardent déjà, sans rien leur demander de plus (0 token) :
- ticket : tes retours au tampon de la salle de rédaction (historique de ticket.py, champ retours) ;
- impl : tes retours aux gates de la chaîne (retours.md des dossiers en cache, un par texte ; les essais sont écartés) ;
- revue : les bloquants d'une revue réfutés par la passe suivante, avec leur preuve (historique des revues) ;
- correction : ton message « Changements » à la gate de « corriger les commentaires d'une PR » (état du run, pr_update.py).
Un fait n'entre qu'une fois au journal (memoire/journal/<date>.jsonl, gardé JOURNAL_JOURS jours). Rien de nouveau : code 3,
le run saute à la fin sans agent. La proposition ne change rien : code 3 aussi.
"""
import datetime, difflib, glob, hashlib, json, os, re, shutil, sys
from _lib import CFG, TZ, read_json, write_json, write_text
from _memoire import MEM_WORKFLOWS, memoire_actifs, memoire_dir, memoire_lignes

JOURNAL_JOURS = 60  # jours de journal gardés (et premier relevé : l'historique de ces jours-là)
ANCIENS_JOURS = 30  # faits déjà vus redonnés à l'agent, pour qu'il voie ce qui revient
MAX_NOUVEAUX, MAX_ANCIENS, MAX_FAIT = 16000, 8000, 600  # caractères dans le dossier de l'agent
MAX_LIGNES = {"equipe": 25}  # leçons par fiche au plus ; les autres fiches : MAX_LIGNES_FICHE
MAX_LIGNES_FICHE, MAX_LIGNE = 40, 400
VERSIONS = 30  # validations gardées dans versions/
NOMS = {"equipe": "commune à tous", "ticket": "écriture de ticket (postes recherche, redaction, critique)",
        "impl": "chaîne d'implémentation (postes cadrage, code, tests, regles, securite, perf, besoin, doc, livraison)",
        "revue": "revue de PR (postes contexte, docs, lecture, securite, avis)",
        "correction": "corriger les commentaires d'une PR (un seul poste)"}


def now():
    return datetime.datetime.now(datetime.timezone.utc)


def mpath(*p):
    return os.path.join(memoire_dir(), *p)


def fid(*parts):
    return hashlib.sha1("\x1f".join(str(p) for p in parts).encode()).hexdigest()[:12]


def iso(d):
    return d.astimezone(datetime.timezone.utc).isoformat(timespec="seconds")


def when(s):
    """Une date ISO (UTC si sans fuseau) ou « AAAA-MM-JJ HH:MM » à l'heure du bureau (retours.md de la chaîne)."""
    s = str(s or "").strip()
    try:
        if re.fullmatch(r"\d{4}-\d\d-\d\d \d\d:\d\d", s):
            return datetime.datetime.strptime(s, "%Y-%m-%d %H:%M").replace(tzinfo=TZ)
        d = datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=datetime.timezone.utc)
    except ValueError:
        return None


def court(t, n=MAX_FAIT):
    t = " ".join(str(t or "").split())
    return t if len(t) <= n else t[:n - 1] + "…"


def fait(workflow, at, texte, source, poste="", ident=None):
    return {"id": ident or fid(workflow, source, texte), "at": iso(at), "workflow": workflow, "poste": poste,
            "texte": court(texte), "source": court(source, 120)}


# ---------- sources (0 token) ----------
def faits_ticket(depuis):
    base = os.path.expanduser(((CFG.get("jira") or {}).get("create") or {}).get("historique") or "~/.local/share/pixel-bureau/historique/ticket")
    out = []
    for f in glob.glob(os.path.join(base, "*.json")):
        try:
            h = read_json(f)
        except (OSError, ValueError):
            continue
        if not isinstance(h, dict) or h.get("essai"):
            continue
        src = f"intention {str(h.get('run') or '')[:8]} : {h.get('intention') or ''}"
        for r in h.get("retours") or []:
            d = when((r or {}).get("at"))
            if d and d >= depuis and str(r.get("texte") or "").strip():
                out.append(fait("ticket", d, r["texte"], src))
    return out


RETOUR = re.compile(r"^## Retour humain \(([^,]+), ([^)]*)\)(?:[^\n]*?<!-- (\w+) -->)?[^\n]*\n(.*?)(?=^## Retour humain |\Z)", re.S | re.M)


def faits_impl(depuis):
    base = os.path.expanduser("~/.cache/pixel-bureau/chaine")
    out = []
    for f in glob.glob(os.path.join(base, "**", "retours.md"), recursive=True):
        try:
            e = read_json(os.path.join(os.path.dirname(f), "etat.json"))
        except (OSError, ValueError):
            e = {}
        if isinstance(e, dict) and (e.get("essai") or str(e.get("mode") or "").lower() == "essai"):
            continue  # essai de la chaîne : des consignes d'essai, pas des retours sur le travail
        try:
            txt = open(f, encoding="utf-8").read()
        except OSError:
            continue
        ticket = os.path.relpath(f, base).split(os.sep)[0]
        for m in RETOUR.finditer(txt):
            d = when(m.group(2))
            if d and d >= depuis and m.group(4).strip():
                out.append(fait("impl", d, m.group(4), "ticket " + ticket, m.group(1).strip(),
                                fid("impl", ticket, m.group(3) or m.group(4).strip())))
    return out


def faits_revue(depuis):
    base = os.path.expanduser(str((CFG.get("review") or {}).get("historique") or "~/.local/share/pixel-bureau/revues"))
    prs = {}
    for f in glob.glob(os.path.join(base, "*", "pr-*", "*.json")):
        try:
            h = read_json(f)
        except (OSError, ValueError):
            continue
        if isinstance(h, dict) and h.get("postee") and h.get("repo") and h.get("pr"):
            prs.setdefault((str(h["repo"]), str(h["pr"])), []).append(h)
    out = []
    for (repo, pr), ps in prs.items():
        ps.sort(key=lambda h: str(h.get("at") or ""))
        for prev, h in zip(ps, ps[1:]):
            d = when(h.get("at"))
            if not d or d < depuis:
                continue
            for s in h.get("suivi") or []:
                if not isinstance(s, dict) or str(s.get("etat") or "").lower() not in ("refute", "réfuté"):
                    continue
                m = re.match(r"\s*P?(\d+)", str(s.get("point") or ""))
                bl = prev.get("blockers") or []
                quoi = bl[int(m.group(1)) - 1] if m and 0 < int(m.group(1)) <= len(bl) else s.get("point")
                out.append(fait("revue", d, f"Bloquant réfuté par la passe suivante : {court(quoi, 300)} ; preuve : {court(s.get('preuve'), 260)}",
                                f"{repo}#{pr}", "avis", fid("revue", repo, pr, h.get("at"), s.get("point"))))
    return out


def faits_correction(depuis):
    out = []
    for f in glob.glob(os.path.expanduser("~/.cache/pixel-bureau/pr/runs/*.json")):
        try:
            st = read_json(f)
        except (OSError, ValueError):
            continue
        r = (st or {}).get("retour_humain") if isinstance(st, dict) else None
        d = when((r or {}).get("at"))
        if d and d >= depuis and str(r.get("texte") or "").strip():
            out.append(fait("correction", d, r["texte"], f"{r.get('repo') or st.get('repo') or ''}#{r.get('pr') or st.get('pr') or ''}"))
    return out


SOURCES = {"ticket": faits_ticket, "impl": faits_impl, "revue": faits_revue, "correction": faits_correction}


# ---------- journal ----------
def journal(jours=JOURNAL_JOURS):
    """Les faits des derniers jours, du plus ancien au plus récent."""
    lim = (now() - datetime.timedelta(days=jours)).strftime("%Y-%m-%d")
    out = []
    for f in sorted(glob.glob(mpath("journal", "*.jsonl"))):
        if os.path.basename(f)[:10] < lim:
            continue
        with open(f, encoding="utf-8") as fh:
            for line in fh:
                try:
                    out.append(json.loads(line))
                except ValueError:
                    pass
    return out


def purge():
    lim = (now() - datetime.timedelta(days=JOURNAL_JOURS)).strftime("%Y-%m-%d")
    for f in glob.glob(mpath("journal", "*.jsonl")):
        if os.path.basename(f)[:10] < lim:
            os.remove(f)


def fiche(nom):
    try:
        return open(mpath(nom + ".md"), encoding="utf-8").read()
    except OSError:
        return ""


def bloc(faits, maxi):
    lignes, n = [], 0
    for x in sorted(faits, key=lambda x: x["at"], reverse=True):
        line = f"- [{x['workflow']}{'/' + x['poste'] if x.get('poste') else ''}] {x['at'][:10]} · {x['source']} : {x['texte']}"
        if n + len(line) > maxi:
            lignes.append(f"- … et {len(faits) - len(lignes)} autres, plus anciens")
            break
        lignes.append(line)
        n += len(line) + 1
    return "\n".join(lignes) or "(aucun)"


def passage_cron(local, h):
    """Le passage du cron qui ne tombe pas à memoire.heure : il tourne aux deux heures UTC possibles (été, hiver), à la
    minute 0. Un lancement à la main (une autre minute) passe toujours."""
    return local.hour != h and local.minute < 15


def releve(heure=None):
    h = int((CFG.get("memoire") or {}).get("heure") or 22) % 24
    if heure != "maintenant" and passage_cron(now().astimezone(TZ), h):
        print(f"Pas {h} h au bureau (heure d'été ou d'hiver) : la mémoire du soir passe à l'autre passage du cron.")
        sys.exit(3)
    actifs = memoire_actifs()
    if not actifs:
        print("Mémoire éteinte (memoire.actif ou memoire.workflows) : rien à relever.")
        sys.exit(3)
    os.makedirs(mpath("journal"), exist_ok=True)
    purge()
    vus = {x.get("id") for x in journal()}
    depuis = now() - datetime.timedelta(days=JOURNAL_JOURS)
    nouveaux, erreurs = [], []
    for wf in actifs:
        try:
            nouveaux += [x for x in SOURCES[wf](depuis) if x["id"] not in vus]
        except Exception as e:  # une source illisible n'empêche pas les autres
            erreurs.append(f"{wf} : {e}")
    nouveaux = list({x["id"]: x for x in nouveaux}.values())
    if nouveaux:
        path = mpath("journal", now().astimezone(TZ).strftime("%Y-%m-%d") + ".jsonl")
        with open(path, "a", encoding="utf-8") as f:
            for x in sorted(nouveaux, key=lambda x: x["at"]):
                f.write(json.dumps(x, ensure_ascii=False) + "\n")
    for e in erreurs:
        print("bureau : source illisible, " + e, file=sys.stderr)
    if not nouveaux:
        print("Aucun retour nouveau depuis le dernier relevé : la mémoire reste telle quelle.")
        sys.exit(3)
    ids = {x["id"] for x in nouveaux}
    anciens = [x for x in journal(ANCIENS_JOURS) if x.get("id") not in ids and x.get("workflow") in actifs]
    par = {wf: sum(1 for x in nouveaux if x["workflow"] == wf) for wf in actifs}
    parts = [f"# Relevé du {now().astimezone(TZ).strftime('%d/%m/%Y')}",
             "Nouveaux retours : " + ", ".join(f"{wf} {n}" for wf, n in par.items()) + "."]
    parts.append("## Retours nouveaux (depuis le dernier relevé)\n" + bloc(nouveaux, MAX_NOUVEAUX))
    parts.append(f"## Retours déjà vus ces {ANCIENS_JOURS} derniers jours (pour repérer ce qui revient ; déjà traités)\n" + bloc(anciens, MAX_ANCIENS))
    parts.append("## Fiches actuelles")
    for nom in ("equipe",) + actifs:
        lim = MAX_LIGNES.get(nom, MAX_LIGNES_FICHE)
        parts.append(f"### Fiche `{nom}` ({NOMS[nom]} ; {lim} leçons au plus)\n" + (fiche(nom).strip() or "(vide)"))
    print("\n\n".join(parts))


# ---------- proposition ----------
def propre(nom, contenu):
    """Le contenu d'une fiche ramené à son format : un titre, une leçon par ligne « - … », bornée ; ce qui dépasse est
    signalé à la gate."""
    titre = f"# Mémoire · {nom}"
    lecons, coupees = [], 0
    for line in str(contenu or "").splitlines():
        s = " ".join(line.split())
        if not s.startswith("- ") or len(s) < 4:
            continue
        if len(s) > MAX_LIGNE:
            s = s[:MAX_LIGNE - 1] + "…"
        if s not in lecons:
            lecons.append(s)
    lim = MAX_LIGNES.get(nom, MAX_LIGNES_FICHE)
    if len(lecons) > lim:
        coupees, lecons = len(lecons) - lim, lecons[:lim]
    return titre + "\n\n" + "\n".join(lecons) + "\n", coupees


def propose():
    raw = sys.stdin.read().strip()
    try:
        p = json.loads(raw) if raw else None
    except ValueError:
        p = None
    if not isinstance(p, dict):
        print("La proposition de l'agent est illisible : la mémoire reste telle quelle.")
        sys.exit(3)
    permis = ("equipe",) + memoire_actifs()
    fiches, avis, diffs, ajout, retrait = {}, [], [], 0, 0
    for f in p.get("fiches") or []:
        nom = str((f or {}).get("nom") or "").strip().lower()
        if nom not in permis:
            avis.append(f"fiche « {nom} » ignorée (inconnue ou éteinte)")
            continue
        neuf, coupees = propre(nom, f.get("contenu"))
        if coupees:
            avis.append(f"fiche {nom} : {coupees} leçon(s) de trop retirée(s) (les dernières)")
        old = fiche(nom)
        if neuf.strip() == old.strip() or (not memoire_lignes(nom) and "\n- " not in neuf):
            continue  # inchangée, ou vide et qui le reste
        fiches[nom] = neuf
        d = "".join(difflib.unified_diff(old.splitlines(True), neuf.splitlines(True), f"{nom}.md (avant)", f"{nom}.md (proposé)", n=0))
        ajout += sum(1 for x in d.splitlines() if x.startswith("+- "))  # leçon nouvelle ou reformulée
        retrait += sum(1 for x in d.splitlines() if x.startswith("-- "))
        diffs.append(f"**Fiche {nom}** : {court(f.get('pourquoi'), 300) or 'sans explication'}\n\n```diff\n{d.strip()}\n```")
    promos = [x for x in p.get("promotions") or [] if isinstance(x, dict) and str(x.get("lecon") or "").strip()][:5]
    if not fiches and not promos:
        print("L'agent ne propose aucun changement : la mémoire reste telle quelle." + (" " + " ; ".join(avis) if avis else ""))
        sys.exit(3)
    write_json(mpath("proposition.json"), {"at": iso(now()), "fiches": fiches, "promotions": promos, "lecons": ajout, "retirees": retrait})
    # la 1re ligne porte le compte, que la page lit dans le message de la gate (bulle du marchand de sable)
    compte = f"{ajout} leçon{'s' if ajout > 1 else ''} à valider" + (f", {retrait} retirée{'s' if retrait > 1 else ''}" if retrait else "")
    out = [f"🧠 **Mémoire du soir** · {compte} : " + (court(p.get("resume"), 600) or "ce que les retours du jour ont appris.")]
    out += diffs or ["Aucune fiche à changer."]
    if promos:
        out.append("**À graver dans le dépôt** (leçons qui reviennent ; à faire toi-même, en PR) :\n" + "\n".join(
            f"- {court(x.get('lecon'), 300)} → {court(x.get('cible'), 120) or 'docs/'}" + (f" ({court(x.get('pourquoi'), 200)})" if x.get("pourquoi") else "")
            for x in promos))
    if avis:
        out.append("Remarques : " + " ; ".join(avis) + ".")
    out.append("**Approuver** : les fiches sont réécrites (les précédentes gardées dans versions/), les agents les lisent dès "
               "leur prochain run. **Changements** : l'agent refait sa proposition avec ton message. **Rejeter** : rien ne change.")
    print("\n\n".join(out))


def applique():
    try:
        p = read_json(mpath("proposition.json"))
    except (OSError, ValueError):
        print("Aucune proposition à appliquer.")
        return
    stamp = now().astimezone(TZ).strftime("%Y%m%d-%H%M%S")
    faites = []
    for nom, contenu in (p.get("fiches") or {}).items():
        if nom not in ("equipe",) + MEM_WORKFLOWS:
            continue
        if os.path.exists(mpath(nom + ".md")):
            os.makedirs(mpath("versions", stamp), exist_ok=True)
            shutil.copy2(mpath(nom + ".md"), mpath("versions", stamp, nom + ".md"))
        write_text(mpath(nom + ".md"), contenu)
        faites.append(f"{nom} ({len(memoire_lignes(nom))} leçons)")
    os.remove(mpath("proposition.json"))
    for old in sorted(glob.glob(mpath("versions", "*")))[:-VERSIONS]:
        shutil.rmtree(old, ignore_errors=True)
    print("Mémoire mise à jour : " + (", ".join(faites) or "aucune fiche") + ".")


def fin():
    print("Fin de la mémoire du soir.")


if __name__ == "__main__":
    cmds = {"releve": releve, "propose": propose, "applique": applique, "fin": fin}
    if len(sys.argv) < 2 or sys.argv[1] not in cmds:
        sys.exit("sous-commande : " + " | ".join(cmds))
    cmds[sys.argv[1]](*sys.argv[2:3])
