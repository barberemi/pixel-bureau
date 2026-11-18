// ---------- 2e étage : la file de la salle de revue ----------
// Le cron des revues retient plusieurs PR à chaque passage, mais Kronn les relit l'une après l'autre (son foreach est
// séquentiel) : la PR lue occupe le premier bureau, les autres attendent. Bernard monte la fournée sur son transpalette,
// vide au passage la corbeille du passage d'avant et pose une palette par PR dans l'entrepôt, en haut du couloir (une zone
// au sol, sans murs, bordée d'une bande jaune et noire), dans l'ordre du cron (quatre places, puis « +n ») ; une revue en
// panne y reste, en rouge. Un relecteur va chercher le dossier de la première palette, les autres avancent d'une place ;
// l'avis posté, il tamponne le dossier (le verdict) et le pose dans la corbeille « Postées ». Les auteurs attendent dans la
// salle d'attente, en bas, une chaise par personne et une pancarte qui compte ses PR restantes : un auteur reste au bureau si sa
// PR suivante est la prochaine de l'entrepôt, retourne s'asseoir si quelqu'un passe avant, ne redescend qu'après sa dernière
// PR, ses verdicts au-dessus de la tête. Rien n'apparaît d'un coup ; en arrivant à l'étage, après un saut du curseur ou
// avec REDUCED_MOTION, tout est posé. Une revue à la demande ne passe pas par la file : elle prend un autre bureau.
// Données : REDACTION.revue (workflows/redaction_snapshot.py : les PR retenues par passage du cron, les verdicts) et les
// runs des revues (DATA.runs, leur parent est le passage du cron). Dessiné par rdRevue (68-redaction.js).
const RVF_TS=AT_TS, RVP=(x,y)=>({x:x*RVF_TS,y:y*RVF_TS});
// stairLow : derrière la porte de l'escalier, hors du plan (RD_STAIR, 68-redaction.js) ; stair : juste devant ; hall : le
// palier, devant la porte de la revue (door, puis in) ; stand : Bernard garé sous l'entrepôt, à droite du distributeur ;
// pick : le relecteur sous la première palette ; relx, col : les colonnes du relecteur et des auteurs, le long du mur, à
// gauche du premier bureau ; basket, bk : la corbeille « Postées », sous le bureau de droite (on la rejoint par l'allée
// sous les bureaux) ; rely, lane : leurs allées au-dessus de la salle d'attente
const RV_MID=(RD_X1+RD_VX)/2;
const RVF={stairLow:RVP(RV_MID,RD_ROWS+1.9),stair:RVP(RV_MID,RD_ROWS-.6),hall:RVP(RV_MID,RD_HY),door:RVP(RD_VX+.2,RD_HY),in:RVP(RD_VX+1.4,RD_HY),
  desk:{x:rvDeskX(0),y:RV_FEET},face:{x:rvDeskX(0),y:RV_FEET+2.3*RVF_TS},bench:RVP(37.6,18.7),
  stand:RVP(RV_MID+1.65,7.6),pick:RVP(RV_MID-1.25,7.3),basket:RVP(36.5,15),bk:RVP(35.4,15),relx:22.3*RVF_TS,rely:15.8*RVF_TS,
  col:22.8*RVF_TS,lane:16.4*RVF_TS};
