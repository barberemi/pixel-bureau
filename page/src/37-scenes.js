// ---------- scènes d'équipe : le sprint et les tickets qui changent de colonne se jouent sur le plan ----------
// Priorité dans stateAt0 : après le daily et la MEP, avant le travail ordinaire ; pour le boss, après ses validations.
const SCENE_TELL=2*60e3, KICKOFF_MS=5*60e3;
const PIZZA_LUNCH=[12*60,12*60+40], PIZZA_TABLE=[11*60+45,14*60]; // minutes de Paris : le repas, les boîtes sur la table
const FLOW=Object.assign({test:'To Test',validated:'To Deploy',reopened:'Reopen'},CFG.jira_flow||{});
const shortKey=k=>String(k).replace(/^[A-Z][A-Z0-9]*-/,'');
const deskZone=c=>c.boss?'boss':'desk'; // le boss reste à son bureau de boss
let MOVES_MEMO={team:null,list:[]};
// passages du jour à tester, validé, réouvert (team.events) : {t, key, kind, author, dev (l'assigné), qa (le testeur)}
function teamMoves(){
  if(MOVES_MEMO.team===TEAM)return MOVES_MEMO.list;
  const kind={[FLOW.test]:'test',[FLOW.validated]:'validated',[FLOW.reopened]:'reopened'}, qa=chars.find(x=>x.person&&x.roleKind==='qa')||null;
  const list=((TEAM&&TEAM.events)||[]).filter(e=>e.kind==='move'&&kind[e.to]).map(e=>({t:ms(e.t),key:e.key,kind:kind[e.to],
    author:personChar(e.who,e.who_name),dev:chars.find(x=>x.person&&x.team&&(x.team.tickets||[]).some(k=>k.key===e.key))||null,qa}))
    .sort((a,b)=>a.t-b.t);
  MOVES_MEMO={team:TEAM,list};
  return list;
}
// ticket réouvert avec un héraut (invité on: « reopen », ex. le mage) : il entre par la porte ; lui, l'auteur et l'assigné
// se retrouvent devant le bureau du boss (spots gate), l'assigné d'un côté face aux deux autres, le héraut crie (shout)
const HERALD_MS=3*60e3;
const herald=()=>chars.find(x=>x.guest&&x.on==='reopen')||null;
function standoff(){ // places de l'assigné, du testeur et du héraut, serrées devant le bureau du boss
  const [bx,by]=BOSS_SEAT||[], y=by+2, row=[[bx-1,'right'],[bx+1,'left'],[bx+2,'left']]; // une case vide entre l'assigné et eux
  if(BOSS_SEAT&&row.every(([x])=>walkable(x,y)))return {dev:[bx-1,y,'right'],tester:[bx+1,y,'left'],herald:[bx+2,y,'left']};
  // plan où cette rangée est encombrée : les places « gate » de gauche à droite
  const g=((SPOTS.gate||[]).slice()).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  if(g.length<3)return null;
  const [d,tt,h]=[g[0],g[g.length-2],g[g.length-1]];
  return {dev:[d[0],d[1],'right'],tester:[tt[0],tt[1],'left'],herald:[h[0],h[1],'left']};
}
function heraldScene(c,t,m,h){
  const pos=standoff(); if(!pos||!m.dev||!m.author||m.author===m.dev)return undefined; // pas de face-à-face possible
  const k=shortKey(m.key);
  if(t<m.t+HERALD_MS){
    if(c===m.dev)return {st:'reopen',zone:'visit',visit:pos.dev,human:true,label:m.key+' réouvert : convoqué devant '+h.name,bubble:'😨 '+k};
    if(c===m.author)return {st:'reopen',zone:'visit',visit:pos.tester,human:true,label:'Annonce que '+m.key+' est réouvert'}; // pas de bulle : celles de l'assigné et du héraut suffisent, côte à côte
    if(c===h)return {st:'reopen',zone:'visit',visit:pos.herald,label:m.key+' ne passera pas',bubble:h.shout||'🧙'};
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
const lastSprintDay=t=>sprintDay('end')===parisDay(t)&&!RHYTHM.weekend.includes(parisHM(t).wd);
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
// décor : boîtes de pizza sur la table de la cuisine le dernier jour du sprint ; dossiers sur le bureau du testeur
function sceneFurniture(){
  const o=furnAt('kitchen_table');
  FURN.push({y:6*TS+2+(o?o.dy:0),draw:()=>{const m0=parisMin(T);if(!lastSprintDay(T)||m0<PIZZA_TABLE[0]||m0>=PIZZA_TABLE[1])return;
    onF('kitchen_table',()=>{const {x,y}=KTABLE;
      for(let i=0;i<3;i++){R(ctx,x+4+i*18,y+2-i*2,16,5,'#c98b4a');R(ctx,x+4+i*18,y+2-i*2,16,1,'#e0b07a');}
      E('🍕',x+30,y-8,13);});}});
}
const FOLDER_MAX=12;
function folderPile(x,y){ // un dossier par ticket du sprint en test
  const n=Math.min(FOLDER_MAX,sprintTickets().filter(k=>k.cat==='test').length);
  for(let i=0;i<n;i++){const dx=i%2?1:-1, yy=y-i*3;
    R(ctx,x+dx-2,yy,11,3,'#e2b65a');R(ctx,x+dx-2,yy+2,11,1,'#9c7a33');R(ctx,x+dx+5,yy-1,3,1,'#e2b65a');}
}
