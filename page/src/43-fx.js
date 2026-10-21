// ---------- petites scènes de 3 s : succès débloqué, éclosion, changement de stade (canard d'équipe), agent rétabli ----------
// (et une de 10 à 13 s : la soucoupe-mère d'un ticket entré dans le sprint en cours de route, en bas du fichier)
// Chaque événement est daté par les données (fxEvents) : la scène se joue une fois quand l'heure affichée passe sa date (direct
// ou rejeu ; le rejeu s'arrête déjà sur la loupe), FX_MS d'animation puis FX_HOLD de bulle, à la vitesse réelle. Rien quand on
// fait glisser l'heure ; le premier passage note ce qui est déjà en cours sans le rejouer (comme la loupe).
const FX_MS=3000, FX_HOLD=4000, FX_WIN=10*60e3; // FX_WIN : depuis combien de temps (heure des données) un événement compte encore
const FX={seen:null,cur:new Map(),last:0};
const FX_WORKING=['work','srv','meet']; // les agents qui applaudissent : ceux au travail
// changements de stade du sprint en cours : quand le cumul des points terminés passe un seuil (et la mue au début du sprint)
let FX_STAGES=null;
function duckStageTimes(){
  const D=DUCKGAME, sp=(TEAM&&TEAM.sprint)||{}; if(!D||!D.target||!TEAM)return [];
  const key=[D.generated_at,D.target,sp.name,TEAM.generated_at||''].join('|');
  if(FX_STAGES&&FX_STAGES.key===key)return FX_STAGES.list;
  const all=[...TEAM.people.flatMap(p=>p.tickets||[]),...(TEAM.unassigned||[])].filter(x=>x.cat==='done'&&x.since).sort((a,b)=>ms(a.since)-ms(b.since));
  const idx=pct=>{let i=0;DUCK_STAGES.forEach((s,k)=>{if(pct>=s.at)i=k;});return i;};
  const list=[], st=ms(sp.start);
  if(st)list.push({at:st,from:'bain',to:'oeuf',mue:true});
  let pts=0,cur=0;
  for(const x of all){pts+=+x.points||0;const i=idx(pts/D.target);if(i>cur){list.push({at:Math.max(ms(x.since),st||0),from:DUCK_STAGES[cur].id,to:DUCK_STAGES[i].id});cur=i;}}
  return (FX_STAGES={key,list}).list;
}
// un agent sort de panne : un run réussi juste après un échec qui l'avait envoyé aux toilettes (moins de 40 min, ou alarme)
function agentRecoveries(c){
  const ids=new Set(c.runs.map(r=>r.run)), top=c.runs.filter(r=>!(r.parent&&ids.has(r.parent))&&r._ve), out=[];
  for(let i=1;i<top.length;i++){
    const r=top[i]; if(r.status!=='Success')continue;
    let n=0;for(let j=i-1;j>=0&&(top[j].status==='Failed'||top[j].status==='Cancelled');j--)n++;
    if(n&&(n>=ALARM_FAILS||r._s-top[i-1]._ve<40*60e3))out.push({at:r._ve,run:r.run});
  }
  return out;
}
function fxEvents(t){
  const out=[], recent=at=>at&&at<=t&&t-at<FX_WIN;
  if(DUCKGAME){
    const T_=DUCKGAME.trophies||{};
    for(const x of DUCK_TROPHIES){const s=T_[x.id];if(s&&s.ok&&recent(ms(s.at)))out.push({id:'trophy:'+x.id+':'+s.at,kind:'trophy',at:ms(s.at),tr:x});}
    for(const s of duckStageTimes())if(recent(s.at))out.push({id:'stage:'+s.to+':'+s.at,kind:s.from==='oeuf'&&s.to==='caneton'?'hatch':'stage',at:s.at,...s});
    const sp=(TEAM&&TEAM.sprint)||{}, last=DUCKGAME.sprints[0];
    if(last&&last.held&&recent(ms(sp.start))&&DUCKGAME.sprint&&DUCKGAME.sprint.name===sp.name)out.push({id:'kid:'+sp.name,kind:'kid',at:ms(sp.start)});
  }
  for(const c of chars)if(!c.person&&!c.visitor&&!c.guest&&c.runs)
    for(const r of agentRecoveries(c))if(recent(r.at))out.push({id:'recover:'+r.run,kind:'recover',at:r.at,c});
  if(!REDUCED_MOTION)for(const u of ufoLandings())if(recent(u.at))out.push({id:'ufo:'+u.keys[0]+':'+u.at,kind:'ufo',...u});
  return out;
}
// à chaque image (avant le rendu) : nouvelles scènes, fin des anciennes
function fxFrame(now){
  if(!DATA||(mode==='pause'&&!LOUPE.resume)){FX.seen=null;FX.cur.clear();return;} // on fait glisser l'heure
  if(mode==='play'||now-FX.last>250){
    FX.last=now;const evs=fxEvents(T);
    if(FX.seen)for(const e of evs)if(!FX.seen.has(e.id)&&!FX.cur.has(e.id))FX.cur.set(e.id,{...e,t0:now});
    FX.seen=new Set(evs.map(e=>e.id));
  }
  for(const [id,e] of FX.cur)if(now-e.t0>(e.kind==='ufo'?ufoPlan(e).ms:FX_MS+FX_HOLD))FX.cur.delete(id);
}
const fxP=(e,now)=>Math.min(1,(now-e.t0)/FX_MS); // avancement de l'animation, 0 à 1
const fxOf=kind=>[...FX.cur.values()].find(e=>e.kind===kind);
// l'allure du canard pendant une scène : l'accessoire qui tombe n'est pas encore sur lui, l'ancien stade jusqu'au « pouf »
function fxDuckLook(look,now){
  const tr=fxOf('trophy'), st=fxOf('stage')||fxOf('hatch'), kid=fxOf('kid');
  let l=look;
  if(tr&&fxP(tr,now)<1)l={...l,acc:l.acc.filter(a=>a!==tr.tr.acc)};
  if(st){const p=fxP(st,now);if(p<(st.kind==='hatch'?.7:.5))l={...l,stage:st.from,acc:st.from==='oeuf'?[]:l.acc};}
  if(kid&&fxP(kid,now)<.7)l={...l,kids:Math.max(0,l.kids-1)};
  return l;
}
function fxBubble(x,y,txt,col){
  ctx.font='bold 11px sans-serif';const w=ctx.measureText(txt).width+12;
  ctx.fillStyle='#ffffff';ctx.strokeStyle=col;ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(x-w/2,y-16,w,16,5);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.moveTo(x-3,y);ctx.lineTo(x,y+4);ctx.lineTo(x+3,y);ctx.fill();
  ctx.fillStyle=col;ctx.textAlign='center';ctx.fillText(txt,x,y-4);ctx.textAlign='left';
}
function fxSparkles(x,y,r,n,a){for(let i=0;i<n;i++){const t=i/n*Math.PI*2;ctx.fillStyle=`rgba(255,224,102,${a})`;const sx=x+Math.cos(t)*r,sy=y+Math.sin(t)*r*.7;ctx.fillRect(sx-2,sy,5,1);ctx.fillRect(sx,sy-2,1,5);}}
// par-dessus le canard : l'accessoire qui tombe, l'œuf qui se fend, le nuage, les étincelles, la bulle
function fxDrawDuck(x,y,now){
  const s=DUCK_SCALE, top=y-Math.round(22*s)-14;
  const tr=fxOf('trophy');
  if(tr){const p=fxP(tr,now);
    if(p<1){const yy=y-Math.round(60*s*(1-p));for(const [lx,ly,w,h,c] of DG_LAYERS[tr.tr.acc].front){ctx.fillStyle=DG_C[c];ctx.fillRect(x+(lx-12)*s,yy+(ly-22)*s,w*s,h*s);}
      ctx.fillStyle='rgba(255,224,102,.8)';for(let i=1;i<4;i++)ctx.fillRect(x-1,yy-Math.round(18*s)-i*7,2,4);}
    else{fxSparkles(x,y-12*s,16*s,10,Math.max(0,1-(now-tr.t0-FX_MS)/FX_HOLD));fxBubble(x,top,'🏆 '+tr.tr.name+' !','#9a6a00');}
  }
  const st=fxOf('stage');
  if(st){const p=fxP(st,now);
    if(p>.25&&p<.75){ctx.fillStyle='rgba(255,255,255,.95)';for(const [dx,dy,r] of [[0,-14,12],[-10,-8,9],[10,-8,9],[-6,-22,8],[7,-22,8],[0,-4,9]]){ctx.beginPath();ctx.arc(x+dx*s/1.3,y+dy*s/1.3,r*s/1.3,0,7);ctx.fill();}
      ctx.fillStyle='#8a8a8a';ctx.font='bold 10px sans-serif';ctx.textAlign='center';ctx.fillText('POUF',x,y-Math.round(9*s));ctx.textAlign='left';}
    if(p>=.75){fxSparkles(x,y-12*s,16*s,10,1);fxBubble(x,top,st.mue?'Nouveau sprint : il mue':(DUCK_STAGES.find(d=>d.id===st.to)||{}).name+' !','#9a6a00');}
  }
  const h=fxOf('hatch');
  if(h){const p=fxP(h,now);
    if(p<.7){if(p>.35){ctx.strokeStyle='#7a5a20';ctx.lineWidth=1;ctx.beginPath();const cy=y-Math.round(9*s);for(let i=0;i<6;i++)ctx.lineTo(x-6*s+i*2.4*s,cy+(i%2?2:0)*s);ctx.stroke();fxBubble(x,top,'crac !','#9a6a00');}}
    else{ctx.fillStyle='#fff4d6';ctx.strokeStyle='#b39a68';ctx.lineWidth=.8;
      for(const [ax,ay] of [[-12,-18],[10,-20]]){ctx.beginPath();ctx.moveTo(x+ax*s,y+ay*s);ctx.lineTo(x+(ax+4)*s,y+(ay-5)*s);ctx.lineTo(x+(ax+7)*s,y+ay*s);ctx.closePath();ctx.fill();ctx.stroke();}
      fxSparkles(x,y-12*s,16*s,8,1);fxBubble(x,top,'🐣 Caneton !','#9a6a00');}
  }
}
const fxDuckBusy=()=>[...FX.cur.values()].some(e=>e.kind!=='recover'&&e.kind!=='ufo');
// l'œuf qui tremble avant d'éclore : à la place du dessin du canard
function fxDuckWobble(now){const h=fxOf('hatch');return h&&fxP(h,now)<.7?Math.sin(now/45)*.15:0;}
// un caneton naît juste derrière lui (début d'un sprint qui suit un sprint tenu) : un petit œuf qui tremble, puis il rejoint la file
function fxDrawKid(x,y,now){
  const k=fxOf('kid'); if(!k)return; const p=fxP(k,now);
  if(p<.7){ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(now/45)*.15);ctx.scale(DUCK_SCALE*.6,DUCK_SCALE*.6);ctx.drawImage(duckGameImg('front','oeuf'),-12,-22);ctx.restore();}
  else fxBubble(x,y-Math.round(16*DUCK_SCALE),'🐣','#9a6a00');
}
// au-dessus des personnages : l'agent rétabli et les applaudissements des agents au travail
function fxOverlay(now){
  for(const e of FX.cur.values()){
    if(e.kind!=='recover'||!e.c||!e.c.pos)continue;
    fxBubble(e.c.pos.x,e.c.pos.y-62,'✅ Rétabli !','#2e7d4f'); // au-dessus de sa propre bulle (☕ en sortant)
    if(now-e.t0<FX_MS+FX_HOLD/2)for(const c of chars)if(c!==e.c&&!c.person&&!c.visitor&&!c.guest&&c.present&&c.pos&&c._st&&FX_WORKING.includes(c._st.st))
      fxBubble(c.pos.x,c.pos.y-44-(Math.floor((now-e.t0)/250)%2?2:0),'👏','#2e7d4f');
  }
}
// ---------- soucoupe-mère : un ticket entre dans le sprint après son démarrage (team.events, kind sprint_in, #89) ----------
// La lumière baisse, une ombre glisse, la soucoupe va chercher la facilitatrice (roleKind sm) là où elle est, la dépose avec
// le ticket devant le mur Kanban (emplacement kanban du plan) : elle le range dans « à faire », « +13 pts » sur le mur, bulle
// d'annonce, puis la soucoupe repart et elle reste au mur. Déjà au mur : la soucoupe y vient et le ticket descend seul jusqu'à
// elle ; absente ou pas de facilitatrice : le ticket descend seul. Des tickets ajoutés coup sur coup (moins de 5 min d'écart)
// font une seule visite. Loupe au dépôt (44-loupe.js). Coupé par « réduire les animations ».
let UFO_M={};
function ufoLandings(){
  if(UFO_M.t===TEAM)return UFO_M.l;const l=[];
  for(const e of ((TEAM&&TEAM.events)||[]).filter(e=>e.kind==='sprint_in').sort((a,b)=>ms(a.t)-ms(b.t))){
    const t=ms(e.seen||e.t),u=l[l.length-1]; // seen : vue en retard par le cron équipe (37-scenes.js, teamMoves)
    if(u&&t-u.end<3e5){u.end=t;if(!u.keys.includes(e.key)){u.keys.push(e.key);u.pts+=+e.points||0;}}
    else l.push({at:t,end:t,keys:[e.key],pts:+e.points||0});
  }
  UFO_M={t:TEAM,l};return l;
}
const ufoSm=()=>{const c=smChar();return c&&c.pos&&c._st&&!['off','absent','gone'].includes(c._st.st)?c:null;};
// emplacement de dépôt : la case du milieu de l'emplacement kanban (le milieu du plan sans emplacement)
function ufoSpot(){const s=((LAYOUT.spots||{}).kanban||[]).slice().sort((a,b)=>a[0]-b[0])[0|((LAYOUT.spots||{}).kanban||[]).length/2];
  return s?{x0:s[0],y0:s[1],...tileCenter(s[0],s[1])}:tileCenter(COLS>>1,ROWS>>1);}