RVF.park={x:RVF.stand.x,y:RVF.stand.y+36};
// l'entrepôt : une zone au sol en haut du couloir, sans murs, bordée d'une bande de sécurité ; quatre places de palette (deux
// rangées de deux, dans l'ordre de lecture), la dernière dit « +n » s'il y en a plus
const RVF_E={x0:RD_X1*RVF_TS+10,x1:RD_VX*RVF_TS-10,y0:2.9*RVF_TS,y1:2.9*RVF_TS+116};
const rvfSlot=k=>({x:RV_MID*RVF_TS+(k%2?1.25:-1.25)*RVF_TS,y:RVF_E.y0+48+(k>>1)*48});
const RVF_V={approve:['✅','#2f9e55'],comment:['💬','#d08a12'],request_changes:['🔧','#c0392b'],err:['⚠','#a8323a']};
const RVF_WALK=105, RVF_FILE=600, RVF_FLY=500, RVF_SLOTS=4;
const rvfChair=j=>RVP(23.4+j*2,18.1);
const rvCronWf=w=>!!w&&(CFG.revue_cron_wf||[]).includes(String(w).slice(0,8));
const rvfOn=()=>!!((CFG.revue_cron_wf||[]).length||DEMO);
const rvfData=()=>(REDACTION&&REDACTION.revue)||{batches:{},verdicts:{}};
// le passage du cron en cours à l'heure T : le dernier parti qui a retenu des PR (la démo : son heure dans starts)
function rvfBatch(){
  const d=rvfData(), bs=d.batches||{}, runs=((DATA&&DATA.runs)||[]).filter(r=>rvCronWf(r.wf)&&bs[r.run]&&r._s<=T).map(r=>({run:r.run,s:r._s}));
  for(const k of Object.keys(d.starts||{}))if(bs[k]&&ms(d.starts[k])<=T&&!runs.some(r=>r.run===k))runs.push({run:k,s:ms(d.starts[k])});
  const b=runs.sort((a,c)=>c.s-a.s)[0];if(!b)return null;
  return {...b,prs:bs[b.run].map(([repo,n,author])=>({repo,n:+n,author:String(author||''),key:repo+'#'+n}))};
}
// l'état voulu à l'heure T : les dossiers qui attendent (dans l'ordre), la PR lue, les revues finies et leur verdict
function rvfState(){
  const b=rvfBatch();if(!b)return null;
  const kids=rvRuns().filter(r=>r.parent===b.run), vs=rvfData().verdicts||{}, queue=[], done=[];let reading=null;
  for(const p of b.prs){
    const r=kids.find(x=>String((x.vars||{})['current_task.number'])===String(p.n)&&String((x.vars||{})['current_task.repo'])===p.repo);
    if(!r||r._s>T){queue.push(p);continue;}
    const ended=r._e?r._e<=T:!RUN_ACTIVE.includes(r.status);
    if(!ended&&!reading)reading={...p,r};else if(ended)done.push({...p,r,v:r.status==='Success'?(vs[r.run]||'comment'):'err'});
  }
  return {b,queue,reading,done};
}
// où chacun doit être : l'auteur de la PR lue au bureau, les autres auteurs qui ont encore une PR à l'entrepôt sur une chaise
function rvfSpots(st){
  const out={};if(!st)return out;
  if(st.reading)out[st.reading.author]={k:'face'};
  let j=0;for(const p of st.queue)if(!out[p.author])out[p.author]={k:'chair',j:j++};
  return out;
}
// ---------- la mémoire et les marcheurs ----------
let RVF_M=null;
const rvfMem0=()=>({fresh:true,batch:null,cas:[],basket:[],who:{},rel:null,bern:null,reading:null,stamp:null,last:0,lastT:null});
function rvfReset(){RVF_M=rvfMem0();}
function rvfWalker(pts){return {pos:{x:pts[0].x,y:pts[0].y},pts:pts.slice(1).map(p=>({...p})),dir:'down',moving:false};}
// un pas : marche jusqu'au point, puis attend (wait), s'arrête (hold, en secondes), fait ce qu'il y a à faire (do)
function rvfStep(w,dt){
  w.moving=false;
  while(w.pts.length){const p=w.pts[0];
    if(!p._at){const dx=p.x-w.pos.x, dy=p.y-w.pos.y, d=Math.hypot(dx,dy);
      if(d>.5)w.dir=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');
      if(d>RVF_WALK*dt){w.pos.x+=dx/d*RVF_WALK*dt;w.pos.y+=dy/d*RVF_WALK*dt;w.moving=true;return false;}
      w.pos={x:p.x,y:p.y};dt-=d/RVF_WALK;p._at=true;if(p.dir)w.dir=p.dir;}
    if(p.wait&&!p.wait())return false;
    if(p.hold>0){if(p.hold>dt){p.hold-=dt;return false;}dt-=p.hold;p.hold=0;}
    w.pts.shift();if(p.do)p.do();
  }
  return true;
}
// les chemins des auteurs : par leur colonne, à droite de celle du relecteur, le long du mur à gauche du premier bureau
const rvfColAt=y=>({x:RVF.col,y});
function rvfExit(s){
  if(s.k==='chair'){const c=rvfChair(s.j);return [c,{x:c.x,y:RVF.lane},rvfColAt(RVF.lane)];}
  if(s.k==='face')return [RVF.face,rvfColAt(RVF.face.y)];
  return [RVF.stairLow,RVF.stair,RVF.hall,RVF.door,RVF.in,rvfColAt(RVF.in.y)];
}
function rvfRoute(a,b){
  if(a.k==='chair'&&b.k==='chair'){const c=rvfChair(a.j), d=rvfChair(b.j);return [c,{x:c.x,y:RVF.lane},{x:d.x,y:RVF.lane},{...d,dir:'down'}];}
  const end=rvfExit(b).reverse();end[end.length-1]={...end[end.length-1],dir:b.k==='face'?'up':'down'};
  return [...rvfExit(a),...end];
}
const rvfRel=(from,to)=>[from,{x:RVF.relx,y:from.y},{x:RVF.relx,y:to.y},to];
// de sa place (bureau, corbeille ou banc) au palier : jamais à travers la salle d'attente
const rvfToHall=at=>at.x<RD_VX*RVF_TS?[RVF.hall]:[...(at.y>RVF.rely?[{x:at.x,y:RVF.rely},{x:RVF.relx,y:RVF.rely}]:[{x:RVF.relx,y:at.y}]),{x:RVF.relx,y:RVF.in.y},RVF.in,RVF.door,RVF.hall];
function rvfUpdate(now){
  let M=RVF_M||(RVF_M=rvfMem0());
  if(M.lastT!=null&&Math.abs(T-M.lastT)>120e3){const k=M.last;M=RVF_M=rvfMem0();M.last=k;} // un saut du curseur : tout est posé
  const dt=(M.last?Math.max(0,Math.min(.1,(now-M.last)/1000)):0)*(typeof walkBoost==='function'?walkBoost():1), boost=typeof walkBoost==='function'?walkBoost():1;
  M.last=now;M.lastT=T;
  const st=rvfState(), spots=rvfSpots(st);
  if(M.fresh||REDUCED_MOTION){
    M.fresh=false;M.batch=st&&st.b.run;M.cas=st?st.queue.map(p=>({p,filed:true,y:null})):[];M.basket=st?st.done.map(d=>d.v):[];
    M.reading=st&&st.reading?st.reading.key:null;M.rel=M.reading?{seat:true}:null;M.bern=null;M.stamp=null;
    M.who={};for(const a in spots)M.who[a]={spot:spots[a],w:null,pos:{...rvfSpot(spots[a])},dir:spots[a].k==='face'?'up':'down'};
    return {M,st};
  }
  // une nouvelle fournée : Bernard monte, vide la corbeille, range les dossiers un par un, redescend
  if(st&&st.b.run!==M.batch){
    M.batch=st.b.run;const old=M.basket.slice(), fresh=st.queue.map(p=>({p,filed:false,fly:null,y:null}));
    M.cas=M.cas.filter(f=>f.filed&&!st.b.prs.some(p=>p.key===f.p.key)).concat(fresh); // le reliquat d'avant, puis la fournée
    const B={load:[],old:[],parked:false};
    // par la revue s'il y a une corbeille à vider, puis en haut du couloir : il se gare sous l'entrepôt et pose les palettes
    const pts=[RVF.stairLow,RVF.stair,RVF.hall];
    if(old.length)pts.push(RVF.door,RVF.in,{x:RVF.in.x,y:RVF.bk.y},{...RVF.bk,dir:'right',hold:.5,do:()=>{B.old=M.basket.slice();M.basket=[];}},RVF.in,RVF.door,RVF.hall);
    pts.push({...RVF.stand,dir:'up',do:()=>{B.parked=true;fresh.forEach((f,k)=>{f.fly=M.last+k*RVF_FILE/boost;});}},
      {...RVF.stand,dir:'up',hold:fresh.length*RVF_FILE/1000+.4,do:()=>{B.parked=false;}},RVF.hall,RVF.stair,{...RVF.stairLow,do:()=>{M.bern=null;}});
    B.w=rvfWalker(pts);B.fresh=fresh;M.bern=B;
  }
  if(!st&&M.batch){M.batch=null;}
  // l'entrepôt (M.cas) : un dossier sorti de la file sans être pris pour la lecture (annulé) s'en va ; un retard de données arrive rangé
  const qk=st?st.queue.map(p=>p.key):[], rk=st&&st.reading?st.reading.key:null;
  M.cas=M.cas.filter(f=>qk.includes(f.p.key)||f.p.key===rk&&!f.taken);
  for(const p of st?st.queue:[])if(!M.cas.some(f=>f.p.key===p.key))M.cas.push({p,filed:true,y:null});
  // la PR lue change : le relecteur tamponne et pose la précédente dans la corbeille, puis va chercher la suivante
  if(rk!==M.reading){
    const prev=M.reading, pd=prev&&st?st.done.find(d=>d.key===prev):null;M.reading=rk;
    const R=M.rel&&M.rel.w?M.rel:{w:null};const from=R.w?{...R.w.pos}:M.rel&&M.rel.seat?{...RVF.desk}:{...RVF.bench};
    let pts=[from];
    if(prev&&M.rel&&M.rel.seat){M.stamp={v:pd?pd.v:'comment',t0:now};
      pts.push({...RVF.desk,dir:'down',hold:.9,do:()=>{M.stamp=null;R.carry=pd?pd.v:'comment';}},{x:RVF.relx,y:RVF.desk.y},{x:RVF.relx,y:RVF.bk.y},{...RVF.bk,dir:'right',do:()=>{M.basket.push(R.carry);R.carry=null;}});}
    const at=pts[pts.length-1];
    // le dossier suivant est à l'entrepôt : par sa colonne, la porte et le palier, puis le couloir ; retour par le même chemin
    if(rk){const f=M.cas.find(x=>x.p.key===rk);
      pts.push(...rvfToHall(at),{...RVF.pick,dir:'up',wait:()=>!f||rvfFiled(f,M.last),do:()=>{if(f)f.taken=true;M.cas=M.cas.filter(x=>x!==f);R.carry='new';}},
        RVF.hall,RVF.door,RVF.in,{x:RVF.relx,y:RVF.in.y},{x:RVF.relx,y:RVF.desk.y},{...RVF.desk,dir:'down',do:()=>{R.carry=null;R.w=null;R.seat=true;}});}
    else pts.push(...rvfRel(at,{x:RVF.relx,y:RVF.rely}).slice(1),{x:RVF.bench.x,y:RVF.rely},{...RVF.bench,dir:'down',do:()=>{M.rel=null;}});
    R.seat=false;R.w=rvfWalker(pts);M.rel=R;
  }
  // les auteurs : ceux qui arrivent montent l'escalier l'un après l'autre ; les autres changent de place ou redescendent
  let n=0;
  for(const a in spots){const s=spots[a], h=M.who[a];
    if(!h){const pts=rvfRoute({k:'stairs'},s);pts[0]={...pts[0],hold:1.2*n++};M.who[a]={spot:s,w:rvfWalker(pts),pos:{...RVF.stairLow},dir:'up'};continue;}
    h.leaving=false;
    if(h.spot.k!==s.k||h.spot.j!==s.j){const r=rvfRoute(h.spot,s);if(h.w)r[0]={...h.w.pos};h.w=rvfWalker(r);h.spot=s;}}
  for(const a in M.who){const h=M.who[a];if(spots[a]||h.leaving)continue;
    const r=rvfRoute(h.spot,{k:'stairs'});if(h.w)r[0]={...h.w.pos};r[r.length-1]={...r[r.length-1],do:()=>{delete M.who[a];}};h.w=rvfWalker(r);h.leaving=true;}
  for(const f of M.cas)if(!f.filed&&f.fly!=null&&now>=f.fly+RVF_FLY)f.filed=true; // rangé, même au-delà des quatre places (« +n »)
  // un pas pour chacun
  for(const a in M.who){const h=M.who[a];if(h&&h.w){const done=rvfStep(h.w,dt);if(M.who[a]===h){h.pos={...h.w.pos};h.dir=h.w.dir;h.moving=h.w.moving;if(done)h.w=null;}}}
  if(M.rel&&M.rel.w){const R=M.rel;rvfStep(R.w,dt);}
  if(M.bern)rvfStep(M.bern.w,dt);
  return {M,st};
}
const rvfSpot=s=>s.k==='chair'?rvfChair(s.j):s.k==='face'?RVF.face:RVF.stairLow;
const rvfFiled=(f,now)=>f.filed||(f.fly!=null&&now>=f.fly+RVF_FLY);
// ---------- le dessin ----------
const rvfOut=p=>p.y>AT_H+48; // encore dans l'escalier, tout entier derrière le mur : ni lui ni sa pancarte
function rvfFolder(x,y,stamp,k){
  R(ctx,x-11,y-9,22,15,'#d9b46a');R(ctx,x-11,y-12,9,4,'#d9b46a');R(ctx,x-11,y-9,22,3,'#e8c987');R(ctx,x-9,y-4,16,1,'#a8843e');R(ctx,x-9,y-1,12,1,'#a8843e');
  const v=stamp&&RVF_V[stamp];if(v&&(k==null||k>0)){const s=k==null?1:k;ctx.save();ctx.translate(x+3,y-1);ctx.rotate(-.25);ctx.scale(s,s);ctx.strokeStyle=v[1];ctx.lineWidth=2;ctx.strokeRect(-9,-6,18,12);ctx.restore();}}
