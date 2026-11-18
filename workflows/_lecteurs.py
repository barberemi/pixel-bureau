"""« 👁 Ce qu'il fait » : ce que fait l'agent d'une étape, en trois niveaux, sans jamais dépendre d'un seul agent (Kronn
est multi-agents). Recopié au rendu, comme _lib.py, dans les seuls relevés qui l'importent (atelier, rédaction, retours,
live) : jamais dans _lib.py, qui part dans tous les scripts.

  1. base, quel que soit l'agent : fichiers touchés (git diff --numstat du dossier du run, non suivis, mtime, commits de
     la branche), rapport du poste fini (.kronn/chaine/<poste>.json), compteur de Kronn (last_activity) ;
  2. carnet de l'agent (.kronn/chaine/journal.md) : les postes de la chaîne y écrivent quelques lignes (impl.carnet) ;
  3. détail action par action : un lecteur propre à l'agent, choisi d'après l'agent que Kronn a enregistré pour l'étape
     (LECTEURS ; Claude Code aujourd'hui). Sans lecteur, la fiche le dit ; un lecteur en échec ne casse jamais le relevé.

Confidentialité, partout : jamais une commande complète (le premier mot utile, git avec sa sous-commande), jamais un
chemin absolu (relatif au dossier du run, sinon le nom du fichier), jamais le contenu d'un fichier ; une phrase de l'agent
qui parle de secret, token, mot de passe, clé, credential ou bearer est écartée. Seule la fin des journaux est lue : la
position atteinte est gardée par fichier dans ~/.cache/pixel-bureau/lecteurs/ (jamais dans le dépôt).
"""
import glob as _glob, hashlib as _hashlib, json as _json, os as _os2, re as _re, subprocess as _sp, sys as _sys2, time as _time
from datetime import datetime as _dt, timezone as _tz
from _lib import read_json, write_json

N_ACT, N_PHR, N_FIC = 10, 3, 7
LU_MAX = 2 * 1024 * 1024  # première lecture d'un gros journal : sa fin seulement
L_CACHE = _os2.path.join(_os2.path.expanduser("~"), ".cache", "pixel-bureau", "lecteurs")
SENSIBLE = _re.compile(r"(?i)secret|token|password|mot de passe|\bcl[ée]s?\b|api[ _-]?key|credential|bearer")
ABS = _re.compile(r"(?:~|/(?:Users|home|private|tmp|var|opt|etc|root|Volumes|mnt|srv|usr))/[^\s'\"`),;]*")


# ---------- règle de confidentialité ----------
def sans_chemin(s):
    """Un chemin absolu devient le nom de son fichier."""
    return ABS.sub(lambda m: _os2.path.basename(m.group(0).rstrip("/")) or "…", str(s or ""))


def phrase(s, n=140):
    """Une phrase montrable : None si elle parle d'un secret ; chemins absolus retirés ; un bout de code avec des espaces
    (une commande) réduit à son premier mot ; coupée à n signes."""
    s = str(s or "")
    if SENSIBLE.search(s):
        return None
    s = _re.sub(r"`([^`\n]*)`", lambda m: m.group(1) if not _re.search(r"\s", m.group(1).strip()) else m.group(1).split()[0] + "…", s)
    s = _re.sub(r"\s+", " ", sans_chemin(s).replace("`", "")).strip()
    return s if len(s) <= n else s[:n - 1].rstrip() + "…"


def rel(p, racines=()):
    """Chemin relatif au dossier du run (ou à une de ses racines) ; hors de lui, le nom du fichier seul."""
    p = str(p or "").strip("\"'")
    for r in racines:
        r = str(r or "").rstrip("/")
        if r and p.startswith(r + "/"):
            return p[len(r) + 1:]
    m = _re.search(r"/\.kronn/worktrees/[^/]+/(.*)$", p)
    if m:
        return m.group(1)
    return _os2.path.basename(p) if p.startswith(("/", "~")) else p


