"""Chaîne d'implémentation (#76, #125), les contrôles et l'aiguillage de l'orchestrateur : une sous-commande par étape Exec.

La chaîne est en trois scripts, chacun passé à Kronn en un argument `python3 -c` (Linux : 128 Kio au plus par argument) :
chaine.py (dossier, postes, Code, bilan), chaine_controles.py (contrôles, aiguillage), chaine_pr.py (lanceur, PR, revue, retours, publication) ; le commun est dans _chaine.py, recopié dans chacun au rendu.

  quoi                              # contrôles : fichiers touchés, postes à lancer (réglages et plan)
  missions | range                  # contrôles en parallèle : contexte, vérifications des règles, relevé de la doc ; rapports rangés
  bilan_controles                   # rapports des postes de contrôle : bloquants et avis
  aiguillage                        # stdin décision de l'orchestrateur : 3 livrer, 4 retour au code, 0 humain (6 en essai)
  fin_essai                         # mode essai, escalade : refus explicite, bloquants restants notés, le run s'arrête
"""
import fnmatch, hashlib, json, os, re, subprocess, sys, time
from _lib import CFG, get, read_json, send, write_json, write_text
from _chaine import *  # noqa: F401,F403  (recopié au rendu, comme _lib)

PARALLELES = ("regles", "securite", "perf", "besoin", "doc")  # en lecture seule : sous-agents d'une même étape, en même temps
# modèle de chaque sous-agent (le coordinateur, lui, ne fait que lancer : tier economy) ; impl.postes.controles.modeles le
# remplace poste par poste. Runs du 5 novembre : coordinateur et sous-agents sur Opus, 31 % du coût de la chaîne.
SOUS_MODELES = {"securite": "opus"}  # les autres : sonnet


def modele_sous(p):
    return (poste_conf("controles").get("modeles") or {}).get(p) or SOUS_MODELES.get(p) or "sonnet"


def garde_rapport(p):
    """Tours 2 et suivants : un poste dont le rapport précédent n'avait aucun bloquant le garde, sans relancer de
    sous-agent ; ceux qui ont bloqué repassent, et ceux de impl.postes.controles.toujours (sécurité par défaut : une
    correction peut ouvrir une faille). impl.postes.controles.relance = "tous" : tous repassent, comme avant."""
    pc = poste_conf("controles")
    if not int(etat().get("tours") or 0) or pc.get("relance") == "tous" or p in pc.get("toujours", ["securite"]):
        return False
    prev = load(f"precedent_{p}.json") or {}
    if prev.get("statut") != "ok":
        return False
    write_json(dossier(p + ".json"), {**prev, "garde": "rapport du tour précédent gardé : aucun bloquant"})
    return True


# doc du dépôt relevée pour le poste 📚 doc ; impl.repos.<dépôt>.docs en ajoute (ex. guide/)
DOCS = list(DOCS)  # docs relevées par défaut, communes avec la revue (_releves.DOCS)


FRONT = ["*.scss", "*.css", "*.twig", "*.html", "*.vue", "*.tsx", "*.jsx", "*.ts", "*.js"]


def front_touche(files):
    pats = reglages().get("front") or FRONT
    return any(fnmatch.fnmatch(f, x) for f in files for x in pats)


