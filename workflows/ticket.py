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

La salle de rédaction (2e étage) : une intention peut donner plusieurs tickets, sur un ou plusieurs projets. Le modèle
ticket enchaîne des postes, un sous-workflow chacun (ticket_recherche, ticket_redaction, ticket_critique), puis un
sous-workflow par ticket (ticket_un, foreach) une fois la liste validée au tampon (la gate est dans le parent : Kronn
refuse une gate dans un sous-workflow) : sa création. Le dossier du run
(~/.cache/pixel-bureau/ticket/<run>/) garde la demande, les rapports, les versions et les tickets créés.

  python3 -c <ce script> dossier <run> <intention> <type> <points> <composant> <composant 2> <sprint> <parent>
  python3 -c <ce script> poste <recherche|redaction|critique> <run>      consigne du poste (stdout = son prompt)
  python3 -c <ce script> rapport <recherche|redaction|critique> <run>     sortie de l'agent (stdin) rangée au dossier
  python3 -c <ce script> aiguillage <run>     critique « à retoucher » et moins de 3 tours : code 3 (retour à la
                                             rédaction) ; sinon .kronn/tickets.json, un élément par ticket (foreach)
  python3 -c <ce script> apercus <run>         les tickets tels qu'ils seront créés, pour ta validation (gate du parent)
  python3 -c <ce script> lot <champs|resultat> [<sprints JSON> | <clé créée>]   un ticket (.kronn/current_task.json)
  python3 -c <ce script> bilan <run>          {key, url, title, meta} des tickets créés, pour la page (run.res)
"""
import json, os, re, sys
from _lib import CFG, read_json, write_json

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


# ---------- la salle de rédaction : les postes et les tickets d'une intention ----------
HOME = os.path.expanduser("~/.cache/pixel-bureau/ticket")
TOURS = 3  # rédaction et critique : trois tours au plus
POSTES = {
    "recherche": ("📚 Recherche", "Cherche dans les dépôts des composants ce qui sert à rédiger : les fichiers, fonctions et tests "
                  "concernés, les tickets ou PR proches, ce qui existe déjà. Lis QUELQUES fichiers (5 à 10, grep ou lecture "
                  "directe) dans le clone local de chaque dépôt, cherché dans les dossiers de travail habituels (~/Sites, "
                  "~/Projects, ~/code ; vérifie le remote avec `git -C <chemin> remote -v`). Rends un rapport court en "
                  "Markdown : une ligne `Composants : <liste>` (ceux que l'intention touche vraiment, parmi la liste "
                  "donnée), puis les pistes, une puce chacune, avec le fichier. N'invente rien ; rien trouvé : dis-le."),
    "redaction": ("✍ Rédaction", "Rédige le ou les tickets. Une intention qui touche plusieurs projets ou plusieurs livrables "
                  "indépendants se DÉCOUPE en plusieurs tickets (un par projet ou par livrable) ; sinon, un seul ticket. "
                  "Pour chacun : summary (le titre seul, court et impératif, sans clé ni type), description en WIKI MARKUP "
                  "Jira (REST v2 : h2., {panel:…}…{panel}, * puces, {code}…{code}, jamais de Markdown), au modèle de "
                  "ticket de l'équipe s'il est donné (lis-le et suis-le à la lettre), sinon trois sections h2. Contexte, "
                  "h2. À faire, h2. Comment tester ; composant (un de la liste) ; points (Story Points, suite de Fibonacci ; "
                  "un seul ticket : les points de la demande ; plusieurs : répartis-les). Tiens compte des remarques de la "
                  "critique s'il y en a. Pas de tiret cadratin ; n'invente ni lien, ni chiffre, ni personne. Ne crée RIEN "
                  "dans Jira. Rends UNIQUEMENT un objet JSON : "
                  '{"tickets": [{"summary": "…", "description": "…", "composant": "…", "points": 3}]}.'),
    "critique": ("🧐 Critique", "Relis les tickets proposés comme le ferait un relecteur exigeant : chacun se comprend seul, "
                 "se teste, a le bon composant et des points crédibles ; le découpage est juste (ni trop, ni trop peu) ; "
                 "rien d'inventé, rien de flou. Rends UNIQUEMENT un objet JSON : "
                 '{"verdict": "ok" | "a_retoucher", "notes": [{"ticket": <numéro à partir de 1, ou 0 pour le découpage>, '
                 '"note": "…"}]}. « a_retoucher » seulement pour un vrai défaut, avec une note qui dit quoi changer.'),
}


def ddir(run):
    d = os.path.join(HOME, re.sub(r"[^\w-]", "", run or "x"))
    os.makedirs(d, exist_ok=True)
    return d


def dget(run, name, default=None):
    try:
        return read_json(os.path.join(ddir(run), name))
    except (OSError, ValueError):
        return default


def dput(run, name, obj):
    write_json(os.path.join(ddir(run), name), obj)


def options():
    """Composants proposés (jira.create.components) : les dépôts de l'équipe."""
    c = (CFG.get("jira") or {}).get("create") or {}
    return [str(x.get("name") if isinstance(x, dict) else x) for x in c.get("components") or []]


