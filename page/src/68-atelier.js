// ---------- 1er étage : l'atelier d'implémentation (#76, #125) ----------
// Un bureau par ticket sur la chaîne de postes (models.impl_chain, 4 en parallèle) et, au mur, le tableau postes × tickets.
// L'étage ne traite que l'implémentation, la PR et ses retours : ni CI, ni env, ni déploiement (le RDC s'en charge).
// Données : dataset atelier (workflows/atelier_snapshot.py, cron live) ; démo : atelierDemo(). Un ticket à plusieurs
// dépôts occupe un bureau par dépôt ; un run en échec reste dans « En panne » : relancer le ticket le reprend là. Onglets d'étage au-dessus
// du plan ; sur le 1er, la toile prend la taille de l'étage (AT_W × AT_H) et le panneau montre les bureaux et leur fiche.
const AT_POSTES=[
  {k:'cadrage',i:'📋',n:'Cadrage'},{k:'schema',i:'🗺',n:'Schéma'},{k:'patterns',i:'🧩',n:'Patterns'},{k:'gate',i:'✋',n:'Ton plan',gate:true},
  {k:'code',i:'⌨',n:'Code'},{k:'regles',i:'📏',n:'Règles'},{k:'securite',i:'🔒',n:'Sécurité'},{k:'tests',i:'🧪',n:'Tests'},
  {k:'perf',i:'⚡',n:'Perf·a11y'},{k:'revue',i:'🔁',n:'Croisée'},{k:'besoin',i:'🎯',n:'Besoin'},{k:'pr',i:'📤',n:'PR'},{k:'revue_pr',i:'👀',n:'Revue PR'},{k:'retours',i:'💬',n:'Retours'}];
const AT_ST={ok:['#3fbf6a','validé'],run:['#5b8def','en cours'],bloq:['#e0614f','bloquant'],avis:['#e0a020','avis'],wait:['#e0a020','t\'attend'],
  skip:['#5b6070','sauté'],err:['#e0614f','en panne']};
const AT_TS=32, AT_W=46*AT_TS, AT_H=27*AT_TS, AT_ROOMS=[[7,9,23,18],[28,9,46,18],[7,18,23,27],[28,18,46,27]];
let FLOOR=0, ATELIER=null, ATSEL=null, AT_BG=null;
try{FLOOR=+localStorage.getItem('bureau:floor')===1?1:0;}catch(e){FLOOR=0;}
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
     states:{...ok(8),perf:'skip',revue:'avis',besoin:'ok',pr:'ok',revue_pr:'ok',retours:'run'},tour:'1/3',tok:138e3,since:at(7.9),note:'💬 3 commentaires à traiter'}],
    queue:[{run:'demo-q1',ticket:'DM-7606',since:at(10.5)},{run:'demo-q2',ticket:'DM-7948',since:at(10.8)}],
    pannes:[{run:'demo-p1',ticket:'DM-7702',title:'Bandeau d\'alerte sur les pages direct',repo:'dm/api',poste:'securite',since:at(8.1)}]};
}
const atelierOn=()=>!!(CFG.atelier||DEMO);
// poste ou étape où un run en échec s'est arrêté : nom du poste, sinon celui de l'étape du parent
const AT_STEP={prepare:'Préparation',orchestrateur_plan:'Plan de l\'orchestrateur',orchestrateur:'Orchestrateur',livraison:'PR',publication:'Publication',
  controles:'Contrôles',ticket:'Lecture du ticket',dossier:'Dossier',aiguillage:'Aiguillage',questions:'Questions',mode:'Mode'};
