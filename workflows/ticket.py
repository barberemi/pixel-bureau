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
  python3 -c <ce script> parent_cle <run>     l'adresse Jira du parent (son ticket, ou /myself sans parent), lue par l'étape suivante
  python3 -c <ce script> parent_check <run> <réponse JSON>   le parent est une épic ; une Story ou une Tâche donnée en parent
                                             passe sous son épic (Jira refuse une Story pour parent), sinon le run s'arrête là
  python3 -c <ce script> poste <recherche|redaction|critique> <run>      consigne du poste (stdout = son prompt)
  python3 -c <ce script> rapport <recherche|redaction|critique> <run>     sortie de l'agent (stdin) rangée au dossier
  python3 -c <ce script> aiguillage <run>     critique « à retoucher » et moins de 3 tours : code 3 (retour à la
                                             rédaction) ; sinon .kronn/tickets.json, un élément par ticket (foreach)
  python3 -c <ce script> apercus <run>         les tickets tels qu'ils seront créés, pour ta validation (gate du parent)
  python3 -c <ce script> lot <champs|resultat> [<sprints JSON> | <clé créée>]   un ticket (.kronn/current_task.json)
  python3 -c <ce script> bilan <run>          {key, url, title, meta} des tickets créés, pour la page (run.res) ; relance
                                             le cron redaction_bilan (page « Rédaction · bilan » à jour tout de suite)

Historique (page « Rédaction · bilan », jamais vidé) : ~/.local/share/pixel-bureau/historique/ticket/<run>.json (réglage
jira.create.historique), réécrit par dossier, parent_check, rapport, poste (tes retours), aiguillage et lot resultat. Le dossier
du run ne garde que la dernière version des tickets et la dernière critique ; l'historique garde chaque version, chaque
critique, tes retours datés et les tickets créés. Jamais au prix de l'étape : une erreur va sur stderr.
"""
import datetime, json, os, re, sys
from _lib import CFG, read_json, readable, refresh, write_json

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
                  "concernés, les tickets ou PR proches, ce qui existe déjà. Ne t'arrête pas aux composants donnés : cherche "
                  "aussi, parmi les dépôts de l'équipe, ceux qui appellent ou consomment ce qui change (un client de l'API, "
                  "une page, un sitemap, un script) ou que l'intention décrit sans les nommer, et dis ce qu'ils font aujourd'hui. "
                  "Couvre chaque livrable de l'intention, pas seulement le premier. Lis 5 à 10 fichiers par dépôt touché "
                  "(grep ou lecture directe) dans le clone local de chaque dépôt, cherché dans les dossiers de travail habituels (~/Sites, "
                  "~/Projects, ~/code ; vérifie le remote avec `git -C <chemin> remote -v`). Rends UNIQUEMENT le rapport, sans raconter tes recherches : un rapport court en "
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


# ---------- historique : la page « Rédaction · bilan » ----------
def historique():
    return os.path.expanduser(((CFG.get("jira") or {}).get("create") or {}).get("historique") or "~/.local/share/pixel-bureau/historique/ticket")


def iso_now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def archive(run, **ajout):
    """L'intention du run réécrite dans l'historique : la demande (dossier), le rapport de la recherche, puis ce que donne
    l'étape (ajout : version, critique, retour ou ticket créé, ajoutés à leur liste ; la même version n'est gardée qu'une
    fois). Durées, jetons et passages au tampon : le cron de la page les lit dans l'API Kronn."""
    try:
        path = os.path.join(historique(), re.sub(r"[^\w-]", "", run or "x") + ".json")
        try:
            rec = read_json(path)
            rec = rec if isinstance(rec, dict) else {}
        except (OSError, ValueError):
            rec = {}
        d = dget(run, "demande.json") or {}
        rec.setdefault("at", iso_now())
        rec.update({"v": 1, "run": run, "vu": iso_now(), **{k: d[k] for k in ("intention", "type", "points", "composants", "sprint", "parent",
                                                                              "parent_de", "tour") if k in d}})
        rec["essai"] = bool(re.match(r"\s*\[\s*essai", str(d.get("intention") or ""), re.I))
        r = dget(run, "recherche.json")
        if r:
            rec["recherche"] = {"composants": r.get("composants") or [], "texte": str(r.get("texte") or "")[:4000]}
        for liste, item in ajout.items():
            l = rec.setdefault(liste, [])
            if liste in ("versions", "critiques"):
                l[:] = [x for x in l if x.get("v") != item.get("v")]
            l.append({"at": iso_now(), **item})
            del l[:-12]
        os.makedirs(historique(), exist_ok=True)
        write_json(path, rec)
    except Exception as e:  # noqa: BLE001  l'historique ne fait jamais tomber une étape
        print(f"ticket : historique non écrit ({str(e)[:160]})", file=sys.stderr)


