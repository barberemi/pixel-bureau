"""Compacte le JS et le CSS de la page à l'assemblage (KT-28) : commentaires et indentation retirés, rien d'autre.

Les sources de page/src/ gardent leurs commentaires ; seule la page assemblée (limite Kronn de 1 000 000 octets)
est allégée. Les sauts de ligne sont gardés (insertion automatique des points-virgules du JS), sauf dans le JS après « ; », « { » et
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
    join (JS) : une ligne de code finie par « ; », « { » ou « , » est recollée à la suivante ; aucune insertion
    automatique de point-virgule n'en dépend, et les sauts de ligne des chaînes et gabarits (_NL) ne sont pas touchés."""
    out = []
    for l in (l.strip() for l in text.split("\n")):
        if l:
            out.append(l + ("" if join and l.endswith((";", "{", ",")) else "\n"))
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
    return _lines("".join(out))

