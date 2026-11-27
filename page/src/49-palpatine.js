// ---------- Palpatine : le rejeu d'un ticket livré, à la salle des serveurs du RDC ----------
// L'agent qui incarne le modèle rejeu (team/agents.json, model « rejeu ») attend toujours dans la salle des serveurs, de
// face, une étincelle de temps en temps. Quand on le lance (sa fiche, ou « ⚡ Rejouer avec Palpatine » sur un ticket
// terminé), la chaîne refait le ticket dans un run impl_rejeu (CFG.rejeu_wf, hors du 1er et du RDC : AT_RUNS) : il se
// tourne vers la baie, les lumières de la salle baissent, et par rafales il la foudroie (éclairs dessinés depuis sa main,
// flash, arcs sur la baie, étincelles, fumée de chauffe) ; sa bulle suit l'étape du run. À la fin, sa bulle donne la
// note (run.res, relue dans l'étape range par le cron : _lib.rejeu_res) 5 min ; en panne, la salle passe en alarme.
// Les images de lancer viennent de sprites/common/<sprite>/<sprite>-cast.png (SPR[<sprite>_cast], decoupe.py eclairs).
const PALP_NOTE_MS=5*60e3, PALP_CYCLE=4000, PALP_CHARGE=1600; // la bulle de fin ; une rafale : charge, puis éclairs
// main de chaque image de lancer ([x, y] dans sa case de 128 × 64, corps calé à x = 30 ; palpatine-cast.json)
const PALP_HANDS=[null,[44,36],[41,41],[50,40],[50,40],[50,40],[50,40],[50,40],[50,40]];
// hold : la rafale figée à cet instant de son cycle (captures, tools/shots.py) ; sinon elle suit l'horloge
const PALP_FX={bolts:[],boltT:0,sparks:[],last:0,hold:null};
// l'agent du rejeu : celui dont un workflow est le lanceur du rejeu (CFG.action_wf.rejeu)
const palpIs=c=>!!c&&!c.person&&!c.visitor&&!c.temp&&!!(CFG.action_wf||{}).rejeu&&(c.wf||[]).includes(CFG.action_wf.rejeu);
const palpChar=()=>chars.find(palpIs)||null;
// sa place : la salle des serveurs du plan (spots.srv), la case la plus à droite puis la plus basse ; la baie visée : la
// plus à gauche (FURN_AT.server_rack) ; la salle : la pièce éclairée (light_rooms) qui contient sa case
function palpPlace(){
  const sp=((SPOTS||{}).srv||[]).slice().sort((a,b)=>b[0]-a[0]||b[1]-a[1])[0];
  if(!sp)return null;
  const racks=(FURN_AT.server_rack||[]).slice().sort((a,b)=>a.dx-b.dx), o=racks[0];
  const rack=o?{x:13*TS+2+o.dx,y:TS+10+o.dy,w:28,h:52}:null; // le dessin de la baie (40-furniture.js)
  const lr=(LAYOUT.light_rooms||[]).find(r=>sp[0]>=r[0]&&sp[0]<=r[2]&&sp[1]>=r[1]&&sp[1]<=r[3]);
  const room=lr?{x:lr[0]*TS,y:lr[1]*TS,w:(lr[2]-lr[0]+1)*TS,h:(lr[3]-lr[1]+1)*TS}:null;
  return {tile:[sp[0],sp[1]],rack,room,face:rack&&rack.x+rack.w/2<sp[0]*TS+16?'left':'right'};
}
// ses runs du rejeu (lignes AT_RUNS, sans _s/_e) : {r, s, e (null tant qu'il tourne), ticket}
function palpRuns(){
  const p=CFG.rejeu_wf;if(!p)return [];
  return (AT_RUNS||[]).filter(r=>String(r.wf||'').slice(0,8)===p&&r.start).map(r=>({r,s:ms(r.start),e:r.end?ms(r.end):null,
    ticket:(r.vars&&r.vars.ticket)||(r.res&&r.res.ticket)||''})).sort((a,b)=>a.s-b.s);
}
// l'étape du run à l'instant t (la dernière commencée), et son nom lisible (postes de la chaîne, 68-atelier.js)
function palpStep(r,t){let cur=null;for(const s of r.steps||[])if(s.at&&ms(s.at)<=t)cur=s;return cur||(r.steps||[])[0]||null;}
const palpStepName=s=>s?(typeof atStepName==='function'?atStepName(s.n):s.n):'Préparation';
// le moment qu'il vit à t : rejoue (cast), vient d'être lancé (lance), note (5 min), panne, sinon attend
function palpMoment(t){
  if(SCENE_DEMO&&SCENE_DEMO.flag==='palp'&&t>=SCENE_DEMO.s) // 46-gallery.js : la scène jouée maintenant
    return {mode:t-SCENE_DEMO.s<3e3?'lance':'cast',ticket:'DM-7457',step:{n:t-SCENE_DEMO.s<40e3?'code':'controles'}};
  let last=null;
  for(const x of palpRuns()){
    if(x.s>t)continue;
    if(x.e==null||x.e>t)return {mode:'cast',ticket:x.ticket,step:palpStep(x.r,t),x};
    last=x;
  }
  if(last&&t-last.e<PALP_NOTE_MS)return last.r.status==='Success'?{mode:'note',ticket:last.ticket,res:last.r.res,x:last}
    :{mode:'panne',ticket:last.ticket,step:(last.r.steps||[]).find(s=>!['Success','Skipped'].includes(s.s))||palpStep(last.r,last.e),x:last};
  return null;
}
const palpNote=res=>res&&res.note!=null?res.note+'/100'+(res.atteint?' · cible atteinte':' · sous la cible '+res.cible):'noté';
// son état (stateAt, 35-state.js) : toujours à sa place ; le lanceur seul en cours (il choisit la PR) : la main crépite
function palpState(c,s,t){
  const pl=palpPlace();if(!pl)return s;
  const at=(dir)=>({zone:'visit',visit:[pl.tile[0],pl.tile[1],dir]}), m=palpMoment(t), tk=m&&m.ticket?m.ticket+' · ':'';
  if(m&&m.mode==='cast'){const n=palpStepName(m.step);
    return {...s,...at(pl.face),st:'work',label:'Rejoue '+(m.ticket||'un ticket livré')+' : '+n,bubble:'⚡ '+tk+n,palp:{mode:m.mode}};}
  if(m&&m.mode==='lance')return {...s,...at(pl.face),st:'work',label:'Rejoue '+m.ticket,bubble:'⚡ Je rejoue '+m.ticket,palp:{mode:'lance'}};
  if(m&&m.mode==='note')return {...s,...at('down'),st:'idle',label:(m.ticket||'Rejeu')+' rejoué : '+palpNote(m.res),
    bubble:'⚡ '+tk+palpNote(m.res),big:true,palp:{mode:'note'}};
  if(m&&m.mode==='panne'){const n=palpStepName(m.step);
    return {...s,...at('down'),st:'error',label:'Rejeu de '+(m.ticket||'?')+' en panne : '+n,bubble:'🧯 Rejeu '+tk+'en panne : '+n,palp:{mode:'panne'}};}
  if(s&&RUN_ACTIVE.includes((s.run||{}).status))return {...s,...at(pl.face),st:'work',label:'Choisit le ticket à rejouer',bubble:'⚡',palp:{mode:'lance'}};
  return {...s,...at('down'),st:'idle',label:'Attend un ticket à rejouer',bubble:null,palp:{mode:'attend'}};
}
// ---------- le dessin : la salle, puis lui (drawChar, 41-people.js) ----------
function palpLine(x0,y0,x1,y1,w){x0|=0;y0|=0;x1|=0;y1|=0;const dx=Math.abs(x1-x0),dy=-Math.abs(y1-y0),ix=x0<x1?1:-1,iy=y0<y1?1:-1;let e=dx+dy;
  for(;;){ctx.fillRect(x0-(w>>1),y0-(w>>1),w,w);if(x0===x1&&y0===y1)break;const e2=2*e;if(e2>=dy){e+=dy;x0+=ix;}if(e2<=dx){e+=dx;y0+=iy;}}}