def options():
    """Composants proposés (jira.create.components) : les dépôts de l'équipe."""
    c = (CFG.get("jira") or {}).get("create") or {}
    return [str(x.get("name") if isinstance(x, dict) else x) for x in c.get("components") or []]


def langue():
    """Langue des tickets (réglage jira.create.language de l'équipe), le français par défaut."""
    return str(((CFG.get("jira") or {}).get("create") or {}).get("language") or "français")


def langue_titre():
    """Langue du titre (jira.create.title_language), sinon celle des tickets : le modèle d'une équipe peut vouloir des
    titres en anglais et des descriptions en français. Sans ce réglage, la rédaction et la critique se contredisent
    d'un tour à l'autre (consigne contre modèle de ticket)."""
    return str(((CFG.get("jira") or {}).get("create") or {}).get("title_language") or langue())


def sans_narration(text):
    """Le rapport de la recherche à partir de sa ligne « Composants : » : l'agent raconte parfois ses recherches avant."""
    m = re.search(r"^[ \t*_#-]*Composants\s*\**\s*:", text, re.M | re.I)
    return text[m.start():].strip() if m else text


def dossier(run, intention, type_, points, c1, c2, sprint, parent):
    d = {"intention": intention.strip(), "type": type_.strip(), "points": points.strip(), "composants": components(c1, c2),
         "sprint": sprint.strip() or "backlog", "parent": parent.strip(), "tour": 1}
    dput(run, "demande.json", d)
    archive(run)
    print(f"🎫 {d['intention'][:300]}\n{meta(d['type'], d['points'] or 0, d['composants'], d['sprint'], d['parent'])}")


def parent_cle(run):
    """L'adresse Jira à lire pour vérifier le parent : son ticket, ou /myself sans parent (rien à vérifier, appel sans effet)."""
    p = str((dget(run, "demande.json") or {}).get("parent") or "").strip()
    print(f"/rest/api/2/issue/{p}" if re.fullmatch(r"[A-Z][A-Z0-9_]*-\d+", p) else "/rest/api/2/myself", end="")


