// ---------- 1er étage : l'atelier d'implémentation (#76, #125) ----------
// Un bureau par ticket sur la chaîne de postes (models.impl_chain, 4 en parallèle) et, au mur, le tableau postes × tickets.
// L'étage ne traite que l'implémentation, la PR et ses retours : ni CI, ni env, ni déploiement (le RDC s'en charge).
// Données : dataset atelier (workflows/atelier_snapshot.py, cron live) ; démo : atelierDemo(). Un ticket à plusieurs
// dépôts occupe un bureau par dépôt ; un run en échec reste dans « En panne » : relancer le ticket le reprend là. Onglets d'étage au-dessus
// du plan ; sur le 1er, la toile prend la taille de l'étage (AT_W × AT_H) et le panneau montre les bureaux et leur fiche.
const AT_POSTES=[
  {k:'cadrage',i:'📋',n:'Cadrage'},{k:'schema',i:'🗺',n:'Schéma'},{k:'patterns',i:'🧩',n:'Patterns'},{k:'gate',i:'✋',n:'Ton plan',gate:true},
  {k:'code',i:'⌨',n:'Code'},{k:'regles',i:'📏',n:'Règles'},{k:'securite',i:'🔒',n:'Sécurité'},{k:'tests',i:'🧪',n:'Tests'},
  {k:'perf',i:'⚡',n:'Perf·a11y'},{k:'revue',i:'🔁',n:'Croisée'},{k:'besoin',i:'🎯',n:'Besoin'},{k:'doc',i:'📚',n:'Doc',bureau:false},{k:'pr',i:'📤',n:'PR'},{k:'revue_pr',i:'👀',n:'Revue PR'},{k:'retours',i:'💬',n:'Retours'}];
const AT_ST={ok:['#3fbf6a','validé'],run:['#5b8def','en cours'],bloq:['#e0614f','bloquant'],avis:['#e0a020','avis'],wait:['#e0a020','t\'attend'],
  skip:['#5b6070','sauté'],err:['#e0614f','en panne']};
const AT_TS=32, AT_W=46*AT_TS, AT_H=27*AT_TS;
let FLOOR=0, ATELIER=null, ATSEL=null;
try{const f=+localStorage.getItem('bureau:floor');FLOOR=f===1||f===-1?f:0;}catch(e){FLOOR=0;} // -1 : la caserne Support (68-caserne.js)
function readAtelier(src){
  try{
    if(!src||!src.datasets)return null;
    let d=src.datasets.atelier;
    if(d&&d.current!==undefined)d=d.current;
    if(typeof d==='string')d=JSON.parse(d);
    return d&&Array.isArray(d.rooms)?d:null;
  }catch(e){return null;}
}
// démo : quatre bureaux occupés, deux tickets dans la file (équipe fictive, dépôts dm/*)
function atelierDemo(){
  const ok=n=>Object.fromEntries(AT_POSTES.slice(0,n).map(p=>[p.k,'ok'])), at=h=>new Date(DAY0+h*3600e3).toISOString();
  return {generated_at:at(11),rooms:[
    {run:'demo-a1',ticket:'DM-7305',title:'Lien « Gérer mon consentement » dans le pied de page',repo:'dm/site',poste:'gate',gate:'gate_plan',
     states:{...ok(3),gate:'wait'},tour:null,tok:97e3,since:at(9.2),note:'✋ ton plan'},
    {run:'demo-a2',ticket:'DM-7911',title:'Passer les tests du site sur la nouvelle version du framework',repo:'dm/site',poste:'code',
     states:{...ok(4),code:'run'},tour:'1/3',tok:64e3,since:at(9.6),lot:'essai 2/3'},
    {run:'demo-a3',ticket:'DM-7854',title:'Retirer un attribut codé en dur du bloc média',repo:'dm/site',poste:'code',back:true,
     states:{...ok(6),securite:'bloq',code:'run'},tour:'2/3',tok:121e3,since:at(8.4),note:'🔒 bloquant → retour au code'},
    {run:'demo-a4',ticket:'DM-412',title:'Cache des listes de rubriques',repo:'dm/api',poste:'retours',
     states:{...ok(8),perf:'err',revue:'avis',besoin:'ok',doc:'ok',pr:'ok',revue_pr:'ok',retours:'run'},tour:'1/3',tok:138e3,since:at(7.9),note:'💬 3 commentaires à traiter'}],
    queue:[{run:'demo-q1',ticket:'DM-7606',since:at(10.5)},{run:'demo-q2',ticket:'DM-7948',since:at(10.8)}],
    livres:3,pannes:[{run:'demo-p1',ticket:'DM-7702',title:'Bandeau d\'alerte sur les pages direct',repo:'dm/api',poste:'securite',since:at(8.1)}]};
}
const atelierOn=()=>!!(CFG.atelier||DEMO);
// workflows de l'étage (modèles impl*, CFG.atelier_wf) : leurs runs, et les sous-runs qu'ils lancent (revue de la PR),
// quittent le RDC (setData) ; leurs gates ne sont pas comptées chez le boss et « Nouvel agent » ne les propose pas
const atWf=w=>!!w&&(CFG.atelier_wf||[]).includes(String(w).slice(0,8));
function atelierRunIds(runs){
  const ids=new Set((runs||[]).filter(r=>atWf(r.wf)).map(r=>r.run));
  for(let n=-1;n!==ids.size;){n=ids.size;for(const r of runs)if(!ids.has(r.run)&&(ids.has(r.parent)||ids.has(r.tby)))ids.add(r.run);}
  return ids;
}
// poste ou étape où un run en échec s'est arrêté : nom du poste, sinon celui de l'étape du parent
const AT_STEP={prepare:'Préparation',orchestrateur_plan:'Plan de l\'orchestrateur',orchestrateur:'Orchestrateur',livraison:'PR',publication:'Publication',
  controles:'Contrôles',ticket:'Lecture du ticket',dossier:'Dossier',aiguillage:'Aiguillage',questions:'Questions',mode:'Mode'};
const atStepName=k=>{const p=AT_POSTES.find(x=>x.k===k);return p?p.i+' '+p.n:AT_STEP[k]||k||'?';};
const atRooms=()=>((ATELIER&&ATELIER.rooms)||[]).slice(0,4);
// ---------- onglets d'étage ----------
// RDC (l'open space, par défaut), 1er (l'atelier, s'il existe), -1 (la caserne Support, si la console Support existe)
function atelierTabs(){
  let t=document.getElementById('floors');
  if(!atelierOn()&&!caserneOn()){if(t)t.remove();return;}
  if(!t){t=document.createElement('div');t.id='floors';t.className='floors';t.setAttribute('role','tablist');
    const w=document.querySelector('.stage .cv-wrap');w.parentElement.insertBefore(t,w);
    t.addEventListener('click',e=>{const b=e.target.closest('button[data-floor]');if(b)setFloor(+b.dataset.floor);});}
  const tab=(f,label)=>`<button role="tab" data-floor="${f}" aria-selected="${FLOOR===f}"${FLOOR===f?' class="on"':''}>${label}</button>`;
  const n=atRooms().length, w=atRooms().filter(r=>r.gate).length, cs=caserneOn()?csActive():[], cg=cs.filter(x=>x.s.k==='gate').length;
  const h=tab(0,'🏢 RDC · open space')+(atelierOn()?tab(1,`🏭 1er · atelier d'implémentation${n?` <b>${n}</b>`:''}${w?` <b>✋ ${w}</b>`:''}`):'')+
    (caserneOn()?tab(-1,`🚒 -1 · caserne Support${cs.length?` <b>${cs.length}</b>`:''}${cg?` <b>✋ ${cg}</b>`:''}`):'');
  if(t.dataset.sig!==h)t.innerHTML=t.dataset.sig=h;
}
// étages qui existent, de haut en bas
const floorsOn=()=>[...(atelierOn()?[1]:[]),0,...(caserneOn()?[-1]:[])];
function setFloor(f){
  FLOOR=f===1&&atelierOn()?1:f===-1&&caserneOn()?-1:0;ATSEL=null;AT_PICK=null;try{localStorage.setItem('bureau:floor',String(FLOOR));}catch(e){}
  if(FLOOR){cv.width=AT_W;cv.height=AT_H;ctx.imageSmoothingEnabled=false;document.documentElement.style.setProperty('--plan-ratio',String(AT_W/AT_H));}
  else{cv.width=W;cv.height=H;ctx.imageSmoothingEnabled=false;document.documentElement.style.setProperty('--plan-ratio',String(W/H));}
  // pas sizeCanvas() : il redimensionne aussi bg, le décor du RDC cuit une fois, et redimensionner une toile l'efface
  // seul l'étage affiché vit : en arrivant à un étage, il se pose sans rejouer ce qui s'est passé ; au RDC, chacun reprend sa place
  if(FLOOR===1){AT_MEM.fresh=true;AT_MEM.src=null;AT_MEM.boss=null;AT_MEM.scenes=[];AT_MEM.leaving=[null,null,null,null];}
  else if(FLOOR===-1)csReset();else needTeleport=true;
  if(typeof LOUPE!=='undefined'){LOUPE.seen=null;LOUPE.queue=[];if(LOUPE.cur)loupeHide();}
  atelierTabs();renderSide(true);if(TV)updateTv(true); // 75-tv.js : la colonne et le bouton d'étage
  {const det=document.querySelector('.legend-help');if(det&&det.open&&typeof renderGallery==='function')renderGallery();} // 46-gallery.js : les scènes de cet étage
}
// ---------- le plan de l'étage ----------
// Quatre bureaux pleine largeur autour d'un couloir central (vertical) et d'un couloir horizontal ; une porte au milieu de
// chaque bureau, côté couloir horizontal. Dans un bureau, un tapis en U : le carton du ticket entre par la trappe du
// couloir central, avance de poste en poste (rangée 1 vers le mur, virage, rangée 2) et ressort par la trappe de sortie,
// côté couloir central (bureaux 1 et 3 en miroir). Un agent par poste, derrière son bureau : au travail (lumière, écran,
// bulle), a travaillé (✓ ou !), attend son tour (silhouette grise). En haut, le grand tableau de l'orchestrateur ; dessous,
// le boss dans son fauteuil (il se lève et va à la porte du bureau qui attend sa décision). En bas du couloir central,
// l'entrepôt (tickets en attente, pannes à relancer) ; à gauche le café, deux canapés, à droite la porte de sortie.
const atTxt=(s,x,y,col,font,al)=>{ctx.font=font||'bold 10px ui-monospace,Menlo,monospace';ctx.fillStyle=col;ctx.textAlign=al||'center';ctx.fillText(s,x,y);ctx.textAlign='left';};
function atPill(s,x,y,bgc,fg,font){ctx.font=font||'bold 10px ui-monospace,Menlo,monospace';const w=ctx.measureText(s).width+10;R(ctx,x-w/2,y-11,w,15,bgc);atTxt(s,x,y,fg||'#fff',font);}
const AT_CX0=20, AT_CX1=26, AT_HY0=13.5, AT_HY1=15.5, AT_DESKS=AT_POSTES.filter(p=>p.bureau!==false), AT_R1=AT_DESKS.slice(0,7), AT_R2=AT_DESKS.slice(7);
const AT_ROOMS=[[0,3,AT_CX0,AT_HY0,1,1],[AT_CX1,3,46,AT_HY0,0,1],[0,AT_HY1,AT_CX0,27,1,0],[AT_CX1,AT_HY1,46,27,0,0]]; // x0,y0,x1,y1, miroir, en haut
const AT_MX=(AT_CX0+AT_CX1)/2*AT_TS, AT_MY=AT_HY1*AT_TS-8, AT_LANE=AT_MX+2.5*AT_TS; // AT_MY : la ligne de marche du couloir horizontal, devant les canapés
const AT_CHAIR={x:AT_MX,y:6.4*AT_TS}, AT_DOCK={x:AT_MX,y:21.4*AT_TS}, AT_EXIT={x:45.4*AT_TS,y:AT_MY};
const AT_WANDER_MAX=4, AT_WANDER_ROOM=2; // promeneurs des bureaux libres : sur tout l'étage, et par bureau
// géométrie d'un bureau : rangées, tapis, trappes, porte ; les bureaux du bas ont leur titre en bas, le contenu remonte
function atGeo(i){
  const [x0,y0,x1,y1,L,top]=AT_ROOMS[i], T=AT_TS, o=top?0:-.9, Y=v=>(y0+v+o)*T;
  const g={i,x0,y0,x1,y1,L:!!L,top:!!top,bx0:(x0+(L?2.6:1.7))*T,bx1:(x1-(L?1.7:2.6))*T,H:.6*T,b1:Y(4.8),b2:Y(6.2),lab1:Y(2.3),desk1:Y(3.65),feet1:Y(3.85),
    desk2:Y(7.1),feet2:Y(9.35),lab2:Y(10.0),head:top?(y0-.45)*T:(y1-.45)*T,noteY:top?(y0+.3)*T:(y1-1.15)*T,wallX:(L?AT_CX0:AT_CX1)*T};
  g.sw=(g.bx1-g.bx0)/7;g.ex=L?g.bx1+.6*T:g.bx0-.6*T;g.turnX=L?g.bx0-1.05*T:g.bx1+.35*T;g.tm=g.turnX+.35*T;
  g.door={x:(x0+x1)/2*T,y:(top?AT_HY0:AT_HY1)*T};g.aisle=top?(y1-.45)*T:(y0+.55)*T;
  g.hatch=row=>({x:g.wallX+(L?.7:-.7)*T,y:(row===1?g.b1:g.b2)+g.H/2+12});
  // allées pour marcher sans passer sur le tapis ni sur les autres : derrière la rangée du haut, devant celle du bas,
  // et le long du mur extérieur (à gauche des bureaux 1 et 3, à droite des bureaux 2 et 4), jusqu'à la porte
  g.ax=(L?x0+.75:x1-.75)*T;g.back1=g.feet1-.75*T;g.front2=top?(y1-.45)*T:g.feet2+.8*T;g.inDoor={x:g.door.x,y:top?(y1-.45)*T:(y0+.55)*T};
  return g;
}
const AT_G=[0,1,2,3].map(atGeo);
// 📚 Doc (bureau:false) n'a pas de bureau sur le tapis (7 par rangée) : il est dans la barre des postes et la fiche
// place d'un poste : x sur sa rangée (1 en haut, depuis le couloir central ; 2 en bas, vers la sortie)
function atSpot(g,k){
  const d=AT_POSTES.findIndex(p=>p.k===k);if(d>0&&AT_POSTES[d].bureau===false)k=AT_POSTES[d-1].k; // 📚 Doc : pas de bureau, au bureau d'avant
  let j=AT_R1.findIndex(p=>p.k===k);
  if(j>=0)return {x:g.L?g.bx1-(j+.5)*g.sw:g.bx0+(j+.5)*g.sw,row:1};
  j=Math.max(0,AT_R2.findIndex(p=>p.k===k));return {x:g.L?g.bx1-(6-j+.5)*g.sw:g.bx0+(6-j+.5)*g.sw,row:2};
}
// le tapis comme une ligne : distance parcourue depuis la trappe d'entrée (0) jusqu'à la trappe de sortie (atBeltLen)
const atBeltLen=g=>2*Math.abs(g.ex-g.tm)+(g.b2-g.b1);
function atBeltS(g,k){const s=atSpot(g,k);return s.row===1?Math.abs(s.x-g.ex):Math.abs(g.ex-g.tm)+(g.b2-g.b1)+Math.abs(s.x-g.tm);}
function atBeltAt(g,s){
  const a=Math.abs(g.ex-g.tm), b=g.b2-g.b1, d=g.L?-1:1, y1=g.b1+g.H/2, y2=g.b2+g.H/2;s=Math.max(0,Math.min(atBeltLen(g),s));
  if(s<=a)return {x:g.ex+d*s,y:y1};
  if(s<=a+b)return {x:g.tm,y:y1+(s-a)};
  return {x:g.tm-d*(s-a-b),y:y2};
}
// ---------- mémoire de l'étage : bureaux stables, scènes, promeneurs ----------
// Un ticket garde son bureau tant qu'il est sur la chaîne (le suivant prend le premier bureau libre). Les scènes se
// jouent seulement quand on regarde l'étage : en y montant (fresh), tout est posé sans rejouer ce qui s'est passé avant.
const AT_MEM={src:null,fresh:true,slot:{},rooms:{},cart:{},okAt:{},backAt:{},lit:[0,0,0,0],scenes:[],leaving:[null,null,null,null],
  wander:[],boss:null,ext:{},last:0,arrivedAt:{}};
