"""Console Support (#62) : les demandes d'un canal Teams, leur investigation par l'agent Support et la réponse en fil.

  python3 -c <ce script> poll                                   # relevé du canal -> dataset support (cron, « Relever »)
  python3 -c <ce script> open <message> <projet> <run> <commentaire>   # début d'une investigation : discussion Kronn
  python3 -c <ce script> dataset                                # l'état des fils sans relevé (investigation lancée)
  python3 -c <ce script> draft <run>        (stdin : réponse de l'agent)  # la réponse au format, numéro de version
  python3 -c <ce script> post <run>         (stdin : réponse validée)     # réponse en fil -> dataset support
  python3 -c <ce script> skip <message> <ignorer|reactiver>             # 🔕 un fil ignoré ne compte plus (bouton de la console)

Réglage support (pack d'équipe ou config) : {name, team, channel, days (7), model (« haiku »), claude (chemin de la CLI)}.
Lecture du canal : la permission Graph ChannelMessage.Read.All manque au jeton Azure CLI ; le connecteur Claude
Microsoft 365 de la personne connectée l'a. Le relevé lance donc la CLI claude (jamais une étape Agent de Kronn, qui
coupe les connecteurs claude.ai avec --strict-mcp-config), réglée au plus juste : petit modèle, aucun outil intégré, la
seule lecture des messages du canal autorisée, les autres outils interdits (leur liste est gardée d'un relevé à
l'autre), réglages utilisateur ignorés, un seul tour. Le modèle fait les appels ; leurs résultats bruts sont lus dans
le flux de la CLI et publiés tels quels, sans qu'il les relise. Les réponses d'un fil ne sont relues que s'il a bougé.
Réponse en fil : « az account get-access-token » (Microsoft Graph), sous le nom de la personne connectée.
Fichiers : ~/.cache/pixel-bureau/support.json seulement (jamais le dossier du projet).

Dataset support : {generated_at, polled_at, name, url, ok, error, cost, me, days, threads: [{id, at, from, text, url,
replies, last_at, state, by, mine, run}]} ; state = new (à investiguer), run (investigation en cours), gate (réponse à
valider), done (répondu en fil), resolved (✅ sur le message), answered (pris par un collègue, by = son nom), relaunched
(l'auteur a relancé après sa réponse), ignored (réponse refusée), failed, skipped (🔕 ignoré depuis la console : ne compte
plus, jusqu'à « ↺ Réactiver ») ; skip = la valeur de l'action du bouton (ignorer ou reactiver), relue par Kronn.
"""
import html, json, os, re, shutil, subprocess, sys, urllib.error, urllib.parse, urllib.request, uuid
from html.parser import HTMLParser
from datetime import datetime, timedelta, timezone
from _lib import API, CFG, get, read_json, write_json

S = CFG.get("support") or {}
CACHE = os.path.join(os.path.expanduser("~"), ".cache", "pixel-bureau", "support.json")
GRAPH = os.environ.get("SUPPORT_GRAPH") or "https://graph.microsoft.com/v1.0"  # SUPPORT_GRAPH : tests
TOOL = "mcp__claude_ai_Microsoft_365__teams_list_channel_messages"
TOOL_R = "mcp__claude_ai_Microsoft_365__read_resource"  # un message en entier : sujet, réactions, message transféré
TOOLS = (TOOL, TOOL_R)
DAYS = int(S.get("days") or 7)
REPLIES_MAX = 8  # fils dont on relit les réponses à chaque relevé (les plus récents qui ont bougé)
FOOTER = "Généré de manière automatique 🤖"
SECTION = re.compile(r"^\W{1,4}\s*[^:]{1,30}?\s*:\s*\S")  # « 🔎 Cause : … »


def now():
    return datetime.now(timezone.utc)


def iso(t):
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def fail(msg, code=1):
    print(msg)
    sys.exit(code)


def load():
    try:
        c = read_json(CACHE)
        return c if isinstance(c, dict) else {}
    except (OSError, ValueError):
        return {}


def save(c):
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    write_json(CACHE, c)