const atStepName=k=>{const p=AT_POSTES.find(x=>x.k===k);return p?p.i+' '+p.n:AT_STEP[k]||k||'?';};
const atRooms=()=>((ATELIER&&ATELIER.rooms)||[]).slice(0,4);
// ---------- onglets d'étage ----------
function atelierTabs(){
  let t=document.getElementById('floors');
  if(!atelierOn()){if(t)t.remove();return;}
  if(!t){t=document.createElement('div');t.id='floors';t.className='floors';t.setAttribute('role','tablist');
    const w=document.querySelector('.stage .cv-wrap');w.parentElement.insertBefore(t,w);
    t.addEventListener('click',e=>{const b=e.target.closest('button[data-floor]');if(b)setFloor(+b.dataset.floor);});}
  const n=atRooms().length, h=`<button role="tab" data-floor="0" aria-selected="${!FLOOR}"${FLOOR?'':' class="on"'}>🏢 RDC · open space</button>`+
    `<button role="tab" data-floor="1" aria-selected="${!!FLOOR}"${FLOOR?' class="on"':''}>🏭 1er · atelier d'implémentation${n?` <b>${n}</b>`:''}</button>`;
  if(t.dataset.sig!==h)t.innerHTML=t.dataset.sig=h;
}
function setFloor(f){
  FLOOR=f?1:0;ATSEL=null;try{localStorage.setItem('bureau:floor',String(FLOOR));}catch(e){}
  if(FLOOR){cv.width=AT_W;cv.height=AT_H;ctx.imageSmoothingEnabled=false;document.documentElement.style.setProperty('--plan-ratio',String(AT_W/AT_H));}
  else sizeCanvas();
  atelierTabs();renderSide(true);
}
// ---------- le plan de l'étage ----------
const atTxt=(s,x,y,col,font,al)=>{ctx.font=font||'bold 10px ui-monospace,Menlo,monospace';ctx.fillStyle=col;ctx.textAlign=al||'center';ctx.fillText(s,x,y);ctx.textAlign='left';};
function atPill(s,x,y,bgc,fg,font){ctx.font=font||'bold 10px ui-monospace,Menlo,monospace';const w=ctx.measureText(s).width+10;R(ctx,x-w/2,y-11,w,15,bgc);atTxt(s,x,y,fg||'#fff',font);}
function atFolder(x,y,label,col){R(ctx,x-15,y-10,30,20,'#d9b86a');R(ctx,x-15,y-13,12,4,'#d9b86a');R(ctx,x-15,y-10,30,3,'#c9a556');R(ctx,x-11,y-4,22,2,'#8a6d2c');
  if(label)atPill(label,x,y+24,col||'#0b2a4a','#fff','bold 9px ui-monospace,Menlo,monospace');}
