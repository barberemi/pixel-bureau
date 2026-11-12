// ---------- -1 : la caserne Support (#62) ----------
// Sous le RDC, une baie de camion par intervention (fil du Support en investigation, réponse à valider, en panne), trois
// au plus. Devant chaque camion, son équipe de pompiers dans la zone peinte au sol, rangée dans l'ordre des postes ; le
// tuyau part du camion et passe de main en main : plein et jaune jusqu'au poste au travail, en pointillé ensuite. Au
// poste ✋, la vanne : le capitaine (le boss) vient l'ouvrir quand une réponse attend sa validation. Rien n'apparaît
// d'un coup : à une nouvelle intervention, le rideau se lève, le camion sort de la baie, les pompiers descendent la barre
// un par un et courent à leur place ; réponse postée dans Teams, le tuyau s'enroule, le camion rentre, le rideau se ferme
// sur lui, l'équipe prend un café et remonte la barre. En arrivant à l'étage ou avec REDUCED_MOTION, tout est posé.
// Les baies libres restent fermées, l'équipe de garde joue aux cartes ; le soir et le week-end la garde reste, sous un
// éclairage réduit, et dort sur les lits de camp. À droite, la barre de pompier, seul accès aux autres étages ; au mur,
// le gyrophare tourne tant qu'il y a un appel à prendre ou une intervention en cours.
// Données : dataset support (48-support.js) ; l'état des postes vient des étapes du run (cron live, chaque minute : une
// étape par poste, ou le modèle d'avant, une seule investigation), sinon de t.run.postes (relevé, plus espacé). Toile de l'atelier (AT_W × AT_H).
const CS_POSTES=[{k:'tri',i:'🏷',n:'Tri',d:'trie l\'appel : de quoi on parle, est-ce urgent'},{k:'logs',i:'🔎',n:'Logs',d:'relève ce que le fil donne et les commandes à lancer'},
  {k:'cause',i:'🧩',n:'Cause',d:'cherche la cause'},{k:'reponse',i:'✉',n:'Réponse',d:'rédige la réponse'},{k:'relecture',i:'🧐',n:'Relecture',d:'relit la réponse'},
  {k:'gate',i:'✋',n:'Toi',gate:true,d:'tu valides la réponse'},{k:'post',i:'📣',n:'Teams',d:'poste la réponse dans le fil Teams'}];
const CS_ST={ok:['ok','a travaillé'],run:['run','au travail'],err:['err','en panne'],gate:['wait','t\'attend'],wait:['','attend son tour']};
// « Comment lire le plan » au -1 (46-legende.js) ; les postes viennent de CS_POSTES
const CS_HELP={bar:()=>'<span class="lk"><i data-st="work"></i>au travail</span><span class="lk"><i class="ring ring-dot" data-st="gate"></i>t\'attend</span><span class="lk"><i class="ring ring-dash" data-st="error"></i>en panne</span><span>🚨 gyrophare : un appel attend ou une intervention tourne</span>',
  postes:()=>[['',CS_POSTES]],
  qui:'<p><b>Pompiers</b> : les agents, en tenue de sapeur-pompier, un par poste.</p><p><b>Le capitaine</b> (le boss), à son bureau, va ouvrir la vanne quand une réponse attend ta décision : ici, ta décision, c\'est la vanne.</p><p>La garde reste le soir et le week-end, sous la veilleuse.</p><p>Un agent en gris pâle : son poste attend, personne n\'y travaille en ce moment (au RDC, la couleur d\'un hologramme dit sa famille, pas son activité).</p>',
  ou:'<p><b>Trois baies</b> : trois interventions à la fois, chacune avec son camion.</p><p><b>Le tableau</b> : son voyant clignote à chaque appel. <b>La pile</b> sur le bureau du capitaine : les appels à prendre.</p><p><b>La barre</b> : les pompiers y descendent et y remontent.</p>',
  moments:'<p><b>🚒 Une intervention démarre</b> : le rideau se lève, le camion sort, le tuyau se déroule jusqu\'au Tri.</p><p><b>💧 Le tuyau</b> se remplit jusqu\'au poste qui travaille.</p><p><b>📣 Le camion part</b> : la réponse est postée dans Teams, le camion rentre.</p>'};
