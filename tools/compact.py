"""Compacte le JS et le CSS de la page à l'assemblage (KT-28) : commentaires et indentation retirés, rien d'autre.

Les sources de page/src/ gardent leurs commentaires ; seule la page assemblée est allégée
(moins à transférer à chaque rechargement). Les sauts de ligne sont gardés (insertion automatique des points-virgules du JS), sauf dans le JS après « ; », « { » et
« , », où aucune insertion n'en dépend ; une ligne qui ne contenait qu'un commentaire disparaît.
Le JS est lu par un petit lecteur qui connaît les chaînes, les gabarits (`…${…}…`, imbriqués) et les expressions
régulières (/…/ après un opérateur ou un mot-clé, division sinon) : un « // » dans « https:// » n'est pas un commentaire.
"""
import re

# après ces mots, un « / » ouvre une expression régulière (pas une division)
_RE_KEYWORDS = {"return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"}
_RE_AFTER = set("(,=:[!&|?{};+-*%<>~^")


def _regex_allowed(out):
    """Un « / » à cet endroit ouvre-t-il une expression régulière ? D'après ce qui précède (sans les blancs)."""
    tail = "".join(out[-60:]).rstrip(" \t\n" + _NL)
    if not tail:
        return True
    if tail[-1] in _RE_AFTER:
        return True
    m = re.search(r"[\w$]+$", tail)
    return bool(m) and m.group(0) in _RE_KEYWORDS


def strip_js(src):
    """Le JS sans ses commentaires ni son indentation ; chaînes, gabarits et expressions régulières intacts."""
    out, i, n = [], 0, len(src)
    braces = []  # pour chaque « ${ » ouvert dans un gabarit : profondeur d'accolades du code qu'il contient

    def string(q):  # recopie une chaîne '…' ou "…" à partir de son guillemet ouvrant
        nonlocal i
        j = i + 1
        while j < n and src[j] != q:
            j += 2 if src[j] == "\\" else 1
        out.append(_keep(src[i:j + 1]))
        i = j + 1

    def template_part():  # recopie un morceau de gabarit jusqu'au « ` » fermant ou au prochain « ${ »
        nonlocal i
        j = i
        while j < n:
            if src[j] == "\\":
                j += 2
                continue
            if src[j] == "`":
                out.append(_keep(src[i:j + 1]))
                i = j + 1
                return
            if src.startswith("${", j):
                out.append(_keep(src[i:j + 2]))
                i = j + 2
                braces.append(0)
                return
            j += 1
        raise ValueError("gabarit non fermé")

    while i < n:
        c = src[i]
        if c in "'\"":
            string(c)
        elif c == "`":
            out.append("`")
            i += 1
            template_part()
        elif c == "{" and braces:
            braces[-1] += 1
            out.append(c)
            i += 1
        elif c == "}" and braces:
            if braces[-1] == 0:  # fin d'un « ${…} » : retour dans le texte du gabarit
                braces.pop()
                out.append("}")
                i += 1
                template_part()
            else:
                braces[-1] -= 1
                out.append(c)
                i += 1
        elif src.startswith("//", i):
            while out and out[-1] in " \t":  # le blanc avant un commentaire de fin de ligne
                out.pop()
            j = src.find("\n", i)
            i = n if j < 0 else j
        elif src.startswith("/*", i):
            j = src.find("*/", i + 2)
            if j < 0:
                raise ValueError("commentaire /* non fermé")
            while out and out[-1] in " \t":
                out.pop()
            i = j + 2
            _glue(out, src, i)
        elif c == "/" and _regex_allowed(out):
            j, cls = i + 1, False
            while j < n and (cls or src[j] != "/"):
                if src[j] == "\\":
                    j += 1
                elif src[j] == "[":
                    cls = True
                elif src[j] == "]":
                    cls = False
                elif src[j] == "\n":
                    raise ValueError("expression régulière sur plusieurs lignes")
                j += 1
            out.append(src[i:j + 1])
            i = j + 1
        else:
            out.append(c)
            i += 1
    if braces:
        raise ValueError("gabarit non fermé")
    return _lines("".join(out), join=True)


_NL = "\x00"  # saut de ligne d'une chaîne ou d'un gabarit : du texte, jamais retouché


def _keep(text):
    return text.replace("\n", _NL)


def _glue(out, src, i):
    """Un commentaire retiré entre deux mots (a/*x*/b) : une espace, pour ne pas les coller."""
    word = lambda ch: ch.isalnum() or ch in "_$"  # noqa: E731
    if out and i < len(src) and word(out[-1][-1:] or " ") and word(src[i]):
        out.append(" ")


