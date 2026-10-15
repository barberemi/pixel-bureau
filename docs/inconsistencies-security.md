# Sécurité (audit ciblé 0.8.2, 2026-10-11)

Périmètre : page statique (`page/office_template.html` + `page/src/*.js`) servie par Kronn Live Pages, scripts Python stdlib (`workflows/`, `tools/`). Pas de serveur propre, pas d'auth, pas de base, pas de CI.

| ID | Problem | Area | Severity |
|----|---------|------|----------|
| [TD-20261011-sprites-unpinned-master](tech-debt/TD-20261011-sprites-unpinned-master.md) | **Résolu le 2026-10-15 (#9).** `sprites/build_sprites.py` télécharge les sprites LPC depuis la branche `master` d'un dépôt tiers, sans commit figé ni empreinte | Supply chain | Low |
| [TD-20261011-page-no-csp](tech-debt/TD-20261011-page-no-csp.md) | Pas de `Content-Security-Policy` (meta) dans le gabarit de la page ; les en-têtes HTTP dépendent de Kronn | Headers | Low |
| [TD-20261011-href-scheme-unchecked](tech-debt/TD-20261011-href-scheme-unchecked.md) | **Résolu le 2026-10-15 (#6).** Les liens `href` venant des datasets (PR, runs GitHub) sont échappés mais leur schéma n'est pas vérifié (`javascript:` passerait) | XSS | Low |

Existant lié : [TD-20261011-missing-security-md](tech-debt/TD-20261011-missing-security-md.md), résolu le 2026-10-13 : `SECURITY.md` (avis de sécurité privé GitHub).

## Checklist § A

**Secrets**
- Fichiers `.env*` suivis : verified absent (`git ls-files -- '*.env*' '.env*'` vide).
- Valeurs de secrets dans le source : Not evaluated safely (requires Kronn's local secret scanner).
- CI YAML / docker-compose : aucun fichier (pas de `.github/`, pas de compose). Hygiène des credentials : Not evaluated safely (requires Kronn's local secret scanner).
- Clés privées / certificats (`*.pem`, `*.key`, `*.p12`, `id_rsa*`, `*.pub`, `.ssh/`) : verified absent.
- `git log --all -S 'BEGIN PRIVATE KEY'` : aucun résultat.

**Authentification et sessions** : N/A, la page n'a ni login ni cookie (aucun `Set-Cookie`/`setcookie` dans le dépôt) ; l'accès est géré par Kronn. Hash de mot de passe, reset tokens : N/A. JWT / Bearer : Not evaluated safely (requires Kronn's local secret scanner) ; aucune bibliothèque JWT (pas de manifeste de dépendances).

**Injection**
- SQL : N/A, aucune base.
- Shell : verified absent. Tous les `subprocess.run`/`Popen` passent une liste d'arguments sans `shell=True` (`tools/install.py:164`, `tools/plan.py:155`, `tools/shots.py:198`, `workflows/_lib.py:160`). `exec(_PIL, ...)` à `workflows/_lib.py:151` exécute une constante du module, les données passent par le dict `A`.
- Chemins de fichiers : les entrées collées depuis la page sont validées par regex avant usage (`workflows/avatar_save.py:16-20`, clé `^[a-z0-9_]{1,40}$`, pas de `.`).
- Templates / innerHTML : environ 92 puits `innerHTML`/`insertAdjacentHTML` dans `page/src/`, les valeurs externes passent par `esc()` (`page/src/50-panel.js:3`). Échantillon vérifié : `page/src/60-fiches.js:157`, `page/src/62-ticket.js:87`, `page/src/70-kpis-feed.js:103`. Reste le schéma des URL, voir TD-20261011-href-scheme-unchecked.
- Désérialisation : verified absent (pas de `pickle`, `yaml.load`, `unserialize`) ; seulement `json.loads`.

**Transport et en-têtes** : HTTPS, HSTS, X-Frame-Options, X-Content-Type-Options, CORS relèvent du serveur Kronn qui sert la Live Page, hors dépôt. CSP : absente côté gabarit, voir TD-20261011-page-no-csp.

**Dépendances**
- Lockfile : N/A, aucun manifeste (`package.json`, `requirements*.txt`, `pyproject.toml` absents) ; scripts en stdlib, Pillow optionnel via `.venv` local non versionné.
- Audit de dépendances en CI / Dependabot : absent (pas de CI) ; faible enjeu sans dépendance déclarée.
- Téléchargement depuis une branche mobile : voir TD-20261011-sprites-unpinned-master.

**SSH / déploiement CI** : N/A, pas de script de déploiement SSH ni de workflow `pull_request_target` ; la publication passe par l'API Kronn (`tools/publish.py:11`), lancée par l'humain.