// un éclair : ligne brisée de la main au but, déviée au milieu plus qu'aux bouts
function palpPath(x0,y0,x1,y1,jit){
  const pts=[[x0,y0]],n=Math.max(3,Math.round(Math.hypot(x1-x0,y1-y0)/6)),nx=-(y1-y0),ny=x1-x0,L=Math.hypot(nx,ny)||1;
  for(let k=1;k<n;k++){const u=k/n,o=(Math.random()-.5)*jit*(.4+Math.sin(u*Math.PI));pts.push([x0+(x1-x0)*u+nx/L*o,y0+(y1-y0)*u+ny/L*o]);}
  pts.push([x1,y1]);return pts;
}
function palpBolts(hx,hy,rack){const out=[];
  for(let b=0;b<3;b++){const main=palpPath(hx,hy,rack.x+4+Math.random()*(rack.w-8),rack.y+4+Math.random()*(rack.h-12),9);out.push({p:main,w:b?2:3});
    const k=2+Math.floor(Math.random()*(main.length-3)),[bx,by]=main[Math.max(1,Math.min(main.length-2,k))];
    out.push({p:palpPath(bx,by,bx+(hx<rack.x?8:-8)*(1+Math.random()),by+(Math.random()<.5?-1:1)*(6+Math.random()*10),5),w:1});}
  return out;
}
const palpGlow=(x,y,r,a)=>{const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(159,224,255,${a})`);g.addColorStop(1,'rgba(159,224,255,0)');
  ctx.fillStyle=g;ctx.fillRect(x-r,y-r,2*r,2*r);};
// la salle pendant le rejeu : pénombre, flash et halo à chaque éclair, arcs sur la baie, voyants affolés, fumée de chauffe
function palpRoom(pl,now,burst,fresh,u){
  const {room,rack}=pl;if(!room||!rack)return;
  ctx.fillStyle='rgba(14,10,38,.42)';ctx.fillRect(room.x,room.y,room.w,room.h);
  if(burst){ctx.fillStyle=`rgba(170,225,255,${fresh?.16:.06})`;ctx.fillRect(room.x,room.y,room.w,room.h);palpGlow(rack.x+rack.w/2,rack.y+rack.h/2,40,.35);}
  for(let i=0;i<5;i++)R(ctx,rack.x+3,rack.y+7+i*9,2,2,burst?(Math.floor(now/90+i)%2?'#e0614f':'#9fe0ff'):'#5ff08a');
  if(burst){ctx.fillStyle='#bfefff';for(let a=0;a<2;a++){let x=rack.x+4+Math.random()*(rack.w-8),y=rack.y+4+Math.random()*8;
    for(let k=0;k<8;k++){const nx=Math.max(rack.x+1,Math.min(rack.x+rack.w-2,x+(Math.random()-.5)*8)),ny=y+4+Math.random()*4;palpLine(x,y,nx,ny,1);x=nx;y=ny;}}}
  else if(u<900)for(let k=0;k<4;k++){const ph=((now/1400)+k/4)%1;ctx.fillStyle=`rgba(200,210,230,${(1-u/900)*.35*(1-ph)})`;
    ctx.fillRect(rack.x+4+k*6+Math.round(Math.sin(ph*7+k)*2),rack.y+rack.h-6-ph*30,2,5);}
}
function palpSparks(dt,floor){const k=Math.min(4,dt/16);
  PALP_FX.sparks=PALP_FX.sparks.filter(p=>(p.life-=.035*k)>0);
  for(const p of PALP_FX.sparks){p.x+=p.vx*k;p.y+=p.vy*k;p.vy+=.12*k;if(p.y>floor){p.y=floor;p.vy*=-.35;p.vx*=.6;}
    R(ctx,p.x,p.y,2,2,p.life>.6?'#ffffff':p.life>.3?'#9fe0ff':'#e0a020');}
}
// en panne : la salle en alarme rouge
function palpAlarm(pl,now){const {room}=pl;if(!room)return;
  ctx.fillStyle=`rgba(194,59,78,${.10+.12*(.5+.5*Math.sin(now/180))})`;ctx.fillRect(room.x,room.y,room.w,room.h);
  if(Math.floor(now/400)%2)R(ctx,room.x+room.w-8,room.y+24,4,3,'#ff4d5e');}
// au repos, de face : une étincelle à la main, 0,7 s toutes les 4,5 s
function palpIdleSpark(x,y,now){
  if(REDUCED_MOTION||now%4500>700)return;const k=Math.floor(now/80);
  ctx.fillStyle='rgba(159,224,255,.35)';ctx.fillRect(x-19,y-22,10,10);
  [[-15,-17],[-18,-14],[-12,-20],[-17,-21],[-13,-13]].forEach(([dx,dy],i)=>{if((i+k)%2)R(ctx,x+dx,y+dy,2,2,i%2?'#9fe0ff':'#ffffff');});
}
// avant lui (drawChar) : la salle ; renvoie true quand il est dessiné ici (pose de lancer), sinon drawChar le dessine
function palpDraw(c,now){
  const m=c._st&&c._st.palp, pl=m&&palpPlace();if(!pl)return false;
  const dt=now-(PALP_FX.last||now);PALP_FX.last=now;
  if(m.mode==='panne')palpAlarm(pl,now);
  const img=IMG[c.sprite+'_cast'], casting=(m.mode==='cast'||m.mode==='lance')&&!c.moving&&ready(img);
  if(!casting)return false;
  // moins d'animations (ou capture) : une seule image, les éclairs dessinés une fois et gardés
  const still=REDUCED_MOTION||PALP_FX.hold!=null, u=REDUCED_MOTION?PALP_CYCLE-1:still?PALP_FX.hold:now%PALP_CYCLE, burst=m.mode==='cast'&&u>=PALP_CHARGE;
  const f=burst?(u<PALP_CHARGE+200?2:still?5:3+Math.floor(now/90)%6):1, fresh=burst&&f>=3&&(!PALP_FX.bolts.length||!still&&now-PALP_FX.boltT>70);
  if(m.mode==='cast')palpRoom(pl,now,burst,fresh,u);
  const x=Math.round(c.pos.x), y=Math.round(c.pos.y), left=pl.face==='left';
  ctx.fillStyle='rgba(0,0,0,.22)';ctx.beginPath();ctx.ellipse(x,y+1,11,4,0,0,7);ctx.fill();
  if(sel===c.key){ctx.strokeStyle='#ffffff';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y+1,17,7,0,0,7);ctx.stroke();}
  ctx.save();ctx.translate(x,0);if(left)ctx.scale(-1,1);ctx.drawImage(img,f*128,0,128,64,-30,y-60,128,64);ctx.restore();
  const h=PALP_HANDS[f], hx=h?x+(left?30-h[0]:h[0]-30):x, hy=h?y-60+h[1]:y-20;
  if(!burst)palpGlow(hx,hy,10+Math.sin(now/90)*3,.25+u/PALP_CHARGE*.35); // la main se charge
  if(burst&&f>=3){
    if(fresh){PALP_FX.bolts=palpBolts(hx,hy,pl.rack);PALP_FX.boltT=now;
      for(const b of PALP_FX.bolts.filter(b=>b.w>1)){const [ex,ey]=b.p[b.p.length-1];
        for(let i=0;i<4;i++)PALP_FX.sparks.push({x:ex,y:ey,vx:(left?1:-1)*(.6+Math.random()*1.8),vy:-1.4+Math.random()*1.6,life:1});}}
    const grow=still?1:Math.min(1,(u-PALP_CHARGE-200)/200);
    for(const [col,add] of [['#2f6fd6',2],['#9fe0ff',0],['#ffffff',-1]])for(const b of PALP_FX.bolts){const w=b.w+add;if(w<1)continue;ctx.fillStyle=col;
      const n=Math.max(2,Math.ceil(b.p.length*grow));for(let k=1;k<n;k++)palpLine(b.p[k-1][0],b.p[k-1][1],b.p[k][0],b.p[k][1],w);}
  }
  if(pl.room&&!REDUCED_MOTION)palpSparks(dt,pl.room.y+pl.room.h-4);
  return true;
}
// après lui (drawChar) : au repos, l'étincelle par-dessus sa main
function palpAfter(c,now){const m=c._st&&c._st.palp;if(m&&m.mode==='attend'&&!c.moving)palpIdleSpark(Math.round(c.pos.x),Math.round(c.pos.y),now);}
// ---------- sa fiche (drawSide, 50-panel.js) : ce qu'il rejoue, ses dernières notes, le bouton ----------
function palpBlock(side,c){
  if(!palpIs(c))return;
  const box=document.createElement('div');box.className='block palp';
  const h=document.createElement('div');h.className='la-h';h.textContent='⚡ Rejeu des tickets livrés';box.appendChild(h);
  const m=palpMoment(T), done=palpRuns().filter(x=>x.e!=null&&x.e<=T).reverse().slice(0,5);
  const p=document.createElement('p');p.className='mut';
  p.textContent=m&&m.mode==='cast'?'Rejoue '+(m.ticket||'un ticket')+(m.x?' depuis '+hm(m.x.s):'')+' : '+palpStepName(m.step)+'.'
    :'La chaîne refait un ticket déjà en prod depuis le commit d\'avant sa PR, en essai et sans gate, puis Palpatine note son travail contre la vraie PR (cible 80/100).';
  box.appendChild(p);
  if(done.length){const ul=document.createElement('ul');ul.className='palp-notes';
    for(const x of done){const li=document.createElement('li'), res=x.r.res;
      li.innerHTML=`<b>${esc(x.ticket||'?')}</b> ${x.r.status==='Success'?esc(palpNote(res)):'<span style="color:var(--err)">en panne</span>'} <small>${esc(hm(x.e))}</small>`+
        (res&&res.parts?`<small> · tests ${palpPct(res.parts.tests)}, fichiers ${palpPct(res.parts.fichiers)}, lignes ${palpPct(res.parts.lignes)}, juge ${palpPct(res.parts.juge)}</small>`:'');
      ul.appendChild(li);}
    box.appendChild(ul);}
  if(ACTIONS.rejeu){
    const host=document.createElement('div');host.className='relaunch';host.style.display='block';host.setAttribute('data-kronn-action-slot-host','');
    host.innerHTML='<div class="rl-n">Rejouer un ticket</div><div class="rl-s">Rotation (une PR récente d\'un genre peu joué), jeu témoin (pour mesurer), ou un n° de PR ou un ticket.</div>';
    const b=document.createElement('button');b.type='button';b.textContent='⚡ Rejouer un ticket';b.setAttribute('data-kronn-action','bureau-rejeu');
    b.disabled=!!(m&&m.mode==='cast');if(b.disabled)b.title='Un rejeu tourne déjà';b.style.marginTop='8px';
    host.appendChild(b);box.appendChild(host);kronnModal(host,b,'Rejouer un ticket livré',{c,ico:'⚡'});
  }
  side.appendChild(box);
}
const palpPct=v=>v==null?'non mesuré':v+' %';
// sur la fiche d'un ticket terminé (62-ticket.js) : grisé pendant un rejeu
function palpTicketButton(box,key){
  if(!ACTIONS.rejeu)return;
  const m=palpMoment(T);
  launchBlock(box,{action:'bureau-rejeu-ticket',bind:{key},verb:'rejoue le ticket',
    sub:'La chaîne le refait depuis le commit d\'avant sa PR, en essai et sans gate, puis Palpatine note son travail contre la vraie PR',
    label:'⚡ Rejouer avec Palpatine',title:'Rejouer '+key,off:m&&m.mode==='cast'?'Un rejeu tourne déjà ('+(m.ticket||'?')+')':null});
}
// ---------- le fil (70-kpis-feed.js) : la note de chaque rejeu fini aujourd'hui, ou sa panne ----------
function palpFeedEvents(t){
  const c=palpChar();if(!c)return [];
  return palpRuns().filter(x=>x.e!=null&&x.e>=DAY0&&x.e<=t).map(x=>({t:x.e,c,imp:x.r.status!=='Success',ty:'equipe',
    txt:x.r.status==='Success'?`⚡ ${refWho(c)} a rejoué ${esc(x.ticket||'un ticket')} : ${esc(palpNote(x.r.res))} <small>le rejeu</small>`
      :`🧯 Le rejeu de ${esc(x.ticket||'?')} par ${refWho(c)} est en panne <small>${esc(palpStepName((x.r.steps||[]).find(s=>!['Success','Skipped'].includes(s.s))))}</small>`}));
}
