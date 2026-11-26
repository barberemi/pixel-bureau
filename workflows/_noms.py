"""Chaîne d'implémentation : les chemins et noms cités par un poste mais absents de la branche (la gate PR, le rapport
🎯 Besoin). À part de _chaine.py, recopié seulement dans chaine_pr.py et chaine_controles.py : chaine.py est déjà près
des 128 Kio d'un argument (MAX_SCRIPT)."""
import os, re
from _chaine import git_ok, root  # noqa: F401  (recopié au rendu, comme _lib)


CHEMIN = re.compile(r"[\w.-]+(?:/[\w.-]+)+\.(?:php|py|js|ts|tsx|vue|twig|ya?ml|json|md|env|sh|css|scss)\b")
IDENT = re.compile(r"\b(?:[A-Z][a-z0-9]+){3,}\b|\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){2,}\b")  # NomDeClasse, NOM_DE_VARIABLE


def introuvables(textes):
    """Les chemins et les noms en `code` cités par les rapports et absents de la branche : un poste qui invente (essai
    DM-7545 : Besoin et Sécurité citaient SharedSecretHeaderTokenProvider et DM_SHARED_SECRET_HEADER_TOKEN_1, que
    ni le diff ni le dépôt ne contiennent). Un chemin est cherché tel quel puis sous un dossier de premier niveau ; un nom
    (NomDeClasse, NOM_DE_VARIABLE) par git grep dans la branche."""
    seen, out_ = set(), []
    tops = [d for d in os.listdir(root()) if os.path.isdir(os.path.join(root(), d)) and not d.startswith(".")]
    for t in textes:
        t = str(t or "")
        for p in CHEMIN.findall(t):
            if p not in seen and len(seen) < 40:
                seen.add(p)
                if not any(os.path.exists(os.path.join(root(), *([d] if d else []), p)) for d in [""] + tops):
                    out_.append(p)
        for name in IDENT.findall(t):
            if len(name) >= 8 and name not in seen and len(seen) < 40:
                seen.add(name)
                if not git_ok("grep", "-q", "-F", "-e", name, "HEAD"):
                    out_.append(name)
    return out_