# ---------- commandes shell : le premier mot utile ----------
OUTILS = ("phpstan", "phpunit", "php-cs-fixer", "psalm", "rector", "tsc", "eslint", "jest", "vitest", "stylelint", "prettier", "twigcs", "pytest")
LECTEURS_SH = ("cat", "sed", "head", "tail", "less", "wc", "nl")
CHERCHEURS = ("grep", "rg", "find", "ls", "awk", "tree", "fd", "ag")


def commande(cmd):
    """(premier mot utile, jetons de cette sous-commande) : saute cd …&&, rtk [proxy], VAR=…, env, timeout N, sudo ; dans
    docker ou php vendor/bin, l'outil connu ; git avec sa sous-commande. Jamais la commande entière."""
    cmd = _re.sub(r"\b\w+=\"?\$\([^()]*\)\"?", "", cmd or "")  # W="$(cd .. && pwd)" : une variable, pas la commande
    for part in _re.split(r"&&|\|\||;|\n|\|", cmd):
        part = _re.sub(r"^\s*\w+=\"?\$\(", "", part)
        toks = [t for t in part.strip().split() if t != "\\"]
        while toks and (_re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", toks[0]) or _os2.path.basename(toks[0]) in ("env", "sudo", "time", "nice", "command", "exec", "(", "{")):
            toks = toks[1:]
        if toks and (_re.match(r"^\w+\(\)\{?$", toks[0]) or toks[0] in ("for", "while", "if", "do", "then", "done", "fi")):
            return "script", toks
        while toks and toks[0] in ("timeout", "rtk"):
            toks = toks[2:] if toks[0] == "timeout" or toks[1:2] == ["proxy"] else toks[1:]
        if not toks or toks[0] in ("cd", "pushd", "popd", "export", "set", "source", ".", "echo", "true", ":", "printf"):
            continue
        w = _os2.path.basename(toks[0].strip("\"'()"))
        if not _re.match(r"^[\w+]", w):  # .., un tiret, une redirection : pas une commande
            continue
        if w == "git":
            it, sub = iter(toks[1:]), None
            for t in it:
                if t in ("-C", "-c"):
                    next(it, None)
                elif not t.startswith("-"):
                    sub = t
                    break
            return ("git " + _re.sub(r"[^\w-]", "", sub)[:16]).strip() if sub else "git", toks
        if w == "docker":
            return next((_os2.path.basename(t) for t in toks if _os2.path.basename(t) in OUTILS), "docker"), toks
        if w in ("php", "python", "python3", "node", "npx", "composer", "npm", "yarn", "pnpm", "make", "sh", "bash") and len(toks) > 1:
            nxt = _os2.path.basename(toks[1].strip("\"'"))
            if nxt in OUTILS:
                return nxt, toks
            if w in ("npm", "yarn", "pnpm", "composer", "make") and not nxt.startswith("-"):
                return (w + " " + _re.sub(r"[^\w:.-]", "", nxt))[:28], toks
            return w, toks
        return _re.sub(r"[^\w.+-]", "", w)[:28] or "?", toks
    return "?", []


def cat_shell(cmd):
    """(catégorie, premier mot, jetons) : les agents lisent et cherchent surtout par le shell."""
    w, toks = commande(cmd)
    if w == "sed" and any(t.startswith("-i") for t in toks):
        return "modification", w, toks
    if w in LECTEURS_SH:
        return "lecture", w, toks
    if w in CHERCHEURS or w == "git grep":
        return "recherche", w, toks
    return "commande", w, toks


def fichier_lu(toks, racines):
    """Le fichier lu ou modifié par cat, sed, head… : le dernier argument qui ressemble à un chemin."""
    for t in reversed(toks[1:]):
        t = t.strip("\"'")
        if _re.match(r"^[\w.@~/-]+\.\w{1,6}$", t) and not t.startswith(("-", "s/")):
            return rel(t, racines)
    return ""


# ---------- lecteur Claude Code ----------
CAT = {"Read": "lecture", "Grep": "recherche", "Glob": "recherche", "Edit": "modification", "MultiEdit": "modification",
       "Write": "modification", "NotebookEdit": "modification", "Bash": "commande", "Task": "sous-agent", "Agent": "sous-agent"}
SAUTE = {"TodoWrite", "TaskOutput", "BashOutput", "ToolSearch", "KillShell", "SendMessage"}  # tenue interne
RAPPORT = _re.compile(r"\.kronn/chaine/(?:rapports/)?\w+\.json$")
MISSION = _re.compile(r"chargé du poste \*\*(\w+)\*\*")
KRONN = "=== ANTI-HALLUCINATION"  # le protocole que Kronn met en tête du prompt de chaque étape Agent


def racine_claude():
    return _os2.environ.get("BUREAU_SESSIONS_ROOT") or _os2.path.join(_os2.path.expanduser("~"), ".claude", "projects")


def sessions_de(dossier):
    """Le dossier des journaux de Claude Code pour un dossier de travail (chaque signe hors [A-Za-z0-9] devient « - »)."""
    return _os2.path.join(racine_claude(), _re.sub(r"[^A-Za-z0-9]", "-", str(dossier or "")))


def quand(iso):
    try:
        t = _dt.fromisoformat(str(iso).replace("Z", "+00:00"))
        return t if t.tzinfo else t.replace(tzinfo=_tz.utc)
    except ValueError:
        return None


def _cle(path, texte=True):
    return _os2.path.join(L_CACHE, _hashlib.sha1(f"{path}|{bool(texte)}".encode()).hexdigest()[:20] + ".json")


def _texte(c):
    return c if isinstance(c, str) else " ".join(b.get("text", "") for b in c or [] if isinstance(b, dict) and b.get("type") == "text")


def tete(path):
    """Le premier message user d'un journal (le prompt du poste) : lancé par Kronn, mission, et le texte pour un indice."""
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            for i, line in enumerate(f):
                if i > 400:
                    break
                try:
                    o = _json.loads(line)
                except ValueError:
                    continue
                if o.get("type") == "user":
                    return _texte((o.get("message") or {}).get("content") if isinstance(o.get("message"), dict) else "")
    except OSError:
        pass
    return ""


def _phrases(text):
    t = _re.split(r"---STEP_OUTPUT---", str(text or ""))[0]
    t = _re.sub(r"```.*?```", " ", t, flags=_re.S)
    out = []
    for line in t.splitlines():
        line = _re.sub(r"^\s*(?:[-•>#*|]+|\d+[.)])\s*", "", line).replace("**", "").strip()
        if len(line) < 12 or line.endswith(":") or line.startswith(("$ ", "{", "[")):
            continue
        out += [s.strip() for s in _re.split(r"(?<=[.!?])\s+", line) if len(s.strip()) >= 12]
    return out


def _action(name, inp, racines, texte=True):
    """(catégorie, cible) d'un appel d'outil, ou None pour la tenue interne ; sans texte (Support : la demande vient d'un
    canal ouvert), ni motif cherché, ni mission confiée, ni site lu : l'outil et le fichier seulement."""
    if name in SAUTE:
        return None
    cat = CAT.get(name, "autre")
    if name in ("Read", "Edit", "MultiEdit", "Write", "NotebookEdit"):
        p = inp.get("file_path") or inp.get("notebook_path") or ""
        cible = rel(p, racines)
        if cat == "modification" and RAPPORT.search(str(p)):
            cat = "rapport"
    elif name in ("Grep", "Glob"):
        pat = sans_chemin(inp.get("pattern"))
        cible = "" if not texte else "…" if SENSIBLE.search(pat) else pat if len(pat) <= 32 else pat[:31] + "…"
    elif name == "Bash":
        cat, w, toks = cat_shell(inp.get("command") or "")
        f = fichier_lu(toks, racines) if cat in ("lecture", "modification") else ""
        cible = f"{f} ({w})" if f else w
    elif name in ("Task", "Agent"):
        cible = (phrase(inp.get("description"), 40) or "") if texte else ""
    elif name == "WebFetch":
        m = _re.match(r"https?://([^/?#]+)", str(inp.get("url") or ""))
        cible = m.group(1) if m and texte else ""
    elif name.startswith("mcp__"):
        cible = name.split("__")[-1]
    else:
        cible = name
    cible = str(cible)
    if len(cible) > 60:  # un chemin garde sa fin (le nom du fichier), le reste son début
        cible = "…" + cible[-59:] if cat in ("lecture", "modification", "rapport") else cible[:59] + "…"
    return cat, cible


def lis_journal(path, racines=(), texte=True):
    """Résumé d'un journal de Claude Code, lu depuis la position gardée au relevé d'avant : {actions: [[iso, cat, cible]],
    phrases, compte: {cat: n}, depuis, dernier, partiel?}. Un fichier tronqué ou une ligne illisible sont sautés."""
    st = _os2.stat(path)
    try:
        c = read_json(_cle(path, texte))
    except (OSError, ValueError):
        c = {}
    if c.get("ino") != st.st_ino or st.st_size < c.get("pos", 0) or c.get("v") != 1:
        c = {"v": 1, "ino": st.st_ino, "pos": 0, "r": {"actions": [], "phr": [], "compte": {}}}
    r, pos = c["r"], c["pos"]
    if pos < st.st_size:
        with open(path, "rb") as f:
            if pos == 0 and st.st_size > LU_MAX:
                pos, r["partiel"] = st.st_size - LU_MAX, True
                f.seek(pos)
                pos += len(f.readline())
            f.seek(pos)
            buf = f.read(st.st_size - pos)
        fin = buf.rfind(b"\n")
        lignes = buf[:fin + 1].splitlines() if fin >= 0 else []
        c["pos"] = pos + fin + 1 if fin >= 0 else pos
        for line in lignes:
            try:
                o = _json.loads(line)
            except ValueError:
                continue
            if not isinstance(o, dict):
                continue
            ts = o.get("timestamp")
            m = o.get("message") if isinstance(o.get("message"), dict) else {}
            if ts and o.get("type") in ("user", "assistant"):
                r["depuis"] = r.get("depuis") or ts
                r["dernier"] = ts
            if o.get("type") != "assistant":
                continue
            cont = m.get("content")
            for b in [{"type": "text", "text": cont}] if isinstance(cont, str) else cont or []:
                if not isinstance(b, dict):
                    continue
                if b.get("type") == "text" and texte:
                    r["phr"] = (r["phr"] + [p for p in (phrase(s) for s in _phrases(b.get("text"))) if p])[-N_PHR * 2:]
                elif b.get("type") == "tool_use":
                    a = _action(str(b.get("name") or "?"), b.get("input") if isinstance(b.get("input"), dict) else {}, racines, texte)
                    if a:
                        r["compte"][a[0]] = r["compte"].get(a[0], 0) + 1
                        r["actions"] = (r["actions"] + [[ts, a[0], a[1]]])[-N_ACT:]
        try:
            _os2.makedirs(L_CACHE, exist_ok=True)
            write_json(_cle(path, texte), c)
        except OSError:
            pass  # cache seulement : relu en entier (sa fin) au relevé suivant
    out = {"actions": list(reversed(r["actions"])), "compte": dict(r["compte"]), "depuis": r.get("depuis"), "dernier": r.get("dernier")}
    if texte:
        out["phrases"] = r["phr"][-N_PHR:]
    if r.get("partiel"):
        out["partiel"] = True
    return out


def trouve_session(dossier, debut, indice=None):
    """Le journal de l'étape qui tourne : dans le dossier du run, ouvert après le début de l'étape, le plus récent, lancé
    par Kronn (son prompt commence par le protocole de Kronn ou porte ---STEP_OUTPUT---) ; quand le dossier est partagé
    (racine du projet, worktree d'un cron), il doit aussi porter l'indice (run, PR, heure du message)."""
    t0 = quand(debut)
    l = []
    for f in _glob.glob(_os2.path.join(sessions_de(dossier), "*.jsonl")):
        try:
            m = _os2.stat(f).st_mtime
        except OSError:
            continue
        if not t0 or m >= t0.timestamp() - 5:
            l.append((m, f))
    for _, f in sorted(l, reverse=True)[:8]:
        p = tete(f)
        if ("---STEP_OUTPUT---" in p or p.lstrip().startswith(KRONN)) and (not indice or indice in p):
            return f
    return None


def sous_agents(path, racines, texte=True):
    """Les sous-agents d'une session (contrôles en parallèle) : <session>/subagents/agent-*.jsonl, poste lu dans leur
    mission (« chargé du poste **x** »), modèle dans .meta.json."""
    out = []
    for f in sorted(_glob.glob(_os2.path.join(path[:-6], "subagents", "agent-*.jsonl")))[:12]:
        m = MISSION.search(tete(f))
        try:
            meta = read_json(f[:-6] + ".meta.json")
        except (OSError, ValueError):
            meta = {}
        s = lis_journal(f, racines, texte)
        x = {"poste": m.group(1) if m else None, "modele": str(meta.get("model") or "")[:20] or None, "n": sum(s["compte"].values()),
             "a": (s["actions"] or [None])[0], "at": s.get("dernier")}
        if texte and s.get("phrases"):
            x["p"] = s["phrases"][-1]
        out.append(x)
    return out


def lecteur_claude(run, etape, session_id, dossier, indice=None, racines=(), texte=True, sous=False, mission=None):
    """Lecteur Claude Code : la session exacte (provenance de Kronn) une fois l'étape finie, sinon celle du dossier du run
    ouverte depuis le début de l'étape ; mission : le journal de son sous-agent chargé de ce poste. None si introuvable."""
    path = None
    if session_id and _re.match(r"^[\w-]+$", str(session_id)):
        path = next(iter(_glob.glob(_os2.path.join(racine_claude(), "*", str(session_id) + ".jsonl"))), None)
    if not path and dossier and (etape or {}).get("status") in ("Running", "WaitingQuota", None):
        path = trouve_session(dossier, (etape or {}).get("started_at"), indice)
    if path and mission:
        path = next((f for f in sorted(_glob.glob(_os2.path.join(path[:-6], "subagents", "agent-*.jsonl")))
                     if (MISSION.search(tete(f)) or [None, None])[1] == mission), None)
    if not path:
        return None
    rac = tuple(x for x in (dossier, *racines) if x)
    d = lis_journal(path, rac, texte)
    if sous:
        s = sous_agents(path, rac, texte)
        if s:
            d["sous"] = s
    return d


LECTEURS = {"ClaudeCode": lecteur_claude}  # un lecteur par AgentType de Kronn (Codex, Gemini… : plus tard)


def agent_de(etape):
    """L'agent que Kronn a enregistré pour l'étape (dernière tentative, sinon step_agent) ; jamais supposé."""
    at = ((etape or {}).get("agent_provenance") or {}).get("attempts") or []
    return str((at[-1] if at else {}).get("agent") or (etape or {}).get("step_agent") or "") or None


def session_de(etape):
    """La session exacte, une fois l'étape finie : celle de la dernière tentative (provenance de Kronn)."""
    at = ((etape or {}).get("agent_provenance") or {}).get("attempts") or []
    return (at[-1] if at else {}).get("session_id")


def compteur(etape):
    a = (etape or {}).get("last_activity")
    return {"cat": a.get("category"), "n": a.get("calls"), "at": a.get("at")} if isinstance(a, dict) and a.get("at") else None


def detail(etape, dossier, run=None, indice=None, racines=(), texte=True, sous=False, mission=None):
    """Ce que fait l'agent d'une étape Agent : {ag, lu, d?, k?}. d = le lecteur de son agent ; un lecteur absent ou en
    échec laisse le reste (repli au niveau 1), jamais d'exception."""
    ag = agent_de(etape)
    if not ag:
        return None
    out = {"ag": ag, "lu": ag in LECTEURS}
    k = compteur(etape)
    if k:
        out["k"] = k
    if not out["lu"]:
        return out
    try:
        d = LECTEURS[ag](run, etape, session_de(etape), dossier, indice=indice, racines=racines, texte=texte, sous=sous, mission=mission)
    except Exception as e:  # un lecteur ne casse jamais le relevé : stderr (le run Kronn), et le niveau 1 reste
        print(f"lecteur {ag} : {type(e).__name__} {str(e)[:120]}", file=_sys2.stderr)
        d = None
    if d:
        if d.get("sous"):
            out["sous"] = d.pop("sous")
        out["d"] = d
    return out


# ---------- niveau 1 : le dossier du run ----------
def _git(dossier, *args):
    try:
        return _sp.run(["git", "--no-optional-locks", "-C", dossier, *args], capture_output=True, text=True, timeout=20).stdout
    except (OSError, _sp.SubprocessError):
        return ""


def fichiers(dossier, base=None):
    """Fichiers touchés dans le dossier du run (lecture seule, sans verrou) : depuis base (commits) et pas encore
    commités, plus les non suivis ; les 7 plus récents par mtime. {n, plus, moins, l: [[chemin, +, -, âge en s]],
    commits: [[iso, type(portée)]], encours} ; None hors d'un dépôt git."""
    if not dossier or not _os2.path.exists(_os2.path.join(dossier, ".git")):
        return None
    tot, encours = {}, set()
    lots = ([(["diff", "--numstat", f"{base}...HEAD"], False)] if base else []) + [(["diff", "--numstat", "HEAD"], True)]
    for args, en_cours in lots:
        for line in _git(dossier, *args).splitlines():
            p = line.split("\t")
            if len(p) == 3 and not p[2].startswith((".kronn/", ".bureau-")):
                a, m = tot.get(p[2], (0, 0))
                tot[p[2]] = (a + (int(p[0]) if p[0].isdigit() else 0), m + (int(p[1]) if p[1].isdigit() else 0))
                if en_cours:
                    encours.add(p[2])
    for p in _git(dossier, "ls-files", "--others", "--exclude-standard").splitlines()[:200]:
        if p and not p.startswith((".kronn/", ".bureau-")):
            try:
                with open(_os2.path.join(dossier, p), "rb") as f:
                    tot[p] = (f.read(512 * 1024).count(b"\n"), 0)
            except OSError:
                tot[p] = (0, 0)
            encours.add(p)
    now, age = _time.time(), {}
    for p in tot:
        try:
            age[p] = max(0, int(now - _os2.stat(_os2.path.join(dossier, p)).st_mtime))
        except OSError:
            age[p] = None
    l = sorted(tot, key=lambda p: age[p] if age[p] is not None else 1e12)
    com = []
    for line in (_git(dossier, "log", "--format=%cI%x1f%s", "-n", "20", f"{base}..HEAD").splitlines() if base else []):
        t, _, s = line.partition("\x1f")
        s = phrase(s.split(":")[0], 40) if phrase(s) else None  # le sujet entier passe le filtre ; seul type(portée) part
        if s:
            com.append([t, s])
    return {"n": len(tot), "plus": sum(a for a, _ in tot.values()), "moins": sum(m for _, m in tot.values()),
            "l": [[p, tot[p][0], tot[p][1], age[p]] for p in l[:N_FIC]], "commits": com[:3], "encours": len(encours)}


def rapport(dossier_chaine, poste):
    """Le rapport d'un poste fini (.kronn/chaine/<poste>.json), réduit : statut, heure, résumé, 3 constats au plus."""
    f = _os2.path.join(dossier_chaine, poste + ".json")
    try:
        d = read_json(f)
        at = _dt.fromtimestamp(_os2.stat(f).st_mtime, _tz.utc).isoformat(timespec="seconds")
    except (OSError, ValueError):
        return None
    if not isinstance(d, dict):
        return None
    r = d.get("resultat") if isinstance(d.get("resultat"), dict) else {}
    cs = [x for x in r.get("constats") or [] if isinstance(x, dict)]
    cs.sort(key=lambda x: x.get("gravite") != "bloquant")
    out = {"poste": poste, "statut": str(d.get("statut") or "")[:20], "at": at,
           "resume": phrase(r.get("resume") or d.get("note") or d.get("raison"), 220),
           "n": {"bloquant": sum(1 for x in cs if x.get("gravite") == "bloquant"), "avis": sum(1 for x in cs if x.get("gravite") != "bloquant")},
           "constats": [[str(x.get("gravite") or "avis")[:12], (_os2.path.basename(str(x.get("fichier") or "")) + (f":{x['ligne']}" if x.get("ligne") else ""))[:60],
                         phrase(x.get("probleme"), 140), phrase(x.get("correction"), 100)] for x in cs[:3]]}
    if isinstance(d.get("commits"), list):
        out["commits"] = len(d["commits"])
    return out


CARNET = _re.compile(r"^(\d{1,2})[:h](\d{2})\s*·\s*([\w-]+)\s*·\s*(.+)$")
# une commande dans une ligne du carnet (enchaînement, sous-shell, redirection, option, outil suivi d'un chemin ou d'une
# option) ou une valeur de secret (jeton GitHub, Slack, AWS, OpenAI ; longue suite de lettres et de chiffres) : ligne écartée
SHELL = _re.compile(r"&&|\|\||\$\(|\s\|\s|(?:^|\s)\d?>>?\s*[\w./~$&]|(?:^|\s)--?[A-Za-z][\w-]*(?=[\s=]|$)|\b(?:sudo|cd|git|docker|"
                    r"php|composer|npm|npx|yarn|pnpm|python3?|node|make|bash|sh|curl|rtk)\s+(?:\S+\s+){0,3}?(?:-{1,2}\w|\S*/)")
SECRET_VAL = _re.compile(r"\b(?:gh[pousr]_|github_pat_|sk-|xox[abprs]-|AKIA)[\w-]{8,}|(?=[A-Za-z_-]*\d)(?=[\d_-]*[A-Za-z])[\w-]{32,}")


def carnet(dossier_chaine, postes=None, n=5):
    """Niveau 2 : les dernières lignes du carnet (.kronn/chaine/journal.md), la plus récente d'abord. Les postes de la chaîne
    y écrivent « HH:MM · poste · ce qu'il fait » (consigne de templates.CARNET_POSTES) ; postes : ces postes seulement (une
    ligne hors format n'est montrée que sans filtre). Même règle que les phrases (phrase, 120 signes) ; une ligne qui contient
    une commande ou une valeur de secret est écartée."""
    try:
        with open(_os2.path.join(dossier_chaine, "journal.md"), encoding="utf-8", errors="replace") as f:
            f.seek(0, 2)
            f.seek(max(0, f.tell() - 16384))
            lignes = [x.strip(" -*\t") for x in f.read().splitlines() if x.strip(" -*\t#")]
    except OSError:
        return None
    out = []
    for x in lignes:
        m = CARNET.match(x)
        if postes is not None and not (m and m.group(3) in postes):
            continue
        t = m.group(4) if m else x
        p = None if SHELL.search(t) or SECRET_VAL.search(t) else phrase(t, 120 if m else 140)
        if p:
            out.append(f"{int(m.group(1)):02d}:{m.group(2)} · {m.group(3)} · {p}" if m else p)
    return out[-n:][::-1] or None


def plafonne(fait, n=6000):
    """Un fait sous n octets : les phrases, puis les sous-agents, puis la liste des fichiers cèdent d'abord."""
    taille = lambda: len(_json.dumps(fait, ensure_ascii=False).encode())  # noqa: E731
    for coupe in (lambda f: (f.get("d") or {}).pop("phrases", None), lambda f: [x.pop("p", None) for x in f.get("sous") or []],
                  lambda f: (f.get("diff") or {}).update(l=(f.get("diff") or {}).get("l", [])[:3]),
                  lambda f: (f.get("d") or {}).update(actions=(f.get("d") or {}).get("actions", [])[:4]), lambda f: f.pop("fini", None)):
        if taille() <= n:
            break
        coupe(fait)
    return fait


def menage(jours=3):
    """Les positions gardées des journaux plus touchés depuis quelques jours s'en vont (le cache ne grossit pas)."""
    lim = _time.time() - jours * 86400
    for f in _glob.glob(_os2.path.join(L_CACHE, "*.json")):
        try:
            if _os2.stat(f).st_mtime < lim:
                _os2.remove(f)
        except OSError:
            pass  # cache seulement
