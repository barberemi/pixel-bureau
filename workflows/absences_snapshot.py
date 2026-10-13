"""Absences et télétravail de l'équipe (dataset absences), d'après le planning Excel lu par Microsoft Graph.

Entrée (stdin) : {"now": <values de la feuille du mois>, "next": <values de la feuille du mois suivant>} ; chaque
valeur est le tableau `values` de usedRange (lignes de cellules), ou null si la lecture a échoué.
Forme d'une feuille : une ligne « Nom Prénom » dont les cellules suivantes sont les dates (numéros de série Excel),
une ligne « férié » (vrai / faux par date), puis DEUX lignes par personne : la présence (D travail, AM ou PM
demi-journée travaillée, C congés, F formation, E école, M maladie) et le télétravail (T, TAM matin, TPM après-midi,
AT astreinte en télétravail).

Sortie (stdout) : {generated_at, days: [AAAA-MM-JJ…], ferie: [AAAA-MM-JJ…], people: {clé: {AAAA-MM-JJ: "mm"}}}
- days : les jours ouvrés du lundi de cette semaine au vendredi de la suivante (le calendrier de la page ; le week-end,
  à partir du lundi qui vient) ;
- une valeur = deux lettres, le matin puis l'après-midi : b au bureau, t en télétravail, a absent, ? inconnu ;
- seulement les personnes du roster (planning_names, injecté au rendu), jamais la raison d'une absence.
"""
import json, sys, unicodedata
from datetime import date, datetime, timedelta
from _lib import CFG, TZ, dumps

ABSENT = {"C", "F", "E", "M"}  # congés et récup, formation, école, maladie : tous « absent »
TRUE = {"true", "vrai", "1"}


def norm(s):
    """Nom comparable : sans accents ni casse, mots triés (« Beesly Pam » = « Pam Beesly »)."""
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower().replace("-", " ")
    return " ".join(sorted(s.split()))


def serial_day(v):
    """Numéro de série Excel (46296) -> date, sinon None."""
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    return date(1899, 12, 30) + timedelta(days=int(n)) if 20000 < n < 80000 else None


def code(v):
    return str(v or "").strip().upper()


def halves(c1, c2):
    """Présence (ligne 1) et télétravail (ligne 2) d'un jour -> deux lettres, matin puis après-midi."""
    if c1 in ABSENT:
        return "aa"
    if c1 == "AM":  # travaille le matin
        h = ["w", "a"]
    elif c1 == "PM":  # travaille l'après-midi
        h = ["a", "w"]
    elif c1:
        h = ["w", "w"]
    else:
        return "??"
    tt = {"T": (0, 1), "AT": (0, 1), "TAM": (0,), "TPM": (1,)}.get(c2, ())
    return "".join("t" if (x == "w" and i in tt) else ("b" if x == "w" else x) for i, x in enumerate(h))


def read_sheet(rows, wanted):
    """{clé: {jour: deux lettres}} et la liste des jours fériés d'une feuille ; wanted = {nom normalisé: clé}."""
    people, ferie = {}, []
    rows = [r for r in (rows or []) if isinstance(r, list)]
    head = next((r for r in rows if norm(r[0] if r else "") == norm("Nom Prénom")), None)
    if not head:
        return people, ferie
    cols = {i: d for i, d in ((i, serial_day(v)) for i, v in enumerate(head)) if d}
    for r in rows:
        if r and norm(r[0]) == "ferie":
            ferie += [d.isoformat() for i, d in cols.items() if i < len(r) and str(r[i]).strip().lower() in TRUE]
    for k, r in enumerate(rows):
        key = wanted.get(norm(r[0])) if r else None
        if not key:
            continue
        nxt = rows[k + 1] if k + 1 < len(rows) and not str(rows[k + 1][0] or "").strip() else []
        cell = lambda row, i: code(row[i]) if i < len(row) else ""
        people[key] = {d.isoformat(): halves(cell(r, i), cell(nxt, i)) for i, d in cols.items()}
    return people, ferie


def window(today):
    """Jours ouvrés du lundi de cette semaine au vendredi de la suivante ; le week-end, à partir du lundi qui vient."""
    mon = today - timedelta(days=today.weekday()) + timedelta(days=7 if today.weekday() >= 5 else 0)
    return [(mon + timedelta(days=i)).isoformat() for i in list(range(5)) + list(range(7, 12))]


data = json.loads(sys.stdin.read() or "{}")
wanted = {norm(name): key for key, name in (CFG.get("planning_names") or {}).items()}
people, ferie = {}, []
for part in ("now", "next"):
    p, f = read_sheet(data.get(part), wanted)
    ferie += f
    for key, days in p.items():
        people.setdefault(key, {}).update(days)
days = window(datetime.now(TZ).date())
out = {"generated_at": datetime.now(TZ).isoformat(), "days": days, "ferie": sorted(set(d for d in ferie if d in days)),
       "people": {k: {d: v[d] for d in days if d in v and v[d] != "??"} for k, v in sorted(people.items())}}
print(dumps(out))
