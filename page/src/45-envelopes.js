// ---------- enveloppes : un dossier qui vole d'un bureau à l'autre (d'après MessageEnvelope.ts de Munder Difflin) ----------
// Une enveloppe part quand un run en lance un autre (sous-run ou TriggerWorkflow), revient quand le sous-run se termine,
// monte au bureau du boss quand un run atteint une validation, et rejoint le visiteur quand un run ouvre une discussion.
// Les événements sont tirés des données (instants affichés, comme stepAt) : le rejeu et le curseur les rejouent aussi.
const ENV_KIND={
  sub:{c:'#3fb8c9',t:'lance un sous-run'},
  trig:{c:'#e8e2d0',t:'déclenche un workflow'}, // papier blanc : le violet est aux MEP, le bleu aux serveurs
  ok:{c:'#3fb37f',t:'rend le dossier'},
  ko:{c:'#d1453b',t:'rend le dossier en échec'},
  gate:{c:'#e0a020',t:'demande ta validation'},
  disc:{c:'#d46fb0',t:'ouvre une discussion'}
};
const ENV_FLY=1800, ENV_BURST=350, ENV_WINDOW=3*60e3, ENV_MAX=14;
const ENV={src:null,n:-1,ev:[],seen:new Set(),lastT:null,fly:[]};
// instant affiché d'un horodatage réel du run (un run fini est étiré sur VIS_MIN, comme dans stepAt)
function visAt(r,at){
  const a=ms(at); if(!a)return null;
  const realEnd=r._e||Date.now(), realDur=Math.max(1,realEnd-r._s), visEnd=r._ve===Infinity?realEnd:r._ve;
  return r._s+(a-r._s)/realDur*(visEnd-r._s);
}
// liste des envois de la journée : {id, t, from, to, kind} (clés de personnages)
function envEvents(){
  if(!DATA)return [];
  if(ENV.src===DATA&&ENV.n===chars.length)return ENV.ev;
  const owner={}; for(const c of chars)for(const r of c.runs)if(!r.visitor)owner[r.run]=c;
  const boss=chars.find(c=>c.boss), ev=[];
  const push=(id,t,from,to,kind)=>{if(from&&to&&from!==to&&t)ev.push({id,t,from:from.key,to:to.key,kind});};
  for(const r of DATA.runs||[]){
    const me=owner[r.run]; if(!me)continue;
    const p=r.parent&&owner[r.parent], tb=!p&&r.tby&&owner[r.tby];
    if(p){
      push(r.run+':in',r._s,p,me,'sub');
      if(r._ve!==Infinity&&['Success','Failed','Cancelled'].includes(r.status))push(r.run+':out',r._ve,me,p,r.status==='Success'?'ok':'ko');
    }else if(tb)push(r.run+':in',r._s,tb,me,'trig');
    for(const s of r.steps||[])if(s.k==='Gate'&&s.at)push(r.run+':gate:'+s.n,visAt(r,s.at),me,boss,'gate');
    for(const v of DISC_BY_RUN[r.run]||[])push(r.run+':disc:'+v.key,v.runs[0]._s,me,v,'disc');
  }
  ev.sort((a,b)=>a.t-b.t);
  ENV.src=DATA;ENV.n=chars.length;ENV.ev=ev;
  return ev;
}
// fait partir les enveloppes dont l'instant vient d'être franchi ; un saut dans le temps n'en fait partir aucune
function envTick(now){
  const ev=envEvents();
  if(ENV.lastT!==null&&T<ENV.lastT-1000){ENV.seen=new Set(ev.filter(e=>e.t<=T).map(e=>e.id));ENV.fly=[];ENV.lastT=T;return;}
  const jump=ENV.lastT===null||T-ENV.lastT>ENV_WINDOW;
  for(const e of ev){
    if(e.t>T)break;
    if(ENV.seen.has(e.id))continue;
    ENV.seen.add(e.id);
    // arrivé en retard avec les données live (cron 1 min) : part quand même s'il date de moins de 3 min
    if(!jump&&T-e.t<=ENV_WINDOW&&ENV.fly.length<ENV_MAX)ENV.fly.push({...e,born:now});
  }
  ENV.lastT=T;
}
// point de départ ou d'arrivée : au-dessus de la tête, sinon la place du personnage
function envPos(key){
  const c=byKey[key]; if(!c)return null;
  if(c.present&&c.pos)return {x:c.pos.x,y:c.pos.y-34};
  const s=c.boss?[22,8]:c.seat; if(!s)return null;
  const p=tileCenter(s[0],s[1]);return {x:p.x,y:p.y-34};
}
function drawEnvelope(x,y,col,tilt){
  x=Math.round(x)-6;y=Math.round(y)-4+Math.round(tilt);
  R(ctx,x+1,y+2,12,8,'rgba(0,0,0,.25)');
  R(ctx,x-1,y-1,14,10,'#1a1320');
  R(ctx,x,y,12,8,col);
  R(ctx,x,y,12,1,'rgba(255,255,255,.35)');
  ctx.fillStyle='#1a1320';
  for(let i=0;i<6;i++){const dy=Math.floor(i*.7);ctx.fillRect(x+i,y+dy,1,1);ctx.fillRect(x+11-i,y+dy,1,1);}
}
function drawEnvelopes(now,shown){
  envTick(now);
  ENV.fly=ENV.fly.filter(f=>now-f.born<ENV_FLY+ENV_BURST);
  for(const f of ENV.fly){
    if(shown&&!shown(byKey[f.from])&&!shown(byKey[f.to]))continue;
    const a=envPos(f.from), b=envPos(f.to); if(!a||!b)continue;
    const col=ENV_KIND[f.kind].c, age=now-f.born;
    if(age<ENV_FLY){
      const k=age/ENV_FLY, e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
      const arc=Math.min(70,30+Math.hypot(b.x-a.x,b.y-a.y)*.15);
      const at=u=>({x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u-Math.sin(Math.PI*u)*arc});
      for(let i=1;i<=3;i++){const q=at(Math.max(0,e-i*.04));ctx.globalAlpha=.4-i*.1;R(ctx,q.x-1,q.y-1,3,3,col);}
      ctx.globalAlpha=1;
      const q=at(e);if(!themeEnvelope(q.x,q.y))drawEnvelope(q.x,q.y,col,Math.sin(now/90+f.t)*1.2); // 46-themes.js : cadeau, lettre d'amour...
    }else{
      const u=(age-ENV_FLY)/ENV_BURST;
      ctx.globalAlpha=1-u;
      for(let i=0;i<6;i++){const an=i/6*Math.PI*2;R(ctx,b.x+Math.cos(an)*u*12-1,b.y+Math.sin(an)*u*12-1,3,3,col);}
      ctx.globalAlpha=1;
    }
  }
}