def dossier(run, intention, type_, points, c1, c2, sprint, parent):
    d = {"intention": intention.strip(), "type": type_.strip(), "points": points.strip(), "composants": components(c1, c2),
         "sprint": sprint.strip() or "backlog", "parent": parent.strip(), "tour": 1}
    dput(run, "demande.json", d)
    print(f"🎫 {d['intention'][:300]}\n{meta(d['type'], d['points'] or 0, d['composants'], d['sprint'], d['parent'])}")


def json_of(text):
    """Le dernier objet JSON d'une sortie d'agent (dans un bloc ```json, ou nu)."""
    text = text or ""
    for m in reversed(list(re.finditer(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S))):
        try:
            return json.loads(m.group(1))
        except ValueError:
            pass
    for i in [k for k, ch in enumerate(text) if ch == "{"]:
        try:
            return json.loads(text[i:text.rindex("}") + 1])
        except ValueError:
            continue
    return None


def poste(k, run, retours=""):
    if k not in POSTES:
        sys.exit(f"Poste inconnu : {k}")
    d = dget(run, "demande.json")
    if not d:
        sys.exit("Dossier introuvable pour ce run : l'étape dossier n'a pas tourné.")
    titre, mission = POSTES[k]
    j = (CFG.get("jira") or {}).get("create") or {}
    parts = [f"Tu es le poste {titre} de la salle de rédaction du Bureau : une chaîne de postes (📚 Recherche, ✍ Rédaction, "
             "🧐 Critique) rédige un ou plusieurs tickets Jira à partir d'une intention ; puis le boss valide chaque ticket "
             "avant que le Bureau le crée lui-même. Tu ne crées, ne modifies et ne commentes RIEN dans Jira.",
             "## La demande\n" + d["intention"] + f"\n\nType : {d['type']} · Story Points : {d['points']} · Composants donnés : "
             + (", ".join(d["composants"]) or "aucun") + (f" · Parent : {d['parent']}" if d["parent"] else ""),
             "## Composants possibles (les dépôts de l'équipe)\n" + (", ".join(options()) or ", ".join(d["composants"]) or "aucun"),
             "## Modèle de ticket de l'équipe\n" + str(j.get("template") or "aucun (structure par défaut)")]
    if k != "recherche" and dget(run, "recherche.json"):
        parts.append("## Rapport de la recherche\n" + dget(run, "recherche.json")["texte"])
    t = dget(run, "tickets.json")
    if k == "critique" or (k == "redaction" and t):
        parts.append("## Les tickets proposés" + (f" (version {t['version']})" if t else "") + "\n" + json.dumps((t or {}).get("tickets") or [], ensure_ascii=False, indent=1))
    retours = (retours or "").strip()
    if k == "redaction" and retours:  # « Changements » à la validation : tes retours, gardés au dossier
        old = dget(run, "retours.json", [])
        if retours not in old:
            dput(run, "retours.json", old + [retours])
    if k == "redaction" and dget(run, "retours.json"):
        parts.append("## Retours du boss à la validation (à appliquer en priorité)\n" + "\n".join("- " + x for x in dget(run, "retours.json")))
    c = dget(run, "critique.json")
    if k == "redaction" and c and c.get("verdict") == "a_retoucher":
        parts.append("## Remarques de la critique (à corriger)\n" + "\n".join(f"- ticket {n.get('ticket')} : {n.get('note')}" for n in c.get("notes") or []))
    parts.append("## Ta mission\n" + mission)
    print("\n\n".join(parts))


def rapport(k, run, text):
    text = (text or "").strip()
    if not text:
        sys.exit(f"Le poste {POSTES.get(k, (k,))[0]} n'a rien rendu.")
    if k == "recherche":
        m = re.search(r"Composants\s*:\s*(.+)", text)
        touched = [x.strip(" *`") for x in re.split(r"[,;]", m.group(1))] if m else []
        dput(run, "recherche.json", {"texte": text[:6000], "composants": [x for x in touched if x]})
        print(text[:2000])
        return
    o = json_of(text) or {}
    if k == "redaction":
        ts = [t for t in (o.get("tickets") or []) if isinstance(t, dict) and str(t.get("summary") or "").strip()]
        if not ts:
            sys.exit("La rédaction n'a rendu aucun ticket (objet JSON {\"tickets\": [...]} attendu).")
        old = dget(run, "tickets.json") or {}
        dput(run, "tickets.json", {"version": int(old.get("version") or 0) + 1, "tickets": ts[:8]})
        print("\n".join(f"{i}. {t['summary']} · {t.get('composant') or '?'} · {t.get('points') or '?'} pts" for i, t in enumerate(ts[:8], 1)))
        return
    if k == "critique":
        v = "a_retoucher" if str(o.get("verdict") or "").strip() == "a_retoucher" else "ok"
        dput(run, "critique.json", {"verdict": v, "notes": [n for n in o.get("notes") or [] if isinstance(n, dict)][:12],
                                    "version": (dget(run, "tickets.json") or {}).get("version")})
        print(("✓ relu, rien à retoucher" if v == "ok" else "↺ à retoucher") + "".join(f"\n- ticket {n.get('ticket')} : {n.get('note')}" for n in o.get("notes") or []))
        return
    sys.exit(f"Poste inconnu : {k}")