const CS_BAYS=3, CS_BX=[1,12.25,23.5], CS_BW=10.25, CS_DY0=3.1, CS_DY1=10.1, CS_Z0=10.8, CS_Z1=20.7, CS_R1=14.3, CS_R2=18.7;
const CS_DESK={x:17*AT_TS,y:24.6*AT_TS}, CS_POLE={x:43.6*AT_TS,y0:9*AT_TS,y1:13.4*AT_TS}, CS_TABLE={x:39*AT_TS,y:16*AT_TS};
const CS_DEP_MS=6.5e3; // la fin d'une intervention : le tuyau s'enroule, le camion rentre dans sa baie, le rideau se ferme sur lui
// arrivée d'une équipe : le rideau se lève, le camion sort de la baie, les pompiers descendent la barre un par un puis
// courent à leur place par l'allée sous les baies (CS_LANE) ; en partant, ils passent par la machine à café et remontent
// la barre. Ordres choisis pour que personne ne traverse un autre : premier rang de gauche à droite, puis le second ; au
// départ, le second rang d'abord, puis le premier de droite à gauche.
const CS_LANE=(CS_Z1+.9)*AT_TS, CS_RUN=150, CS_WALK=105, CS_SLIDE=200, CS_GAP=1.1, CS_LEAVE_GAP=1.3;
const CS_IN=[0,1,2,3,6,4], CS_OUT=[4,6,3,2,1,0], CS_PX=CS_POLE.x-12, CS_CUP={x:41.4*AT_TS,y:10.6*AT_TS};
const caserneOn=()=>supportOn();
// les postes de l'investigation (sous-workflows support_*, CFG.support.postes_wf) : leurs runs ne passent pas au RDC
const csWf=w=>!!w&&((CFG.support&&CFG.support.postes_wf)||[]).includes(String(w).slice(0,8));
const csMem0=()=>({fresh:true,slots:[null,null,null],dep:[null,null,null],arr:[null,null,null],st:[null,null,null],door:[0,0,0],walk:[],boss:null,last:0});
let CS_MEM=csMem0(), CS_SEL=null, CS_PICK=null, CS_HITS=[], CS_LIT=[];
// les interventions dont l'arrivée a déjà été montrée (ou posée) : en revenant à l'étage, elle ne se rejoue pas ; un saut du
// curseur l'oublie (renderCaserne)
const CS_SEEN=new Set();
// CS_PICK : le pompier choisi ({b, k}) pour son halo ; CS_LIT : où est le capitaine, pour la lumière du soir (csNight)
// CS_MEM.arr[b] : l'arrivée en cours de l'équipe de la baie b ; CS_MEM.walk : les pompiers qui repartent (café, barre)
function csReset(){CS_MEM=csMem0();CS_SEL=null;CS_PICK=null;}
// pompiers de la caserne : des agents, donc des hologrammes bleus comme au RDC et au 1er (csPompier : person false) ; tenue de
// sapeur-pompier (veste et pantalon marine), visages variés ; le casque se pose par-dessus
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
  const l=((DATA&&DATA.runs)||[]).filter(r=>!r.parent&&spRunOfThread(r,t)&&ms(r.start)<=T);
  return l.sort((a,b)=>ms(b.start)-ms(a.start))[0]||null;
}
// état de chaque poste d'une intervention : ok, run, err, gate (✋ t'attend) ; absent = attend son tour
function csStates(t,s){
  const out={}, k=s?s.k:spState(t).k, r=(s&&s.r)||csRunOf(t);
  if(!(r&&(r.steps||[]).length)&&t.run&&t.run.postes)Object.assign(out,t.run.postes);
  else{
    for(const st of (r&&r.steps)||[]){if(st.at&&ms(st.at)>T)continue; // rejeu : une étape pas encore commencée à l'heure du plan
      const going=st.at&&ms(st.at)+(st.ms||0)>T&&st.s!=='WaitingApproval'; // commencée, pas finie à T : au travail (ou à la gate)
      const v=going?(st.n==='gate'?'gate':'run'):st.s==='Success'||st.s==='Skipped'?'ok':st.s==='Failed'?'err':st.s==='WaitingApproval'?'gate':'run';
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
    if(M.fresh||REDUCED_MOTION){M.slots[b]=null;M.arr[b]=null;M.door[b]=0;return;} // posé directement : la baie est fermée
    // fin de l'intervention : réponse postée (le camion part, l'équipe prend un café) ou fil traité autrement (l'équipe remonte)
    const posted=!!(t&&spState(t).k==='done'&&t.mine);
    M.dep[b]={id,t0:now,t:t||{id},posted,st:posted?Object.fromEntries(CS_POSTES.map(p=>[p.k,'ok'])):M.st[b]};csLeave(b,now,posted);M.arr[b]=null;
  });
  M.dep.forEach((d,b)=>{if(d&&now-d.t0>CS_DEP_MS){M.dep[b]=null;M.slots[b]=null;M.door[b]=0;}});
  for(const id of ids)if(!M.slots.includes(id)){const b=M.slots.findIndex((x,i)=>!x&&!M.dep[i]);if(b<0)break;M.slots[b]=id;
    const x=act.find(a=>a.t.id===id), t0=ms((x.t.run&&x.t.run.at)||(x.s.r&&x.s.r.start)||''), recent=t0&&t0<=T&&T-t0<120e3, seen=CS_SEEN.has(id);CS_SEEN.add(id);
    if((M.fresh&&(!recent||seen))||REDUCED_MOTION){M.door[b]=1;M.arr[b]=null;}else M.arr[b]=csArrive(b,now);} // partie il y a moins de 2 min, pas encore vue : l'arrivée se joue
  M.walk=M.walk.filter(w=>!w.gone);
  M.fresh=false;
  return M.slots.map((id,b)=>{if(!id)return null;if(M.dep[b])return {t:M.dep[b].t,s:{k:'done'},dep:M.dep[b]};const a=act.find(x=>x.t.id===id);if(!a)return null;const st=csStates(a.t,a.s);M.st[b]=st;return {...a,st};});
}
// ---------- les pompiers qui marchent ----------
// un marcheur suit ses points : v (vitesse), hold (une pause, en secondes), act (ce qu'il y fait : slide, climb, coffee)
function csWalker(k,pts){return {k,pos:{x:pts[0].x,y:pts[0].y},pts:pts.slice(1).map(p=>({...p})),dir:'down',act:pts[0].act||null,moving:false};}
function csStepW(w,dt){
  w.moving=false;
  while(dt>1e-6&&w.pts.length){
    const p=w.pts[0];w.act=p.act||null;
    if(p.hold!=null){if(p.hold>dt){p.hold-=dt;return false;}dt-=p.hold;w.pts.shift();continue;}
    const v=p.v||CS_WALK, dx=p.x-w.pos.x, dy=p.y-w.pos.y, d=Math.hypot(dx,dy);
    if(p.act!=='slide'&&p.act!=='climb'&&(Math.abs(dx)>.5||Math.abs(dy)>.5))w.dir=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');
    if(d<=v*dt){w.pos={x:p.x,y:p.y};w.pts.shift();dt-=d/v;}else{w.pos.x+=dx/d*v*dt;w.pos.y+=dy/d*v*dt;w.moving=p.act!=='slide'&&p.act!=='climb';return false;}
  }
  return !w.pts.length;
}
// arrivée : chacun attend son tour au-dessus du trou de la barre, glisse, puis court à sa place par l'allée sous les baies
function csArrive(b,now){
  const z=CS_G[b], {y0,y1}=CS_POLE;
  return {t0:now,all:0,w:CS_IN.map((j,n)=>{const p=z.pts[j];
    return [j,csWalker(b*7+j,[{x:CS_PX,y:y0,act:'slide'},{x:CS_PX,y:y0,hold:1+n*CS_GAP,act:'slide'},{x:CS_PX,y:y1,v:CS_SLIDE,act:'slide'},
      {x:CS_PX,y:CS_LANE,v:CS_RUN},{x:p.x,y:CS_LANE,v:CS_RUN},{x:p.x,y:p.y,v:CS_RUN}])];})};
}
// départ : de sa place (ou de là où il en est) jusqu'à l'allée, puis la salle de garde ; un café si la réponse est postée,
// et il remonte la barre
function csLeave(b,now,posted){
  const z=CS_G[b], a=CS_MEM.arr[b], {y0,y1}=CS_POLE, X=42.3*AT_TS;
  CS_OUT.forEach((j,n)=>{const aw=a&&a.w.find(x=>x[0]===j), w=aw&&!aw[1].done?aw[1]:null;
    if(w&&w.act==='slide'){if(w.pos.y>y0+1)CS_MEM.walk.push(csWalker(b*7+j,[{...w.pos,act:'climb'},{x:CS_PX,y:y0-4,v:90,act:'climb'}]));return;} // sur la barre : il remonte
    const from=w?w.pos:z.pts[j], hold=.6+n*CS_LEAVE_GAP;
    const pts=[{...from},{...from,hold},{x:from.x,y:CS_LANE},{x:X,y:CS_LANE}];
    if(posted)pts.push({x:X,y:CS_CUP.y},{x:CS_CUP.x,y:CS_CUP.y},{x:CS_CUP.x,y:CS_CUP.y,hold:1.6,act:'coffee'},{x:CS_PX,y:CS_CUP.y});
    else pts.push({x:CS_PX,y:CS_LANE});
    pts.push({x:CS_PX,y:y1},{x:CS_PX,y:y0-4,v:90,act:'climb'});
    CS_MEM.walk.push(csWalker(b*7+j,pts));});
}
// un pompier qui marche : sur la barre, on ne voit que ce qui est sous le trou du plafond
function csDrawWalker(w,people,now){
  const {x,y}=w.pos, k=w.k, dir=w.act==='coffee'?'up':w.act==='slide'||w.act==='climb'?'up':w.dir;
  const c=csPompier(k,x,y,'idle',dir);c.moving=w.moving;
  const pole=w.act==='slide'||w.act==='climb';
  people.push([c,pole?()=>{ctx.save();ctx.beginPath();ctx.rect(x-30,CS_POLE.y0+2,60,400);ctx.clip();}:null,pole,()=>{csHelmet(ctx,x,y,dir,false);if(pole)ctx.restore();
    if(w.act==='coffee')E('☕',x+12,y-46,13);}]);
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
  R(g,35*T-4,2*T,4,CS_LANE-1.4*T-2*T,'#7d776c');R(g,35*T-4,CS_LANE+.6*T,4,27*T-CS_LANE-.6*T,'#7d776c'); // la salle de garde, séparée par un muret ouvert sur l'allée
  for(let b=0;b<CS_BAYS;b++){const z=CS_G[b];g.save();g.strokeStyle='#f2c230';g.lineWidth=3;g.setLineDash([12,7]);g.strokeRect(z.x0+4,CS_Z0*T,z.w-8,(CS_Z1-CS_Z0)*T);g.restore();
    for(let k=0;k<6;k++)R(g,z.cx-2.5*T+k*T,(CS_Z1+.25)*T,T*.55,6,k%2?'#1c1c1c':'#f2c230');} // bande devant la baie
  return c;
}
let CS_BG=null;
function csDoorBack(z,b){const d=z.door;R(ctx,d.x-6,d.y-6,d.w+12,d.h+6,'#5a3a2a');R(ctx,d.x,d.y,d.w,d.h,'#1f1b18');
  atPill('BAIE '+(b+1),z.cx,d.y-12,'#5a3a2a','#fff','bold 12px ui-monospace,Menlo,monospace');}
