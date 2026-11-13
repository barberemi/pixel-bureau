// ---------- 2e étage : la file de la salle de revue ----------
// Le cron des revues retient plusieurs PR à chaque passage, mais Kronn les relit l'une après l'autre (son foreach est
// séquentiel) : la PR lue occupe le premier bureau, les autres attendent. Bernard monte la fournée sur son transpalette,
// vide au passage la corbeille du passage d'avant et range un dossier par PR dans le casier « À relire », dans l'ordre du
// cron (six cases, puis « +n »). Un relecteur va chercher le dossier du haut, les autres remontent d'une case ; l'avis
// posté, il tamponne le dossier (le verdict) et le pose dans la corbeille « Postées ». Les auteurs attendent dans la
// salle d'attente, une chaise par personne et une pancarte qui compte ses PR restantes : un auteur reste au bureau si sa
// PR suivante est la prochaine du casier, retourne s'asseoir si quelqu'un passe avant, ne redescend qu'après sa dernière
// PR, ses verdicts au-dessus de la tête. Rien n'apparaît d'un coup ; en arrivant à l'étage, après un saut du curseur ou
// avec REDUCED_MOTION, tout est posé. Une revue à la demande ne passe pas par la file : elle prend un autre bureau.
// Données : REDACTION.revue (workflows/redaction_snapshot.py : les PR retenues par passage du cron, les verdicts) et les
// runs des revues (DATA.runs, leur parent est le passage du cron). Dessiné par rdRevue (68-redaction.js).
const RVF_TS=AT_TS, RVP=(x,y)=>({x:x*RVF_TS,y:y*RVF_TS});
// stairLow : derrière la porte de l'escalier, hors du plan (RD_STAIR, 68-redaction.js) ; stair : juste devant
const RVF={stairLow:RVP(21.25,28.9),stair:RVP(21.25,26.4),hall:RVP(21.25,13.75),door:RVP(23.2,13.75),in:RVP(24.4,13.75),
  desk:RVP(28.5,9.2),face:RVP(28.5,11.5),bench:RVP(41.6,25.2),cas:{x:24.5*RVF_TS,y:16.2*RVF_TS,h:1.05*RVF_TS},
  stand:RVP(26.7,18.4),pick:RVP(26.7,16.2),basket:RVP(24.6,10.4),bk:RVP(25.8,10.4),relx:26.7*RVF_TS,rely:23.5*RVF_TS,
  col:27.6*RVF_TS,lane:22.9*RVF_TS};