// figé au début de la visite : qui, d'où (pick : on va la chercher), durée, début du dépôt (A, fraction de la visite)
function ufoPlan(u){
  if(u.plan)return u.plan;const sm=ufoSm(),d=ufoSpot(),wall=!!sm&&sm._st.zone==='kanban'&&!sm.moving,pick=!!sm&&!wall;
  return u.plan={sm,d,pick,from:pick?{x:sm.pos.x,y:sm.pos.y}:d,ms:pick?13e3:1e4,A:pick?.4:.12};
}
const ufoHides=c=>{const u=fxOf('ufo');return !!u&&c===ufoPlan(u).sm;}; // pendant la visite, la scène la dessine
// ellipse en lignes de pixels (vue de trois quarts) ; top : la moitié du haut seulement
function ufoOval(x,y,a,b,col,top,st=2){for(let dy=-b;dy<(top?0:b);dy+=st){const t=(dy+st/2)/b,w=Math.round(a*Math.sqrt(Math.max(0,1-t*t))/2)*2;if(w>0)R(ctx,x-w,y+dy,w*2,st,col);}}
function ufoSaucer(x,y,now,emit){
  [[8,124,28,'#2b3246'],[0,130,26,'#4a5470'],[-4,124,20,'#6c7894'],[-8,108,14,'#8d98b2']].forEach(([o,a,b,c])=>ufoOval(x,y+o,a,b,c));
  R(ctx,x-130,y-1,260,3,'#323a52');ufoOval(x,y-10,44,30,'#5e9fc4',1);ufoOval(x,y-12,36,25,'#8fd0ee',1); // arête, dôme
  R(ctx,x-20,y-32,6,10,'#e8f8ff');R(ctx,x-13,y-35,4,4,'#e8f8ff'); // reflet
  for(let i=0;i<14;i++){const a=i/14*Math.PI*2+now/700;if(Math.sin(a)>-.15) // couronne de feux qui tourne : ceux de devant
    R(ctx,x+Math.cos(a)*120-3,y+1+Math.sin(a)*23,6,4,(i+Math.floor(now/180))%4?(i%2?'#ffb43a':'#ff6a3a'):'#fff6c0');}
  ufoOval(x,y+32,36,6,emit?'#d8ffe8':'#3a4258');if(emit)ufoOval(x,y+32,22,4,'#fff'); // émetteur
}
function ufoBeam(x,top,bot,now,a){
  ctx.globalAlpha=Math.max(0,a);
  for(let y=top;y<bot;y+=2)R(ctx,x-14-30*(y-top)/(bot-top),y,28+60*(y-top)/(bot-top),2,`rgba(190,255,215,${Math.floor((y+now/30)/6)%2?.3:.2})`);
  ufoOval(x,bot,92,12,'rgba(200,255,220,.35)');ctx.globalAlpha=1;
}
const ufoCard=(x,y)=>{R(ctx,x-9,y-6,18,13,'#b5481c');R(ctx,x-8,y-5,16,11,'#fff');R(ctx,x-6,y-3,12,2,'#b5481c');R(ctx,x-6,y+1,8,2,'#e0a080');};
const ufoStand=(c,x,y,f,a=1)=>{const img=spriteOf(c);if(ready(img)){ctx.globalAlpha=a;ctx.drawImage(img,f*64,256,64,64,x-32,y-60,64,64);ctx.globalAlpha=1;}};
const ufoSay=u=>'🛸 '+(u.keys[1]?u.keys.length+' tickets entrent':shortKey(u.keys[0])+' entre')+' dans le sprint'+(u.pts?' · '+u.pts+' pts':'');
// bubble faux : au-dessus du voile de nuit, sous les bulles ; vrai : la bulle d'annonce
function ufoDraw(now,bubble){
  const u=fxOf('ufo');if(!u)return;
  const {sm,d,pick,from:s,ms:D,A}=ufoPlan(u),p=Math.min(1,(now-u.t0)/D),k=(a,b)=>Math.min(1,Math.max(0,(p-a)/(b-a))),q=a=>A+(1-A)*a;
  if(bubble){if(p>q(.62)&&p<q(.82))fxBubble(d.x,d.y-(sm?62:38),ufoSay(u),'#b5481c');return;}
  const hy=Math.max(80,(KANR?KANR.y:d.y)-80),sy=Math.max(80,s.y-150);
  ctx.fillStyle=`rgba(10,12,30,${.45*k(0,.08)*(1-k(q(.9),q(.98)))})`;ctx.fillRect(0,0,W,H); // la lumière baisse
  if(p<.16){ctx.globalAlpha=.35*(1-k(.12,.16));ufoOval(W+120-(W+120-s.x)*k(0,.12),s.y+10,190,34,'#05060c',0,4);ctx.globalAlpha=1;} // l'ombre
  let x=d.x,y=hy; // trajet : au-dessus d'elle, traversée en arc, au-dessus du mur, départ en haut à gauche
  if(!pick)y=-60+(hy+60)*k(0,A);
  else if(p<.3){x=s.x;y=-60+(sy+60)*k(.04,.16);}
  else if(p<A){const f=k(.3,A);x=s.x+(d.x-s.x)*f;y=sy+(hy-sy)*f-50*Math.sin(f*Math.PI);}
  if(p>q(.86)){const f=k(q(.86),q(.98));x=d.x-160*f;y=hy-(hy+120)*f;}
  if(pick){ // prise en charge : elle se lève et monte dans le faisceau
    if(p<.3)ufoBeam(s.x,y+36,s.y+8,now,Math.min(k(.16,.19),1-k(.28,.3)));
    if(p<.29)ufoStand(sm,s.x,s.y-(s.y-y-44)*k(.19,.28),2,1-k(.25,.29));
  }
  if(p>q(.02)&&p<q(.82))ufoBeam(d.x,y+36,d.y+8,now,Math.min(k(q(.02),q(.06)),1-k(q(.78),q(.82))));
  const top=y+44,land=k(q(.05),q(.2));
  if(sm&&(p>q(.05)||!pick)){ // devant le mur : de face, vers le mur pour ranger le ticket, de face pour l'annonce
    ufoStand(sm,d.x,pick?top+(d.y-top)*land:d.y,p>q(.3)&&p<q(.45)?0:2);
    if(pick&&land>=1&&d.x0!=null){sm.pos={x:d.x,y:d.y};sm.tile=[d.x0,d.y0];sm.path=[];sm.target=null;} // elle reste au mur après la visite
  }
  if(p>q(.05)&&p<q(.3))ufoCard(d.x+(sm&&(pick||land>=1)?14:0),pick&&sm?top+(d.y-top)*land-30:top+(d.y-(sm?30:6)-top)*land);
  if(!KANR)return ufoSaucer(x,y,now,p>q(.02)&&p<q(.8)||pick&&p>.16&&p<.3);
  const t=kanbanCols()[0].list,j=Math.max(0,t.findIndex(e=>e.key===u.keys[0])),sx=KANR.x+6+j%3*6,sl=KANR.y+11+Math.floor(j/3)*5;
  if(p>=q(.3)&&p<q(.45)){const f=k(q(.3),q(.45)),o=d.x+(sm?14:0);ufoCard(o+(sx-o)*f,d.y-30+(sl-d.y+30)*f-24*Math.sin(f*Math.PI));} // vers « à faire »
  if(p>=q(.45)){R(ctx,sx-4,sl-4,9,8,Math.floor(now/250)%2?'#ff8a1c':'#fff'); // il clignote sur le mur, « +13 pts » au-dessus
    if(p<q(.72)){const fy=KANR.y-8-12*k(q(.45),q(.53)),txt=u.pts?'+'+u.pts+' pts':'+'+u.keys.length+' ticket'+(u.keys[1]?'s':'');
      ctx.font='bold 16px ui-monospace,Menlo,monospace';ctx.textAlign='center';ctx.globalAlpha=1-k(q(.68),q(.72));ctx.lineWidth=3;ctx.strokeStyle='#fff';
      ctx.strokeText(txt,KANR.x+KANR.w/2,fy);ctx.fillStyle='#d2560f';ctx.fillText(txt,KANR.x+KANR.w/2,fy);ctx.globalAlpha=1;ctx.textAlign='left';}}
  if(y>-60)ufoSaucer(x,y,now,p>q(.02)&&p<q(.8)||pick&&p>.16&&p<.3);
}
// loupe : dès le dépôt, cadrée sur la soucoupe, la facilitatrice et le mur (44-loupe.js)
function ufoLoupeEvents(now){
  const u=fxOf('ufo');if(!u)return [];const {sm,d,A,ms:D}=ufoPlan(u);if((now-u.t0)/D<A)return [];
  const st={st:'ufo',label:sm?sm.name+' le range dans « à faire »':'Rangé dans « à faire »'},hy=Math.max(80,(KANR?KANR.y:d.y)-80);
  return [{id:u.id,kind:'ufo',cs:[{key:sm?sm.key:'',name:ufoSay(u).slice(3),pos:{x:d.x-2*TS,y:d.y},_st:st},{key:'',name:'',pos:{x:d.x+2*TS,y:hy+2*TS},_st:st}]}];
}
