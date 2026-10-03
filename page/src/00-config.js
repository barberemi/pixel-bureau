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
// agents : un personnage par groupe de workflows (préfixes d'id), propres à cette installation
const AGENTS = (CFG.agents||[]).map(a=>({...a,wf:a.wf||[]}));
// casting : le propriétaire devient le boss (bureau du boss, sprite de boss s'il en a un), les autres gardent leur place
const CAST = [
  ...ROSTER.map(({boss_sprite,...p})=>p.key===OWNER?{...p,wf:[],boss:true,seat:null,role:'Le boss',sprite:boss_sprite||p.sprite}:{...p,wf:[]}),
  ...AGENTS,
];
const FREE_SEATS = [[12,15],[35,14],[37,14],[35,15],[37,15],[35,16],[37,16],[5,14],[5,15],[5,16],[7,16],[10,14],[10,15],[10,16],[19,16]];
// la place du propriétaire se libère quand il passe au bureau du boss
{const o=ROSTER.find(p=>p.key===OWNER);if(o&&o.seat&&!FREE_SEATS.some(s=>s[0]===o.seat[0]&&s[1]===o.seat[1]))FREE_SEATS.push(o.seat);}
const JIRA_BROWSE = (CFG.jira_site||'').replace(/\/$/,'')+'/browse/'; // lien d'un ticket
const KRONN_BASE = CFG.kronn_ui||'http://localhost:5173/';
const VISITOR = {ClaudeCode:'v_claude', Codex:'v_codex', GeminiCli:'v_gemini', Gemini:'v_gemini'};

