"""Mémoire du soir (amélioration continue) : les retours du jour deviennent des leçons courtes, que le boss valide.

  python3 -c <ce script> releve <run> [maintenant]  # 1. les retours humains au journal, le dossier de l'agent (stdout) ;
                                                   #    le passage du cron qui ne tombe pas à memoire.heure s'arrête (code 3)
  python3 -c <ce script> propose <run>         # 3. la proposition de l'agent (stdin) vérifiée et mise en diff pour la gate
                                               #    boss (stdout) ; rien pour elle mais des leçons du rejeu : code 4
  python3 -c <ce script> applique            # 5. validée : les fiches réécrites, les précédentes gardées dans versions/
  python3 -c <ce script> propose_rejeu <run> # 6. le message de la gate boss_rejeu ; rien du rejeu : code 3
  python3 -c <ce script> applique_rejeu <run>  # 8. validées : les leçons du rejeu ajoutées à la fiche impl
  python3 -c <ce script> fin                 #    rien de nouveau, ou rien à changer : fin du run (0 token)

Étapes 2 (agent « consolide », seule étape avec des jetons), 4 (gate boss) et 7 (gate boss_rejeu) dans
workflows/templates/memoire.json. Le relevé lit ce que les workflows gardent déjà, sans rien leur demander de plus (0 token) :
- ticket : tes retours au tampon de la salle de rédaction (historique de ticket.py, champ retours) ;
- impl : tes retours aux gates de la chaîne (retours.md des dossiers en cache, un par texte ; les essais sont écartés) ;
- revue : les bloquants d'une revue réfutés par la passe suivante, avec leur preuve (historique des revues) ;
- correction : ton message « Changements » à la gate de « corriger les commentaires d'une PR » (état du run, pr_update.py) ;
- rejeu : les écarts que le juge du rejeu (Palpatine, workflows/rejeu.py) a vus, avec leur leçon, hors jeu témoin ;
  « acceptable » n'est jamais retenu, « ticket_vague » va à la proposition classique (fiche ticket), « choix_agent » et
  « convention » à une seconde proposition (fiche impl), validée à sa propre gate.
Un fait n'entre qu'une fois au journal (memoire/journal/<date>.jsonl, gardé JOURNAL_JOURS jours). Rien de nouveau : code 3,
le run saute à la fin sans agent. La proposition ne change rien : code 3 aussi.

Kronn arrête le run sur un « Rejeter » (statut Failed, plus aucune étape) : un refus de la gate boss empêcherait la gate
boss_rejeu. D'où l'ordre boss, applique, puis boss_rejeu : la proposition classique est écrite avant que la seconde ne
s'ouvre, et les leçons du rejeu d'un run arrêté avant leur gate (boss rejetée, run coupé) reviennent au relevé suivant.
Les leçons du rejeu à valider sont dans <rejeu.dossier>/lecons.json (lu par la page « Rejeu · bilan ») :
{"a_valider": {"run", "le", "lecons": [{ticket, cause, lecon, poste, source}]} ou null, "validees": [{le, ..., run}]}.
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
REJEU_CAUSES = {"ticket_vague": "ticket", "choix_agent": "impl", "convention": "impl"}  # « acceptable » : jamais retenu
POSTES_IMPL = ("cadrage", "code", "tests", "regles", "securite", "perf", "besoin", "doc", "livraison")
VALIDEES = 300  # leçons du rejeu validées gardées dans lecons.json (pour la page « Rejeu · bilan »)
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


# ---------- rejeu (Palpatine) : les écarts du juge, hors jeu témoin ----------
def rejeu_dir():
    return os.path.expanduser(str((CFG.get("rejeu") or {}).get("dossier") or "~/.local/share/pixel-bureau/rejeu"))


def faits_rejeu(depuis):
    """Chaque écart du juge qui porte une leçon devient un fait, source « ⚡ <ticket> · <cause> » : ticket_vague pour la
    fiche ticket (proposition classique), choix_agent et convention pour la fiche impl (seconde proposition)."""
    out = []
    for f in glob.glob(os.path.join(rejeu_dir(), "*", "*.json")):
        try:
            r = read_json(f)
        except (OSError, ValueError):
            continue
        if not isinstance(r, dict) or "note_sur_100" not in r or r.get("jeu") == "temoin":
            continue  # demandes/, ou le jeu témoin : il mesure, il n'apprend rien
        d = when(r.get("fini_le"))
        if not d or d < depuis:
            continue
        ticket = str(r.get("ticket") or os.path.basename(os.path.dirname(f)))
        for i, e in enumerate((r.get("juge") or {}).get("ecarts") or []):
            e = e if isinstance(e, dict) else {}
            cause, lecon = str(e.get("cause") or ""), " ".join(str(e.get("lecon") or "").split())
            wf = REJEU_CAUSES.get(cause)
            if not wf or not lecon:
                continue
            poste = "redaction" if wf == "ticket" else str(e.get("poste") or "").lower()
            poste = poste if wf == "ticket" or poste in POSTES_IMPL else ""
            x = fait(wf, d, lecon + (f" (écart vu : {court(e.get('quoi'), 200)})" if e.get("quoi") else ""), f"⚡ {ticket} · {cause}",
                     poste, fid("rejeu", r.get("run") or f, i, lecon))
            out.append({**x, "rejeu": {"ticket": ticket, "cause": cause, "lecon": court(lecon, MAX_LIGNE - 20), "poste": poste}})
    return out


def lecons_lit():
    try:
        d = read_json(os.path.join(rejeu_dir(), "lecons.json"))
    except (OSError, ValueError):
        d = None
    d = d if isinstance(d, dict) else {}
    return {"a_valider": d.get("a_valider") if isinstance(d.get("a_valider"), dict) else None,
            "validees": [x for x in d.get("validees") or [] if isinstance(x, dict)]}


def lecons_ecrit(d):
    os.makedirs(rejeu_dir(), exist_ok=True)
    write_json(os.path.join(rejeu_dir(), "lecons.json"), d)  # atomique (_lib : fichier temporaire puis rename)


def passage():
    """Le run qui a déjà ouvert la gate boss_rejeu ({"run", "rejeu": true}, écrit par propose_rejeu)."""
    try:
        p = read_json(mpath("passage.json"))
    except (OSError, ValueError):
        p = None
    return p if isinstance(p, dict) else {}


def source(x):
    return f"⚡ {x.get('ticket')} · {x.get('cause')}"


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


def reportees(run):
    """Les leçons du rejeu d'un run fini avant leur gate (la gate boss rejetée : Kronn arrête le run ; ou coupé, annulé) :
    elles reviennent ce soir. Celles dont la gate s'est ouverte (passage.json) et qui n'ont pas été validées sont jetées :
    rejetées, ou laissées sans décision jusqu'au bout du délai. Dans tous les cas, a_valider est vidé."""
    lec = lecons_lit()
    av = lec["a_valider"]
    if not av or (run and av.get("run") == run):
        return []
    p = passage()
    out = [] if p.get("rejeu") and p.get("run") == av.get("run") else [x for x in av.get("lecons") or [] if isinstance(x, dict) and x.get("lecon")]
    lecons_ecrit({**lec, "a_valider": None})
    return out


