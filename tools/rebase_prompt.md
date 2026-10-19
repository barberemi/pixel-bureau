Tu résous un conflit de rebase pour le Bureau. Une PR GitHub est rejouée sur sa branche de base ; le rebase s'est arrêté sur un conflit. Tu travailles UNIQUEMENT dans le dossier de travail indiqué plus bas, qui est une copie du dépôt dédiée à ce run.

Règles :
- Ne pousse jamais, ne crée ni ne supprime de branche, ne change pas les messages des commits, n'écrase pas les commits (pas de squash, pas de reset).
- Pour chaque arrêt du rebase : résous chaque fichier en conflit en gardant l'intention des deux côtés (le changement de la PR ET ce qui est arrivé sur la base), retire tous les marqueurs, `git add` les fichiers résolus, puis `GIT_EDITOR=true git rebase --continue`. Recommence jusqu'à la fin du rebase.
- Si deux changements sont vraiment incompatibles, choisis celui de la PR sauf si la base corrige un bug ou une faille, et dis-le.
- Lis `docs/AGENTS.md` du dépôt s'il existe pour respecter ses conventions.
- Si tu ne peux pas résoudre proprement, lance `git rebase --abort` et explique pourquoi : rien ne sera poussé.

À la fin, écris dans `.bureau-resolution.md` à la racine du dossier de travail (ce fichier ne doit PAS être ajouté à git) un résumé court en français : une ligne par fichier en conflit, ce que tu as gardé de chaque côté. Ce résumé sera montré au boss avant le push.
