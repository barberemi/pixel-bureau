"""Socle commun des scripts du Bureau : config d'installation, API Kronn, filtre des workflows du Bureau, runs.

Kronn lance chaque script avec « python3 -c <code> », sans fichier voisin : tools/templates.py recopie ce
fichier à la place de la ligne qui importe le socle, au rendu. En local (tests, essais), l'import est réel.
Config : injectée au rendu dans _CFG ; en local, le fichier de la variable
d'environnement BUREAU_CONFIG, sinon bureau.config.json à la racine du dépôt.
"""
import json, os as _os, re, shutil as _shutil, subprocess as _subprocess, urllib.error, urllib.request, uuid as _uuid
from zoneinfo import ZoneInfo


# fichiers lus ou écrits puis toujours refermés (#11 : jamais de open() sans with, tests en -W error::ResourceWarning)
def read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_json(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f)


def write_text(path, text):
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def read_bytes(path):
    with open(path, "rb") as f:
        return f.read()


def write_bytes(path, data):
    with open(path, "wb") as f:
        f.write(data)


_CFG = r"""__BUREAU_CONFIG__"""
CFG = json.loads(_CFG) if not _CFG.startswith("__") else read_json(
    _os.environ.get("BUREAU_CONFIG") or _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), _os.pardir, "bureau.config.json"))

API = (CFG.get("kronn") or {}).get("api", "")
# dossier du dépôt : injecté au rendu (dans Kronn, « python3 -c » n'a pas de __file__), sinon celui de ce fichier
ROOT = CFG.get("root") or (_os.path.dirname(_os.path.dirname(_os.path.abspath(globals()["__file__"])))
                           if "__file__" in globals() else "")
TZ = ZoneInfo((CFG.get("rhythm") or {}).get("timezone") or "Europe/Paris")  # fuseau du bureau, été comme hiver
# runs pas encore finis ; WaitingQuota (Kronn 0.15.1) : étape Agent en attente du quota, reprise ensuite
ACTIVE = ("Running", "WaitingApproval", "Pending", "WaitingQuota")
# variables de lancement recopiées dans la page : seulement celles qu'elle lit (jamais un token passé en variable)
VARS_KEPT = ("jira_ticket_key", "current_task.number", "current_task.author", "current_task.repo", "pr", "repo",
             "message_id")  # message du canal Support (#62) : la page relie l'investigation à son fil
# workflows et Quick Prompt du Bureau, par id (un nom se renomme) : jamais comptés comme des agents
BUREAU_IDS = {v for part in ("workflows", "actions") for v in (CFG.get(part) or {}).values() if v}


def get(path, timeout=120):
    with urllib.request.urlopen(API + path, timeout=timeout) as r:
        body = json.load(r)
    return body.get("data", body) if isinstance(body, dict) else body


def get_all(path, per_page=200, since=None, max_pages=50):
    """Toutes les pages d'une liste de Kronn paginée par page / per_page (comme /discussions, triée par updated_at
    décroissant), jusqu'à une page incomplète (#5). since : on s'arrête aussi dès qu'une page finit avant cette date
    (updated_at), les suivantes sont plus vieilles. Un élément déjà vu (Kronn qui ignorerait page) arrête la lecture."""
    out, seen = [], set()
    sep = "&" if "?" in path else "?"
    for page in range(1, max_pages + 1):
        batch = get(f"{path}{sep}page={page}&per_page={per_page}") or []
        fresh = [x for x in batch if x.get("id") not in seen]
        seen.update(x.get("id") for x in fresh)
        out += fresh
        if len(batch) < per_page or len(fresh) < len(batch):
            break
        if since and str(batch[-1].get("updated_at") or "") < since:
            break
    return out