function atSlots(){
  const rooms=atRooms(), out=[null,null,null,null], live=new Set(rooms.map(r=>r.run));
  for(const run of Object.keys(AT_MEM.slot))if(!live.has(run))delete AT_MEM.slot[run];
  for(const r of rooms){const i=AT_MEM.slot[r.run];if(i!=null&&!out[i])out[i]=r;}
  for(const r of rooms){if(out.includes(r))continue;const i=[0,1,2,3].find(k=>!out[k]&&!AT_MEM.leaving[k]);const j=i!=null?i:[0,1,2,3].find(k=>!out[k]);if(j!=null){out[j]=r;AT_MEM.slot[r.run]=j;}}
  return out;
}
const atLabel=k=>{const p=AT_POSTES.find(x=>x.k===k);return p?p.i+' '+p.n:'';};
// état d'un poste dans un bureau : run (au travail), bloq, err (en panne), ok, avis, skip, wait (attend son tour), idle (libre)
function atState(r,p){
  if(!r)return 'idle';
  const s=(r.states||{})[p.k];
  if(s==='err'||s==='bloq')return s;
  if(r.poste===p.k&&!r.gate)return 'run';
  return s==='run'?'run':s||'wait';
}
// compare le dataset à ce qu'on a vu : arrivées, sorties, ✓ qui apparaissent, retours au code
function atDiff(now){
  const seen=AT_MEM.rooms, next={}, fresh=AT_MEM.fresh, pannes=new Set(((ATELIER&&ATELIER.pannes)||[]).map(p=>p.run)), live=new Set(atRooms().map(r=>r.run));
  // d'abord les sorties : le bureau que le transporteur vide n'est pas donné au ticket suivant
  for(const [run,prev] of Object.entries(seen)){
    if(live.has(run))continue;
    delete AT_MEM.cart[run];
    if(!fresh&&!pannes.has(run)&&!REDUCED_MOTION&&!AT_MEM.leaving[prev.i]){AT_MEM.leaving[prev.i]={ticket:prev.ticket,t0:now};AT_MEM.scenes.push({kind:'exit',i:prev.i,ticket:prev.ticket,t0:now});}
  }
  const slots=atSlots();
  slots.forEach((r,i)=>{if(!r)return;const g=AT_G[i], prev=seen[r.run], k=r.gate?'gate':r.poste, target=atBeltS(g,k||'cadrage');
    next[r.run]={i,poste:r.poste,states:{...(r.states||{})},back:!!r.back,ticket:r.ticket};
    const c=AT_MEM.cart[r.run];
    if(!prev){
      if(fresh||REDUCED_MOTION)AT_MEM.cart[r.run]={s:target,target};
      else{AT_MEM.cart[r.run]={s:0,target,hidden:true};AT_MEM.arrivedAt[r.run]=now;AT_MEM.scenes.push({kind:'arrive',i,run:r.run,ticket:r.ticket,t0:now});}
      return;
    }
    if(c)c.target=target;
    for(const p of AT_POSTES){const s=(r.states||{})[p.k];if((s==='ok'||s==='avis')&&prev.states[p.k]!==s)AT_MEM.okAt[r.run+'|'+p.k]=now;}
    if(r.back&&!prev.back)AT_MEM.backAt[r.run]=now;
  });
  AT_MEM.rooms=next;AT_MEM.fresh=false;
  return slots;
}
// un marcheur : suit une ligne de points à vitesse constante
function atWalker(path,speed){return {path:path.slice(1).map(p=>({x:p.x,y:p.y})),pos:{x:path[0].x,y:path[0].y},speed:speed||95,dir:'down'};}
function atStep(w,dt){
  if(!w.path.length)return true;
  const p=w.path[0], dx=p.x-w.pos.x, dy=p.y-w.pos.y, d=Math.hypot(dx,dy), m=w.speed*dt;
  if(Math.abs(dx)>.5||Math.abs(dy)>.5)w.dir=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');
  if(d<=m){w.pos={x:p.x,y:p.y};w.path.shift();}else{w.pos.x+=dx/d*m;w.pos.y+=dy/d*m;}
  return !w.path.length;
}
// chemins dans les couloirs
const atToHatch=(g,row,from)=>{const h=g.hatch(row);return [from,{x:AT_MX,y:from.y},{x:AT_MX,y:h.y},h];};
function atBossPath(from,i){
  const pts=[{...from}];
  if(from.y<10*AT_TS&&Math.abs(from.x-AT_MX)<2.2*AT_TS)pts.push({x:AT_LANE,y:from.y});else pts.push({x:from.x,y:AT_MY});
  pts.push({x:AT_LANE,y:AT_MY});
  if(i==null){pts.push({x:AT_LANE,y:AT_CHAIR.y},AT_CHAIR);}
  else{const g=AT_G[i];pts.push({x:g.door.x,y:AT_MY},{x:g.door.x,y:g.top?AT_HY0*AT_TS+22:AT_HY1*AT_TS-6});}
  return pts;
}
// promeneurs : dans un bureau libre, de temps en temps un agent sort (café, canapé, couloir), puis revient à sa place
const AT_SPOTS=[{x:14.3*AT_TS,y:AT_HY0*AT_TS+38,dir:'down',sit:1},{x:15.7*AT_TS,y:AT_HY0*AT_TS+38,dir:'down',sit:1},
  {x:30.3*AT_TS,y:AT_HY0*AT_TS+38,dir:'down',sit:1},{x:31.7*AT_TS,y:AT_HY0*AT_TS+38,dir:'down',sit:1},
  {x:2.3*AT_TS,y:AT_HY1*AT_TS-8,dir:'left'},{x:6*AT_TS,y:AT_MY,dir:'down'},{x:40*AT_TS,y:AT_MY,dir:'down'}];
