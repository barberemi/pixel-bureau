"""Estimer le temps gagné par l'IA sur un ticket (#79) : une sous-commande par étape Exec du modèle ai_time.json.

  python3 -c <ce script> instance                      # stdin : résumé dev-status de Jira ; sortie : clé d'instance des PR
  python3 -c <ce script> discover <ticket> <prs> <force> <id du run>
                                                       # stdin : ticket Jira, « ===SEP=== », détail dev-status des PR
  python3 -c <ce script> compose <id du run> <estimation JSON>   # sortie JSON : comment, labels, preview (CollectApiData)
  python3 -c <ce script> gate <oui|non>                # non : code 3, le modèle saute la validation (appel de la mise en prod)
  python3 -c <ce script> done <id du run>

Découverte sans IA : les PR liées au ticket dans le panneau Development de Jira (API dev-status, clé d'instance lue dans
summary.pullrequest.byInstanceType : « GitHub » renverrait une liste vide), sinon la recherche GitHub de la clé dans les
dépôts suivis (github.pr_repos, sinon le dépôt principal et ceux des déploiements), titre ou branche seulement. « prs »
(owner/dépôt#n, séparés par des virgules) impose la liste. Puis, par « gh pr view » et « gh pr diff », ce que l'agent lit
(titre, volume, diff borné) et ce qu'il ne devine pas : l'outil et le modèle qui ont écrit le code (lignes Co-Authored-By
des commits, « Generated with Claude Code » dans la description), la relecture par un autre modèle (review de Copilot, ou
du modèle de revue du Bureau, signée « Review automatique »).
Garde-fous : label de suivi déjà posé (sauf force = oui) code 3 ; aucune PR mergée code 4 ; une PR encore ouverte code 5
(la liste trouvée, relancer avec « prs ») ; une PR fermée sans merge est écartée. Ticket illisible ou « prs » invalide : 2.
État du run dans ~/.cache/pixel-bureau/ai_time/<run>.json, relu par compose et done.
Réglage jira.ai_feedback (config ou pack) : label, lang (fr, en), title, fields ([libellé, valeur] ; valeurs avec
{tool}, {model}, {challenged}, {went_well}, {saved}, {per_pr}, {confidence}, {ticket}, {ai_points}), tool et model par
défaut ; points (facultatif) : {field, scale} le champ Jira des points « avec l'IA » (l'effort restant avec l'assistant),
rempli d'après le total des heures « avec IA » converti en Fibonacci (scale : [[heures au plus, points], …]) ; une
valeur déjà posée est gardée, sauf force = oui.
"""
import json, os, re, subprocess, sys
from _lib import CFG, dumps, read_json, write_json

HOME = os.path.expanduser("~/.cache/pixel-bureau/ai_time")
SEP = "\n===SEP===\n"
DIFF_BUDGET = 60_000  # octets de diff pour toutes les PR : sortie Exec sous 100 Ko avec le reste
GENERATED = re.compile(r"(^|/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|Cargo\.lock|.*\.min\.(js|css)|.*\.snap|"
                       r"dist/.*|build/.*|vendor/.*)$")
KEY = re.compile(r"^[A-Z][A-Z0-9]+-\d+$")
PR_REF = re.compile(r"(?:https://github\.com/)?([\w.-]+/[\w.-]+)(?:#|/pull/)(\d+)")
COAUTHOR = re.compile(r"^\s*co-authored-by\s*:\s*(.+?)\s*<([^>]*)>\s*$", re.I | re.M)
TOOLS = [(re.compile(r"claude|anthropic", re.I), "Claude Code"), (re.compile(r"copilot", re.I), "GitHub Copilot"),
         (re.compile(r"codex|openai", re.I), "Codex"), (re.compile(r"cursor", re.I), "Cursor"), (re.compile(r"gemini", re.I), "Gemini")]