function csCurtain(z,k){ // rideau de la baie : k = part fermée (1 fermé) ; il descend au pixel près, lame après lame
  const d=z.door, h=Math.round(d.h*k);if(h<=0)return;
  ctx.save();ctx.beginPath();ctx.rect(d.x,d.y,d.w,h);ctx.clip();
  const off=h-Math.ceil(h/10)*10;for(let l=0;l*10<h+10;l++)R(ctx,d.x,d.y+off+l*10,d.w,9,l%2?'#c8323a':'#b02a32');ctx.restore();
  R(ctx,d.x,d.y+h-2,d.w,3,'#7a1a20');
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
  return {key:'cs_'+k,sprite:'cs_pomp'+(k%CS_CREW.length),name:'Pompier',person:false,family:'jour',pos:{x,y},tile:null,dir:dir||'down',moving:false,pose:'stand',present:true,
    phase:(k*.37)%1,_st:{st:s==='run'?'work':s==='err'?'error':'idle'}};
}
function csGrey(c,now,f){ // attend son tour : la silhouette grise, comme au 1er étage (f : fondu à l'arrivée)
  if(f!=null&&f<=0)return;const g=atLayer();atDrawInto(g,c,now);csHelmet(g,c.pos.x,c.pos.y,c.dir,false);
  ctx.save();ctx.globalAlpha=.4*(f==null?1:f);ctx.filter='grayscale(1)';ctx.drawImage(AT_OFF,0,0);ctx.restore();
}
function csHose(z,st,L,fd){ // du camion au premier pompier, puis de main en main ; plein jusqu'au poste au travail ; L : longueur déroulée
  const cur=CS_POSTES.findIndex(p=>st[p.k]&&st[p.k]!=='ok'), last=cur<0?CS_POSTES.length-1:cur, P=z.pts;
  const seg=(a,b,on)=>{if(!on&&fd<=0||on&&L<=0)return;ctx.save();ctx.strokeStyle=on?'#e0a020':'#9a958a';ctx.lineWidth=on?5:3;ctx.setLineDash(on?(L<1e4?[L,1e5]:[]):[6,5]);if(!on)ctx.globalAlpha=fd;ctx.beginPath();
    const p0=a<0?z.hose:{x:P[a].x,y:P[a].y-22};ctx.moveTo(p0.x,p0.y);
    for(let j=a+1;j<=b;j++){const q={x:P[j].x,y:P[j].y-22};if(j===4)ctx.bezierCurveTo(z.cx+4.9*AT_TS,P[3].y-22,z.cx+4.9*AT_TS,P[4].y-22,q.x,q.y);else ctx.lineTo(q.x,q.y);}
    ctx.stroke();ctx.restore();};
  seg(-1,last,true);if(last<CS_POSTES.length-1)seg(last,CS_POSTES.length-1,false);
}
function csValve(x,y,open,now){R(ctx,x+14,y-24,4,24,'#5d6370');ctx.strokeStyle=open?'#e0a020':'#c8323a';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x+16,y-28,7,0,7);ctx.stroke();
  R(ctx,x+15,y-35,2,14,ctx.strokeStyle);R(ctx,x+9,y-29,14,2,ctx.strokeStyle);}