function atBackground(){ // sol, murs, enseigne, escalier, cloisons vitrées des bureaux : cuits une fois
  const c=document.createElement('canvas');c.width=AT_W;c.height=AT_H;const g2=c.getContext('2d'), T=AT_TS;
  for(let y=0;y<27;y++)for(let x=0;x<46;x++)drawFloor(g2,x,y,x<7?'tiles':x>=23&&x<28&&y>=9?'wood':'carpet');
  R(g2,0,0,AT_W,T,'#4b4a52');R(g2,0,T,AT_W,8,'#efe9dc');R(g2,0,T+8,AT_W,24,'#d9d2c3');R(g2,0,T+28,AT_W,4,'#a99f8c');
  R(g2,16*T,T+6,14*T,18,'#0b2a4a');R(g2,16*T,T+6,14*T,2,'#0172f0');
  g2.fillStyle='#fff';g2.font='bold 11px ui-monospace,Menlo,monospace';g2.textAlign='center';g2.fillText("1ER ÉTAGE · ATELIER D'IMPLÉMENTATION",23*T,T+19);g2.textAlign='left';
  for(let i=0;i<6;i++)R(g2,T,(2.4+i*.55)*T,4.5*T,.55*T,i%2?'#8d7b62':'#a3906f');
  R(g2,7*T-6,2*T,12,25*T,'#efe9dc');
  const wh=(x0,x1,y)=>{R(g2,x0*T,y*T-6,(x1-x0)*T,12,'#bfe0ee');R(g2,x0*T,y*T-6,(x1-x0)*T,1,'#cfc6b4');};
  const wv=(x,y0,y1)=>{R(g2,x*T-6,y0*T,12,(y1-y0)*T,'#bfe0ee');R(g2,x*T-6,y0*T,1,(y1-y0)*T,'#cfc6b4');};
  for(const [x0,x1] of [[7,23],[28,46]]){wh(x0,x1,9);wh(x0,x1,18);}
  for(const x of [23,28]){wv(x,9,11.5);wv(x,13.5,20.5);wv(x,22.5,27);}
  return c;
}
const atCol=r=>r.gate?'#e0a020':r.back?'#e0614f':'#3fbf6a';
function atBoard(now){ // tableau mural : une colonne par poste, une ligne par bureau
  const T=AT_TS, bx=8*T, by=2.25*T, bw=37*T, bh=6.1*T, cw=bw/AT_POSTES.length, rh=1.32*T;
  R(ctx,bx-6,by-6,bw+12,bh+12,'#3a3530');R(ctx,bx,by,bw,bh,'#f7f7f4');
  AT_POSTES.forEach((p,i)=>{R(ctx,bx+i*cw,by,1,bh,'#d0ccc2');atTxt(p.i+' '+p.n,bx+(i+.5)*cw,by+15,p.gate?'#8a5a00':'#3a3530','bold 10px system-ui,sans-serif');});
  R(ctx,bx,by+22,bw,2,'#9aa0aa');
  atRooms().forEach((r,k)=>{const y=by+36+k*rh;atTxt((k+1)+' · '+(r.ticket||'…'),bx+6,y-4,'#5a5248','bold 9px ui-monospace,Menlo,monospace','left');
    AT_POSTES.forEach((p,i)=>{const s=(r.states||{})[p.k];if(s&&AT_ST[s])R(ctx,bx+i*cw+4,y,cw-8,5,AT_ST[s][0]);});
    const pi=Math.max(0,AT_POSTES.findIndex(p=>p.k===r.poste)), x=bx+(pi+.5)*cw;
    if(r.poste){R(ctx,x-32,y+7,64,20,r.back?'#f8d4d0':r.gate?'#fbe7b0':'#d8e6f8');R(ctx,x-32,y+7,64,3,atCol(r));
      atTxt((r.ticket||'')+(r.tour?' · '+r.tour:''),x,y+22,'#1c1f26','bold 10px ui-monospace,Menlo,monospace');}
    if(r.back){const xc=bx+4.5*cw;ctx.strokeStyle='#e0614f';ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(xc+34,y+17);
      ctx.lineTo(bx+(AT_POSTES.findIndex(p=>(r.states||{})[p.k]==='bloq')+.5)*cw-34,y+17);ctx.stroke();ctx.setLineDash([]);}
  });
  if(!atRooms().length)atTxt('Aucun ticket sur la chaîne : lance-le depuis la fiche d\'un ticket (▶ Implémenter).',bx+bw/2,by+bh/2,'#5a5248','bold 12px system-ui,sans-serif');
}
function atWorker(k,x,y,dir,err){ // agents de l'atelier : les hologrammes des agents du Bureau, posés au poste en cours
  const ag=chars.filter(c=>!c.person&&!c.visitor&&!c.boss&&c.sprite);if(!ag.length)return null;
  const src=ag[k%ag.length];
  return Object.assign(Object.create(Object.getPrototypeOf(src)),src,{pos:{x,y},tile:null,dir,moving:false,pose:'type',present:true,_st:{st:err?'error':'work'},phase:(x*7+y)%5});
}
function renderAtelier(now){
  const T=AT_TS;if(!AT_BG)AT_BG=atBackground();
  ctx.drawImage(AT_BG,0,0);
  const people=[], late=[];
  atTxt("FILE D'ATTENTE",3.6*T,7.2*T,'#5a5248');R(ctx,1.3*T,7.5*T,4.6*T,2.2*T,'#7d8fa3');
  const q=(ATELIER&&ATELIER.queue)||[];q.slice(0,2).forEach((x,i)=>atFolder((2.4+i*2.2)*T,8.3*T,x.ticket||'…','#5b6070'));
  atTxt(q.length?q.length+' en attente d\'un bureau':'personne n\'attend',3.6*T,10.9*T,'#6b6358','9px ui-monospace,Menlo,monospace');
  atBoard(now);
  atRooms().forEach((r,i)=>{const [x0,y0,x1,y1]=AT_ROOMS[i], cx=(x0+x1)/2*T, cy=(y0+y1)/2*T+.3*T, sel=ATSEL===r.run;
    atTxt('BUREAU '+(i+1)+' · '+(r.ticket||'…')+' · '+String(r.repo||'').split('/').pop(),(x0+.6)*T,(y0+.75)*T,'#1c1f26','bold 11px ui-monospace,Menlo,monospace','left');
    atTxt((r.tour?'tour '+r.tour+' · ':'')+Math.round((r.tok||0)/1e3)+' k jetons',(x1-.6)*T,(y0+.75)*T,'#5a5248','bold 10px ui-monospace,Menlo,monospace','right');
    const cw=((x1-x0-1.2)*T-20)/AT_POSTES.length;AT_POSTES.forEach((p,k)=>R(ctx,(x0+.6)*T+k*(cw+2),(y0+1)*T,cw,8,(AT_ST[(r.states||{})[p.k]]||['#c9c2b2'])[0]));
    const tw=12*T, th=1.7*T; R(ctx,cx-tw/2,cy-th/2,tw,th,'#7a5a3c');R(ctx,cx-tw/2,cy-th/2,tw,5,'#94704c');
    atFolder(cx,cy-4,r.ticket,r.back?'#a8323a':'#0b2a4a');
    const seats=AT_POSTES.filter(p=>!p.gate), n2=Math.ceil(seats.length/2);
    seats.forEach((p,k)=>{const top=k<n2, sx=cx-tw/2+(k%n2+.5)*tw/n2, sy=top?cy-th/2-.5*T:cy+th/2+.5*T, s=(r.states||{})[p.k];
      R(ctx,sx-9,sy-6,18,12,'#3a3d45');if(AT_ST[s]){ctx.fillStyle=AT_ST[s][0];ctx.beginPath();ctx.arc(sx+13,sy-4,5,0,7);ctx.fill();}
      late.push(()=>atPill(p.i+' '+p.n,sx,top?sy-13:sy+21,s==='run'?'#2f6fd6':s==='bloq'?'#a8323a':'#f4efe4',s==='run'||s==='bloq'?'#fff':'#3a3530','bold 9px system-ui,sans-serif'));
      if(r.poste===p.k){for(const [d,o] of [[0,-8],[1,12]]){const a=atWorker(i*3+d,sx+o,sy+(top?6:4),top?'down':'up',r.back&&d===0);if(a)people.push(a);}}
    });
    if(r.gate){for(let k=0;k<4;k++)R(ctx,x1*T-6,12.5*T-24+k*12+(i>1?9*T:0),12,12,k%2?'#1c1c1c':'#f2c230');}
    const ny=(y1-.55)*T, nt=r.note||r.lot;
    if(nt)late.push(()=>atPill(nt,cx,ny,r.gate?'#8a5a00':r.back?'#a8323a':r.lot?'#2a6a3a':'#2a4a7a'));
    if(sel){ctx.strokeStyle='#ffffff';ctx.lineWidth=3;ctx.strokeRect(x0*T+4,y0*T+4,(x1-x0)*T-8,(y1-y0)*T-8);}
  });
  for(let i=atRooms().length;i<4;i++){const [x0,y0,x1,y1]=AT_ROOMS[i];atTxt('BUREAU '+(i+1)+' · libre',(x0+x1)/2*T,(y0+y1)/2*T,'#8a8478','bold 12px ui-monospace,Menlo,monospace');}
  // couloir : l'orchestrateur et ton pupitre (une lampe par bureau, allumée si une gate t'attend)
  const ox=25.5*T;atTxt('ORCHESTRATEUR',ox,10.1*T,'#5a4636');R(ctx,ox-1.9*T,11*T,3.8*T,22,'#6b5543');
  atRooms().forEach((r,k)=>{const x=ox-1.35*T+k*.9*T;R(ctx,x-13,11*T-16,26,17,'#1c1f26');R(ctx,x-11,11*T-14,22,12,r.gate?'#ffcf4a':r.back?'#ff8a80':'#8fe3a8');});
  const o=atWorker(99,ox,13.2*T,'up');if(o)people.push(o);
  atTxt('TES VALIDATIONS',ox,19.4*T,'#5a4636');R(ctx,ox-1.9*T,20.2*T,3.8*T,22,'#3a3530');
  [0,1,2,3].forEach(k=>{const r=atRooms()[k], on=r&&r.gate&&Math.floor(now/450)%2;ctx.fillStyle=r&&r.gate?(on?'#ffcf4a':'#a37a10'):'#4a4a4a';ctx.beginPath();ctx.arc(ox-1.35*T+k*.9*T,20.65*T,7,0,7);ctx.fill();});
  const boss=chars.find(c=>c.boss), waiting=atRooms().filter(r=>r.gate).length;
  if(boss){const b=Object.assign(Object.create(Object.getPrototypeOf(boss)),boss,{pos:{x:ox,y:22.6*T},dir:'up',moving:false,pose:'stand',present:true,_st:{st:waiting?'gate':'idle'}});people.push(b);}
  if(waiting)late.push(()=>atPill('✋ '+waiting+' à valider',ox,23.6*T,'#8a5a00'));
  people.sort((a,b)=>a.pos.y-b.pos.y).forEach(c=>drawChar(c,now));late.forEach(f=>f());
}
// ---------- clic et survol ----------
function atRoomAt(e){
  const r=cv.getBoundingClientRect(), mx=(e.clientX-r.left)*AT_W/r.width/AT_TS, my=(e.clientY-r.top)*AT_H/r.height/AT_TS;
  const i=AT_ROOMS.findIndex(([x0,y0,x1,y1])=>mx>=x0&&mx<x1&&my>=y0&&my<y1);
  return i>=0?atRooms()[i]||null:null;
}
function atelierClick(e){const r=atRoomAt(e);ATSEL=r?r.run:null;renderSide(true);}
function atelierHover(e){const r=atRoomAt(e);cv.style.cursor=r?'pointer':'default';
  if(r){tip.style.display='block';tip.style.left=e.clientX+'px';tip.style.top=e.clientY+'px';
    const p=AT_POSTES.find(x=>x.k===r.poste);tip.textContent=(r.ticket||'')+' · '+(p?p.i+' '+p.n:'')+(r.note?' · '+r.note:'');}
  else tip.style.display='none';}