function atHome(i,k){const g=AT_G[i], s=atSpot(g,k);return {x:s.x,y:s.row===1?g.feet1:g.feet2};}
// de sa place au couloir horizontal, par les allées et la porte (jamais à travers le tapis) ; la rangée du côté de la
// porte y va directement, l'autre fait le tour par l'allée du mur extérieur
function atRouteOut(i,k){
  const g=AT_G[i], h=atHome(i,k), row=atSpot(g,k).row, pts=[h];
  if(g.top){if(row===1)pts.push({x:h.x,y:g.back1},{x:g.ax,y:g.back1},{x:g.ax,y:g.inDoor.y});else pts.push({x:h.x,y:g.front2});}
  else{if(row===2)pts.push({x:h.x,y:g.front2},{x:g.ax,y:g.front2},{x:g.ax,y:g.back1});else pts.push({x:h.x,y:g.back1});pts.push({x:g.door.x,y:g.back1});}
  pts.push(g.inDoor,{x:g.door.x,y:AT_MY});
  return pts;
}
function atWanderPath(i,k,spot){return [...atRouteOut(i,k),{x:spot.x,y:spot.y}];}
// une image : sorties, retours à la place, nouveaux promeneurs (rnd : tirage, remplaçable pour les tests)
function atWanderTick(slots,now,dt,rnd){
  if(REDUCED_MOTION&&!rnd){AT_MEM.wander=[];return;}
  rnd=rnd||Math.random;
  const free=i=>!slots[i]&&!AT_MEM.leaving[i];
  for(const w of AT_MEM.wander){
    if(w.phase!=='back'&&(!free(w.i)||now>w.until)){w.phase='back';w.walk=atWalker([w.walk.pos,...atWanderPath(w.i,w.k,w.spot).reverse().slice(1)],free(w.i)?70:150);}
    if(atStep(w.walk,dt)){if(w.phase==='out'){w.phase='stay';w.walk.dir=w.spot.dir;}else if(w.phase==='back')w.done=true;}
  }
  AT_MEM.wander=AT_MEM.wander.filter(w=>!w.done);
  if(AT_MEM.wander.length>=AT_WANDER_MAX||rnd()>dt*.25)return;
  const rooms=[0,1,2,3].filter(i=>free(i)&&AT_MEM.wander.filter(w=>w.i===i).length<AT_WANDER_ROOM&&AT_MEM.lit[i]<.05);if(!rooms.length)return;
  const i=rooms[Math.floor(rnd()*rooms.length)], ks=AT_DESKS.filter(p=>!p.gate&&!AT_MEM.wander.some(w=>w.i===i&&w.k===p.k));
  const spots=AT_SPOTS.filter(s=>!AT_MEM.wander.some(w=>w.spot===s));if(!ks.length||!spots.length)return;
  const k=ks[Math.floor(rnd()*ks.length)].k, spot=spots[Math.floor(rnd()*spots.length)];
  AT_MEM.wander.push({i,k,spot,phase:'out',walk:atWalker(atWanderPath(i,k,spot),60),until:now+40e3+rnd()*50e3});
}
const atWandering=(i,k)=>AT_MEM.wander.find(w=>w.i===i&&w.k===k)||null;
// ---------- décor ----------
function atBackground(){ // sols, murs, cloisons vitrées et portes : cuits une fois
  const c=document.createElement('canvas');c.width=AT_W;c.height=AT_H;const g=c.getContext('2d'), T=AT_TS;
  for(let y=0;y<27;y++)for(let x=0;x<46;x++)drawFloor(g,x,y,(x>=AT_CX0&&x<AT_CX1&&y>=2)||y===13||y===14||y===15?'wood':'carpet');
  R(g,0,0,AT_W,T,'#4b4a52');R(g,0,T,AT_W,8,'#efe9dc');R(g,0,T+8,AT_W,24,'#d9d2c3');R(g,0,T+28,AT_W,4,'#a99f8c');
  const wh=(x0,x1,y)=>{R(g,x0*T,y*T-5,(x1-x0)*T,10,'#bfe0ee');R(g,x0*T,y*T-5,(x1-x0)*T,1,'#cfc6b4');};
  const wv=(x,y0,y1)=>{R(g,x*T-5,y0*T,10,(y1-y0)*T,'#bfe0ee');R(g,x*T-5,y0*T,1,(y1-y0)*T,'#cfc6b4');};
  for(const [x0,x1] of [[0,AT_CX0],[AT_CX1,46]]){const m=(x0+x1)/2;for(const y of [AT_HY0,AT_HY1]){wh(x0,m-.9,y);wh(m+.9,x1,y);}}
  for(const x of [AT_CX0,AT_CX1]){wv(x,2,AT_HY0);wv(x,AT_HY1,27);}
  return c;
}
let AT_BG=null;
function atBelt(x,y,w,h,run,now,dir){ // dir : 1 vers la droite, -1 vers la gauche, 2 vers le bas
  R(ctx,x,y,w,h,'#3b3f48');
  if(dir===2){R(ctx,x,y,3,h,'#5a606c');R(ctx,x+w-3,y,3,h,'#5a606c');}else{R(ctx,x,y,w,3,'#5a606c');R(ctx,x,y+h-3,w,3,'#23262c');}
  const off=run&&!REDUCED_MOTION?Math.floor(now/60)%12:0;ctx.fillStyle='#2a2d34';
  if(dir===2)for(let k=off;k<h;k+=12)ctx.fillRect(x+3,y+k,w-6,2);
  else for(let k=(dir>0?off:(12-off)%12);k<w;k+=12)ctx.fillRect(x+k,y+3,2,h-6);
  ctx.fillStyle=run?'#9aa3b5':'#5d6370';
  if(dir!==2)for(let k=30;k<w-10;k+=84){const cx=x+k,cy=y+h/2;ctx.beginPath();ctx.moveTo(cx-3*dir,cy-4);ctx.lineTo(cx+3*dir,cy);ctx.lineTo(cx-3*dir,cy+4);ctx.fill();}
}
function atCarton(x,y,label,col,dy){
  R(ctx,x-14,y-12,28,19,'#b98a4e');R(ctx,x-14,y-12,28,4,'#d4a868');R(ctx,x-2,y-12,4,19,'#e8d29a');R(ctx,x-14,y+5,28,2,'#7d5a2c');
  if(themeIs('noel')){R(ctx,x-14,y-12,28,19,'#c8323a');R(ctx,x-2,y-12,4,19,'#f2c230');R(ctx,x-14,y-4,28,3,'#f2c230');}
  else if(themeIs('halloween')){R(ctx,x-14,y-12,28,19,'#e07a1a');R(ctx,x-9,y-7,4,3,'#1c1c1c');R(ctx,x+5,y-7,4,3,'#1c1c1c');R(ctx,x-6,y,12,2,'#1c1c1c');}
  else if(themeIs('saint-valentin'))E('❤',x,y-2,10);
  if(label)atPill(label,x,y+(dy||24),col||'#0b2a4a','#fff','bold 9px ui-monospace,Menlo,monospace');
}
function atBadge(x,y,ch,bgc,k){const s=k==null?1:k;if(s<=0)return;ctx.fillStyle=bgc;ctx.beginPath();ctx.arc(x,y,8*s,0,7);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();
  if(s>.6)atTxt(ch,x,y+4,'#fff','bold 11px system-ui,sans-serif');}
function atBubble(x,y,s,col){ctx.font='bold 10px system-ui,sans-serif';const w=ctx.measureText(s).width+12;
  R(ctx,x-w/2-1,y-17,w+2,19,col||'#1c1f26');R(ctx,x-w/2,y-16,w,17,'#ffffff');R(ctx,x-3,y+1,6,3,col||'#1c1f26');R(ctx,x-2,y+1,4,2,'#ffffff');
  atTxt(s,x,y-4,col||'#1c1f26','bold 10px system-ui,sans-serif');}
function atDesk(x,y,on,col){R(ctx,x-24,y,48,12,'#a0703f');R(ctx,x-24,y,48,3,'#b98552');R(ctx,x-24,y+12,48,8,'#7d5530');
  R(ctx,x-9,y-10,18,12,'#2b2e36');R(ctx,x-7,y-8,14,8,on?(col||'#7dffb0'):'#3d4250');if(on){R(ctx,x-5,y-6,7,1,'#0b3a1a');R(ctx,x-5,y-3,10,1,'#0b3a1a');}}
function atCoffee(x,y){R(ctx,x-11,y-32,22,32,'#2f2f36');R(ctx,x-11,y-32,22,4,'#4a4a55');R(ctx,x-7,y-24,14,6,'#7dd3ff');R(ctx,x-4,y-13,8,8,'#1a1a1f');R(ctx,x-3,y-8,6,5,'#f2efe6');R(ctx,x-14,y,28,4,'#5a4636');}
function atPlant(x,y){R(ctx,x-7,y-8,14,10,'#9a5a3a');ctx.fillStyle='#3f9a4f';for(const [dx,dy,r] of [[0,-16,8],[-6,-12,6],[6,-12,6],[0,-22,5]]){ctx.beginPath();ctx.arc(x+dx,y+dy,r,0,7);ctx.fill();}}
// canapé vu de face, contre le mur du couloir : dossier à deux coussins (derrière ceux qui s'y assoient), puis l'assise,
// les accoudoirs et les pieds (devant eux) ; une table basse devant
function atSofa(x,y){R(ctx,x-48,y-26,96,22,'#2d4f66');R(ctx,x-44,y-23,42,17,'#4f80a3');R(ctx,x+2,y-23,42,17,'#4f80a3');R(ctx,x-44,y-23,42,3,'#6a9cc0');R(ctx,x+2,y-23,42,3,'#6a9cc0');}
function atSofaFront(x,y){R(ctx,x-46,y-6,92,12,'#3f6b8a');R(ctx,x-46,y-6,92,3,'#5a8ab0');R(ctx,x-1,y-6,2,12,'#2d4f66');
  R(ctx,x-54,y-16,9,24,'#2d4f66');R(ctx,x+45,y-16,9,24,'#2d4f66');R(ctx,x-54,y-16,9,3,'#4f80a3');R(ctx,x+45,y-16,9,3,'#4f80a3');
  R(ctx,x-50,y+8,4,4,'#1c1f26');R(ctx,x+46,y+8,4,4,'#1c1f26');R(ctx,x-20,y+12,40,6,'#8a6040');R(ctx,x-18,y+18,3,3,'#5a4636');R(ctx,x+15,y+18,3,3,'#5a4636');R(ctx,x-6,y+8,6,4,'#f2efe6');}
function atDoor(x,y){R(ctx,x-10,y-2,10,2*AT_TS+4,'#3a2a1e');R(ctx,x-8,y,8,2*AT_TS,'#6b4a2e');R(ctx,x-8,y+AT_TS-2,8,4,'#8a6040');R(ctx,x-6,y+AT_TS+8,3,4,'#e0c070');}
function atHatchBox(x,y,h,out){R(ctx,x-6,y-4,12,h+8,'#2b2e36');R(ctx,x-4,y-2,8,h+4,out?'#1f5a35':'#1a1c22');}
function atPallet(x,y){R(ctx,x-18,y,36,6,'#a8824e');R(ctx,x-18,y+2,36,1,'#7d5a2c');R(ctx,x-16,y+6,6,3,'#7d5a2c');R(ctx,x-3,y+6,6,3,'#7d5a2c');R(ctx,x+10,y+6,6,3,'#7d5a2c');}
function atJack(x,y,dir,load){ // transpalette devant l'agent : timon, fourches, palette et carton s'il est chargé
  const d=dir==='left'?-1:dir==='right'?1:0, v=dir==='up'?-1:dir==='down'?1:0;
  if(d){const fx=x+d*30;R(ctx,x+d*8-(d<0?16:0),y-22,16,4,'#1c1c1c');R(ctx,x+d*20-2,y-20,4,18,'#d0392b');R(ctx,Math.min(x+d*20,fx+d*16),y-4,Math.abs(fx+d*16-x-d*20),6,'#d0392b');
    if(load){atPallet(fx,y-12);atCarton(fx,y-21,null);}}
  else{const fy=y+v*26;R(ctx,x-3,Math.min(y,fy)-2,6,Math.abs(fy-y)+4,'#d0392b');R(ctx,x-9,y-(v>0?4:0)-2,18,4,'#1c1c1c');
    if(load){atPallet(x,fy-4);atCarton(x,fy-13,null);}}
}
function atSmoke(x,y,now){for(let k=0;k<4;k++){const t=((now/900)+k/4)%1;ctx.fillStyle=`rgba(90,90,96,${.55*(1-t)})`;ctx.beginPath();ctx.arc(x+Math.sin(now/300+k)*4,y-t*30,4+t*6,0,7);ctx.fill();}
  if(Math.floor(now/120)%3===0)for(let k=0;k<3;k++)R(ctx,x-8+((now/37+k*13)%16),y+2-((now/23+k*7)%10),2,2,'#ffd84a');}
function atBeacon(x,y,now){const a=now/250;R(ctx,x-6,y-4,12,8,'#5a3a10');ctx.fillStyle='#ff9a1a';ctx.beginPath();ctx.arc(x,y-6,6,0,7);ctx.fill();
  ctx.fillStyle='rgba(255,154,26,.25)';ctx.beginPath();ctx.moveTo(x,y-6);ctx.arc(x,y-6,60,a,a+.6);ctx.fill();ctx.beginPath();ctx.moveTo(x,y-6);ctx.arc(x,y-6,60,a+Math.PI,a+Math.PI+.6);ctx.fill();}