def releve(*args):
    run = next((a for a in args if a != "maintenant"), "")
    h = int((CFG.get("memoire") or {}).get("heure") or 22) % 24
    if "maintenant" not in args and passage_cron(now().astimezone(TZ), h):
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
    for wf, src in [(wf, SOURCES[wf]) for wf in actifs] + [("rejeu", faits_rejeu)]:
        try:
            nouveaux += [x for x in src(depuis) if x["id"] not in vus and x["workflow"] in actifs]
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
    # la seconde proposition : les leçons du rejeu pour la fiche impl (nouvelles, et celles d'un run fini avant leur gate)
    rejeu = [x["rejeu"] for x in nouveaux if x.get("rejeu") and x["workflow"] == "impl"]
    vues = {(x["ticket"], x["cause"], x["lecon"]) for x in rejeu}
    rejeu += [x for x in reportees(run) if "impl" in actifs and (x.get("ticket"), x.get("cause"), x.get("lecon")) not in vues]
    write_json(mpath("rejeu.json"), {"run": run, "lecons": rejeu})
    nouveaux = [x for x in nouveaux if not (x.get("rejeu") and x["workflow"] == "impl")]
    if not nouveaux and not rejeu:
        print("Aucun retour nouveau depuis le dernier relevé : la mémoire reste telle quelle.")
        sys.exit(3)
    ids = {x["id"] for x in nouveaux}
    anciens = [x for x in journal(ANCIENS_JOURS) if x.get("id") not in ids and x.get("workflow") in actifs and not x.get("rejeu")]
    par = {wf: sum(1 for x in nouveaux if x["workflow"] == wf) for wf in actifs}
    parts = [f"# Relevé du {now().astimezone(TZ).strftime('%d/%m/%Y')}",
             "Nouveaux retours : " + ", ".join(f"{wf} {n}" for wf, n in par.items()) + "."
             + (f" Leçons du rejeu de Palpatine : {len(rejeu)}." if rejeu else "")]
    parts.append("## Retours nouveaux (depuis le dernier relevé)\n" + bloc(nouveaux, MAX_NOUVEAUX))
    parts.append(f"## Retours déjà vus ces {ANCIENS_JOURS} derniers jours (pour repérer ce qui revient ; déjà traités)\n" + bloc(anciens, MAX_ANCIENS))
    if rejeu:
        parts.append("## Leçons du rejeu de Palpatine (seconde proposition, champ `rejeu`, pour la fiche `impl`)\n" + "\n".join(
            f"- {source(x)}{' [' + x['poste'] + ']' if x.get('poste') else ''} : {x['lecon']}" for x in rejeu))
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