// ---------- panneau : les bureaux, la fiche d'un ticket ----------
const atBar=r=>'<div class="at-bar">'+AT_POSTES.map(p=>{const s=(r.states||{})[p.k];return `<i class="${s||''}" title="${esc(p.n+(s?' : '+AT_ST[s][1]:''))}"></i>`;}).join('')+'</div>';
function atTag(r){const p=AT_POSTES.find(x=>x.k===r.poste);
  return r.gate?'<span class="at-tag wait">✋ t\'attend</span>':r.back?'<span class="at-tag bloq">🔒 retour au code</span>':p?`<span class="at-tag run">${p.i} ${esc(p.n)}</span>`:'';}
function atelierListHtml(rooms,q,pn){pn=pn||[];
  return `<h2 class="at-h">🏭 Atelier d'implémentation <span class="cnt">${rooms.length}/4</span></h2>`+
    (rooms.length?rooms.map((x,i)=>`<button class="at-room" data-run="${esc(x.run)}"><span class="at-top"><span><span class="mut">Bureau ${i+1}</span> · <b class="mono">${esc(x.ticket||'…')}</b></span>${atTag(x)}</span>
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
function drawAtelierSide(side){
  const box=document.createElement('div');box.className='atelier';side.appendChild(box);
  const rooms=atRooms(), r=rooms.find(x=>x.run===ATSEL);
  if(r){
    box.innerHTML=atelierFicheHtml(r,rooms.indexOf(r));
    box.querySelector('.at-back').addEventListener('click',()=>{ATSEL=null;renderSide(true);});
    const g=atGate(r);if(g)gateCard(box,g,null);
    return;
  }
  box.innerHTML=atelierListHtml(rooms,(ATELIER&&ATELIER.queue)||[],(ATELIER&&ATELIER.pannes)||[]);
  box.querySelectorAll('.at-room').forEach(b=>b.addEventListener('click',()=>{ATSEL=b.dataset.run;renderSide(true);}));
}