def _lines(text, join=False):
    """Indentation et blancs de fin retirés, lignes vides supprimées (y compris celles d'un commentaire retiré).
    join (JS) : une ligne de code finie par « ; », « { », « , » ou un « + » (pas « ++ », ni devant une ligne qui commence
    par « + ») est recollée à la suivante ; aucune insertion automatique de point-virgule n'en dépend, et les sauts de
    ligne des chaînes et gabarits (_NL) ne sont pas touchés. join="css" : toute ligne finie par « { », « ; » ou « } »."""
    ends = ("{", ";", "}") if join == "css" else (";", "{", ",")
    lines = [l for l in (l.strip() for l in text.split("\n")) if l]
    out = []
    for k, l in enumerate(lines):
        glue = join and (l.endswith(ends) or join is True and l.endswith("+") and not l.endswith("++")
                         and not (k + 1 < len(lines) and lines[k + 1].startswith("+")))
        out.append(l + ("" if glue else "\n"))
    if out and not out[-1].endswith("\n"):
        out[-1] += "\n"  # le texte finit toujours par un saut de ligne (fichiers mis bout à bout)
    return "".join(out).replace(_NL, "\n")


def strip_css(src):
    """Le CSS sans ses commentaires ni son indentation ; chaînes intactes."""
    out, i, n = [], 0, len(src)
    while i < n:
        c = src[i]
        if c in "'\"":
            j = i + 1
            while j < n and src[j] != c:
                j += 2 if src[j] == "\\" else 1
            out.append(_keep(src[i:j + 1]))
            i = j + 1
        elif src.startswith("/*", i):
            j = src.find("*/", i + 2)
            if j < 0:
                raise ValueError("commentaire /* non fermé")
            i = j + 2
            _glue(out, src, i)
        else:
            out.append(c)
            i += 1
    return _lines("".join(out), "css")



# appels DOM très répétés dans la page (createElement : plus de 200) : un alias court à l'assemblage, les sources gardent
# le nom complet. L'alias appelle document à chaque fois : un test qui remplace document.createElement le voit encore.
ALIASES = (("document.createElement(", "_ce", "t=>document.createElement(t)"), ("document.getElementById(", "_gid", "i=>document.getElementById(i)"),
           # fonctions statiques sans this, très répétées (#86 : 3 Ko) ; Date.now jamais (les tests et captures le remplacent)
           ("Math.round(", "_mr", "Math.round"), ("Math.floor(", "_mf", "Math.floor"), ("Math.max(", "_mx", "Math.max"),
           ("Math.min(", "_mn", "Math.min"), ("Math.abs(", "_ma", "Math.abs"), ("Math.ceil(", "_mc", "Math.ceil"),
           ("JSON.stringify(", "_js", "JSON.stringify"), ("JSON.parse(", "_jp", "JSON.parse"), ("Array.isArray(", "_ia", "Array.isArray"),
           ("Object.keys(", "_ok", "Object.keys"), ("Object.entries(", "_oe", "Object.entries"), ("Object.assign(", "_oa", "Object.assign"),
           ("Object.fromEntries(", "_of", "Object.fromEntries"), ("encodeURIComponent(", "_eu", "encodeURIComponent"),
           ("document.querySelector(", "_qs", "s=>document.querySelector(s)"), ("new Date(", "_nd", "(...a)=>new Date(...a)"),
           ("new Set(", "_ns", "a=>new Set(a)"), ("String(", "_S", "String"),
           ("Math.sin(", "_si", "Math.sin"), ("Math.cos(", "_co", "Math.cos"),
           ("_ce('div')", "_cd", "()=>_ce('div')"))  # un appel complet (sans « ( » final) : remplacé par « _cd() »
# alias d'un nom nu (String) : seulement là où il n'est pas la fin d'un autre nom (toString) ni une propriété (x.String)
_BARE = re.compile(r"(?<![\w$.])")


def alias_js(js):
    """Remplace les appels répétés (3 fois au moins) par leur alias, défini en tête du script."""
    head = []
    for call, name, body in ALIASES:
        if js.count(call) >= 3 and not re.search(r"\b" + name + r"\b", js):
            if not call.endswith("("):
                js = js.replace(call, name + "()")
            else:
                js = re.sub(_BARE.pattern + re.escape(call), name + "(", js) if call[0].isalpha() else js.replace(call, name + "(")
            head.append(f"const {name}={body};")
    return "".join(head) + ("\n" if head else "") + js
