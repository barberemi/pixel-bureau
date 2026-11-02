// ---------- -1 : la caserne Support (#62) ----------
// Sous le RDC, une baie de camion par intervention (fil du Support en investigation, réponse à valider, en panne), trois
// au plus. Devant chaque camion, son équipe de pompiers dans la zone peinte au sol, rangée dans l'ordre des postes ; le
// tuyau part du camion et passe de main en main : plein et jaune jusqu'au poste au travail, en pointillé ensuite. Au
// poste ✋, la vanne : le capitaine (le boss) vient l'ouvrir quand une réponse attend sa validation. Réponse postée dans
// Teams : l'équipe remonte à bord, le camion sort par sa baie et le rideau se referme. Les baies libres restent
// fermées, l'équipe de garde joue aux cartes ; le soir et le week-end la garde reste, sous un éclairage réduit, et dort
// sur les lits de camp. À droite, la porte des autres étages et la barre de pompier.
// Données : dataset support (48-support.js) ; l'état des postes vient de t.run.postes quand le relevé le donne, sinon des
// étapes du run (une étape par poste, ou le modèle d'avant : une seule investigation). Toile de l'atelier (AT_W × AT_H).
const CS_POSTES=[{k:'tri',i:'🏷',n:'Tri'},{k:'logs',i:'🔎',n:'Logs'},{k:'cause',i:'🧩',n:'Cause'},{k:'reponse',i:'✉',n:'Réponse'},
  {k:'relecture',i:'🧐',n:'Relecture'},{k:'gate',i:'✋',n:'Toi',gate:true},{k:'post',i:'📣',n:'Teams'}];
const CS_ST={ok:['ok','a travaillé'],run:['run','au travail'],err:['err','en panne'],gate:['wait','t\'attend'],wait:['','attend son tour']};
const CS_BAYS=3, CS_BX=[1,12.25,23.5], CS_BW=10.25, CS_DY0=3.1, CS_DY1=10.1, CS_Z0=10.8, CS_Z1=20.7, CS_R1=14.3, CS_R2=18.7;
const CS_DESK={x:17*AT_TS,y:24.4*AT_TS}, CS_POLE={x:43.6*AT_TS,y0:9*AT_TS,y1:13.4*AT_TS}, CS_TABLE={x:39*AT_TS,y:16*AT_TS};
const CS_DEP_MS=8e3; // le départ d'un camion : gyrophares, sortie par la baie, rideau qui se referme
const caserneOn=()=>supportOn();
let CS_MEM={fresh:true,slots:[null,null,null],dep:[null,null,null],door:[0,0,0],boss:null,last:0}, CS_SEL=null, CS_HITS=[];
function csReset(){CS_MEM={fresh:true,slots:[null,null,null],dep:[null,null,null],door:[0,0,0],boss:null,last:0};CS_SEL=null;}
// pompiers de la caserne : tenue de sapeur-pompier (veste et pantalon marine), visages variés ; le casque se pose par-dessus
const CS_CREW=[['male','tan','buzzcut','#2a1a10'],['female','pale','bangs_bun','#c08a3a'],['male','dark','plain','#1a1a1a'],['female','light','long','#6b4426'],
  ['male','pale','messy1','#b0652a'],['female','brown','bob','#1a1a1a'],['male','light','spiked','#d9b44a'],['female','tan','curly_short','#3a2414'],['male','brown','balding','#2a1a10']];
CS_CREW.forEach(([sex,skin,hair,hc],k)=>{RECIPES['cs_pomp'+k]=RECIPES['cs_pomp'+k]||{sex,skin,hair,hair_color:hc,torso:'longsleeve/longsleeve',shirt:'#2b2f45',legs:'pants',legs_color:'#2b2f45',shoes:'#1c1c1c'};});
// ---------- les interventions ----------
// fils qui occupent une baie : en investigation et à valider d'abord (du plus ancien au plus récent), puis en panne
const CS_LIVE={run:0,gate:0,failed:1};
function csActive(){
  return spThreads().map(t=>({t,s:spState(t)})).filter(x=>x.s.k in CS_LIVE)
    .sort((a,b)=>CS_LIVE[a.s.k]-CS_LIVE[b.s.k]||ms((a.t.run&&a.t.run.at)||a.t.at)-ms((b.t.run&&b.t.run.at)||b.t.at));
}
const csCalls=()=>spThreads().filter(t=>['new','relaunched'].includes(spState(t).k)).sort((a,b)=>ms(b.at)-ms(a.at));
const csDoneToday=()=>spThreads().filter(t=>t.mine&&ms(t.mine.at)<=T&&parisDay(ms(t.mine.at))===parisDay(T)).length;
// étapes du modèle d'avant (une seule investigation) et de la chaîne découpée (une étape par poste) vers les postes
const CS_STEP={open:['tri'],mark:['tri'],publish_run:['tri'],investigate:['logs','cause','reponse'],draft:['relecture'],mark_draft:['relecture'],publish_draft:['relecture'],
  tri:['tri'],logs:['logs'],cause:['cause'],reponse:['reponse'],relecture:['relecture'],gate:['gate'],post:['post'],mark_post:['post'],publish:['post']};