const rvfStack=(x,y,vs)=>vs.forEach((v,k)=>rvfFolder(x,y-k*4,v));
function rvfPerson(people,src,p,dir,moving,now,after){if(!src||rvfOut(p))return;
  const c=Object.assign(Object.create(Object.getPrototypeOf(src)),src,{pos:{x:p.x,y:p.y},tile:null,dir:dir||'down',moving:!!moving,pose:'stand',present:true,_st:{st:'idle'}});
  people.push([{pos:{x:p.x,y:p.y}},null,false,()=>{drawChar(c,now);if(after)after(p);}]);}
// le transpalette : poussé 36 px devant Bernard, garé sous lui pendant qu'il range
function rvfJack(people,B,now){
  const p=B.w.pos, v={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]}[B.w.dir]||[0,1], j=B.parked?RVF.park:{x:p.x+v[0]*36,y:p.y+v[1]*36};
  if(rvfOut(j))return;
  const load=[...B.fresh.filter(f=>f.fly==null||now<f.fly).map(()=>null),...B.old];
  people.push([{pos:{x:j.x,y:j.y}},null,false,()=>{const x=Math.round(j.x), y=Math.round(j.y), side=!B.parked&&(B.w.dir==='left'||B.w.dir==='right'), w=side?40:32;
    ctx.strokeStyle='#3a3530';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,y-6);ctx.lineTo(p.x,p.y-26);ctx.stroke();
    ctx.fillStyle='rgba(0,0,0,.2)';ctx.beginPath();ctx.ellipse(x,y+3,20,5,0,0,7);ctx.fill();
    R(ctx,x-w/2,y-4,w,5,'#7d776c');R(ctx,x-w/2+2,y-12,w-4,9,'#b98a4e');for(let k=0;k<3;k++)R(ctx,x-w/2+2+k*((w-8)/2),y-12,4,9,'#8a6a3a');
    R(ctx,x-5,y-8,10,10,'#c8323a');R(ctx,x-5,y-8,10,2,'#e05a5a');rvfStack(x,y-16,load);}]);
}
const rvfName=a=>{const c=a&&typeof ghChar==='function'?ghChar(a):null, boss=chars.find(x=>x.boss);return c&&!(boss&&c.key===boss.key)?c:null;};
// l'étiquette d'une palette : le dépôt et le numéro, ou le numéro seul s'il ne tient pas dans sa place
function rvfTag(p){const full=String(p.repo||'').split('/').pop()+' #'+p.n;ctx.font='bold 12px ui-monospace,Menlo,monospace';return ctx.measureText(full).width+10<=2.45*RVF_TS?full:'#'+p.n;}
// la bande de sécurité, jaune et noire, au sol autour de l'entrepôt
function rvfStripe(x0,y0,x1,y1){const s=8;
  for(let x=x0,k=0;x<x1;x+=12,k++){const c=k%2?'#1c1c1c':'#f2c230', w=Math.min(12,x1-x);R(ctx,x,y0,w,s,c);R(ctx,x,y1-s,w,s,c);}
  for(let y=y0+s,k=1;y<y1-s;y+=12,k++){const c=k%2?'#1c1c1c':'#f2c230', h=Math.min(12,y1-s-y);R(ctx,x0,y,s,h,c);R(ctx,x1-s,y,s,h,c);}}
