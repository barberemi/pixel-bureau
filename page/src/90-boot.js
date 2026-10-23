// ---------- loop ----------
// 30 images par seconde suffisent (pixel art, marche à 95 px/s) : une image sur deux d'un écran à 60 Hz est sautée
const FRAME_MS=1000/30;
let lastTick=0,lastUi=0;
function loop(now){
  if(now-lastReal<FRAME_MS-2){requestAnimationFrame(loop);return;}
  const dt=Math.min(.1,(now-lastReal)/1000); lastReal=now;
  if(DATA){
    REND=liveT();
    if(mode==='live')T=REND;
    else if(mode==='play'){T+=dt*1000*SPEED;if(T>=REND&&!SCENE_DEMO){T=REND;setMode('live');}} // une démonstration peut dépasser la dernière donnée
    if(now-lastTick>250||needTeleport){tick(now);lastTick=now;}
    for(const c of chars)step(c,dt);
    tvAutoScroll(now,dt);
    if(now-lastUi>1000){lastUi=now;
      document.getElementById('clock').textContent=hms(T);
      timeUi();
      if(document.activeElement!==slider)slider.value=Math.round((T-RSTART)/Math.max(1,REND-RSTART)*1000);
      renderRecap();renderKpis();renderWho();renderFeed();updateFresh();updateTv();if(mode!=='live')updateBadge();
      if(!document.querySelector('.side details[open]'))renderSide();else refreshStatus();
    }
    pumpSheets(8);
    galleryFrame(now); // 46-gallery.js : fin d'une démonstration
    fxFrame(now); // 43-fx.js : petites scènes de 3 s (succès, éclosion, stade, agent rétabli)
    render(now);
    loupeFrame(now); // 44-loupe.js : médaillon sur l'événement fort en cours
    drawPreview(now);
    drawNewAgentPreview(now); // 66-newagent.js
  }
  requestAnimationFrame(loop);
}
paintLegend(document); // 35-state.js : pastilles de la légende aux couleurs des tables d'états et de statuts
buildFurniture();
buildBg();
bakeFurniture();
// plan partagé arrivé (ou retiré) pendant que la page est ouverte : monde, toile, fond, meubles et lumières refaits,
// puis chacun repris à sa nouvelle place (setData relit les places du casting et des intérimaires) et téléporté
let LAYOUT_KEY=JSON.stringify(LAYOUT);
function applyLayout(L){
  const key=JSON.stringify(L); if(key===LAYOUT_KEY)return false;
  LAYOUT=L; LAYOUT_KEY=key;
  buildWorld(); sizeCanvas(); buildFurniture(); buildBg(); bakeFurniture(); buildRooms();
  for(const c of chars){c.path=[];c.moving=false;c.spotKey=null;c.idlePlan=null;c.pos=null;c.tile=null;}
  ENV.fly=[];
  refreshAll(); needTeleport=true;
  return true;
}
// ---------- superposition : instantané complet (office/team, 10 min) + live (1 min) ----------
let OFFICE=null, OFFICE_IS_LIVE=false, TEAM_BASE=null, LIVE=null;
let GATES=[], PAYROLL=null, RELAUNCH=[], LAUNCHABLE=[], ASKABLE=[], QUESTIONS=[];
// listes du dataset gates : askable (agents à interroger), launchable (à lancer avec des paramètres, #64), workflows (relançables)
function gatesList(src,key){
  try{
    if(!src||!src.datasets)return null;
    let d=src.datasets.gates;
    if(d&&d.current!==undefined)d=d.current;
    if(typeof d==='string')d=JSON.parse(d);
    return d&&Array.isArray(d[key])?d[key]:null;
  }catch(e){return null;}
}
const readAskable=src=>gatesList(src,'askable'), readLaunchable=src=>gatesList(src,'launchable'), readRelaunch=src=>gatesList(src,'workflows');
function readPayroll(src){
  try{
    if(!src||!src.datasets)return null;
    let d=src.datasets.payroll;
    if(d&&d.current!==undefined)d=d.current;
    if(typeof d==='string')d=JSON.parse(d);
    return d&&Array.isArray(d.agents)&&d.generated_at?d:null;
  }catch(e){return null;}
}
function readGates(src){
  try{
    if(!src||!src.datasets)return null;
    let d=src.datasets.gates;
    if(d&&d.current!==undefined)d=d.current;
    if(typeof d==='string')d=JSON.parse(d);
    return d&&Array.isArray(d.gates)?d.gates:null;
  }catch(e){return null;}
}
// questions de discussion en attente (dataset gates, cron live) : les visiteurs qui attendent ta réponse
function readQuestions(src){
  try{
    if(!src||!src.datasets)return null;
    let d=src.datasets.gates;
    if(d&&d.current!==undefined)d=d.current;
    if(typeof d==='string')d=JSON.parse(d);
    return d&&Array.isArray(d.questions)?d.questions:null;
  }catch(e){return null;}
}
function readLive(src){
  try{
    if(!src||!src.datasets)return null;
    let d=src.datasets.live;
    if(d&&d.current!==undefined)d=d.current;
    if(typeof d==='string')d=JSON.parse(d);
    if(d&&d.payload)d=typeof d.payload==='string'?JSON.parse(d.payload):d.payload;
    return d&&Array.isArray(d.runs)?d:null;
  }catch(e){return null;}
}
function mergedOffice(){
  if(!OFFICE)return null;
  if(!LIVE||LIVE.day!==OFFICE.day&&OFFICE.day)return OFFICE;
  const runs=new Map((OFFICE.runs||[]).map(r=>[r.run,r]));for(const r of LIVE.runs||[])runs.set(r.run,r);
  const discs=new Map((OFFICE.discussions||[]).map(d=>[d.id,d]));for(const d of LIVE.discussions||[])discs.set(d.id,{...(discs.get(d.id)||{}),...d});
  return {...OFFICE,runs:[...runs.values()].sort((a,b)=>String(a.start||'').localeCompare(String(b.start||''))),discussions:[...discs.values()],
    generated_at:ms(LIVE.generated_at)>ms(OFFICE.generated_at)?LIVE.generated_at:OFFICE.generated_at};
}
function mergedTeam(){
  if(!TEAM_BASE||!LIVE||!LIVE.deploys)return TEAM_BASE;
  const t=JSON.parse(JSON.stringify(TEAM_BASE)); t.meps=t.meps||[];
  const dep=LIVE.deploys, tags=new Set([...Object.keys(dep.staging||{}),...Object.keys(dep.prod||{})]);
  for(const tag of tags){
    const st=(dep.staging||{})[tag], pr=(dep.prod||{})[tag]; let m=t.meps.find(x=>x.tag===tag);
    // autre dépôt suivi (github.deploys) : pas de release ni de ticket connus, seulement ses déploiements du jour
    if(!m){const r=st||pr;m={tag,name:r.project?tag:'Version '+tag,repo:r.repo,ticket:null,summary:null,who:null,who_name:null,released:r.project?null:r.start,staging:null,prod:null};t.meps.push(m);}
    if(st)m.staging=st; if(pr)m.prod=pr;
    m.by=(pr&&pr.by)||(st&&st.by)||m.by||null; // login GitHub de qui a lancé le déploiement (mepChar, 30-data.js)
  }
  t.meps.sort((a,b)=>String(mepStart(a)||'').localeCompare(String(mepStart(b)||'')));
  return t;
}
// bureau vide (aucune donnée encore publiée) : la page tourne, les personnages de l'équipe sont là
function emptyOffice(){
  const now=Date.now();
  return {generated_at:new Date(now).toISOString(),day:dtf('en-CA',{}).format(new Date(now)),runs:[],discussions:[],crons:[],empty:true};
}
function refreshAll(){TEAM=mergedTeam();const o=mergedOffice();if(o)setData(o,OFFICE_IS_LIVE);}
{
  const k=window.KronnPageData;
  setTeamAvatars(readAvatars(k)||{});
  GATES=readGates(k)||[];
  QUESTIONS=readQuestions(k)||[];
  RELAUNCH=readRelaunch(k)||[];
  LAUNCHABLE=readLaunchable(k)||[];
  ASKABLE=readAskable(k)||[];
  {const dk=readDuckData(k);if(dk){DUCK_PROJECTS=dk.projects;DUCKS=dk.ducks;}} // 39-duck.js
  PAYROLL=readPayroll(k);
  DUCKGAME=readDuckGame(k)||(DEMO?DUCKGAME_DEMO:null);
  ABSENCES=readAbsences(k); // 36-absences.js (démo : après refreshAll, qui crée les personnages)
  MAILS=readMails(k); // 48-mail.js
  SUPPORT=readSupport(k); // 48-support.js (#62)
  BOSS_PAGES=readBossPages(k)||[];PAGELIST=readPageList(k);PAGE_TV=readPageTv(k); // 47-bosspages.js (#61), 47-projo.js
  TODOS=readTodos(k); // 47-todos.js
  GITFUT=readGitfut(k)||{};
  ACTS=readActs(k);
  POSTERS=readPosters(k)||{};
  WARNINGS=readWarnings(k); // 33-freshness.js (#8)
  OFFICE=readData(k);
  OFFICE_IS_LIVE=!!OFFICE;
  if(!OFFICE)OFFICE=DEMO&&SNAP?SNAP:emptyOffice();
  TEAM_BASE=readTeam(k)||(DEMO?TEAM_SNAP:null);
  LIVE=readLive(k);
  if(!applyAgents(readAgents(k)||{}))refreshAll(); // 31-agents.js : agents ajoutés depuis la page (#64)
  if(!ABSENCES&&DEMO)ABSENCES=absencesDemo();
  if(!MAILS&&DEMO)MAILS=mailDemo();
  if(!TODOS&&DEMO)TODOS=todosDemo(); // 47-todos.js
  if(!SUPPORT&&DEMO)SUPPORT=supportDemo();
}
window.addEventListener('kronn:page-data',e=>{
  if(SCENE_DEMO)demoEnd(); // nouvelles données : la démonstration s'arrête, la journée reprend
  const k=e.detail||window.KronnPageData;
  applyViewParams(k);
  const d=readData(k)||readData(window.KronnPageData);
  if(d){OFFICE=d;OFFICE_IS_LIVE=true;}
  const t=readTeam(k)||readTeam(window.KronnPageData);
  if(t)TEAM_BASE=t;
  const gg=readGates(k)||readGates(window.KronnPageData);
  if(gg)GATES=gg;
  const qq=readQuestions(k)||readQuestions(window.KronnPageData);
  if(qq)QUESTIONS=qq;
  const rl=readRelaunch(k)||readRelaunch(window.KronnPageData);
  if(rl)RELAUNCH=rl;
  const la=readLaunchable(k)||readLaunchable(window.KronnPageData);
  if(la)LAUNCHABLE=la;
  const ak=readAskable(k)||readAskable(window.KronnPageData);
  if(ak)ASKABLE=ak;
  const dk=readDuckData(k)||readDuckData(window.KronnPageData);
  if(dk){DUCK_PROJECTS=dk.projects;DUCKS=dk.ducks;}
  const py=readPayroll(k)||readPayroll(window.KronnPageData);
  const bp=readBossPages(k)||readBossPages(window.KronnPageData);
  if(bp)BOSS_PAGES=bp;
  const pl=readPageList(k)||readPageList(window.KronnPageData);
  if(pl)PAGELIST=pl;
  const ptv=readPageTv(k)||readPageTv(window.KronnPageData);
  if(ptv)PAGE_TV=ptv;
  if(bp||pl)bpRefresh(); // 47-bosspages.js : la fenêtre ouverte suit (#61)
  const td=readTodos(k)||readTodos(window.KronnPageData);
  if(td)todosArrived(td);else if(dk)tdRefresh(); // 47-todos.js : le tableau et la fenêtre suivent (canard compris)
  const gf=readGitfut(k)||readGitfut(window.KronnPageData);
  if(gf)GITFUT=gf;
  const ac=readActs(k)||readActs(window.KronnPageData);
  if(ac)ACTS=ac;
  const po=readPosters(k)||readPosters(window.KronnPageData);
  if(po)POSTERS=po;
  if(py)PAYROLL=py;
  WARNINGS={...WARNINGS,...readWarnings(window.KronnPageData),...readWarnings(k)}; // dataset absent de l'événement : avertissements gardés
  const ab=readAbsences(k)||readAbsences(window.KronnPageData);
  if(ab)ABSENCES=ab;
  const ml=readMails(k)||readMails(window.KronnPageData);
  if(ml)MAILS=ml;
  const sp=readSupport(k)||readSupport(window.KronnPageData);
  if(sp)SUPPORT=sp;
  if(sp||gg)spRefresh(); // 48-support.js : la fenêtre ouverte suit (#62)
  const dg=readDuckGame(k)||readDuckGame(window.KronnPageData);
  if(dg)DUCKGAME=dg;
  const av=readAvatars(k)||readAvatars(window.KronnPageData);
  if(av){
    setTeamAvatars(av);
    if(EDIT&&EDIT.hint&&AV_TEAM[EDIT.k]&&+AV_TEAM[EDIT.k].at===EDIT.hint){
      const h=document.getElementById('avhint');
      if(h)h.innerHTML="<b>✓ Enregistré pour toute l'équipe.</b>";
    }
  }
  const l=readLive(k)||readLive(window.KronnPageData);
  if(l)LIVE=l;
  const ag=readAgents(k);
  if(ag)applyAgents(ag);
  const lay=readLayout(k);
  if(lay!==undefined&&applyLayout(lay||EMBEDDED_LAYOUT)){wideRefresh();return;} // applyLayout a déjà tout rafraîchi
  refreshAll();wideRefresh(); // 47-bosspages.js : la fenêtre large ouverte suit
  });
if(TV){document.body.classList.add('tv');NAMES_BEFORE_TV=NAMES;NAMES='all';}
applyViewParams(window.KronnPageData); // #page/<id>?tv=1 : l'écran mural démarre en mode TV
requestAnimationFrame(loop);