const CS_RANK={ok:0,gate:1,run:2,err:3};
function csRunOf(t){
  const l=((DATA&&DATA.runs)||[]).filter(r=>r.vars&&r.vars.message_id===t.id&&ms(r.start)<=T);
  return l.sort((a,b)=>ms(b.start)-ms(a.start))[0]||null;
}
// état de chaque poste d'une intervention : ok, run, err, gate (✋ t'attend) ; absent = attend son tour
function csStates(t,s){
  const out={}, k=s?s.k:spState(t).k;
  if(t.run&&t.run.postes)Object.assign(out,t.run.postes);
  else{const r=(s&&s.r)||csRunOf(t);
    for(const st of (r&&r.steps)||[]){const v=st.s==='Success'||st.s==='Skipped'?'ok':st.s==='Failed'?'err':st.s==='WaitingApproval'?'gate':'run';
      for(const p of CS_STEP[st.n]||[])if(!(p in out)||CS_RANK[v]>CS_RANK[out[p]])out[p]=v;}}
  const keys=CS_POSTES.map(p=>p.k), g=keys.indexOf('gate');
  if(k==='gate'){keys.slice(0,g).forEach(p=>{out[p]='ok';});out.gate='gate';}
  else if(out.gate==='gate')out.gate='ok'; // gate passée (validée) : la page n'a pas encore reçu l'étape suivante
  if((k==='run'||k==='failed')&&!keys.some(p=>out[p]==='run'||out[p]==='err')){const p=keys.find(p=>out[p]!=='ok')||'tri';out[p]=k==='failed'?'err':'run';}
  return out;
}
const csCur=st=>CS_POSTES.find(p=>st[p.k]&&st[p.k]!=='ok')||null;
// baies : un fil garde sa baie tant qu'il y est ; une réponse postée fait partir le camion (sauf en arrivant à l'étage :
// ce qui s'est passé avant ne se rejoue pas) ; la première baie libre prend le fil suivant
function csSlots(now){
  const M=CS_MEM, act=csActive(), ids=act.map(x=>x.t.id);
  M.slots.forEach((id,b)=>{
    if(!id||ids.includes(id)||M.dep[b])return;
    const t=spThreads().find(x=>x.id===id);
    if(!M.fresh&&t&&spState(t).k==='done'&&t.mine)M.dep[b]={id,t0:now,t};else M.slots[b]=null;
  });
  M.dep.forEach((d,b)=>{if(d&&now-d.t0>CS_DEP_MS){M.dep[b]=null;M.slots[b]=null;}});
  for(const id of ids)if(!M.slots.includes(id)){const b=M.slots.findIndex((x,i)=>!x&&!M.dep[i]);if(b<0)break;M.slots[b]=id;if(M.fresh)M.door[b]=1;}
  M.fresh=false;
  return M.slots.map((id,b)=>{if(!id)return null;if(M.dep[b])return {t:M.dep[b].t,s:{k:'done'},dep:M.dep[b]};const a=act.find(x=>x.t.id===id);return a?{...a,st:csStates(a.t,a.s)}:null;});
}
const csWaiting=()=>{const ids=new Set(CS_MEM.slots);return csActive().filter(x=>!ids.has(x.t.id)).length;};
const csTitle=t=>t.subject||String(t.text||'').split('\n')[0].slice(0,60);
// ---------- géométrie d'une baie ----------
function csGeo(b){
  const T=AT_TS, x0=CS_BX[b]*T, w=CS_BW*T, cx=x0+w/2;
  const pts=CS_POSTES.map((p,j)=>j<4?{x:cx+(j-1.5)*2.4*T,y:CS_R1*T}:{x:cx+(1-(j-4))*2.8*T,y:CS_R2*T});
  return {b,x0,w,cx,pts,door:{x:x0+.35*T,y:CS_DY0*T,w:w-.7*T,h:(CS_DY1-CS_DY0)*T},truck:{x:cx,y:(CS_DY1-.2)*T},hose:{x:cx-3.1*T,y:(CS_DY1-.6)*T}};
}
const CS_G=[0,1,2].map(csGeo);
// ---------- décor ----------
function csBackground(){ // sous-sol : murs de béton, tuyaux au plafond, sol de garage devant les baies, parquet de la salle de garde
  const c=document.createElement('canvas');c.width=AT_W;c.height=AT_H;const g=c.getContext('2d'), T=AT_TS;
  for(let y=0;y<27;y++)for(let x=0;x<46;x++)drawFloor(g,x,y,x>=35?'wood':'tiles');
  R(g,0,0,AT_W,T,'#3a3940');R(g,0,T,AT_W,8,'#c9c4b8');R(g,0,T+8,AT_W,24,'#a9a397');R(g,0,T+28,AT_W,4,'#7d776c');
  R(g,0,T+2,AT_W,4,'#6a6f78');R(g,0,T+2,AT_W,1,'#8a909a');for(let x=2;x<46;x+=6)R(g,x*T,T,6,8,'#4a4f58'); // tuyaux et colliers
  R(g,35*T-4,2*T,4,25*T,'#7d776c'); // la salle de garde, séparée par un muret
  for(let b=0;b<CS_BAYS;b++){const z=CS_G[b];g.save();g.strokeStyle='#f2c230';g.lineWidth=3;g.setLineDash([12,7]);g.strokeRect(z.x0+4,CS_Z0*T,z.w-8,(CS_Z1-CS_Z0)*T);g.restore();
    for(let k=0;k<6;k++)R(g,z.cx-2.5*T+k*T,(CS_Z1+.25)*T,T*.55,6,k%2?'#1c1c1c':'#f2c230');} // bande devant la baie
  g.font='bold 11px ui-monospace,Menlo,monospace';g.fillStyle='#4a3f36';g.fillText('-1 · CASERNE SUPPORT',12,T+20);
  return c;
}
let CS_BG=null;
function csDoor(z,b,k,now){ // rideau de la baie : k = part fermée (1 fermé)
  const d=z.door;R(ctx,d.x-6,d.y-6,d.w+12,d.h+6,'#5a3a2a');R(ctx,d.x,d.y,d.w,d.h,'#1f1b18');
  const n=Math.round(d.h*k/10);for(let l=0;l<n;l++)R(ctx,d.x,d.y+l*10,d.w,9,l%2?'#c8323a':'#b02a32');
  if(n)R(ctx,d.x,d.y+n*10-2,d.w,3,'#7a1a20');
  atPill('BAIE '+(b+1),z.cx,d.y-12,'#5a3a2a','#fff','bold 10px ui-monospace,Menlo,monospace');
}
function csTruck(x,y,light,now,s){ // camion de pompier vu de côté, cabine à droite ; s : échelle
  ctx.save();ctx.translate(x,y);ctx.scale(s,s);
  R(ctx,-70,-56,140,50,'#d0392b');R(ctx,-70,-56,140,6,'#e85a4a');R(ctx,30,-80,40,26,'#d0392b');R(ctx,36,-76,28,16,'#9fd4ff');
  R(ctx,-64,-46,90,8,'#f2f2f2');R(ctx,-64,-30,90,4,'#f2d22a');for(let k=0;k<6;k++)R(ctx,-60+k*14,-70,4,14,'#bfbfbf');R(ctx,-64,-72,94,3,'#bfbfbf');
  R(ctx,-70,-20,10,10,'#a82a20');R(ctx,-68,-18,6,6,'#c9cfd6'); // le raccord du tuyau, à l'arrière
  for(const wx of [-46,40]){ctx.fillStyle='#1c1c1c';ctx.beginPath();ctx.arc(wx,-4,12,0,7);ctx.fill();ctx.fillStyle='#8a8a8a';ctx.beginPath();ctx.arc(wx,-4,5,0,7);ctx.fill();}
  if(light){const on=REDUCED_MOTION||Math.floor(now/250)%2;R(ctx,40,-86,12,6,on?'#3a8bff':'#ff3a3a');R(ctx,54,-86,12,6,on?'#ff3a3a':'#3a8bff');}
  ctx.restore();
}
// casque F1 des sapeurs-pompiers français, posé bas (chromé, crête, visière dorée, couvre-nuque) et bandes de la veste ;
// le capitaine porte en plus une bande rouge et son insigne
function csHelmet(g,x,y,dir,chief){
  const hx=x+(dir==='left'?-2:dir==='right'?2:0), hy=y-42;
  R(g,x-9,y-23,18,2,'#f2d22a');R(g,x-9,y-17,18,2,'#c9cfd6');
  R(g,hx-11,hy-1,22,7,'#2a2a30');
  g.fillStyle='#8a929c';g.beginPath();g.arc(hx,hy,11,Math.PI,0);g.fill();
  g.fillStyle='#c9cfd6';g.beginPath();g.arc(hx,hy,10,Math.PI,0);g.fill();
  R(g,hx-6,hy-8,3,5,'#f4f7fa');R(g,hx-1,hy-11,2,11,'#9aa2ac');
  if(dir!=='up')R(g,hx-10,hy-2,20,3,'#d9b44a');
  if(chief){R(g,hx-11,hy-5,22,2,'#d0392b');R(g,hx-2,hy-14,4,4,'#f2d22a');}
}
// un pompier : s = ok (a travaillé, ✓), run (au travail, halo), err (en panne), wait (attend son tour, gris), idle (de garde)
function csPompier(k,x,y,s,dir){
  return {key:'cs_'+k,sprite:'cs_pomp'+(k%CS_CREW.length),name:'Pompier',person:true,pos:{x,y},tile:null,dir:dir||'down',moving:false,pose:'stand',present:true,
    phase:(k*.37)%1,_st:{st:s==='run'?'work':s==='err'?'error':'idle'}};
}
function csGrey(c,now){ // attend son tour : la silhouette grise, comme au 1er étage
  const g=atLayer();atDrawInto(g,c,now);csHelmet(g,c.pos.x,c.pos.y,c.dir,false);
  ctx.save();ctx.globalAlpha=.4;ctx.filter='grayscale(1)';ctx.drawImage(AT_OFF,0,0);ctx.restore();
}
function csHose(z,st,now){ // du camion au premier pompier, puis de main en main ; plein jusqu'au poste au travail
  const cur=CS_POSTES.findIndex(p=>st[p.k]&&st[p.k]!=='ok'), last=cur<0?CS_POSTES.length-1:cur, P=z.pts;
  const seg=(a,b,on)=>{ctx.save();ctx.strokeStyle=on?'#e0a020':'#9a958a';ctx.lineWidth=on?5:3;ctx.setLineDash(on?[]:[6,5]);ctx.beginPath();
    const p0=a<0?z.hose:{x:P[a].x,y:P[a].y-22};ctx.moveTo(p0.x,p0.y);
    for(let j=a+1;j<=b;j++){const q={x:P[j].x,y:P[j].y-22};if(j===4)ctx.bezierCurveTo(z.cx+4.9*AT_TS,P[3].y-22,z.cx+4.9*AT_TS,P[4].y-22,q.x,q.y);else ctx.lineTo(q.x,q.y);}
    ctx.stroke();ctx.restore();};
  seg(-1,last,true);if(last<CS_POSTES.length-1)seg(last,CS_POSTES.length-1,false);
}
function csValve(x,y,open,now){R(ctx,x+14,y-24,4,24,'#5d6370');ctx.strokeStyle=open?'#e0a020':'#c8323a';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x+16,y-28,7,0,7);ctx.stroke();
  R(ctx,x+15,y-35,2,14,ctx.strokeStyle);R(ctx,x+9,y-29,14,2,ctx.strokeStyle);}
