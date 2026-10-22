"""Mes todos : les tâches Kronn du boss taguées « bureau-todo », sur le tableau en liège de son bureau (page Le Bureau).

  python3 -c <script>        relevé (cron live, chaque minute) : le dataset todos
  python3 -c <script> save   stdin : le code copié par la page, « TODO1:<base64 de {at, ops}> » ; les changements sont
                             appliqués dans Kronn, puis relevé (workflow « Le Bureau · todos »)

Une todo = une tâche Kronn (/api/planning/tasks) : la retrouver, la reprendre ou la confier à un agent se fait aussi depuis
Kronn. Colonnes de la page : todo (statut todo), duck (in_progress : le canard y réfléchit dans une discussion liée),
done (faite aujourd'hui ou hier ; plus anciennes : dans Kronn seulement). Supprimer = archiver (rien n'est effacé).
ops (au plus MAX_OPS, appliquées dans l'ordre ; ids = ceux du dataset, jamais une tâche sans le tag) :
  {"op": "add", "key": <id temporaire de la page>, "title": "…", "priority": "high"|"normal"|"low", "to": colonne}
  {"op": "move", "id": <tâche>, "to": "todo"|"done"}
  {"op": "duck", "id": <tâche>}   discussion du canard ouverte sur la todo (open_duck), liée à la tâche, statut in_progress ;
                                  une tâche qui a déjà sa discussion n'en ouvre pas une seconde
  {"op": "delete", "id": <tâche>}
  ajout : idempotency_key « bureau-todo:<key> » (code relancé deux fois : une seule tâche).
Sortie : {generated_at, todos: [{id, ref, title, col, priority, disc, created, updated}], warnings}, au plus MAX_SHOWN.
Code illisible ou op invalide : rien n'est appliqué, le run échoue. Refus de Kronn en cours de route : le run échoue après
avoir dit ce qui est déjà fait (le relevé suivant du cron live montre l'état réel).
"""
import base64, json, re, sys, urllib.error
from datetime import datetime, timedelta, timezone
from _lib import TZ, dumps, get, open_duck, send

TAG = "bureau-todo"
MAX_OPS, MAX_TITLE, MAX_SHOWN = 50, 200, 120
COLS = {"todo": "todo", "in_progress": "duck", "done": "done"}  # statut Kronn -> colonne ; idea et blocked : à faire
PRIORITIES = {"high": "high", "critical": "high", "normal": "normal", "low": "low"}
ACTOR = {"kind": "human", "id": "bureau"}


def fail(msg):
    print("Code todos refusé : " + msg, file=sys.stderr)
    sys.exit(1)


def tasks():
    """Les tâches du tag, toutes pages (curseur de Kronn, 100 au plus par page) ; Kronn n'y met pas les archivées."""
    out, cursor = [], None
    for _ in range(20):
        try:
            page = get(f"/planning/tasks?tag={TAG}&limit=100" + (f"&cursor={cursor}" if cursor is not None else "")) or {}
        except urllib.error.HTTPError as e:
            if e.code == 404:  # Kronn sans tâches (avant 0.11) : pas de todos, rien ne casse
                return []
            raise
        out += page.get("items") or []
        cursor = page.get("next_cursor")
        if cursor is None:
            break
    return out


def snapshot(warnings=()):
    """Le dataset todos : à faire et avec le canard, puis faites depuis hier (heure du bureau), les plus récentes d'abord."""
    since = (datetime.now(TZ).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=1)).astimezone(timezone.utc).isoformat()
    rows = []
    for t in tasks():
        st = t.get("status")
        if st == "archived" or (st == "done" and str(t.get("updated_at") or "") < since):
            continue
        rows.append({"id": t["id"], "ref": t.get("reference"), "title": str(t.get("title") or "")[:MAX_TITLE], "col": COLS.get(st, "todo"),
                     "priority": PRIORITIES.get(t.get("priority"), "normal"), "disc": (t.get("discussion_ids") or [None])[-1],
                     "rank": t.get("rank"), "created": t.get("created_at"), "updated": t.get("updated_at")})
    # à faire et canard : l'ordre de Kronn (rank), puis la date de création ; faites : les plus récentes d'abord
    opened = sorted((r for r in rows if r["col"] != "done"), key=lambda r: (r["col"] == "duck", r["rank"] or 0, str(r["created"] or "")))
    rows = opened + sorted((r for r in rows if r["col"] == "done"), key=lambda r: str(r["updated"] or ""), reverse=True)
    for r in rows:
        r.pop("rank", None)
    return {"generated_at": datetime.now(timezone.utc).isoformat(), "todos": rows[:MAX_SHOWN], "warnings": list(warnings)}