// les palettes à l'entrepôt : celles de la file (dans l'ordre du cron) depuis la première place ; les revues en panne de la
// fournée, en rouge, depuis la dernière (deux au plus) ; si la file déborde, sa dernière place visible dit « +n »
function rvfPallets(M,st){
  const q=M.cas.filter(f=>!f.taken), pn=(st?st.done.filter(d=>d.v==='err'):[]).slice(-2).map(d=>({p:d,filed:true,err:true})), room=RVF_SLOTS-pn.length;
  const shown=q.length>room?q.slice(0,room-1):q, more=q.length-shown.length;
  return {shown,more,pn,room};}
// l'entrepôt, la corbeille, la salle d'attente, Bernard, le relecteur en marche, les auteurs ; le premier bureau (lecture)
function rvfDraw(now,people){
  const {M,st}=rvfUpdate(now), T_=RVF_TS, E=RVF_E, n=st?st.queue.length:0;
  // la zone au sol et son panneau, centré au-dessus
  rdLate(people,()=>{rvfStripe(E.x0,E.y0,E.x1,E.y1);atPill('📦 ENTREPÔT · '+n+' à relire',(E.x0+E.x1)/2,E.y0-9,'#5a4636','#fff','bold 12px ui-monospace,Menlo,monospace');},E.y0-40);
  atHitRd('casier',E.x0,E.y0-18,E.x1-E.x0,E.y1-E.y0+18,{});
  // une palette par PR qui attend : elle vole du transpalette à sa place, puis avance quand la première est prise ; au-delà
  // de quatre, la dernière place dit « +n »
  rdLate(people,()=>{const {shown,more,pn,room}=rvfPallets(M,st), boost=typeof walkBoost==='function'?walkBoost():1;
    shown.forEach((f,slot)=>{const q=rvfSlot(slot), a=Math.min(1,.12*boost);
      f.x=f.x==null?q.x:f.x+(q.x-f.x)*a;f.y=f.y==null?q.y:f.y+(q.y-f.y)*a;let x=f.x, y=f.y;
      if(!f.filed){if(f.fly==null||now<f.fly)return;const k=Math.min(1,(now-f.fly)/RVF_FLY), e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
        x=RVF.park.x+(q.x-RVF.park.x)*e;y=RVF.park.y-16+(q.y-RVF.park.y+16)*e-Math.sin(k*Math.PI)*14;f.x=x;f.y=y;if(k>=1)f.filed=true;}
      atPallet(x,y);atCarton(x,y-9,f.filed?rvfTag(f.p):null,'#5b6070',-22);});
    for(let k=shown.length;k<room;k++){const q=rvfSlot(k);atPallet(q.x,q.y);} // une place libre : la palette vide
    if(more){const q=rvfSlot(room-1);atPill('+'+more,q.x,q.y-14,'#0b2a4a','#fff','bold 12px ui-monospace,Menlo,monospace');}
    pn.forEach((f,j)=>{const q=rvfSlot(RVF_SLOTS-1-j);atPallet(q.x,q.y);atSmoke(q.x+8,q.y-24,now+j*300);atCarton(q.x,q.y-9,'🧯 #'+f.p.n,'#a8323a',-22);});},E.y1-1);
  // la corbeille « Postées » : vidée par Bernard au passage suivant du cron
  rdLate(people,()=>{const b=RVF.basket;R(ctx,b.x-20,b.y-6,40,14,'#8a8478');R(ctx,b.x-20,b.y-6,40,3,'#a9a397');rvfStack(b.x,b.y-6,M.basket.slice(-6));
    atPill('📤 POSTÉES'+(M.basket.length?' · '+M.basket.length:''),b.x,b.y+22,'#5a4636','#fff','bold 12px ui-monospace,Menlo,monospace');},RVF.basket.y);
  atHitRd('postees',RVF.basket.x-44,RVF.basket.y-34,88,66,{});
  // la salle d'attente, en bas de la revue : une chaise par auteur qui attend (cinq au moins)
  const nch=Math.max(5,Object.values(M.who).filter(h=>h.spot.k==='chair').length);
  rdLate(people,()=>{for(let k=0;k<Math.min(nch,7);k++){const q=rvfChair(k);R(ctx,q.x-12,q.y-26,24,12,'#7a8296');R(ctx,q.x-12,q.y-14,24,6,'#5d6370');R(ctx,q.x-10,q.y-8,3,8,'#3a3d45');R(ctx,q.x+7,q.y-8,3,8,'#3a3d45');}
    atPill('🪑 SALLE D\'ATTENTE',rvfChair(2).x,rvfChair(0).y+22,'#5a4636','#fff','bold 12px ui-monospace,Menlo,monospace');},rvfChair(0).y-30);
  // Bernard et son transpalette
  if(M.bern){const B=M.bern;rvfJack(people,B,now);rvfPerson(people,atBernard(B.w.pos,B.w.dir,B.w.moving),B.w.pos,B.w.dir,B.w.moving,now);}
  // le relecteur en marche (assis, il est dessiné avec le bureau)
  if(M.rel&&M.rel.w){const R_=M.rel, w=R_.w, src=atWorker(100,w.pos.x,w.pos.y,w.dir,false,'');
    rvfPerson(people,src,w.pos,w.dir,w.moving,now,q=>{rdHat(ctx,'visiere',q.x,q.y,w.dir);if(R_.carry)rvfFolder(q.x+12,q.y-30,R_.carry==='new'?null:R_.carry);});}
  // les auteurs, leur pancarte (PR restantes) et leurs verdicts
  const left=a=>st?st.queue.filter(p=>p.author===a).length+(st.reading&&st.reading.author===a?1:0):0;
  Object.keys(M.who).forEach((a,i)=>{const h=M.who[a], src=rvfName(a)||atWorker(110+i,0,0,'down',false,''), nm=rvfName(a)?rvfName(a).name.split(' ')[0]:'🤖 remplaçant';
    const vs=st?st.done.filter(d=>d.author===a).map(d=>d.v):[];
    rvfPerson(people,src,h.pos,h.dir,h.moving,now,q=>{const n=left(a);if(n)atPill(nm+' · '+plural(n,'PR','PR'),q.x,q.y-62,'#0b2a4a','#fff','bold 12px ui-monospace,Menlo,monospace');
      vs.slice(-4).forEach((v,j)=>atBadge(q.x+14+j*14,q.y-50,(RVF_V[v]||RVF_V.comment)[0],(RVF_V[v]||RVF_V.comment)[1]));});
    atHitRd('author',h.pos.x-14,h.pos.y-56,28,58,{author:a});});
  return {M,st};
}
// le premier bureau : la PR lue par la file (le relecteur assis, sa PR, ses postes), ou libre
function rvfDesk(people,now,F){
  const {M,st}=F, d=RVF.desk, r=st&&st.reading&&M.rel&&M.rel.seat?st.reading.r:null;
  if(!r){atDesk(d.x,d.y-6,false);ctx.fillStyle='rgba(30,26,22,.22)';ctx.fillRect(d.x-90,d.y-90,180,150);
    if(M.stamp){const k=Math.min(1,(now-M.stamp.t0)/300);rdAgent(people,100,d.x,d.y,'idle',{hat:'visiere',desk:true,front:()=>rvfFolder(d.x+32,d.y+2,M.stamp.v,k*1.4-.4*Math.max(0,k-.7)/.3)},now);}
    else if(!(M.rel&&M.rel.w))rdLate(people,()=>atPill('bureau libre',d.x,d.y+40,'#f4efe4','#6a6050','bold 12px system-ui,sans-serif'),d.y);
    return;}
  rdAgent(people,100,d.x,d.y,'run',{hat:'visiere',desk:true,bubble:rvBubble(r),front:()=>rvfFolder(d.x+32,d.y+2)},now);
  const v=r.vars||{}, nm=rvfName(st.reading.author), pr=(st.reading.repo.split('/').pop()||'?')+'#'+st.reading.n;
  rdLate(people,()=>{atPill(pr+' · '+(nm?nm.name:'🤖 remplaçant'),d.x,RVF.face.y+24,'#0b2a4a','#fff','bold 12px ui-monospace,Menlo,monospace');
    rvStepsRow(r,d.x,RVF.face.y+42);},RVF.face.y+1);
  atHitRd('review',d.x-60,d.y-60,120,RVF.face.y-d.y+80,{run:r.run});
}
const rvfKids=()=>{const bs=rvfData().batches||{};return new Set(rvRuns().filter(r=>bs[r.parent]).map(r=>r.run));};
function rvfHover(h){
  const st=rvfState();
  if(h.kind==='casier')return st&&st.queue.length?'L\'entrepôt, à relire (cron de '+hm(st.b.s)+', dans l\'ordre) : '+st.queue.map(p=>p.repo.split('/').pop()+'#'+p.n).join(', ')+' · clic : la file':'L\'entrepôt : aucune PR à relire';
  if(h.kind==='author'){const n=st?st.queue.filter(p=>p.author===h.author).length:0, c=rvfName(h.author);return (c?c.name:'@'+h.author)+' : '+(st&&st.reading&&st.reading.author===h.author?'sa PR est lue':'attend')+(n?', encore '+plural(n,'PR','PR')+' à l\'entrepôt':'')+' · clic : ses PR';}
  if(h.kind==='postees'){const n=st?st.done.length:0;return 'Les avis postés de la fournée : '+plural(n,'PR relue','PR relues')+' · clic : la liste';}
  return '';
}
// ---------- les fiches au clic (68-redaction.js, rdFicheHtml) : la PR lue, un auteur, l'entrepôt, la corbeille ----------
const rvVerd=v=>(RVF_V[v]||RVF_V.comment)[0];
const rvPrRow=(p,rank,run)=>{const c=rvfName(p.author), lbl=`<span class="k mono">${rank==null?rvVerd(p.v):rank}</span><span>${esc(fkShort(p.repo,p.n))} <span class="mut">· ${esc(c?c.name.split(' ')[0]:'@'+p.author)}</span></span>`;
  return run?`<button type="button" class="fk-r" data-rvr="${esc(run)}">${lbl}<span class="k">sa fiche ›</span></button>`
    :`<button type="button" class="fk-r" data-kbpr="${esc(p.repo+'#'+p.n)}" data-au="${esc(p.author)}">${lbl}<span class="k">Kanban ›</span></button>`;};