def rejeu_propose(p, run):
    """La seconde proposition : les leçons du rejeu que l'agent rend (champ rejeu ; sans ce champ, celles du juge telles
    quelles), gardées si leur source est une leçon du relevé de ce run ; celles déjà dans la fiche impl sont retirées.
    Écrit a_valider de lecons.json (null s'il n'y a rien du rejeu)."""
    try:
        r = read_json(mpath("rejeu.json"))
    except (OSError, ValueError):
        r = {}
    brutes = [x for x in (r.get("lecons") or []) if isinstance(x, dict) and x.get("lecon")] if r.get("run", run) == run else []
    par, avis, items = {source(x): x for x in brutes}, [], []
    agent = p.get("rejeu") if isinstance(p, dict) else None
    for a in agent if isinstance(agent, list) else brutes:
        a = a if isinstance(a, dict) else {}
        lecon = court(a.get("lecon"), MAX_LIGNE - 20)
        srcs = [k for k in par if k in str(a.get("source") or source(a))]
        if not lecon or not srcs:
            avis.append(f"leçon du rejeu sans source connue ignorée : {court(lecon, 80)}")
            continue
        b = par[srcs[0]]
        poste = str(a.get("poste") or b.get("poste") or "").strip("[] ").lower()
        x = {"ticket": b.get("ticket"), "cause": b.get("cause"), "lecon": lecon, "source": " + ".join(srcs)}
        ligne = "- " + (f"[{poste}] " if poste in POSTES_IMPL else "") + lecon
        if ligne in memoire_lignes("impl") or any(y["lecon"] == lecon for y in items):
            avis.append(f"leçon du rejeu déjà dans la fiche impl : {court(lecon, 80)}")
            continue
        items.append({**x, "poste": poste} if poste in POSTES_IMPL else x)
    if brutes and not items and isinstance(agent, list) and not avis:
        avis.append(f"{len(brutes)} leçon(s) du juge, aucune retenue par l'agent (propres à un ticket, ou déjà sues)")
    lec = lecons_lit()
    if items or lec["a_valider"] or os.path.exists(os.path.join(rejeu_dir(), "lecons.json")):
        lecons_ecrit({**lec, "a_valider": {"run": run, "le": iso(now()), "lecons": items} if items else None})
    os.makedirs(memoire_dir(), exist_ok=True)
    write_json(mpath("rejeu.json"), {**r, "avis": avis})
    return items, avis