def aiguillage(run):
    d, t, c = dget(run, "demande.json") or {}, dget(run, "tickets.json") or {}, dget(run, "critique.json") or {}
    if c.get("verdict") == "a_retoucher" and int(d.get("tour") or 1) < TOURS:
        d["tour"] = int(d.get("tour") or 1) + 1
        dput(run, "demande.json", d)
        print(f"↺ critique → rédaction · tour {d['tour']}/{TOURS}")
        sys.exit(3)
    ts = t.get("tickets") or []
    os.makedirs(".kronn", exist_ok=True)
    write_json(os.path.join(".kronn", "tickets.json"), [{"id": f"{run}-{i}", "run": run, "i": i, "summary": x["summary"][:120]} for i, x in enumerate(ts)])
    print(f"{len(ts)} ticket(s) à valider, un par un :\n" + "\n".join(f"{i}. {x['summary']}" for i, x in enumerate(ts, 1)))


def current():
    try:
        c = read_json(os.path.join(".kronn", "current_task.json"))
        return c["run"], int(c["i"])
    except (OSError, ValueError, KeyError, TypeError):
        sys.exit("Ticket introuvable : .kronn/current_task.json manquant (lancé hors du modèle ticket ?).")


def one(run, i):
    d, t = dget(run, "demande.json") or {}, (dget(run, "tickets.json") or {}).get("tickets") or []
    x = t[i] if 0 <= i < len(t) else {}
    pts = str(x.get("points") or d.get("points") or "1")
    comp = str(x.get("composant") or "").strip() or ((d.get("composants") or [""])[0])
    return d, x, pts, comp, len(t)


def apercus(run):
    d, t = dget(run, "demande.json") or {}, (dget(run, "tickets.json") or {}).get("tickets") or []
    print(f"{len(t)} ticket(s) à créer :")
    for i, x in enumerate(t):
        print(f"\n━━ T{i + 1} ━━")
        raw = json.dumps({"summary": x.get("summary") or "", "description": x.get("description") or ""}, ensure_ascii=False)
        apercu(raw, d.get("type") or "", str(x.get("points") or d.get("points") or "1"), str(x.get("composant") or "") or ((d.get("composants") or [""])[0]), "", d.get("sprint") or "", d.get("parent") or "")


def lot(cmd, arg=""):
    run, i = current()
    d, x, pts, comp, n = one(run, i)
    raw = json.dumps({"summary": x.get("summary") or "", "description": x.get("description") or ""}, ensure_ascii=False)
    if cmd == "champs":
        champs(raw, d.get("type") or "", pts, comp, "", d.get("sprint") or "", d.get("parent") or "", arg)
    elif cmd == "resultat":
        made = dget(run, "crees.json", [])
        made.append({"i": i, "key": arg.strip(), "title": (x.get("summary") or "")[:160], "composant": comp})
        dput(run, "crees.json", made)
        resultat(arg, raw, d.get("type") or "", pts, comp, "", d.get("sprint") or "")
    else:
        sys.exit(f"commande inconnue : lot {cmd}")


def bilan(run):
    made = dget(run, "crees.json", [])
    if not made:
        print("{}")
        return
    site = ((CFG.get("jira") or {}).get("site") or "").rstrip("/")
    k0 = made[0]["key"]
    print(json.dumps({"key": k0, "url": f"{site}/browse/{k0}" if site else "", "title": made[0]["title"] if len(made) == 1 else f"{len(made)} tickets créés",
                      "meta": ", ".join(m["key"] for m in made)}, ensure_ascii=False))


if __name__ == "__main__":
    cmd, a = sys.argv[1], sys.argv[2:] + [""] * 9
    if cmd == "apercu":
        apercu(*a[:7])
    elif cmd == "champs":
        champs(*a[:8])
    elif cmd == "resultat":
        resultat(*a[:7])
    elif cmd == "dossier":
        dossier(*a[:8])
    elif cmd == "poste":
        poste(a[0], a[1], a[2])
    elif cmd == "apercus":
        apercus(a[0])
    elif cmd == "rapport":
        rapport(a[0], a[1], sys.stdin.read())
    elif cmd == "aiguillage":
        aiguillage(a[0])
    elif cmd == "lot":
        lot(a[0], a[1])
    elif cmd == "bilan":
        bilan(a[0])
    else:
        sys.exit(f"commande inconnue : {cmd}")
