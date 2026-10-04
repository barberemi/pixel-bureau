const LAYOUT = __LAYOUT__;   // plan du bureau (layouts/*.json), lu par 10-world.js
const SPR = __SPRITES__;   // sprites fournis tels quels (boss_sax)
const LAYERS = __LAYERS__; // calques LPC (sprites/build_layers.py)
const RECIPES = __CAST__;  // recette de chaque avatar (sprites/cast.json)
const MUSIC = __MUSIC__;   // morceau de chaque collègue (sprites/music/music.json)
const DEMO = __DEMO__;        // aperçu local / tests : instantanés de démo embarqués ; false dans la page publiée
const SNAP = __SNAP__;        // instantané de démo (null hors démo)
const TEAM_SNAP = __TEAM__;   // équipe de démo (null hors démo)
const ACTIONS = __ACTIONS__;  // boutons disponibles (workflow ou QP configuré dans bureau.config.json)

// ---------- casting ----------
const ROSTER = __ROSTER__.people; // team/roster.json : l'équipe, identique pour tous
const OWNER = __OWNER__;          // bureau.config.json : clé du roster de qui a installé la page (le boss)
// partie « page » de bureau.config.json (tools/assemble.py) ; chaque valeur a un défaut : une config vide ne casse rien
const CFG = __CONFIG__;
const RHYTHM = {timezone:'Europe/Paris',location:[48.857,2.352],daily:'09:40',daily_minutes:15,office_hours:[8,20],mep_freeze:['Fri','Sat','Sun'],weekend:['Sat','Sun'],...(CFG.rhythm||{})};
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
const FREE_SEATS = LAYOUT.free_seats.map(s=>s.slice()); // places libres du plan (intérimaires, collègues sans place)
// la place du propriétaire se libère quand il passe au bureau du boss
{const o=ROSTER.find(p=>p.key===OWNER);if(o&&o.seat&&!FREE_SEATS.some(s=>s[0]===o.seat[0]&&s[1]===o.seat[1]))FREE_SEATS.push(o.seat);}
const JIRA_BROWSE = (CFG.jira_site||'').replace(/\/$/,'')+'/browse/'; // lien d'un ticket
const KRONN_BASE = CFG.kronn_ui||'http://localhost:5173/';
const VISITOR = {ClaudeCode:'v_claude', Codex:'v_codex', GeminiCli:'v_gemini', Gemini:'v_gemini'};