RVF.park={x:RVF.stand.x,y:RVF.stand.y+40};
const RVF_V={approve:['✅','#2f9e55'],comment:['💬','#d08a12'],request_changes:['🔧','#c0392b'],err:['⚠','#a8323a']};
const RVF_WALK=105, RVF_FILE=600, RVF_FLY=500, RVF_SLOTS=6;
const rvfChair=j=>RVP(26.6+j*2,24.6);
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
// où chacun doit être : l'auteur de la PR lue au bureau, les autres auteurs qui ont encore une PR au casier sur une chaise
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
// les chemins des auteurs : par la colonne à droite du casier ; ceux du relecteur : par la sienne, le long du casier
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
    const pts=[RVF.stairLow,RVF.stair,RVF.hall,RVF.door,RVF.in];
    if(old.length)pts.push({...RVF.bk,dir:'left',hold:.5,do:()=>{B.old=M.basket.slice();M.basket=[];}});
    pts.push({x:RVF.relx,y:RVF.in.y},{...RVF.stand,dir:'left',do:()=>{B.parked=true;fresh.forEach((f,k)=>{f.fly=now+k*RVF_FILE/boost;});}},
      {...RVF.stand,dir:'left',hold:fresh.length*RVF_FILE/1000+.4,do:()=>{B.parked=false;}},{x:RVF.relx,y:RVF.in.y},RVF.in,RVF.door,RVF.hall,RVF.stair,{...RVF.stairLow,do:()=>{M.bern=null;}});
    B.w=rvfWalker(pts);B.fresh=fresh;M.bern=B;
  }
  if(!st&&M.batch){M.batch=null;}
  // le casier : un dossier sorti de la file sans être pris pour la lecture (annulé) s'en va ; un retard de données arrive rangé
  const qk=st?st.queue.map(p=>p.key):[], rk=st&&st.reading?st.reading.key:null;
  M.cas=M.cas.filter(f=>qk.includes(f.p.key)||f.p.key===rk&&!f.taken);
  for(const p of st?st.queue:[])if(!M.cas.some(f=>f.p.key===p.key))M.cas.push({p,filed:true,y:null});
  // la PR lue change : le relecteur tamponne et pose la précédente dans la corbeille, puis va chercher la suivante
  if(rk!==M.reading){
    const prev=M.reading, pd=prev&&st?st.done.find(d=>d.key===prev):null;M.reading=rk;
    const R=M.rel&&M.rel.w?M.rel:{w:null};const from=R.w?{...R.w.pos}:M.rel&&M.rel.seat?{...RVF.desk}:{...RVF.bench};
    let pts=[from];
    if(prev&&M.rel&&M.rel.seat){M.stamp={v:pd?pd.v:'comment',t0:now};
      pts.push({...RVF.desk,dir:'down',hold:.9,do:()=>{M.stamp=null;R.carry=pd?pd.v:'comment';}},{x:RVF.relx,y:RVF.desk.y},{...RVF.bk,dir:'left',do:()=>{M.basket.push(R.carry);R.carry=null;}});}
    const at=pts[pts.length-1];
    if(rk){const f=M.cas.find(x=>x.p.key===rk);
      pts.push(...rvfRel(at,{...RVF.pick,dir:'left'}).slice(1).map((p,i,a)=>i<a.length-1?p:{...p,wait:()=>!f||rvfFiled(f,now),do:()=>{if(f)f.taken=true;M.cas=M.cas.filter(x=>x!==f);R.carry='new';}}),
        {x:RVF.relx,y:RVF.desk.y},{...RVF.desk,dir:'down',do:()=>{R.carry=null;R.w=null;R.seat=true;}});}
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
  for(const f of M.cas)if(!f.filed&&f.fly!=null&&now>=f.fly+RVF_FLY)f.filed=true; // rangé, même au-delà des six cases (« +n »)
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
// le casier, la corbeille, la salle d'attente, Bernard, le relecteur en marche, les auteurs ; le premier bureau (lecture)
function rvfDraw(now,people){
  const {M,st}=rvfUpdate(now), T_=RVF_TS, c=RVF.cas;
  // le casier « À relire » : six cases, les dossiers glissent vers leur case ; au-delà, « +n »
  rdLate(people,()=>{R(ctx,c.x-36,c.y-30,72,RVF_SLOTS*c.h+34,'#6b4a2e');R(ctx,c.x-32,c.y-26,64,RVF_SLOTS*c.h+26,'#3a2a1e');
    for(let k=0;k<RVF_SLOTS;k++)R(ctx,c.x-32,c.y+k*c.h+c.h-10,64,3,'#6b4a2e');
    atPill('📥 À RELIRE'+(st?' · cron '+hm(st.b.s):''),c.x,c.y-38,'#5a4636','#fff','bold 11px ui-monospace,Menlo,monospace');},c.y-40);
  atHitRd('casier',c.x-36,c.y-44,72,RVF_SLOTS*c.h+50,{});
  rdLate(people,()=>{let i=0;
    for(const f of M.cas){if(f.taken)continue;const slot=i++;if(slot>=RVF_SLOTS)continue;
      const ty=c.y+slot*c.h;f.y=f.y==null?ty:f.y+(ty-f.y)*Math.min(1,.12*(typeof walkBoost==='function'?walkBoost():1));
      let x=c.x-18, y=f.y;
      if(!f.filed){if(f.fly==null||now<f.fly)continue;const k=Math.min(1,(now-f.fly)/RVF_FLY), e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
        x=RVF.park.x+(x-RVF.park.x)*e;y=RVF.park.y-16+(ty-RVF.park.y+16)*e-Math.sin(k*Math.PI)*14;if(k>=1)f.filed=true;}
      rvfFolder(x,y);if(f.filed){const nm=rvfName(f.p.author);atTxt((f.p.repo.split('/').pop()+' #'+f.p.n)+(nm?' · '+nm.name.split(' ')[0]:''),x+13,y+2,'#f4efe4','bold 7px ui-monospace,Menlo,monospace','left');}}
    const more=M.cas.filter(f=>!f.taken).length-RVF_SLOTS;if(more>0)atPill('+'+more,c.x,c.y+RVF_SLOTS*c.h+12,'#0b2a4a','#fff','bold 11px ui-monospace,Menlo,monospace');},c.y+RVF_SLOTS*c.h);
  // la corbeille « Postées » : vidée par Bernard au passage suivant du cron
  rdLate(people,()=>{const b=RVF.basket;R(ctx,b.x-20,b.y-6,40,14,'#8a8478');R(ctx,b.x-20,b.y-6,40,3,'#a9a397');rvfStack(b.x,b.y-6,M.basket.slice(-6));
    atPill('📤 POSTÉES'+(M.basket.length?' · '+M.basket.length:''),b.x,b.y+22,'#5a4636','#fff','bold 11px ui-monospace,Menlo,monospace');},RVF.basket.y);
  atHitRd('postees',RVF.basket.x-44,RVF.basket.y-34,88,66,{});
  // la salle d'attente : une chaise par auteur qui attend (cinq au moins)
  const nch=Math.max(5,Object.values(M.who).filter(h=>h.spot.k==='chair').length);
  rdLate(people,()=>{for(let k=0;k<Math.min(nch,7);k++){const q=rvfChair(k);R(ctx,q.x-12,q.y-26,24,12,'#7a8296');R(ctx,q.x-12,q.y-14,24,6,'#5d6370');R(ctx,q.x-10,q.y-8,3,8,'#3a3d45');R(ctx,q.x+7,q.y-8,3,8,'#3a3d45');}
    atPill('🪑 SALLE D\'ATTENTE',rvfChair(2).x,rvfChair(0).y+22,'#5a4636','#fff','bold 11px ui-monospace,Menlo,monospace');},rvfChair(0).y-30);
  // Bernard et son transpalette
  if(M.bern){const B=M.bern;rvfJack(people,B,now);rvfPerson(people,atBernard(B.w.pos,B.w.dir,B.w.moving),B.w.pos,B.w.dir,B.w.moving,now);}
  // le relecteur en marche (assis, il est dessiné avec le bureau)
  if(M.rel&&M.rel.w){const R_=M.rel, w=R_.w, src=atWorker(100,w.pos.x,w.pos.y,w.dir,false,'');
    rvfPerson(people,src,w.pos,w.dir,w.moving,now,q=>{rdHat(ctx,'visiere',q.x,q.y,w.dir);if(R_.carry)rvfFolder(q.x+12,q.y-30,R_.carry==='new'?null:R_.carry);});}
  // les auteurs, leur pancarte (PR restantes) et leurs verdicts
  const left=a=>st?st.queue.filter(p=>p.author===a).length+(st.reading&&st.reading.author===a?1:0):0;
  Object.keys(M.who).forEach((a,i)=>{const h=M.who[a], src=rvfName(a)||atWorker(110+i,0,0,'down',false,''), nm=rvfName(a)?rvfName(a).name.split(' ')[0]:'🤖 remplaçant';
    const vs=st?st.done.filter(d=>d.author===a).map(d=>d.v):[];
    rvfPerson(people,src,h.pos,h.dir,h.moving,now,q=>{const n=left(a);if(n)atPill(nm+' · '+plural(n,'PR','PR'),q.x,q.y-62,'#0b2a4a','#fff','bold 11px ui-monospace,Menlo,monospace');
      vs.slice(-4).forEach((v,j)=>atBadge(q.x+14+j*14,q.y-50,(RVF_V[v]||RVF_V.comment)[0],(RVF_V[v]||RVF_V.comment)[1]));});
    atHitRd('author',h.pos.x-14,h.pos.y-56,28,58,{author:a});});
  return {M,st};
}
// le premier bureau : la PR lue par la file (le relecteur assis, sa PR, ses postes), ou libre
function rvfDesk(people,now,F){
  const {M,st}=F, d=RVF.desk, r=st&&st.reading&&M.rel&&M.rel.seat?st.reading.r:null;
  if(!r){atDesk(d.x,d.y-6,false);ctx.fillStyle='rgba(30,26,22,.22)';ctx.fillRect(d.x-90,d.y-90,180,150);
    if(M.stamp){const k=Math.min(1,(now-M.stamp.t0)/300);rdAgent(people,100,d.x,d.y,'idle',{hat:'visiere',desk:true,front:()=>rvfFolder(d.x+32,d.y+2,M.stamp.v,k*1.4-.4*Math.max(0,k-.7)/.3)},now);}
    else if(!(M.rel&&M.rel.w))rdLate(people,()=>atPill('bureau libre',d.x,d.y+40,'#f4efe4','#6a6050','bold 11px system-ui,sans-serif'),d.y);
    return;}
  rdAgent(people,100,d.x,d.y,'run',{hat:'visiere',desk:true,bubble:rvBubble(r),front:()=>rvfFolder(d.x+32,d.y+2)},now);
  const v=r.vars||{}, nm=rvfName(st.reading.author), pr=(st.reading.repo.split('/').pop()||'?')+'#'+st.reading.n;
  rdLate(people,()=>{atPill(pr+' · '+(nm?nm.name:'🤖 remplaçant'),d.x,RVF.face.y+24,'#0b2a4a','#fff','bold 11px ui-monospace,Menlo,monospace');
    const steps=rvSteps(r);ctx.font='bold 11px system-ui,sans-serif';const ws=steps.map(s=>ctx.measureText(rvStepLbl(s)).width+10), tot=ws.reduce((a,b)=>a+b,0)+Math.max(0,steps.length-1)*3;let x=d.x-tot/2;
    steps.forEach((s,j)=>{const c=s.s==='Success'?'#2f7a45':s.s==='Running'?'#2f6fd6':s.s==='Failed'?'#a8323a':'#e8e2d0';atPill(rvStepLbl(s),x+ws[j]/2,RVF.face.y+42,c,c==='#e8e2d0'?'#6a6050':'#fff','bold 11px system-ui,sans-serif');x+=ws[j]+3;});},RVF.face.y+1);
  atHitRd('review',d.x-60,d.y-60,120,RVF.face.y-d.y+80,{run:r.run});
}
const rvfKids=()=>{const bs=rvfData().batches||{};return new Set(rvRuns().filter(r=>bs[r.parent]).map(r=>r.run));};
function rvfHover(h){
  const st=rvfState();
  if(h.kind==='casier')return st&&st.queue.length?'À relire (cron de '+hm(st.b.s)+', dans l\'ordre) : '+st.queue.map(p=>p.repo.split('/').pop()+'#'+p.n).join(', ')+' · clic : la file':'Le casier « À relire » : vide';
  if(h.kind==='author'){const n=st?st.queue.filter(p=>p.author===h.author).length:0, c=rvfName(h.author);return (c?c.name:'@'+h.author)+' : '+(st&&st.reading&&st.reading.author===h.author?'sa PR est lue':'attend')+(n?', encore '+plural(n,'PR','PR')+' au casier':'')+' · clic : ses PR';}
  if(h.kind==='postees'){const n=st?st.done.length:0;return 'Les avis postés de la fournée : '+plural(n,'PR relue','PR relues')+' · clic : la liste';}
  return '';
}
// ---------- les fiches au clic (68-redaction.js, rdFicheHtml) : la PR lue, un auteur, le casier, la corbeille ----------
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
    (file&&st.queue.length?`<div class="fk-fold"><h4>Après elle, au casier</h4>${st.queue.slice(0,5).map((p,i)=>rvPrRow(p,i+2)).join('')}</div>`:'');
}
function rvAuthorHtml(a){
  const c=rvfName(a), st=rvfOn()?rvfState():null, off=st&&st.reading?2:1;
  const q=st?st.queue.map((p,i)=>({p,rank:i+off})).filter(x=>x.p.author===a):[], reading=st&&st.reading&&st.reading.author===a?st.reading:null, done=st?st.done.filter(d=>d.author===a):[];
  const kids=rvfOn()?rvfKids():new Set(), asks=rvActive().filter(r=>!kids.has(r.run)&&String((r.vars||{})['current_task.author']||'')===a);
  if(!reading&&!q.length&&!done.length&&!asks.length)return null;
  const row=r=>{const v=r.vars||{};return rvPrRow({repo:String(v['current_task.repo']||''),n:String(v['current_task.number']||''),author:a},'👀',r.run);};
  return `<button class="at-back">‹ La revue</button><h2 class="at-h">🙋 ${esc(c?c.name:'@'+a)} <span class="cnt">${plural(q.length+(reading?1:0)+asks.length,'PR','PR')}</span></h2>`+
    `<div class="mut">${reading?'Sa PR est lue au premier bureau':q.length?'Attend en salle d\'attente':'Plus rien au casier'}${st?' · fournée du cron de '+hm(st.b.s):''}</div>`+
    (reading||asks.length?`<div class="fk-fold"><h4>En lecture</h4>${reading?rvPrRow(reading,'👀',reading.r.run):''}${asks.map(row).join('')}</div>`:'')+
    (q.length?`<div class="fk-fold"><h4>Au casier</h4>${q.map(x=>rvPrRow(x.p,x.rank)).join('')}</div>`:'')+
    (done.length?`<div class="fk-fold"><h4>Déjà relues</h4>${done.map(d=>rvPrRow(d,null,d.r.run)).join('')}</div>`:'')+
    (c&&c.person?fkLinks([`<button type="button" class="lk" data-kbwho="${esc(c.key)}">🔍 Son Kanban</button>`]):'');
}
function rvFileHtml(k){
  const st=rvfOn()?rvfState():null;
  if(k==='casier'){const q=st?st.queue:[], off=st&&st.reading?2:1;
    return `<button class="at-back">‹ La revue</button><h2 class="at-h">📥 À relire <span class="cnt">${q.length}</span></h2><div class="mut">${st?'Fournée du cron de '+hm(st.b.s)+', dans l\'ordre de lecture':'Aucune fournée en cours'}</div>`+
      (st&&st.reading?`<div class="fk-fold"><h4>En lecture</h4>${rvPrRow(st.reading,1,st.reading.r.run)}</div>`:'')+
      `<div class="fk-fold"><h4>Au casier</h4>${q.length?q.map((p,i)=>rvPrRow(p,i+off)).join(''):'<div class="mut">Le casier est vide.</div>'}</div>`;}
  const d=st?st.done:[];
  return `<button class="at-back">‹ La revue</button><h2 class="at-h">📤 Postées <span class="cnt">${d.length}</span></h2><div class="mut">Les avis de la fournée${st?' du cron de '+hm(st.b.s):''} ; Bernard vide la corbeille au passage suivant.</div>`+
    `<div class="fk-fold">${d.length?d.map(x=>rvPrRow(x,null,x.r.run)).join(''):'<div class="mut">Aucun avis posté pour l\'instant.</div>'}</div>`;
}