KRONN_REVIEW = "Review automatique"  # signature des avis du modèle de revue du Bureau (review_child.json, étape post)
WORDS = {
    "fr": {"no": "Non", "unknown": "non renseigné", "total": "~{gain} au total (sans IA ~{without}, avec IA ~{with})",
           "prs": "{n} PR : {list}", "conf": {"high": "élevée", "medium": "moyenne", "low": "faible"}, "lang": "français"},
    "en": {"no": "No", "unknown": "not specified", "total": "~{gain} total (without AI ~{without}, with AI ~{with})",
           "prs": "{n} PR(s): {list}", "conf": {"high": "high", "medium": "medium", "low": "low"}, "lang": "English"},
}
DEFAULT = {"label": "temps_gagne_ia", "lang": "fr", "title": "Temps gagné grâce à l'IA", "tool": "", "model": "",
           "fields": [["Outil", "{tool}"], ["Modèle", "{model}"], ["Suggestions relues par un autre modèle ?", "{challenged}"],
                      ["Ce qui a bien marché", "{went_well}"], ["Temps gagné (estimation)", "{saved}"],
                      ["Ce qui a moins bien marché", "Rien"], ["Temps perdu (estimation)", "Aucun"],
                      ["Confiance dans l'estimation", "{confidence}"], ["Documentation mise à jour avec l'IA", "Non"],
                      ["Détail", "{per_pr}"]]}


# heures « avec IA » au plus -> points (Fibonacci) : moins d'1 h = 1, une demi-journée = 3, une journée = 8
SCALE = [[1, 1], [2, 2], [4, 3], [6, 5], [8, 8], [16, 13], [40, 21]]


def ai_points(h, scale=None):
    """Points de l'effort restant avec l'IA pour h heures « avec IA » : le premier palier qui les contient, sinon le
    dernier. 0 h (rien à faire) : 1 point, le minimum d'un ticket livré."""
    scale = sorted(scale or SCALE)
    return next((int(p) for m, p in scale if float(h) <= float(m)), int(scale[-1][1]))


def points_field(s):
    return str(((s.get("points") or {}).get("field")) or "").strip()


def settings():
    s = {**DEFAULT, **(((CFG.get("jira") or {}).get("ai_feedback")) or {})}
    s["lang"] = s["lang"] if s.get("lang") in WORDS else "fr"
    return s


def fail(code, msg):
    print(msg)
    sys.exit(code)


def gh(*args, check=True):
    r = subprocess.run(["gh", *args], capture_output=True, text=True)
    if check and r.returncode:
        raise RuntimeError(f"gh {' '.join(args[:2])} : {(r.stderr or r.stdout).strip()[:300]}")
    return r.stdout


def loads(text):
    try:
        v = json.loads(text or "null")
    except ValueError:
        return None
    return v["data"] if isinstance(v, dict) and list(v) == ["data"] else v  # enveloppe {data: …} d'une étape, au besoin


def state_path(run_id):
    return os.path.join(HOME, re.sub(r"[^\w-]", "_", run_id or "local") + ".json")


# ---------- découverte ----------
def instance():
    """Clé d'instance GitHub du panneau Development (la plus fournie) ; code 3 sans PR liée (repli sur la recherche)."""
    s = loads(sys.stdin.read()) or {}
    by = (((s.get("summary") or {}).get("pullrequest") or {}).get("byInstanceType") or {}) if isinstance(s, dict) else {}
    keys = sorted(((v or {}).get("count") or 0, k) for k, v in by.items() if ((v or {}).get("count") or 0) > 0)
    if not keys:
        fail(3, "Aucune PR liée dans le panneau Development de Jira : recherche GitHub.")
    sys.stdout.write(keys[-1][1])


def repos():
    g = CFG.get("github") or {}
    out = g.get("pr_repos") or [g.get("repo")] + [d.get("repo") for d in g.get("deploys") or []]
    return list(dict.fromkeys(r for r in out if r))


def ref(repo, n):
    return f"{repo}#{n}"


def from_dev_status(detail):
    out = []
    for d in (detail or {}).get("detail") or [] if isinstance(detail, dict) else []:
        for p in d.get("pullRequests") or []:
            m = PR_REF.search(p.get("url") or "")
            if m:
                out.append(ref(m.group(1), m.group(2)))
    return out