def propose(run=""):
    raw = sys.stdin.read().strip()
    try:
        p = json.loads(raw) if raw else None
    except ValueError:
        p = None
    pa = passage()
    deja = bool(run) and pa.get("run") == run and pa.get("rejeu")  # gate boss_rejeu déjà ouverte : la classique est décidée
    rejeu, ravis = rejeu_propose(p, run)
    if not isinstance(p, dict) and not rejeu:
        print("La proposition de l'agent est illisible : la mémoire reste telle quelle.")
        sys.exit(3)
    permis = ("equipe",) + memoire_actifs()
    fiches, avis, diffs, ajout, retrait = {}, [], [], 0, 0
    for f in (p.get("fiches") or []) if isinstance(p, dict) and not deja else []:
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
    promos = [x for x in (p.get("promotions") or [] if isinstance(p, dict) and not deja else []) if isinstance(x, dict) and str(x.get("lecon") or "").strip()][:5]
    if not fiches and not promos:
        fin_ = "L'agent ne propose aucun changement : la mémoire reste telle quelle." + (" " + " ; ".join(avis) if avis else "")
        if rejeu:  # code 4 : directement à la gate des leçons du rejeu
            print(("La proposition classique est déjà décidée." if deja else fin_) + f" {len(rejeu)} leçon(s) du rejeu à valider.")
            sys.exit(4)
        print(fin_ + (" " + " ; ".join(ravis) if ravis else ""))
        sys.exit(3)
    write_json(mpath("proposition.json"), {"at": iso(now()), "fiches": fiches, "promotions": promos, "lecons": ajout, "retirees": retrait})
    # la 1re ligne porte le compte, que la page lit dans le message de la gate (bulle du marchand de sable) ; la ligne ⚡
    # annonce les leçons du rejeu, validées à la gate suivante (le second parchemin du marchand de sable)
    compte = f"{ajout} leçon{'s' if ajout > 1 else ''} à valider" + (f", {retrait} retirée{'s' if retrait > 1 else ''}" if retrait else "")
    out = [f"🧠 **Mémoire du soir** · {compte} : " + (court(p.get("resume"), 600) or "ce que les retours du jour ont appris.")]
    if rejeu:
        out.append(f"⚡ **Rejeu de Palpatine** · {len(rejeu)} leçon{'s' if len(rejeu) > 1 else ''} à valider ensuite, à leur propre "
                   "validation (fiche impl), juste après celle-ci.")
    out += diffs or ["Aucune fiche à changer."]
    if promos:
        out.append("**À graver dans le dépôt** (leçons qui reviennent ; à faire toi-même, en PR) :\n" + "\n".join(
            f"- {court(x.get('lecon'), 300)} → {court(x.get('cible'), 120) or 'docs/'}" + (f" ({court(x.get('pourquoi'), 200)})" if x.get("pourquoi") else "")
            for x in promos))
    if avis:
        out.append("Remarques : " + " ; ".join(avis) + ".")
    out.append("**Approuver** : les fiches sont réécrites (les précédentes gardées dans versions/), les agents les lisent dès "
               "leur prochain run. **Changements** : l'agent refait sa proposition avec ton message. **Rejeter** : rien ne change"
               + (" ; Kronn arrête alors le run, les leçons du rejeu reviennent au prochain soir." if rejeu else "."))
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