const csPostePill=(p,s,x,y)=>atPill(p.i+' '+p.n,x,y,{run:'#2f6fd6',ok:'#2f7a45',err:'#a8323a',gate:'#8a5a00'}[s]||'#f4efe4',s?'#fff':'#3a3530','bold 9px system-ui,sans-serif');
// ---------- une baie ----------
function csBay(slot,b,now,dt,people){
  const z=CS_G[b], T=AT_TS, M=CS_MEM, want=slot?1:0;
  M.door[b]+=Math.sign(want-M.door[b])*Math.min(Math.abs(want-M.door[b]),dt*.7);
  if(REDUCED_MOTION)M.door[b]=want;
  const open=M.door[b], d=z.door;
  csDoor(z,b,1-.78*open,now);
  if(slot&&slot.dep){ // départ : l'équipe est à bord, gyrophares, le camion sort par la baie, le rideau se referme
    const u=(now-slot.dep.t0)/CS_DEP_MS, go=Math.max(0,Math.min(1,(u-.2)/.5));
    if(u>.75)M.door[b]=Math.max(.0,1-(u-.75)/.25);
    ctx.save();ctx.beginPath();ctx.rect(d.x,d.y+(1-.78*M.door[b])*d.h*0+0,d.w,d.h);ctx.clip();
    csTruck(z.truck.x,z.truck.y-go*2.6*T,true,now,1.75-go*.6);ctx.restore();
    if(u<.9)csLate(people,()=>{atPill('📣 Réponse postée dans Teams : en route !',z.cx,(CS_Z0+1.2)*T,'#2f7a45','#fff','bold 10px system-ui,sans-serif');
      if(!REDUCED_MOTION&&Math.floor(now/300)%2)E('🚨',z.cx+2.4*T,(CS_DY1-3.6)*T,14);});
    atHitCs('bay',z.x0,d.y,z.w,(CS_Z1-CS_DY0)*T,{b});return;
  }
  if(!slot){atHitCs('bay',z.x0,d.y,z.w,(CS_Z1-CS_DY0)*T,{b});if(open<.05)atPill('libre',z.cx,d.y+d.h/2,'#1c2440','#bfe6ff','bold 10px ui-monospace,Menlo,monospace');return;}
  const t=slot.t, k=slot.s.k, st=slot.st||{};
  if(open>.3){ctx.save();ctx.globalAlpha=Math.min(1,(open-.3)/.5);csTruck(z.truck.x,z.truck.y,k!=='failed',now,1.75);ctx.restore();}
  if(open<.95)return; // l'équipe arrive quand le rideau est levé
  csHose(z,st,now);
  const cur=csCur(st);
  csLate(people,()=>atPill('🚨 '+csTitle(t).slice(0,34),z.cx,(CS_Z0+.55)*T,k==='failed'?'#a8323a':'#8a1f17','#fff','bold 9px system-ui,sans-serif'));
  CS_POSTES.forEach((p,j)=>{const {x,y}=z.pts[j], s=st[p.k]||'';
    if(p.gate){csValve(x,y,s==='ok',now);
      const boss=k==='gate'&&!!chars.find(c=>c.boss);
      if(!boss){R(ctx,x-2,y-30,4,30,'#8a8478');for(let q=0;q<4;q++)R(ctx,x-14+q*7,y-32,7,6,q%2?'#1c1c1c':'#f2c230');}
      csLate(people,()=>{if(!boss)csPostePill(p,s,x,y+16);if(s==='gate'&&!boss&&(REDUCED_MOTION||Math.floor(now/500)%2))atBadge(x,y-44,'✋','#d08a10');},y+2);
      atHitCs('agent',x-16,y-56,32,74,{b,k:p.k});return;}
    const c=csPompier(b*7+j,x,y,s==='gate'?'ok':s||'wait',j>=4?'down':'down');
    if(!s){people.push([{pos:{x,y}},()=>{csGrey(c,now);csPostePill(p,'',x,y+16);},false,null]);atHitCs('agent',x-16,y-56,32,74,{b,k:p.k});return;}
    if(s==='run'){const gr=ctx.createRadialGradient(x,y-24,4,x,y-24,46);gr.addColorStop(0,'rgba(255,246,190,.6)');gr.addColorStop(1,'rgba(255,246,190,0)');ctx.fillStyle=gr;ctx.fillRect(x-48,y-72,96,96);}
    people.push([c,null,false,()=>{csHelmet(ctx,x,y,c.dir,false);
      if(s==='run'&&!REDUCED_MOTION)for(let n=0;n<4;n++){const f=((now/400)+n/4)%1;ctx.fillStyle=`rgba(120,200,255,${.9*(1-f)})`;ctx.beginPath();ctx.arc(x+16+f*26,y-34-f*6+f*f*14,2+n*.5,0,7);ctx.fill();}
      if(s==='ok')atBadge(x+16,y-50,'✓','#2f9e55');
      if(s==='err'){atBadge(x+16,y-50,'!','#d0392b');atSmoke(x,y-30,now);}
      if(cur&&cur.k===p.k&&s==='run')atBubble(x,y-66,{tri:'je trie le message…',logs:'je cherche des traces…',cause:'je remonte à la cause…',reponse:'je rédige la réponse…',relecture:'je relis…',post:'je poste en fil…'}[p.k]||'au travail…');
      csPostePill(p,s,x,y+16);}]);
    atHitCs('agent',x-16,y-56,32,74,{b,k:p.k});
  });
  if(k==='failed')csLate(people,()=>atPill('🧯 en panne : relance l\'investigation',z.cx,(CS_Z1-.4)*T,'#a8323a','#fff','bold 9px system-ui,sans-serif'));
  atHitCs('bay',z.x0,d.y,z.w,(CS_Z1-CS_DY0)*T,{b});
}
function csLate(people,f,y){people.push([{pos:{x:0,y:y==null?1e6:y}},null,false,f]);}
// ---------- la salle de garde, la porte des étages et la barre de pompier ----------
function csBoard(slots,now){ // le tableau des interventions, au mur de la salle de garde
  const T=AT_TS, x=35.6*T, y=2.1*T, w=9.8*T, h=4.4*T;R(ctx,x-6,y-6,w+12,h+12,'#3a3530');R(ctx,x,y,w,h,'#10141c');R(ctx,x,y,w,18,'#8a1f17');
  atTxt('📋 INTERVENTIONS',x+8,y+13,'#fff','bold 10px ui-monospace,Menlo,monospace','left');
  slots.forEach((s,b)=>{const c=!s?'#5d6370':s.dep?'#3fbf6a':s.s.k==='gate'?'#e0a020':s.s.k==='failed'?'#e0614f':'#5b8def', cur=s&&!s.dep&&csCur(s.st||{});
    R(ctx,x+10,y+28+b*19,8,8,c);atTxt('B'+(b+1)+' · '+(!s?'libre':s.dep?'en route':(csTitle(s.t).slice(0,22)+(cur?' · '+cur.i:''))),x+24,y+36+b*19,s?'#e8e2d0':'#8a93a6','10px ui-monospace,Menlo,monospace','left');});
  const n=csCalls().length, q=csWaiting();
  atTxt('📟 '+(n?plural(n,'appel','appels')+' à prendre':'aucun appel')+(q?' · '+q+' en attente de baie':''),x+10,y+h-12,n?'#ff9a8a':'#8a93a6','bold 10px ui-monospace,Menlo,monospace','left');
  if(n){const on=REDUCED_MOTION||Math.floor(now/400)%2;ctx.fillStyle=on?'#ff4a3a':'#6a1a14';ctx.beginPath();ctx.arc(x+w-14,y+9,6,0,7);ctx.fill();}
  atHitCs('board',x,y,w,h,{});
}
function csLockers(x,y,n){for(let k=0;k<n;k++){R(ctx,x+k*26,y,24,62,'#b8402e');R(ctx,x+k*26+2,y+2,20,58,'#cf5a42');R(ctx,x+k*26+16,y+28,3,8,'#e8e2d0');for(let l=0;l<3;l++)R(ctx,x+k*26+5,y+6+l*4,14,2,'#9a3020');}}
function csPole(){const {x,y0,y1}=CS_POLE;ctx.fillStyle='#1c1c1c';ctx.beginPath();ctx.ellipse(x,y0,24,9,0,0,7);ctx.fill();ctx.fillStyle='#3a3530';ctx.beginPath();ctx.ellipse(x,y0,24,9,0,0,Math.PI);ctx.fill();
  R(ctx,x-3,y0,6,y1-y0,'#d9d9d9');R(ctx,x-1,y0,2,y1-y0,'#ffffff');R(ctx,x-20,y1,40,7,'#5a5a5a');R(ctx,x-20,y1,40,2,'#7a7a7a');
  atHitCs('pole',x-24,y0-10,48,y1-y0+18,{});}