// un agent de l'étage : l'apparence d'un agent du Bureau (un intérimaire en dernier recours), le nom de ce qu'il fait,
// l'hologramme bleu des agents du quotidien
function atWorker(k,x,y,dir,err,name){
  const all=chars.filter(c=>!c.person&&!c.visitor&&!c.boss&&c.sprite), named=all.filter(c=>!c.temp&&c.sprite!=='temp'), ag=named.length?named:all;
  if(!ag.length)return null;
  const src=ag[k%ag.length];
  return Object.assign(Object.create(Object.getPrototypeOf(src)),src,{key:'at_'+k,name,baseName:name,role:name,temp:false,family:'jour',holo:null,
    pos:{x,y},tile:null,dir,moving:false,pose:'type',present:true,_st:{st:err?'error':'work'},phase:(x*7+y)%5});
}
let AT_OFF=null;
function atLayer(){if(!AT_OFF){AT_OFF=document.createElement('canvas');AT_OFF.width=AT_W;AT_OFF.height=AT_H;}const g=AT_OFF.getContext('2d');g.imageSmoothingEnabled=false;g.clearRect(0,0,AT_W,AT_H);return g;}
function atDrawInto(g,c,now){const s=ctx;ctx=g;try{drawChar(c,now);}finally{ctx=s;}}
let AT_HITS=[], AT_PICK=null; // zones cliquables de l'image ; agent, ticket en attente ou panne choisi (sinon ATSEL : un bureau)
const atHit=(kind,x,y,w,h,ref)=>AT_HITS.push({kind,x,y,w,h,...ref});
// ---------- un bureau ----------
function atRoom(r,i,now,dt){
  const g=AT_G[i], T=AT_TS, H=g.H, leave=AT_MEM.leaving[i], live=r&&!r.gate, al=g.L?'left':'right', hx=g.L?(g.x0+.5)*T:(g.x1-.5)*T;
  if(r){atTxt('BUREAU '+(i+1)+' · '+r.ticket+' · '+String(r.repo||'').split('/').pop()+(r.tour?' · tour '+r.tour:'')+' · '+Math.round((r.tok||0)/1e3)+' k jetons',hx,g.head,'#1c1f26','bold 11px ui-monospace,Menlo,monospace',al);
    const nt=r.note||(r.lot?'⌨ Code · '+r.lot:'');
    if(nt){ctx.font='bold 10px ui-monospace,Menlo,monospace';const w=ctx.measureText(nt).width+10;atPill(nt,g.L?hx+w/2:hx-w/2,g.noteY,r.gate?'#8a5a00':r.back?'#a8323a':'#2a4a7a');}}
  else atTxt('BUREAU '+(i+1)+' · '+(leave?leave.ticket+' · sorti':'libre'),hx,g.head,'#8a8478','bold 11px ui-monospace,Menlo,monospace',al);
  const x_=g.L?g.turnX:g.ex, w_=Math.abs(g.ex-g.turnX)+.7*T;
  atBelt(x_,g.b1,w_,H,live,now,g.L?-1:1);atBelt(g.turnX,g.b1+H,.7*T,g.b2-g.b1-H,live,now,2);atBelt(x_,g.b2,w_,H,live,now,g.L?1:-1);
  atHatchBox(g.wallX,g.b1,H,false);atHatchBox(g.wallX,g.b2,H,true);
  const people=[], ghosts=[], sleepers=[], late=[];
  AT_DESKS.forEach((p,idx)=>{
    const sp=atSpot(g,p.k), top=sp.row===1, s=atState(r,p);
    if(p.gate){R(ctx,sp.x-14,g.b1-20,3,20,'#8a8478');R(ctx,sp.x+12,g.b1-20,3,20,'#8a8478');for(let k=0;k<4;k++)R(ctx,sp.x-14+k*7,g.b1-20,7,5,k%2?'#1c1c1c':'#f2c230');
      late.push(()=>atPill('✋ Ton plan',sp.x,g.lab1,r&&r.gate?'#8a5a00':'#e9dcb8',r&&r.gate?'#fff':'#6a5a30','bold 9px system-ui,sans-serif'));return;}
    const deskY=top?g.desk1:g.desk2, feet=top?g.feet1:g.feet2, labelY=top?g.lab1:g.lab2;
    const col={run:'#2f6fd6',bloq:'#a8323a',err:'#a8323a',ok:'#2f7a45',avis:'#9a6a10',skip:'#d8d2c4'}[s]||'#f4efe4';
    late.push(()=>atPill(p.i+' '+p.n,sp.x,labelY,col,['run','bloq','err','ok','avis'].includes(s)?'#fff':s==='skip'?'#8a8478':'#3a3530','bold 9px system-ui,sans-serif'));
    const a=atWorker(i*20+idx,sp.x,feet,'down',false,p.n);if(!a)return;
    a._at={i,k:p.k,s};
    if(s==='skip'){atDesk(sp.x,deskY,false);return;}
    const wand=s==='idle'&&atWandering(i,p.k);
    if(wand){atDesk(sp.x,deskY,false);return;}
    atHit('agent',sp.x-14,feet-56,28,58,{i,k:p.k});
    if(s==='run'){
      const gl=ctx.createRadialGradient(sp.x,feet-24,4,sp.x,feet-24,46);gl.addColorStop(0,'rgba(255,246,190,.65)');gl.addColorStop(1,'rgba(255,246,190,0)');ctx.fillStyle=gl;ctx.fillRect(sp.x-48,feet-72,96,96);
      a._st={st:'work'};a.pose='type';people.push([a,()=>atDesk(sp.x,deskY,true),top]);
      const back=AT_MEM.backAt[r.run], sigh=p.k==='code'&&back&&now-back<8e3;
      late.push(()=>atBubble(sp.x,feet-62,sigh?'encore ?':r.lot||(p.k==='retours'?'retours de la revue':'au travail')));
    }else if(s==='bloq'||s==='err'){
      a._st={st:'error'};a.pose=s==='bloq'&&AT_MEM.backAt[r.run]&&now-AT_MEM.backAt[r.run]<8e3?'hands':'stand';people.push([a,()=>atDesk(sp.x,deskY,true,'#ff9a8a'),top]);
      late.push(()=>atBadge(sp.x+18,feet-42,'!','#d0392b'));
      if(s==='err'){late.push(()=>{atSmoke(sp.x,deskY-12,now);atPill('🧯 '+p.n+' en panne : le pompier arrive',sp.x,top?g.lab1-18:g.lab2+18,'#a8323a');});atExtinguisher(r,i,p.k,sp.x,feet,now,dt,people);}
    }else if(s==='ok'||s==='avis'){
      const t=AT_MEM.okAt[r.run+'|'+p.k], age=t?now-t:1e9, pop=age<600?Math.min(1,age/300)*(1+.4*Math.sin(age/600*Math.PI)):1;
      a._st={st:'idle'};a.pose=age<1800?'hands':'stand';people.push([a,()=>atDesk(sp.x,deskY,false),top]);
      late.push(()=>{atBadge(sp.x+18,feet-42,s==='ok'?'✓':'!',s==='ok'?'#2f9e55':'#d08a10',pop);if(themeIs('saint-valentin')&&age<2500)E('❤',sp.x,feet-70-age/40,12,1-age/2500);});
    }
    else if(s==='idle'){a._st={st:'idle'};a.pose='stand';sleepers.push([a,sp.x,feet,deskY,top]);}
    else {a._st={st:'idle'};a.pose='stand';ghosts.push([a,sp.x,deskY]);}
  });
  if(ghosts.length){const gg=atLayer();ghosts.forEach(([a])=>atDrawInto(gg,a,now));ctx.save();ctx.globalAlpha=.38;ctx.filter='grayscale(1)';ctx.drawImage(AT_OFF,0,0);ctx.restore();ghosts.forEach(([,x,y])=>atDesk(x,y,false));}
  people.forEach(([c,d,top])=>{if(top){drawChar(c,now);d();}else{d();drawChar(c,now);}});
  sleepers.forEach(([a,x,f,y,top])=>{if(top){drawChar(a,now);atDesk(x,y,false);}else{atDesk(x,y,false);drawChar(a,now);}});
  // le carton : glisse vers son poste (recule au code après un bloquant), ou attend la livraison à la trappe de sortie
  if(r){const c=AT_MEM.cart[r.run];
    if(c&&!c.hidden){const d=c.target-c.s, v=(d<0?170:110)*dt;c.s=Math.abs(d)<=v||REDUCED_MOTION?c.target:c.s+Math.sign(d)*v;}
    if(r.back){const bq=AT_POSTES.find(p=>(r.states||{})[p.k]==='bloq'), cs=atSpot(g,'code');if(bq){const a=atSpot(g,bq.k), yy=g.b1+H+.33*T;
      ctx.strokeStyle='#e0614f';ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(a.x,g.b1+H+2);ctx.lineTo(a.x,yy);ctx.lineTo(cs.x,yy);ctx.lineTo(cs.x,g.b1+H+8);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='#e0614f';ctx.beginPath();ctx.moveTo(cs.x,g.b1+H+2);ctx.lineTo(cs.x-4,g.b1+H+9);ctx.lineTo(cs.x+4,g.b1+H+9);ctx.fill();}}
    if(c&&!c.hidden){const pt=atBeltAt(g,c.s);late.push(()=>atCarton(pt.x,pt.y+2,null));atHit('room',pt.x-14,pt.y-12,28,20,{i});}}
  if(leave&&!leave.picked){const pt=atBeltAt(g,atBeltLen(g));late.push(()=>atCarton(pt.x,pt.y+2,null));}
  if(r&&r.gate==='gate_escalade')late.push(()=>atBeacon(g.door.x,g.top?AT_HY0*T-8:AT_HY1*T+14,now));
  late.forEach(f=>f());
  // lumières : s'allument à l'arrivée d'un ticket, s'éteignent doucement quand le bureau se libère
  const want=r||leave?1:0;AT_MEM.lit[i]+=Math.sign(want-AT_MEM.lit[i])*Math.min(Math.abs(want-AT_MEM.lit[i]),dt/(REDUCED_MOTION?.01:2.5));
  const sweep=AT_MEM.clean&&!AT_MEM.clean.moving&&AT_MEM.clean.stop.i===i, dark=(1-AT_MEM.lit[i])*(sweep?.35:1);
  if(dark>.01){ctx.fillStyle=`rgba(10,14,34,${(.55*dark).toFixed(3)})`;ctx.fillRect(g.x0*T+5,g.y0*T+5,(g.x1-g.x0)*T-10,(g.y1-g.y0)*T-10);
    if(dark>.9||sweep&&!r){sleepers.forEach(([,x,f],k)=>atTxt('z Z',x+12,f-58-(Math.floor(now/800+k)%2)*4,'#bfe6ff','bold 11px ui-monospace,Menlo,monospace'));
      atPill('💤 Libre : ils somnolent à leur poste',(g.x0+g.x1)/2*T,g.b1+H+.35*T,'#1c2440','#bfe6ff');}}
  atHit('room',g.x0*T,g.y0*T,(g.x1-g.x0)*T,(g.y1-g.y0)*T,{i});
}
// poste en panne : un agent arrive de la porte avec un extincteur et arrose l'écran tant que le poste reste en panne
function atExtinguisher(r,i,k,x,feet,now,dt,people){
  const key=r.run+'|'+k, g=AT_G[i], to={x:x+30,y:feet+2};
  let e=AT_MEM.ext[key];
  if(!e){const r=atRouteOut(i,k).reverse(), row=atSpot(g,k).row, side={x:x+30,y:row===1?g.back1:g.front2};r[r.length-1]=side;
    e=AT_MEM.ext[key]={walk:atWalker(REDUCED_MOTION?[side]:r,80)};}
  e.seen=now;
  const done=atStep(e.walk,dt), a=atWorker(90+i,e.walk.pos.x,e.walk.pos.y,done?'left':e.walk.dir,false,'Pompier');if(!a)return;
  atHit('pompier',e.walk.pos.x-14,e.walk.pos.y-56,28,58,{i,k});
  a.moving=!done;a.pose='stand';a._st={st:'work'};
  people.push([a,()=>{R(ctx,e.walk.pos.x-14,e.walk.pos.y-26,6,14,'#d0392b');if(done)for(let n=0;n<4;n++){const t=((now/400)+n/4)%1;ctx.fillStyle=`rgba(255,255,255,${.8*(1-t)})`;ctx.beginPath();ctx.arc(e.walk.pos.x-16-t*18,e.walk.pos.y-34-t*8,3+t*4,0,7);ctx.fill();}},true]);
}
// ---------- couloir central : grand tableau, boss, entrepôt ----------
function atBoard(slots){
  const T=AT_TS, bx=12.2*T, by=1.15*T, bw=21.6*T, bh=3.15*T, cw=bw/4;
  R(ctx,bx-6,by-6,bw+12,bh+12,'#3a3530');R(ctx,bx,by,bw,bh,'#10141c');R(ctx,bx,by,bw,16,'#1c2230');
  atTxt('ORCHESTRATEUR',bx+bw/2,by+12,'#9fc4ff','bold 10px ui-monospace,Menlo,monospace');
  if(themeIs('noel'))for(let k=0;k<26;k++){ctx.fillStyle=['#ff4a4a','#ffd84a','#4aff8a','#4ac8ff'][(k+Math.floor(performance.now()/500))%4];ctx.beginPath();ctx.arc(bx+8+k*(bw-16)/25,by-4,3,0,7);ctx.fill();}
  if(themeIs('halloween')){ctx.strokeStyle='rgba(230,230,230,.7)';ctx.lineWidth=1;for(let k=0;k<5;k++){ctx.beginPath();ctx.moveTo(bx+bw,by);ctx.lineTo(bx+bw-30+k*6,by+30-k*6);ctx.stroke();}}
  slots.forEach((r,k)=>{const x=bx+k*cw, col=!r?'#4a5060':r.gate?'#ffcf4a':r.back?'#ff8a80':'#8fe3a8';
    if(k)R(ctx,x,by+18,1,bh-22,'#2b3240');
    atTxt('B'+(k+1)+(r?' · '+r.ticket:' · libre'),x+10,by+34,col,'bold 11px ui-monospace,Menlo,monospace','left');
    if(!r){atTxt('rien en cours',x+10,by+52,'#6b7280','10px system-ui,sans-serif','left');return;}
    atTxt((r.title||'').slice(0,30)+((r.title||'').length>30?'…':''),x+10,by+50,'#c9c3b4','9px system-ui,sans-serif','left');
    const p=AT_POSTES.find(q=>q.k===r.poste);
    const pe=AT_POSTES.find(q=>(r.states||{})[q.k]==='err');
    atTxt(r.gate==='gate_escalade'?'🚨 demande un humain':r.gate?'✋ attend ta décision':r.back?'↩ renvoyé au code':pe?'🧯 '+pe.n+' en panne':(p?p.i+' '+p.n+(r.lot?' · '+r.lot:''):''),x+10,by+68,col,'bold 10px system-ui,sans-serif','left');
    const sw=(cw-20)/AT_POSTES.length;AT_POSTES.forEach((q,j)=>{const s=(r.states||{})[q.k];R(ctx,x+10+j*sw,by+78,sw-2,6,(AT_ST[s]||['#2b3240'])[0]);});
    atTxt((r.tour?'tour '+r.tour+' · ':'')+Math.round((r.tok||0)/1e3)+' k jetons',x+10,by+96,'#8a93a6','9px ui-monospace,Menlo,monospace','left');
    atHit('room',x,by,cw,bh,{i:k});
  });
}
// le boss : dans son fauteuil (de face, comme au RDC) ; quand une gate attend, il se lève et va à la porte de ce bureau
function atBoss(slots,now,dt,people){
  const boss=chars.find(c=>c.boss), gates=slots.map((r,i)=>r&&r.gate?{i,t:ms(r.since)||0}:null).filter(Boolean).sort((a,b)=>a.t-b.t);
  const target=gates.length?gates[0].i:null;
  let b=AT_MEM.boss;
  if(!b||REDUCED_MOTION&&b.target!==target)b=AT_MEM.boss={target,walk:atWalker(target==null?[AT_CHAIR]:[atBossPath(AT_CHAIR,target).pop()])};
  if(b.target!==target){b.target=target;b.walk=atWalker(atBossPath(b.walk.pos,target),90);}
  const arrived=atStep(b.walk,dt), seated=arrived&&target==null;
  // bureau, fauteuil et boss aux mesures du RDC (40-furniture.js) : fauteuil 44 px au-dessus de ses pieds, bureau de 100 px
  // 16 px au-dessus, son écran, sa tasse, « WORLD'S BEST BOSS » ; les quatre voyants des bureaux à la place de la feuille
  const ox=AT_CHAIR.x, F=AT_CHAIR.y, x0=ox-50, top=F-16;
  R(ctx,ox-18,F-44,36,30,'#5a2e2e');R(ctx,ox-18,F-44,36,4,'#723a3a');R(ctx,ox-22,F-30,6,18,'#4a2424');R(ctx,ox+16,F-30,6,18,'#4a2424');
  R(ctx,ox-22,F-30,6,2,'#6a3434');R(ctx,ox+16,F-30,6,2,'#6a3434');
  const desk=()=>{
    R(ctx,x0,top+30,3*AT_TS+4,3,'rgba(0,0,0,.2)');R(ctx,x0,top,3*AT_TS+4,18,'#6e4a2c');R(ctx,x0,top,3*AT_TS+4,2,'#8a6040');R(ctx,x0,top+18,3*AT_TS+4,13,'#56391f');
    R(ctx,x0+6,top-12,18,13,'#2c2f38');drawScreen(x0+7,top-11,16,10,boss?screenState(boss):'off',now,97);R(ctx,x0+12,top+1,5,3,'#2c2f38');
    slots.forEach((r,k)=>{const x=x0+42+k*8, on=r&&r.gate;R(ctx,x-3,top+4,7,7,'#1c1c1c');
      R(ctx,x-2,top+5,5,5,!r?'#555':on?(Math.floor(now/450)%2?'#ffcf4a':'#a37a10'):r.back?'#e0614f':'#3fbf6a');atHit('room',x-4,top+2,9,11,{i:k});});
    R(ctx,x0+76,top+2,6,7,'#fbfbf6');R(ctx,x0+77,top+4,4,2,'#d1453b');
    if(themeIs('saint-valentin'))E('🌹',x0+92,top-2,12);
    ctx.fillStyle='#f3e6d2';ctx.font='bold 8px ui-monospace,Menlo,monospace';ctx.textAlign='center';ctx.fillText("WORLD'S BEST BOSS",ox,top+27);ctx.textAlign='left';};
  if(!boss){desk();return;}
  const c=Object.assign(Object.create(Object.getPrototypeOf(boss)),boss,{pos:{x:b.walk.pos.x,y:b.walk.pos.y},tile:seated?BOSS_SEAT.slice():null,moving:!arrived,pose:'stand',present:true,
    dir:arrived?(target==null?'down':AT_G[target].top?'up':'down'):b.walk.dir,_st:{st:gates.length?'gate':'idle'}});
  if(seated){drawChar(c,now);desk();}
  else{desk();people.push([c,null,false,()=>{if(arrived&&target!=null)atBubble(c.pos.x+44,c.pos.y-30,'✋ '+(slots[target]?slots[target].ticket:''),'#8a5a00');}]);}
  if(seated&&gates.length)atBubble(ox,F-58,'✋ '+gates.length);
}
function atWarehouse(q,pn,now){ // en bas du couloir central : sol béton, bande de sécurité, deux rayonnages, les pannes sur palettes
  const T=AT_TS, x0=AT_CX0*T+6, x1=AT_CX1*T-6, y0=21.6*T, y1=27*T;
  R(ctx,x0,y0,x1-x0,y1-y0,'#9a9890');for(let y=y0;y<y1;y+=T)R(ctx,x0,y,x1-x0,1,'#8a887f');
  for(let k=0;k<(x1-x0)/12;k++)R(ctx,x0+k*12,y0,12,6,k%2?'#1c1c1c':'#f2c230');
  atPill('📦 ENTREPÔT · '+q.length+' en attente',(x0+x1)/2,y0-10,'#5a4636');
  const rack=(rx,ry)=>{R(ctx,rx,ry,5,2.3*T,'#2f5f9a');R(ctx,rx+2.3*T-5,ry,5,2.3*T,'#2f5f9a');for(const yy of [ry+.9*T,ry+2*T])R(ctx,rx,yy,2.3*T,5,'#d07a1a');};
  rack(x0+6,y0+.6*T);rack(x1-6-2.3*T,y0+.6*T);
  const slots=[[x0+6+1.15*T,y0+1.5*T],[x1-6-1.15*T,y0+1.5*T],[x0+6+1.15*T,y0+2.6*T],[x1-6-1.15*T,y0+2.6*T]];
  slots.forEach(([x,y],k)=>{const t=q[k];if(t){atCarton(x,y-2,t.ticket,'#5b6070',-20);atHit('queue',x-14,y-14,28,20,{run:t.run});}else R(ctx,x-16,y-4,32,4,'#a8824e');});
  if(q.length>4)atPill('+'+(q.length-4),(x0+x1)/2,y0+3.3*T,'#5b6070');
  if(themeIs('halloween'))[[x0+14,y0+.55*T],[x1-14,y0+.55*T]].forEach(([x,y])=>E('🎃',x,y,14));
  pn.slice(0,2).forEach((p,k)=>{const x=x0+30+k*(x1-x0-60), y=y1-.55*T;atPallet(x,y);atCarton(x,y-9,'🧯 '+p.ticket,'#a8323a',-22);atSmoke(x+8,y-24,now+k*300);atHit('panne',x-16,y-22,32,26,{run:p.run});});
  if(!pn.length){atPallet((x0+x1)/2,y1-.9*T);atPallet((x0+x1)/2,y1-.9*T-8);}
}
// tickets sortis aujourd'hui (runs de la chaîne terminés, mis de côté par setData) ; la démo en invente
let AT_RUNS=[];
function atDelivered(){
  const p=String(CFG.atelier_chain||'');
  const n=p?AT_RUNS.filter(r=>String(r.wf||'').startsWith(p)&&r.status==='Success'&&ms(r.end)>=DAY0).length:0;
  return n||(ATELIER&&ATELIER.livres)||0;
}
function atCorridor(now){
  const T=AT_TS, yb=AT_HY1*T-6;
  atCoffee(1.1*T,yb);atTxt('CAFÉ',1.1*T,AT_HY0*T+14,'#5a4636','bold 8px ui-monospace,Menlo,monospace');
  atSofa(15*T,AT_HY0*T+30);atSofa(31*T,AT_HY0*T+30);
  atDoor(46*T,AT_HY0*T);const n=atDelivered();
  atPill('SORTIE'+(n?' · 📦 '+n+' aujourd\'hui':''),46*T-14-(n?62:22),AT_HY0*T+16,n?'#2f7a45':'#5a4636','#fff','bold 9px ui-monospace,Menlo,monospace');
  atPlant(18.9*T,yb);atPlant(27.1*T,yb);
  if(themeIs('noel')){xmasTreeAt(8.5*T,AT_HY1*T-4,now);}
  if(themeIs('nouvel-an')||themeIs('saint-valentin'))[[9*T,AT_HY0*T+20],[37*T,AT_HY0*T+20]].forEach(([x,y],k)=>balloon(themeIs('nouvel-an')?'🎈':'💗',x,y,now,k));
}
function xmasTreeAt(x,y,now){ctx.fillStyle='#2f7a3a';for(let k=0;k<3;k++){ctx.beginPath();ctx.moveTo(x,y-46+k*12);ctx.lineTo(x-14-k*4,y-22+k*10);ctx.lineTo(x+14+k*4,y-22+k*10);ctx.fill();}
  R(ctx,x-3,y-4,6,6,'#6b4a2e');E('⭐',x,y-48,10);for(let k=0;k<6;k++){ctx.fillStyle=['#ff4a4a','#ffd84a','#4ac8ff'][(k+Math.floor(now/500))%3];ctx.beginPath();ctx.arc(x-10+((k*7)%20),y-34+k*5,2,0,7);ctx.fill();}}