def from_search(key):
    """PR des dépôts suivis dont le titre cite la clé (la recherche GitHub trouve aussi une simple mention dans le texte)."""
    found, rs = [], repos()
    for i in range(0, len(rs), 5):  # requête de recherche bornée en longueur : 5 dépôts par appel
        q = f'"{key}" type:pr ' + " ".join("repo:" + r for r in rs[i:i + 5])
        try:
            items = json.loads(gh("api", "-X", "GET", "search/issues", "-f", "q=" + q, "-f", "per_page=50") or "{}").get("items") or []
        except (RuntimeError, ValueError) as e:
            print(f"recherche GitHub en échec : {e}", file=sys.stderr)
            continue
        for it in items:
            m = PR_REF.search(it.get("html_url") or "")
            if m:
                found.append(ref(m.group(1), m.group(2)))
    return found


def tools_of(pr):
    """(outils, modèles) qui ont écrit le code : Co-Authored-By des commits, « Generated with Claude Code »."""
    tools, models = [], []
    for c in pr.get("commits") or []:
        for name, mail in COAUTHOR.findall((c.get("messageHeadline") or "") + "\n" + (c.get("messageBody") or "")):
            tool = next((t for rx, t in TOOLS if rx.search(name) or rx.search(mail)), None)
            if not tool:
                continue  # un collègue en co-auteur
            tools.append(tool)
            model = re.sub(r"\s*\([^)]*\)", "", name).strip()
            if model.lower() not in (tool.lower(), "claude", "copilot", "codex", "cursor", "gemini"):
                models.append(model)
    if re.search(r"generated with \[?claude code", pr.get("body") or "", re.I):
        tools.append("Claude Code")
    return tools, models


def challenged_of(pr):
    out = []
    for r in pr.get("reviews") or []:
        login = ((r.get("author") or {}).get("login") or "").lower()
        if "copilot" in login:
            out.append("Copilot")
        elif KRONN_REVIEW in (r.get("body") or ""):
            out.append("Claude (revue Kronn)")
    return out


def diff_of(repo, n, budget):
    """Diff de la PR, fichiers générés réduits à leur nom, borné à budget octets."""
    raw = gh("pr", "diff", str(n), "-R", repo, check=False)
    parts, out = re.split(r"(?m)^(?=diff --git )", raw), []
    for part in parts:
        m = re.match(r"diff --git a/(\S+)", part)
        if m and GENERATED.search(m.group(1)):
            out.append(f"diff --git a/{m.group(1)} (fichier généré : diff omis)\n")
        else:
            out.append(part)
    text = "".join(out)
    data = text.encode()
    if len(data) <= budget:
        return text
    cut = data[:budget].decode(errors="ignore")
    return cut + f"\n[… diff tronqué : {text.count(chr(10)) - cut.count(chr(10))} lignes de plus]\n"


def uniq(xs):
    return list(dict.fromkeys(x for x in xs if x))