function csCot(x,y,sleeper,k,now){ // lit de camp, et un pompier qui dort (casque posé à côté)
  R(ctx,x-34,y-10,68,18,'#4a5a3a');R(ctx,x-34,y-10,68,3,'#62744c');R(ctx,x-32,y+8,4,6,'#2a2a2a');R(ctx,x+28,y+8,4,6,'#2a2a2a');
  if(!sleeper)return;
  const sk=['#d8a77c','#f1c9a5','#7a4a2e','#e8b98f','#b07a55'][k%5];R(ctx,x-30,y-14,14,10,'#f2efe6');ctx.fillStyle=sk;ctx.beginPath();ctx.arc(x-22,y-14,6,0,7);ctx.fill();
  R(ctx,x-14,y-16,44,12,'#2b2f45');R(ctx,x-14,y-16,44,3,'#3b4060');
  ctx.fillStyle='#c9cfd6';ctx.beginPath();ctx.arc(x+40,y+6,6,Math.PI,0);ctx.fill();
  if(!REDUCED_MOTION){const f=((now/1400)+k*.3)%1;ctx.globalAlpha=1-f;atTxt('z',x-18+f*10,y-26-f*14,'#e8e2d0','bold '+(9+f*5|0)+'px system-ui');ctx.globalAlpha=1;}
}
function csGuard(now,people){ // la garde : aux cartes le jour, sur les lits de camp le soir et le week-end
  const T=AT_TS, {x,y}=CS_TABLE, open=atOpen();
  csLockers(36*T,7.4*T,5);atCoffee(41.4*T,9.4*T);E('🧯',35.9*T,18.6*T,14);atPlant(45.2*T,26.4*T);atPlant(35.7*T,26.4*T);
  for(let k=0;k<3;k++)csCot((37.4+k*3.1)*T,23.4*T,!open,k,now);
  if(open){R(ctx,x-1.2*T,y-.5*T,2.4*T,1.1*T,'#6b4a2e');R(ctx,x-1.2*T,y-.5*T,2.4*T,4,'#8a6040');
    [[-20,-6],[-4,-8],[12,-5],[0,4]].forEach(([dx,dy],j)=>R(ctx,x+dx,y+dy,9,12,j===3?'#d0392b':'#fbfbf6'));
    [[-1.9,.3,'right'],[1.9,.3,'left'],[0,-.8,'down']].forEach(([dx,dy,dir],j)=>{const c=csPompier(30+j,x+dx*T,y+dy*T,'idle',dir);
      people.push([c,null,false,()=>csHelmet(ctx,c.pos.x,c.pos.y,dir,false)]);atHitCs('guard',c.pos.x-16,c.pos.y-56,32,60,{});});
    csLate(people,()=>atPill('🃏 la garde : partie de cartes',x,y+1.7*T,'#1c2440','#bfe6ff','bold 9px system-ui,sans-serif'),y+1);}
  else csLate(people,()=>atPill('🌙 la garde dort, prête à partir',40.5*T,25.4*T,'#1c2440','#bfe6ff','bold 9px system-ui,sans-serif'),25*T);
  csPole();atDoor(46*T,AT_HY0*T);
  csLate(people,()=>atPill('⬆ RDC · 1er',46*T-48,AT_HY0*T+16,'#5a4636','#fff','bold 9px ui-monospace,Menlo,monospace'),AT_HY0*T);
}
// ---------- le capitaine (le boss) : à son poste de commandement, à la vanne quand une réponse attend sa validation ----------
function csCaptain(slots,now,dt,people){
  const T=AT_TS, boss=chars.find(c=>c.boss), d=CS_DESK, open=atOpen();
  R(ctx,d.x-1.8*T,d.y-.2*T,3.6*T,22,'#6e4a2c');R(ctx,d.x-1.8*T,d.y-.2*T,3.6*T,3,'#8a6040');R(ctx,d.x-1.8*T,d.y+.2*T+14,3.6*T,10,'#56391f');
  R(ctx,d.x+30,d.y-.2*T-18,14,18,'#1c1c1c');R(ctx,d.x+33,d.y-.2*T-28,2,10,'#1c1c1c');ctx.fillStyle=open?'#7dffb0':'#3d4250';ctx.beginPath();ctx.arc(d.x+37,d.y-.2*T-8,3,0,7);ctx.fill(); // la radio
  const calls=csCalls();R(ctx,d.x-3.6*T,d.y-.1*T,2*T,18,'#a0703f');R(ctx,d.x-3.6*T,d.y-.1*T,2*T,3,'#b98552');
  for(let k=0;k<Math.min(4,calls.length);k++)R(ctx,d.x-3.4*T+k*12,d.y-.1*T-10-k*2,24,12,'#c8323a');
  csLate(people,()=>{atPill('📥 '+(calls.length?plural(calls.length,'appel','appels'):'aucun appel'),d.x-2.6*T,d.y+1.3*T,calls.length?'#8a1f17':'#5b6070','#fff','bold 9px system-ui,sans-serif');
    const n=csDoneToday();atPill('🧯 '+(n?plural(n,'feu éteint','feux éteints')+' aujourd\'hui':'aucun feu aujourd\'hui'),d.x+3.6*T,d.y+1.3*T,n?'#2f7a45':'#5b6070','#fff','bold 9px system-ui,sans-serif');},d.y+1.4*T);
  atHitCs('calls',d.x-3.8*T,d.y-1*T,2.4*T,2.4*T,{});
  if(!boss)return; // le soir et le week-end, il reste, comme le boss au 1er (sous l'éclairage réduit)
  const gi=slots.findIndex(s=>s&&!s.dep&&s.s.k==='gate'), home={x:d.x,y:d.y-.25*T}, target=gi<0?null:gi;
  let m=CS_MEM.boss;
  const path=i=>{const z=CS_G[i], v=z.pts[5];return [{x:m?m.walk.pos.x:home.x,y:m?m.walk.pos.y:home.y},{x:m?m.walk.pos.x:home.x,y:(CS_Z1+.9)*T},{x:v.x,y:(CS_Z1+.9)*T},{x:v.x,y:v.y}];};
  if(!m||REDUCED_MOTION&&m.target!==target){m=CS_MEM.boss={target,walk:atWalker([target==null?home:CS_G[target].pts[5]])};}
  if(m.target!==target){m.target=target;m.walk=atWalker(target==null?[{...m.walk.pos},{x:m.walk.pos.x,y:(CS_Z1+.9)*T},{x:home.x,y:(CS_Z1+.9)*T},home]:path(target),90);}
  const arrived=atStep(m.walk,dt), p=m.walk.pos, dir=arrived?(target==null?'up':'down'):m.walk.dir;
  const c=Object.assign(Object.create(Object.getPrototypeOf(boss)),boss,{pos:{x:p.x,y:p.y},tile:null,dir,moving:!arrived,pose:'stand',present:true,_st:{st:target==null?'idle':'gate'}});
  people.push([c,null,false,()=>{csHelmet(ctx,p.x,p.y,dir,true);
    atPill(boss.name+' · capitaine',p.x,p.y+16,'#8a1f17','#fff','bold 10px system-ui,sans-serif');
    if(arrived&&target!=null)atBubble(p.x,p.y-66,'✋ j\'ouvre la vanne ?','#8a5a00');}]);
  atHitCs('captain',p.x-16,p.y-56,32,60,{});
}
// ---------- nuit : hors des heures de bureau, la caserne passe en veilleuse ----------
let CS_NIGHT_CV=null, CS_NIGHT_AT=0;
function csNight(slots,now){
  if(atOpen())return;
  const W_=AT_W/LQ, H_=AT_H/LQ, T=AT_TS;
  if(!CS_NIGHT_CV)CS_NIGHT_CV=[lightCanvas(W_,H_),lightCanvas(W_,H_)];
  if(now-CS_NIGHT_AT>200||!CS_NIGHT_AT){CS_NIGHT_AT=now;
    const m=CS_NIGHT_CV[0].getContext('2d');m.setTransform(1,0,0,1,0,0);m.globalCompositeOperation='source-over';m.clearRect(0,0,W_,H_);
    m.fillStyle='rgba(10,14,40,.5)';m.fillRect(0,0,W_,H_);m.setTransform(1/LQ,0,0,1/LQ,0,0);m.globalCompositeOperation='destination-out';
    slots.forEach((s,b)=>{if(!s)return;const z=CS_G[b];softSpot(m,z.cx,(CS_DY1-1)*T,4*T,.7);softSpot(m,z.cx,(CS_R1+.5)*T,4.5*T,.8);softSpot(m,z.cx,(CS_R2+.3)*T,4*T,.7);});
    softSpot(m,40.5*T,23.4*T,4.5*T,.55);softSpot(m,40.6*T,4.2*T,5*T,.7);softSpot(m,CS_POLE.x,CS_POLE.y1,1.6*T,.5);softSpot(m,46*T-10,AT_HY0*T+20,40,.5);softSpot(m,CS_DESK.x,CS_DESK.y,2.5*T,.45);
    const l=CS_NIGHT_CV[1].getContext('2d');l.clearRect(0,0,W_,H_);l.filter='blur(3px)';l.drawImage(CS_NIGHT_CV[0],0,0);l.filter='none';}
  const sm=ctx.imageSmoothingEnabled;ctx.imageSmoothingEnabled=true;ctx.drawImage(CS_NIGHT_CV[1],0,0,AT_W,AT_H);ctx.imageSmoothingEnabled=sm;
}
// ---------- l'image ----------
function renderCaserne(now){
  const dt=CS_MEM.last?Math.min(.1,(now-CS_MEM.last)/1000):0;CS_MEM.last=now;
  if(!CS_BG)CS_BG=csBackground();
  ctx.drawImage(CS_BG,0,0);CS_HITS=[];
  const slots=csSlots(now), people=[];
  slots.forEach((s,b)=>csBay(s,b,now,dt,people));
  csBoard(slots,now);csGuard(now,people);csCaptain(slots,now,dt,people);
  people.sort((a,b)=>a[0].pos.y-b[0].pos.y).forEach(([c,d,before,after])=>{if(before&&d)d();if(c.sprite)drawChar(c,now);if(!before&&d)d();if(after)after();});
  csNight(slots,now);
  if(CS_SEL!=null){const b=CS_MEM.slots.indexOf(CS_SEL);if(b>=0){const z=CS_G[b];ctx.save();ctx.strokeStyle='#ffffff';ctx.lineWidth=3;ctx.setLineDash([8,6]);ctx.lineDashOffset=-now/60;ctx.strokeRect(z.x0+1,CS_DY0*AT_TS-20,z.w-2,(CS_Z1-CS_DY0)*AT_TS+24);ctx.restore();}}
}
function atHitCs(kind,x,y,w,h,ref){CS_HITS.push({kind,x,y,w,h,...ref});}
// les zones cliquables de la caserne (atHit sert à l'atelier)
function csHitAt(e){
  const r=cv.getBoundingClientRect(), mx=(e.clientX-r.left)*AT_W/r.width, my=(e.clientY-r.top)*AT_H/r.height, inn=h=>mx>=h.x&&mx<h.x+h.w&&my>=h.y&&my<h.y+h.h;
  for(let k=CS_HITS.length-1;k>=0;k--)if(CS_HITS[k].kind!=='bay'&&inn(CS_HITS[k]))return CS_HITS[k];
  for(let k=CS_HITS.length-1;k>=0;k--)if(inn(CS_HITS[k]))return CS_HITS[k];
  return null;
}
// ---------- clic et survol ----------
function caserneClick(e){
  const h=csHitAt(e);
  CS_SEL=h&&(h.kind==='bay'||h.kind==='agent')?CS_MEM.slots[h.b]||null:null;
  renderSide(true);
}
function caserneHover(e){
  const h=csHitAt(e);let s='';
  const slot=h&&h.b!=null?csSlots(performance.now())[h.b]:null;
  if(h&&h.kind==='agent'){const p=CS_POSTES.find(x=>x.k===h.k), st=slot&&slot.st?slot.st[h.k]||'wait':'wait';
    s=p.i+' '+p.n+' · baie '+(h.b+1)+' · '+(p.gate?(st==='gate'?'la réponse attend ta validation : le capitaine vient ouvrir la vanne':st==='ok'?'validé':'ta validation, avant de poster'):CS_ST[st==='gate'?'ok':st][1]);}
  else if(h&&h.kind==='bay')s=slot?(slot.dep?'Baie '+(h.b+1)+' · réponse postée, le camion part':'Baie '+(h.b+1)+' · '+csTitle(slot.t)+' · de '+spWho(slot.t.from)):'Baie '+(h.b+1)+' · libre';
  else if(h&&h.kind==='pole')s='La barre de pompier : on descend du RDC en glissant';
  else if(h&&h.kind==='guard')s='La garde : l\'équipe des baies libres, prête à partir';
  else if(h&&h.kind==='captain')s=(chars.find(c=>c.boss)||{}).name+' · capitaine : ouvre la vanne (✋) quand une réponse attend sa validation';
  else if(h&&h.kind==='calls'){const n=csCalls().length;s=n?plural(n,'appel','appels')+' à prendre : clic pour les voir':'Aucun appel à prendre';}
  else if(h&&h.kind==='board')s='Le tableau des interventions';
  cv.style.cursor=h&&h.kind!=='pole'&&h.kind!=='guard'&&h.kind!=='board'?'pointer':'default';
  if(s){tip.style.display='block';tip.style.left=e.clientX+'px';tip.style.top=e.clientY+'px';tip.textContent=s;}else tip.style.display='none';
}
// ---------- panneau : les baies, les appels, la fiche d'une intervention ----------
const csBar=st=>'<div class="at-bar">'+CS_POSTES.map(p=>{const s=st[p.k];return `<i class="${s?CS_ST[s][0]:''}" title="${esc(p.n+' : '+CS_ST[s||'wait'][1])}"></i>`;}).join('')+'</div>';
function csTag(x){const cur=csCur(x.st||{});
  return x.s.k==='gate'?'<span class="at-tag wait">✋ t\'attend</span>':x.s.k==='failed'?'<span class="at-tag bloq">🧯 en panne</span>':cur?`<span class="at-tag run">${cur.i} ${esc(cur.n)}</span>`:'';}
