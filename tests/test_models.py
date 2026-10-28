"""Modèles incarnés par des agents, #78 (python3 -m unittest tests/test_models.py) : revue de PR (cron, sous-workflow, à
la demande), réestimer, issue GitHub, m'affecter et me désaffecter, rendus sans valeur d'installation ; étapes
facultatives ; boutons en repli quand tu n'as pas ton workflow ; personnages du pack qui les incarnent."""
import contextlib, copy, importlib, io, json, os, re, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import assemble, templates  # noqa: E402

BASE = json.loads(Path(os.path.join(ROOT, "tests", "fixtures", "bureau.config.json")).read_text())
TPL = templates.load_templates()
MODELS = ("review_child", "review_one", "review_cron", "estimate", "issue", "ticket", "assign", "unassign", "env", "deploy")
GH = "12121212-3434-5656-7878-909090909090"
CHILD = "abababab-0000-4000-8000-000000000001"
PAGE = "cdcdcdcd-0000-4000-8000-000000000002"


def cfg(**over):
    c = copy.deepcopy(BASE)
    c["jira"] = {**c["jira"], "config_id": "abcdefab-cdef-abcd-efab-cdefabcdefab", "points_fields": ["customfield_200", "customfield_100"],
                 "statuses": {"À faire": "todo", "En cours": "doing", "Bloqué": "doing", "Fini": "done"}}
    c["github"] = {**c.get("github", {}), "repo": "vance/frigo", "config_id": GH}
    c["models"] = {"review_child": CHILD}
    c.update(over)
    return c


def steps(key, c):
    return {s["name"]: s for s in templates.render(TPL[key], c)["steps"]}


