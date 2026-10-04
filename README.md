# Le Bureau

Une page Live pour [Kronn](https://github.com/DocRoms/Kronn) façon *The Office* : la journée de l'équipe et de ses agents IA dans un open space en pixel art. Collègues, workflows Kronn, mises en prod et validations en attente, d'un coup d'œil.

![Le plan à 11h](docs/img/plan.png)

## Fonctionnalités

| Fonctionnalité | En bref |
| --- | --- |
| [Le plan](docs/fonctionnalites/01-plan.md) | Collègues, agents en hologramme et visiteurs, placés selon ce qu'ils font ; lumière du jour ; plan d'équipe validé par le boss |
| [À traiter](docs/fonctionnalites/02-a-traiter.md) | Pannes, validations, PR à relire ou corriger, tickets bloqués, chacun avec son bouton |
| [Qui fait quoi](docs/fonctionnalites/03-qui-fait-quoi.md) | Une carte par personne et par agent : ce qu'il fait maintenant |
| [Fil et récap](docs/fonctionnalites/04-fil-et-recap.md) | La journée heure par heure, et son résumé depuis minuit |
| [Rejouer la journée](docs/fonctionnalites/05-rejouer.md) | Direct, ou relecture accélérée de minuit à maintenant |
| [Mode TV et stand-up](docs/fonctionnalites/06-mode-tv.md) | Écran d'open space lisible à 3 m, tour de table du daily |
| [Fiches](docs/fonctionnalites/07-fiches.md) | Journée d'un agent ou d'un collègue ; relancer, interroger, valider ; fiche de paie |
| [Murs du bureau](docs/fonctionnalites/08-murs.md) | Kanban du sprint, planning des crons, mises en prod, employé du sprint |
| [Avatars](docs/fonctionnalites/09-avatars.md) | Éditeur d'apparence, pour soi ou pour toute l'équipe |
| [Fraîcheur des données](docs/fonctionnalites/10-fraicheur.md) | Prochaine arrivée, sources en retard, crons du Bureau en échec |
| [Téléphone et visite](docs/fonctionnalites/11-mobile-et-visite.md) | Affichage mobile, visite guidée en 3 bulles |
| [Thèmes saisonniers](docs/fonctionnalites/12-themes.md) | Noël, Nouvel an, Saint-Valentin, Halloween : décor, chapeaux, emojis, effets |

## Installer

Prérequis : Kronn 0.14.1 ou plus lancé en local, Python 3. Facultatifs : une connexion Atlassian dans Kronn (tickets du sprint) et `gh` connecté (PR, mises en prod).

```sh
git clone https://github.com/barberemi/kronn-bureau.git && cd kronn-bureau
python3 tools/install.py --dry-run   # voir ce qui serait créé
python3 tools/install.py             # installation interactive, relançable sans doublon
```

L'installateur demande ton équipe (une équipe neuve avec le plan type par défaut, ou un profil de `teams/`, réservé aux membres de son organisation GitHub), qui tu es (tu prends le bureau du boss, les autres gardent leur place) et le plan du bureau, puis crée la page, ses datasets, 8 workflows et un Quick Prompt dans **ton** Kronn, écrit `bureau.config.json` (jamais commité) et lance un premier rafraîchissement. Ouvre ensuite Kronn > Pages > « Le Bureau ». Aucun secret n'est stocké : les connexions sont référencées par leur id Kronn.

| Action | Commande |
| --- | --- |
| Mettre à jour | `git pull && python3 tools/publish.py all` |
| Désinstaller | `python3 tools/uninstall.py --dry-run`, puis sans `--dry-run` |
| Tester | `sh tools/test.sh` (Node 20+, aucune dépendance npm) |

Pour modifier la page ou les workflows : [docs/developpement.md](docs/developpement.md).

## Crédits

Sprites : [Universal LPC Spritesheet Character Generator](https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator), contributeurs du Liberated Pixel Cup (CC-BY-SA 3.0 / GPL 3.0). Captures : page de démo.
