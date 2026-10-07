"""Modèles des workflows et du Quick Prompt du Bureau (workflows/templates/*.json).

  python3 tools/templates.py export   # depuis le Kronn de bureau.config.json : valeurs de l'installation -> emplacements
  python3 tools/templates.py check    # le rendu avec bureau.config.json redonne exactement les workflows de ce Kronn
  python3 tools/templates.py render <clé>   # affiche le rendu d'un modèle (office, live, team, payroll, avatar, gate, relaunch, layout, ask, sketch)

Emplacements, remplacés au rendu :
  @@page_id@@, @@kronn.project_id@@, @@jira.config_id@@, @@jira.project@@, @@jira.board@@, @@jira.sprint_field@@,
  @@jira.points_fields@@ (liste jointe par des virgules), @@owner_name@@ (prénom du boss),
  @@script:workflows/x.py@@ (le script, config d'installation injectée comme le fait publish.py),
  @@text:tools/x.md@@ (le texte du fichier, tel quel), @@root@@ (dossier du dépôt de l'installation, pour les commandes d'un prompt).
Une étape marquée "_requires": "jira" disparaît au rendu si l'installation n'a pas de connexion Jira ; ses
références {{steps.<étape>.…}} dans l'entrée des étapes suivantes deviennent null.
Les noms des emplacements ne ressemblent pas aux variables Kronn ({{steps.x}}, {{run_id}}), qui restent intactes.
"""
import copy, json, os, re, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TPL_DIR = os.path.join(ROOT, "workflows", "templates")
sys.path.insert(0, os.path.join(ROOT, "tools"))
import assemble  # noqa: E402  (roster du profil d'équipe)
# modèle -> (type, où trouver l'id dans la config, scripts par étape)
TEMPLATES = {
    "office": ("workflow", ("workflows", "office"), {"snapshot": "workflows/office_snapshot.py"}),
    "live": ("workflow", ("workflows", "live"), {"snapshot": "workflows/live_snapshot.py", "gates": "workflows/gates_snapshot.py"}),
    "team": ("workflow", ("workflows", "team"), {"github": "workflows/github_snapshot.py", "shape": "workflows/team_shape.py", "since": "workflows/standup_since.py",
                                                    "planning_jql": "workflows/planning_jql.py"}),
    "payroll": ("workflow", ("workflows", "payroll"), {"payroll": "workflows/payroll_snapshot.py", "pages": "workflows/pages_snapshot.py", "gitfut": "workflows/gitfut_snapshot.py"}),
    "avatar": ("workflow", ("actions", "avatar"), {"save": "workflows/avatar_save.py"}),
    "gate": ("workflow", ("actions", "gate"), {"decide": "workflows/gate_decide.py"}),
    "relaunch": ("workflow", ("actions", "relaunch"), {"relaunch": "workflows/relaunch.py"}),
    "layout": ("workflow", ("actions", "layout"), {"save": "workflows/layout_save.py"}),
    "ask": ("quick_prompt", ("actions", "ask"), {}),
    "sketch": ("quick_prompt", ("actions", "sketch"), {}),
}
WF_KEYS = ("name", "project_id", "trigger", "variables", "steps", "actions", "safety", "workspace_config", "concurrency_limit", "exec_allowlist")
QP_KEYS = ("name", "icon", "prompt_template", "variables", "agent", "project_id", "skill_ids", "profile_ids", "directive_ids", "tier", "description")
TOKEN = re.compile(r"@@([a-z_.]+|(?:script|text):[\w/.]+)@@")
TEXTS = ("tools/plan_prompt.md",)  # fichiers recopiés tels quels dans un prompt (@@text:…@@)


def load_config():
    return json.load(open(os.path.join(ROOT, "bureau.config.json")))


def text_of(path):
    """Un fichier recopié dans un prompt : ni @@ ni {{ (Kronn y verrait ses variables)."""
    body = open(os.path.join(ROOT, path), encoding="utf-8").read()
    assert "@@" not in body and "{{" not in body, path + " : ni @@ ni {{"
    return body


def owner_name(cfg):
    p = next((x for x in assemble.roster(cfg) if x["key"] == cfg.get("owner")), None)
    return p["name"] if p else "le boss"


LIB_IMPORT = re.compile(r"^from (_lib|_plan) import [\w, ]+$", re.M)


def script_code(path, cfg):
    """Le script tel qu'il tourne dans Kronn (« python3 -c », sans fichier voisin) : workflows/_lib.py et _plan.py
    recopiés à la place de leur ligne « from _lib import … », puis la config d'installation injectée à la place de
    __BUREAU_CONFIG__."""
    code = open(os.path.join(ROOT, path)).read()

    def lib(m):
        body = open(os.path.join(ROOT, "workflows", m.group(1) + ".py")).read()
        assert "@@" not in body and "{{" not in body, m.group(1) + ".py : ni @@ ni {{ (Kronn rendrait ses propres variables)"
        return body
    code = LIB_IMPORT.sub(lib, code)
    c = {k: v for k, v in cfg.items() if not k.startswith("_")}
    c.update(gitfut=assemble.gitfut(cfg), wiki_posters=assemble.wiki_posters(cfg))  # déduits du roster (scripts sans accès au dépôt)
    blob = json.dumps(c, ensure_ascii=False)
    assert '"""' not in blob and "__BUREAU_CONFIG__" in code, path
    return code.replace("__BUREAU_CONFIG__", blob, 1)


