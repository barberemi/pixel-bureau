# Thème de la page

Le bouton 🎨 de l'en-tête change les couleurs de la page : **Classique** (sombre, les couleurs d'origine du Bureau) ou **Equipe** (clair, aux couleurs d'Equipe). Les deux sont en pixel art : cadres en escalier, boutons en relief qui s'enfoncent au clic, barres de titre en aplat, police pixel sur le titre, l'horloge et les gros chiffres (le reste du texte garde la police habituelle, pour rester lisible). Le plan ne change pas, seule l'interface autour.

| Classique | Equipe |
| --- | --- |
| ![Le thème Classique](../img/theme-classique.png) | ![Le thème Equipe](../img/theme-equipe.png) |

- **Classique** : fond anthracite, texte crème, cadres et barres de titre gris bleuté, bleu d'origine pour les compteurs et la sélection. Toujours sombre, même quand Kronn est en clair.
- **Equipe** : fond bleu très clair, cadres et barres de titre marine, bleu Equipe pour les compteurs et la sélection. Toujours clair, même quand Kronn est en sombre.
- **Mode TV** : sombre dans les deux thèmes (couleurs d'origine pour le Classique, « Equipe nuit » sur fond marine pour Equipe). L'écran mural garde le style pixel (cadres, police pixel sur l'horloge, les gros chiffres et les titres de scène) ; le fond sombre est plus reposant sur un grand écran allumé toute la journée. Le bandeau du bas passe en « breaking news » : étiquette rouge « EN DIRECT », texte qui défile sur bande blanche, sans clignoter. Pas de bouton 🎨 en mode TV : le thème vient de l'installation, ou de l'adresse (`?tv=1&skin=classique`).

| Le plan | Le stand-up | La rétro |
| --- | --- | --- |
| ![Mode TV Equipe : le plan](../img/theme-equipe-tv.png) | ![Mode TV Equipe : le stand-up](../img/theme-equipe-tv-standup.png) | ![Mode TV Equipe : le tour de table de la rétro](../img/theme-equipe-tv-retro.png) |

- **Par défaut** : celui du profil d'équipe (Equipe pour l'équipe equipe), sinon Classique. Réglage de l'installation : `ui.skin` dans `bureau.config.json`.
- **Choix de chacun** : le bouton 🎨 passe d'un thème à l'autre ; le choix est gardé dans ce navigateur et passe avant celui de l'installation.

Ajouter un thème : [guide/developpement.md](../developpement.md#ajouter-un-thème).