# ---------- relevé par la CLI claude et le connecteur Microsoft 365 ----------
def claude_bin():
    c = S.get("claude") or os.environ.get("BUREAU_CLAUDE") or shutil.which("claude")
    for d in ("/opt/homebrew/bin", "/usr/local/bin", os.path.expanduser("~/.local/bin"), os.path.expanduser("~/.claude/local")):
        if not c and os.path.isfile(os.path.join(d, "claude")):
            c = os.path.join(d, "claude")
    return c


def calls_prompt(roots):
    base = f'teamId="{S["team"]}", channelId="{S["channel"]}"'
    uri = f"teams:///teams/{S['team']}/channels/{S['channel']}/messages/"
    lines = [f"{TOOL} : {base}, limit=20"]
    for m in roots:
        lines += [f'{TOOL} : {base}, parentMessageId="{m}", limit=50', f'{TOOL_R} : uri="{uri}{m}"']
    return ("Fais en un seul message tous ces appels d'outil, en parallèle, sans rien écrire d'autre :\n"
            + "\n".join(f"{i + 1}) {x}" for i, x in enumerate(lines)))


def run_claude(prompt, known_tools):
    """Appels faits par la CLI : ({id d'appel: (entrée, [objets du résultat] ou None si en erreur)}, outils vus, coût)."""
    exe = claude_bin()
    if not exe:
        raise RuntimeError("CLI claude introuvable (réglage support.claude)")
    others = sorted(t for t in known_tools if t not in TOOLS)
    cmd = [exe, "-p", "--model", S.get("model") or "haiku", "--setting-sources", "project", "--tools", "",
           "--allowedTools", *TOOLS, "--disable-slash-commands", "--no-session-persistence", "--max-turns", "1",
           "--system-prompt", "Tu fais exactement les appels d'outil demandés, sans rien écrire d'autre.",
           "--output-format", "stream-json", "--verbose"]
    if others:
        cmd.insert(2, "--disallowedTools=" + ",".join(others))
    # MCP_CONNECTION_NONBLOCKING=0 : la CLI attend ses connecteurs avant le premier tour (sinon : aucun outil)
    env = {**os.environ, "MCP_CONNECTION_NONBLOCKING": "0"}
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    r = subprocess.run(cmd, input=prompt, capture_output=True, text=True, timeout=150, env=env,
                       cwd=os.path.dirname(CACHE))  # un dossier sans .mcp.json ni CLAUDE.md
    calls, results, tools, cost = {}, {}, set(), 0.0
    for line in r.stdout.splitlines():
        try:
            e = json.loads(line)
        except ValueError:
            continue
        if e.get("type") == "system" and e.get("subtype") == "init":
            tools.update(t for t in e.get("tools") or [] if t.startswith("mcp__"))
        for c in ((e.get("message") or {}).get("content") or []) if e.get("type") in ("assistant", "user") else []:
            if c.get("type") == "tool_use" and c.get("name") in TOOLS:
                calls[c["id"]] = c.get("input") or {}
            elif c.get("type") == "tool_result":
                results[c.get("tool_use_id")] = None if c.get("is_error") else c.get("content")
        if e.get("type") == "result":
            cost = float(e.get("total_cost_usd") or 0)
    if not calls:
        tail = (r.stderr or r.stdout).strip().splitlines()[-1:] or [""]
        raise RuntimeError("le connecteur Claude Microsoft 365 n'a rien lu" + (f" ({tail[0][:160]})" if tail[0] else "")
                           + (" : outil absent, connecteur débranché ?" if TOOL not in tools else ""))
    return {k: (v, objects(results.get(k))) for k, v in calls.items()}, tools, cost


def objects(content):
    """Résultat de l'outil : un objet JSON par bloc de texte (le dernier peut être {moreResults, nextCursor})."""
    if content is None:
        return None
    parts = [content] if isinstance(content, str) else [x.get("text", "") for x in content if isinstance(x, dict)]
    out, dec = [], json.JSONDecoder()
    for p in parts:
        i = 0
        while i < len(p):
            while i < len(p) and p[i].isspace():
                i += 1
            if i >= len(p):
                break
            try:
                o, i = dec.raw_decode(p, i)
            except ValueError:
                break
            out += o if isinstance(o, list) else [o]
    return [o for o in out if isinstance(o, dict) and o.get("id")]


