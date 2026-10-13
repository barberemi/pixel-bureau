# Testing & quality

> **Test policy:** see [AGENTS](AGENTS.md) § Project parameters: this file is the checklist, not the source of the policy.

## Build checks

CI GitHub Actions (`.github/workflows/tests.yml`) : `sh tools/test.sh --chrome` sur chaque PR et chaque push sur `main` (KT-37), plus la règle du guide sur les PR. Pas de linter, de formateur ni de typecheck configurés (aucun `package.json`, `pyproject.toml`, `setup.cfg`, `.pre-commit-config.yaml`). Point d'entrée unique : `sh tools/test.sh` [src: file: tools/test.sh:1].

| Contrôle | Commande | Ce qu'il vérifie |
|---|---|---|
| Tests JS de la page | `node --test tests/*.test.js` | Logique de `page/src/*.js` chargée dans un contexte `vm` [src: file: tools/test.sh:7] [src: file: tests/helpers/page.js:1] |
| Tests Python | `python3 -m unittest -q tests/test_templates.py tests/test_install.py tests/test_scripts.py tests/test_plan.py tests/test_theme.py tests/test_compact.py tests/test_visual.py` | Scripts `workflows/` (dont le contrat crons → page), installateur (dont installation de zéro sans profil), modèles, plans, thèmes, compactage, règle du guide [src: file: tools/test.sh:8] |
| Build + smoke statique (démo) | `python3 tools/smoke.py` | Assemble `dist/office.html` ; taille < 1 000 000 octets (poids de chaque bloc, alerte à partir de 90 %), chaque `<script>` se parse, 10 blocs `kronn-action` du squelette, JSON valide, aucun marqueur `__X__` restant, 1 seul `<script>` exécutable [src: file: tools/smoke.py:8] [src: file: tools/smoke.py:20] [src: file: tools/smoke.py:59] |
| Smoke installation neuve | `python3 tools/smoke.py --empty` | Mêmes contrôles sur une page d'équipe neuve, plan type, sans démo [src: file: tools/test.sh:12] |
| Smoke d'un pack d'équipe | `python3 tools/smoke.py --team <id ou chemin>` | La démo avec cette équipe seule (`dist/office_team.html`) ; ce que lance la CI d'un pack [src: file: tools/smoke.py:174] |
| Chargement Chrome headless | `sh tools/test.sh --chrome` (passe `--chrome` aux deux smoke) | Aucune exception JS, zéro `console.error` [src: file: tools/smoke.py:135] |
| Régression visuelle | `.venv/bin/python tools/visual.py` (lancée par `tools/test.sh --chrome`) | 8 captures clés comparées à `tests/visual/` (temps figé et virtuel : deux rendus identiques ; tolérance 0,3 %) ; stricte sur la plateforme des références (Linux, CI), indicative ailleurs [src: file: tools/visual.py:1] |
| Règle du guide (PR) | `python3 tools/visual.py --guide-rule origin/main` | Références visuelles changées ⇒ `guide/` changé ; levée par le label « références seules » [src: file: .github/workflows/tests.yml:1] |
| Modèles = workflows du Kronn | `python3 tools/templates.py check` | `DIFF` si le rendu d'un modèle diffère du workflow installé ; code de sortie 1 [src: file: tools/templates.py:289] |

`tools/test.sh` tourne avec `set -e` : un échec des tests JS empêche les étapes suivantes [src: file: tools/test.sh:5]. Le smoke utilise `.venv/bin/python` s'il existe, sinon `python3` [src: file: tools/test.sh:9].

## Test infrastructure

| Langage | Runner | Config / setup | Runtime |
|---|---|---|---|
| JavaScript (page) | `node --test` intégré, sans npm ni dépendance [src: file: tools/test.sh:2] | Pas de fichier de config ; harnais `tests/helpers/page.js` (concatène `page/src/*.js` dans l'ordre d'assemblage, bouchons DOM / canvas) [src: file: tests/helpers/page.js:1] ; fixtures `tests/fixtures/bureau.config.json`, `tests/fixtures/world_open-space.json`, pack fictif `tests/fixtures/pack-exemple/` | Node non épinglé (pas de `.nvmrc`) ; v25.9.0 sur le poste de dev au 2026-10-11 |
| Python (workflows, tools) | `unittest` de la bibliothèque standard [src: file: tools/test.sh:8] | Pas de config ; liste des fichiers en dur dans `tools/test.sh` | Python non épinglé (pas de `.python-version`) ; `python3` 3.9.6 sur le poste de dev |
| Smoke / Chrome | `tools/smoke.py` | `.venv` avec `websocket-client` pour `--chrome` (et `pillow` pour les captures) [src: file: tools/smoke.py:11] [src: file: guide/developpement.md:41] | Chrome attendu à `/Applications/Google Chrome.app/...` (macOS) [src: file: tools/smoke.py:21], port de débogage 9334 par défaut [src: file: tools/smoke.py:155] |

Un nouveau fichier `tests/*.test.js` est pris automatiquement (glob) ; un nouveau `tests/test_*.py` doit être ajouté à la ligne `unittest` de `tools/test.sh` [src: file: tools/test.sh:8].

## Test suites

Compté le 2026-10-11 en lançant `sh tools/test.sh`.