def discover(key, prs, force, run_id):
    key = key.strip().upper()
    if not KEY.match(key):
        fail(2, f"Clé de ticket invalide : « {key} ».")
    s, w = settings(), WORDS[settings()["lang"]]
    raw = sys.stdin.read().split(SEP)
    ticket = loads(raw[0]) or {}
    detail = loads(raw[1]) if len(raw) > 1 else None
    fields = ticket.get("fields") if isinstance(ticket, dict) else None
    if not isinstance(fields, dict):
        fail(2, f"Ticket {key} illisible dans Jira.")
    if s["label"] in (fields.get("labels") or []) and force.strip().lower() not in ("oui", "yes"):
        fail(3, f"{key} porte déjà le label {s['label']} : temps gagné déjà posté. Relance avec « Forcer » = oui pour le reposter.")
    forced = prs.strip()
    if forced:
        refs = [ref(m.group(1), m.group(2)) for m in PR_REF.finditer(forced)]
        if not refs:
            fail(2, f"« prs » illisible : « {forced} » (owner/dépôt#n, séparés par des virgules).")
        source = "liste imposée"
    else:
        refs = from_dev_status(detail)
        source = "panneau Development de Jira"
        if not refs:
            refs, source = from_search(key), "recherche GitHub"
    picked, ignored, opened = [], [], []
    for r in uniq(refs):
        repo, n = r.rsplit("#", 1)
        try:
            pr = json.loads(gh("pr", "view", n, "-R", repo, "--json",
                               "number,title,body,state,url,headRefName,additions,deletions,changedFiles,commits,reviews"))
        except (RuntimeError, ValueError) as e:
            ignored.append(f"{r} (illisible : {str(e)[:80]})")
            continue
        # panneau Jira comme recherche GitHub : une PR qui ne fait que citer le ticket (celle d'un autre ticket qui le
        # mentionne) n'en est pas une ; la clé doit être dans son titre ou sa branche, entière (EW-785 ≠ EW-7851)
        if source != "liste imposée" and not re.search(r"(?<![A-Z0-9])" + re.escape(key) + r"(?!\d)",
                                                       (pr.get("title") or "").upper() + " " + (pr.get("headRefName") or "").upper()):
            ignored.append(f"{r} (cite seulement {key} dans son texte)")
            continue
        state = pr.get("state")
        if state == "MERGED" or forced:
            picked.append((r, pr))
        elif state == "OPEN":
            opened.append(r)
        else:
            ignored.append(f"{r} (fermée sans merge)")
    found = [r for r, _ in picked] + opened
    if opened and not forced:
        fail(5, f"{key} a encore une PR ouverte : {', '.join(opened)}. PR trouvées ({source}) : {', '.join(found)}"
                + (f" ; écartées : {', '.join(ignored)}" if ignored else "")
                + ". Relance une fois tout mergé, ou avec « prs » = seulement les PR à estimer (owner/dépôt#n, …).")
    if not picked:
        fail(4, f"Aucune PR mergée trouvée pour {key} ({source})" + (f" ; écartées : {', '.join(ignored)}" if ignored else "")
                + ". Relance avec « prs » (owner/dépôt#n, …).")
    tools, models, challenged = [], [], []
    for _, pr in picked:
        t, m = tools_of(pr)
        tools += t
        models += m
        challenged += challenged_of(pr)
    pf = points_field(s)
    st = {"ticket": key, "summary": fields.get("summary") or "", "source": source, "ignored": ignored,
          "points_before": fields.get(pf) if pf else None, "force": force.strip().lower() in ("oui", "yes"),
          "tool": ", ".join(uniq(tools)) or s.get("tool") or w["unknown"],
          "model": ", ".join(uniq(models)) or s.get("model") or w["unknown"],
          "challenged": ", ".join(uniq(challenged)) or w["no"],
          "prs": [{"id": r, "title": pr.get("title") or "", "url": pr.get("url") or "", "add": pr.get("additions") or 0,
                   "del": pr.get("deletions") or 0, "files": pr.get("changedFiles") or 0} for r, pr in picked]}
    os.makedirs(HOME, exist_ok=True)
    write_json(state_path(run_id), st)
    budget = DIFF_BUDGET // len(picked)
    print(f"Ticket {key} : {st['summary']}")
    print(f"PR mergées ({source}) : {len(picked)}" + (f" ; écartées : {', '.join(ignored)}" if ignored else ""))
    print(f"Langue de went_well : {w['lang']}.")
    for (r, pr), p in zip(picked, st["prs"]):
        print(f"\n===== PR {r} : {p['title']}")
        print(f"+{p['add']} -{p['del']}, {p['files']} fichier(s)")
        print(diff_of(*r.rsplit("#", 1), budget))


# ---------- commentaire ----------
def hours(h, lang):
    v = round(max(float(h), 0) * 4) / 4
    txt = (f"{v:g}").replace(".", "," if lang == "fr" else ".")
    return txt + (" h" if lang == "fr" else "h")


