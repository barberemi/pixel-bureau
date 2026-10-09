# Thème de la page

Le bouton 🎨 de l'en-tête change l'habillage de la page : **Classique** (le style d'origine) ou **Equipe** (pixel art aux couleurs d'Equipe). Le plan ne change pas, seule l'interface autour ; le mode TV a sa version sombre du thème.

![Le thème Equipe](../img/theme-equipe.png)

- **Equipe** : cadres en escalier, boutons en relief qui s'enfoncent au clic, barres de titre marine, bleu Equipe pour les compteurs et la sélection. Le titre, l'horloge et les gros chiffres sont en police pixel ; le reste du texte garde la police habituelle, pour rester lisible. Toujours clair, même quand Kronn est en sombre.
- **Mode TV, « Equipe nuit »** : l'écran mural garde le style pixel (cadres, police pixel sur l'horloge, les gros chiffres et les titres de scène) sur fond marine, plus reposant sur un grand écran allumé toute la journée. Le bandeau du bas passe en « breaking news » : étiquette rouge « EN DIRECT », texte qui défile sur bande blanche, sans clignoter. Pas de bouton 🎨 en mode TV : le thème vient de l'installation, ou de l'adresse (`?tv=1&skin=classique`).

| Le plan | Le stand-up | La rétro |
| --- | --- | --- |
| ![Mode TV Equipe : le plan](../img/theme-equipe-tv.png) | ![Mode TV Equipe : le stand-up](../img/theme-equipe-tv-standup.png) | ![Mode TV Equipe : le tour de table de la rétro](../img/theme-equipe-tv-retro.png) |

- **Par défaut** : celui du profil d'équipe (Equipe pour l'équipe equipe), sinon Classique. Réglage de l'installation : `ui.skin` dans `bureau.config.json`.
- **Choix de chacun** : le bouton 🎨 passe d'un thème à l'autre ; le choix est gardé dans ce navigateur et passe avant celui de l'installation.

Ajouter un thème : [docs/developpement.md](../developpement.md#ajouter-un-thème).
