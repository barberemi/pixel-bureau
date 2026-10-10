// ---------- petites scènes de 3 s : succès débloqué, éclosion, changement de stade (canard d'équipe), agent rétabli ----------
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
  for(const [id,e] of FX.cur)if(now-e.t0>FX_MS+FX_HOLD)FX.cur.delete(id);
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
const fxDuckBusy=()=>[...FX.cur.values()].some(e=>e.kind!=='recover');
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
