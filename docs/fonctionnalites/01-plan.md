# Le plan

Un open space en pixel art où chaque personnage montre ce qui se passe dans Kronn et dans l'équipe, minute par minute.

![Le plan à 11h](../img/plan.png)

## Qui est sur le plan

| Personnage | Ce que c'est | Où le voir |
| --- | --- | --- |
| Collègue (en couleur) | Une personne de l'équipe (`teams/<équipe>/roster.json`, ou ajoutée à l'installation) | À sa place, ses tickets Jira en bulle |
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
- « Replier ⟩ » en haut du panneau le réduit à une bande : le plan prend presque toute la largeur (×1 sur un écran de 1440 px au lieu de ×0,77). Un clic sur un personnage le rouvre.
- Au clavier : Tab jusqu'à la liste de l'équipe, flèches pour passer d'une personne à l'autre (elle ressort sur le plan), Entrée pour ouvrir sa fiche.

![Panneau replié : le plan prend la place](../img/panneau-replie.png)
- Les bulles des tickets affichent depuis combien de jours le ticket est dans sa colonne (« 📗 7685 · en review · 6 j »).
- Selon la date, le bureau se déguise : voir [Thèmes saisonniers](12-themes.md). « Comment lire le plan » permet d'en essayer un tout de suite.

## Changer de plan pour toute l'équipe

Le plan se décrit dans un fichier JSON (voir [Développer, plan du bureau](../developpement.md#plan-du-bureau-layoutsjson)). Chacun est placé par le plan (`seating`, par numéro de siège : `I2.R2` = îlot 2, côté droit, rang 2), les autres reçoivent un siège libre, toujours le même.

```sh
python3 tools/plan.py check mon-plan.json    # erreurs et avertissements
python3 tools/plan.py seats mon-plan.json    # qui s'assoit où, et qui change de place
python3 tools/plan.py share mon-plan.json    # le proposer à toute l'équipe
python3 tools/plan.py share defaut           # revenir au plan de l'installation
```

`share` lance le workflow « Le Bureau · plan » : il revérifie le plan, puis attend la validation du boss. La demande apparaît dans [À traiter](02-a-traiter.md) avec son résumé (taille, sièges, places qui changent). Une fois validé, la page se redessine sans rechargement et chacun rejoint sa nouvelle place. Un plan refusé n'est jamais publié.

![Validation d'un nouveau plan par le boss](../img/validation-plan.png)