// ---------- Bernard : il apporte les tickets de l'entrepôt et emporte ceux qui sortent ----------
// Un vrai personnage (pas un hologramme) : homme âgé, dégarni, lunettes, blouse de travail. Un seul Bernard : les
// livraisons passent l'une après l'autre ; entre deux, il attend à l'entrepôt.
// Noël : il devient le Père Noël (tenue rouge, barbe blanche, le bonnet du thème) ; Halloween : un fantôme sous son drap
RECIPES.at_bernard=RECIPES.at_bernard||{sex:'male',head:'male_elderly',skin:'light',hair:'high_and_tight',hair_color:'#c9c9c9',glasses:'glasses',
  torso:'longsleeve/longsleeve',shirt:'#4a6b8a',legs:'pants',legs_color:'#3a3f4a',shoes:'#2a1f18'};
RECIPES.at_bernard_noel=RECIPES.at_bernard_noel||{...RECIPES.at_bernard,hair_color:'#f4f4f4',beard:'beard/basic',shirt:'#c8323a',legs_color:'#c8323a',shoes:'#1c1c1c'};
const AT_BERNARD_HOME={x:AT_MX-1.6*AT_TS,y:20.75*AT_TS};
function atBernard(pos,dir,moving){return {key:'at_bernard',sprite:themeIs('noel')?'at_bernard_noel':'at_bernard',ghost:themeIs('halloween'),name:'Bernard',role:'Manutentionnaire',person:true,pos:{x:pos.x,y:pos.y},tile:null,
  dir:dir||'down',moving:!!moving,pose:'stand',present:true,phase:1.3,_st:{st:moving?'work':'idle'}};}