def cmd_missions():
    """Contrôles en parallèle : le contexte commun et les postes à lancer (règles, sécurité, perf, besoin, doc) pour
    l'étape Agent qui les confie à des sous-agents en même temps ; vérifications des règles et relevé de la doc ici (0 token). Kronn ne lance
    pas de sous-workflows en parallèle (foreach séquentiel) : 45 min par tour en série à l'essai d'EW-7851. Aucun poste
    à lancer : code 3, saut au bilan."""
    files = changed()
    postes, ecartes = [], []
    for p in PARALLELES:
        if deja_fait(p):
            ecartes.append(f"{p} : déjà fait au run d'avant (reprise)")
            continue
        ok, why = actif(p, files)
        if ok and garde_rapport(p):
            ecartes.append(f"{p} : rapport du tour précédent gardé (aucun bloquant)")
        elif ok:
            postes.append(p)
        else:
            write_json(dossier(p + ".json"), {"poste": p, "statut": "non_concerne", "raison": why})
            ecartes.append(f"{p} : non concerné ({why})")
    modeles = {p: modele_sous(p) for p in postes}
    write_json(dossier("missions.json"), {"postes": postes, "modeles": modeles})
    for p in postes:  # rapports écrits par les sous-agents : ceux d'un tour d'avant ne comptent plus
        if os.path.exists(dossier("rapports", p + ".json")):
            os.remove(dossier("rapports", p + ".json"))
    if not postes:
        print("Aucun contrôle parallèle à lancer.\n" + "\n".join(ecartes))
        sys.exit(3)
    e = etat()
    parts = [f"Ticket {e.get('ticket')}, dépôt {e.get('repo')}, branche {e.get('branch')}, tour {e.get('tours', 0) + 1}. "
             f"Point de départ du diff : {depart()} (`git diff {depart()}...HEAD`).",
             section("Postes à lancer", ", ".join(f"{p} (modèle {modeles[p]})" for p in postes) + ("\n\nÉcartés : " + " ; ".join(ecartes) if ecartes else "")
                     + "\n\nFront touché (templates, CSS, JS de page) : " + ("oui" if front_touche(files) else "non, le poste perf saute l'a11y")),
             perimetre(), lecture(), rejoue(), non_fiable(),
             section("Ticket", open(dossier("ticket.md"), encoding="utf-8").read() if os.path.exists(dossier("ticket.md")) else "")]
    if os.path.exists(dossier("retours.md")):
        parts.append(section("Retours de l'humain (à respecter en priorité)", open(dossier("retours.md"), encoding="utf-8").read()))
    r = load("cadrage.json")
    if r:
        parts.append(section("Rapport du poste cadrage", json.dumps(r.get("resultat") or r, ensure_ascii=False, indent=1)[:10000]))
    parts.append(section("Fichiers modifiés", "\n".join(files)))
    parts.append(section("Plan validé", json.dumps((load("plan.json") or {}).get("lots") or [], ensure_ascii=False, indent=1)[:6000]))
    parts.append(section("Volume du diff", git("diff", "--stat", f"{depart()}...HEAD")[-3000:]))
    if "regles" in postes:
        v = verifie("regles", files)
        parts.append(section("Vérifications des règles lancées (0 token, pour le poste regles)", json.dumps(v, ensure_ascii=False, indent=1)[-8000:]))
        parts.append(releves().replace("## Relevés du diff", "## Relevés du diff, pour le poste regles :", 1))
        parts.append(recherches().replace("## Recherches hors du diff", "## Pour le poste regles : recherches hors du diff", 1))
    if "doc" in postes:
        parts.append(section("Relevé de la doc (0 token, pour le poste doc)", json.dumps(releve_doc_chaine(files), ensure_ascii=False, indent=1)[:8000]))
        parts.append(rejets_md())
    for p in postes:
        c = correction(p)
        if c:
            parts.append(c.replace("## Tour suivant : la correction", f"## Tour suivant, poste {p} : la correction"))
    write_text(dossier("controles_contexte.md"), "".join(parts))
    os.makedirs(dossier("rapports"), exist_ok=True)
    out(section("Contexte commun : fichier", f"`{os.path.relpath(dossier('controles_contexte.md'), root())}` (le texte ci-dessous). "
                f"Rapports : `{os.path.relpath(dossier('rapports'), root())}/<poste>.json`.") + "".join(parts))


def releve_doc_chaine(files):
    """Poste 📚 doc (0 token, relevé commun avec la revue : _releves.releve_doc) : docs du dépôt déjà modifiées par le diff
    (lignes + et -), docs qui citent un fichier modifié ou un symbole touché (git grep), fichiers modifiés qu'aucune doc ne
    cite. Le relevé dit où regarder ; le sous-agent juge si chaque doc citée dit encore vrai."""
    spec = DOCS + list(reglages().get("docs") or [])
    fd = {f["filename"]: f for f in fichiers_diff()}
    fd.update({f: {"filename": f, "status": "modified", "patch": ""} for f in files if f not in fd})  # pas encore commités
    return releve_doc(lambda *a: git("grep", *a), list(fd.values()), spec, docs=set(git("ls-files", "--", *spec).splitlines()))


def cmd_range():
    """Les rapports des sous-agents rangés poste par poste : chacun écrit le sien (rapports/<poste>.json), ou le coordinateur
    le rend sous sa clé (stdin : la sortie de l'étape parallèle) ; un poste lancé sans rapport est noté en panne (le bilan le
    signale)."""
    d = parse(read_stdin()) or {}
    postes = (load("missions.json") or {}).get("postes") or []
    res = {}
    for p in postes:
        prop = d.get(p) if isinstance(d, dict) else None
        f = dossier("rapports", p + ".json")
        if not isinstance(prop, dict) and os.path.exists(f):  # écrit par le sous-agent (le coordinateur ne recopie rien)
            prop = parse(open(f, encoding="utf-8").read())
        if isinstance(prop, dict) and ("constats" in prop or "exigences" in prop or "docs" in prop or "resume" in prop):
            prop.setdefault("constats", [])
            res[p] = ecrit_rapport(p, prop)["statut"]
        else:
            write_json(dossier(p + ".json"), {"poste": p, "statut": "en_panne", "raison": "aucun rapport du sous-agent"})
            res[p] = "en_panne"
    out({"postes": res})


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
    tour_controles()
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
    compte("escalades")
    why = 'plus de tours' if dec == 'retour_code' else dec or 'décision illisible'
    if essai():  # personne pour trancher : le run s'arrête (fin_essai), au lieu d'une gate approuvée sans regarder
        print(f"Tour {e['tours']} : escalade en essai ({why}), le run s'arrête sans gate.")
        sys.exit(6)
    print(f"Tour {e['tours']} : un humain tranche ({why}).")


