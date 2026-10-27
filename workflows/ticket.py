"""Créer un ticket Jira depuis la page (#77) : aperçu pour la validation, champs de création, résultat pour la page.

  python3 -c <ce script> apercu <brouillon JSON> <type> <points> <composant> <composant 2> <sprint> <parent>
  python3 -c <ce script> champs <brouillon JSON> <type> <points> <composant> <composant 2> <sprint> <parent> <sprints JSON>
  python3 -c <ce script> resultat <clé créée> <brouillon JSON> <type> <points> <composant> <composant 2> <sprint>

Brouillon = la sortie de l'étape rediger, {summary, description} (description en wiki Jira, REST v2).
apercu : le ticket tel qu'il sera créé, en texte lisible (wiki simplifié), pour le message de la gate.
champs : {"body": corps du POST /rest/api/2/issue, "board_sp": points du champ du board}, lu en JSON par l'étape
CollectApiData (typé : les points restent un nombre, le sprint un id). Les points vont dans le champ de création
(jira.create.points_field, sinon le champ du board) ; l'étape suivante les recopie dans le champ du board s'il diffère.
sprint : « next » = le premier sprint futur du board (liste lue par l'étape sprints), sinon le backlog.
resultat : {key, url, title, meta} sur stdout, relu par les relevés office et live pour la fiche de l'agent (run.res).
Réglage jira.create (config ou pack) : types, type, components, component_required, points_field, template.
"""
import json, re, sys
from _lib import CFG

SPRINTS = {"backlog": "Backlog", "next": "Sprint suivant"}


def draft(raw):
    try:
        d = json.loads(raw or "{}")
    except ValueError:
        d = {}
    if isinstance(d, dict) and "summary" not in d and isinstance(d.get("data"), dict):
        d = d["data"]
    return d if isinstance(d, dict) else {}


def number(points):
    f = float(str(points).strip().replace(",", "."))
    return int(f) if f.is_integer() else f


def components(c1, c2):
    return list(dict.fromkeys(c for c in (c1.strip(), c2.strip()) if c))


def meta(type_, points, comps, sprint, parent=""):
    bits = [type_, f"{number(points):g} pts", ", ".join(comps) or "sans composant", SPRINTS.get(sprint, sprint or "Backlog")]
    return " · ".join(bits + ([f"parent {parent}"] if parent else []))


def readable(wiki):
    """Wiki Jira -> texte lisible : titres en « ▸ », panneaux en « │ », puces en « • », gras et soulignés retirés."""
    out, panel = [], False
    for line in (wiki or "").replace("\r", "").split("\n"):
        s = line.strip()
        if re.match(r"^\{panel(:[^}]*)?\}$", s):
            panel = not panel if s == "{panel}" else True
            continue
        m = re.match(r"^h[1-6]\.\s*(.*)$", s)
        if m:
            out += ["", "▸ " + re.sub(r"^\+(.*)\+$", r"\1", m.group(1).strip())]
            continue
        m = re.match(r"^([*#-]+)\s+(.*)$", s)
        if m:
            s = "  " * (len(m.group(1)) - 1) + "• " + m.group(2)
        s = re.sub(r"(?<![\w*])\*([^*\n]+)\*(?![\w*])", r"\1", s)
        out.append(("│ " + s) if panel and s else s)
    return re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip()


def apercu(raw, type_, points, c1, c2, sprint, parent):
    d = draft(raw)
    print("🎫 " + (d.get("summary") or "(sans titre)").strip())
    print(meta(type_, points, components(c1, c2), sprint, parent.strip()))
    print()
    print(readable(d.get("description") or ""))


def board_field():
    return ((CFG.get("jira") or {}).get("points_fields") or [""])[0]


def create_field():
    return ((CFG.get("jira") or {}).get("create") or {}).get("points_field") or board_field()


def next_sprint(raw):
    try:
        d = json.loads(raw or "{}")
    except ValueError:
        return None
    if isinstance(d, dict) and "values" not in d and isinstance(d.get("data"), dict):
        d = d["data"]
    vals = [s for s in (d.get("values") if isinstance(d, dict) else None) or [] if s.get("state") == "future"]
    vals.sort(key=lambda s: (s.get("startDate") or "9999", s.get("id") or 0))
    return vals[0]["id"] if vals else None


def champs(raw, type_, points, c1, c2, sprint, parent, sprints):
    j = CFG.get("jira") or {}
    d = draft(raw)
    sp = number(points)
    f = {"project": {"key": j.get("project") or ""}, "issuetype": {"name": type_.strip()},
         "summary": (d.get("summary") or "").strip()[:250], "description": d.get("description") or ""}
    comps = components(c1, c2)
    if comps:
        f["components"] = [{"name": c} for c in comps]
    if parent.strip():
        f["parent"] = {"key": parent.strip()}
    if create_field():
        f[create_field()] = sp
    sid = next_sprint(sprints) if sprint == "next" else None
    if sid is not None and j.get("sprint_field"):
        f[j["sprint_field"]] = sid
    print(json.dumps({"body": {"fields": f}, "board_sp": sp}, ensure_ascii=False))


def resultat(key, raw, type_, points, c1, c2, sprint):
    key = key.strip()
    site = ((CFG.get("jira") or {}).get("site") or "").rstrip("/")
    d = draft(raw)
    print(json.dumps({"key": key, "url": f"{site}/browse/{key}" if site and key else "", "title": (d.get("summary") or "")[:160],
                      "meta": meta(type_, points, components(c1, c2), sprint)}, ensure_ascii=False))


if __name__ == "__main__":
    cmd, a = sys.argv[1], sys.argv[2:] + [""] * 9
    if cmd == "apercu":
        apercu(*a[:7])
    elif cmd == "champs":
        champs(*a[:8])
    elif cmd == "resultat":
        resultat(*a[:7])
    else:
        sys.exit(f"commande inconnue : {cmd}")