**JavaScript : 30 fichiers `tests/*.test.js`, 247 tests, tous verts.** Nombre de `test(...)` par fichier : absences 6, agent-label 3, boot 10, bosspages 3, ceremonies 7, created 4, design 3, duck 10, duckgame 10, feed-events 10, feed-links 4, guests 7, layout 9, logic 18, lot2 8, lot4 9, loupe 5, music 2, outsider 4, passions 5, piles 3, prodherald 7, reopen 8, skin 2, state 34, ticket 8, tickets-fiche 7, tvnames 4, viewparams 4, visuals 8. Les plus gros : `state.test.js` (état de la journée, 34), `logic.test.js` (18).

**Python : 5 fichiers, 96 tests.**

| Fichier | Tests | Portée |
|---|---|---|
| `tests/test_scripts.py` | 40 | Scripts de `workflows/` (snapshots, `team_shape`, `layout_save`, `relaunch`, canard...) |
| `tests/test_install.py` | 24 | `tools/install.py`, `tools/uninstall.py` (avec un faux Kronn) |
| `tests/test_plan.py` | 23 | `tools/plan.py`, `workflows/_plan.py` (format `bureau-layout/1`) |
| `tests/test_templates.py` | 7 | `tools/templates.py` : modèles sans ids d'installation, rendu, crons au fuseau du bureau [src: file: tests/test_templates.py:24] |
| `tests/test_theme.py` | 4 | Thèmes `page/src/theme-*.css` [src: file: guide/developpement.md:64] |

Horloge des tests de scripts (KT-56, 2026-10-12) : les scripts lancés par `tests/test_scripts.py` voient une heure figée, midi à Paris le jour du test, via `tests/fakeclock/sitecustomize.py` (`PYTHONPATH`, variable `BUREAU_TEST_NOW`) [src: file: tests/test_scripts.py:17] ; les données de test sont datées par rapport à la même heure (`NOW`, `iso()`). Avant, trois tests échouaient entre 00h00 et 00h05 à Paris. `BUREAU_TEST_NOW=2026-10-12T00:02:00+02:00` rejoue une autre heure ; la nuit, des tests qui datent leurs runs de « il y a 5 minutes » échouent par construction.

`test_own_layout_file` couvre les deux cas d'un plan à soi, quel que soit `TMPDIR` (y compris `<dépôt>/.kronn/tmp` des agents sous Kronn) : hors du dépôt, chemin absolu ; dans le dépôt, chemin relatif [src: file: tests/test_install.py:227] (KT-42, 2026-10-12).

## Test selection (when required by the project policy)

Use the project test policy to decide which checks the change requires. Adapt
the examples below to the project's stack and existing test locations; they
do not impose additional gates or override an explicit exemption.

| Change type | Suitable checks | Where |
|-------------|---------------|-------|
| New API endpoint | Integration test (HTTP request → response) | API test file |
| New function | Unit test in same file (`#[cfg(test)]` or `__tests__/`) | Same module |
| Bug fix | Regression test (fails without fix, passes with) | Relevant test file |
| Frontend component | Render + key user interactions | `__tests__/` |
| Database migration | Verify migration applies + data integrity | DB test file |

## Test quality checklist

For the tests required by the project policy, check the applicable items before
declaring a task done:

- [ ] Tests cover the **happy path**
- [ ] Tests cover at least one **error path** (invalid input, missing data)
- [ ] Tests cover **edge cases** (empty, unicode, large input)
- [ ] Assertions are **meaningful** (not just "renders" or "is defined")
- [ ] Mocks match **real API shapes** (check generated types)
- [ ] No **flaky** tests (no sleeps, no timing assumptions)
- [ ] The checks required by the project policy and CI pass
- [ ] If a test is flaky, **fix the root cause**: do not add retries

## Coverage

Aucune mesure de couverture : pas d'outil configuré (ni `c8`, ni `--experimental-test-coverage`, ni `coverage.py`). Pas de cible chiffrée. La règle en vigueur est qualitative : tout changement de code vient avec un test (voir [AGENTS](AGENTS.md) § Project parameters).

## NOT tested (known gaps)

Vérifié par recherche du nom de module dans `tests/` (2026-10-11) :

- `workflows/gate_decide.py` : aucun test ne le référence (`avatar_save.py` et `payroll_snapshot.py` sont couverts par le test de contrat, 2026-10-12).
- `tools/publish.py` (publication vers Kronn, lancée par l'humain seul), `tools/shots.py` (captures), `tools/cdp.py` (pilotage Chrome) : pas de test.
- `tools/smoke.py` n'a pas de test propre (c'est lui-même un contrôle).
- Rendu visuel : 8 captures clés comparées (`tools/visual.py`) ; les autres vues (scènes, thèmes saisonniers, éditeur…) restent relues à l'oeil.
- Appels réels à Kronn, GitHub, Jira, Microsoft Graph : remplacés par des faux dans les tests ; la conformité des workflows installés se vérifie avec `python3 tools/templates.py check` (demande un Kronn joignable).

## Smoke checks (pre-commit)

```sh
rtk node --test tests/*.test.js                       # ~1 s, logique de la page
rtk python3 -m unittest -q tests/test_scripts.py tests/test_install.py   # scripts et installateur
rtk sh tools/test.sh                                  # tout, sans Chrome
rtk sh tools/test.sh --chrome                         # obligatoire avant publication : zéro console.error
rtk python3 tools/templates.py check                  # après modification d'un modèle de workflow (Kronn joignable)
```