function atGhost(c,now){
  const x=Math.round(c.pos.x), y=Math.round(c.pos.y)-4-Math.round(Math.sin(now/300)*2), side=c.dir==='left'?-1:c.dir==='right'?1:0;
  ctx.fillStyle='rgba(0,0,0,.18)';ctx.beginPath();ctx.ellipse(x,c.pos.y+1,11,4,0,0,7);ctx.fill();
  ctx.fillStyle='#f4f2ee';ctx.beginPath();ctx.arc(x,y-36,13,Math.PI,0);ctx.lineTo(x+13,y-4);
  for(let k=0;k<4;k++){const w=26/4;ctx.lineTo(x+13-w*(k+.5),y-(k%2?6:0)-((Math.floor(now/200)+k)%2)*2);ctx.lineTo(x+13-w*(k+1),y-4);}ctx.closePath();ctx.fill();
  ctx.strokeStyle='#c9c4ba';ctx.lineWidth=1;ctx.stroke();
  if(c.dir!=='up'){R(ctx,x-6+side*3,y-40,3,5,'#1c1c1c');R(ctx,x+3+side*3,y-40,3,5,'#1c1c1c');R(ctx,x-2+side*3,y-31,4,3,'#1c1c1c');}
  E('🎃',x+(side||1)*14,y-12,12);
}
// ---------- scènes : livraison d'un ticket (entrepôt -> trappe d'entrée), sortie (trappe de sortie -> porte) ----------
function atScenes(now,dt,people){
  const sc=AT_MEM.scenes[0];
  if(!sc){if(!atOpen())return;const b=atBernard(AT_BERNARD_HOME,'down',false);people.push([b,null,false]);atHit('bernard',b.pos.x-14,b.pos.y-56,28,58,{});return;}
  {
    const g=AT_G[sc.i];
    if(!sc.walk){
      if(sc.kind==='arrive')sc.walk=atWalker([AT_BERNARD_HOME,...atToHatch(g,1,AT_DOCK)],85);
      else sc.walk=atWalker([AT_BERNARD_HOME,...atToHatch(g,2,AT_DOCK)],85);
      sc.phase=0;
    }
    const arrived=atStep(sc.walk,dt);
    if(arrived&&sc.phase===0){sc.phase=1;sc.hold=now;
      if(sc.kind==='arrive'){const c=AT_MEM.cart[sc.run];if(c)c.hidden=false;}
      else{const l=AT_MEM.leaving[sc.i];if(l)l.picked=true;}}
    let turned=false;
    if(sc.phase===1&&now-sc.hold>1200){sc.phase=2;turned=true;
      sc.walk=sc.kind==='arrive'?atWalker([...atToHatch(g,1,AT_DOCK).reverse(),AT_BERNARD_HOME],95):atWalker([sc.walk.pos,{x:sc.walk.pos.x,y:AT_MY},AT_EXIT],85);}
    if(sc.phase===2&&arrived&&!turned){if(sc.kind==='exit'&&!sc.home){sc.home=true;AT_MEM.leaving[sc.i]=null;sc.walk=atWalker([AT_EXIT,{x:AT_LANE,y:AT_MY},{x:AT_LANE,y:AT_BERNARD_HOME.y},AT_BERNARD_HOME],110);}else sc.done=true;}
    const load=sc.kind==='arrive'?sc.phase===0:sc.phase===2, a=atBernard(sc.walk.pos,sc.walk.dir,!arrived);
    atHit('bernard',a.pos.x-14,a.pos.y-56,28,58,{});
    const pos={...sc.walk.pos}, dir=sc.walk.dir;
    const carry=load&&!sc.home;
    people.push([a,()=>atJack(pos.x,pos.y,dir,carry),dir==='up',()=>{if(carry&&sc.kind==='exit')atPill('📦 '+sc.ticket+' · PR ouverte → sortie',pos.x,pos.y-66,'#2f7a45');}]);
  }
  AT_MEM.scenes=AT_MEM.scenes.filter(s=>!s.done);
  if(AT_MEM.scenes.length>8)AT_MEM.scenes.splice(0,AT_MEM.scenes.length-8);
}
// ---------- le ménage du soir (49-menage.js) : après le RDC, l'agent d'entretien fait le 1er étage ----------
// Rejouable comme au RDC : tout se lit dans l'heure du plan (T) et la tournée du RDC (cleaningVisit, tirée au sort pour la
// date). Il entre par la porte de sortie, passe dans chaque bureau (2, 4, 3, 1), puis à l'entrepôt, et repart par la
// porte : un quart de chaque étape à marcher, le reste à balayer. Le bureau où il passe s'éclaire.
const AT_CLEAN_DUR=40*60e3;
const atCleaner=()=>chars.find(c=>c.on==='cleaning')||null;
function atCleanVisit(c,t){const v=c&&atelierOn()&&cleaningVisit(c,t);return v?{s:v.e,e:v.e+AT_CLEAN_DUR}:null;}
function atCleanStops(){
  const st=[{p:AT_EXIT,room:'la porte',i:null}];
  for(const i of [1,3,2,0]){const g=AT_G[i];st.push({p:{x:g.door.x,y:g.aisle},room:'le bureau '+(i+1),i});}
  return st.concat([{p:{x:AT_MX+1.4*AT_TS,y:20.3*AT_TS},room:'l\'entrepôt',i:null},{p:AT_EXIT,room:'la porte',i:null}]);
}
// point à la fraction f d'une ligne brisée, et la direction du segment
function atAlong(pts,f){
  const seg=[];let tot=0;for(let k=1;k<pts.length;k++){const d=Math.hypot(pts[k].x-pts[k-1].x,pts[k].y-pts[k-1].y);seg.push(d);tot+=d;}
  let r=Math.max(0,Math.min(1,f))*tot;
  for(let k=0;k<seg.length;k++){const a=pts[k], b=pts[k+1];if(r<=seg[k]||k===seg.length-1){const u=seg[k]?r/seg[k]:1, dx=b.x-a.x, dy=b.y-a.y;
    return {x:a.x+dx*u,y:a.y+dy*u,dir:Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up')};}r-=seg[k];}
  return {...pts[pts.length-1],dir:'down'};
}
// où il est à l'heure t : null hors de sa tournée du 1er étage
function atCleanerAt(c,t){
  const v=atCleanVisit(c,t);if(!v||t<v.s||t>=v.e)return null;
  const st=atCleanStops(), n=st.length-1, k=(t-v.s)/(v.e-v.s)*n, j=Math.min(n-1,Math.floor(k)), f=k-j, a=st[j].p, b=st[j+1].p;
  if(f<.25){const q=atAlong([a,{x:a.x,y:AT_MY},{x:b.x,y:AT_MY},b],f/.25);return {x:q.x,y:q.y,dir:q.dir,moving:true,stop:st[j+1],v};}
  return {x:b.x,y:b.y,dir:Math.floor(t/2000)%2?'left':'right',moving:false,stop:st[j+1],v};
}
const atCleanLabel=m=>m.moving?'Fait le ménage du 1er étage : va vers '+m.stop.room:'Fait le ménage du 1er étage : '+m.stop.room+' · repart vers '+hm(m.v.e);
// ---------- loupe (44-loupe.js) au 1er étage : les événements forts de l'atelier ----------
// Un ticket qui sort (Bernard l'emporte), qui arrive, le boss à la porte d'un bureau qui l'attend, un retour au code, un
// poste en panne, le ménage du soir. Chaque événement : des points du plan (le cadre les englobe), une légende.
const atPt=(x,y,name,label,kind)=>({pos:{x,y},moving:false,name,_st:{st:kind,label}});
function atLoupeEvents(now){
  const out=[], slots=atSlots(), add=(id,kind,cs)=>out.push({id,kind,cs});
  for(const sc of AT_MEM.scenes){const g=AT_G[sc.i];
    if(sc.kind==='exit'){const h=g.hatch(2);add('atx:'+sc.ticket+':'+sc.t0,'at_exit',[atPt(h.x,h.y,'Bernard','📦 '+sc.ticket+' sort du bureau '+(sc.i+1)+' : PR ouverte, Bernard l\'emporte','at_exit'),atPt(AT_EXIT.x,AT_EXIT.y,'','','at_exit')]);}
    else{const h=g.hatch(1);add('ata:'+sc.run+':'+sc.t0,'at_arrive',[atPt(AT_DOCK.x,AT_DOCK.y,'Bernard','🎫 '+sc.ticket+' arrive au bureau '+(sc.i+1),'at_arrive'),atPt(h.x,h.y,'','','at_arrive')]);}}
  slots.forEach((r,i)=>{if(!r)return;const g=AT_G[i], boss=chars.find(c=>c.boss);
    if(r.gate)add('atg:'+r.run+':'+r.gate,'at_gate',[atPt(g.door.x,g.door.y+(g.top?22:-6),boss?boss.name:'Le boss',(r.gate==='gate_escalade'?'🚨 La chaîne demande un humain : ':'✋ Ta décision : ')+r.ticket+' au bureau '+(i+1),'at_gate'),atPt(g.door.x,g.top?g.feet2:g.feet1,'','','at_gate')]);
    const b=AT_MEM.backAt[r.run];
    if(b&&now-b<30e3){const q=AT_POSTES.find(p=>(r.states||{})[p.k]==='bloq'), a=q&&atSpot(g,q.k), c=atSpot(g,'code');
      if(a)add('atb:'+r.run+':'+b,'at_back',[atPt(a.x,g.feet1,'Retour au code',q.i+' '+q.n+' bloque '+r.ticket+' : retour au code','at_back'),atPt(c.x,g.feet1,'','','at_back')]);}
    for(const p of AT_POSTES){if((r.states||{})[p.k]!=='err')continue;const sp=atSpot(g,p.k), y=sp.row===1?g.feet1:g.feet2;
      add('ate:'+r.run+':'+p.k,'at_err',[atPt(sp.x,y,'Pompier','🧯 '+p.i+' '+p.n+' en panne au bureau '+(i+1)+' : le pompier arrive','at_err'),atPt(g.door.x,g.door.y,'','','at_err')]);}
  });
  if(AT_MEM.clean){const m=AT_MEM.clean, c=atCleaner();add('atc:'+m.v.s,'at_clean',[atPt(m.x,m.y,c?c.name:'L\'agent d\'entretien',atCleanLabel(m),'at_clean')]);}
  return out;
}
// ---------- scènes de l'étage pour la galerie (46-gallery.js), jouables par « ▶ voir » ----------
// Chacune joue sur une copie du dataset atelier (rendue à la fin de la démonstration) : la page voit un ticket arriver,
// sortir, une gate, un retour au code, une panne, comme si le cron l'avait publié. Comme au RDC, toutes se jouent à toute
// heure : sans ticket sur la chaîne, la copie part des bureaux de la démo ; un jour sans ménage, sa tournée est inventée.
// prep : la copie de départ (posée sans scène, comme au chargement), mut : ce que la scène change ensuite
function atDemo(mut,prep){return ()=>{const src=ATELIER&&(ATELIER.rooms||[]).length?ATELIER:atelierDemo(), cp=x=>JSON.parse(JSON.stringify(x));
  const base=cp(src);base.rooms=base.rooms||[];base.queue=base.queue||[];base.pannes=base.pannes||[];if(prep)prep(base);
  ATELIER=base;AT_MEM.fresh=true;atDiff(performance.now());
  const d=cp(base);mut(d);ATELIER=d;};}
const atFirst=d=>d.rooms.find(r=>!r.gate)||d.rooms[0];
function atGalleryScenes(){
  const fam='1er étage', ok=true, cl=atCleaner(), out=[];
  out.push({fam,ico:'🎫',n:'Un ticket arrive',d:'Bernard l\'apporte de l\'entrepôt à la trappe d\'entrée, le bureau s\'allume',w:'Un ticket lancé (▶ Implémenter) trouve un bureau libre',ok,
    play:{len:25e3,speed:1,setup:atDemo(d=>{const q=d.queue.shift();d.rooms.push({run:'demo-arrive',ticket:q?q.ticket:'DM-1000',title:'Démonstration',repo:'dm/site',poste:'cadrage',states:{cadrage:'run'},tok:0,since:new Date().toISOString()});},d=>{d.rooms=d.rooms.slice(0,3);})}}); // quatre bureaux pris : un se libère d'abord, sans scène
  out.push({fam,ico:'📦',n:'Un ticket sort',d:'PR ouverte : Bernard récupère le carton à la trappe de sortie et l\'emporte par la porte',w:'Fin de la chaîne (PR, revue et retours traités)',ok,
    play:{len:45e3,speed:1,setup:atDemo(d=>{const r=atFirst(d);d.rooms=d.rooms.filter(x=>x!==r);})}});
  out.push({fam,ico:'✓',n:'Un poste rend son verdict',d:'Le ✓ apparaît, l\'agent s\'étire, le carton glisse au poste suivant',w:'Chaque poste qui finit',ok,
    play:{len:12e3,speed:1,setup:atDemo(d=>{const r=atFirst(d), ks=AT_DESKS.filter(p=>!p.gate).map(p=>p.k), j=Math.max(0,ks.indexOf(r.poste));r.states=r.states||{};r.states[ks[j]]='ok';r.poste=ks[Math.min(ks.length-1,j+1)];r.states[r.poste]='run';r.gate=null;r.back=false;})}});
  out.push({fam,ico:'✋',n:'Le boss va à la porte',d:'Une gate t\'attend : il quitte son fauteuil pour la porte du bureau, son bouton clignote',w:'Ce que j\'ai compris, ton plan, l\'escalade, la relecture de la PR',ok,
    play:{len:25e3,speed:1,setup:atDemo(d=>{const r=atFirst(d);r.gate='gate_plan';r.poste='gate';r.states=r.states||{};r.states.gate='wait';r.note='✋ ton plan';})}});
  out.push({fam,ico:'🚨',n:'Escalade',d:'Après 3 tours, la chaîne demande un humain : gyrophare au-dessus de la porte',w:'L\'orchestrateur n\'arrive pas à conclure',ok,
    play:{len:20e3,speed:1,setup:atDemo(d=>{const r=atFirst(d);r.gate='gate_escalade';r.note='🧑‍⚖️ la chaîne demande un humain';})}});
  out.push({fam,ico:'↩',n:'Retour au code',d:'Un contrôle bloque : le carton recule jusqu\'au Code, « encore ? »',w:'Un poste de contrôle rend un bloquant',ok,
    play:{len:15e3,speed:1,setup:atDemo(d=>{const r=atFirst(d);r.states=r.states||{};for(const k of ['cadrage','schema','patterns','gate','code','regles'])r.states[k]='ok';r.states.securite='bloq';r.poste='code';r.back=true;r.gate=null;r.note='🔒 bloquant → retour au code';})}});
  out.push({fam,ico:'🧯',n:'Poste en panne',d:'Son sous-workflow a échoué : fumée sur l\'écran, un pompier arrive avec un extincteur',w:'Un poste plante (API d\'un agent indisponible…)',ok,
    play:{len:20e3,speed:1,setup:atDemo(d=>{const r=atFirst(d);r.states=r.states||{};r.states.tests='err';})}});
  if(cl)out.push({fam,ico:'🧹',n:cl.name+' · ménage du 1er',d:'Après le RDC, chaque bureau et l\'entrepôt, avec son chariot',w:'Le soir des jours ouvrés, après le RDC',c:cl,ok,
    play:{len:AT_CLEAN_DUR,speed:60,setup:s=>{const u=atCleanVisit(cl,s);
      if(!u){SCENE_DEMO.visit={c:cl,v:{s:s-CLEAN_DUR,e:s,r:rng(keySeed(cl.key)*7919+daySeed(s))}};SCENE_DEMO.e=s+AT_CLEAN_DUR;return;} // pas de ménage ce jour-là : il monte maintenant
      T=u.s;SCENE_DEMO.e=u.e;needTeleport=true;}}});
  return out;
}
// ---------- jour et nuit (42-light.js) : fenêtres, voile du soir ----------
// Comme au RDC : le ciel des fenêtres suit le soleil à Paris, le voile de nuit s'ouvre seulement là où ça travaille.
// Comme au RDC aussi, le boss et les agents restent le soir et le week-end (la chaîne tourne à toute heure) : seul
// Bernard, un humain, rentre chez lui hors des heures de bureau.
const AT_WINDOWS=[1,3.5,6,8.5,35,37.5,40,42.5]; // en cases : au-dessus des bureaux 1 et 2, de part et d'autre du grand tableau
const atOpen=()=>officeOpen(T);
function atWindows(now){
  const sky=skyColor(T), T_=AT_TS;
  for(const x of AT_WINDOWS){R(ctx,x*T_+4,T_+4,T_*1.5,20,'#e7e1d3');R(ctx,x*T_+6,T_+6,T_*1.5-4,16,sky);drawStars(x*T_+6,T_+6,T_*1.5-4,16,now);
    themeWindow(x*T_+6,T_+6,T_*1.5-4,16,now,x);R(ctx,x*T_+4+T_*.75,T_+4,2,20,'#e7e1d3');}
}
let AT_NIGHT_CV=null, AT_NIGHT_AT=0;
function atNight(slots,now){
  const d=daylight(T), dark=(1-d.k)*NIGHT_MAX;if(dark<.02)return;
  const W_=AT_W/LQ, H_=AT_H/LQ;
  if(!AT_NIGHT_CV){AT_NIGHT_CV=[lightCanvas(W_,H_),lightCanvas(W_,H_)];}
  if(now-AT_NIGHT_AT>200||!AT_NIGHT_AT){AT_NIGHT_AT=now;
    const tint=mixC([10,14,40],d.morning?[70,40,24]:[66,30,52],d.twi*.7), m=AT_NIGHT_CV[0].getContext('2d');
    m.setTransform(1,0,0,1,0,0);m.globalCompositeOperation='source-over';m.clearRect(0,0,W_,H_);
    m.fillStyle=`rgba(${tint[0]},${tint[1]},${tint[2]},${dark})`;m.fillRect(0,0,W_,H_);
    m.setTransform(1/LQ,0,0,1/LQ,0,0);m.globalCompositeOperation='destination-out';
    slots.forEach((r,i)=>{if(!r&&!(AT_MEM.clean&&AT_MEM.clean.stop.i===i))return;const g=AT_G[i];m.fillStyle='rgba(0,0,0,.25)';m.fillRect(g.x0*AT_TS,g.y0*AT_TS,(g.x1-g.x0)*AT_TS,(g.y1-g.y0)*AT_TS);
      for(let x=g.x0+2;x<g.x1;x+=4)for(const y of [g.y0+3,g.y0+7.5])softSpot(m,x*AT_TS,y*AT_TS,2.6*AT_TS,.6);});
    for(const h of AT_HITS)if(h.kind==='agent'||h.kind==='bernard'||h.kind==='cleaner'||h.kind==='pompier')softSpot(m,h.x+14,h.y+30,30,.8);
    softSpot(m,23*AT_TS,2.6*AT_TS,6*AT_TS,.7); // le grand tableau
    softSpot(m,46*AT_TS-10,AT_HY0*AT_TS+20,40,.5);softSpot(m,1.1*AT_TS,AT_HY1*AT_TS-20,30,.5); // la sortie, la machine à café
    const l=AT_NIGHT_CV[1].getContext('2d');l.clearRect(0,0,W_,H_);l.filter='blur(3px)';l.drawImage(AT_NIGHT_CV[0],0,0);l.filter='none';
  }
  const sm=ctx.imageSmoothingEnabled;ctx.imageSmoothingEnabled=true;ctx.drawImage(AT_NIGHT_CV[1],0,0,AT_W,AT_H);ctx.imageSmoothingEnabled=sm;
}
// ---------- l'image ----------
function renderAtelier(now){
  const dt=AT_MEM.last?Math.min(.1,(now-AT_MEM.last)/1000):0;AT_MEM.last=now;
  if(!AT_BG)AT_BG=atBackground();
  ctx.drawImage(AT_BG,0,0);atWindows(now);AT_HITS=[];
  if(AT_MEM.src!==ATELIER){AT_MEM.src=ATELIER;atDiff(now);}
  const slots=atSlots(), d=ATELIER||{}, cl=atCleaner();AT_MEM.clean=cl&&atCleanerAt(cl,T);
  atCorridor(now);
  for(const k of Object.keys(AT_MEM.ext))if(now-AT_MEM.ext[k].seen>3e3)delete AT_MEM.ext[k];
  slots.forEach((r,i)=>atRoom(r,i,now,dt));
  atWarehouse(d.queue||[],d.pannes||[],now);
  atWanderTick(slots,now,dt);
  const people=[];
  for(const w of AT_MEM.wander){const a=atWorker(w.i*20+AT_POSTES.findIndex(p=>p.k===w.k),w.walk.pos.x,w.walk.pos.y,w.walk.dir,false,(AT_POSTES.find(p=>p.k===w.k)||{}).n);
    if(!a)continue;a.moving=w.phase!=='stay';a.pose='stand';a._st={st:'idle'};a._at={i:w.i,k:w.k,s:'wander'};people.push([a,null,false]);
    atHit('agent',w.walk.pos.x-14,w.walk.pos.y-56,28,58,{i:w.i,k:w.k});}
  atScenes(now,dt,people);
  if(AT_MEM.clean){const m=AT_MEM.clean, a=Object.assign(Object.create(Object.getPrototypeOf(cl)),cl,{pos:{x:m.x,y:m.y},tile:null,dir:m.dir,moving:m.moving,pose:'stand',present:true,_st:{st:'idle'}});
    const [dx,dy]={left:[-20,0],right:[20,0]}[m.dir]||[20,2];
    people.push([a,()=>drawCart({x:m.x+dx,y:m.y+dy}),false,()=>{if(!m.moving)E('🧹',m.x,m.y-66,12);}]);atHit('cleaner',m.x-14,m.y-56,28,58,{});}
  atBoss(slots,now,dt,people);
  people.push([{pos:{x:0,y:AT_HY0*AT_TS+44}},null,false,()=>{atSofaFront(15*AT_TS,AT_HY0*AT_TS+40);atSofaFront(31*AT_TS,AT_HY0*AT_TS+40);}]); // devant ceux qui y sont assis, derrière ceux qui passent
  people.sort((a,b)=>a[0].pos.y-b[0].pos.y).forEach(([c,d,before,after])=>{if(before&&d)d();if(c.ghost)atGhost(c,now);else drawChar(c,now);if(!before&&d)d();if(after)after();});
  atNight(slots,now);
  atBoard(slots);
  atPicked(slots,now);
}
// l'agent choisi : un anneau sous ses pieds, et le chemin jusqu'à sa place quand il n'y est pas
function atPicked(slots,now){
  if(!AT_PICK||AT_PICK.kind!=='agent')return;
  const w=atWandering(AT_PICK.i,AT_PICK.k), home=atHome(AT_PICK.i,AT_PICK.k), at=w?w.walk.pos:home, p=(Math.sin(now/260)+1)/2;
  ctx.save();ctx.strokeStyle='#ffffff';ctx.lineWidth=2;ctx.globalAlpha=.6+.4*p;ctx.beginPath();ctx.ellipse(at.x,at.y+1,16+p*3,6+p,0,0,7);ctx.stroke();ctx.restore();
  if(w){const path=atWanderPath(AT_PICK.i,AT_PICK.k,w.spot).reverse();path[0]=at;
    ctx.save();ctx.setLineDash([4,6]);ctx.lineDashOffset=-now/50;ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(path[0].x,path[0].y);for(const q of path.slice(1))ctx.lineTo(q.x,q.y-4);ctx.stroke();ctx.restore();
    ctx.strokeStyle='#ffffff';ctx.strokeRect(home.x-14,home.y-24,28,26);atPill('sa place',home.x,home.y-30,'#1c1f26');}
}
// ---------- clic et survol ----------
function atHitAt(e){
  const r=cv.getBoundingClientRect(), mx=(e.clientX-r.left)*AT_W/r.width, my=(e.clientY-r.top)*AT_H/r.height;
  for(let k=AT_HITS.length-1;k>=0;k--){const h=AT_HITS[k];if(h.kind!=='room'&&mx>=h.x&&mx<h.x+h.w&&my>=h.y&&my<h.y+h.h)return h;}
  for(let k=AT_HITS.length-1;k>=0;k--){const h=AT_HITS[k];if(mx>=h.x&&mx<h.x+h.w&&my>=h.y&&my<h.y+h.h)return h;}
  return null;
}
function atelierClick(e){
  const h=atHitAt(e), slots=atSlots();AT_PICK=null;ATSEL=null;
  if(h&&h.kind==='agent'){AT_PICK={kind:'agent',i:h.i,k:h.k};ATSEL=slots[h.i]?slots[h.i].run:null;}
  else if(h&&(h.kind==='queue'||h.kind==='panne'))AT_PICK={kind:h.kind,run:h.run};
  else if(h&&h.kind==='room')ATSEL=slots[h.i]?slots[h.i].run:null;
  renderSide(true);
}
function atelierHover(e){
  const h=atHitAt(e), slots=atSlots();cv.style.cursor=h&&(h.kind!=='room'||slots[h.i])?'pointer':'default';
  let s='';
  if(h&&h.kind==='agent'){const r=slots[h.i], w=atWandering(h.i,h.k);s=atLabel(h.k)+' · bureau '+(h.i+1)+' · '+(w?'se promène':atStateText(r,h.k));}
  else if(h&&h.kind==='cleaner'&&AT_MEM.clean)s=(atCleaner()||{}).name+' · '+atCleanLabel(AT_MEM.clean);
  else if(h&&h.kind==='pompier')s='Pompier · le poste '+atLabel(h.k)+' du bureau '+(h.i+1)+' est en panne (son sous-workflow a échoué) : il éteint le feu tant que la panne dure';
  else if(h&&h.kind==='bernard')s='Bernard · apporte les tickets de l\'entrepôt et emporte ceux qui sortent';
  else if(h&&h.kind==='queue'){const q=((ATELIER&&ATELIER.queue)||[]).find(x=>x.run===h.run);s=q?q.ticket+' · attend un bureau libre':'';}
  else if(h&&h.kind==='panne'){const p=((ATELIER&&ATELIER.pannes)||[]).find(x=>x.run===h.run);s=p?p.ticket+' · en panne à '+atStepName(p.poste):'';}
  else if(h&&slots[h.i]){const r=slots[h.i];s=(r.ticket||'')+' · '+atLabel(r.poste)+(r.note?' · '+r.note:'');}
  if(s){tip.style.display='block';tip.style.left=e.clientX+'px';tip.style.top=e.clientY+'px';tip.textContent=s;}else tip.style.display='none';
}
function atStateText(r,k){
  const s=atState(r,AT_POSTES.find(p=>p.k===k)||{k});
  return {idle:'somnole à sa place',run:'au travail'+(r&&r.lot?' : '+r.lot:''),bloq:'bloquant : renvoie au code',err:'en panne (son sous-workflow a échoué) : un pompier arrive avec un extincteur',ok:'a rendu son verdict : validé',
    avis:'a rendu un avis',skip:'sauté pour ce ticket',wait:'attend son tour'}[s]||'';
}
// ---------- panneau : les bureaux, la fiche d'un ticket ----------
const atBar=r=>'<div class="at-bar">'+AT_POSTES.map(p=>{const s=(r.states||{})[p.k];return `<i class="${s||''}" title="${esc(p.n+(s?' : '+AT_ST[s][1]:''))}"></i>`;}).join('')+'</div>';
function atTag(r){const p=AT_POSTES.find(x=>x.k===r.poste);
  return r.gate?'<span class="at-tag wait">✋ t\'attend</span>':r.back?'<span class="at-tag bloq">🔒 retour au code</span>':p?`<span class="at-tag run">${p.i} ${esc(p.n)}</span>`:'';}
function atelierListHtml(rooms,q,pn){pn=pn||[];
  return `<h2 class="at-h">🏭 Atelier d'implémentation <span class="cnt">${rooms.length}/4</span></h2>`+
    (rooms.length?rooms.map((x,i)=>`<button class="at-room" data-run="${esc(x.run)}"><span class="at-top"><span><span class="mut">Bureau ${x._b||i+1}</span> · <b class="mono">${esc(x.ticket||'…')}</b></span>${atTag(x)}</span>
      <span class="at-title">${esc(x.title||'')}</span>${atBar(x)}<span class="mut">${esc(String(x.repo||'').split('/').pop())}${x.tour?' · tour '+esc(x.tour):''} · ${Math.round((x.tok||0)/1e3)} k jetons${x.lot?' · '+esc(x.lot):''}</span></button>`).join('')
    :'<div class="note">Aucun ticket sur la chaîne. Lance-le depuis la fiche d\'un ticket (▶ Implémenter) : plan seulement, complet ou essai.</div>')+
    `<h2 class="at-h">⏳ File d'attente <span class="cnt">${q.length}</span></h2>`+
    (q.length?q.map(x=>`<div class="at-q"><b class="mono">${esc(x.ticket||'…')}</b> <span class="mut">attend un bureau libre depuis ${esc(hm(ms(x.since)))}</span></div>`).join(''):'<div class="mut">Personne n\'attend.</div>')+
    (pn.length?`<h2 class="at-h">🧯 En panne <span class="cnt">${pn.length}</span></h2>`+pn.map(x=>`<div class="at-q at-panne"><b class="mono">${esc(x.ticket||'…')}</b> <span class="mut">${esc(String(x.repo||'').split('/').pop())}</span> · arrêté à <b>${esc(atStepName(x.poste))}</b>${x.url?` <a href="${esc(x.url)}" target="_blank" rel="noopener">↗</a>`:''}<br><span class="mut">${esc(x.title||'')}</span></div>`).join('')+
      '<div class="note">Relance le ticket (▶ Implémenter) : la chaîne reprend où elle s\'est arrêtée, avec le dossier et la branche du run en panne.</div>':'')+
    '<div class="note at-scope">Cet étage implémente, ouvre la PR et traite sa revue et ses retours. La CI, l\'env de branche et les mises en prod restent au RDC.</div>';
}
function atelierFicheHtml(r,i){
  return `<button class="at-back">‹ L'atelier</button><h2 class="at-h">🎫 ${esc(r.ticket||'…')} <span class="cnt">bureau ${i+1}</span></h2>
    <div class="at-title big">${esc(r.title||'')}</div>
    <div class="mut">${esc(r.repo||'')}${r.tour?' · tour <b>'+esc(r.tour)+'</b>':''} · ${Math.round((r.tok||0)/1e3)} k jetons${r.since?' · depuis '+esc(hm(ms(r.since))):''}</div>${atBar(r)}
    <table class="at-t">${AT_POSTES.map(p=>{const s=(r.states||{})[p.k];return `<tr${r.poste===p.k?' class="cur"':''}><td>${p.i} ${esc(p.n)}</td><td>${s?`<span class="dot" style="background:${AT_ST[s][0]}"></span>${AT_ST[s][1]}`:'<span class="mut">à venir</span>'}</td></tr>`;}).join('')}</table>`+
    (r.note?`<div class="at-box${r.back?' bloq':''}">${esc(r.note)}${r.lot?' · '+esc(r.lot):''}</div>`:r.lot?`<div class="at-box run">${esc(r.lot)}</div>`:'')+
    (r.url?`<a class="at-link" href="${esc(r.url)}" target="_blank" rel="noopener">↗ Le run dans Kronn</a>`:'');
}
// gate du bureau : la carte de décision du Bureau (55-actions.js), ou null quand rien n'attend
const atGate=r=>{if(!r.gate)return null;const g=GATES.find(x=>x.run===r.run);return {run:r.run,wf_name:g?g.wf_name:'Implémenter un ticket',_s:ms(r.since)};};
// fiche d'un agent de l'étage : son poste, son bureau, ce qu'il fait, et où est sa place
function atAgentHtml(pick,slots){
  const r=slots[pick.i], w=atWandering(pick.i,pick.k), p=AT_POSTES.find(x=>x.k===pick.k)||{i:'',n:pick.k}, g=AT_G[pick.i];
  const where=w?(w.spot.sit?'sur le canapé':w.spot.dir==='left'?'au café':'dans le couloir'):'';
  return `<button class="at-back">‹ L'atelier</button><h2 class="at-h">${p.i} ${esc(p.n)} <span class="cnt">bureau ${pick.i+1}</span></h2>
    <div class="at-box${atState(r,p)==='bloq'||atState(r,p)==='err'?' bloq':''}">${esc(w?'Se promène '+where+' : le bureau est libre, il reviendra à sa place.':atStateText(r,pick.k))}</div>
    <div class="mut">${r?'Sur <b class="mono">'+esc(r.ticket||'')+'</b> · '+esc(r.title||''):'Bureau libre'}</div>
    <div class="mut">Sa place : bureau ${pick.i+1}, ${atSpot(g,pick.k).row===1?'rangée du haut':'rangée du bas'}${w?' (le chemin est tracé sur le plan)':''}.</div>`;
}
function drawAtelierSide(side){
  const box=document.createElement('div');box.className='atelier';side.appendChild(box);
  const slots=atSlots(), back=()=>box.querySelector('.at-back').addEventListener('click',()=>{ATSEL=null;AT_PICK=null;renderSide(true);});
  if(AT_PICK&&AT_PICK.kind==='agent'){box.innerHTML=atAgentHtml(AT_PICK,slots);back();return;}
  if(AT_PICK&&(AT_PICK.kind==='queue'||AT_PICK.kind==='panne')){
    const q=AT_PICK.kind==='queue'?((ATELIER&&ATELIER.queue)||[]).find(x=>x.run===AT_PICK.run):null, pn=AT_PICK.kind==='panne'?((ATELIER&&ATELIER.pannes)||[]).find(x=>x.run===AT_PICK.run):null;
    box.innerHTML=`<button class="at-back">‹ L'atelier</button>`+(q?`<h2 class="at-h">📦 ${esc(q.ticket||'…')} <span class="cnt">entrepôt</span></h2><div class="at-box">Attend un bureau libre depuis ${esc(hm(ms(q.since)))}. Il entre dans le premier bureau qui se libère.</div>`
      :pn?`<h2 class="at-h">🧯 ${esc(pn.ticket||'…')} <span class="cnt">en panne</span></h2><div class="at-box bloq">Arrêté à <b>${esc(atStepName(pn.poste))}</b>. Relance le ticket (▶ Implémenter) : la chaîne reprend là, avec le dossier et la branche du run en panne.</div><div class="mut">${esc(pn.title||'')}</div>${pn.url?`<a class="at-link" href="${esc(pn.url)}" target="_blank" rel="noopener">↗ Le run dans Kronn</a>`:''}`
      :'<div class="note">Ce ticket n\'est plus là.</div>');
    back();return;
  }
  const i=slots.findIndex(x=>x&&x.run===ATSEL), r=i>=0?slots[i]:null;
  if(r){
    box.innerHTML=atelierFicheHtml(r,i);
    back();
    const g=atGate(r);if(g)gateCard(box,g,null);
    return;
  }
  box.innerHTML=atelierListHtml(slots.map((x,k)=>x&&{...x,_b:k+1}).filter(Boolean),(ATELIER&&ATELIER.queue)||[],(ATELIER&&ATELIER.pannes)||[]);
  box.querySelectorAll('.at-room').forEach(b=>b.addEventListener('click',()=>{ATSEL=b.dataset.run;renderSide(true);}));
}