def propose_rejeu(run=""):
    """Le message de la gate boss_rejeu (1re ligne : le compte, lu par la page). Rien du rejeu pour ce run : code 3, fin."""
    av = lecons_lit()["a_valider"]
    lecons = (av or {}).get("lecons") or [] if (av or {}).get("run") == run else []
    if not lecons:
        print("Aucune leçon du rejeu à valider ce soir.")
        sys.exit(3)
    write_json(mpath("passage.json"), {"run": run, "rejeu": True, "at": iso(now())})  # propose : la classique est décidée
    try:
        avis = read_json(mpath("rejeu.json")).get("avis") or []
    except (OSError, ValueError, AttributeError):
        avis = []
    n, place = len(lecons), MAX_LIGNES_FICHE - len(memoire_lignes("impl"))
    out = [f"⚡ **Mémoire du soir · rejeu de Palpatine** · {n} leçon{'s' if n > 1 else ''} à valider : ce que les rejeux de "
           "tickets déjà livrés ont appris à la chaîne d'implémentation (jeu témoin écarté).",
           "Chaque leçon ira dans la fiche impl, lue par les postes de la chaîne (un poste entre crochets : lui seul) :\n" + "\n".join(
               f"- {'[' + x['poste'] + '] ' if x.get('poste') else ''}{x.get('lecon')} · _{x.get('source')}_" for x in lecons)]
    if n > place:
        out.append(f"Remarque : la fiche impl a {MAX_LIGNES_FICHE - place} leçons sur {MAX_LIGNES_FICHE} ; seules les "
                   f"{max(place, 0)} premières tiendront (l'agent fera de la place un prochain soir).")
    if avis:
        out.append("Remarques : " + " ; ".join(avis) + ".")
    out.append("**Approuver** : ces leçons sont ajoutées à la fiche impl (la précédente gardée dans versions/). **Changements** : "
               "l'agent refait ces leçons avec ton message (la proposition de la mémoire, déjà décidée, ne revient pas). "
               "**Rejeter** : aucune n'est écrite.")
    print("\n\n".join(out))


def applique_rejeu(run=""):
    lec = lecons_lit()
    av = lec["a_valider"]
    if not av or av.get("run") != run or not av.get("lecons"):
        print("Aucune leçon du rejeu à écrire.")
        return
    lignes, ajout, pleines = memoire_lignes("impl"), [], 0
    for x in av["lecons"]:
        ligne = ("- " + (f"[{x['poste']}] " if x.get("poste") else "") + str(x.get("lecon") or ""))[:MAX_LIGNE]
        if ligne in lignes or ligne in ajout:
            continue
        if len(lignes) + len(ajout) >= MAX_LIGNES_FICHE:
            pleines += 1
            continue
        ajout.append(ligne)
    if ajout:
        if os.path.exists(mpath("impl.md")):
            stamp = now().astimezone(TZ).strftime("%Y%m%d-%H%M%S") + "-rejeu"
            os.makedirs(mpath("versions", stamp), exist_ok=True)
            shutil.copy2(mpath("impl.md"), mpath("versions", stamp, "impl.md"))
        write_text(mpath("impl.md"), propre("impl", "\n".join(lignes + ajout))[0])
        for old in sorted(glob.glob(mpath("versions", "*")))[:-VERSIONS]:
            shutil.rmtree(old, ignore_errors=True)
    le = iso(now())
    lecons_ecrit({"a_valider": None, "validees": (lec["validees"] + [{"le": le, **x, "run": run} for x in av["lecons"]])[-VALIDEES:]})
    print(f"Fiche impl : {len(ajout)} leçon(s) du rejeu ajoutée(s)" + (f", {pleines} hors place (fiche pleine)" if pleines else "") + ".")


def fin():
    print("Fin de la mémoire du soir.")


if __name__ == "__main__":
    cmds = {"releve": releve, "propose": propose, "applique": applique, "propose_rejeu": propose_rejeu,
            "applique_rejeu": applique_rejeu, "fin": fin}
    if len(sys.argv) < 2 or sys.argv[1] not in cmds:
        sys.exit("sous-commande : " + " | ".join(cmds))
    cmds[sys.argv[1]](*sys.argv[2:4 if sys.argv[1] == "releve" else 3])