class _Text(HTMLParser):
    """HTML d'un message Teams -> texte : paragraphes et <br> en retours à la ligne, lien = son adresse complète
    (le texte d'un lien est souvent tronqué « … ») ou « texte (adresse) », le reste des balises retiré."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.href, self.link = [], None, []

    def handle_starttag(self, tag, attrs):
        if tag in ("br", "p", "div", "li", "tr") and self.out and not self.out[-1].endswith("\n"):
            self.out.append("\n")
        if tag == "li":
            self.out.append("• ")
        if tag == "a":
            self.href, self.link = dict(attrs).get("href"), []

    def handle_endtag(self, tag):
        if tag == "a":
            txt, h = "".join(self.link).strip(), self.href or ""
            self.out.append(h if h.startswith("http") and (not txt or txt.rstrip("…") in h or txt.startswith("http"))
                            else f"{txt} ({h})" if h.startswith("http") else txt)
            self.href = None
        elif tag in ("p", "div", "li", "tr"):
            self.out.append("\n")

    def handle_data(self, data):
        (self.link if self.href is not None else self.out).append(data)


def text_of(body):
    """Texte lisible d'un message : son HTML converti (texte brut tel quel)."""
    s = str(body or "")
    if "<" not in s:
        return html.unescape(s)
    p = _Text()
    p.feed(s)
    p.close()
    return "".join(p.out)