function rvFicheHtml(run){
  const r=rvRuns().find(x=>x.run===run);if(!r)return null;
  const v=r.vars||{}, repo=String(v['current_task.repo']||''), n=String(v['current_task.number']||''), au=String(v['current_task.author']||''), c=au?rvfName(au):null;
  const st=rvfOn()?rvfState():null, file=!!(st&&st.reading&&st.reading.r.run===run), batch=!!(st&&st.b&&r.parent===st.b.run), done=!RUN_ACTIVE.includes(r.status);
  const verd=done?(r.status==='Success'?((rvfData().verdicts||{})[run]||'comment'):'err'):null;
  return `<button class="at-back">‹ La revue</button><h2 class="at-h">${done?rvVerd(verd)+' Relue':'👀 En lecture'} <span class="cnt mono">${esc(fkShort(repo,n))}</span></h2>`+fkTitle(repo,n)+
    `<div class="mut">PR de ${au?`<button type="button" class="fk-a" data-rva="${esc(au)}">${esc(c?c.name:'@'+au)}</button>`:'?'}${batch?' · fournée du cron de '+hm(st.b.s):' · revue à la demande'} · ${done?'relue':'depuis'} ${hm(r._s)}</div>`+
    `<div class="fk-steps">${rvSteps(r).map(s=>`<i class="${s.s==='Success'?'ok':s.s==='Running'?'run':s.s==='Failed'?'err':''}" title="${esc(rvStepName(s.n))}">${esc(rvStepLbl(s))}</i>`).join('')}</div>`+
    prLinksHtml(repo,n,au,fkRunOf(r))+
    (!done&&rvFait(run)?faitHtml(rvFait(run),{title:'Ce qu\'il fait · '+rvStepName(rvFait(run).poste),lus:'fichiers de la PR',base:'Kronn'}):'')+
    (file&&st.queue.length?`<div class="fk-fold"><h4>Après elle, à l'entrepôt</h4>${st.queue.slice(0,5).map((p,i)=>rvPrRow(p,i+2)).join('')}</div>`:'');
}
function rvAuthorHtml(a){
  const c=rvfName(a), st=rvfOn()?rvfState():null, off=st&&st.reading?2:1;
  const q=st?st.queue.map((p,i)=>({p,rank:i+off})).filter(x=>x.p.author===a):[], reading=st&&st.reading&&st.reading.author===a?st.reading:null, done=st?st.done.filter(d=>d.author===a):[];
  const kids=rvfOn()?rvfKids():new Set(), asks=rvActive().filter(r=>!kids.has(r.run)&&String((r.vars||{})['current_task.author']||'')===a);
  if(!reading&&!q.length&&!done.length&&!asks.length)return null;
  const row=r=>{const v=r.vars||{};return rvPrRow({repo:String(v['current_task.repo']||''),n:String(v['current_task.number']||''),author:a},'👀',r.run);};
  return `<button class="at-back">‹ La revue</button><h2 class="at-h">🙋 ${esc(c?c.name:'@'+a)} <span class="cnt">${plural(q.length+(reading?1:0)+asks.length,'PR','PR')}</span></h2>`+
    `<div class="mut">${reading?'Sa PR est lue au premier bureau':q.length?'Attend en salle d\'attente':'Plus rien à relire'}${st?' · fournée du cron de '+hm(st.b.s):''}</div>`+
    (reading||asks.length?`<div class="fk-fold"><h4>En lecture</h4>${reading?rvPrRow(reading,'👀',reading.r.run):''}${asks.map(row).join('')}</div>`:'')+
    (q.length?`<div class="fk-fold"><h4>À l'entrepôt</h4>${q.map(x=>rvPrRow(x.p,x.rank)).join('')}</div>`:'')+
    (done.length?`<div class="fk-fold"><h4>Déjà relues</h4>${done.map(d=>rvPrRow(d,null,d.r.run)).join('')}</div>`:'')+
    (c&&c.person?fkLinks([`<button type="button" class="lk" data-kbwho="${esc(c.key)}">🔍 Son Kanban</button>`]):'');
}
function rvFileHtml(k){
  const st=rvfOn()?rvfState():null;
  if(k==='casier'){const q=st?st.queue:[], off=st&&st.reading?2:1;
    return `<button class="at-back">‹ La revue</button><h2 class="at-h">📦 L'entrepôt <span class="cnt">${q.length} à relire</span></h2><div class="mut">${st?'Fournée du cron de '+hm(st.b.s)+', dans l\'ordre de lecture':'Aucune fournée en cours'}</div>`+
      (st&&st.reading?`<div class="fk-fold"><h4>En lecture</h4>${rvPrRow(st.reading,1,st.reading.r.run)}</div>`:'')+
      `<div class="fk-fold"><h4>Les palettes</h4>${q.length?q.map((p,i)=>rvPrRow(p,i+off)).join(''):'<div class="mut">Aucune PR n\'attend.</div>'}</div>`;}
  const d=st?st.done:[];
  return `<button class="at-back">‹ La revue</button><h2 class="at-h">📤 Postées <span class="cnt">${d.length}</span></h2><div class="mut">Les avis de la fournée${st?' du cron de '+hm(st.b.s):''} ; Bernard vide la corbeille au passage suivant.</div>`+
    `<div class="fk-fold">${d.length?d.map(x=>rvPrRow(x,null,x.r.run)).join(''):'<div class="mut">Aucun avis posté pour l\'instant.</div>'}</div>`;
}
