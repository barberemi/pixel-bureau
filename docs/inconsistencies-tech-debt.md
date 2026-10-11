# Tech debt (index)

> **TEMPLATE FILE.** Do not refactor items listed here without reading their detail file first.

Track-only list. Prevents AI from doing large refactors without context.
Details in `tech-debt/TD-YYYYMMDD-slug.md` (use today's date for YYYYMMDD).

**To add:** create detail file, add one-line entry below.

**Detail file example** (`tech-debt/TD-20260315-hardcoded-secret.md`):
- **ID**: TD-20260315-hardcoded-secret
- **Area**: Backend
- **Severity**: Critical
- **Problem**: API key hardcoded in `src/config.rs:42`
- **Impact**: security: key exposed in version control
- **Where**: `src/config.rs:42`, `src/payments/client.rs:15`
- **Suggested fix**: Move to environment variable
- **Next step**: create ticket

**Severity scale:**
- **Critical**: security risk or data loss
- **High**: blocks production readiness
- **Medium**: developer friction or performance degradation
- **Low**: cosmetic or minor improvement

## Outdated dependencies

Le projet n'a pas de gestionnaire de paquets (ni `package.json`, ni `requirements*.txt`, ni `pyproject.toml`) : les seules dépendances sont les runtimes et deux paquets du venv.

| Component | Current | Status | Risk |
|-----------|---------|--------|------|
| Python (`python3` du `PATH` de Kronn) | 3.9.6 sur le poste ; minimum documenté 3.9 [src: file: README.md:34] | Fin de vie (octobre 2025) | Plus de correctifs de sécurité pour l'interpréteur des crons ; voir [TD-20261011-python-runtime-eol](tech-debt/TD-20261011-python-runtime-eol.md) |
| Node.js (tests `node --test`) | v25.9.0 sur le poste, non épinglé (pas de `.nvmrc`) | Version impaire, hors support | Tests seulement ; même TD |
| pillow, websocket-client (venv) | Non épinglés [src: file: guide/developpement.md:42] | Inconnu, dépend de la date d'installation | venv non reproductible ; même TD |

## Current list

| ID | Problem | Area | Severity |
|----|---------|------|----------|
| [TD-20261011-page-size-near-kronn-limit](tech-debt/TD-20261011-page-size-near-kronn-limit.md) | Page de démo à 961 621 octets pour une limite Kronn de 1 000 000 [src: file: tools/smoke.py:20] | Frontend | Medium |
| [TD-20261011-test-install-tmpdir](tech-debt/TD-20261011-test-install-tmpdir.md) | `test_own_layout_file` rouge quand `TMPDIR` est dans le dépôt ; `set -e` saute les smoke [src: file: tools/install.py:147] | Backend | Medium |
| [TD-20261011-discussions-unpaginated](tech-debt/TD-20261011-discussions-unpaginated.md) | `/discussions?per_page=200` sans pagination dans 3 crons [src: file: workflows/office_snapshot.py:35] | Backend | Medium |
| [TD-20261011-python-runtime-eol](tech-debt/TD-20261011-python-runtime-eol.md) | Python 3.9 en fin de vie comme minimum ; runtimes et venv non épinglés [src: file: README.md:34] | Infra | Medium |
| [TD-20261011-missing-license](tech-debt/TD-20261011-missing-license.md) | Pas de LICENSE alors que des sprites CC-BY-SA / GPL sont embarqués [src: file: README.md:65] | Other | Medium |
| [TD-20261011-silent-partial-failures](tech-debt/TD-20261011-silent-partial-failures.md) | `except Exception: pass` sur des lectures d'API : datasets partiels sans trace [src: file: workflows/gates_snapshot.py:92] | Observability | Low |
| [TD-20261011-unclosed-file-handles](tech-debt/TD-20261011-unclosed-file-handles.md) | `open()` sans `with`, ResourceWarning dans les tests [src: file: tools/assemble.py:58] | Backend | Low |
| [TD-20261011-install-god-file](tech-debt/TD-20261011-install-god-file.md) | `tools/install.py` de 710 lignes [src: file: tools/install.py:549] | Other | Low |
| [TD-20261011-no-automated-gate](tech-debt/TD-20261011-no-automated-gate.md) | Ni CI, ni linter, ni hook : contrôles manuels seulement [src: file: tools/test.sh:1] | CI | Low |
| [TD-20261011-missing-security-md](tech-debt/TD-20261011-missing-security-md.md) | Pas de SECURITY.md (signal du détecteur) | Security | Low |
| [TD-20261011-community-scaffolding](tech-debt/TD-20261011-community-scaffolding.md) | Pas de CONTRIBUTING, CODE_OF_CONDUCT, modèles d'issue et de PR | Docs | Low |

## Baseline checklist

| Bloc | Applicable | Résultat |
|------|-----------|----------|
| Dockerfile | Non | Aucun `Dockerfile` dans le dépôt (vérifié par `find`) |
| docker-compose / compose.yaml | Non | Aucun fichier compose |
| CI (`.github/workflows`, `.gitlab-ci.yml`) | Non | Aucune config CI ; l'absence de garde automatique est suivie dans TD-20261011-no-automated-gate |
| `.env*` à la racine | Non | Aucun fichier `.env*` présent ni suivi (`git ls-files -- '*.env*' '.env*'` vide) |
| Web (labels, alt, scripts inline, CSP) | Partiel : un seul gabarit HTML, DOM construit en JS | Labels : `aria-label` sur le curseur et la vitesse [src: file: page/office_template.html:37], `<select id="themesel">` dans un `<label>` [src: file: page/src/46-themes.js:235], champ du code avatar avec `aria-label` [src: file: page/src/65-editor.js:252]. `alt` : présent sur tous les `<img>` générés (décoratifs, `alt=""`). Script inline : un seul `<script>` de toute la page, imposé par la sandbox des Live Pages (inline seulement) [src: file: guide/developpement.md:48]. CSP : en-têtes servis par Kronn, hors du dépôt ; pas de finding |
| Community standards | Oui (remote `github.com`), dépôt privé d'après `gh repo view` | README avec description : présent [src: file: README.md:3]. LICENSE, SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, modèles d'issue et de PR : absents (3 TD) |
| Repository hygiene | Oui | Aucun cache de paquets, `*.db`, `*.log`, `*.dump`, `findings/`, `playwright-report/` ou `test-results/` suivi. `data/office_snapshot.json` et `data/team_snapshot.json` sont des données de démo (personnages de *The Office*) inlinées par `tools/assemble.py:304-305` : légitimes |

## Dimension coverage

> Filled by the audit (Step 8 § B). **Every dimension MUST have an outcome**: `findings` (listed above), `scanned - nothing substantiable`, or `N/A: <verifiable reason>`. A blank row, or an unverifiable reason, means the audit is **incomplete**. This matrix is the breadth contract; the TDs above are the depth.

| Dimension | Outcome | Evidence / reason |
|-----------|---------|-------------------|
| Dependencies | findings | TD-20261011-python-runtime-eol (Python 3.9 EOL, Node 25, venv non épinglé). Aucune bibliothèque tierce dans la page ni dans les crons (stdlib seulement, `_lib.py` recopié au rendu) [src: file: workflows/_lib.py:8] |
| Security | findings | TD-20261011-missing-security-md (détecteur). Scanné sans faille : entrées des actions validées par regex et listes blanches [src: file: workflows/avatar_save.py:16] [src: file: workflows/gate_decide.py:14] ; gate retrouvée dans le dataset, jamais saisie [src: file: workflows/gate_decide.py:31] ; textes injectés dans le DOM passés par `esc()` ; images de données acceptées seulement en `data:image` [src: file: page/src/38-passions.js:83] [src: file: page/src/47-bosspages.js:6] ; pochette musicale non échappée [src: file: page/src/55-actions.js:186] mais lue depuis un fichier du dépôt au build [src: file: tools/assemble.py:212], pas une entrée externe ; aucun motif de secret (sk-, ghp_, AKIA, JWT) dans les fichiers suivis ; liens `target="_blank"` avec `rel="noopener"` |
| Code quality | findings | TD-20261011-unclosed-file-handles, TD-20261011-install-god-file. Les `catch(e){}` de la page entourent seulement `localStorage` et le plein écran [src: file: page/src/75-tv.js:2] : intentionnel (navigation privée) |
| Scalability | findings | TD-20261011-discussions-unpaginated. Les runs sont paginés par `limit`/`offset` jusqu'à `since` [src: file: workflows/office_snapshot.py:23] ; lectures GitHub en parallèle bornées à 8 threads [src: file: workflows/live_snapshot.py:80] |
| Maintainability | findings | TD-20261011-no-automated-gate, TD-20261011-test-install-tmpdir. 30 fichiers de tests JS (247 tests) et 5 fichiers Python (96 tests) : chemins critiques couverts. JS concaténé à portée globale : imposé par la page monofichier [src: file: tools/assemble.py:58]. Langue des commentaires homogène (français) |
| Accessibility | findings | TD-20261011-a11y-canvas-mouse-only, TD-20261011-a11y-clickable-divs, TD-20261011-a11y-bosspages-modal-focus, TD-20261011-a11y-heading-structure, TD-20261011-a11y-reduced-motion-canvas, TD-20261011-a11y-skip-link-main-landmark, TD-20261011-a11y-toggle-state-unexposed (audit ciblé, voir [inconsistencies-accessibility](inconsistencies-accessibility.md)). Existant : canvas avec `aria-label` [src: file: page/office_template.html:30], équivalent textuel dans « Qui fait quoi » [src: file: page/src/72-whoboard.js:76], `prefers-reduced-motion` dans la CSS [src: file: page/src/styles.css:257] |
| Observability | findings | TD-20261011-silent-partial-failures. Existant : fraîcheur des datasets et crons en échec affichés dans la page [src: file: page/src/33-freshness.js:89], erreurs des runs dans Kronn. Pas d'endpoint santé : N/A, pas de serveur dans ce dépôt (page statique hébergée par Kronn) |
| Compliance | findings | TD-20261011-missing-license. Crédits des assets présents (OFL, LPC) [src: file: README.md:63] [src: file: README.md:65]. RGPD : aucune ressource externe chargée par la page (polices et images inlinées) [src: file: guide/developpement.md:48], seulement des liens ; les absences nommées viennent du planning interne de l'équipe [src: file: workflows/absences_snapshot.py:1] et restent sur le Kronn local |
| Performance | findings | TD-20261011-page-size-near-kronn-limit (961 621 / 1 000 000 octets, mesuré avec `python3 tools/smoke.py`) |
| Documentation drift | scanned - nothing substantiable | Compteurs de `guide/developpement.md` et du README (13 workflows, 12 datasets) réalignés sur `tools/templates.py` et `tools/install.py` [src: file: tools/templates.py:24] [src: file: tools/install.py:27]. Comptes de tests de `docs/testing-quality.md` confirmés en relançant `tools/test.sh` |

## Coverage gaps

- Aucun finding retiré pour respecter le plafond (11 findings ; le 12e, dérive des docs agents, corrigé pendant la revue finale).
- Pas de ticket tracker MCP configuré (seul Context7 est disponible) : pas de déduplication avec des tickets existants.
- Chargement Chrome headless (`tools/test.sh --chrome`) non relancé pendant cet audit ; le smoke statique (démo et `--empty`) passe.

## Reconciliation candidates

Aucun : `docs/tech-debt/` ne contenait aucun TD avant cet audit (seulement `.gitkeep`).