def compose(run_id, raw):
    s = settings()
    w, lang = WORDS[s["lang"]], s["lang"]
    try:
        st = read_json(state_path(run_id))
    except (OSError, ValueError):
        fail(2, "État de la découverte introuvable : relance le modèle.")
    est = loads(raw) or {}
    rows = {str(x.get("pr") or "").strip(): x for x in (est.get("prs") or []) if isinstance(x, dict)} if isinstance(est, dict) else {}
    if not rows:
        fail(2, "Estimation de l'agent illisible : rien n'est posté.")
    per, tot_without, tot_with = [], 0.0, 0.0
    for p in st["prs"]:
        x = rows.get(p["id"]) or next((v for k, v in rows.items() if k.endswith("#" + p["id"].rsplit("#", 1)[1])), None)
        if not x:
            fail(2, f"Pas d'estimation pour {p['id']} : rien n'est posté.")
        a, b = float(x.get("without_ai_h") or 0), float(x.get("with_ai_h") or 0)
        tot_without, tot_with = tot_without + a, tot_with + b
        per.append((p, a, b, str(x.get("why") or "").strip()))
    gain = max(tot_without - tot_with, 0)
    pf, before = points_field(s), st.get("points_before")
    pts = ai_points(tot_with, (s.get("points") or {}).get("scale")) if pf else None
    write_pts = pts is not None and (before in (None, "") or st.get("force"))
    short = lambda p: p["id"].split("/", 1)[-1]  # noqa: E731  (dépôt#n, sans le propriétaire)
    vals = {"tool": st["tool"], "model": st["model"], "challenged": st["challenged"], "ticket": st["ticket"],
            "went_well": str(est.get("went_well") or "").strip() or w["unknown"],
            "confidence": w["conf"].get(str(est.get("confidence") or "").lower(), str(est.get("confidence") or w["unknown"])),
            "saved": w["total"].replace("{gain}", hours(gain, lang)).replace("{without}", hours(tot_without, lang)).replace("{with}", hours(tot_with, lang)),
            "ai_points": str(pts if pts is not None else w["unknown"]),
            "per_pr": w["prs"].replace("{n}", str(len(per))).replace("{list}", ", ".join(f"{short(p)} ~{hours(a - b, lang)}" for p, a, b, _ in per))}

    def fill(t):
        return re.sub(r"\{(\w+)\}", lambda m: vals.get(m.group(1), m.group(0)), str(t))
    lab = lambda t: fill(t) if fill(t).rstrip().endswith("?") else fill(t) + ":"  # noqa: E731  (une question sans deux-points)
    body = f"*{s['title']}*\n" + "\n".join(f"* *{lab(k)}* {fill(v)}" for k, v in s["fields"] or [])
    preview = [f"## ⏱ Temps gagné par l'IA · {st['ticket']}", "", st["summary"], ""]
    preview += [f"- **{short(p)}** {p['title']} : sans IA ~{hours(a, 'fr')}, avec IA ~{hours(b, 'fr')}, gagné ~{hours(a - b, 'fr')}"
                + (f". {why}" if why else "") for p, a, b, why in per]
    preview += ["", f"Source des PR : {st['source']}." + (f" Écartées : {', '.join(st['ignored'])}." if st["ignored"] else ""),
                "", f"Commentaire posté sur {st['ticket']}, puis label `{s['label']}` :", "", "```", body, "```"]
    if pts is not None:
        why = f"~{hours(tot_with, 'fr')} avec l'IA"
        preview[4:4] = [f"**Points avec l'IA : {pts}** ({why}, champ `{pf}`)" + ("" if write_pts else
                        f" : non écrits, le ticket en a déjà ({before}) ; « Forcer » pour les remplacer"), ""]
    labels = {"update": {"labels": [{"add": s["label"]}]}}
    if write_pts:
        labels["fields"] = {pf: pts}
    print(dumps({"comment": {"body": body}, "labels": labels, "preview": "\n".join(preview)}))


def gate(ask):
    if ask.strip().lower() in ("non", "no", "false", "0"):
        fail(3, "Sans validation (appel de la mise en prod) : commentaire posté directement.")
    print("Validation du commentaire.")


def done(run_id):
    path = state_path(run_id)
    try:
        st = read_json(path)
        os.remove(path)
    except (OSError, ValueError):
        st = {}
    print(f"Temps gagné posté sur {st.get('ticket', 'le ticket')}, label {settings()['label']} posé.")


if __name__ == "__main__":
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == "instance":
        instance()
    elif cmd == "discover":
        discover(*(args + [""] * 4)[:4])
    elif cmd == "compose":
        compose(*(args + [""] * 2)[:2])
    elif cmd == "gate":
        gate((args + [""])[0])
    elif cmd == "done":
        done((args + [""])[0])
    else:
        fail(2, f"Sous-commande inconnue : {cmd}")