const csPostePill=(p,s,x,y)=>atPill(atPosteLbl(p,['run','err','gate'].includes(s)),x,y,{run:'#2f6fd6',ok:'#2f7a45',err:'#a8323a',gate:WAIT_BG}[s]||'#f4efe4',s==='gate'?WAIT_INK:s?'#fff':'#3a3530','bold 11px system-ui,sans-serif');
// ---------- une baie ----------
const csEase=u=>u<=0?0:u>=1?1:u*u*(3-2*u), csClamp=u=>u<0?0:u>1?1:u;
function csBay(slot,b,now,dt,people){
  const z=CS_G[b], T=AT_TS, M=CS_MEM, d=z.door, a=slot&&!slot.dep?M.arr[b]:null;
  // le rideau (M.door : 1 levé) et le camion (out : 0 au fond de la baie, 1 sorti) suivent l'arrivée ou le départ en cours
  let out, u=0;
  if(slot&&slot.dep){u=(now-slot.dep.t0)/1000;out=REDUCED_MOTION?0:1-csEase((u-1.2)/2.4);M.door[b]=REDUCED_MOTION?0:1-csEase((u-3.4)/2.4);}
  else if(a){u=(now-a.t0)/1000;M.door[b]=csEase(u/1.6);out=csEase((u-1.1)/2.2);}
  else{const want=slot?1:0;M.door[b]+=Math.sign(want-M.door[b])*Math.min(Math.abs(want-M.door[b]),dt*.7);if(REDUCED_MOTION)M.door[b]=want;out=slot?1:0;}
  const open=M.door[b];
  csDoorBack(z,b);
  if(slot&&out>0){ctx.save();ctx.beginPath();ctx.rect(d.x,d.y,d.w,d.h+30);ctx.clip(); // le camion, derrière le rideau tant qu'il est dans la baie
    if(out<1)ctx.filter=`brightness(${(.35+.65*out).toFixed(2)})`;
    csTruck(z.truck.x,z.truck.y-(1-out)*1.4*T,slot.dep||a&&out<1||slot.s.k!=='failed',now,1.2+.55*out);ctx.restore();}
  csCurtain(z,1-.78*open);
  if(slot&&slot.dep){ // fin : le tuyau s'enroule, le camion rentre, le rideau se ferme sur lui ; l'équipe s'en va (CS_MEM.walk)
    const f=1-csClamp((u-.4)/1);
    if(f>0){ctx.save();ctx.globalAlpha=f;csValve(z.pts[5].x,z.pts[5].y,true,now);ctx.restore();}
    if(slot.dep.st&&!REDUCED_MOTION)csHose(z,slot.dep.st,2600*(1-csClamp(u/1.2)),f);
    if(slot.dep.posted&&u<5)csLate(people,()=>{ctx.save();ctx.globalAlpha=1-csClamp((u-4)/1);atPill('📣 Réponse postée dans Teams : feu éteint',z.cx,(CS_Z0+1.2)*T,'#2f7a45','#fff','bold 12px system-ui,sans-serif');ctx.restore();});
    atHitCs('bay',z.x0,d.y,z.w,(CS_Z1-CS_DY0)*T,{b});return;
  }
  if(!slot){atHitCs('bay',z.x0,d.y,z.w,(CS_Z1-CS_DY0)*T,{b});if(open<.05)atPill('libre',z.cx,d.y+d.h/2,'#1c2440','#bfe6ff','bold 12px ui-monospace,Menlo,monospace');return;}
  const t=slot.t, k=slot.s.k, st=slot.st||{};
  // arrivée : le titre puis la vanne apparaissent en fondu, chacun prend sa place, le tuyau se déroule quand tous sont là
  const fa=a?csClamp((u-2)/1):1, fv=a?csClamp((u-3)/1):1;
  let L=1e5, fd=1;
  if(a){const w=a.w.map(x=>x[1]);for(const x of w)if(!x.done&&csStepW(x,dt))x.done=now;
    if(!a.all&&w.every(x=>x.done))a.all=now;
    if(a.all){const s=(now-a.all)/1000;L=s*900;fd=csClamp((s-1.4)/.8);if(s>3)M.arr[b]=null;}else{L=0;fd=0;}}
  if(L>0)csHose(z,st,L,fd);
  const cur=csCur(st);
  if(fa>0)csLate(people,()=>{ctx.save();ctx.globalAlpha=fa;atPill('🚨 '+csTitle(t).slice(0,34),z.cx,(CS_Z0+.55)*T,k==='failed'?'#a8323a':'#8a1f17','#fff','bold 11px system-ui,sans-serif');ctx.restore();});
  CS_POSTES.forEach((p,j)=>{const {x,y}=z.pts[j], s=st[p.k]||'';
    if(p.gate){if(fv<=0)return;ctx.save();ctx.globalAlpha=fv;csValve(x,y,s==='ok',now);
      const boss=k==='gate'&&!!chars.find(c=>c.boss);
      if(!boss){R(ctx,x-2,y-30,4,30,'#8a8478');for(let q=0;q<4;q++)R(ctx,x-14+q*7,y-32,7,6,q%2?'#1c1c1c':'#f2c230');}
      ctx.restore();
      csLate(people,()=>{ctx.save();ctx.globalAlpha=fv;if(!boss)csPostePill(p,s,x,y+16);if(s==='gate'&&!boss&&(REDUCED_MOTION||Math.floor(now/500)%2))atBadge(x,y-44,'✋',WAIT_BG);ctx.restore();},y+2);
      atHitCs('agent',x-16,y-56,32,74,{b,k:p.k});return;}
    const aw=a&&a.w.find(q=>q[0]===j), w=aw&&aw[1];
    if(w&&!w.done){csDrawWalker(w,people,now);return;} // en route vers sa place
    const f=w?csClamp((now-w.done)/500):1; // vient d'arriver : son étiquette et son état apparaissent en fondu
    const c=csPompier(b*7+j,x,y,s==='gate'?'ok':s||'wait','down');
    if(!s){people.push([{pos:{x,y}},()=>{if(f<1){ctx.save();ctx.globalAlpha=1-f;drawChar(c,now);csHelmet(ctx,x,y,'down',false);ctx.restore();}csGrey(c,now,f);
      ctx.save();ctx.globalAlpha=f;csPostePill(p,'',x,y+16);ctx.restore();},false,null]);atHitCs('agent',x-16,y-56,32,74,{b,k:p.k});return;}
    if(s==='run'){const gr=ctx.createRadialGradient(x,y-24,4,x,y-24,46);gr.addColorStop(0,`rgba(255,246,190,${.6*f})`);gr.addColorStop(1,'rgba(255,246,190,0)');ctx.fillStyle=gr;ctx.fillRect(x-48,y-72,96,96);}
    people.push([c,null,false,()=>{csHelmet(ctx,x,y,c.dir,false);ctx.save();ctx.globalAlpha=f;
      if(s==='run'&&!REDUCED_MOTION)for(let n=0;n<4;n++){const q=((now/400)+n/4)%1;ctx.fillStyle=`rgba(120,200,255,${.9*(1-q)})`;ctx.beginPath();ctx.arc(x+16+q*26,y-34-q*6+q*q*14,2+n*.5,0,7);ctx.fill();}
      if(s==='ok')atBadge(x+16,y-50,'✓','#2f9e55');
      if(s==='err'){atBadge(x+16,y-50,'!','#d0392b');atSmoke(x,y-30,now);}
      if(cur&&cur.k===p.k&&s==='run')atBubble(x,y-66,{tri:'je trie le message…',logs:'je cherche des traces…',cause:'je remonte à la cause…',reponse:'je rédige la réponse…',relecture:'je relis…',post:'je poste en fil…'}[p.k]||'au travail…');
      csPostePill(p,s,x,y+16);ctx.restore();}]);
    atHitCs('agent',x-16,y-56,32,74,{b,k:p.k});
  });
  if(k==='failed')csLate(people,()=>atPill('🧯 en panne : relance l\'investigation',z.cx,(CS_Z1-.4)*T,'#a8323a','#fff','bold 11px system-ui,sans-serif'));
  atHitCs('bay',z.x0,d.y,z.w,(CS_Z1-CS_DY0)*T,{b});
}
function csLate(people,f,y){people.push([{pos:{x:0,y:y==null?1e6:y}},null,false,f]);}
// ---------- la salle de garde et la barre de pompier ----------
function csBoard(slots,now){ // le tableau des interventions, au mur de la salle de garde
  const T=AT_TS, x=35.6*T, y=2.1*T, w=9.8*T, h=4.4*T;R(ctx,x-6,y-6,w+12,h+12,'#3a3530');R(ctx,x,y,w,h,'#10141c');R(ctx,x,y,w,18,'#8a1f17');
  atTxt('📋 INTERVENTIONS',x+8,y+13,'#fff','bold 12px ui-monospace,Menlo,monospace','left');
  slots.forEach((s,b)=>{const c=!s?'#5d6370':s.dep?'#3fbf6a':s.s.k==='gate'?WAIT_BG:s.s.k==='failed'?'#e0614f':'#5b8def', cur=s&&!s.dep&&csCur(s.st||{});
    R(ctx,x+10,y+28+b*19,8,8,c);atTxt('B'+(b+1)+' · '+(!s?'libre':s.dep?(s.dep.posted?'feu éteint':'fin'):(csTitle(s.t).slice(0,22)+(cur?' · '+cur.i:''))),x+24,y+36+b*19,s?'#e8e2d0':'#8a93a6','12px ui-monospace,Menlo,monospace','left');});
  const n=csCalls().length, q=csWaiting();
  atTxt('📟 '+(n?plural(n,'appel','appels')+' à prendre':'aucun appel')+(q?' · '+q+' en attente de baie':''),x+10,y+h-12,n?'#ff9a8a':'#8a93a6','bold 12px ui-monospace,Menlo,monospace','left');
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
    csLate(people,()=>atPill('🃏 la garde : partie de cartes',x,y+1.7*T,'#1c2440','#bfe6ff','bold 11px system-ui,sans-serif'),y+1);}
  else csLate(people,()=>atPill('🌙 la garde dort, prête à partir',40.5*T,25.4*T,'#1c2440','#bfe6ff','bold 11px system-ui,sans-serif'),25*T);
  csPole();csLate(people,()=>atPill('⇅ RDC · 1er',CS_POLE.x,CS_POLE.y0-14,'#5a4636','#fff','bold 11px ui-monospace,Menlo,monospace'),CS_POLE.y0);
}
function csWalkers(now,dt,people){for(const w of CS_MEM.walk){if(csStepW(w,dt))w.gone=true;else csDrawWalker(w,people,now);}}
// le gyrophare de la caserne, au mur entre les baies et la salle de garde (et sur l'onglet du -1) : il tourne tant qu'un
// appel attend d'être pris ou qu'une intervention est en cours ; son faisceau balaie le sous-sol (REDUCED_MOTION : allumé, fixe)
const csAlarm=()=>csCalls().length>0||csActive().length>0;
function csBeacon(now){
  const T=AT_TS, x=34.4*T, y=1.55*T, on=csAlarm();
  R(ctx,x-12,y+6,24,6,'#3a3530');R(ctx,x-9,y+2,18,5,'#5a5a5a');
  ctx.fillStyle=on?'#e8302a':'#7a3a36';ctx.beginPath();ctx.arc(x,y+2,9,Math.PI,0);ctx.fill();
  if(!on)return;
  const a=REDUCED_MOTION?Math.PI/2:now/320, cx=Math.cos(a);
  ctx.fillStyle='#ffd0c8';ctx.beginPath();ctx.arc(x+cx*5,y-2,2.5,0,7);ctx.fill(); // le miroir qui tourne
  ctx.save();ctx.globalCompositeOperation='lighter';
  const sweep=(ang,al)=>{const r=26*T, g=ctx.createRadialGradient(x,y,4,x,y,r);g.addColorStop(0,`rgba(255,60,40,${al})`);g.addColorStop(1,'rgba(255,60,40,0)');
    ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(x,y);ctx.arc(x,y,r,ang-.22,ang+.22);ctx.closePath();ctx.fill();};
  if(REDUCED_MOTION){const g=ctx.createRadialGradient(x,y,2,x,y,60);g.addColorStop(0,'rgba(255,60,40,.5)');g.addColorStop(1,'rgba(255,60,40,0)');ctx.fillStyle=g;ctx.fillRect(x-60,y-20,120,80);}
  else{const k=Math.sin(a);if(k>0)sweep(Math.PI/2+cx*1.35,.22*k);
    const g=ctx.createRadialGradient(x,y,2,x,y,44);g.addColorStop(0,`rgba(255,60,40,${.25+.45*Math.max(0,k)})`);g.addColorStop(1,'rgba(255,60,40,0)');ctx.fillStyle=g;ctx.fillRect(x-44,y-20,88,64);}
  ctx.restore();
}
// ---------- le capitaine (le boss) : à son bureau de chef de centre, à la vanne quand une réponse attend sa validation ----------
// Vu de face derrière son bureau (comme le boss au 1er) : plaque « CHEF DE CENTRE », fauteuil rouge, radio, casque posé, corbeille
// d'appels ; à côté, le tableau de garde sur pied, un voyant par baie. Le meuble est agrandi (CS_K) ; le capitaine reste à
// l'échelle des autres personnages. CS_DESK : ses pieds à son poste.
const CS_K=1.75, CS_KB=1.35, CS_BACK=16; // échelle du bureau, du tableau de garde ; le capitaine se tient CS_BACK px derrière le bureau
const csCaptainSprite=b=>bossFloorSprite(b,'captain_sprite');
function csBayCol(slots,b,now){const s=slots[b];if(!s)return '#3d4250';if(s.dep)return '#3fbf6a';const k=s.s.k;
  return k==='gate'?(REDUCED_MOTION||Math.floor(now/450)%2?WAIT_BG:WAIT_DIM):k==='failed'?'#e0614f':'#5b8def';}
