# Mémoire de l'équipe (amélioration continue) : les leçons que le boss a validées, lues par les agents des workflows.
#
# Recopié au rendu dans les scripts qui l'importent (ticket.py, review.py, chaine.py, chaine_controles.py, pr_update.py), comme _lib.py. Le cron
# du soir (workflows/memoire.py) relève les retours du jour, un agent réécrit les fiches, le boss valide à sa gate ; ici, on
# ne fait que lire. Une fiche par workflow (ticket, impl, revue, correction) et une commune (equipe), en Markdown, dans
# memoire.dossier (défaut ~/.local/share/pixel-bureau/memoire) : une leçon par ligne « - … » ; « - [poste] … » ne va qu'à
# ce poste (redaction, code, avis…). Le reste du fichier (titre, lignes vides) est ignoré.
#
# Réglage memoire (bureau.config.json, propre à chaque installation) : actif (false : rien n'est lu ni relevé), workflows (ceux qui lisent leur fiche, défaut :
# les quatre), dossier, heure (du cron du soir, heure locale, défaut 22).

import os, re
from _lib import CFG

MEM_WORKFLOWS = ("ticket", "impl", "revue", "correction")
MEM_MAX = 6000  # caractères lus au plus par un poste (fiche commune puis celle du workflow), pour garder des prompts courts
MEM_TITRE = "Mémoire de l'équipe (leçons validées par le boss, à appliquer)"


def memoire_dir():
    return os.path.expanduser(str((CFG.get("memoire") or {}).get("dossier") or "~/.local/share/pixel-bureau/memoire"))


def memoire_actifs():
    m = CFG.get("memoire") or {}
    w = m.get("workflows")
    return () if m.get("actif") is False else tuple(x for x in (w if isinstance(w, list) else MEM_WORKFLOWS) if x in MEM_WORKFLOWS)


def memoire_lignes(nom, poste=None):
    # les leçons d'une fiche ; avec un poste, celles marquées pour un autre poste (« - [code] … ») sont écartées
    try:
        with open(os.path.join(memoire_dir(), nom + ".md"), encoding="utf-8") as f:
            lignes = [x.strip() for x in f.read().splitlines()]
    except OSError:
        return []
    tag = lambda s: (re.match(r"- \[([\w-]+)\]", s) or [0, None])[1]
    return [s for s in lignes if s.startswith("- ") and len(s) > 3 and not (poste and tag(s) not in (None, poste))]


def memoire_texte(workflow, poste=None):
    # le corps de la section « Mémoire de l'équipe » d'un poste ; vide quand le workflow ne lit pas sa fiche ou qu'elle
    # est vide (le poste garde alors son comportement d'avant)
    lignes = memoire_lignes("equipe", poste) + memoire_lignes(workflow, poste) if workflow in memoire_actifs() else []
    corps = "\n".join(lignes)[:MEM_MAX].rsplit("\n", 1)[0] if len("\n".join(lignes)) > MEM_MAX else "\n".join(lignes)
    return ("Ce que les corrections passées du boss ont appris. Applique ce qui touche ton travail ; le ticket, la PR et les "
            "retours de ce run passent avant une leçon qui les contredit.\n" + corps) if corps else ""
