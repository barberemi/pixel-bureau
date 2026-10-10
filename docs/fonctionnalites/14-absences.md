# Absences et télétravail

Le Bureau sait qui est là : il lit le planning de l'équipe (le classeur Excel de la DSI, sur SharePoint) toutes les heures en semaine. Il ne montre jamais la raison d'une absence : congés, formation, école ou maladie, tout devient « absence ».

![Qui fait quoi, avec les absences](../img/qui-fait-quoi.png)

- **Sur le plan**, une personne absente n'est pas à son bureau. Absente le matin, elle arrive vers 13h30 ; absente l'après-midi, elle part vers 12h30. Un jour férié, personne ne vient (sauf le boss).
- **En télétravail**, elle reste à sa place, en transparence, avec le reste de sa journée : ses tickets, ses scènes, le daily et les cérémonies (en visio).
- **Le boss** reste toujours à son bureau sur le plan ; son absence ou son télétravail se lisent dans sa fiche (« 📅 Selon le planning : … »).
- **Qui fait quoi** : les absents ont une carte grisée en fin de grille (« Absence ce matin · arrive vers 13h30 ») ; le télétravail s'écrit devant l'état (« 🏠 télétravail · en cours »). La fiche dit la même chose.
- **Daily et cérémonies** : un absent n'y va pas, n'est pas tiré au sort pour animer la rétro ; si la facilitatrice est absente, le boss anime le planning.
- **Mode TV** : le tour de table du stand-up saute les absents, et la scène « Le sprint » les cite : « Absences aujourd'hui : Darryl (ce matin), Clark · 🏠 En télétravail : Holly ».

![Stand-up : la scène du sprint](../img/standup.png)

## Le calendrier de l'équipe

Un petit calendrier est accroché au mur du bureau du boss, entre le planning des crons et son fauteuil. Un clic dessus ouvre la fiche « Calendrier de l'équipe » : cette semaine et la suivante, du lundi au vendredi (le week-end, à partir du lundi qui vient).

![Calendrier de l'équipe](../img/calendrier.png)

- `●` au bureau, `🏠` télétravail, `—` absence ; une case coupée en deux = une demi-journée (matin | après-midi) ; les jours fériés sont marqués ; aujourd'hui est encadré.
- Un nom ouvre la fiche de la personne.
- Sans planning (pas de section `microsoft`), ni calendrier au mur, ni absences : tout le monde est au bureau, comme avant.

## Mise en place

- Le planning est lu par Microsoft Graph avec la connexion **Microsoft 365** de Kronn (Kronn > MCP, sans clé, **globale**), qui emprunte ton `az login` (Azure CLI) : `brew install azure-cli` puis `az login --allow-no-subscriptions`.
- Dans `bureau.config.json`, une section `microsoft` : l'id de cette connexion et ceux du classeur (site et fichier, tels que Graph les donne). Le cron « Le Bureau · absences » est alors créé par `python3 tools/publish.py workflows` (à lancer deux fois pour un nouveau cron) ; sans cette section, il ne l'est pas.
- Les personnes sont retrouvées par leur nom complet (champ `person` du roster), sans accents ni ordre des mots (« Barbe Rémi » = « Remi Barbe »).
- Le classeur est annuel : en janvier, mets à jour l'id du fichier de la nouvelle année.
- Si la connexion `az` expire, le cron échoue : la [fraîcheur des données](10-fraicheur.md) le signale, relance `az login`.
