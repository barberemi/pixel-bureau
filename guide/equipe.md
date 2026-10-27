# Le Bureau de ton équipe

Tu veux Le Bureau pour ton équipe, dans tes bureaux à toi : une agence à Lyon, un plateau chez Dunder Mifflin à Scranton, n'importe où. Ce guide va du dossier de ton équipe jusqu'à la page en ligne, dans l'ordre. L'exemple tout du long : Dunder Mifflin, l'équipe fictive de la démo.

Ton équipe vit dans un **pack d'équipe** : un dossier à toi, hors du dépôt du Bureau, en général un dépôt Git privé. Les vrais noms de tes collègues, leurs logins, le plan de tes bureaux et les couleurs de ton entreprise y restent, jamais dans le dépôt public du Bureau. C'est aussi là que va une marque : son nom, son logo, ses couleurs ne se publient pas sans l'accord de leur propriétaire.

## 1. Créer le pack

Pars du pack d'exemple, une petite équipe fictive (Vance Réfrigération, le voisin de Dunder Mifflin) avec un plan, un thème et une musique :

```sh
cp -R tests/fixtures/pack-exemple ~/Sites/bureau-dunder-mifflin
cd ~/Sites/bureau-dunder-mifflin && git init
```

Puis donne-lui son nom dans `team.json` :

```json
{
 "name": "Dunder Mifflin, Scranton",
 "layout": "layouts/plan.json",
 "github_org": "dunder-mifflin"
}
```

