# Pack d'équipe

Format relevé dans le code (KT-60, 2026-10-12). Une équipe vit soit dans le dépôt (`teams/<id>/`, un « profil »), soit dans un **pack d'équipe** : le même dossier, n'importe où sur le disque (par exemple un dépôt privé cloné). Le pack garde hors du dépôt public ce qui est propre à une équipe : vrais noms, avatars, musique, plan, thème de page.

## Désigner l'équipe

Clé `team` de `bureau.config.json` [src: file: tools/assemble.py:172] :

- un id (`"monequipe"`) : le profil `teams/monequipe/` du dépôt (`assemble.TEAMS` ; aucun n'est livré, le dossier n'existe que s'il est créé à la main) ;
- un chemin (contient `/`, ou commence par `~` ou `.`) : un pack, `~` compris, relatif au dépôt s'il n'est pas absolu (`"~/Sites/bureau-monequipe"`) ;
- absente : équipe neuve (roster vide, plan type).

Un pack introuvable (pas de `team.json`) est une erreur, jamais une page sans son équipe en silence [src: file: tools/assemble.py:186]. L'installateur propose « Un pack d'équipe » et demande son chemin (réponse `team_pack`) [src: file: tools/install.py:203].

## Contenu

| Fichier | Rôle | Obligatoire |
|---|---|---|
| `team.json` | `name`, `layout` (chemin relatif au pack, sinon au dépôt), `github_org` (seuls ses membres actifs peuvent l'installer) | oui |
| `roster.json` | `people` (clé, nom, rôle, `person` = nom exact dans Jira, `github`, `roleKind`, place…) et `guests` | non |
| `defaults.json` | réglages proposés à l'installation (`page_title`, `rhythm`, `ui.skin`, `jira`, `github`, `mail.messengers` : règles de porteurs du courrier, reprises par l'installateur si l'installation n'en a pas) | non |
| `settings.json` | réglages d'équipe lus à chaque assemblage et rendu des modèles (#32) : `rhythm`, `gitfut`, `wiki_posters`, `microsoft.planning`, `agents` (personnages : `key`, `name`, `role`, `seat`, `sprite`…, sans `wf` ; `model` = clé ou liste de clés de `models`, #78 : rattaché d'office à ces modèles installés ; `holo` = `leger`, `rouge` ou `alerte`, #62), `review` (#78 : `guidelines`, `skill_ids`, `repos`, `schedule`, posés sous `review` de la config qui garde `page_id` et `project_id`), `support` (#62 : `name`, `team`, `channel` du canal de la console Support, fusionné clé à clé avec la config). Posés SOUS la config (`assemble.merged`) : la config surcharge clé à clé (rythme, planning) ou en entier (GitFut, affiches) ; un agent n'apparaît que si la config le rattache (`agents[] = {key, wf}`). `microsoft.config_id` et `agents[].wf` y sont ignorés | non |
| `cast.json` | recettes d'avatar LPC par clé de personne (composées dans le navigateur) | non |
| `sprites/` et `sprites.json` | planches fournies telles quelles ; `sprites.json` se fabrique par `python3 sprites/build_sprites.py <pack>` | non |
| `music/music.json` | morceau de chaque personne (carte « Sa musique »), pochette en data URI à côté | non |
| `layouts/*.json` | plans du bureau (`bureau-layout/1`), proposés par l'installateur avec ceux du dépôt | non |
| `.github/workflows/pack.yml` | CI du pack (modèle dans le pack d'exemple) : `tools/plan.py check` sur `layouts/*.json`, `tools/theme.py check` sur `themes/theme-*.css`, puis `tools/smoke.py --team <pack> --chrome` ; clone `barberemi/pixel-bureau` (public, sans jeton) | non |
| `themes/theme-<id>.css` | thèmes de page : première ligne `/* @nom: Nom */`, règles sous `:root[data-skin="<id>"]` ; remplace un thème de même id ; polices par `@@font:fonts/<fichier>.woff2@@`, chemin relatif au pack | non |

Un exemple complet et fictif est dans `tests/fixtures/pack-exemple/`, testé par `tests/test_pack.py` et `tests/test_install.py`. Le pas-à-pas pour les humains : `guide/equipe.md`.

## Le pack porte l'équipe, la config porte l'installation (#32)

`assemble.merged(cfg)` pose `settings.json` sous la config [src: file: tools/assemble.py:309] ; appelé par `build`, `weights`, `templates.render`, `values`, `skipped`, `script_code` et `plan.cast`, idempotent. Le JSON de config injecté dans les scripts a ses clés de premier niveau triées (`script_code`), pour qu'un réglage passé de la config au pack ne change pas le script. L'installateur rattache les personnages aux workflows (`pack_agents`, réponses `agent_<clé>` : `keep`, un id court ou vide ; devinette par les mots du nom et du métier), n'écrit `rhythm` que pour ce que le pack ne dit pas ou ce que l'ancienne config surchargeait (`rhythm_of`), et `--rattacher` refait seulement agents et pages de l'écran du boss. `tools/split.py` découpe une config existante et refuse si la page ou un modèle rendu change. Tests : `tests/test_settings.py`.

## Ce qui est embarqué dans la page

Seulement ce que l'équipe utilise (KT-28) : son roster et ses recettes, les sprites fournis qu'un personnage porte (`used_sprites`), sa musique, son plan, et les thèmes du pack en plus de ceux de `page/src/`. Les thèmes d'un pack ne sont jamais proposés aux autres installations [src: file: tools/assemble.py:43].

## Lus par

`tools/assemble.py` (`team_dir`, `_team_file`, `theme_paths`, `layout_path`), `tools/install.py` (choix de l'équipe, roster, musique et sprite écrits pour toute l'équipe dans le pack), `tests/helpers/page.js` (même résolution pour les tests de la page), `sprites/build_sprites.py`, `tools/smoke.py --team` (`team_config` : la démo avec ce pack seul, chemin relatif au dossier courant, boss = première personne du roster, thème de son `defaults.json`) [src: file: tools/smoke.py:174].

## Valider un pack

`python3 tools/plan.py check <pack>/layouts/<plan>.json`, `python3 tools/theme.py check <pack>/themes/theme-*.css` (nom et contrastes ; un thème de pack peut ne redéfinir que quelques couleurs : seules ses paires sont vérifiées, les manquantes signalées), puis `.venv/bin/python tools/smoke.py --team <pack> --chrome` (page dans `dist/office_team.html`) [src: file: tools/smoke.py:198]. C'est ce que lance la CI d'exemple ; testé par `tests/test_pack.py` (`test_smoke_team_option`, `test_example_ci_uses_existing_tools`) et `tests/test_theme.py` (`test_check_a_pack_theme`).
