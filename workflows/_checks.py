"""Commandes de vérification d'un dépôt (impl.repos.<dépôt>.checks), communes à la chaîne d'implémentation (chaine.py) et
aux PR remises à jour ou corrigées depuis le Bureau (pr_update.py) : recopié dans le script à la place de sa ligne
« from _checks import … », sans dépendance au reste du Bureau.

Une commande : chaîne, ou {cmd, subdir} (chemins relatifs à ce sous-dossier, fichiers hors de lui écartés). Emplacements :
{worktree}, {main} (dossier du projet, ses dépendances), {base}, {files}, {php}, {ts}, {tests}, {tests_php}, {tests_ts}.
Une commande rouge est relancée sur le point de départ : déjà rouge pareil, ce n'est pas à corriger."""
import os, re, subprocess, time

CHECK_NEEDS = re.compile(r"\{(php|ts|tests|tests_php|tests_ts|files)\}")


def check_fill(check, files, wt, main="", base="main"):
    """La commande prête à lancer dans wt, et les fichiers par type."""
    cmd, sub = (check, "") if isinstance(check, str) else (check.get("cmd") or "", (check.get("subdir") or "").strip("/"))
    if sub:
        files = [f[len(sub) + 1:] for f in files if f.startswith(sub + "/")]
    files = [f for f in files if os.path.exists(os.path.join(wt, sub, f))]  # absents (supprimés, ou nouveaux au départ)
    kinds = {"files": files, "php": [f for f in files if f.endswith(".php")],
             "ts": [f for f in files if re.search(r"\.(ts|tsx|js|vue)$", f)],
             "tests": [f for f in files if re.search(r"(test|spec)", f, re.I)],
             "tests_php": [f for f in files if f.endswith("Test.php")],
             "tests_ts": [f for f in files if re.search(r"\.(test|spec)\.(ts|tsx|js)$", f)]}
    rep = {"worktree": wt, "main": main or "", "base": base or "main"}
    rep.update({k: " ".join(v) for k, v in kinds.items()})
    for k, v in rep.items():
        cmd = cmd.replace("{" + k + "}", v)
    return cmd, kinds


def check_norm(txt):
    """Lignes d'une sortie de vérification sans chiffres ni chemins de copie de travail : une erreur déjà là au départ
    se retrouve à l'identique, même décalée de quelques lignes."""
    out_ = set()
    for ln in (txt or "").splitlines():
        ln = re.sub(r"\x1b\[[0-9;]*m", "", ln)
        ln = re.sub(r"/\S*?/(?=application/|src/|tests/)", "", ln)
        ln = re.sub(r"\d+", "#", ln).strip(" -|─━═│┃")
        if len(ln) > 8 and not re.fullmatch(r"[#\s:.,/()%a-z]*", ln):
            out_.add(ln)
    return out_


def check_lance(cmd, cwd, timeout=900):
    try:
        r = subprocess.run(["sh", "-c", cmd], cwd=cwd, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout + r.stderr)
    except subprocess.TimeoutExpired:
        return 124, f"délai dépassé ({timeout // 60} min)"


def check_run(checks, files, wt, main="", base="main", depart=None, budget=None, timeout=900):
    """Lance les commandes dans wt : {ok, sorties[{cmd, code, sortie, deja_la, nouveau, saute}]}. depart() rend la copie
    du point de départ (ou None) pour relancer une commande rouge ; budget : secondes au plus pour l'ensemble, les
    commandes suivantes (et la relance au point de départ) sautées une fois dépassé ; timeout : par commande."""
    res, ok, t0 = [], True, time.time()
    for c in checks:
        raw = c if isinstance(c, str) else c.get("cmd") or ""
        need = CHECK_NEEDS.findall(raw)
        cmd, kinds = check_fill(c, files, wt, main, base)
        if need and not any(kinds[k] for k in need):
            res.append({"cmd": raw[:200], "saute": "aucun fichier concerné"})
            continue
        if budget and time.time() - t0 > budget:
            res.append({"cmd": raw[:200], "saute": "temps écoulé"})
            continue
        code, txt = check_lance(cmd, wt, timeout)
        item = {"cmd": raw[:200], "code": code, "sortie": txt[-6000:]}
        if code:  # rouge : est-ce déjà rouge au point de départ, sur les mêmes fichiers ?
            path = depart() if depart and not (budget and time.time() - t0 > budget) else None
            if path:
                bcmd, _ = check_fill(c, files, path, main, base)
                bcode, btxt = check_lance(bcmd, path, timeout)
                nouveaux = sorted(check_norm(txt) - check_norm(btxt))
                if bcode and not nouveaux:
                    item.update(code=0, deja_la=True, note="rouge, mais déjà rouge au point de départ : rien de nouveau")
                elif bcode:
                    item["nouveau"] = nouveaux[:60]
        ok = ok and not item["code"]
        res.append(item)
    return {"ok": ok, "sorties": res}