ROLES = ("po", "sm", "qa")
# étapes du travail des rôles : retirées si personne n'a ce rôle (ou pas de compte Jira dans le roster)
WORK_REQUIRES = {"work_written": "jira.role_ids", "work_po_triage": "jira.role.po", "work_sm_triage": "jira.role.sm",
                 "work_qa_ok": "jira.role.qa", "work_qa_back": "jira.role.qa", "since": "jira",
                 "planning_jql": "jira"}
FLOW_DEFAULTS = assemble.JIRA_FLOW


def role_ids(role, cfg):
    """Compte Jira (jira_id du roster) de la première personne de ce rôle, sinon chaîne vide."""
    return next((p["jira_id"] for p in assemble.roster(cfg) if p.get("roleKind") == role and p.get("jira_id")), "")


def values(cfg):
    """Valeur de chaque emplacement pour une installation."""
    j = cfg.get("jira") or {}
    return {
        "page_id": cfg.get("page_id") or "",
        "kronn.project_id": (cfg.get("kronn") or {}).get("project_id") or "",
        "jira.config_id": j.get("config_id") or "",
        "jira.project": j.get("project") or "",
        "jira.board": str(j.get("board") or ""),
        "jira.sprint_field": j.get("sprint_field") or "",
        "jira.points_fields": ",".join(j.get("points_fields") or []),
        "owner_name": owner_name(cfg),
        "root": ROOT,
        # travail Jira des rôles sans tickets assignés (PO, SM, QA) : compte Jira de la première personne du rôle
        **{f"jira.role.{r}": role_ids(r, cfg) for r in ROLES},
        "jira.role_ids": ",".join(f'"{x}"' for r in ROLES for x in [role_ids(r, cfg)] if x),
        **{f"jira.flow.{k}": (j.get("flow") or {}).get(k) or v for k, v in FLOW_DEFAULTS.items()},
    }


# ---------- rendu ----------
def _sub(v, vals, cfg):
    if isinstance(v, str):
        def rep(m):
            k = m.group(1)
            if k.startswith("script:"):
                return script_code(k[7:], cfg)
            if k.startswith("text:"):
                return text_of(k[5:])
            if k not in vals:
                raise KeyError(f"emplacement inconnu : {k}")
            return vals[k]
        return TOKEN.sub(rep, v)
    if isinstance(v, list):
        return [_sub(x, vals, cfg) for x in v]
    if isinstance(v, dict):
        return {k: _sub(x, vals, cfg) for k, x in v.items()}
    return v


def render(tpl, cfg):
    """Modèle + config d'installation -> définition prête pour l'API Kronn (sans ids)."""
    d = copy.deepcopy(tpl["definition"])
    if tpl["kind"] == "workflow":
        has_jira = bool((cfg.get("jira") or {}).get("config_id"))
        vals = values(cfg)

        def ok(req):  # "jira" : connexion Jira ; "jira.role.qa", "jira.role_ids" : Jira et quelqu'un dans ce rôle
            return not req or (has_jira and (req == "jira" or bool(vals.get(req))))
        dropped = {s["name"] for s in d["steps"] if not ok(s.get("_requires"))}
        d["steps"] = [s for s in d["steps"] if s["name"] not in dropped]
        for s in d["steps"]:
            s.pop("_requires", None)
            for name in dropped:  # entrée d'une étape suivante qui lisait une étape retirée
                if isinstance(s.get("exec_stdin"), str):
                    s["exec_stdin"] = re.sub(r"\{\{steps\." + re.escape(name) + r"\.[\w.]+\}\}", "null", s["exec_stdin"])
    return _sub(d, values(cfg), cfg)


# ---------- export depuis un Kronn ----------
def _api(cfg):
    return cfg["kronn"]["api"].rstrip("/")


def fetch(kind, ident, cfg):
    if kind == "workflow":
        with urllib.request.urlopen(f"{_api(cfg)}/workflows/{ident}", timeout=30) as r:
            return json.load(r)["data"]
    with urllib.request.urlopen(f"{_api(cfg)}/quick-prompts", timeout=30) as r:  # pas de lecture par id : la liste
        body = json.load(r)
    return next(q for q in body.get("data", body) if q["id"] == ident)


def clean(kind, live):
    """Définition comparable : sans ids, dates, état ; étapes sans leur id."""
    keys = WF_KEYS if kind == "workflow" else QP_KEYS
    d = {k: copy.deepcopy(live.get(k)) for k in keys if k != "variables" or live.get(k) or kind != "workflow"}  # Kronn omet une liste vide
    if kind == "workflow":
        for s in d["steps"]:
            s.pop("id", None)
    return d