`github_org` est facultatif : s'il est là, seuls les membres actifs de cette organisation GitHub peuvent installer l'équipe (l'installateur le vérifie avec `gh`). Le format complet du pack, fichier par fichier : [docs/conventions/pack-equipe.md](../docs/conventions/pack-equipe.md).

## 2. Ajouter les collègues

Une entrée par personne dans `roster.json`, liste `people` :

```json
{"key": "p_pam", "name": "Pam", "role": "Développeuse", "person": "Pam Beesly", "github": "pambeesly"}
{"key": "p_jan", "name": "Jan", "role": "Product owner", "person": "Jan Levinson", "roleKind": "po"}
```

| Champ | Ce que c'est |
| --- | --- |
| `key` | identifiant stable, `p_` puis le prénom (avatars, places, musique s'y rattachent) |
| `name` | le prénom affiché sur le plan |
| `role` | le métier affiché dans sa fiche |
| `person` | son nom **exact dans Jira** : c'est par lui que Le Bureau retrouve ses tickets |
| `github` | son login GitHub : ses PR, et l'installateur le reconnaît quand c'est lui qui installe |
| `roleKind` | un rôle d'équipe qui change ce qu'il fait sur le plan : `po` (écrit et trie les tickets), `sm` (anime le daily et les cérémonies), `qa` (teste), `lead` ; rien pour un développeur |
| `seat` | facultatif, sa place si le plan ne le place pas (« `I2.R2` » : îlot 2, côté droit, rang 2) |

Les collègues de passage (dans le sprint mais pas dans le roster) apparaissent tout seuls, au fond de l'open space. Les invités (un héraut qui annonce les mises en prod, par exemple) vont dans la liste `guests` ; les communs, Yoda et Gandalf, sont déjà là.

## 3. Leur apparence

Le plus simple : sur la page une fois installée, le bouton ✏️ de la fiche de chacun ouvre l'éditeur d'avatar ; une apparence enregistrée « pour toute l'équipe » vaut pour tout le monde ([Avatars](fonctionnalites/09-avatars.md)).

Pour qu'elle soit dans le pack dès l'installation, une recette par personne dans `cast.json` (mêmes choix que l'éditeur) :

```json
{"p_pam": {"sex": "female", "skin": "light", "hair": "bangs_bun", "hair_color": "#a0522d", "shirt": "#d9c7a0", "legs": "pants", "legs_color": "#3b3f52"}}
```

Un personnage fait sur le [générateur LPC](https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator) (un costume, un accessoire que l'éditeur n'a pas) : sa planche exportée (832 px de large) dans un sous-dossier `sprites/<nom>/` du pack, puis `python3 sprites/build_sprites.py ~/Sites/bureau-dunder-mifflin` fabrique le `sprites.json` du pack ; la personne y renvoie par `"sprite": "<nom>"` ([Sprite fourni](fonctionnalites/09-avatars.md#sprite-fourni)). Une planche dessinée à la main qui répète la même enjambée sur ses images de marche de côté fait glisser le personnage : `build_sprites.py` l'avertit (« ⚠ <nom> : marche de côté figée »), il faut alors redessiner le pas avec une image où les jambes se rejoignent.

## 4. Le plan de tes bureaux

Pas besoin d'écrire le plan à la main : Claude le dessine à partir d'un croquis ou d'une photo de l'étage, et le vérificateur le corrige ([Partir d'un croquis ou d'une photo](fonctionnalites/01-plan.md#partir-dun-croquis-ou-dune-photo)) :

```sh
python3 tools/plan.py from-image croquis-scranton.jpg   # brouillon dans dist/plan-brouillon.json
python3 tools/plan.py check dist/plan-brouillon.json     # ce qui bloque encore, avec les coordonnées
.venv/bin/python tools/plan.py preview dist/plan-brouillon.json   # le voir : dist/plan.png
```

Range le résultat dans le pack (`layouts/plan.json`, celui que nomme `team.json`). Qui s'assoit où se règle dans le plan (`seating`), et se vérifie avec `python3 tools/plan.py seats layouts/plan.json`. Le format en détail : [Plan du bureau](developpement.md#plan-du-bureau-layoutsjson). Plus tard, un nouveau plan se propose à toute l'équipe depuis la page ([Changer de plan pour toute l'équipe](fonctionnalites/01-plan.md#changer-de-plan-pour-toute-léquipe)).

## 5. Les couleurs de ton entreprise

Un thème de page dans `themes/theme-<id>.css` du pack, qui ne sera proposé qu'à ton équipe. Pars du thème livré, complet (fonds, textes, cadres pixel) : `page/src/theme-classique.css`, copié en `themes/theme-dundermifflin.css` (pour un thème clair, `color-scheme:light` et fonds et textes inversés), puis :

```css
/* @nom: Dunder Mifflin */
:root[data-skin="dundermifflin"]{ … --bg:#f4f1ea; --panel:#ffffff; --ink:#1d2433; --accent:#1f4e8c; … }
```

La première ligne donne son nom au bouton 🎨 ; remplace partout `data-skin="classique"` par `data-skin="dundermifflin"`, puis les couleurs. Pour qu'il soit le thème par défaut de l'équipe : `"ui": {"skin": "dundermifflin"}` dans `defaults.json`. Une police va dans `fonts/` du pack avec sa licence (une police de marque n'est pas toujours libre). Les variables à redéfinir et le contraste attendu : [Ajouter un thème](developpement.md#ajouter-un-thème), et les thèmes livrés : [Thème de la page](fonctionnalites/13-theme-page.md).

## 6. Le reste, facultatif

- `defaults.json` : le titre de la page, ton Jira et ton dépôt GitHub, proposés à l'installation (recopiés dans la config de chacun).
- `settings.json` : les réglages de toute l'équipe, lus à chaque publication de la page et des crons, sans rien recopier : le rythme (fuseau, heures de bureau, heure et durée du daily, gel des mises en prod, week-end), les cartes GitFut, les affiches du Top 3, le planning des absences (site et classeur SharePoint) et les **personnages des agents** (clé, nom, métier, place, sprite). Pas d'id Kronn dedans : chacun rattache les personnages à ses propres workflows à l'installation (`python3 tools/install.py --rattacher` pour le refaire), et sa config peut surcharger n'importe quel réglage (un autre daily, par exemple). Un personnage peut incarner un modèle du Bureau (`"model": "review_one"`, ou une liste) : il est alors rattaché d'office au workflow que l'installateur a créé. Pareil pour un bouton des fiches (`"model": "rebase"`, `"env"`, `"deploy"`) : chacun a le même agent sur le même bouton, sans rien rattacher, un agent par bouton. La revue de PR par un agent lit aussi dans `settings.json` la clé `review` : `guidelines` (consignes de l'équipe ajoutées à la grille du Bureau, par exemple vos conventions ou la posture pour les débutants), `skill_ids` (skills Kronn de l'équipe), `repos` (dépôts relus par le cron, sinon les PR suivies) et `schedule` (heures UTC du cron). Le bouton « 🌿 Générer l'env de branche » des fiches lit la clé `env` : `label` (le label GitHub qui construit l'environnement d'une PR, `env-branch` par défaut), `repos` (les dépôts concernés) et `url` (le motif de l'adresse de l'env que la CI poste en commentaire de la PR : le Kanban en fait un lien) ; avec elle, l'installateur propose d'office le modèle qui le fait marcher, et chacun a le bouton sans rien régler. Le bouton « 🚀 Déployer la branche » lit la clé `deploy` : `repos`, chaque dépôt avec son workflow hors prod (`workflow`, sinon son `staging_workflow`) et ses envs (`envs` : les inputs envoyés au workflow pour chacun, par exemple `{"dev": {"envchoice": "dev", "versiontags": ""}}`) ; jamais la prod.
- `music/music.json` : le morceau de chacun, sur sa fiche (« Sa musique »).
- Les passions de chacun (`passion` dans le roster) : [Les passions de l'équipe](fonctionnalites/01-plan.md#les-passions-de-léquipe).

## 7. Valider le pack

Les outils du Bureau vérifient un pack sans rien publier : ses plans, les contrastes de ses thèmes (texte lisible sur chaque fond), puis la page de démo assemblée avec ton équipe, chargée dans Chrome (aucune erreur JS attendue) :

```sh
python3 tools/plan.py check ~/Sites/bureau-dunder-mifflin/layouts/plan.json
python3 tools/theme.py check ~/Sites/bureau-dunder-mifflin/themes/theme-*.css
.venv/bin/python tools/smoke.py --team ~/Sites/bureau-dunder-mifflin --chrome   # page dans dist/office_team.html
```

Pour documenter ton pack, les captures du guide se refont avec ton équipe : la démo lui est réattribuée (le boss de la démo devient la première personne de ton roster, chaque métier va au même métier), sur ton plan, avec tes avatars et ton thème. Seules les captures qui ne visent aucun personnage de la démo sont prises (plan, qui fait quoi, fil, récap, Kanban, MEP, calendrier, fiche d'un agent, rétro, mode TV, stand-up) :

```sh
.venv/bin/python tools/shots.py --team ~/Sites/bureau-dunder-mifflin          # dans <pack>/guide/img/
.venv/bin/python tools/shots.py --team ~/Sites/bureau-dunder-mifflin plan tv  # seulement celles-ci (--out : un autre dossier)
```

Le pack d'exemple apporte la même vérification en CI GitHub (`.github/workflows/pack.yml`, copiée avec lui) : sur chaque PR et chaque push sur `main`, elle clone le Bureau à côté du pack et lance ces trois contrôles.

## 8. Installer et partager

Pousse le pack dans un dépôt privé de ton organisation. Chaque personne qui veut la page dans son Kronn clone le pack, puis le Bureau, et lance l'installateur :

```sh
git clone git@github.com:dunder-mifflin/bureau-dunder-mifflin.git ~/Sites/bureau-dunder-mifflin
git clone https://github.com/barberemi/pixel-bureau.git && cd pixel-bureau
python3 tools/install.py   # « Ton équipe » : Un pack d'équipe, puis ~/Sites/bureau-dunder-mifflin
```

L'installateur lit l'équipe dans le pack, te demande qui tu es (tu prends le bureau du boss), propose le plan du pack, puis crée la page et ses workflows dans ton Kronn ([Installer](../README.md#installer)). Ta config garde le chemin du pack (clé `team`) : un `git pull` dans le pack, puis `python3 tools/publish.py all`, et la page et les crons suivent.

Une installation d'avant `settings.json` a ces réglages dans sa config : `python3 tools/split.py` montre ce qui partirait dans le pack et vérifie que la page et les workflows restent identiques octet pour octet, `--write` écrit `settings.json` dans le pack (à commiter) et allège la config (l'ancienne reste à côté, `bureau.config.json.avant-split`).
