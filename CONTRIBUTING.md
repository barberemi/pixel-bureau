# Contribuer au Bureau

Merci de passer par ici. Le Bureau est une Live Page Kronn en pixel art, alimentée par des crons Kronn à 0 token : la page se lit dans [le README](README.md), le code et ses outils dans [le guide de développement](guide/developpement.md).

## 💬 Avant de coder
- **Un bug, une idée, de la dette** : ouvre une issue avec le formulaire qui va bien. Pour une fonctionnalité visible, attends un retour sur l'issue avant de t'y mettre.
- **Une faille de sécurité** : jamais dans une issue publique, passe par [un avis de sécurité privé](https://github.com/barberemi/kronn-bureau/security/advisories/new).

## 🛠️ Mettre en place
```sh
python3 -m venv .venv && .venv/bin/pip install pillow websocket-client
git config core.hooksPath .githooks   # refuse un push direct sur main
sh tools/test.sh --chrome             # tests JS, tests Python, page dans Chrome headless
```
Il faut Python 3.9 ou plus, Node 20 ou plus (sans dépendance npm) et Chrome ou Chromium. Le détail est dans [le guide de développement](guide/developpement.md).

## 🔀 Le circuit
1. **Une branche par changement**, nommée `type/sujet` (`fix/fil-pr`, `feat/fiche-pr`…), jamais de commit sur `main`.
2. **Des commits au format** `type(portée): sujet`, en français : `feat`, `fix`, `perf`, `style`, `docs`, `test`, `chore`, `ci`. Un commit par changement, signé.
3. **Une PR** avec le modèle proposé, assignée au mainteneur (`gh pr create --fill --base main --assignee @me` pour les mainteneurs).
4. **CI « Tests » verte**, relecture, puis **merge en squash** (seul mode autorisé).
5. La publication de la page et des workflows (`tools/publish.py`) se fait depuis `main` à jour, après le merge, par un mainteneur.

## ✅ Les règles du dépôt
- **Un test avec chaque changement de code** : `tests/*.test.js` pour la page, `tests/test_*.py` pour les scripts et les outils.
- **Changement visible = doc dans la même PR** : la page `guide/fonctionnalites/NN-*.md`, la ligne du tableau du README et les captures (`.venv/bin/python tools/shots.py [nom]`). Ne commiter que les captures qui changent vraiment.
- **On édite `page/src/*` et `page/office_template.html`**, jamais `dist/` (produit par `tools/assemble.py`).
- **Page sans ressource externe** : ni `import`, ni lien vers un autre site ; images et polices en `data:`. La page publiée doit rester sous 1 000 000 octets (le smoke alerte à 90 %).
- **Dans les scripts de `workflows/`** : ni `{{` ni `@@` (variables de Kronn), sortie d'étape sous 100 Ko, pas d'import d'un fichier voisin autre que `_lib.py` et `_plan.py`.
- **Rien de réel dans la démo** (`data/`, équipe fictive Dunder Mifflin), **rien d'individuel ni de vanne visant une personne** dans la page.
- **Tout est rejouable** : on date par les données, jamais par l'heure du calcul.
- **Pas de tiret cadratin** dans les textes.
- **Ni `.gitignore` ni `bureau.config.json`** dans une PR (la config est propre à chaque installation).

Les agents (Claude, Codex, Gemini…) suivent les mêmes règles, détaillées dans [docs/AGENTS.md](docs/AGENTS.md).

## 🤝 Code de conduite
En participant, tu acceptes [le code de conduite](CODE_OF_CONDUCT.md).
