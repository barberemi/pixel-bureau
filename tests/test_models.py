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
MODELS = ("review_child", "review_one", "review_cron", "estimate", "issue", "assign", "unassign")
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
            for word in ("Euronews", "front_euronews", "DocRoms", "barberemi", "/Users/", "customfield_10102", "3784f2a6", "8e141cbd"):
                self.assertNotIn(word, json.dumps(TPL[key], ensure_ascii=False), f"{key} : {word}")

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
