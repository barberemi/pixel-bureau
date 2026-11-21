// ---------- préférences du navigateur (#16) ----------
// Clé « bureau:<k> » de localStorage. Refusé (cadre de Kronn sans même origine, navigation privée) ou illisible : la
// valeur par défaut, et rien n'est gardé ; c'est voulu, pas une erreur. pref : JSON ; prefStr : texte tel quel (thème,
// étage, fil, TV, loupe sont gardés en texte depuis le début : on les relit tels quels). setPref : un texte tel quel, le
// reste en JSON.
function pref(k,def){try{const v=localStorage.getItem('bureau:'+k);return v===null?def:JSON.parse(v);}catch(e){return def;}}
function prefStr(k,def){try{const v=localStorage.getItem('bureau:'+k);return v===null?def:v;}catch(e){return def;}}
function setPref(k,v){try{localStorage.setItem('bureau:'+k,typeof v==='string'?v:JSON.stringify(v));}catch(e){}}
function dropPref(k){try{localStorage.removeItem('bureau:'+k);}catch(e){}}
