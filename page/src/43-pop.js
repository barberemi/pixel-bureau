// ---------- scènes pop du RDC : l'amiral Ackbar des grosses PR, l'hologramme du verdict d'une revue, les lettres de Poudlard,
// l'hyperespace avant une scène ou le rejeu ----------
// Réglage d'équipe scenes (settings.json du pack, surchargé par la config) : lettres.mails (seuil des mails utiles d'un
// compte), grosse_pr.lignes et grosse_pr.fichiers (l'un ou l'autre suffit), hyperespace (false : pas de transition).
// Tout est daté par les données : ces scènes se rejouent à leur heure, comme les autres.
const POP_CFG=(()=>{const s=CFG.scenes||{};
  return {lettres:{mails:10,...(s.lettres||{})},grosse_pr:{lignes:1000,fichiers:30,...(s.grosse_pr||{})},hyperespace:s.hyperespace!==false};})();
const popNum=n=>String(Math.round(+n||0)).replace(/\B(?=(\d{3})+(?!\d))/g,' ');
// ---------- l'amiral Ackbar (invité on « bigpr ») : une PR ouverte dans la journée dépasse un seuil ; il entre par la porte, se
// plante à côté du poste de l'auteur et crie (shout : {pr}, {lignes}, {fichiers}, {name}) HERALD_MS, puis repart ----------
let BIGPR_MEMO={team:null,list:[]};
function bigPrs(){
  if(BIGPR_MEMO.team===TEAM)return BIGPR_MEMO.list;
  const g=POP_CFG.grosse_pr;
  const list=((TEAM&&TEAM.events)||[]).filter(e=>e.kind==='pr'&&(e.lines>=g.lignes||e.files>=g.fichiers))
    .map(e=>({t:ms(e.seen||e.t),n:e.n,repo:e.repo,lines:e.lines||0,files:e.files||0,author:personChar(e.author,e.author_name)}))
    .filter(x=>x.author&&x.author.seat).sort((a,b)=>a.t-b.t);
  BIGPR_MEMO={team:TEAM,list};
  return list;
}
function bigPrShout(c,p){
  const name=String(p.author.name||'').split(' ')[0];
  return String(c.shout||'IT\'S A TRAP!').replace(/\{pr\}/g,prNum(p)).replace(/\{lignes\}/g,popNum(p.lines)).replace(/\{fichiers\}/g,popNum(p.files))
    .replace(name?/\{name\}/g:/,?\s*\{name\}/g,name);
}
function bigPrHeraldState(c,t){
  for(const p of bigPrs()){
    if(t<p.t||t>=p.t+HERALD_MS+2*60e3)continue;
    if(t>=p.t+HERALD_MS)return {st:'gone',label:'Reparti'};
    return {st:'bigpr',zone:'visit',visit:besideSeat(p.author.seat),label:'Prévient '+p.author.name+' : '+prNum(p)+' est une grosse PR',bubble:bigPrShout(c,p),big:true};
  }
  return {st:'off',label:'Attend une grosse PR'};
}
// ---------- l'hologramme : une revue du Bureau postée (verdict relevé par le 2e, REDACTION.revue.verdicts) apparaît en
// hologramme bleu sur le poste de l'auteur, le relecteur à visière verte, avec le verdict ; doré si elle approuve ----------
const POP_VERDICT={approve:['#ffd860','✅ Approuvée. Que la Force soit avec ta PR.'],request_changes:['#6ab8ff','🔁 Aide-moi… changements demandés'],
  comment:['#9fd8ff','💬 Des remarques sur ta PR']};