def read_code(raw):
    m = re.search(r"TODO1:([A-Za-z0-9+/=_-]+)", raw or "")
    if not m:
        fail("colle le code complet copié depuis la page (il commence par TODO1:)")
    try:
        b64 = m.group(1).replace("-", "+").replace("_", "/")
        req = json.loads(base64.b64decode(b64 + "=" * (-len(b64) % 4)).decode("utf-8"))
    except Exception:
        fail("code illisible, recopie-le depuis la page")
    ops = req.get("ops") if isinstance(req, dict) else None
    if not isinstance(ops, list) or not ops:
        fail("aucun changement dans ce code")
    if len(ops) > MAX_OPS:
        fail(f"trop de changements d'un coup (au plus {MAX_OPS}) : enregistre en plusieurs fois")
    return ops


def check(ops, mine):
    """Toutes les ops validées avant d'en appliquer une seule. mine : id -> tâche du tag."""
    for i, o in enumerate(ops, 1):
        kind = o.get("op") if isinstance(o, dict) else None
        if kind == "add":
            title = o.get("title")
            if not isinstance(title, str) or not title.strip() or len(title) > MAX_TITLE:
                fail(f"changement {i} : titre vide ou trop long (au plus {MAX_TITLE} caractères)")
            if not isinstance(o.get("key"), str) or not re.fullmatch(r"[\w-]{4,40}", o["key"]):
                fail(f"changement {i} : identifiant temporaire invalide")
            if o.get("priority", "normal") not in ("high", "normal", "low") or o.get("to", "todo") not in ("todo", "done", "duck"):
                fail(f"changement {i} : priorité ou colonne inconnue")
        elif kind in ("move", "duck", "delete"):
            if o.get("id") not in mine:
                fail(f"changement {i} : cette todo n'existe pas (ou plus) dans Kronn")
            if kind == "move" and o.get("to") not in ("todo", "done"):
                fail(f"changement {i} : colonne inconnue (todo ou done ; le canard : « Au canard »)")
        else:
            fail(f"changement {i} : opération inconnue")


def duck(task_id, title):
    did = open_duck(title)
    send("POST", f"/planning/tasks/{task_id}/discussions", {"discussion_id": did, "actor": ACTOR})
    send("PATCH", f"/planning/tasks/{task_id}", {"status": "in_progress", "actor": ACTOR})
    return did


def save(ops):
    mine = {t["id"]: t for t in tasks() if t.get("status") != "archived"}
    check(ops, mine)
    done = []
    try:
        for o in ops:
            kind = o["op"]
            if kind == "add":
                title = o["title"].strip()
                t = send("POST", "/planning/tasks", {"title": title, "status": "done" if o.get("to") == "done" else "todo",
                                                     "priority": o.get("priority", "normal"), "tags": [TAG],
                                                     "idempotency_key": "bureau-todo:" + o["key"], "actor": ACTOR})
                mine[t["id"]] = t
                if o.get("to") == "duck" and not t.get("discussion_ids"):
                    duck(t["id"], title)
                done.append(f"ajoutée : {title[:60]}")
            elif kind == "move":
                send("PATCH", f"/planning/tasks/{o['id']}", {"status": o["to"], "actor": ACTOR})
                done.append(f"{'faite' if o['to'] == 'done' else 'à faire'} : {mine[o['id']]['title'][:60]}")
            elif kind == "duck":
                t = mine[o["id"]]
                if t.get("discussion_ids"):
                    send("PATCH", f"/planning/tasks/{o['id']}", {"status": "in_progress", "actor": ACTOR})
                else:
                    duck(o["id"], t["title"])
                done.append(f"au canard : {t['title'][:60]}")
            else:
                send("PATCH", f"/planning/tasks/{o['id']}", {"status": "archived", "actor": ACTOR})
                done.append(f"supprimée : {mine[o['id']]['title'][:60]}")
    except RuntimeError as e:
        print((("Déjà fait : " + " ; ".join(done) + "\n") if done else "") + f"Arrêt : {e}", file=sys.stderr)
        sys.exit(1)
    print("\n".join(done), file=sys.stderr)


if __name__ == "__main__":
    if sys.argv[1:2] == ["save"]:
        save(read_code(sys.stdin.read()))
    print(dumps(snapshot()))
