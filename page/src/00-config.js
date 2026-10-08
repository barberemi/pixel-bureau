const EMBEDDED_LAYOUT = __LAYOUT__; // plan du bureau embarqué (layouts/*.json de l'installation)
// plan d'équipe partagé : dataset `layout`, publié par le workflow « Le Bureau · plan » après validation du boss et
// vérifié par tools/plan.py. undefined = pas de dataset lisible, null = retour au plan embarqué, sinon le plan.
// La page n'en contrôle que la forme : le script l'a déjà validé.
function readLayout(src){
  try{
    let d=src&&src.datasets&&src.datasets.layout;
    if(d&&d.current!==undefined)d=d.current;
    if(typeof d==='string')d=JSON.parse(d);
    if(!d||typeof d!=='object'||!('layout' in d))return undefined;
    const L=d.layout;
    return L&&L.format==='bureau-layout/1'&&Array.isArray(L.size)&&Array.isArray(L.tiles)?L:null;
  }catch(e){return undefined;}
}
let LAYOUT = readLayout(window.KronnPageData)||EMBEDDED_LAYOUT; // lu par 10-world.js
const SPR = __SPRITES__;   // sprites fournis tels quels (boss_sax)
const LAYERS = __LAYERS__; // calques LPC (sprites/build_layers.py)
const RECIPES = __CAST__;  // recette de chaque avatar (sprites/cast.json)
const MUSIC = __MUSIC__;   // morceau de chaque collègue (teams/<équipe>/music, puis la config)
const DEMO = __DEMO__;        // aperçu local / tests : instantanés de démo embarqués ; false dans la page publiée
const SNAP = __SNAP__;        // instantané de démo (null hors démo)
const TEAM_SNAP = __TEAM__;   // équipe de démo (null hors démo)
const ACTIONS = __ACTIONS__;  // boutons disponibles (workflow ou QP configuré dans bureau.config.json)
// clés de data-kronn-bindings qu'attend Kronn : {id d'action : {nom de la variable liée : champ de la ligne (find(champ))}}
const ACTION_BINDS = __ACTION_BINDS__;

// ---------- casting ----------
const ROSTER_DEF = __ROSTER__;
const ROSTER = ROSTER_DEF.people; // l'équipe : teams/<équipe>/roster.json, puis les personnes ajoutées à l'installation
// invités de passage (clé guests) : hors équipe, au plus une visite par jour ouvré (35-state.js, guestState)
const GUESTS = (ROSTER_DEF.guests||[]).map(({person,...g})=>({...g,wf:[],seat:null,visitor:true,guest:true,role:g.role||'De passage'})); // jamais un collègue (person)
const OWNER = __OWNER__;          // bureau.config.json : clé du roster de qui a installé la page (le boss)
// partie « page » de bureau.config.json (tools/assemble.py) ; chaque valeur a un défaut : une config vide ne casse rien
const CFG = __CONFIG__;
const RHYTHM = {timezone:'Europe/Paris',location:[48.857,2.352],daily:'09:40',daily_minutes:15,office_hours:[8,20],mep_freeze:['Fri','Sat','Sun'],weekend:['Sat','Sun'],
  // cérémonies en salle de réunion (30-data.js, ceremonyAt) : every = toutes les N semaines, à compter de la semaine de from ; null = pas de cérémonie
  planning:{day:'Fri',at:'10:00',minutes:30},retro:{day:'Thu',at:'15:00',minutes:60,every:2,from:'2026-10-15'},...(CFG.rhythm||{})};
const TZ = RHYTHM.timezone;
// graine stable tirée d'une clé (personnage, ticket) : rotation des bulles, phase d'animation, flânerie
const keySeed=k=>[...String(k)].reduce((a,ch)=>a+ch.charCodeAt(0),0);
// formateurs de dates du fuseau du bureau, créés une fois (certains servent à chaque image : en créer un coûte cher)
const DTF_CACHE={};
function dtf(locale,opts){const k=locale+JSON.stringify(opts);return DTF_CACHE[k]||(DTF_CACHE[k]=new Intl.DateTimeFormat(locale,Object.assign({timeZone:TZ},opts)));}
// agents : un personnage par groupe de workflows (préfixes d'id), propres à cette installation
const AGENTS = (CFG.agents||[]).map(a=>({...a,wf:a.wf||[]}));
// casting : le propriétaire devient le boss (bureau du boss, sprite de boss s'il en a un), les autres gardent leur place
const CAST = [
  ...ROSTER.map(({boss_sprite,...p})=>p.key===OWNER?{...p,wf:[],boss:true,seat:null,role:'Le boss',sprite:boss_sprite||p.sprite}:{...p,wf:[]}),
  ...AGENTS,
];
const FREE_SEATS = []; // places des intérimaires et des collègues sans place, remplies par 10-world.js
const JIRA_BROWSE = (CFG.jira_site||'').replace(/\/$/,'')+'/browse/'; // lien d'un ticket
const KRONN_BASE = CFG.kronn_ui||'http://localhost:5173/';
const VISITOR = {ClaudeCode:'v_claude', Codex:'v_codex', GeminiCli:'v_gemini', Gemini:'v_gemini'};