function caserneListHtml(slots){
  const bays=slots.map((x,b)=>x&&!x.dep&&{...x,b}).filter(Boolean), q=csWaiting();
  return `<h2 class="at-h">🚒 Caserne Support <span class="cnt">${bays.length}/${CS_BAYS}</span></h2>`+
    (bays.length?bays.map(x=>`<button class="at-room" data-id="${esc(x.t.id)}"><span class="at-top"><span><span class="mut">Baie ${x.b+1}</span> · <b>${esc(spWho(x.t.from))}</b></span>${csTag(x)}</span>
      <span class="at-title">${esc(csTitle(x.t))}</span>${csBar(x.st||{})}<span class="mut">depuis ${esc(spWhen((x.t.run&&x.t.run.at)||x.t.at))}</span></button>`).join('')
    :`<div class="note">Aucune intervention : les baies sont fermées, la garde ${atOpen()?'joue aux cartes':'dort sur les lits de camp'}. « 🔎 Investiguer » un appel fait sortir un camion.</div>`)+
    (q?`<div class="note">${plural(q,'intervention attend','interventions attendent')} une baie libre.</div>`:'')+
    `<h2 class="at-h">📥 Appels à prendre <span class="cnt">${csCalls().length}</span></h2>`;
}
function csFicheHtml(x,b){
  const st=x.st||{};
  return `<button class="at-back">‹ La caserne</button><h2 class="at-h">🚒 Baie ${b+1} <span class="cnt">${esc(spWho(x.t.from))}</span></h2>
    <div class="at-title big">${esc(csTitle(x.t))}</div>${csBar(st)}
    <table class="at-t">${CS_POSTES.map(p=>{const s=st[p.k];return `<tr${csCur(st)===p?' class="cur"':''}><td>${p.i} ${esc(p.n)}</td><td>${s?`<span class="dot" style="background:${{ok:'var(--ok)',run:'var(--info)',err:'var(--err)',gate:'var(--warn)'}[s]}"></span>${CS_ST[s][1]}`:'<span class="mut">à venir</span>'}</td></tr>`;}).join('')}</table>`;
}
function drawCaserneSide(side){
  const box=document.createElement('div');box.className='atelier caserne';side.appendChild(box);
  const slots=csSlots(performance.now()), b=CS_SEL!=null?slots.findIndex(x=>x&&!x.dep&&x.t.id===CS_SEL):-1;
  if(b>=0){box.innerHTML=csFicheHtml(slots[b],b);box.querySelector('.at-back').addEventListener('click',()=>{CS_SEL=null;renderSide(true);});box.appendChild(spCard(slots[b].t));return;}
  box.innerHTML=caserneListHtml(slots);
  box.querySelectorAll('.at-room').forEach(x=>x.addEventListener('click',()=>{CS_SEL=x.dataset.id;renderSide(true);}));
  const calls=csCalls();
  if(calls.length)for(const t of calls)box.appendChild(spCard(t));else box.insertAdjacentHTML('beforeend','<div class="mut">Aucun appel.</div>');
}
// ---------- mode TV : les baies à la place de « Qui fait quoi » ----------
function tvCaserneHtml(){
  const slots=csSlots(performance.now()), calls=csCalls();
  return '<h2>Caserne Support</h2>'+slots.map((x,b)=>{
    if(!x||x.dep)return `<div class="tw ag"><span class="wt"><span class="wn">Baie ${b+1}<span class="ws">${x?'en route':'libre'}</span></span><span class="ww nt">${x?'Réponse postée dans Teams':atOpen()?'La garde joue aux cartes':'La garde dort'}</span></span></div>`;
    const cur=csCur(x.st||{}), st=x.s.k==='gate'?'gate':x.s.k==='failed'?'error':'work';
    return `<div class="tw ag" style="--st:${ST_CSS[st]||'var(--idle)'}"><span class="wt"><span class="wn">Baie ${b+1} · ${esc(spWho(x.t.from))}<span class="ws">${esc(x.s.k==='gate'?'t\'attend':x.s.k==='failed'?'en panne':cur?cur.i+' '+cur.n:'')}</span></span>`+
      `<span class="ww">${esc(csTitle(x.t))}</span>${csBar(x.st||{})}</span></div>`;}).join('')+
    `<h2>Appels à prendre · ${calls.length}</h2>`+calls.slice(0,4).map(t=>`<div class="tw ag"><span class="wt"><span class="wn">${esc(spWho(t.from))}<span class="ws">${esc(spWhen(t.at))}</span></span><span class="ww">${esc(csTitle(t))}</span></span></div>`).join('');
}
// ---------- scènes de la caserne pour la galerie (46-gallery.js) ----------
// Chacune joue sur une copie du dataset support (rendue à la fin de la démonstration).
// Comme au 1er, toutes se jouent à toute heure : sans intervention en cours, la copie part des fils de la démo ; trois baies
// prises, la plus récente se libère d'abord (prep : posée sans scène, comme en arrivant à l'étage)
function csDemo(mut,prep){return s=>{const src=csActive().length?SUPPORT:supportDemo(), d=JSON.parse(JSON.stringify(src||{threads:[]}));d.threads=d.threads||[];
  if(prep){prep(d);SUPPORT=JSON.parse(JSON.stringify(d));csReset();csSlots(performance.now());CS_MEM.door=CS_MEM.slots.map(x=>x?1:0);}
  mut(d,new Date(s).toISOString(),s);SUPPORT=d;};}
