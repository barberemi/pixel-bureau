# Les Combles, l'étage secret

Sous le toit du Bureau, il y a une chambre de geek : l'alphabet de Stranger Things au mur, le bouclier d'Hyrule et le Nimbus 2000, la carte de la Terre du Milieu, un lit Pac-Man, une table de jeu de rôle et une borne d'arcade. Elle n'a pas d'onglet : il faut la trouver.

![Les Combles le soir : l'équipe joue autour de la table et devant la borne](../img/combles.png)

## Trouver l'étage

Un digicode est accroché au mur, juste à côté de l'entrée principale du RDC. Au clic, son pavé s'ouvre : quatre flèches et deux boutons, B et A. On tape au clavier (flèches, touches B et A) ou au clic, et chaque touche tapée s'affiche. À la dixième touche, le code est vérifié. Un mauvais code affiche « Accès refusé », et la touche suivante recommence la saisie. Le bon code ouvre une trappe au plafond et monte aux Combles. Échap ou un clic hors du pavé le referme.

![Le digicode de l'entrée, ouvert, quatre touches tapées](../img/digicode.png)

Le code n'est écrit nulle part dans la page : seule son empreinte y est, pour le plaisir de chercher (ce n'est pas une sécurité).

Trois indices, tant que l'étage n'a pas été trouvé :

- la diode du boîtier clignote ;
- une fois par jour, une minute, le canard en plastique dit quelque chose ;
- un post-it est collé sur l'écran du boss : son survol le lit.

Une fois trouvé, l'onglet **🕹 Combles** reste au bout des onglets d'étage, dans ce navigateur. La trappe, au sol des Combles, redescend au RDC ; « Refermer la trappe », dans le panneau, cache de nouveau l'étage.

## Le soir, l'équipe monte

Des heures de bureau à 23 h, toute l'équipe présente ce jour-là est aux Combles, chacun à sa place. De temps en temps, quelqu'un se lève et va ailleurs : la table, la borne, le pied du lit. Le jour, la pièce est vide. Hors des heures de bureau, la lucarne montre la lune, une lettre du mur s'allume et la pièce passe en lumière de veillée. Le vif d'or, lui, se promène toute la journée.

Tout se déduit de l'heure : en rejeu, on voit la même soirée.

## La borne

Au clic, la borne ouvre sa fiche dans le panneau, avec le lien **▶ Jouer à Sprint Quest** : la rétro du sprint en jeu d'arcade, à plusieurs, sur claude.ai. Sans adresse réglée, la fiche explique comment la brancher.

## Régler l'adresse de la borne

Dans `bureau.config.json` (une adresse `https://` seulement), puis republier la page :

```json
"combles": {"url": "https://claude.ai/artifact/…"}
```