def cmd_fin_essai():
    """Mode essai, escalade : refus explicite, le run s'arrête (Stop, sans livrer). Banc d'essai du 5 novembre : la gate
    d'escalade d'EW-7238 a été approuvée sans regarder, le ticket est sorti avec 3 bloquants Doc."""
    c = load("controles.json") or {}
    bl = [x for x in c.get("bloquants") or [] if isinstance(x, dict)]
    lignes = [f"- ({NOMS.get(x.get('poste'), x.get('poste'))}) " + (f"{x.get('fichier')} : " if x.get("fichier") else "")
              + cellule(x.get("probleme"), 300) for x in bl[:15]]
    note = f"escalade en essai : bloquants restants {len(bl)}" + (" (" + ", ".join(sorted({str(x.get('poste')) for x in bl})) + ")" if bl else "")
    e = etat()
    e.update(note_fin=note, refus="escalade_essai")
    write_json(dossier("etat.json"), e)
    e["dossier"] = garde()
    print(f"Refusé : {note}. Rien n'est livré (mode essai), le bilan garde l'escalade.\n" + "\n".join(lignes)
          + f"\nDossier gardé : {e['dossier']}")


def cmd_retours_local():
    """Mode essai, après la correction locale des constats de la revue locale : commits faits (rien de poussé), contrôles
    du Code relancés pour mémoire, passe notée dans retours.json ; des commits = une seconde passe possible (repasse)."""
    e = etat()
    sha, head = e.get("retours_sha") or "", git("rev-parse", "HEAD")
    commits = git("log", "--oneline", f"{sha}..HEAD").splitlines() if sha and sha != head else []
    v = verifie("code") if commits else {"ok": True}
    r = load("retours.json", {}) or {}
    if not isinstance(r, dict) or "passes" not in r:
        r = {"pr": None, "passes": []}
    r["passes"].append({"run": e.get("run"), "locale": True, "constats": len(revue_locale_constats()), "pousse": bool(commits),
                        "commits": len(commits), "commit": head[:8] if commits else None, "controles_verts": bool(v.get("ok"))})
    r["reponses"] = sum(int(p.get("constats") or 0) for p in r["passes"] if p.get("locale"))
    write_json(dossier("retours.json"), r)
    e["retours_pousse"] = bool(commits)
    write_json(dossier("etat.json"), e)
    print(f"Retours locaux : {len(commits)} commit(s) local(aux), rien de poussé"
          + ("" if v.get("ok") else " ; contrôles du Code rouges après les corrections (noté)"))


def cle(x):
    """Un constat d'un tour de contrôles, reconnaissable au tour suivant (fichier et début du problème, sans chiffres)."""
    txt = re.sub(r"\d+", "#", " ".join(str(x.get("probleme") or "").lower().split()))[:80]
    return f"{x.get('fichier') or ''}|{txt}"


def tour_controles():
    """Chaque tour de contrôles gardé (controles_tours.json) : le bilan compte ce qui a été trouvé, corrigé ou est resté."""
    snap = {}
    for p in CONTROLES:
        r = load(p + ".json") or {}
        cs = [x for x in (r.get("resultat") or {}).get("constats") or [] if isinstance(x, dict) and x.get("probleme")]
        bloq = r.get("bloquant_poste", p in BLOQUANTS)
        snap[p] = {"statut": r.get("statut") or "en_panne",
                   "bloquants": sorted({cle(x) for x in cs if x.get("gravite") == "bloquant" and bloq}),
                   "avis": sorted({cle(x) for x in cs if not (x.get("gravite") == "bloquant" and bloq)})}
    tours = load("controles_tours.json", []) or []
    tours.append({"tour": int(etat().get("tours") or 0) + 1, "postes": snap})
    write_json(dossier("controles_tours.json"), tours)


def main(argv):
    cmd, args = (argv[1] if len(argv) > 1 else ""), argv[2:]
    simple = {"missions": cmd_missions, "range": cmd_range, "quoi": cmd_quoi, "bilan_controles": cmd_bilan_controles, "aiguillage": cmd_aiguillage, "fin_essai": cmd_fin_essai, "retours_local": cmd_retours_local}
    if cmd in simple:
        return simple[cmd]()
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