def parent_check(run, raw):
    """Jira n'accepte qu'une épic pour parent d'une Story, d'une Tâche ou d'un Bug (« Veuillez sélectionner un ticket parent
    valide », à la création, après toute la rédaction : run ed873fc9). Vérifié dès le dossier : une épic passe ; un ticket
    qui a une épic la donne à sa place (noté parent_de, montré au tampon) ; sinon le run s'arrête, avec la raison."""
    d = dget(run, "demande.json") or {}
    p = str(d.get("parent") or "").strip()
    if not p:
        print("Sans parent.")
        return
    try:
        o = json.loads(raw or "{}")
    except ValueError:
        o = {}
    if isinstance(o, dict) and "fields" not in o and isinstance(o.get("data"), dict):
        o = o["data"]
    f = (o.get("fields") if isinstance(o, dict) else None) or {}
    it = f.get("issuetype") or {}
    if not it:
        sys.exit(f"Parent {p} introuvable dans Jira (clé fausse, ou ticket hors de portée) : relance avec la clé de l'épic.")
    if it.get("hierarchyLevel") == 1:
        print(f"Parent {p} : l'épic « {f.get('summary') or ''} ».")
        return
    up = f.get("parent") or {}
    if up.get("key") and (((up.get("fields") or {}).get("issuetype") or {}).get("hierarchyLevel")) == 1:
        d["parent"], d["parent_de"] = up["key"], p
        dput(run, "demande.json", d)
        archive(run)
        print(f"Parent {p} : {it.get('name') or 'pas une épic'}. Jira n'accepte qu'une épic : les tickets iront sous son épic "
              f"{up['key']} « {(up.get('fields') or {}).get('summary') or ''} ».")
        return
    sys.exit(f"Parent {p} : {it.get('name') or 'pas une épic'}, sans épic au-dessus. Jira n'accepte qu'une épic pour parent : "
             "relance sans parent, ou avec la clé d'une épic.")


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
            archive(run, retours={"texte": retours[:1500], "v": (dget(run, "tickets.json") or {}).get("version")})
    if k == "redaction" and dget(run, "retours.json"):
        parts.append("## Retours du boss à la validation (à appliquer en priorité)\n" + "\n".join("- " + x for x in dget(run, "retours.json")))
    c = dget(run, "critique.json")
    if k == "redaction" and c and c.get("verdict") == "a_retoucher":
        parts.append("## Remarques de la critique (à corriger)\n" + "\n".join(f"- ticket {n.get('ticket')} : {n.get('note')}" for n in c.get("notes") or []))
    lt = langue_titre()
    parts.append("## Langue\n" + ("Rédige en " + langue() + " : le rapport, le titre (summary) et la description des tickets."
                 if lt == langue() else "Rédige en " + langue() + " le rapport et la description des tickets, et le titre (summary) "
                 "en " + lt + " ; cette règle passe avant toute autre consigne de langue.") + " Les noms de fichiers, de classes, "
                 "de fonctions et le code restent tels quels.")
    parts.append("## Ta mission\n" + mission)
    print("\n\n".join(parts))


def rapport(k, run, text):
    text = (text or "").strip()
    if not text:
        sys.exit(f"Le poste {POSTES.get(k, (k,))[0]} n'a rien rendu.")
    if k == "recherche":
        text = sans_narration(text)
        m = re.search(r"Composants\s*:\s*(.+)", text)
        touched = [x.strip(" *`") for x in re.split(r"[,;]", m.group(1))] if m else []
        dput(run, "recherche.json", {"texte": text[:6000], "composants": [x for x in touched if x]})
        archive(run)
        print(text[:2000])
        return
    o = json_of(text) or {}
    if k == "redaction":
        ts = [t for t in (o.get("tickets") or []) if isinstance(t, dict) and str(t.get("summary") or "").strip()]
        if not ts:
            sys.exit("La rédaction n'a rendu aucun ticket (objet JSON {\"tickets\": [...]} attendu).")
        old = dget(run, "tickets.json") or {}
        v = int(old.get("version") or 0) + 1
        dput(run, "tickets.json", {"version": v, "tickets": ts[:8]})
        archive(run, versions={"v": v, "tickets": [{"summary": str(t.get("summary") or "")[:200], "composant": t.get("composant"),
                                                    "points": t.get("points")} for t in ts[:8]]})
        print("\n".join(f"{i}. {t['summary']} · {t.get('composant') or '?'} · {t.get('points') or '?'} pts" for i, t in enumerate(ts[:8], 1)))
        return
    if k == "critique":
        v = "a_retoucher" if str(o.get("verdict") or "").strip() == "a_retoucher" else "ok"
        notes = [n for n in o.get("notes") or [] if isinstance(n, dict)][:12]
        dput(run, "critique.json", {"verdict": v, "notes": notes, "version": (dget(run, "tickets.json") or {}).get("version")})
        archive(run, critiques={"v": (dget(run, "tickets.json") or {}).get("version"), "verdict": v,
                                "notes": [{"ticket": n.get("ticket"), "note": str(n.get("note") or "")[:400]} for n in notes]})
        print(("✓ relu, rien à retoucher" if v == "ok" else "↺ à retoucher") + "".join(f"\n- ticket {n.get('ticket')} : {n.get('note')}" for n in o.get("notes") or []))
        return
    sys.exit(f"Poste inconnu : {k}")