const csFreeOne=d=>{const l=d.threads.filter(t=>spState(t).k in CS_LIVE);if(l.length>=CS_BAYS){const t=l.sort((a,b)=>ms(b.run&&b.run.at)-ms(a.run&&a.run.at))[0];t.state='skipped';}};
const csIn=(d,k)=>d.threads.find(t=>spState(t).k===k);
function csGalleryScenes(){
  const fam='Sous-sol', ok=true, out=[];
  const demoRun=(id,at,postes)=>({run:'demo-'+id,status:'Running',at,disc:null,version:0,postes});
  out.push({fam,ico:'📟',n:'Un appel arrive',d:'Le voyant du tableau clignote, l\'appel rejoint la pile sur le bureau du capitaine',w:'Un nouveau message dans le canal Support',ok,
    play:{len:15e3,speed:1,setup:csDemo((d,at)=>{d.threads.push({id:'demo-call',from:'Halpert, Jim',at,text:'Le formulaire de contact renvoie une erreur 500 depuis ce matin.',subject:'Formulaire de contact en 500',url:null,state:'new',run:null,mine:null,replies:0,last_at:at});})}});
  out.push({fam,ico:'🚒',n:'Une intervention démarre',d:'Le rideau d\'une baie se lève, le camion est là, l\'équipe se range et le tuyau part vers le Tri',w:'« 🔎 Investiguer » sur un appel',ok,
    play:{len:20e3,speed:1,setup:csDemo((d,at)=>{d.threads.push({id:'demo-start',from:'Martin, Angela',at,text:'Les reçus PDF des commandes sont vides.',subject:'Reçus PDF vides',url:null,state:'run',run:demoRun('start',at,{tri:'run'}),mine:null,replies:0,last_at:at});},csFreeOne)}});
  out.push({fam,ico:'💧',n:'Le tuyau avance',d:'Un pompier a fini (✓), le tuyau se remplit jusqu\'au poste suivant qui se met à arroser',w:'Chaque poste qui finit',ok,
    play:{len:12e3,speed:1,setup:csDemo(d=>{const t=csIn(d,'run');if(!t)return;const st=csStates(t), ks=CS_POSTES.filter(p=>!p.gate).map(p=>p.k), j=Math.max(0,ks.findIndex(k=>st[k]==='run'));
      const p={};ks.slice(0,j+1).forEach(k=>{p[k]='ok';});p[ks[Math.min(ks.length-2,j+1)]]='run';t.run.postes=p;},()=>{})}});
  out.push({fam,ico:'✋',n:'À toi de valider',d:'La réponse est relue : le capitaine quitte son bureau et va ouvrir la vanne de la baie',w:'La réponse proposée attend ta validation',ok,
    play:{len:20e3,speed:1,setup:csDemo(d=>{const t=csIn(d,'run');if(!t)return;t.state='gate';t.run.status='WaitingApproval';t.run.postes=null;t.run.draft=t.run.draft||'🔎 Cause : …';},()=>{})}});
  out.push({fam,ico:'📣',n:'Le camion part',d:'Réponse postée dans Teams : l\'équipe monte à bord, gyrophares, le camion sort et le rideau se referme',w:'Tu valides la réponse',ok,
    play:{len:15e3,speed:1,setup:csDemo((d,at)=>{const t=csIn(d,'gate');if(!t)return;t.state='done';t.mine={at,text:(t.run&&t.run.draft)||'…'};},()=>{})}});
  out.push({fam,ico:'🧯',n:'Intervention en panne',d:'Un poste a planté : fumée, le tuyau s\'arrête là, la baie attend une relance',w:'Un poste échoue (API d\'un agent indisponible…)',ok,
    play:{len:15e3,speed:1,setup:csDemo(d=>{const t=csIn(d,'run');if(!t)return;const st=csStates(t), cur=csCur(st);t.state='failed';t.run.status='Failed';t.run.postes={...st,[cur?cur.k:'tri']:'err'};},()=>{})}});
  out.push({fam,ico:'🌙',n:'La garde de nuit',d:'Le soir et le week-end : la caserne en veilleuse, la garde dort sur les lits de camp, les interventions continuent',w:'Hors des heures de bureau',ok,
    play:{len:20e3,speed:60,setup:s=>{const n=parisMidnight(s)+22.5*36e5;T=n;SCENE_DEMO.e=n+20e3*60;}}});
  return out;
}
