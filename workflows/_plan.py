"""Règles des plans de bureau (format bureau-layout/1) : sièges numérotés, attribution des places, validation.

Partagé par tools/plan.py (en local) et workflows/layout_save.py (dans Kronn, « python3 -c » sans fichier voisin :
tools/templates.py recopie ce fichier à la place de la ligne qui l'importe, comme _lib.py).
Bibliothèque standard seulement ; ni accolades doubles ni arobases doubles (Kronn les rendrait).
"""
from collections import deque

FORMAT = "bureau-layout/1"
KINDS = {"wall", "glass", "carpet", "tiles", "server", "carpetB", "stage", "wc", "wood", "mat"}
MIN_SIZE, MAX_SIZE, MAX_BYTES = (20, 12), (80, 40), 64 * 1024
# zones de la machine à états (35-state.js) : sans elles, un personnage n'a nulle part où aller et disparaît
ZONES_ESSENTIAL = {"wc": 1, "srv": 1, "meet": 2, "coffee": 1, "daily": 1}
ZONES_BOSS = {"boss": 1, "gate": 1, "kanban": 1, "sax": 1}
# facultatives : sans elles, les personnages se replient sur une autre zone (ZONE_FALLBACK de 35-state.js)
ZONES_OPTIONAL = ("stage", "stageout", "stagesax", "sofa", "ktable", "cooler", "copier")
# catalogue des meubles (le même que FURN_TYPES de 40-furniture.js, vérifié par tests/test_plan.py) : type -> cases bloquées, relatives à `at`
FURNITURE = {"boss_desk": [], "meeting_table": [[i, 0] for i in range(7)], "server_rack": [[0, 0]], "counter": [[i, 0] for i in range(6)],
             "fridge": [[0, 0]], "kitchen_table": [[0, 0], [1, 0]], "sofa": [], "water_cooler": [[0, 0]], "copier": [[0, 0]],
             "toilets": [[4, 0]], "stage_closure": []}
WALL_DECOR = ("whiteboard", "mirror", "sign")
DIRS = {"up", "down", "left", "right"}
OBJECTS = ("tv", "kanban", "planning", "paie", "emp")


def seats_of(L):
    """Sièges des îlots, numérotés de gauche à droite : [{id, x, y, dir}] (côté L = à gauche de la table)."""
    out = []
    for i, cx in enumerate(L["islands"]["x"], 1):
        for k, r in enumerate(L["islands"]["rows"], 1):
            out.append({"id": f"I{i}.L{k}", "x": cx - 1, "y": r, "dir": "right"})
            out.append({"id": f"I{i}.R{k}", "x": cx + 1, "y": r, "dir": "left"})
    return out


def seat_ref(seats, ref):
    """Siège désigné par son numéro (« I2.R2 ») ou, ancien format, par ses coordonnées [x, y] ; None s'il n'existe pas."""
    if isinstance(ref, str):
        return next((t for t in seats if t["id"] == ref), None)
    if isinstance(ref, list) and len(ref) == 2:
        return next((t for t in seats if [t["x"], t["y"]] == ref), None)
    return None


def assign(L, people, owner=None):
    """Qui s'assoit où : même règle que 10-world.js (vérifié par tests/layout.test.js). people : roster puis agents,
    dans l'ordre du casting ({key, seat?}). Le plan est maître (seating), puis la place de la personne si c'est un siège
    libre du plan, puis un siège libre : ordinaire, puis réservé à un absent, enfin une place d'intérimaire (free_seats).
    Renvoie ({clé: numéro de siège}, places des intérimaires dans l'ordre) ; la place du boss lui est comptée mais libérée."""
    seats = seats_of(L)
    keys = {p["key"] for p in people}
    got, taken = {}, set()

    def give(k, t):
        got[k] = t
        taken.add(t["id"])
    seating = list((L.get("seating") or {}).items())
    for sid, k in seating:
        t = seat_ref(seats, sid)
        if t and t["id"] not in taken and k not in got and k in keys:
            give(k, t)
    for p in people:
        if p["key"] not in got:
            t = seat_ref(seats, p.get("seat"))
            if t and t["id"] not in taken:
                give(p["key"], t)
    free = [t for t in (seat_ref(seats, f) for f in L.get("free_seats") or []) if t]
    reserved = {sid for sid, _ in seating}
    spare = [t for t in seats if t["id"] not in taken and t not in free and t["id"] not in reserved]
    spare += [t for t in seats if t["id"] not in taken and t not in free and t["id"] in reserved]
    spare += [t for t in free if t["id"] not in taken]
    for p in people:
        if p["key"] not in got and spare:
            give(p["key"], spare.pop(0))
    boss = got.pop(owner, None)
    rest = [t for t in seats if t["id"] not in taken and t not in free]
    temps = free + ([boss] if boss and boss not in free else []) + rest
    return {k: t["id"] for k, t in got.items()}, [t["id"] for t in temps]