def clip(text, n=1000):
    t = re.sub(r"[ \t\u00a0]+", " ", text_of(text))
    t = re.sub(r" *\n *", "\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t).strip()
    return t if len(t) <= n else t[:n - 1].rstrip() + "…"


def msg_row(m):
    f = m.get("from") or {}
    return {"id": str(m["id"]), "at": m.get("createdDateTime"), "lm": m.get("lastModifiedDateTime"), "url": m.get("webUrl"),
            "from": f.get("displayName") or "?", "uid": f.get("userId"), "text": clip(m.get("bodyPreview")),
            "cut": bool(m.get("bodyTruncated"))}


def detail_of(m):
    """Message principal lu en entier : sujet, réactions (emoji Unicode, ou « custom » pour un emoji de l'organisation, sans
    son nom), texte complet et message transféré (pièce jointe forwardedMessageReference)."""
    body = (m.get("body") or {}).get("content") or ""
    for a in m.get("attachments") or []:
        if a.get("contentType") == "forwardedMessageReference":
            try:
                body += "<p>↪ Message transféré :</p>" + (json.loads(a.get("content") or "{}").get("originalMessageContent") or "")
            except ValueError:
                pass
    return {"subject": clip(m.get("subject"), 120) or None, "text": clip(body, 1500),
            "reactions": [str(r.get("reactionType")) for r in m.get("reactions") or [] if r.get("reactionType")]}


def me(c):
    """La personne connectée (jeton Azure CLI) : ses réponses à la main comptent comme répondues."""
    if not c.get("me"):
        try:
            u = graph("GET", "/me?$select=id,displayName")
            c["me"] = {"id": u.get("id"), "name": u.get("displayName")}
        except Exception as e:  # sans az : ses réponses à la main comptent comme celles d'un collègue
            print(f"support : /me illisible ({str(e)[:120]})", file=sys.stderr)
    return c.get("me") or {}


def poll(c):
    if not (S.get("team") and S.get("channel")):
        raise RuntimeError("réglage support.team / support.channel manquant")
    since = iso(now() - timedelta(days=DAYS))
    threads = c.setdefault("threads", {})
    # réponses à relire : les fils récents qui ont bougé depuis leur dernière lecture (ou jamais lus)
    moved = sorted((t for t in threads.values() if (t.get("at") or "") >= since and (t.get("lm") != t.get("rlm") or "detail" not in t)),
                   key=lambda t: t.get("lm") or "", reverse=True)[:REPLIES_MAX]
    calls, tools, cost = run_claude(calls_prompt([t["id"] for t in moved]), c.get("tools") or [])
    c["tools"] = sorted(tools | set(c.get("tools") or []))
    for inp, res in calls.values():
        if res is None:
            continue
        parent = inp.get("parentMessageId")
        if inp.get("uri"):  # read_resource : le message principal en entier
            mid = str(inp["uri"]).rsplit("/", 1)[-1]
            if mid in threads and res:
                threads[mid]["detail"] = detail_of(res[0])
            continue
        if not parent:
            for m in res:
                if m.get("messageType") != "message" or not m.get("from"):
                    continue  # messages système (membre ajouté…) et cartes sans auteur
                row = msg_row(m)
                old = threads.get(row["id"]) or {}
                threads[row["id"]] = {**old, **row}
        elif parent in threads:
            t = threads[parent]
            t["replies"] = [{k: r[k] for k in ("at", "from", "uid", "text")} for r in map(msg_row, res)
                            if r["from"] != "?"]
            t["replies"].sort(key=lambda r: r.get("at") or "")
            t["rlm"] = t.get("lm")
    # fils nouveaux : leurs réponses au relevé suivant (leur lm diffère de rlm, encore absent)
    for k in [k for k, t in threads.items() if (t.get("at") or "") < iso(now() - timedelta(days=DAYS + 7))]:
        threads.pop(k)
    c["skipped"] = {k: v for k, v in (c.get("skipped") or {}).items() if k in threads}  # fils ignorés sortis du relevé
    c.update(polled_at=iso(now()), error=None, cost=round(cost, 4))
    me(c)


# ---------- runs du modèle d'investigation ----------
def model_id():
    return (CFG.get("models") or {}).get("support") or ""


def runs_by_thread(c):
    """Dernier run du modèle pour chaque fil (variable message_id) : {fil: {run, status, at, end, disc, version, gate}}."""
    wid, out = model_id(), {}
    if not wid:
        return out
    try:
        runs = get(f"/workflows/{wid}/runs?limit=50") or []
    except Exception as e:
        print(f"support : runs illisibles ({str(e)[:120]})", file=sys.stderr)
        return out
    for r in runs:
        tc = r.get("trigger_context") if isinstance(r.get("trigger_context"), dict) else {}
        # le fil du run : sa variable message_id (absente de trigger_context depuis que Kronn range les variables dans un
        # instantané), sinon le lien noté par l'étape open dans le cache
        msg = str(tc.get("message_id") or ((c.get("runs") or {}).get(r["id"]) or {}).get("msg") or "")
        if not msg or (out.get(msg) and out[msg]["at"] >= (r.get("started_at") or "")):
            continue
        meta = (c.get("runs") or {}).get(r["id"]) or {}
        steps = [s.get("step_name") for s in r.get("step_results") or []]
        out[msg] = {"run": r["id"], "status": r.get("status"), "at": r.get("started_at"), "end": r.get("finished_at"),
                    "disc": meta.get("disc"), "version": meta.get("version") or 0, "draft": meta.get("draft"),
                    "gate": "gate" in steps}
    return out


RESOLVED = "✅"  # réaction posée sur le message principal quand le sujet est traité (règle du canal)


def state_of(t, run, mine, my_id):
    """État d'un fil : ✅ sur le message = traité ; puis la réponse postée et l'investigation ; puis les réponses du fil :
    quelqu'un d'autre que l'auteur a répondu = pris par lui (hors du compte), sauf si l'auteur a écrit après sa dernière
    réponse (relancé, de nouveau à traiter) ; personne = nouveau. Renvoie (état, qui)."""
    if RESOLVED in ((t.get("detail") or {}).get("reactions") or []):
        return "resolved", None
    if t.get("skipped"):  # 🔕 ignoré depuis la console, jusqu'à « ↺ Réactiver »
        return "skipped", None
    if mine:
        return "done", None
    if run and run["status"] in ("Running", "Pending"):
        return "run", None
    if run and run["status"] == "WaitingApproval":
        return "gate", None
    if run and run["status"] == "Failed" and run["gate"]:
        return "ignored", None  # réponse refusée à la gate : rien n'est posté
    replies = t.get("replies") or []
    helpers = [r for r in replies if r.get("uid") != t.get("uid")]  # ni l'auteur
    if helpers:
        last = helpers[-1]
        if any(r.get("uid") == t.get("uid") and (r.get("at") or "") > (last.get("at") or "") for r in replies):
            return "relaunched", last["from"]  # l'auteur relance après la dernière réponse
        return ("done", None) if my_id and last.get("uid") == my_id else ("answered", last["from"])
    if run and run["status"] in ("Failed", "Cancelled", "StoppedByGuard", "Interrupted"):
        return "failed", None
    return "new", None


def dataset(c):
    since = iso(now() - timedelta(days=DAYS))
    runs, my = runs_by_thread(c), (c.get("me") or {}).get("id")
    rows = []
    for t in sorted(c.get("threads", {}).values(), key=lambda t: t.get("at") or "", reverse=True):
        if (t.get("at") or "") < since:
            continue
        mine = (c.get("posted") or {}).get(t["id"])
        st, by = state_of({**t, "skipped": t["id"] in (c.get("skipped") or {})}, runs.get(t["id"]), mine, my)
        run = runs.get(t["id"])
        dt = t.get("detail") or {}
        rows.append({"id": t["id"], "at": t.get("at"), "from": t.get("from"), "text": dt.get("text") or t.get("text"),
                     "subject": dt.get("subject"), "reactions": dt.get("reactions") or [], "url": t.get("url"),
                     "cut": t.get("cut") or False, "replies": len(t.get("replies") or []),
                     "last_at": (t.get("replies") or [{}])[-1].get("at") or t.get("at"), "state": st, "by": by,
                     "skip": "reactiver" if st == "skipped" else "ignorer",
                     "skipped_at": (c.get("skipped") or {}).get(t["id"]) if st == "skipped" else None,
                     "mine": {"at": mine.get("at"), "text": mine.get("text")} if mine else None,
                     "run": {k: run[k] for k in ("run", "status", "at", "disc", "version", "draft")} if run else None})
    rows = rows[:40]
    out = {"generated_at": iso(now()), "polled_at": c.get("polled_at"), "name": S.get("name") or "Support",
           "ok": not c.get("error"), "error": c.get("error"), "cost": c.get("cost"), "days": DAYS,
           "me": (c.get("me") or {}).get("name"), "threads": rows}
    while len(json.dumps(out, ensure_ascii=False).encode()) > 90_000 and out["threads"]:
        out["threads"].pop()  # sortie d'étape Exec sous 100 Ko
    return out


# ---------- investigation ----------
def kronn(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, headers={"content-type": "application/json"},
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            res = json.load(r)
    except urllib.error.HTTPError as e:
        fail(f"Kronn a refusé {path} ({e.code}) : {e.read()[:300].decode(errors='replace')}")
    except OSError as e:
        fail(f"Kronn injoignable ({path}) : {e}")
    return res.get("data", res) if isinstance(res, dict) else res


def project_of(pid):
    if not pid or pid == "none":
        return None
    p = next((x for x in kronn("GET", "/projects") or [] if x.get("id") == pid), None)
    if not p:
        fail("Projet inconnu de Kronn : recharge la page.")
    return p


def first_name(name):
    """« Nom, Prénom » (annuaire) -> « Prénom » ; sinon le premier mot."""
    name = str(name or "?")
    return name.split(",", 1)[1].strip().split(" ")[0] if "," in name else name.split(" ")[0]


def brief(t, p, comment, who):
    where = (f"Projet : {p.get('name')} (dossier {p.get('path')}). Lis son code en lecture seule (Read, Grep, git log) ; "
             "ne modifie rien.") if p else "Pas de projet : appuie-toi sur le message seul."
    cut = f"\n(Message tronqué : la suite est dans Teams, {t.get('url')})" if t.get("cut") else ""
    note = f"\nCommentaire de {who} : {comment.strip()}" if comment.strip() else ""
    dt = t.get("detail") or {}
    subj = f"Sujet : {dt['subject']}\n" if dt.get("subject") else ""
    return (f"Demande arrivée sur le canal Teams « {S.get('name') or 'Support'} », de {t.get('from')} le {t.get('at')} :\n"
            f"{subj}<<<\n{dt.get('text') or t.get('text')}\n>>>{cut}\n{where}{note}")


ASK = """Tu es l'agent Support. Lis d'abord les derniers messages de ta discussion Kronn : des remarques peuvent y avoir
été ajoutées depuis le tour précédent. Investigue, en résumant au fil de l'eau ce que tu trouves dans la discussion.
Puis rédige la réponse qui sera postée en fil sous le nom de la personne qui t'a lancé (elle la valide d'abord).
Fais toi-même les lectures (Read, Grep, Glob, Bash en lecture seule), sans lancer d'agent ni de tâche en
arrière-plan, et sans rendre la main avant d'avoir la réponse. Résume ce que tu trouves dans ta discussion en notes
(disc_append avec channel "note" et wait_for_reply false : une note ne réveille pas l'agent de la discussion).
Ta réponse finale, et rien d'autre : en français, concise, une ligne par section, chacune avec son emoji, par exemple
🔎 Cause : …
🛠️ Action : …
👀 Suivi : …
(d'autres sections si utile : ✅ Correctif, ❓ Question, 📎 Lien). Rien avant la première section ni après la
dernière (ni « voici la réponse », ni « je la publie ? ») ; pas de titre, pas de signature, pas de formule de
politesse : la mention « Généré de manière automatique » est ajoutée après."""


def jira_hint():
    """Lire un ticket Jira cité : api_call et la connexion Jira du Bureau (Kronn ajoute l'authentification), en lecture."""
    cid = (CFG.get("jira") or {}).get("config_id")
    return (f'\nUn ticket Jira cité (ex. EW-1234) : lis-le avec api_call (api_plugin_slug "mcp-atlassian", api_config_id "{cid}", '
            'method GET, endpoint_path "/rest/api/2/issue/<clé>", query fields "summary,description,status,priority,comment"), '
            "jamais par curl ; en lecture seulement.") if cid else ""


def open_(msg, pid, run_id, comment):
    c = load()
    t = (c.get("threads") or {}).get(msg)
    if not t:
        fail(f"Message inconnu : il n'est plus dans les {DAYS} derniers jours du relevé ; relève le canal puis relance.")
    if (c.get("posted") or {}).get(msg):
        fail("Ce fil a déjà sa réponse postée.")
    p = project_of(pid)
    who = first_name((c.get("me") or {}).get("name")) if (c.get("me") or {}).get("name") else "la personne qui t'a lancé"
    text = brief(t, p, comment, who)
    first = (t.get("text") or "").splitlines()[0] if t.get("text") else ""
    title = "🎧 " + first_name(t.get("from")) + " : " + (first if len(first) <= 60 else first[:59].rstrip() + "…")
    disc = kronn("POST", "/discussions", {"project_id": (CFG.get("kronn") or {}).get("project_id") or None, "title": title,
                                         "agent": "ClaudeCode", "language": "fr",
                                         "initial_prompt": text + "\n\n(Investigation lancée depuis Le Bureau : l'agent Support y travaille.)"})
    if not isinstance(disc, dict) or not disc.get("id"):
        fail("Kronn n'a pas créé la discussion.")
    c.setdefault("runs", {})[run_id] = {"msg": msg, "disc": disc["id"], "project": pid, "version": 0, "at": iso(now())}
    save(c)
    print(f"---STATE:disc={disc['id']}---")
    print(text + "\n\n" + ASK + jira_hint())


def draft(run_id, text):
    """Réponse de l'agent au format : de la première à la dernière section (ses phrases autour sautent), mention retirée
    (ajoutée au post), version suivante."""
    lines = [ln.rstrip() for ln in (text or "").strip().splitlines()]
    lines = [ln for ln in lines if ln.strip() and "généré de manière automatique" not in ln.lower()]
    lines = [ln.strip().strip("*").strip() if ln.strip().startswith("**") else ln for ln in lines]
    if not lines:
        fail("L'agent n'a rendu aucune réponse : demande des changements pour relancer.")
    idx = [i for i, ln in enumerate(lines) if SECTION.match(ln.strip())]
    if not idx:
        print("Pas de réponse au format (une ligne « emoji Libellé : … » par section) : l'agent rend la main à l'investigation.")
        sys.exit(3)  # on_result exit_3 : retour à l'étape investigate
    body = "\n".join(lines[idx[0]:idx[-1] + 1]).strip()
    c = load()
    meta = c.setdefault("runs", {}).setdefault(run_id, {})
    meta["version"] = int(meta.get("version") or 0) + 1
    meta["draft"] = body
    save(c)
    print(body)


def html_of(text):
    """Texte de la réponse -> HTML Teams : libellé de section en gras, une ligne vide entre les sections, puis la mention."""
    esc = lambda s: s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")  # noqa: E731
    out = ""
    for ln in [x for x in text.strip().splitlines() if x.strip()]:
        m = re.match(r"^(\W{1,4}\s*)([^:]{1,30}?)\s*:\s*(.*)$", ln.strip())
        out += (("<br><br>" if m else "<br>") if out else "") + (
            f"{esc(m.group(1))}<b>{esc(m.group(2))}</b> : {esc(m.group(3))}" if m else esc(ln.strip()))
    return out + "<br><br>" + esc(FOOTER)


TOKEN = [None]


def graph(method, path, body=None):
    if not TOKEN[0]:
        r = subprocess.run(["az", "account", "get-access-token", "--resource", "https://graph.microsoft.com", "--query",
                            "accessToken", "-o", "tsv"], capture_output=True, text=True, timeout=60)
        if r.returncode or not r.stdout.strip():
            raise RuntimeError("jeton Azure CLI indisponible (az login ?) : " + (r.stderr or "").strip()[:160])
        TOKEN[0] = r.stdout.strip()
    req = urllib.request.Request(GRAPH + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": "Bearer " + TOKEN[0], "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
    return json.loads(raw) if raw else None


def post(run_id, text):
    c = load()
    meta = (c.get("runs") or {}).get(run_id) or {}
    msg = meta.get("msg")
    if not msg:
        fail("Run inconnu du Bureau : rien n'est posté.")
    if (c.get("posted") or {}).get(msg):
        fail("Ce fil a déjà sa réponse postée.")
    text = (text or "").strip() or meta.get("draft") or ""
    if not text:
        fail("Réponse vide : rien n'est posté.")
    path = f"/teams/{S['team']}/channels/{urllib.parse.quote(S['channel'])}/messages/{msg}/replies"
    try:
        res = graph("POST", path, {"body": {"contentType": "html", "content": html_of(text)}})
    except urllib.error.HTTPError as e:
        fail(f"Teams a refusé la réponse ({e.code}) : {e.read()[:300].decode(errors='replace')}")
    except Exception as e:
        fail(f"Réponse non postée : {e}")
    c.setdefault("posted", {})[msg] = {"at": iso(now()), "text": text, "id": (res or {}).get("id"), "run": run_id}
    save(c)
    print(json.dumps(dataset(c), ensure_ascii=False))


def skip(msg, action):
    """🔕 Ignorer un fil (il ne compte plus dans les alertes) ou le réactiver ; idempotent."""
    if not re.fullmatch(r"\d{1,20}", msg) or action not in ("ignorer", "reactiver"):
        fail("Fil ou action inconnus : recharge la page.")
    c = load()
    if msg not in (c.get("threads") or {}):
        fail("Fil inconnu du relevé : recharge la page.")
    sk = c.setdefault("skipped", {})
    if action == "ignorer":
        sk.setdefault(msg, iso(now()))
    else:
        sk.pop(msg, None)
    save(c)
    print(("Fil ignoré : il ne compte plus dans les alertes." if action == "ignorer" else "Fil réactivé : il revient dans la file."))


if __name__ == "__main__":
    a = sys.argv[1:] + [""] * 5
    cmd = a[0]
    if cmd == "poll":
        cache = load()
        try:
            poll(cache)
        except Exception as e:  # relevé en échec : les fils déjà lus restent publiés, l'erreur s'affiche
            cache["error"] = str(e)[:240]
            print("support : " + cache["error"], file=sys.stderr)
        save(cache)
        print(json.dumps(dataset(cache), ensure_ascii=False))
    elif cmd == "dataset":  # sans relevé : l'état des fils (investigation lancée), publié tout de suite
        print(json.dumps(dataset(load()), ensure_ascii=False))
    elif cmd == "open":
        if not re.fullmatch(r"\d{1,20}", a[1].strip()):
            fail("Message manquant : recharge la page.")
        open_(a[1].strip(), a[2].strip(), a[3].strip() or "local", a[4])
    elif cmd == "draft":
        draft(a[1].strip() or "local", sys.stdin.read())
    elif cmd == "post":
        post(a[1].strip() or "local", sys.stdin.read())
    elif cmd == "skip":
        skip(a[1].strip(), a[2].strip())
    else:
        fail("sous-commande : poll | dataset | open | draft | post | skip", 2)