function holoReviews(){
  const v=(typeof REDACTION!=='undefined'&&REDACTION&&REDACTION.revue&&REDACTION.revue.verdicts)||{};
  if(!Object.keys(v).length||typeof rvRuns!=='function')return [];
  return rvRuns().filter(r=>r._e&&r.status==='Success'&&POP_VERDICT[v[r.run]]).map(r=>{const x=r.vars||{};
    return {at:r._e,run:r.run,v:v[r.run],n:x['current_task.number'],repo:x['current_task.repo'],c:ghChar(x['current_task.author'])};}).filter(x=>x.c);
}
function popHolo(e,now){
  const c=e.c; if(!c||!c.pos)return;
  const p=(now-e.t0)/e.ms, a=p<.1?p/.1:p>.85?(1-p)/.15:1, x=c.pos.x+22, y=c.pos.y-4, h=34, [col,txt]=POP_VERDICT[e.v];
  ctx.save();ctx.globalAlpha=.6*a;ctx.fillStyle=col;
  ctx.beginPath();ctx.ellipse(x,y-h+7,6,7,0,0,7);ctx.fill();ctx.beginPath();ctx.moveTo(x-9,y-h+14);ctx.lineTo(x+9,y-h+14);ctx.lineTo(x+11,y);ctx.lineTo(x-11,y);ctx.fill();
  ctx.globalAlpha=.85*a;ctx.fillStyle='#3fe08a';ctx.fillRect(x-8,y-h+3,16,3); // la visière verte de la salle de revue
  ctx.globalAlpha=.2*a;ctx.fillStyle='#ffffff';for(let k=y-h+((now/60)|0)%3;k<y;k+=3)ctx.fillRect(x-12,k,24,1);
  ctx.restore();
  if(a>.5)fxBubble(x,y-h-4,txt+(e.n?' · #'+e.n:''),e.v==='approve'?'#9a6a00':'#2f6fd6');
}
// ---------- les lettres de Poudlard : les mails utiles d'un compte passent le seuil (le n-ième arrive) ; les lettres
// s'envolent de sa boîte aux lettres. Une fois par jour et par compte : le n-ième mail utile est arrivé aujourd'hui ----------
function letterFloods(t){
  const n=POP_CFG.lettres.mails, out=[];
  if(!MAILS||!(n>0))return out;
  for(const a of mailAccounts()){
    if(!a.ok)continue;
    const ats=(a.useful||[]).map(m=>ms(m.at)).filter(Boolean).sort((x,y)=>x-y);
    if(ats.length>=n&&parisMidnight(ats[n-1])===parisMidnight(t))out.push({at:ats[n-1],a,n});
  }
  return out;
}
function popLetters(e,now){
  const h=(MAIL_HITS||[]).find(o=>o.id===e.a.id); if(!h)return;
  const p=(now-e.t0)/e.ms, ox=h.x+h.w/2, oy=h.y+4;
  for(let k=0;k<16;k++){
    const u=p*1.6-k*.05; if(u<=0||u>1.2)continue;
    const ang=k*.9+u*6, r=10+u*90, x=ox+Math.cos(ang)*r*1.4, y=oy-20-u*60+Math.sin(ang)*r*.5;
    ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(ang)*.5);ctx.globalAlpha=Math.min(1,1.2-u);
    ctx.fillStyle='#f4ead0';ctx.fillRect(-7,-5,14,10);ctx.strokeStyle='#b0a080';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-7,-5);ctx.lineTo(0,1);ctx.lineTo(7,-5);ctx.stroke();
    ctx.fillStyle='#a01a1a';ctx.fillRect(-2,-1,4,3);ctx.restore();
  }
  fxBubble(ox,oy-30,'✉ '+(e.a.label||e.a.id)+' déborde : '+plural(e.n,'mail utile','mails utiles'),'#7a1a1a');
}
// les événements de ces scènes pour fxEvents (43-fx.js) ; durée propre (ms)
function popFxEvents(recent){
  const out=[];
  for(const r of holoReviews())if(recent(r.at))out.push({id:'holo:'+r.run,kind:'holo',ms:12e3,...r});
  if(!REDUCED_MOTION)for(const l of letterFloods(T))if(recent(l.at))out.push({id:'letters:'+l.a.id+':'+l.at,kind:'letters',ms:9e3,...l});
  out.push(...nazFxEvents(recent)); // 69-nazgul.js : le messager de l'Œil
  return out;
}
function popOverlay(now){for(const e of FX.cur.values()){if(e.kind==='holo')popHolo(e,now);else if(e.kind==='letters')popLetters(e,now);else if(e.kind==='nazgul')nazDraw(e,now);}}
// ---------- l'hyperespace : avant une scène de la galerie (« ▶ voir ») et avant le rejeu de la journée, 1,2 s d'étoiles qui
// s'étirent et le nom de ce qui commence ; l'heure reste figée pendant ce temps (HYPER, boucle de 90-boot.js) ; Échap ou un
// clic pour passer ; rien en mode TV, avec « réduire les animations » ou scenes.hyperespace à false ----------
let HYPER=null;
const HYPER_MS=1200;
function hyperGo(kicker,title,sub,then){
  if(HYPER)hyperEnd();
  if(REDUCED_MOTION||TV||!POP_CFG.hyperespace||typeof cv==='undefined'||!cv.parentElement||typeof requestAnimationFrame!=='function'){then&&then();return;}
  const box=document.createElement('div');box.className='hyper';box.setAttribute('role','status');
  const c=document.createElement('canvas'), r=cv.getBoundingClientRect(), pr=cv.parentElement.getBoundingClientRect();
  Object.assign(box.style,{left:(r.left-pr.left)+'px',top:(r.top-pr.top)+'px',width:r.width+'px',height:r.height+'px'});
  c.width=Math.max(1,Math.round(r.width));c.height=Math.max(1,Math.round(r.height));
  box.appendChild(c);
  box.insertAdjacentHTML('beforeend',`<div class="hyper-t"><small>${esc(kicker)}</small><b>${esc(title)}</b><span>${esc(sub)}</span><i>Échap : passer</i></div>`);
  box.onclick=()=>hyperEnd();
  cv.parentElement.appendChild(box);
  HYPER={box,c,then,t0:performance.now()};
  // hold : image figée (captures)
  const frame=()=>{if(!HYPER||HYPER.box!==box)return;const p=HYPER.hold||(performance.now()-HYPER.t0)/HYPER_MS;if(p>=1){hyperEnd();return;}hyperDraw(c,p);requestAnimationFrame(frame);};
  requestAnimationFrame(frame);
}
function hyperDraw(c,p){
  const g=c.getContext('2d'), w=c.width, h=c.height, cx=w/2, cy=h/2;
  g.fillStyle='rgba(4,6,20,.82)';g.fillRect(0,0,w,h);
  for(let k=0;k<170;k++){const a=k*2.39996, r0=20+((k*53)%220)*(.3+p), r1=r0+(60+((k*31)%300))*p*1.6;
    g.strokeStyle=k%5?'rgba(220,235,255,.85)':'rgba(140,190,255,.9)';g.lineWidth=k%7?1:2;
    g.beginPath();g.moveTo(cx+Math.cos(a)*r0,cy+Math.sin(a)*r0*.6);g.lineTo(cx+Math.cos(a)*r1,cy+Math.sin(a)*r1*.6);g.stroke();}
}
function hyperEnd(){
  const h=HYPER; if(!h)return; HYPER=null;
  h.box.remove();
  if(h.then)h.then();
}
addEventListener('keydown',e=>{if(e.key==='Escape'&&HYPER){e.stopPropagation();hyperEnd();}},true);
