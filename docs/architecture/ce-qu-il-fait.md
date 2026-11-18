# « 👁 Ce qu'il fait » : ce que fait l'agent d'un poste

La fiche d'un agent au travail, à chaque étage, dit ce qu'il fait. Kronn est multi-agents : rien ne suppose Claude Code, le détail par agent n'est qu'un niveau de plus [src: file: workflows/_lecteurs.py:1].

## Où ça vit

| Côté | Fichier | Rôle |
|---|---|---|
| Relevé (commun) | `workflows/_lecteurs.py` | Règle de confidentialité, premier mot d'une commande, lecteur Claude Code, registre `LECTEURS`, niveau 1 (`fichiers`, `rapport`), carnet, `plafonne`, `menage` [src: file: workflows/_lecteurs.py:1] |
| 1er | `workflows/atelier_snapshot.py` (`fait`, `agent_en_cours`, `dernier_fini`) | `room.fait` : l'agent au travail (descendu par `SUB` comme `activite`), aux contrôles les sous-agents de `parallele`, et le dernier poste fini (`fini`) [src: file: workflows/atelier_snapshot.py:121] |
| 2e | `workflows/redaction_snapshot.py` (`fait_poste`, `revue_fait`) | `tables[].fait` (recherche, rédaction, critique) et `revue.fait = {run de review_child: fait}` ; `lus` = fichiers lus, pas de diff [src: file: workflows/redaction_snapshot.py:193] |
| 3e | `workflows/retours_snapshot.py` (`fait`) | `rooms[].fait` de l'étape `fix` : au travail, ou `fini: true` tant que le run tourne ; fichiers du dossier de travail de la PR (`work` de l'état du run) [src: file: workflows/retours_snapshot.py:82] |
| -1 | `workflows/live_snapshot.py` (`support_fait`) | `runs[].fait` des sous-runs `support_<poste>` actifs, **sans texte** (ni phrase, ni motif cherché, ni mission confiée) [src: file: workflows/live_snapshot.py:35] |
| Page | `page/src/66-fait.js` | `faitHtml`, `faitRapportHtml`, `faitSousHtml`, `faBulle`, `faNear` ; branché par `atFaitAgent` / `atActFor` (1er), `rtFaitHtml` / `rtBubble` (3e), `rvFait` / `rdFait` (2e), `csFait` (-1) [src: file: page/src/66-fait.js:1] |

Pourquoi un module à part : `_lib.py` part dans TOUS les scripts rendus et `chaine.py` est à ~97 % de `templates.MAX_SCRIPT`. `_lecteurs` est dans `templates.LIB_IMPORT` et n'est recopié que dans les scripts qui l'importent ; `tests/test_lecteurs.py` vérifie qu'il n'entre ni dans `chaine.py`, ni dans `support.py`, `review.py`, `office_snapshot.py`, et qu'aucun nom du module n'est redéfini par un script hôte (recopié dans la même portée) [src: file: tools/templates.py:277].

## Les trois niveaux

