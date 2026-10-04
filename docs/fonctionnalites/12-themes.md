# Thèmes saisonniers

Le bureau se déguise selon la date : décor, chapeaux, effets. Le thème suit la date affichée (heure de Paris), donc aussi « Rejouer ».

| Thème | Dates | Ce qui change |
| --- | --- | --- |
| 🎆 Nouvel an | 31 déc. au 2 janv. | Banderole « BONNE ANNÉE », chapeaux pointus, confettis, feux d'artifice dans les fenêtres le soir |
| 👑 Galette des rois | 5 au 10 janv. | Galette sur la table de la cafétéria, couronne sur le roi du jour (tiré au sort, le même pour tous) |
| 💘 Saint-Valentin | 13 et 14 févr. | Fanions roses, petits cœurs qui s'envolent |
| 🐟 Poisson d'avril | 1er avril | Poisson en papier dans le dos de 3 agents (jamais un collègue) |
| 😎 Été | 21 juin au 31 août | Lunettes de soleil, ventilateurs sur les îlots ; notes de musique le 21 juin (Fête de la musique) |
| 🎃 Halloween | 24 au 31 oct. | Agents en fantômes verts, chapeaux de sorcière, citrouilles allumées le soir, toiles d'araignée, chauves-souris |
| 🎄 Noël | 1er au 30 déc. | Bonnets, guirlande lumineuse, sapin et cadeaux, neige dans les fenêtres |

| Noël | Halloween (20h15) |
| --- | --- |
| ![Noël](../img/theme-noel.png) | ![Halloween](../img/theme-halloween.png) |
| **Nouvel an** | **Été** |
| ![Nouvel an](../img/theme-nouvel-an.png) | ![Été](../img/theme-ete.png) |
| **Galette des rois** | **Saint-Valentin** |
| ![Galette des rois](../img/theme-galette.png) | ![Saint-Valentin](../img/theme-saint-valentin.png) |
| **Poisson d'avril** | |
| ![Poisson d'avril](../img/theme-poisson-avril.png) | |

- **Voir un thème tout de suite** : « ? Comment lire le plan », puis « Thème du bureau ». Le choix dure le temps de la visite.
- **Config** (`bureau.config.json`) : `"ui": {"themes": false}` coupe les thèmes, `"ui": {"theme": "noel"}` en impose un.
- **Ajouter un thème** : une entrée dans `THEMES` (`page/src/46-themes.js`, dates `MM-JJ`), puis son décor dans les fonctions du fichier (banderole, guirlande, personnages, fenêtres, effets). Captures : `.venv/bin/python tools/shots.py theme-<id>`.