def templatize(key, kind, d, cfg):
    """Remplace les valeurs propres à l'installation par des emplacements (l'inverse de render)."""
    scripts = TEMPLATES[key][2]
    vals = values(cfg)
    j = cfg.get("jira") or {}

    def walk(v):
        if isinstance(v, str):
            for k, val in (("page_id", vals["page_id"]), ("jira.config_id", vals["jira.config_id"]),
                           ("kronn.project_id", vals["kronn.project_id"])):
                if val and v == val:
                    return f"@@{k}@@"
            if vals["jira.points_fields"]:
                v = v.replace(vals["jira.points_fields"], "@@jira.points_fields@@")
            if vals["jira.sprint_field"]:
                v = v.replace(vals["jira.sprint_field"], "@@jira.sprint_field@@")
            if j.get("project"):
                v = re.sub(r"\bproject = " + re.escape(j["project"]) + r"\b", "project = @@jira.project@@", v)
            if j.get("board") is not None:
                v = v.replace(f"/board/{j['board']}/", "/board/@@jira.board@@/")
            if '"roles":{' in v:  # entrée de shape : comptes des rôles
                for r in ROLES:
                    if vals[f"jira.role.{r}"]:
                        v = v.replace(f'"{r}":"{vals[f"jira.role.{r}"]}"', f'"{r}":"@@jira.role.{r}@@"')
            if "CHANGED" in v or "WAS" in v or "reporter in" in v:  # requêtes du travail des rôles
                if vals["jira.role_ids"]:
                    v = v.replace(f"reporter in ({vals['jira.role_ids']})", "reporter in (@@jira.role_ids@@)")
                for r in ROLES:
                    if vals[f"jira.role.{r}"]:
                        v = v.replace(f'BY "{vals[f"jira.role.{r}"]}"', f'BY "@@jira.role.{r}@@"')
                for k in FLOW_DEFAULTS:
                    v = re.sub(r'(FROM|TO|WAS) "' + re.escape(vals[f"jira.flow.{k}"]) + '"', lambda m: f'{m.group(1)} "@@jira.flow.{k}@@"', v)
            return v
        if isinstance(v, list):
            return [walk(x) for x in v]
        if isinstance(v, dict):
            return {k: walk(x) for k, x in v.items()}
        return v

    d = walk(d)
    if kind == "workflow":
        for s in d["steps"]:
            if s.get("api_plugin_slug") == "mcp-atlassian" or s["name"] in WORK_REQUIRES:
                s["_requires"] = WORK_REQUIRES.get(s["name"], "jira")
            path = scripts.get(s["name"])
            if not path:
                continue
            tok = f"@@script:{path}@@"
            if s.get("collect_api_data"):
                s["collect_api_data"]["sources"][0]["quick_exec"]["args"] = ["-c", tok]
            else:
                s["exec_args"] = ["-c", tok] + (s.get("exec_args") or [])[2:]
    else:
        name = vals["owner_name"]
        t = d["prompt_template"].replace(f"{name} te pose", "@@owner_name@@ te pose")
        for path in TEXTS:
            t = t.replace(text_of(path), f"@@text:{path}@@")
        d["prompt_template"] = t.replace(ROOT, "@@root@@")
    return {"kind": kind, "key": key, "definition": d}


def config_id(cfg, where):
    a, b = where
    return (cfg.get(a) or {}).get(b)


def load_templates():
    return {k: json.load(open(os.path.join(TPL_DIR, k + ".json"))) for k in TEMPLATES
            if os.path.exists(os.path.join(TPL_DIR, k + ".json"))}


def main():
    cfg = load_config()
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    if cmd == "export":
        os.makedirs(TPL_DIR, exist_ok=True)
        for key, (kind, where, _) in TEMPLATES.items():
            ident = config_id(cfg, where)
            if not ident:
                print(f"{key} : pas d'id dans la config, ignoré")
                continue
            t = templatize(key, kind, clean(kind, fetch(kind, ident, cfg)), cfg)
            json.dump(t, open(os.path.join(TPL_DIR, key + ".json"), "w"), ensure_ascii=False, indent=1)
            left = sorted(set(re.findall(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", json.dumps(t))))
            print(f"{key} : exporté" + (f" (ids restants : {left})" if left else ""))
    elif cmd == "check":
        bad = 0
        for key, tpl in load_templates().items():
            kind, where, _ = TEMPLATES[key]
            ident = config_id(cfg, where)
            if not ident or ident in (cfg.get("own") or []):
                print(f"--   {key} : " + ("pas installé" if not ident else f"workflow {ident[:8]} gardé tel quel, non comparé"))
                continue
            same = render(tpl, cfg) == clean(kind, fetch(kind, ident, cfg))
            bad += not same
            print(("ok   " if same else "DIFF ") + f"{key} : rendu {'identique au' if same else 'différent du'} workflow {ident[:8]}")
        sys.exit(1 if bad else 0)
    elif cmd == "render":
        print(json.dumps(render(load_templates()[sys.argv[2]], cfg), ensure_ascii=False, indent=1)[:4000])


if __name__ == "__main__":
    main()