function csDesk(slots,now,calls,open){ // le bureau, devant le capitaine : dessiné après lui
  const {x,y:F}=CS_DESK, K=CS_K, q=(dx,dy,w,h,c)=>R(ctx,Math.round(x+dx*K),Math.round(F+dy*K),Math.round(w*K),Math.round(h*K),c);
  q(-56,-12,112,24,'#6e4a2c');q(-56,-14,112,4,'#8a6040');q(-56,8,112,6,'#56391f');q(-56,14,112,3,'rgba(0,0,0,.2)');
  q(-52,17,4,6,'#3e2a18');q(48,17,4,6,'#3e2a18'); // les pieds
  q(-32,-6,64,11,'#2a2a30');q(-31,-5,62,1,'#4a4a52'); // la plaque
  ctx.font='bold '+Math.round(7*K)+'px ui-monospace,Menlo,monospace';ctx.fillStyle='#f2d22a';ctx.textAlign='center';ctx.fillText('CHEF DE CENTRE',x,Math.round(F+3*K));ctx.textAlign='left';
  q(-54,-22,26,8,'#a0703f');q(-54,-22,26,2,'#b98552'); // la corbeille d'appels
  for(let k=0;k<Math.min(4,calls.length);k++)q(-52+k*5,-20-8-k*2,18,9,'#c8323a');
  ctx.fillStyle='#c9cfd6';ctx.beginPath();ctx.arc(x+40*K,F-14*K,8*K,Math.PI,0);ctx.fill();q(30,-15,20,3,'#2a2a30');q(33,-19,14,2,'#f2d22a'); // le casque posé
  q(16,-14-12,8,12,'#1c1c1c');q(18,-14-17,1.5,5,'#1c1c1c'); // la radio
  ctx.fillStyle=open?'#7dffb0':'#3d4250';ctx.beginPath();ctx.arc(x+20*K,F-19*K,1.8*K,0,7);ctx.fill();
}
function csGarde(slots,now){ // le tableau de garde sur pied, à droite du bureau : un voyant par baie
  const K=CS_KB, bx=CS_DESK.x+5.6*AT_TS, base=CS_DESK.y+10, q=(dx,dy,w,h,c)=>R(ctx,Math.round(bx+dx*K),Math.round(base+dy*K),Math.round(w*K),Math.round(h*K),c);
  q(-28,-24,3,24,'#6a655c');q(25,-24,3,24,'#6a655c'); // les pieds
  q(-34,-73,68,46,'#e9e4d8');q(-34,-73,68,3,'#8a8478');q(-34,-27,68,3,'#8a8478');
  ctx.font='bold '+Math.round(8*K)+'px ui-monospace,Menlo,monospace';ctx.fillStyle='#5a3a2a';ctx.textAlign='center';ctx.fillText('GARDE',bx,Math.round(base-61*K));ctx.textAlign='left';
  for(let b=0;b<3;b++){q(-28,-55+b*9,7,6,csBayCol(slots,b,now));q(-17,-53+b*9,30+(b*11)%18,3,'#b9b2a4');}
  atHitCs('garde',Math.round(bx-34*K),Math.round(base-73*K),Math.round(68*K),Math.round(73*K),{});
}
function csCaptain(slots,now,dt,people){
  const T=AT_TS, boss=chars.find(c=>c.boss), d=CS_DESK, F=d.y, K=CS_K, open=atOpen(), calls=csCalls();
  csGarde(slots,now);
  if(boss){const cx=d.x, f=F-CS_BACK;R(ctx,cx-20,f-50,40,34,'#5a2e2e');R(ctx,cx-20,f-50,40,4,'#723a3a');R(ctx,cx-25,f-32,6,20,'#4a2424');R(ctx,cx+19,f-32,6,20,'#4a2424'); // le fauteuil
    R(ctx,cx-25,f-32,6,2,'#6a3434');R(ctx,cx+19,f-32,6,2,'#6a3434');}
  csLate(people,()=>csDesk(slots,now,calls,open),F+2);
  csLate(people,()=>{atPill('📥 '+(calls.length?plural(calls.length,'appel','appels'):'aucun appel'),d.x-4.4*T,F+1.55*T,calls.length?'#8a1f17':'#5b6070','#fff','bold 11px system-ui,sans-serif');
    const n=csDoneToday();atPill('🧯 '+(n?plural(n,'feu éteint','feux éteints')+' aujourd\'hui':'aucun feu aujourd\'hui'),d.x+4.6*T,F+1.55*T,n?'#2f7a45':'#5b6070','#fff','bold 11px system-ui,sans-serif');},F+1.6*T);
  atHitCs('calls',Math.round(d.x-56*K),Math.round(F-30*K),Math.round(30*K),Math.round(18*K),{});
  if(!boss)return; // le soir et le week-end, il reste, comme le boss au 1er (sous l'éclairage réduit)
  const gi=slots.findIndex(s=>s&&!s.dep&&s.s.k==='gate'), home={x:d.x,y:F-CS_BACK}, target=gi<0?null:gi;
  let m=CS_MEM.boss;
  // vers la vanne : il remonte derrière son bureau, longe les baies, puis descend à la vanne
  const path=i=>{const z=CS_G[i], v=z.pts[5];return [{x:m?m.walk.pos.x:home.x,y:m?m.walk.pos.y:home.y},{x:m?m.walk.pos.x:home.x,y:(CS_Z1+.9)*T},{x:v.x,y:(CS_Z1+.9)*T},{x:v.x,y:v.y}];};
  if(!m||REDUCED_MOTION&&m.target!==target){m=CS_MEM.boss={target,walk:atWalker([target==null?home:CS_G[target].pts[5]])};}
  if(m.target!==target){m.target=target;m.walk=atWalker(target==null?[{...m.walk.pos},{x:m.walk.pos.x,y:(CS_Z1+.9)*T},{x:home.x,y:(CS_Z1+.9)*T},home]:path(target),90);}
  const arrived=atStep(m.walk,dt), p=m.walk.pos, dir=arrived?'down':m.walk.dir, home_=arrived&&target==null;
  // son dessin de capitaine : captain_sprite de la personne du boss (roster du pack) s'il est réglé et embarqué, sinon le sien
  // avec le casque du chef ; il garde son nom, sa fiche et son rôle
  const look=csCaptainSprite(boss);
  const c=Object.assign(Object.create(Object.getPrototypeOf(boss)),boss,{pos:{x:p.x,y:p.y},tile:null,dir,moving:!arrived,pose:'stand',present:true,_st:{st:target==null?'idle':'gate'},sprite:look||boss.sprite});
  people.push([c,null,false,()=>{if(!look)csHelmet(ctx,p.x,p.y,dir,true);
    if(!home_)atPill(boss.name+' · capitaine',p.x,p.y+16,'#8a1f17','#fff','bold 12px system-ui,sans-serif');
    if(arrived&&target!=null)atBubble(p.x,p.y-66,'✋ j\'ouvre la vanne ?',WAIT_TXT);}]);
  if(home_)csLate(people,()=>atPill(boss.name+' · capitaine',p.x,Math.round(F+17*K+12),'#8a1f17','#fff','bold 12px system-ui,sans-serif'),F+3); // sous le bureau
  CS_LIT.push(p);atHitCs('captain',p.x-16,p.y-56,32,60,{});
}
// ---------- la nuit, comme au RDC (floorNight) : chaque baie en intervention s'allume ; la salle de garde tant que la garde
// veille (la nuit, elle dort : sa veilleuse seulement) ; la lampe du bureau du chef de centre reste allumée ; le capitaine et
// les pompiers qui descendent la barre, courent ou remontent ont leur lumière ; hors des heures de bureau, la veilleuse ----------
const CS_NIGHT={};
function csNight(slots,people,now){
  const T_=AT_TS, open=atOpen(), walk=(CS_MEM.walk||[]).filter(w=>w.pos).map(w=>w.pos), lit=[...CS_LIT,...walk];
  const rooms=CS_G.map((z,b)=>[CS_BX[b],CS_DY1,CS_BX[b]+CS_BW-1,Math.floor(CS_Z1),!!slots[b]]).concat([[35,2,45,26,open]]);
  floorNight(CS_NIGHT,{rooms,closed:!open,track:lit,spots:[...floorPeopleSpots(people),...lit.map(q=>({x:q.x,y:q.y-26,r:42,a:.95})),
    floorBossLamp(CS_DESK.x,CS_DESK.y),{x:40.5*T_,y:23.4*T_,r:2.2*T_,a:.5,c:'rgba(255,190,120,.12)'}, // la veilleuse de la garde
    {x:CS_POLE.x,y:CS_POLE.y1-1.2*T_,r:2.2*T_,a:.6}]},now); // la barre
}
// ---------- le ménage du soir au -1 : après le 1er (atCleanVisit, 68-atelier.js), l'agent d'entretien descend la barre ----------
// Rejouable comme au 1er : tout se lit dans l'heure du plan. Il descend par la barre (le seul accès), balaie l'allée devant
// chaque baie d'un bout à l'autre, puis la salle de garde, et remonte : un quart de chaque étape à marcher, le reste à balayer.
const CS_CLEAN_DUR=25*60e3;
function csCleanVisit(c,t){const v=atCleanVisit(c,t-AT_CLEAN_DUR)||atCleanVisit(c,t);return v?{s:v.e,e:v.e+CS_CLEAN_DUR}:null;}
function csCleanStops(){
  const T_=AT_TS, pole={x:CS_PX,y:CS_POLE.y1}, st=[{p:pole,room:'la barre'}];
  CS_G.forEach((z,b)=>{const p={x:z.cx,y:CS_LANE};st.push({p,room:'la baie '+(b+1),sweep:[p,{x:z.cx-4.5*T_,y:CS_LANE},{x:z.cx+4.5*T_,y:CS_LANE},p]});});
  const g={x:CS_TABLE.x,y:CS_TABLE.y+1.6*T_};st.push({p:g,room:'la salle de garde',sweep:[g,{x:g.x-2*T_,y:g.y},{x:g.x+3*T_,y:g.y},g]});
  return st.concat([{p:pole,room:'la barre'}]);
}
function csCleanerAt(c,t){
  const v=csCleanVisit(c,t);if(!v||t<v.s||t>=v.e)return null;
  const st=csCleanStops(), n=st.length-1, k=(t-v.s)/(v.e-v.s)*n, j=Math.min(n-1,Math.floor(k)), f=k-j, a=st[j].p, b=st[j+1].p;
  if(f<.25){const q=atAlong([a,{x:a.x,y:CS_LANE},{x:b.x,y:CS_LANE},b],f/.25);return {x:q.x,y:q.y,dir:q.dir,moving:true,stop:st[j+1],v};}
  const sw=st[j+1].sweep;if(!sw)return null; // remonté par la barre
  const q=atAlong(sw,(f-.25)/.75);return {x:q.x,y:q.y,dir:q.dir,moving:false,sweeping:true,stop:st[j+1],v};
}
// ---------- thèmes (46-themes.js) au -1, comme au 1er étage ----------
function csTheme(now){
  const T_=AT_TS, y=CS_DY0*T_-4;
  if(themeIs('noel')){xmasTreeAt(CS_TABLE.x+2.6*T_,CS_TABLE.y+1.4*T_,now);
    for(let k=0;k<40;k++){ctx.fillStyle=['#ff4a4a','#ffd84a','#4aff8a','#4ac8ff'][(k+Math.floor(now/500))%4];ctx.beginPath();ctx.arc(1.2*T_+k*(33.6*T_/39),y+Math.sin(k*.9)*3,3,0,7);ctx.fill();}}
  if(themeIs('halloween'))CS_G.forEach(z=>{E('🎃',z.cx-4.2*T_,(CS_DY1+.4)*T_,14);E('🎃',z.cx+4.2*T_,(CS_DY1+.4)*T_,14);});
  if(themeIs('nouvel-an')||themeIs('saint-valentin'))[[CS_TABLE.x-1.5*T_,CS_TABLE.y-2*T_],[CS_TABLE.x+3*T_,CS_TABLE.y-2*T_]].forEach(([x,yy],k)=>balloon(themeIs('nouvel-an')?'🎈':'💗',x,yy,now,k));
}
// ---------- loupe (44-loupe.js) au -1 : l'arrivée des pompiers, la vanne, une panne, le départ du camion ----------
// Chaque événement : des points du plan (le cadre les englobe) et sa légende ; un id par fil, montré une fois.
function csLoupeEvents(){
  const out=[], M=CS_MEM, T_=AT_TS, boss=chars.find(c=>c.boss);
  const who=id=>{const t=spThreads().find(x=>x.id===id)||{};return (spWho(t.from)||'?')+' · '+(t.subject||clip(t.text||'',40));};
  M.slots.forEach((id,b)=>{if(!id)return;const z=CS_G[b], truck=atPt(z.cx,(CS_DY1-1)*T_,'','','x'), crew=y=>atPt(z.cx,y*T_,'','','x');
    const add=(k,label,pts)=>{pts[0].name=k==='cs_gate'?(boss?boss.name:'Le capitaine'):'Pompiers';pts.forEach(p=>{p._st={st:k,label};});out.push({id:k+':'+id,kind:k,cs:pts});};
    if(M.dep[b])add('cs_depart','📣 Réponse postée : le camion rentre · '+who(id),[crew(CS_R1+.5),truck]);
    else if(M.arr[b])add('cs_arrive','🚒 Départ en intervention, baie '+(b+1)+' · '+who(id),[truck,crew(CS_R2+.3)]);
    const st=M.st[b]||{};
    if(st.gate==='gate')add('cs_gate','✋ La réponse attend ta validation · '+who(id),[crew(CS_R2+.3),crew(CS_R1+.5)]);
    if(Object.values(st).includes('err'))add('cs_err','🔥 Un poste en panne · '+who(id),[crew(CS_R1+.5),crew(CS_R2+.3)]);
  });
  return out;
}
// ---------- l'image ----------
function renderCaserne(now){
  const dt=(CS_MEM.last?Math.min(.1,(now-CS_MEM.last)/1000):0)*walkBoost();CS_MEM.last=now; // rejeu rapide : comme au 1er et au RDC
  if(!CS_BG)CS_BG=csBackground();
  ctx.drawImage(CS_BG,0,0);CS_HITS=[];CS_LIT=[];
  // comme au 1er (renderAtelier) : un saut du curseur ou un passage du direct au rejeu pose la caserne sans rejouer
  const live=spLive();if(CS_MEM.lastT!=null&&(Math.abs(T-CS_MEM.lastT)>120e3||live!==CS_MEM.live)){const keep=CS_MEM.last;CS_MEM=csMem0();CS_MEM.last=keep;CS_SEEN.clear();}
  CS_MEM.lastT=T;CS_MEM.live=live;
  const slots=csSlots(now), people=[];
  slots.forEach((s,b)=>csBay(s,b,now,dt,people));
  {const cl=atCleaner(), m=cl&&csCleanerAt(cl,T); // le ménage du -1, après celui du 1er
    if(m){const a=Object.assign(Object.create(Object.getPrototypeOf(cl)),cl,{pos:{x:m.x,y:m.y},tile:null,dir:m.dir,moving:m.moving||!!m.sweeping,pose:'stand',present:true,_st:{st:'idle'}});
      const [dx,dy]={left:[-20,0],right:[20,0]}[m.dir]||[20,2];CS_LIT.push(a.pos);
      people.push([a,()=>drawCart({x:m.x+dx,y:m.y+dy}),false,()=>{if(m.sweeping)E('🧹',m.x,m.y-66,12);}]);}}
  csBoard(slots,now);csGuard(now,people);csWalkers(now,dt,people);csCaptain(slots,now,dt,people);csBeacon(now);
  people.sort((a,b)=>a[0].pos.y-b[0].pos.y).forEach(([c,d,before,after])=>{if(before&&d)d();if(c.sprite)drawChar(c,now);if(!before&&d)d();if(after)after();});
  csTheme(now); // comme au 1er : sapin et guirlande à Noël, citrouilles à Halloween, ballons
  csNight(slots,people,now);
  const hp=csPickedAt();if(hp)selHalo(hp.x,hp.y-26,AT_W,AT_H); // comme au RDC et au 1er : le plan s'assombrit autour de celui qu'on a choisi
  if(CS_SEL!=null){const b=CS_MEM.slots.indexOf(CS_SEL);if(b>=0){const z=CS_G[b];ctx.save();ctx.strokeStyle='#ffffff';ctx.lineWidth=3;ctx.setLineDash([8,6]);ctx.lineDashOffset=-now/60;ctx.strokeRect(z.x0+1,CS_DY0*AT_TS-20,z.w-2,(CS_Z1-CS_DY0)*AT_TS+24);ctx.restore();}}
  floorTitle();
}
// où est celui qu'on a choisi : un pompier d'une baie occupée, ou le capitaine (sa fiche ouverte à la caserne)
function csPickedAt(){
  if(CS_PICK){const s=CS_MEM.slots[CS_PICK.b], j=CS_POSTES.findIndex(p=>p.k===CS_PICK.k);return s&&!s.dep&&j>=0?CS_G[CS_PICK.b].pts[j]:null;}
  const b=chars.find(c=>c.boss);return b&&sel===b.key&&CS_MEM.boss?CS_MEM.boss.walk.pos:null;
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
  const h=csHitAt(e);sel=null;SEL_BACK=[];
  if(h&&h.kind==='captain'){const b=chars.find(c=>c.boss);if(b){CS_SEL=null;CS_PICK=null;select(b.key);return;}} // la même fiche qu'au RDC, dans le panneau
  CS_SEL=h&&(h.kind==='bay'||h.kind==='agent')?CS_MEM.slots[h.b]||null:null;
  CS_PICK=h&&h.kind==='agent'&&CS_SEL?{b:h.b,k:h.k}:null;
  renderSide(true);
}
function caserneHover(e){
  const h=csHitAt(e);let s='';
  const slot=h&&h.b!=null?csSlots(performance.now())[h.b]:null;
  if(h&&h.kind==='agent'){const p=CS_POSTES.find(x=>x.k===h.k), st=slot&&slot.st?slot.st[h.k]||'wait':'wait';
    s=p.i+' '+p.n+' · baie '+(h.b+1)+' · '+(p.gate?(st==='gate'?'la réponse attend ta validation : le capitaine vient ouvrir la vanne':st==='ok'?'validé':'ta validation, avant de poster'):CS_ST[st==='gate'?'ok':st][1]);}
  else if(h&&h.kind==='bay')s=slot?(slot.dep?'Baie '+(h.b+1)+(slot.dep.posted?' · réponse postée, le camion rentre':' · fin de l\'intervention, le camion rentre'):'Baie '+(h.b+1)+' · '+csTitle(slot.t)+' · de '+spWho(slot.t.from)):'Baie '+(h.b+1)+' · libre';
  else if(h&&h.kind==='pole')s='La barre de pompier : le seul accès au RDC et au 1er ; on descend en glissant, on remonte après le café';
  else if(h&&h.kind==='guard')s='La garde : l\'équipe des baies libres, prête à partir';
  else if(h&&h.kind==='captain')s=(chars.find(c=>c.boss)||{}).name+' · capitaine : ouvre la vanne (✋) quand une réponse attend sa validation ; clic : sa fiche, comme au RDC';
  else if(h&&h.kind==='calls'){const n=csCalls().length;s=n?plural(n,'appel','appels')+' à prendre : clic pour les voir':'Aucun appel à prendre';}
  else if(h&&h.kind==='board')s='Le tableau des interventions';
  else if(h&&h.kind==='garde')s='Le tableau de garde : un voyant par baie (bleu : au travail, jaune : t\'attend, rouge : en panne, vert : feu éteint, le camion rentre)';
  cv.style.cursor=h&&h.kind!=='pole'&&h.kind!=='guard'&&h.kind!=='board'&&h.kind!=='garde'?'pointer':'default';
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
  const boss=chars.find(c=>c.boss);
  // la fiche du capitaine : celle du boss, comme au RDC et au 1er ; un de ses liens qui mène ailleurs (un collègue, un agent, une
  // fiche du RDC) redescend au RDC, où il s'ouvre ; ses tickets et ses PR ouvrent le Kanban, en fenêtre, à n'importe quel étage
  if(sel!=null&&!(boss&&sel===boss.key)){setFloor(0);return;}
  if(sel!=null){drawSide(side);return;}
  const box=document.createElement('div');box.className='atelier caserne';side.appendChild(box);
  const slots=csSlots(performance.now()), b=CS_SEL!=null?slots.findIndex(x=>x&&!x.dep&&x.t.id===CS_SEL):-1;
  if(b>=0){box.innerHTML=csFicheHtml(slots[b],b);box.querySelector('.at-back').addEventListener('click',()=>{CS_SEL=null;CS_PICK=null;renderSide(true);});box.appendChild(spCard(slots[b].t));return;}
  box.innerHTML=caserneListHtml(slots);
  box.querySelectorAll('.at-room').forEach(x=>x.addEventListener('click',()=>{CS_SEL=x.dataset.id;CS_PICK=null;renderSide(true);}));
  const calls=csCalls();
  if(calls.length)for(const t of calls)box.appendChild(spCard(t));else box.insertAdjacentHTML('beforeend','<div class="mut">Aucun appel.</div>');
}
// ---------- mode TV : les baies à la place de « Qui fait quoi » ----------
function tvCaserneHtml(){
  const slots=csSlots(performance.now()), calls=csCalls();
  return '<h2>Caserne Support</h2>'+slots.map((x,b)=>{
    if(!x||x.dep)return `<div class="tw ag"><span class="wt"><span class="wn">Baie ${b+1}<span class="ws">${x?(x.dep.posted?'feu éteint':'fin'):'libre'}</span></span><span class="ww nt">${x?(x.dep.posted?'Réponse postée dans Teams':'Le camion rentre'):atOpen()?'La garde joue aux cartes':'La garde dort'}</span></span></div>`;
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
  if(prep){prep(d);SUPPORT=JSON.parse(JSON.stringify(d));csReset();csSlots(performance.now());loupeNoteSeen();}
  mut(d,new Date(s).toISOString(),s);SUPPORT=d;};}
const csFreeOne=d=>{const l=d.threads.filter(t=>spState(t).k in CS_LIVE);if(l.length>=CS_BAYS){const t=l.sort((a,b)=>ms(b.run&&b.run.at)-ms(a.run&&a.run.at))[0];t.state='skipped';}};
const csIn=(d,k)=>d.threads.find(t=>spState(t).k===k);
function csGalleryScenes(){
  const fam='Sous-sol', ok=true, out=[];
  const demoRun=(id,at,postes)=>({run:'demo-'+id,status:'Running',at,disc:null,version:0,postes});
  out.push({fam,ico:'📟',n:'Un appel arrive',d:'Le voyant du tableau clignote, l\'appel rejoint la pile sur le bureau du capitaine',w:'Un nouveau message dans le canal Support',ok,
    play:{len:15e3,speed:1,setup:csDemo((d,at)=>{d.threads.push({id:'demo-call',from:'Halpert, Jim',at,text:'Le formulaire de contact renvoie une erreur 500 depuis ce matin.',subject:'Formulaire de contact en 500',url:null,state:'new',run:null,mine:null,replies:0,last_at:at});})}});
  out.push({fam,ico:'🚒',n:'Une intervention démarre',d:'Le rideau d\'une baie se lève, le camion sort, les pompiers descendent la barre un par un et courent à leur place, puis le tuyau se déroule jusqu\'au Tri',w:'« 🔎 Investiguer » sur un appel',ok,
    play:{len:32e3,speed:1,setup:csDemo((d,at)=>{d.threads.push({id:'demo-start',from:'Martin, Angela',at,text:'Les reçus PDF des commandes sont vides.',subject:'Reçus PDF vides',url:null,state:'run',run:demoRun('start',at,{tri:'run'}),mine:null,replies:0,last_at:at});},csFreeOne)}});
  out.push({fam,ico:'💧',n:'Le tuyau avance',d:'Un pompier a fini (✓), le tuyau se remplit jusqu\'au poste suivant qui se met à arroser',w:'Chaque poste qui finit',ok,
    play:{len:12e3,speed:1,setup:csDemo(d=>{const t=csIn(d,'run');if(!t)return;const st=csStates(t), ks=CS_POSTES.filter(p=>!p.gate).map(p=>p.k), j=Math.max(0,ks.findIndex(k=>st[k]==='run'));
      const p={};ks.slice(0,j+1).forEach(k=>{p[k]='ok';});p[ks[Math.min(ks.length-2,j+1)]]='run';t.run.postes=p;},()=>{})}});
  out.push({fam,ico:'✋',n:'À toi de valider',d:'La réponse est relue : le capitaine quitte son bureau et va ouvrir la vanne de la baie',w:'La réponse proposée attend ta validation',ok,
    play:{len:20e3,speed:1,setup:csDemo(d=>{const t=csIn(d,'run');if(!t)return;t.state='gate';t.run.status='WaitingApproval';t.run.postes=null;t.run.draft=t.run.draft||'🔎 Cause : …';CS_MEM.boss={target:null,walk:atWalker([{x:CS_DESK.x,y:CS_DESK.y-CS_BACK}])};},
      d=>{for(const t of d.threads)if(t.state==='gate'){t.state='run';t.run=Object.assign(t.run||{},{status:'Running',postes:{tri:'ok',logs:'ok',cause:'ok',reponse:'ok',relecture:'run'}});}})}});
  out.push({fam,ico:'📣',n:'Le camion part',d:'Réponse postée dans Teams : le tuyau s\'enroule, le camion rentre et le rideau se ferme sur lui ; l\'équipe prend un café et remonte la barre',w:'Tu valides la réponse',ok,
    play:{len:34e3,speed:1,setup:csDemo((d,at)=>{const t=csIn(d,'gate');if(!t)return;t.state='done';t.mine={at,text:(t.run&&t.run.draft)||'…'};},()=>{})}});
  out.push({fam,ico:'🧯',n:'Intervention en panne',d:'Un poste a planté : fumée, le tuyau s\'arrête là, la baie attend une relance',w:'Un poste échoue (API d\'un agent indisponible…)',ok,
    play:{len:15e3,speed:1,setup:csDemo(d=>{const t=csIn(d,'run');if(!t)return;const st=csStates(t), cur=csCur(st);t.state='failed';t.run.status='Failed';t.run.postes={...st,[cur?cur.k:'tri']:'err'};},()=>{})}});
  out.push({fam,ico:'🌙',n:'La garde de nuit',d:'Le soir et le week-end, comme au RDC : chaque baie en intervention s\'allume, la garde dort sur les lits de camp sous sa veilleuse, la lampe du chef de centre reste allumée',w:'Hors des heures de bureau',ok,
    play:{len:20e3,speed:60,setup:s=>{const n=parisMidnight(s)+22.5*36e5;T=n;SCENE_DEMO.e=n+20e3*60;}}});
  return out;
}
