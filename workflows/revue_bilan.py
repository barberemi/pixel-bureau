"""Page « Revue · bilan » : ce qu'on ne sait qu'après une revue de PR, 0 token (cron revue_bilan, toutes les heures).
La page lit aussi les lignes écrites à chaque revue (datasets reviews, review_meta, review_sessions) ; ce script ajoute :

  python3 -c <ce script> bilan        # stdout JSON du dataset revue_bilan

- la suite des bloquants, depuis l'historique des revues (review.historique, une passe par fichier) : les bloquants posés
  par chaque passe postée, et ce que la passe suivante en dit (suivi : corrigé, réfuté, toujours ouvert) ;
- par PR relue depuis JOURS : son état sur GitHub (ouverte, mergée, fermée), par gh. Pas de réactions ni de réponses :
  le compte qui poste les revues est aussi celui d'une personne (ses remarques à la main s'y mêlent) et le Bureau réagit
  lui-même aux réponses ;
- l'horaire du cron des revues (review.schedule, heures UTC) dit à l'heure du bureau, et les auteurs à qui la revue parle
  en pédagogue (review.pedago, logins GitHub).

  {generated_at, error, warnings, horaire, pedago, bloquants: {poses, repris, corriges, refutes, ouverts},
   prs: {"owner/dépôt#n": {poses, repris, corriges, refutes, ouverts, etat, merged_at}},
   merges: {relues, mergees, ouvertes, fermees}}

Une source en échec (gh absent, PR illisible) laisse un avertissement ; le reste est publié.
"""
import datetime, glob, json, os, re, subprocess, sys
from _lib import CFG, TZ, dumps

JOURS, MAX_PRS = 60, 80
warnings = []


def warn(msg):
    print("bureau : " + msg, file=sys.stderr)
    warnings.append(msg[:240])


def historique():
    return os.path.expanduser(str((CFG.get("review") or {}).get("historique") or "~/.local/share/pixel-bureau/revues"))


def passes(now):
    """L'historique : {(repo, pr): [passe postée, de la plus ancienne à la plus récente]} pour les PR relues depuis JOURS."""
    out = {}
    for path in sorted(glob.glob(os.path.join(historique(), "*", "pr-*", "*.json"))):
        try:
            with open(path, encoding="utf-8") as f:
                h = json.load(f)
        except (OSError, ValueError):
            continue
        if isinstance(h, dict) and h.get("postee") and h.get("repo") and h.get("pr"):
            out.setdefault((str(h["repo"]), int(h["pr"])), []).append(h)
    lim = (now - datetime.timedelta(days=JOURS)).isoformat(timespec="seconds").replace("+00:00", "Z")
    keep = {k: sorted(v, key=lambda h: str(h.get("at") or "")) for k, v in out.items() if max(str(h.get("at") or "") for h in v) >= lim}
    return dict(sorted(keep.items(), key=lambda kv: str(kv[1][-1].get("at") or ""), reverse=True)[:MAX_PRS])


def etat_suivi(s):
    e = str((s or {}).get("etat") or "").lower()
    return "corriges" if e in ("corrige", "corrigé") else "refutes" if e in ("refute", "réfuté") else "ouverts" if e else None


def suite(ps):
    """Les bloquants d'une PR : posés par ses passes, et ce que la passe suivante en dit."""
    c = {"poses": 0, "repris": 0, "corriges": 0, "refutes": 0, "ouverts": 0}
    for i, h in enumerate(ps):
        c["poses"] += len([b for b in (h.get("blockers") or []) if b])
        if i:
            for s in h.get("suivi") or []:
                k = etat_suivi(s) if isinstance(s, dict) else None
                if k:
                    c[k] += 1
                    c["repris"] += 1
    return c


def gh(args):
    r = subprocess.run(["gh", *args], capture_output=True, text=True, timeout=60)
    if r.returncode:
        raise RuntimeError((r.stderr or r.stdout).strip()[:200] or f"gh : code {r.returncode}")
    return json.loads(r.stdout or "null")


def github(repo, pr):
    """État de la PR sur GitHub."""
    v = gh(["pr", "view", str(pr), "-R", repo, "--json", "state,mergedAt"]) or {}
    return {"etat": str(v.get("state") or "").lower() or None, "merged_at": v.get("mergedAt") or None}


def horaire(schedule):
    """« 30 7,10,13,16,19 * * 1-5 » (heures UTC) -> « 8 h 30 · 11 h 30 · … · du lundi au vendredi » à l'heure du bureau."""
    parts = str(schedule or "").split()
    if len(parts) != 5 or not re.fullmatch(r"\d+", parts[0]) or not re.fullmatch(r"[\d,]+", parts[1]):
        return str(schedule or "")
    today = datetime.datetime.now(datetime.timezone.utc).replace(minute=int(parts[0]), second=0, microsecond=0)
    heures = [today.replace(hour=int(h)).astimezone(TZ) for h in parts[1].split(",") if int(h) < 24]
    txt = " · ".join(f"{d.hour} h{'' if not d.minute else ' %02d' % d.minute}" for d in heures)
    jours = {"1-5": "du lundi au vendredi", "*": "tous les jours", "0-6": "tous les jours"}.get(parts[4], "jours " + parts[4])
    return f"{txt}, {jours}"


def bilan():
    now = datetime.datetime.now(datetime.timezone.utc)
    rv = CFG.get("review") or {}
    data = {"generated_at": now.isoformat(timespec="seconds"), "error": None, "horaire": horaire(rv.get("schedule")),
            "pedago": [str(x) for x in (rv.get("pedago") or []) if x][:20]}
    hist = passes(now)
    tot = {"poses": 0, "repris": 0, "corriges": 0, "refutes": 0, "ouverts": 0}
    merges = {"relues": len(hist), "mergees": 0, "ouvertes": 0, "fermees": 0}
    prs, gh_ok = {}, True
    for (repo, pr), ps in hist.items():
        row = suite(ps)
        for k in tot:
            tot[k] += row[k]
        if gh_ok:
            try:
                row.update(github(repo, pr))
            except (OSError, RuntimeError, subprocess.TimeoutExpired, ValueError) as e:
                warn(f"revue_bilan : {repo}#{pr} illisible sur GitHub ({e})")
                gh_ok = not isinstance(e, OSError)  # gh absent : inutile d'essayer les suivantes
        e = row.get("etat")
        if e in ("merged", "open", "closed"):
            merges[{"merged": "mergees", "open": "ouvertes", "closed": "fermees"}[e]] += 1
        prs[f"{repo}#{pr}"] = row
    data.update(bloquants=tot, prs=prs, merges=merges, warnings=warnings)
    if not hist:
        data["error"] = "aucune revue postée dans l'historique (" + historique() + ")"
    print(dumps(data))


if __name__ == "__main__":
    {"bilan": bilan}[sys.argv[1]]()
