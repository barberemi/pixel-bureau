"""Purger le cache Fastly d'un service en soft purge, par surrogate key ou par URL, jamais tout le service.

  python3 -c <ce script> <service> <key|url> <valeur>

Réglage d'équipe fastly (settings.json du pack, ou la config) :
  {"services": ["hu.frigo.com", "fr.frigo.com", …]}
Chaque entrée est à la fois le nom du service Fastly et son domaine : aucun id de service n'est gardé, le CLI fastly le
retrouve par son nom (--service-name). Le jeton est celui du profil par défaut du CLI, jamais dans la config.
key : une surrogate key (« g-all ») ; url : un chemin (« /my-europe/… ») ou une URL complète du même domaine.
Garde-fous : --soft toujours (les objets sont marqués périmés, pas supprimés) ; jamais --all ; service du réglage seulement.
Codes de sortie (signaux exit_N de Kronn) : 2 service hors réglage, 3 type ou valeur refusés, 4 purge refusée par Fastly
ou CLI fastly introuvable.
"""
import re, shutil, subprocess, sys
from urllib.parse import urlsplit
from _lib import CFG

KEY_OK = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}")  # une seule surrogate key, sans espace


def fail(code, msg):
    print(msg)
    sys.exit(code)


def services(cfg):
    """Les services du réglage fastly (noms = domaines)."""
    return [s for s in ((cfg.get("fastly") or {}).get("services") or []) if isinstance(s, str) and s.strip()]


def target(service, kind, value):
    """(option du CLI, valeur) à purger, ou None si la valeur est refusée."""
    if kind == "key":
        return ("--key", value) if KEY_OK.fullmatch(value) else None
    if kind == "url":
        if re.search(r"\s", value) or not value:
            return None
        u = urlsplit(value if "://" in value else "https://" + service + ("" if value.startswith("/") else "/") + value)
        if u.scheme not in ("http", "https") or u.hostname != service or u.username or u.password:
            return None
        return "--url", f"https://{service}{u.path or '/'}" + (f"?{u.query}" if u.query else "")
    return None


def main(service, kind, value):
    if service not in services(CFG):
        fail(2, f"{service or '(aucun service)'} : hors du réglage fastly, rien n'est purgé.")
    t = target(service, kind, value)
    if not t:
        fail(3, f"{kind or '(aucun type)'} « {value} » refusé : une surrogate key, ou un chemin ou une URL de {service}.")
    cli = shutil.which("fastly")
    if not cli:
        fail(4, "CLI fastly introuvable : rien n'est purgé.")
    args = [cli, "purge", "--service-name", service, t[0], t[1], "--soft", "--non-interactive"]
    assert "--all" not in args
    r = subprocess.run(args, capture_output=True, text=True, timeout=60)
    out = (r.stdout + r.stderr).strip()
    if r.returncode:
        fail(4, f"Fastly refuse la purge de {t[1]} sur {service} : {out[:300]}")
    print(f"Soft purge de {'la clé' if kind == 'key' else 'l’URL'} {t[1]} sur {service} : faite.\n{out[:500]}")


if __name__ == "__main__":
    a = (sys.argv[1:] + ["", "", ""])[:3]
    main(a[0].strip(), a[1].strip(), a[2].strip())
