# Le Bureau

Une page Live pour [Kronn](https://github.com/DocRoms/Kronn) façon *The Office* : la journée de l'équipe et de ses agents IA dans un open space en pixel art. Collègues, workflows Kronn, mises en prod et validations en attente, d'un coup d'œil.

![Le plan à 11h](docs/img/plan.png)

## Fonctionnalités

| Fonctionnalité | En bref |
| --- | --- |
| [Le plan](docs/fonctionnalites/01-plan.md) | Collègues, agents en hologramme, visiteurs et invités de passage, placés selon ce qu'ils font ; lumière du jour ; plan d'équipe validé par le boss, brouillon depuis un croquis ou une photo, passions de l'équipe, le canard en plastique qui se promène |
| [À traiter](docs/fonctionnalites/02-a-traiter.md) | Pannes, validations, PR à relire ou corriger, tickets bloqués, chacun avec son bouton |
| [Qui fait quoi](docs/fonctionnalites/03-qui-fait-quoi.md) | Une carte par personne et par agent : ce qu'il fait maintenant |
| [Fil et récap](docs/fonctionnalites/04-fil-et-recap.md) | La journée heure par heure, et son résumé depuis minuit |
| [Rejouer la journée](docs/fonctionnalites/05-rejouer.md) | Direct, ou relecture accélérée de minuit à maintenant |
| [Mode TV et cérémonies](docs/fonctionnalites/06-mode-tv.md) | Écran d'open space lisible à 3 m, tour de table du daily, sprint planning et rétrospective en salle de réunion |
| [Fiches](docs/fonctionnalites/07-fiches.md) | Journée d'un agent ou d'un collègue ; relancer, interroger, valider ; parler au canard ; fiche de paie ; cartes de passion (GitFut, Smash, dramas) |
| [Murs du bureau](docs/fonctionnalites/08-murs.md) | Kanban du sprint, planning des crons, mises en prod, employé du sprint, écran du boss avec tes autres pages Kronn |
| [Avatars](docs/fonctionnalites/09-avatars.md) | Éditeur d'apparence, pour soi ou pour toute l'équipe |
| [Fraîcheur des données](docs/fonctionnalites/10-fraicheur.md) | Prochaine arrivée, sources en retard, crons du Bureau en échec |
| [Téléphone et visite](docs/fonctionnalites/11-mobile-et-visite.md) | Affichage mobile, visite guidée en 3 bulles |
| [Thèmes saisonniers](docs/fonctionnalites/12-themes.md) | Noël, Nouvel an, Saint-Valentin, Halloween : décor, chapeaux, emojis, effets |
| [Thème de la page](docs/fonctionnalites/13-theme-page.md) | Classique ou Equipe (pixel art aux couleurs d'Equipe), au bouton 🎨 ; Equipe par défaut pour l'équipe equipe |

## Installer

### Prérequis

À préparer avant de lancer l'installateur. Seuls les deux premiers sont obligatoires : sans les autres, Le Bureau tourne, sans la partie indiquée.

| Prérequis | Pour quoi | Sans lui |
| --- | --- | --- |
| Kronn 0.14.1 ou plus, lancé sur ta machine | La page, ses datasets, les workflows | Rien ne s'installe |
| Python 3.9 ou plus (`python3`, celui que Kronn trouve dans son `PATH`) | L'installateur et les scripts des crons | Rien ne s'installe |
| Une connexion Atlassian dans Kronn (Kronn > MCP > Atlassian), créée avant l'installation | Sprint, tickets, Kanban, stand-up | Pas de Jira : blocs masqués |
| `gh` connecté (`gh auth login`, droits `repo` et `read:org`) et accès aux dépôts suivis | PR, mises en prod ; un profil d'équipe réservé à une organisation GitHub | Pas de PR ni de MEP ; profils réservés refusés |
| Le venv du dépôt avec Pillow : `python3 -m venv .venv && .venv/bin/pip install pillow` | Miniatures de l'écran du boss, cartes GitFut, affiches des Top 3, sprite LPC de l'installateur | Cartes sans image (sauf sur macOS : repli sur `sips`) |
| Chrome ou Chromium | Miniatures de l'écran du boss | Cartes sans miniature |
| Un agent IA installé dans Kronn (Claude Code, par exemple) | « Lui poser une question », plan depuis un croquis | Boutons masqués |
| suno.com autorisé dans Kronn (Configuration > Artifacts) | Le lecteur Suno de la carte « Son écoute » | Lien vers Suno seulement |

macOS ou Linux (Windows n'est pas testé). Pour développer : Node 20 ou plus (tests) et la CLI `claude` (plan depuis un croquis en local).

```sh
git clone https://github.com/barberemi/kronn-bureau.git && cd kronn-bureau
python3 tools/install.py --dry-run   # voir ce qui serait créé
python3 tools/install.py             # installation interactive, relançable sans doublon
```

L'installateur demande ton équipe (une équipe neuve avec le plan type par défaut, ou un profil de `teams/`, réservé aux membres de son organisation GitHub), qui tu es (tu prends le bureau du boss, les autres gardent leur place), le plan du bureau, ton board Jira (il en lit les colonnes et te propose comment classer chaque statut), tes dépôts et workflows de déploiement, et les pages Kronn à montrer sur l'écran du boss, puis crée la page, ses datasets, 10 workflows (9 sans Jira) et deux Quick Prompts dans **ton** Kronn, écrit `bureau.config.json` (jamais commité) et lance un premier rafraîchissement. Ouvre ensuite Kronn > Pages > « Le Bureau ». Aucun secret n'est stocké : les connexions sont référencées par leur id Kronn.

| Action | Commande |
| --- | --- |
| Mettre à jour | `git pull && python3 tools/publish.py all` |
| Désinstaller | `python3 tools/uninstall.py --dry-run`, puis sans `--dry-run` |
| Tester | `sh tools/test.sh` (Node 20+, aucune dépendance npm) |

Pour modifier la page ou les workflows : [docs/developpement.md](docs/developpement.md).

## Crédits

Police pixel du thème Equipe : [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) de CodeMan38 (SIL Open Font License 1.1, `page/fonts/OFL-PressStart2P.txt`).

Sprites : [Universal LPC Spritesheet Character Generator](https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator), contributeurs du Liberated Pixel Cup (CC-BY-SA 3.0 / GPL 3.0). Captures : page de démo.
