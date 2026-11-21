# Définitions complètes des workflows, en cache disque 10 min (#17) : la liste /workflows n'a pas de date de modification,
# sans cache c'est un GET par workflow à chaque passage. Partagé par gates_snapshot (chaque minute : étapes, variables)
# et office_snapshot (toutes les 10 min : la planification des crons). Fichier hors du dépôt ; illisible ou absent :
# relecture de l'API. Recopié dans le script au rendu (tools/templates.py), comme _lib.
import os as _os3
from datetime import datetime as _dt3, timezone as _tz3
from _lib import get, read_json, write_json

DEFS_CACHE = _os3.path.join(_os3.path.expanduser("~"), ".cache", "pixel-bureau", "workflow_defs.json")
DEFS_TTL = 600
DEFS_KEYS = ("steps", "variables", "trigger")
_defs_now = _dt3.now(_tz3.utc).timestamp()
try:
    _defs_cache = read_json(DEFS_CACHE)
    if not isinstance(_defs_cache, dict):
        _defs_cache = {}
except Exception:
    _defs_cache = {}


def definition(wid):
    """Étapes, variables et déclencheur du workflow, depuis le cache s'il a moins de DEFS_TTL secondes, sinon l'API."""
    c = _defs_cache.get(wid)
    if isinstance(c, dict) and _defs_now - c.get("at", 0) < DEFS_TTL and all(k in (c.get("def") or {}) for k in DEFS_KEYS):
        return c["def"]
    full = get(f"/workflows/{wid}")
    _defs_cache[wid] = {"at": _defs_now, "def": {k: full.get(k) for k in DEFS_KEYS}}
    return _defs_cache[wid]["def"]


def save_definitions():
    """Écrit le cache (les deux crons le partagent : on garde ce que l'autre a lu, sauf au-delà d'une heure). Un échec ne
    coûte qu'une relecture de l'API au passage suivant : rien de faux n'est publié."""
    try:
        _os3.makedirs(_os3.path.dirname(DEFS_CACHE), exist_ok=True)
        try:
            disk = read_json(DEFS_CACHE)
        except Exception:
            disk = {}
        merged = {**(disk if isinstance(disk, dict) else {}), **_defs_cache}
        write_json(DEFS_CACHE, {k: v for k, v in merged.items() if isinstance(v, dict) and _defs_now - v.get("at", 0) < 6 * DEFS_TTL})
    except Exception:
        pass