def aiguillage(run):
    d, t, c = dget(run, "demande.json") or {}, dget(run, "tickets.json") or {}, dget(run, "critique.json") or {}
    if c.get("verdict") == "a_retoucher" and int(d.get("tour") or 1) < TOURS:
        d["tour"] = int(d.get("tour") or 1) + 1
        dput(run, "demande.json", d)
        archive(run)
        print(f"↺ critique → rédaction · tour {d['tour']}/{TOURS}")
        sys.exit(3)
    ts = t.get("tickets") or []
    os.makedirs(".kronn", exist_ok=True)
    write_json(os.path.join(".kronn", "tickets.json"), [{"id": f"{run}-{i}", "run": run, "i": i, "summary": x["summary"][:120]} for i, x in enumerate(ts)])
    print(f"{len(ts)} ticket(s) à valider ensemble, puis créés un par un :\n" + "\n".join(f"{i}. {x['summary']}" for i, x in enumerate(ts, 1)))


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


GATE_FULL = 3500  # au-delà, la gate ne garde que le récap (le relevé des gates coupe un message à 4 000 caractères)


def apercus(run):
    """Le message du tampon : le récap des tickets (une ligne chacun) et les réserves de la critique, puis leur détail
    s'il tient en GATE_FULL caractères ; sinon le détail de chaque ticket est au 2e étage du Bureau, au clic sur sa carte."""
    d, t = dget(run, "demande.json") or {}, (dget(run, "tickets.json") or {}).get("tickets") or []
    pts = lambda x: str(x.get("points") or d.get("points") or "1")
    comp = lambda x: str(x.get("composant") or "") or ((d.get("composants") or [""])[0])
    print(f"{len(t)} ticket(s) à créer :")
    if d.get("parent_de"):
        print(f"Parent : {d.get('parent')}, l'épic de {d['parent_de']} (Jira n'accepte qu'une épic pour parent)")
    for i, x in enumerate(t):
        print(f"T{i + 1} · {(x.get('summary') or '(sans titre)').strip()} · {d.get('type') or '?'} · {number(pts(x)):g} pts · {comp(x) or 'sans composant'}")
    c = dget(run, "critique.json") or {}
    if c.get("verdict") == "a_retoucher" and c.get("version") == (dget(run, "tickets.json") or {}).get("version"):
        # trois tours faits sans accord : la critique garde ses réserves, le tampon les montre plutôt que de les taire
        print(f"\n⚠ La critique a encore des réserves après {TOURS} tours (à toi de trancher, « Changements » pour les corriger) :")
        for n in c.get("notes") or []:
            print(f"- {'découpage' if n.get('ticket') in (0, '0') else 'T' + str(n.get('ticket'))} : {n.get('note')}")
    full = []
    for i, x in enumerate(t):
        full.append(f"\n━━ T{i + 1} ━━\n🎫 {(x.get('summary') or '(sans titre)').strip()}\n"
                    f"{meta(d.get('type') or '', pts(x), [comp(x)] if comp(x) else [], d.get('sprint') or '', d.get('parent') or '')}\n\n"
                    + readable(x.get("description") or ""))
    if sum(len(f) for f in full) <= GATE_FULL:
        print("\n".join(full))
    else:
        print("\nLe détail de chaque ticket : au 2e étage du Bureau, clic sur sa carte à la table ou sur sa ligne du panneau.")


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
        archive(run, crees={"i": i, "key": arg.strip(), "title": (x.get("summary") or "")[:160], "composant": comp, "points": pts})
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
    refresh("redaction_bilan")  # la page « Rédaction · bilan » à jour tout de suite, sans attendre le cron (stderr, jamais d'échec)


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
    elif cmd == "parent_cle":
        parent_cle(a[0])
    elif cmd == "parent_check":
        parent_check(a[0], a[1])
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
