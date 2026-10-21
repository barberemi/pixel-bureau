// ---------- scènes d'équipe : le sprint et les tickets qui changent de colonne se jouent sur le plan ----------
// Priorité dans stateAt0 : après le daily et la MEP, avant le travail ordinaire ; pour le boss, après ses validations.
// Sprint planning et rétrospective (ceremonyAt, 30-data.js) : toute l'équipe en salle de réunion, l'animateur en bout de table.
const SCENE_TELL=2*60e3, KICKOFF_MS=5*60e3;
const PIZZA_LUNCH=[12*60,12*60+40], PIZZA_TABLE=[11*60+45,14*60]; // minutes de Paris : le repas, les boîtes sur la table
const FLOW=Object.assign({test:'To Test',validated:'To Deploy',reopened:'Reopen'},CFG.jira_flow||{});
const shortKey=k=>String(k).replace(/^[A-Z][A-Z0-9]*-/,'');
const deskZone=c=>c.boss?'boss':'desk'; // le boss reste à son bureau de boss
let MOVES_MEMO={team:null,list:[]};
// passages du jour à tester, validé, réouvert (team.events) : {t, key, kind, author, dev (l'assigné), qa (le testeur)} ;
// t = première vue par le cron équipe (seen) quand il l'a appris en retard, pour que la scène se joue en direct
function teamMoves(){
  if(MOVES_MEMO.team===TEAM)return MOVES_MEMO.list;
  const kind={[FLOW.test]:'test',[FLOW.validated]:'validated',[FLOW.reopened]:'reopened'}, qa=chars.find(x=>x.person&&x.roleKind==='qa')||null;
  const list=((TEAM&&TEAM.events)||[]).filter(e=>e.kind==='move'&&kind[e.to]).map(e=>({t:ms(e.seen||e.t),key:e.key,kind:kind[e.to],
    author:personChar(e.who,e.who_name),dev:chars.find(x=>x.person&&x.team&&(x.team.tickets||[]).some(k=>k.key===e.key))||null,qa}))
    .sort((a,b)=>a.t-b.t);
  MOVES_MEMO={team:TEAM,list};
  return list;
}
// ticket réouvert avec un héraut (invité on: « reopen », ex. le mage) : il entre par la porte ; lui, l'auteur et l'assigné
// se retrouvent en salle de réunion, l'assigné d'un côté de la table face aux deux autres ; le héraut crie (shout, en grand)
const HERALD_MS=3*60e3;
const herald=()=>chars.find(x=>x.guest&&x.on==='reopen')||null;
function standoff(){ // en salle de réunion : l'assigné d'un côté de la table, le testeur et le héraut en face
  const meet=SPOTS.meet||[], up=meet.filter(p=>p[2]==='down').sort((a,b)=>a[0]-b[0]), down=meet.filter(p=>p[2]==='up').sort((a,b)=>a[0]-b[0]);
  if(up.length&&down.length>=2){
    const d=up[Math.floor(up.length/2)], near=down.slice().sort((a,b)=>Math.abs(a[0]-d[0])-Math.abs(b[0]-d[0])).slice(0,2).sort((a,b)=>a[0]-b[0]);
    return {dev:[d[0],d[1],'down'],tester:[near[0][0],near[0][1],'up'],herald:[near[1][0],near[1][1],'up']};
  }
  const g=((SPOTS.gate||[]).slice()).sort((a,b)=>a[0]-b[0]||a[1]-b[1]); // plan sans salle de réunion assez grande
  if(g.length<3)return null;
  return {dev:[g[0][0],g[0][1],'right'],tester:[g[g.length-2][0],g[g.length-2][1],'left'],herald:[g[g.length-1][0],g[g.length-1][1],'left']};
}
function heraldScene(c,t,m,h){
  const pos=standoff(); if(!pos||!m.dev||!m.author||m.author===m.dev)return undefined; // pas de face-à-face possible
  const k=shortKey(m.key);
  if(t<m.t+HERALD_MS){
    if(c===m.dev)return {st:'reopen',zone:'visit',visit:pos.dev,human:true,label:m.key+' réouvert : convoqué devant '+h.name,bubble:'😨 '+k};
    if(c===m.author)return {st:'reopen',zone:'visit',visit:pos.tester,human:true,label:'Annonce que '+m.key+' est réouvert'}; // pas de bulle : celles de l'assigné et du héraut suffisent, côte à côte
    if(c===h)return {st:'reopen',zone:'visit',visit:pos.herald,label:m.key+' ne passera pas',bubble:h.shout||'🧙',big:true};
    return null;
  }
  return null;
}
// le héraut lui-même : seulement pendant un face-à-face, puis il repart par la porte
function heraldState(c,t){
  for(const m of teamMoves()){
    if(m.kind!=='reopened'||t<m.t||t>=m.t+HERALD_MS+2*60e3)continue;
    if(t<m.t+HERALD_MS){const sc=heraldScene(c,t,m,c);if(sc)return sc;continue;}
    return {st:'gone',label:'Reparti'};
  }
  return {st:'off',label:'Attend un ticket réouvert'};
}
// mise en prod réussie avec un héraut (invité on: « prod », ex. Yoda) : pendant la fête, il entre par la porte, monte sur la
// scène à côté de l'auteur (le boss est au sax) et le félicite en grand 3 min (shout, {name} = prénom de l'auteur), puis repart
function prodHeraldState(c,t){
  const live=mepsAt(t).filter(x=>x.phase==='done'&&t<ms(x.m.prod.end)+HERALD_MS+2*60e3), z=live[live.length-1];
  if(!z)return {st:'off',label:'Attend une mise en prod'};
  if(t>=ms(z.m.prod.end)+HERALD_MS)return {st:'gone',label:'Reparti'};
  const name=mepName(z.m);
  const shout=(c.shout||'Bravo {name} !').replace(name?/\{name\}/g:/,?\s*\{name\}/g,name);
  return {st:'proud',zone:inDaily(t)?'daily':'stage',label:'Félicite '+(name||"l'équipe")+' pour la mise en prod '+z.m.tag,bubble:shout,big:true}; // prod finie pendant le daily : il les y rejoint
}
// ticket réouvert : face-à-face avec le héraut s'il y en a un, sinon l'auteur va le dire à l'assigné à sa place
function reopenScene(c,t,m){
  const h=herald(); if(h){const sc=heraldScene(c,t,m,h);if(sc!==undefined)return sc;}
  if(m.author&&m.dev&&m.author!==m.dev&&m.dev.seat&&c===m.author&&t<m.t+SCENE_TELL)
    return {st:'reopen',zone:'visit',visit:besideSeat(m.dev.seat),human:true,label:'Vient dire à '+m.dev.name+' que '+m.key+' est réouvert',bubble:'🔁 '+shortKey(m.key)+' réouvert'};
  return null;
}
// ticket à tester : le développeur porte le dossier au bureau du testeur (il rejoint sa pile, 40-furniture.js)
function deliverScene(c,t,m){
  const dev=m.dev||m.author;
  if(c===dev&&m.qa&&m.qa!==dev&&m.qa.seat&&t<m.t+SCENE_TELL)
    return {st:'deliver',zone:'visit',visit:besideSeat(m.qa.seat),human:true,label:'Apporte '+m.key+' à tester à '+m.qa.name,bubble:'📁 '+shortKey(m.key)};
  return null;
}
// ticket validé : le testeur lève le pouce depuis son bureau, le développeur lève les bras
function validatedScene(c,t,m){
  if(t>=m.t+SCENE_TELL)return null;
  const tester=m.author||m.qa;
  if(c===tester&&c!==m.dev)return {st:'thumbs',zone:deskZone(c),human:true,label:'Valide '+m.key+(m.dev?' de '+m.dev.name:''),bubble:'👍 '+shortKey(m.key)+' validé'};
  if(c===m.dev)return {st:'cheer',zone:deskZone(c),human:true,label:m.key+' validé'+(tester&&tester!==c?' par '+tester.name:''),bubble:'🙌'};
  return null;
}
const SCENES={reopened:reopenScene,test:deliverScene,validated:validatedScene};
// jours du sprint (Paris) : premier jour = lancement devant le Kanban après le daily, dernier jour = pizzas
const sprintDay=k=>{const s=TEAM&&TEAM.sprint;return s&&s[k]?parisDay(ms(s[k])):null;};
// dernier jour : fin prévue du sprint actif, ou celle du sprint qu'on vient de clôturer (souvent le matin même, le suivant
// déjà ouvert : les pizzas restent ce jour-là) ; ancien dataset sans planned_end : sa date de clôture
const prevSprintDay=()=>{const p=TEAM&&TEAM.prev_sprint,e=p&&(p.planned_end||p.end);return e?parisDay(ms(e)):null;};
const lastSprintDay=t=>{const d=parisDay(t);return (sprintDay('end')===d||prevSprintDay()===d)&&!RHYTHM.weekend.includes(parisHM(t).wd);};
function teamScene(c,t){
  const s=TEAM&&TEAM.sprint, m0=parisMin(t), d0=parisMidnight(t)+(DAILY_MIN+RHYTHM.daily_minutes)*60e3;
  if(s&&sprintDay('start')===parisDay(t)&&t>=d0&&t<d0+KICKOFF_MS)
    return {st:'kickoff',zone:'kanban',human:true,label:'Lancement du sprint '+(s.name||'')+' devant le Kanban',bubble:'🏁'};
  if(lastSprintDay(t)&&m0>=PIZZA_LUNCH[0]&&m0<PIZZA_LUNCH[1])
    return {st:'pizza',zone:['ktable','coffee','sofa'][keySeed(c.key)%3],human:true,label:'Pizza de fin de sprint',bubble:'🍕'};
  for(const m of teamMoves()){
    if(t<m.t||t>m.t+HERALD_MS)continue; // la plus longue : le face-à-face
    const sc=SCENES[m.kind](c,t,m);
    if(sc)return sc;
  }
  return null;
}
// décor : boîtes de pizza sur la table de la cuisine le dernier jour du sprint (dossiers du testeur : rolePile, 40-furniture.js)
function sceneFurniture(){
  const o=furnAt('kitchen_table');
  FURN.push({y:6*TS+2+(o?o.dy:0),draw:()=>{const m0=parisMin(T);if(!lastSprintDay(T)||m0<PIZZA_TABLE[0]||m0>=PIZZA_TABLE[1])return;
    onF('kitchen_table',()=>{const {x,y}=KTABLE;
      for(let i=0;i<3;i++){R(ctx,x+4+i*18,y+2-i*2,16,5,'#c98b4a');R(ctx,x+4+i*18,y+2-i*2,16,1,'#e0b07a');}
      E('🍕',x+30,y-8,13);});}});
}
// ---------- cérémonies : sprint planning et rétrospective, en salle de réunion ----------
// l'animateur en bout de table (la place de réunion tournée vers la table sur le côté), les autres autour
function headSpot(){
  const meet=SPOTS.meet||[], h=meet.find(p=>p[2]==='left'||p[2]==='right');
  return h?[h[0],h[1],h[2]]:null;
}
const CEREMONY_BUBBLE={planning:'🗓️ Planning',retro:'🔁 Rétro'};
function ceremonyState(c,cr,pending){
  const host=ceremonyHost(cr), head=headSpot();
  if(c===host)return {st:cr.k,zone:head?'visit':'meet',visit:head,human:true,label:'Anime la '+cr.title.toLowerCase()+(pending?' · '+pending:''),
    bubble:CEREMONY_BUBBLE[cr.k],big:true};
  return {st:cr.k,zone:'meet',human:true,label:cr.title+(host?' animée par '+host.name:'')+(pending?' · '+pending:''),bubble:null};
}