class ModelsTest(unittest.TestCase):
    def test_rendered_without_placeholders_nor_reference_installation(self):
        c = cfg(review={"page_id": PAGE})
        for key in MODELS:
            out = json.dumps(templates.render(TPL[key], c), ensure_ascii=False)
            self.assertNotIn("@@", out, key)
            text = json.dumps(TPL[key], ensure_ascii=False)
            self.assertFalse(re.findall(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", text), key)  # aucun id Kronn
            self.assertFalse(re.findall(r"customfield_\d+|/Users/|/home/", text), key)  # ni champ Jira ni chemin d'une machine
            local = os.path.join(ROOT, "bureau.config.json")  # l'installation de référence, quand elle est là
            if os.path.exists(local):
                inst = json.loads(Path(local).read_text())
                for word in {(inst.get("github") or {}).get("repo", "").split("/")[0], (inst.get("jira") or {}).get("project"),
                             (inst.get("github") or {}).get("login")} - {"", None}:
                    self.assertFalse(re.search(r"\b" + re.escape(word) + r"\b", text), f"{key} : {word}, valeur de l'installation")

    def test_review_uses_the_kronn_github_connection_child_and_team_guidance(self):
        c = cfg(review={"guidelines": "Tutoie l'auteur.", "skill_ids": ["php", "custom-maison"], "repos": ["vance/api", "vance/frigo"]})
        child = steps("review_child", c)
        self.assertEqual(child["fetch_files"]["api_config_id"], GH)
        reason = child["reason"]
        self.assertIn("Tutoie l'auteur.", reason["prompt_template"])
        self.assertIn("Grille de revue de PR", reason["prompt_template"])  # tools/review_rubric.md recopié
        self.assertEqual(reason["skill_ids"], ["security", "testing", "php", "custom-maison"])
        self.assertIn("Le Bureau", child["post"]["api_body"]["body"])  # signature reconnue par skip_check
        self.assertIn("Review automatique", child["post"]["api_body"]["body"])
        cron = steps("review_cron", c)
        self.assertEqual(json.loads(cron["repos"]["json_data_payload"]), [{"repo": "vance/api"}, {"repo": "vance/frigo"}])
        self.assertEqual(cron["review_each"]["sub_workflow_id"], CHILD)
        self.assertEqual(steps("review_one", c)["review"]["sub_workflow_id"], CHILD)
        self.assertEqual(templates.render(TPL["review_cron"], c)["trigger"]["schedule"], templates.REVIEW_SCHEDULE)

    def test_without_recap_page_its_steps_go_and_jumps_follow(self):
        child = steps("review_child", cfg())
        for gone in ("build_row", "publish_reviews", "meta_row", "publish_meta"):
            self.assertNotIn(gone, child)
        self.assertEqual(child["reply"]["on_result"][0]["action"]["step_name"], "skip_note")  # au lieu de build_row
        self.assertNotIn("cost", steps("review_one", cfg()))
        with_page = steps("review_child", cfg(review={"page_id": PAGE}))
        self.assertEqual(with_page["publish_reviews"]["page_publish"]["page_id"], PAGE)
        self.assertIn(f"PAGE='{PAGE}'", steps("review_one", cfg(review={"page_id": PAGE}))["cost"]["exec_args"][1])

    def test_skipped_without_their_connection(self):
        no_gh = cfg(github={"repo": "vance/frigo"})
        for key in ("review_child", "review_one", "review_cron"):
            self.assertTrue(templates.skipped(key, no_gh), key)
            self.assertFalse(templates.skipped(key, cfg()), key)
        no_jira = cfg(jira={})
        for key in ("estimate", "assign", "unassign"):
            self.assertTrue(templates.skipped(key, no_jira), key)
        self.assertFalse(templates.skipped("issue", no_jira))

    def test_estimate_writes_the_board_points_field(self):
        s = steps("estimate", cfg())
        self.assertEqual(s["set_sp"]["api_body"], {"fields": {"customfield_200": "{{steps.sp_num.data.sp}}"}})
        self.assertEqual([v["name"] for v in templates.render(TPL["estimate"], cfg())["variables"]],
                         list(assemble.LAUNCH_VARS["estimate"].values()))  # le bouton Réestimer le lance sans renommage

    def test_assign_picks_the_transition_without_hardcoded_id(self):
        transitions = {"transitions": [{"id": "5", "to": {"name": "Bloqué", "statusCategory": {"key": "indeterminate"}}},
                                       {"id": "11", "to": {"name": "En cours", "statusCategory": {"key": "indeterminate"}}},
                                       {"id": "2", "to": {"name": "À faire", "statusCategory": {"key": "new"}}}]}
        for key, want in (("assign", "5"), ("unassign", "2")):  # « Bloqué » est aussi « doing » chez cette équipe
            ch = steps(key, cfg())["choose"]
            r = subprocess.run(["python3", *ch["exec_args"]], input=json.dumps(transitions), capture_output=True, text=True)
            self.assertEqual((r.returncode, r.stdout), (0, want), key)
            self.assertEqual(steps(key, cfg())["transition"]["api_body"]["bulkTransitionInputs"][0]["transitionId"], "{{steps.choose.data.stdout}}")
        ch = steps("assign", cfg(jira={**cfg()["jira"], "statuses": {"In Progress": "doing"}}))["choose"]
        r = subprocess.run(["python3", *ch["exec_args"]], input=json.dumps(transitions), capture_output=True, text=True)
        self.assertEqual(r.stdout, "5")  # aucun nom connu : la première de la bonne catégorie
        r = subprocess.run(["python3", *ch["exec_args"]], input=json.dumps({"transitions": []}), capture_output=True, text=True)
        self.assertEqual(r.returncode, 1)

    def test_move_goes_through_its_column_when_jira_has_no_direct_transition(self):
        """Déplacer un ticket : sans transition directe (Reopen -> To Review), un premier saut vers un statut de la même
        colonne (le principal d'abord), puis un second saut direct ; jamais par une autre colonne ; déjà arrivé : DEJA."""
        c = cfg(jira={**cfg()["jira"], "statuses": {"À faire": "todo", "En cours": "doing", "Bloqué": "doing", "Reopen": "doing",
                                                     "To Review": "review", "Fermé": "done"}})
        st = steps("move", c)
        tr = lambda *t: json.dumps({"transitions": [{"id": i, "to": {"name": n}} for i, n in t]})  # noqa: E731
        iss = lambda name: json.dumps({"fields": {"status": {"name": name}}})  # noqa: E731

        def choose(step, transitions, cur, want="To Review"):
            args = [a.replace("{{target_status}}", want) for a in st[step]["exec_args"]]
            r = subprocess.run(["python3", *args], input=transitions + "\n===SEP===\n" + iss(cur), capture_output=True, text=True)
            return r.returncode, r.stdout or r.stderr.strip()
        reopen = tr(("1", "Duplicate"), ("8", "Bloqué"), ("11", "En cours"), ("2", "Fermé"), ("4", "À faire"))
        self.assertEqual(choose("choose", reopen, "Reopen"), (0, "11"))  # En cours, le principal de la colonne, avant Bloqué
        self.assertEqual(choose("choose", tr(("21", "To Review"), ("4", "À faire")), "En cours"), (0, "21"))  # direct
        self.assertEqual(choose("choose", tr(("2", "Fermé"), ("4", "À faire")), "Reopen")[0], 1)  # jamais hors de la colonne
        self.assertEqual(choose("choose", reopen, "To Review"), (3, "DEJA"))  # code 3 : saut à « fin »
        self.assertEqual(choose("choose2", tr(("21", "To Review")), "En cours"), (0, "21"))  # second saut
        self.assertEqual(choose("choose2", reopen, "Reopen")[0], 1)  # le second saut ne fait jamais de détour
        self.assertEqual(choose("choose2", reopen, "To Review"), (3, "DEJA"))  # premier saut direct : saut à « fin »
        body = lambda n: st[n]["api_body"]["bulkTransitionInputs"][0]["transitionId"]  # noqa: E731
        self.assertEqual((body("transition"), body("transition2")), ("{{steps.choose.data.stdout}}", "{{steps.choose2.data.stdout}}"))
        self.assertTrue(st["choose2"]["exec_stdin"].endswith("{{steps.apres.data}}"))
        self.assertEqual(st["verifie"]["exec_stdin"], "{{steps.apres2.data}}")
        self.assertEqual(steps("move", cfg(jira={**cfg()["jira"], "statuses": {}}))["choose"]["exec_args"][3], "")  # sans réglage

    def test_move_to_doing_assigns_me_when_nobody_has_the_ticket(self):
        """Déplacer vers la colonne En cours : un ticket que personne n'a est affecté au compte de la connexion Jira (lu
        par /myself) avant la transition ; à moi ou à quelqu'un d'autre, ou vers une autre colonne : saut aux transitions."""
        c = cfg(jira={**cfg()["jira"], "statuses": {"À faire": "todo", "En cours": "doing", "Reopen": "doing", "To Review": "review"}})
        st = steps("move", c)
        self.assertEqual([s for s in st][:6], ["avant", "whoami", "qui", "affecte", "pris", "transitions"])
        self.assertIn("assignee", st["avant"]["api_query"]["fields"])
        self.assertEqual(st["qui"]["on_result"], [{"contains": "exit_3", "action": {"type": "Goto", "step_name": "transitions"}}])
        for n in ("choose", "choose2"):
            self.assertEqual(st[n]["on_result"], [{"contains": "exit_3", "action": {"type": "Goto", "step_name": "fin"}}])
        self.assertEqual(list(st)[-1], "fin")
        self.assertEqual(st["affecte"]["api_body"]["fields"]["assignee"]["accountId"], "{{steps.whoami.data.accountId}}")
        me = json.dumps({"accountId": "moi"})

        def qui(want, assignee=None, who=me, statuses=None):
            args = [a.replace("{{target_status}}", want) for a in (steps("move", cfg(jira={**c["jira"], "statuses": statuses}))
                                                                   if statuses is not None else st)["qui"]["exec_args"]]
            t = json.dumps({"fields": {"status": {"name": "À faire"}, "assignee": assignee}})
            r = subprocess.run(["python3", *args], input=who + "\n===SEP===\n" + t, capture_output=True, text=True)
            self.assertEqual(r.returncode, 0 if r.stdout == "AFFECTER" else 3, r.stdout)  # PASSE : code 3, le signal de Kronn
            return r.stdout
        self.assertEqual(qui("En cours"), "AFFECTER")
        self.assertEqual(qui("en cours"), "AFFECTER")  # casse ignorée
        self.assertEqual(qui("Reopen"), "AFFECTER")  # tout statut de la colonne En cours
        self.assertIn("PASSE", qui("En cours", {"accountId": "autre", "displayName": "Pam"}))  # jamais volé
        self.assertIn("PASSE", qui("En cours", {"accountId": "moi", "displayName": "Michael"}))  # déjà à moi
        self.assertIn("PASSE", qui("To Review"))  # autre colonne
        self.assertIn("PASSE", qui("En cours", who="{}"))  # compte inconnu
        self.assertIn("PASSE", qui("En cours", statuses={}))  # sans jira.statuses
        pris = lambda got: subprocess.run(["python3", *st["pris"]["exec_args"]], input=me + "\n===SEP===\n" + json.dumps(  # noqa: E731
            {"fields": {"assignee": {"accountId": got}}}), capture_output=True, text=True)
        self.assertEqual((pris("moi").returncode, pris("moi").stdout), (0, "affecte"))
        self.assertEqual(pris("autre").returncode, 0)  # course perdue : le déplacement continue

    def test_on_result_rules_only_match_kronn_signals(self):
        """Kronn ne compare on_result qu'aux lignes « [SIGNAL: …] » (OK, ERROR, exit_N, PARTIAL, PENDING), jamais au texte
        écrit par l'étape : une règle sur « DEJA » ou « PASSE » ne se déclenche jamais (move publié le 2026-10-28)."""
        for key, tpl in TPL.items():
            for s in (tpl.get("definition") or {}).get("steps") or []:
                for rule in s.get("on_result") or []:
                    self.assertRegex(rule["contains"], r"^(OK|ERROR|PARTIAL|PENDING|PAGINATION_TRUNCATED|exit_\d+|http_\d+)$",
                                     f"{key}.{s['name']}")

    def test_issue_finds_gh_and_its_recap_discussion_is_optional(self):
        s = steps("issue", cfg())
        self.assertNotIn("post", s)
        self.assertIn("vance/frigo", s["rediger"]["prompt_template"])  # dépôt par défaut : le dépôt principal
        self.assertIn("shutil.which('gh')", s["creer"]["exec_args"][1])
        self.assertIn("post", steps("issue", cfg(issue={"discussion": "dddddddd-0000-4000-8000-000000000003"})))

    def test_buttons_fall_back_to_the_models(self):
        c = cfg(models={"review_one": "aaaa0000-0000-4000-8000-000000000000", "estimate": "eeee0000-0000-4000-8000-000000000000"})
        c.pop("launch", None)
        ids = assemble.action_ids(c)
        self.assertEqual((ids["review"], ids["estimate"]), (c["models"]["review_one"], c["models"]["estimate"]))
        c["launch"] = {"review": "ffff0000-0000-4000-8000-000000000000"}
        self.assertEqual(assemble.action_ids(c)["review"], "ffff0000-0000-4000-8000-000000000000")  # ton workflow l'emporte
        self.assertIn('"review": true', assemble.build(demo=False, cfg={**c, "launch": {}}))

    def test_pack_persona_embodies_a_model(self):
        tmp = tempfile.mkdtemp()
        pack = os.path.join(tmp, "pack")
        import shutil
        shutil.copytree(os.path.join(ROOT, "tests", "fixtures", "pack-exemple"), pack)
        Path(os.path.join(pack, "settings.json")).write_text(json.dumps({"agents": [
            {"key": "mose", "name": "Mose", "role": "Relit une PR", "model": "review_one"},
            {"key": "dwight", "name": "Dwight", "role": "Revue des PR", "model": ["review_cron", "review_child"]}]}))
        c = {**cfg(models={"review_one": "aaaa1111-0000-4000-8000-000000000000", "review_cron": "bbbb2222-0000-4000-8000-000000000000",
                           "review_child": CHILD}), "team": pack, "agents": [{"key": "dwight", "wf": ["99999999"]}]}
        a = assemble.merged(c)["agents"]
        self.assertEqual(a[0], {"key": "dwight", "name": "Dwight", "role": "Revue des PR", "wf": ["99999999"]})  # rattaché par la config
        self.assertEqual(a[1], {"key": "mose", "name": "Mose", "role": "Relit une PR", "wf": ["aaaa1111"]})  # d'office, par son modèle
        # un bouton des fiches aussi : workflow du Bureau (actions.rebase) ou le tien (launch.env), jamais proposé par l'installateur
        Path(os.path.join(pack, "settings.json")).write_text(json.dumps({"agents": [
            {"key": "jim", "name": "Jim", "role": "Remettre une PR à jour", "model": "rebase"},
            {"key": "kevin", "name": "Kevin", "role": "Env de branche", "model": "env"}]}))
        c = {**cfg(actions={"rebase": "cccc3333-0000-4000-8000-000000000000"}, launch={"env": {"wf": "dddd4444-0000-4000-8000-000000000000"}}),
             "team": pack, "agents": []}
        self.assertEqual([(x["key"], x["wf"]) for x in assemble.merged(c)["agents"]], [("jim", ["cccc3333"]), ("kevin", ["dddd4444"])])
        shutil.rmtree(tmp)

    def test_env_branch_model_relabels_the_pr_and_comes_from_the_team_pack(self):
        """Modèle env : label de l'équipe (env.label du pack, env-branch par défaut) en argument du script, jamais dans le
        code ; le bouton s'y rabat sans launch.env, avec le dépôt et le n° de la PR, sans variable action ; dépôts du pack."""
        tmp = tempfile.mkdtemp()
        pack = os.path.join(tmp, "pack")
        import shutil
        shutil.copytree(os.path.join(ROOT, "tests", "fixtures", "pack-exemple"), pack)
        self.assertEqual(steps("env", cfg())["relabel"]["exec_args"][-3:], ["{{pr_number}}", "{{repo}}", "env-branch"])
        Path(os.path.join(pack, "settings.json")).write_text(json.dumps({"env": {"label": "preview", "repos": ["vance/frigo", "vance/api"]}}))
        c = {**cfg(models={"env": "eeee1111-0000-4000-8000-000000000000"}), "team": pack}
        c.pop("launch", None)
        self.assertEqual(steps("env", c)["relabel"]["exec_args"][-1], "preview")
        self.assertEqual([v["name"] for v in templates.render(TPL["env"], c)["variables"]], ["pr_number", "repo"])
        self.assertEqual(assemble.action_ids(c)["env"], c["models"]["env"])
        html = assemble.build(demo=False, cfg=c)
        spec = json.loads(re.search(r'data-action-id="bureau-env">(.*?)</script>', html, re.S).group(1))
        self.assertEqual([v["name"] for v in spec["values"]], ["pr_number", "repo"])
        self.assertEqual(assemble.env_repos(c), ["vance/frigo", "vance/api"])
        self.assertFalse(templates.skipped("env", c))
        self.assertTrue(templates.skipped("env", cfg(github={})))  # aucun dépôt
        shutil.rmtree(tmp)

    def test_env_branch_script_relabels_without_failing_when_the_label_is_absent(self):
        """Le script : retrait du label sans erreur s'il est absent, puis ajout ; PR introuvable : code 2 (faux gh)."""
        tmp = tempfile.mkdtemp()
        log = os.path.join(tmp, "gh.log")
        Path(os.path.join(tmp, "gh")).write_text(f"""#!/bin/sh
echo "$*" >> {log}
case "$*" in *"--json number"*) [ "$3" = "404" ] && exit 1; exit 0 ;; *--remove-label*) exit 1 ;; *isDraft*) echo true ;; esac
exit 0
""")
        os.chmod(os.path.join(tmp, "gh"), 0o755)
        Path(os.path.join(tmp, "sleep")).write_text("#!/bin/sh\nexit 0\n")
        os.chmod(os.path.join(tmp, "sleep"), 0o755)
        args = steps("env", cfg())["relabel"]["exec_args"]
        env = {"PATH": tmp + ":/usr/bin:/bin"}
        r = subprocess.run(["bash", *args[:3], "12", "vance/frigo", "env-branch"], capture_output=True, text=True, env=env)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("env-branch reposé sur vance/frigo#12", r.stdout)
        self.assertIn("draft", r.stdout)
        calls = Path(log).read_text().splitlines()
        self.assertTrue(any("--remove-label env-branch" in c for c in calls) and any("--add-label env-branch" in c for c in calls))
        r = subprocess.run(["bash", *args[:3], "404", "vance/frigo", "env-branch"], capture_output=True, text=True, env=env)
        self.assertEqual(r.returncode, 2)
        import shutil
        shutil.rmtree(tmp)

    def test_deploy_model_targets_only_the_team_nonprod_envs(self):
        """Modèle deploy : dépôts et envs du réglage deploy (pack), workflow du réglage ou staging_workflow du dépôt ;
        bouton avec le n° de PR, le dépôt et l'env de la ligne actions.deploys ; rien sans dépôt réglé."""
        import shutil
        tmp = tempfile.mkdtemp()
        pack = os.path.join(tmp, "pack")
        shutil.copytree(os.path.join(ROOT, "tests", "fixtures", "pack-exemple"), pack)
        Path(os.path.join(pack, "settings.json")).write_text(json.dumps({"deploy": {"repos": {
            "vance/frigo": {"envs": {"dev": {"envchoice": "dev"}, "stg": {"envchoice": "stg"}}},
            "vance/api": {"workflow": "Deploy-NonProd.yml", "envs": {"dev": {"env": "dev"}}},
            "vance/sans": {"envs": {"dev": {}}}}}}))  # ni workflow ni staging_workflow : ignoré
        c = {**cfg(models={"deploy": "dddd1111-0000-4000-8000-000000000000"}), "team": pack}
        c["github"] = {**c["github"], "staging_workflow": "CD-NONPROD.yml"}
        self.assertEqual(assemble.deploy_envs(c), {"vance/frigo": ["dev", "stg"], "vance/api": ["dev"]})
        self.assertEqual(steps("deploy", c)["dispatch"]["exec_args"][-3:], ["{{repo}}", "{{pr_number}}", "{{env}}"])
        self.assertEqual([v["name"] for v in templates.render(TPL["deploy"], c)["variables"]], ["pr_number", "repo", "env"])
        html = assemble.build(demo=False, cfg=c)
        spec = json.loads(re.search(r'data-action-id="bureau-deploy">(.*?)</script>', html, re.S).group(1))
        self.assertEqual(spec["target_id"], c["models"]["deploy"])
        self.assertEqual([v["source_ref"] for v in spec["values"]], ["<page.dataset.actions.deploys.find(id).n>",
                         "<page.dataset.actions.deploys.find(id).repo>", "<page.dataset.actions.deploys.find(id).env>"])
        self.assertFalse(templates.skipped("deploy", c))
        self.assertTrue(templates.skipped("deploy", cfg()))  # aucun réglage deploy
        self.assertEqual(assemble.deploy_envs({**c, "models": {}}), {})  # modèle pas installé : pas de bouton
        shutil.rmtree(tmp)

    def test_ticket_model_follows_the_team_create_settings(self):
        """Modèle ticket (#77) : types et composants du réglage jira.create (pack), composant obligatoire avec une liste,
        points recopiés dans le champ du board seulement s'il n'est pas celui de l'écran de création ; rien sans Jira."""
        import shutil
        tmp = tempfile.mkdtemp()
        pack = os.path.join(tmp, "pack")
        shutil.copytree(os.path.join(ROOT, "tests", "fixtures", "pack-exemple"), pack)
        create = {"types": ["Story", "Bug", "Tâche"], "type": "Bug", "components": ["site-web", "intranet"],
                  "points_field": "customfield_100", "template": "~/Sites/frigo/docs/ticket.md"}
        Path(os.path.join(pack, "settings.json")).write_text(json.dumps({"jira": {"create": create}}))
        c = {**cfg(models={"ticket": "tttt1111-0000-4000-8000-000000000000"}), "team": pack}
        out = templates.render(TPL["ticket"], c)
        var = {v["name"]: v for v in out["variables"]}
        self.assertEqual(list(var), ["intention", "type", "points", "composant", "composant_2", "sprint", "parent"])
        self.assertEqual([o["value"] for o in var["type"]["control"]["options"]], ["Story", "Bug", "Tâche"])
        self.assertEqual(var["type"]["control"]["default_value"], "Bug")
        self.assertEqual([o["value"] for o in var["composant"]["control"]["options"]], ["site-web", "intranet"])
        self.assertTrue(var["composant"]["required"])
        self.assertFalse(var["composant_2"]["required"])
        self.assertEqual(var["intention"]["control"], {"type": "textarea"})
        st = {s["name"]: s for s in out["steps"]}
        self.assertEqual(list(st), ["rediger", "apercu", "relire", "sprints", "champs", "creer", "points_board", "resultat"])
        self.assertIn("~/Sites/frigo/docs/ticket.md", st["rediger"]["prompt_template"])
        self.assertEqual(st["points_board"]["api_body"], {"fields": {"customfield_200": "{{steps.champs.data.sources.f.board_sp}}"}})
        self.assertEqual(st["creer"]["api_body"], "{{steps.champs.data.sources.f.body}}")  # corps typé, jamais réinterprété
        self.assertEqual(assemble.page_config(assemble.merged(c))["ticket"], {"wf": "tttt1111"})
        # même champ à la création et sur le board : pas de recopie ; sans liste de composants : champ libre facultatif
        Path(os.path.join(pack, "settings.json")).write_text(json.dumps({"jira": {"create": {"points_field": "customfield_200"}}}))
        out = templates.render(TPL["ticket"], c)
        self.assertNotIn("points_board", [s["name"] for s in out["steps"]])
        var = {v["name"]: v for v in out["variables"]}
        self.assertNotIn("control", var["composant"])
        self.assertFalse(var["composant"]["required"])
        self.assertEqual([o["value"] for o in var["type"]["control"]["options"]], templates.CREATE_TYPES)
        self.assertIn("aucun", out["steps"][0]["prompt_template"])  # pas de modèle de ticket : structure par défaut
        self.assertTrue(templates.skipped("ticket", cfg(jira={})))
        self.assertIsNone(assemble.page_config(cfg())["ticket"])
        shutil.rmtree(tmp)

    def test_deploy_script_dispatches_the_pr_branch_and_never_prod(self):
        """Le script : branche de la PR en --ref et inputs de l'env ; refus d'un env ou dépôt hors réglage (2), d'une PR
        fermée ou d'une fork (3), d'un workflow de prod (4) ; refus de GitHub (5). Faux gh."""
        import shutil
        tmp = tempfile.mkdtemp()
        log = os.path.join(tmp, "gh.log")
        Path(os.path.join(tmp, "gh")).write_text(f"""#!/bin/sh
echo "$*" >> {log}
case "$*" in
  *"pr view 7 "*) echo '{{"state":"CLOSED","headRefName":"x","isCrossRepository":false}}' ;;
  *"pr view 8 "*) echo '{{"state":"OPEN","headRefName":"x","isCrossRepository":true}}' ;;
  *"pr view 9 "*) exit 1 ;;
  *"pr view"*) echo '{{"state":"OPEN","headRefName":"feat/EW-1-carrousel","isCrossRepository":false}}' ;;
  *"workflow run"*vance/refus*) echo "HTTP 422" >&2; exit 1 ;;
esac
exit 0
""")
        os.chmod(os.path.join(tmp, "gh"), 0o755)
        c = cfg(deploy={"repos": {
            "vance/frigo": {"workflow": "CD-NONPROD.yml", "envs": {"dev": {"envchoice": "dev", "versiontags": "", "validation": "oui"}}},
            "vance/refus": {"workflow": "CD-NONPROD.yml", "envs": {"dev": {"envchoice": "dev"}}},
            "vance/prod1": {"workflow": "CD-PROD.yml", "envs": {"dev": {}}},
            "vance/prod2": {"workflow": "Deploy-NonProd.yml", "envs": {"dev": {}}}}})
        c["github"] = {**c["github"], "prod_workflow": "Deploy-NonProd.yml"}  # un prod_workflow, même nommé « nonprod »
        path = os.path.join(tmp, "bureau.config.json")
        Path(path).write_text(json.dumps(c))
        env = {"PATH": tmp + ":/usr/bin:/bin", "BUREAU_CONFIG": path}

        def run(*a):
            return subprocess.run([sys.executable, os.path.join(ROOT, "workflows", "deploy.py"), *a], capture_output=True, text=True, env=env)
        r = run("vance/frigo", "12", "dev")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("feat/EW-1-carrousel part sur DEV", r.stdout)
        self.assertIn("workflow run CD-NONPROD.yml -R vance/frigo --ref feat/EW-1-carrousel -f envchoice=dev -f versiontags= -f validation=oui",
                      Path(log).read_text())
        for a, code in [(("vance/frigo", "12", "prod"), 2), (("vance/inconnu", "12", "dev"), 2), (("vance/frigo", "7", "dev"), 3),
                        (("vance/frigo", "8", "dev"), 3), (("vance/frigo", "9", "dev"), 3), (("vance/prod1", "12", "dev"), 4),
                        (("vance/prod2", "12", "dev"), 4), (("vance/refus", "12", "dev"), 5)]:
            self.assertEqual(run(*a).returncode, code, a)
        self.assertEqual(Path(log).read_text().count("workflow run"), 2)  # frigo, puis refus (refusé par GitHub)
        shutil.rmtree(tmp)

    def test_publish_never_creates_a_model(self):
        c = cfg()
        c.pop("models")
        tmp = tempfile.mkdtemp()
        path = os.path.join(tmp, "bureau.config.json")
        Path(path).write_text(json.dumps(c))
        os.environ["BUREAU_CONFIG"] = path
        try:
            publish = importlib.reload(importlib.import_module("publish"))
            calls = []

            def call(method, url, body=None):
                calls.append((method, url, body))
                return {"data": {"id": "11111111-2222-3333-4444-555555555555", "steps": []}, "success": True}
            publish.call = call
            with contextlib.redirect_stdout(io.StringIO()) as out:
                publish.workflows()
        finally:
            os.environ.pop("BUREAU_CONFIG", None)
        names = [b["name"] for m, u, b in calls if m == "POST"]
        self.assertFalse([n for n in names if n in {TPL[k]["definition"]["name"] for k in MODELS}], names)
        self.assertIn("modèles d'agents non installés", out.getvalue())
        self.assertNotIn("models", json.loads(Path(path).read_text()))


if __name__ == "__main__":
    unittest.main()
