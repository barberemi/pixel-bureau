"""La CI de main avant de publier (#39) : publish.py et upgrade.py regardent le dernier run « Tests » de main sur le commit
qu'on publie. Une page publiée depuis un main rouge, ou dont les tests ne sont pas finis, part en ligne cassée.

  ci_state() -> (état, message) : « ok » (vert), « warn » (on publie en le disant), « stop » (refusé sans --sans-ci).

Rouge ou en cours : refusé. Le reste n'est qu'un avertissement : sans gh ni dépôt git (un collègue sans GitHub), sur une
autre branche que main, un commit pas encore poussé, un run annulé (un push plus récent l'a remplacé : main pas à jour),
des modifications non commitées.
"""
import json, os, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKFLOW = "tests.yml"
OVERRIDE = "--sans-ci"


def _out(cmd, run):
    """Sortie de la commande (dans le dépôt), None si elle échoue ou n'existe pas."""
    try:
        r = run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.SubprocessError):
        return None
    return r.stdout.strip() if r.returncode == 0 else None


def ci_state(run=subprocess.run):
    head = _out(["git", "rev-parse", "HEAD"], run)
    if not head:
        return "warn", "pas un dépôt git : CI de main non vérifiée"
    branch = _out(["git", "rev-parse", "--abbrev-ref", "HEAD"], run) or "?"
    dirty = [l for l in (_out(["git", "status", "--porcelain", "--untracked-files=no"], run) or "").splitlines() if l.strip()]
    raw = _out(["gh", "run", "list", "--branch", "main", "--workflow", WORKFLOW, "--limit", "20",
                "--json", "headSha,status,conclusion"], run)
    try:
        runs = json.loads(raw) if raw else None
    except ValueError:
        runs = None
    if not isinstance(runs, list):
        return "warn", "gh indisponible (absent ou non connecté) : CI de main non vérifiée"
    mine = next((r for r in runs if isinstance(r, dict) and r.get("headSha") == head), None)
    extra = f" ; {len(dirty)} fichier(s) modifié(s) non commité(s) publié(s) tel(s) quel(s)" if dirty else ""
    if not mine:
        if branch != "main":
            return "warn", f"branche {branch}, pas main : cet état n'est pas testé par la CI de main{extra}"
        return "warn", f"aucun run « Tests » de main sur {head[:7]} (pas encore poussé, ou main pas à jour){extra}"
    if mine.get("status") != "completed":
        return "stop", f"tests de main en cours sur {head[:7]} : attends qu'ils finissent"
    c = mine.get("conclusion")
    if c == "success":
        return ("warn" if dirty else "ok"), f"tests de main verts sur {head[:7]}{extra}"
    if c == "cancelled":
        return "warn", f"run de {head[:7]} annulé (un push plus récent l'a remplacé : main n'est sans doute pas à jour){extra}"
    return "stop", f"tests de main en échec ({c}) sur {head[:7]}"


def check(argv, say=print):
    """Affiche l'état ; True si on peut publier (vert, simple avertissement, ou --sans-ci passé)."""
    state, msg = ci_state()
    mark = {"ok": "✓", "warn": "⚠", "stop": "✗"}[state]
    say(f"{mark} CI : {msg}")
    if state == "stop" and OVERRIDE not in argv:
        say(f"  rien de publié ; {OVERRIDE} pour publier quand même")
        return False
    return True
