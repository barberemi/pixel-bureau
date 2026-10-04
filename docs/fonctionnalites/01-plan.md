# Le plan

Un open space en pixel art où chaque personnage montre ce qui se passe dans Kronn et dans l'équipe, minute par minute.

![Le plan à 11h](../img/plan.png)

## Qui est sur le plan

| Personnage | Ce que c'est | Où le voir |
| --- | --- | --- |
| Collègue (en couleur) | Une personne de `team/roster.json` | À sa place, ses tickets Jira en bulle |
| Agent (hologramme bleu) | Un workflow Kronn, avec un personnage de *The Office* | Son étape dans un nuage, l'outil en cours dans une petite bulle sombre |
| Visiteur | Une discussion Kronn du jour | En salle de réunion, puis au café |
| Le boss | La personne qui a installé la page (`owner`) | Au bureau du boss, bras levés quand une validation l'attend |

## Où ils vont

- **Bureau** : étape IA ou script en cours.
- **Salle serveurs** : appel d'API. **Salle de réunion** : sous-workflows.
- **Bureau du boss** : validations et questions qui t'attendent.
- **Toilettes** : en panne (🚨 après 3 échecs d'affilée).
- **Plateau TV** : mises en prod du jour (fermé le vendredi et le week-end).
- **Café, canapé** : run réussi récemment, ou rien à faire.

L'anneau sous les pieds double la couleur par une forme (lisible par les daltoniens) : plein = au travail, pointillés = attend une validation, tirets = en panne.

![Légende « Comment lire le plan »](../img/legende.png)

## Détails

- Clic sur un personnage : sa fiche (voir [Fiches](07-fiches.md)). Survol : son nom et ce qu'il fait.
- La lumière suit le soleil au bureau : fenêtres, crépuscule, voile de nuit qui s'ouvre autour de chaque personnage, lampes des bureaux occupés.
- Quand un run en lance un autre, une enveloppe passe d'un agent à l'autre (sous-run, déclenchement, validation, discussion).
- « Sur le plan » dans le panneau met une famille en avant (équipe, agents ou visiteurs), avec ses noms.