def send(method, path, body=None, timeout=30):
    """POST / PATCH vers l'API Kronn ; renvoie data. Refus ou Kronn injoignable : RuntimeError au message lisible."""
    req = urllib.request.Request(API + path, method=method, headers={"content-type": "application/json"},
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            res = json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Kronn a refusé {path} ({e.code}) : {e.read()[:300].decode(errors='replace')}")
    except OSError as e:
        raise RuntimeError(f"Kronn injoignable ({path}) : {e}")
    if isinstance(res, dict) and res.get("success") is False:
        raise RuntimeError(f"Kronn a refusé {path} : {str(res.get('error'))[:300]}")
    return res.get("data", res) if isinstance(res, dict) else res


DUCK_NOTE = "(Discussion ouverte depuis Le Bureau, par le canard. Si un numéro de ticket Jira est cité, va le lire.)"


def open_duck(topic, title="", project=None):
    """Discussion avec le canard (titre « 🦆 … », is_bureau_disc), agent lancé ; renvoie son id. duck_start.py, todos.py.
    POST /discussions crée la discussion et son premier message sans lancer l'agent (l'interface de Kronn enchaîne avec
    POST /discussions/{id}/run) : on fait de même. /run met le tour de l'agent en file (durable) avant de répondre en flux
    SSE : on n'attend que les en-têtes, l'agent continue sans nous."""
    first = (title or topic).splitlines()[0].strip()  # sans titre : la première ligne du sujet
    res = send("POST", "/discussions", {"project_id": project, "title": "🦆 " + (first if len(first) <= 70 else first[:69].rstrip() + "…"),
                                         "agent": "ClaudeCode", "language": "fr", "initial_prompt": topic + "\n\n" + DUCK_NOTE})
    if not isinstance(res, dict) or not res.get("id"):
        raise RuntimeError("Kronn n'a pas créé la discussion : " + str(res)[:200])
    req = urllib.request.Request(API + f"/discussions/{res['id']}/run", method="POST", headers={"content-type": "application/json"},
                                 data=json.dumps({"idempotency_key": str(_uuid.uuid4())}).encode())
    try:
        with urllib.request.urlopen(req, timeout=30):
            pass  # file d'attente remplie : on ne lit pas le flux
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Kronn a refusé /discussions/{res['id']}/run ({e.code}) : {e.read()[:300].decode(errors='replace')}")
    except OSError as e:
        raise RuntimeError(f"Kronn injoignable (/discussions/{res['id']}/run) : {e}")
    return res["id"]

def is_bureau(wf):
    return wf.get("id") in BUREAU_IDS


def is_bureau_disc(d):
    """Discussions ouvertes par le Bureau : bouton « interroger » (Quick Prompt du Bureau, son nom en titre : une
    discussion ne porte pas l'id de son Quick Prompt), le canard (titre « 🦆 … », duck_start.py) et les investigations du
    Support (« 🎧 … », support.py, #62 : l'agent Support y travaille). Pas des visiteurs."""
    return str(d.get("title") or "").startswith(("Le Bureau", "🦆", "🎧"))


def model_short(m):
    m = (m or "").lower()
    for k, v in (("opus", "Opus"), ("sonnet", "Sonnet"), ("haiku", "Haiku"), ("gpt", "GPT"), ("gemini", "Gemini"), ("codex", "Codex")):
        if k in m:
            return v
    return (m.split(" ")[0][:14]) if m else None


def _dig(v):
    if isinstance(v, str):
        t = v.strip()
        if t.startswith("{"):
            try:
                return _dig(json.loads(t))
            except ValueError:
                pass
        return t.splitlines()[-1] if t else ""
    if isinstance(v, dict):
        d = v.get("data") if isinstance(v.get("data"), dict) else v
        for k in ("error", "message", "stderr", "stdout"):
            if d.get(k):
                r = _dig(d[k])
                if r:
                    return r
        return v.get("summary") or ""
    return ""


def err_of(step):
    """Message d'erreur lisible d'une étape : le JSON de sa sortie (error, message, stderr…), sinon sa première ligne."""
    out = step.get("output") or ""
    head = out.split("---STEP_OUTPUT---")[0].strip()
    body = out.split("---STEP_OUTPUT---")[1].split("---END_STEP_OUTPUT---")[0] if "---STEP_OUTPUT---" in out else ""
    msg = _dig(body) if body.strip() else ""
    if not msg or msg.startswith("exit "):
        msg = (msg + " " if msg else "") + head.splitlines()[0] if head else msg
    msg = re.split(r"\s+[—-]\s+\{", msg)[0]
    return re.sub(r"\s+—\s+", " · ", msg).strip()[:240]


def step_row(s):
    """Étape d'un run, au format de la page : nom, type, statut, début, durée, tokens, erreur, agent, modèle, outil."""
    st = {"n": s["step_name"], "k": s.get("step_kind"), "s": s["status"], "at": s.get("started_at"),
          "ms": int(s.get("duration_ms") or 0), "tok": int(s.get("tokens_used") or 0)}
    if s["status"] not in ("Success", "Skipped"):
        st["err"] = err_of(s)
    if s.get("step_agent"):
        st["ag"] = s["step_agent"]
    if s.get("step_model"):
        st["md"] = model_short(s["step_model"])
    la = s.get("last_activity") or {}
    if la.get("tool"):
        st["act"] = {"t": la["tool"], "x": (la.get("target") or "")[-70:], "at": la.get("at")}
    return st


TICKET_WF = str((CFG.get("models") or {}).get("ticket") or "")  # créer un ticket (#77) : son dernier ticket sur la fiche


def run_res(wf, r):
    """Ticket créé par un run réussi du modèle ticket (#77) : {key, url, title, meta} écrit par son étape resultat. La
    liste des runs ne porte pas les sorties : lu dans le détail du run (quelques runs par jour), en JSON non strict (une
    sortie d'étape peut porter des caractères de contrôle bruts)."""
    if not TICKET_WF or wf.get("id") != TICKET_WF or r.get("status") != "Success":
        return None
    try:
        with urllib.request.urlopen(f"{API}/workflows/{wf['id']}/runs/{r['id']}", timeout=60) as f:
            detail = json.loads(f.read(), strict=False)
        detail = detail.get("data", detail)
        out = next((s.get("output") or "" for s in detail.get("step_results") or [] if s.get("step_name") == "resultat"), "")
        body = out.split("---STEP_OUTPUT---")[1].split("---END_STEP_OUTPUT---")[0]
        res = json.loads(json.loads(body, strict=False)["data"]["stdout"])
    except Exception:
        return None
    return {k: str(res.get(k) or "")[:200] for k in ("key", "url", "title", "meta")} if res.get("key") else None


def run_row(wf, r):
    """Run au format de la page (même forme dans les instantanés office et live, que la page superpose)."""
    tc = r.get("trigger_context") if isinstance(r.get("trigger_context"), dict) else {}
    res = run_res(wf, r)
    return {"wf": wf["id"], "wf_name": wf["name"], "project": wf.get("project_name"), "trigger": wf.get("trigger_type"),
            "run": r["id"], "status": r["status"], "start": r.get("started_at"), "end": r.get("finished_at"),
            "tok": r.get("tokens_used") or 0, "parent": r.get("parent_run_id"), "tby": r.get("triggered_by_run_id"),
            "vars": {k: v for k, v in tc.items() if k in VARS_KEPT and isinstance(v, str) and len(v) < 80},
            "batch": [r.get("batch_total") or 0, r.get("batch_completed") or 0, r.get("batch_failed") or 0],
            "steps": [step_row(s) for s in r.get("step_results") or []],
            **({"man": 1} if tc.get("type") == "manual" else {}),  # lancé à la main (bouton du Bureau ou Kronn) : « Tu lances »
            **({"res": res} if res else {})}


def important_count(did):
    try:
        return int((get(f"/discussions/{did}/important") or {}).get("total") or 0)
    except Exception:
        return 0


def disc_row(d, projects=None):
    row = {"id": d["id"], "title": d["title"][:160], "agent": d.get("agent"), "participants": d.get("participants"),
           "msgs": d.get("non_system_message_count") or d.get("message_count"), "start": d["created_at"], "end": d["updated_at"],
           "awaiting": bool(d.get("awaiting_agent")), "pending": d.get("pending_question_count") or 0,
           "run": d.get("workflow_run_id"), "imp": important_count(d["id"])}
    if projects is not None:
        row["project"] = projects.get(d.get("project_id"))
    return row


# apparence d'un personnage (recette LPC) envoyée depuis la page : avatars personnalisés, agents ajoutés (#64)
_LOOK_WORD = re.compile(r"^[a-z0-9_/]{1,40}$")
_LOOK_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
_LOOK_COLORS = {"hair_color", "shirt", "legs_color", "shoes", "hat_color"}
_LOOK_WORDS = {"sex", "skin", "head", "hair", "beard", "torso", "legs", "hat", "glasses"}


def clean_look(look):
    """Apparence validée {calque: valeur} (valeurs vides retirées) ; ValueError si un champ est inconnu ou douteux."""
    if not isinstance(look, dict) or len(look) > 20:
        raise ValueError("apparence invalide")
    out = {}
    for a, v in look.items():
        if v in (None, ""):
            continue
        if a in _LOOK_COLORS and isinstance(v, str) and _LOOK_COLOR.match(v):
            out[a] = v.lower()
        elif a in _LOOK_WORDS and isinstance(v, str) and _LOOK_WORD.match(v):
            out[a] = v
        else:
            raise ValueError(f"champ {a!r} invalide")
    return out


def dumps(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


_PIL = """from PIL import Image
im = Image.open(A['src']).convert('RGB')
if A.get('crop'):
    x, y, w, h = A['crop']
    im = im.crop((x, y, x + w, y + h))
if A.get('size'):
    im = im.resize(tuple(A['size']), Image.LANCZOS)
elif A.get('fit'):
    im.thumbnail((A['fit'], A['fit']), Image.LANCZOS)
im.save(A['out'], 'JPEG', quality=A['q'])
"""


def jpeg(src, out, size=None, fit=None, crop=None, quality=80):
    """Image src -> JPEG out : crop (x, y, largeur, hauteur) d'abord, puis size (largeur, hauteur) exacte ou fit (côté
    max, sans agrandir). Pillow s'il est importable, sinon le Python du venv du dépôt (Kronn lance les scripts avec le
    python3 du système, souvent sans Pillow), sinon sips (macOS). True si out est écrit."""
    a = {"src": src, "out": out, "size": size, "fit": fit, "crop": crop, "q": quality}
    try:
        exec(_PIL, {"A": a})
        return _os.path.exists(out)
    except ImportError:
        pass
    except Exception:
        return False
    py = _os.path.join(ROOT, ".venv", "bin", "python") if ROOT else ""
    if py and _os.path.exists(py):
        try:
            r = _subprocess.run([py, "-c", "import json, sys\nA = json.loads(sys.argv[1])\n" + _PIL, json.dumps(a)],
                                stdout=_subprocess.DEVNULL, stderr=_subprocess.DEVNULL, timeout=60)
            if r.returncode == 0 and _os.path.exists(out):
                return True
        except Exception:
            pass
    if not _shutil.which("sips"):
        return False
    run = lambda *x: _subprocess.run(["sips", *x], stdout=_subprocess.DEVNULL, stderr=_subprocess.DEVNULL, timeout=30)
    cur = src
    if crop:
        x, y, w, h = crop
        cur = out + ".crop.png"
        run("-c", str(h), str(w), "--cropOffset", str(y), str(x), src, "--out", cur)
    scale = ["-z", str(size[1]), str(size[0])] if size else (["-Z", str(fit)] if fit else [])
    run("-s", "format", "jpeg", "-s", "formatOptions", str(quality), *scale, cur, "--out", out)
    return _os.path.exists(out)
