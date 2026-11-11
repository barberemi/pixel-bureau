# Ce que la page garde

Dans Kronn, la page tourne dans un cadre isolé qui n'a pas accès au stockage du navigateur. Elle ne peut donc rien garder d'une visite à l'autre : un rechargement, ou la page fermée puis rouverte, remet tout à zéro.

## Ce qui dure jusqu'au rechargement

- L'étage affiché : la page rouvre au RDC.
- Le mode TV et la loupe : pour l'écran mural, ils viennent de l'adresse (`?tv=1`, `&loupe=0`, voir [Mode TV](06-mode-tv.md)).
- Les filtres du fil, les blocs repliés du panneau, le thème choisi avec 🎨, le projet du canard.
- Les décisions que tu viens de prendre dans la page : leur bouton disparaît tout de suite ; si tu recharges avant les données suivantes, il peut revenir un moment (Kronn refuse de toute façon une seconde décision).
- Les [todos](18-todos.md) pas encore enregistrées : **elles sont perdues** au rechargement. Le bandeau du bas le rappelle ; enregistre avant de partir.

## Ce qui est gardé

Tout ce qui passe par Kronn : les todos enregistrées, les avatars « pour l'équipe », les réglages de l'installation (`bureau.config.json`, puis `python3 tools/publish.py page`).

Hors de Kronn (l'aperçu local de `tools/publish.py`), le navigateur garde ces choix comme sur n'importe quelle page.