def validate(L, raw_size=0):
    """(erreurs, avertissements) : messages en français avec les coordonnées [x,y] en cause. Un plan mal formé (clé
    de type inattendu, coordonnée incomplète, brouillon d'un modèle) donne une erreur, jamais une exception."""
    try:
        return _validate(L, raw_size)
    except (AttributeError, IndexError, KeyError, TypeError, ValueError) as e:
        return [f"structure inattendue ({type(e).__name__} : {e}) : compare avec un plan de layouts/"], []


def _validate(L, raw_size):
    err, warn = [], []
    E, Wn = err.append, warn.append
    if L.get("format") != FORMAT:
        E(f"format : « {L.get('format')} » au lieu de « {FORMAT} »")
    try:
        cols, rows = L["size"]
        tiles, legend = L["tiles"], L["legend"]
    except (KeyError, TypeError, ValueError):
        return ["size, tiles et legend sont obligatoires"], []
    if not (MIN_SIZE[0] <= cols <= MAX_SIZE[0] and MIN_SIZE[1] <= rows <= MAX_SIZE[1]):
        E(f"taille {cols}x{rows} : entre {MIN_SIZE[0]}x{MIN_SIZE[1]} et {MAX_SIZE[0]}x{MAX_SIZE[1]}")
    if raw_size > MAX_BYTES:
        E(f"plan de {raw_size // 1024} Ko : 64 Ko au plus")
    if L.get("tile", 32) != 32:
        E("tile : 32 px (les sprites et les bulles sont calés dessus)")
    bad_kinds = sorted({v for v in legend.values() if v not in KINDS})
    if bad_kinds:
        E(f"legend : types inconnus {bad_kinds} (connus : {sorted(KINDS)})")
    if len(tiles) != rows:
        E(f"tiles : {len(tiles)} rangées pour une hauteur de {rows}")
    for y, row in enumerate(tiles):
        if len(row) != cols:
            E(f"tiles, rangée {y} : {len(row)} cases pour une largeur de {cols}")
        for x, ch in enumerate(row):
            if ch not in legend:
                E(f"tiles [{x},{y}] : caractère « {ch} » absent de legend")
    if err:
        return err, warn

    kind = lambda x, y: legend[tiles[y][x]] if 0 <= x < cols and 0 <= y < rows else None  # noqa: E731
    floor = lambda x, y: kind(x, y) not in (None, "wall", "glass")  # noqa: E731
    exit_ = tuple(L.get("exit") or ())
    doors = {tuple(d) for d in L.get("doors") or []}
    for x in range(cols):  # les deux rangées du haut : mur du fond (fenêtres, guirlande, décor mural)
        for y in (0, 1):
            if floor(x, y):
                E(f"[{x},{y}] : les rangées 0 et 1 sont le mur du fond, pas du sol")
        if floor(x, rows - 1):
            E(f"[{x},{rows - 1}] : la dernière rangée est un mur")
    for y in range(rows):
        for x in (0, cols - 1):
            if floor(x, y) and (x, y) not in doors and (x, y) != exit_:
                E(f"[{x},{y}] : sol sur le bord du plan (seules la sortie et ses portes y sont permises)")
    if len(exit_) != 2 or not floor(*exit_) or not (exit_[0] in (0, cols - 1) or exit_[1] in (0, rows - 1)):
        E(f"exit {list(exit_)} : une case de sol sur le bord du plan")
    for d in sorted(doors):
        if not floor(*d):
            E(f"porte {list(d)} : pas sur du sol")
    for c in L.get("closable") or []:
        if tuple(c.get("at") or ()) not in doors or kind(*c["at"]) != "stage" or c.get("when") != "stage_closed":
            E(f"closable {c.get('at')} : une porte en sol « stage », fermée quand le plateau est fermé (when: stage_closed)")

    seats = seats_of(L)
    boss = L.get("boss") or {}
    if not (isinstance(boss.get("seat"), list) and len(boss["seat"]) == 2 and boss.get("desk")):
        E("boss : seat [x, y] et desk [[x, y], …] obligatoires (la page place le boss et ses validations à son bureau)")
        boss = {}
    seat_tiles = {(s["x"], s["y"]) for s in seats} | ({tuple(boss["seat"])} if boss.get("seat") else set())
    blocked = {(cx, r) for cx in L["islands"]["x"] for r in L["islands"]["rows"]}
    blocked |= {tuple(p) for p in (boss.get("desk") or []) + (L.get("blocked") or []) + (L.get("plants") or [])}
    for f in L.get("furniture") or []:
        if f.get("type") not in FURNITURE:
            E(f"meuble « {f.get('type')} » inconnu (catalogue : {', '.join(FURNITURE)})")
            continue
        blocked |= {(f["at"][0] + dx, f["at"][1] + dy) for dx, dy in FURNITURE[f["type"]]}
    for d in L.get("wall") or []:
        if d.get("type") not in WALL_DECOR:
            E(f"décor mural « {d.get('type')} » inconnu ({', '.join(WALL_DECOR)})")
        elif floor(*d["at"]):
            E(f"décor mural « {d['type']} » {d['at']} : sur du sol, il faut un mur")
    if L.get("clock") and floor(*L["clock"]):
        E(f"horloge {L['clock']} : sur du sol, il faut un mur")
    for lab in L.get("labels") or []:
        if not (0 <= lab["at"][0] <= cols and 0 <= lab["at"][1] <= rows):
            E(f"nom de pièce « {lab.get('text')} » hors du plan")
    for x, y in sorted(blocked | seat_tiles):
        if not floor(x, y):
            E(f"[{x},{y}] : table, siège, meuble ou plante hors du sol")
    for d in sorted(doors & blocked):
        E(f"porte {list(d)} bloquée par un meuble")
    if not seats:
        E("aucun îlot : il faut des sièges")

    # parcours depuis la sortie, comme findPath : sol, hors meubles et hors sièges (portes refermables ouvertes)
    walk = lambda x, y: floor(x, y) and (x, y) not in blocked and (x, y) not in seat_tiles  # noqa: E731
    reached, q = set(), deque()
    if len(exit_) == 2 and walk(*exit_):
        reached.add(exit_)
        q.append(exit_)
    while q:
        x, y = q.popleft()
        for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if n not in reached and walk(*n):
                reached.add(n)
                q.append(n)
    near = lambda x, y: (x, y) in reached or any(n in reached for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))  # noqa: E731
    for s in seats:
        aisle = (s["x"] - 1, s["y"]) if s["dir"] == "right" else (s["x"] + 1, s["y"])
        if aisle not in reached:
            E(f"siège {s['id']} [{s['x']},{s['y']}] : la case d'allée {list(aisle)} n'est pas accessible depuis la sortie")
    if boss.get("seat") and not near(*boss["seat"]):
        E(f"place du boss {boss['seat']} : inaccessible depuis la sortie")

    spots = L.get("spots") or {}
    need = dict(ZONES_ESSENTIAL, **ZONES_BOSS)
    for z, n in need.items():
        if len(spots.get(z) or []) < n:
            E(f"zone « {z} » : au moins {n} place(s)")
    for z in ZONES_OPTIONAL:
        if not spots.get(z):
            Wn(f"zone « {z} » absente : les personnages iront ailleurs (repli)")
    for z, lst in spots.items():
        seen = set()
        for p in lst:
            if len(p) != 3 or p[2] not in DIRS:
                E(f"zone « {z} » {p} : [x, y, orientation up|down|left|right]")
                continue
            t = (p[0], p[1])
            if t in seen:
                Wn(f"zone « {z} » : place {list(t)} en double")
            seen.add(t)
            if not floor(*t):
                E(f"zone « {z} » [{t[0]},{t[1]}] : pas sur du sol")
            elif t in blocked:
                E(f"zone « {z} » [{t[0]},{t[1]}] : sur un meuble")
            elif not near(*t):
                E(f"zone « {z} » [{t[0]},{t[1]}] : inaccessible depuis la sortie")
    seat_set = {(s["x"], s["y"]) for s in seats}
    for p in L.get("free_seats") or []:
        if tuple(p) not in seat_set:
            E(f"free_seats {p} : n'est pas un siège d'îlot")
    seating = L.get("seating") or {}
    if not isinstance(seating, dict):
        E("seating : un objet {numéro de siège: clé du personnage}")
        seating = {}
    ids = {s["id"] for s in seats}
    for sid, k in seating.items():
        if sid not in ids:
            E(f"seating « {sid} » : pas un siège de ce plan (python3 tools/plan.py seats)")
        if not isinstance(k, str) or not k:
            E(f"seating « {sid} » : la clé du personnage (ex. p_remi) est attendue")
    dup = sorted({k for k in seating.values() if list(seating.values()).count(k) > 1})
    for k in dup:
        E(f"seating : « {k} » a plusieurs sièges")
    for x in L.get("windows") or []:
        if not 0 <= x < cols - 1:
            E(f"fenêtre en x={x} : hors du mur du fond")
    W, H = cols * 32, rows * 32
    for k in OBJECTS:
        o = (L.get("objects") or {}).get(k)
        if not o:
            E(f"objet « {k} » manquant ({', '.join(OBJECTS)})")
        elif not (0 <= o["x"] and 0 <= o["y"] and o["x"] + o["w"] <= W and o["y"] + o["h"] <= H):
            E(f"objet « {k} » hors du plan")
    for r in L.get("light_rooms") or []:
        if not (0 <= r[0] <= r[2] < cols and 0 <= r[1] <= r[3] < rows):
            E(f"pièce éclairée {r} : hors du plan")
    return err, warn