1. **Base, sans l'agent** : `fichiers(dossier, base)` (git `--no-optional-locks` en lecture seule : `diff --numstat base...HEAD`, `diff --numstat HEAD`, non suivis, âge par mtime, 7 fichiers, commits `type(portée)` seulement), `rapport(.kronn/chaine, poste)` (statut, résumé, 3 constats, bloquants d'abord), compteur de Kronn (`last_activity` de l'étape : `k = {cat, n, at}`).
2. **Carnet** : l'agent l'écrit lui-même, quel qu'il soit. Au 1er seulement : les postes de la chaîne reçoivent la consigne au rendu (`templates.CARNET_POSTES`, réglage `impl.carnet`, vrai par défaut ; détail dans [chaine-implementation](chaine-implementation.md), « Le dossier du ticket ») et ajoutent `HH:MM · <poste> · ce que je fais` à `.kronn/chaine/journal.md` (postes `plan`, `code`, `tests`, `controles` et ses sous-agents `regles`, `securite`, `perf`, `besoin`, `doc`, `retours`). `carnet(.kronn/chaine, postes, n=5)` lit la fin du fichier (16 Ko), garde les lignes au format des postes demandés (une ligne hors format seulement sans filtre), la plus récente d'abord, 5 au plus, et rend `"HH:MM · poste · texte"`. L'atelier passe les postes de l'agent au travail (`atelier_snapshot.CARNET_DE`, par modèle de son run : le bureau du Code ne montre pas les lignes du Plan ; aux contrôles, le coordinateur et ses sous-agents) ; sans agent au travail, pas de carnet. La bulle (`faBulle`) retire « HH:MM · poste · » ; la fiche garde la ligne entière. Les autres étages n'ont pas encore de consigne. Compte par poste dans le bilan de la chaîne (`chaine_bilan.carnet_compte`, `ligne.carnet`).
3. **Détail par lecteur** : `LECTEURS = {"ClaudeCode": lecteur_claude}`. L'agent vient de Kronn (`agent_provenance.attempts[-1].agent`, sinon `step_agent`), jamais supposé ; sans lecteur, `{ag, lu: false}` et la fiche dit « Détail des actions pas encore lu pour <agent> ». Un lecteur qui lève : stderr, et le niveau 1 reste (`detail`).

## Lecteur Claude Code

- Journal : `~/.claude/projects/<re.sub(r"[^A-Za-z0-9]", "-", dossier)>/<session>.jsonl` ; racine réglable par `BUREAU_SESSIONS_ROOT` (tests).
- Session exacte une fois l'étape finie : `agent_provenance.attempts[-1].session_id`. Pendant l'étape : `trouve_session`, la plus récente du dossier ouverte depuis le début de l'étape dont le prompt vient de Kronn (protocole `=== ANTI-HALLUCINATION` en tête, ou `---STEP_OUTPUT---`). Les prompts de la revue, du Support, du ticket et de la correction n'ont pas `---STEP_OUTPUT---` (relevé du 2026-11-17) : d'où le protocole en tête. Dossier partagé (racine du projet pour la correction et le Support, worktree du cron pour la revue) : un indice en plus, le run (`pr/work/<run>` dans le prompt de la correction), `#<pr>` (revue), l'heure du message du fil (Support, `support.json`).
- Sous-agents des contrôles : `<session>/subagents/agent-*.jsonl` + `.meta.json` (modèle) ; poste lu dans « chargé du poste **x** » ; `mission=` lit le journal d'un seul sous-agent (poste fini).
- Fin du fichier seulement : position, inode et résumé gardés par journal dans `~/.cache/pixel-bureau/lecteurs/<sha1>.json` ; première lecture d'un gros journal = ses 2 derniers Mo (`partiel`) ; une ligne coupée attend le relevé suivant ; `menage()` efface les positions de plus de 3 jours.

## Règle de confidentialité

Jamais une commande complète (`commande` : premier mot utile après `cd …&&`, `rtk [proxy]`, `VAR=`, `timeout N`, `env`, sous-shell `W="$(…)"` ; outil connu dans `docker` / `php vendor/bin` ; git avec sa sous-commande), jamais un chemin absolu (`rel` : relatif au dossier du run ou à une racine, sinon le nom du fichier ; `sans_chemin` dans les phrases), jamais le contenu d'un fichier (seuls l'outil et le chemin d'un `Read`/`Edit`), et toute phrase qui contient secret, token, password, mot de passe, clé, api key, credential ou bearer est écartée (`SENSIBLE`, aussi pour les motifs cherchés et les sujets de commit). Un bout de code avec des espaces dans une phrase devient son premier mot. Le carnet passe la même règle (`phrase`, 120 signes), et une ligne de carnet qui contient une commande (`SHELL` : `&&`, `||`, `$(`, tube, redirection, option `-x` ou `--xx`, outil connu suivi d'un chemin ou d'une option, ex. `docker compose exec php vendor/bin/phpunit`) ou une valeur de secret (`SECRET_VAL` : préfixes `ghp_`, `github_pat_`, `sk-`, `xox?-`, `AKIA`, suite de 32 lettres et chiffres mêlés) est écartée, comme une phrase sensible (`tests/test_lecteurs.py`). Phrases coupées à 140 signes, 3 au plus ; 10 actions ; 7 fichiers ; `plafonne` tient un fait sous 6 Ko (5 Ko au 2e).

## Côté page

`faNear(dataset)` : en direct seulement (relevé à 3 min de l'heure affichée, comme `atAct`) ; en rejeu, la fiche reste celle d'avant. La bulle (`faBulle`) : carnet, sinon dernière phrase (~30 signes), sinon « ✏ n fichiers modifiés », sinon le compteur de Kronn. Aux contrôles, une bulle par sous-agent lu ; sans lecteur « 👥 n/m rapports rendus » au poste du run. La fiche d'un bureau ne change qu'aux contrôles ; sans fait, toutes les fiches sont inchangées (`tests/fait.test.js`).

Tests : `tests/test_lecteurs.py` (journaux fictifs), `tests/test_scripts.py` (`test_live_snapshot_support_poste_says_its_actions_only`), `tests/fait.test.js`.
