// ---------- couleurs des états : une seule table (audit UX 1.4) ----------
// Chaque état a deux tons. Le vif : pastille de légende, anneau, barre, texte du panneau, aplat avec encre sombre. Le foncé :
// aplat avec texte blanc sur le plan, texte posé sur une bulle claire. Mêmes valeurs que --ok … --idle et --ok-deep …
// --idle-deep du thème Classique (theme-classique.css ; tests/etats.test.js vérifie l'égalité, tools/theme.py les contrastes).
// Le canvas veut une vraie couleur : il lit cette table ; le HTML garde var(--ok) pour suivre le thème.
const ST_VIF={ok:'#4cc27c',info:'#7aa2f2',warn:'#f0b03a',err:'#f06a5f',idle:'#9a9284'};
const ST_FONCE={ok:'#2f7a45',info:'#2f6fd6',warn:'#8a5a00',err:'#a8323a',idle:'#5b6070'};
// le cyan des hologrammes des agents (41-people.js) : aussi la famille « Au quotidien » (32-familles.js) et le groupe « Les
// agents » du panneau (--holo de styles.css, même valeur ; audit UX 1.8)
const HOLO_C='#5fd4ff';
