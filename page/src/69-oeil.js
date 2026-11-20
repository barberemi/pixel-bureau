// ---------- L'Œil du RDC : une tour sombre dont l'œil se pose, une chose à la fois, sur ce qui t'attend ----------
// La tour se dresse à l'objet objects.oeil du plan ({x, y} : le pied de la tour, en pixels ; facultatif, sans lui pas de tour).
// L'œil fait sa ronde sur les cibles, la plus urgente d'abord : une validation ✋ (au bureau du boss), une PR dont on te
// demande la relecture 👀 (au poste de son auteur), une de tes PR avec des retours 🛠 (changements demandés, fils d'un
// relecteur) ou en panne 🔴 (CI rouge, conflit), un service extérieur en alerte 🔥 (bandeau du plateau TV), des mails
// utiles ✉ (boîte aux lettres). À temps égal, la plus ancienne. Un faisceau relie l'œil à la cible et une étiquette dit le
// motif ; l'œil rougit avec l'attente (flammes au-delà de 4 h). Rien ne t'attend : l'œil se ferme. Ses PR sont celles
// de son relevé : au rejeu, loin de l'heure du relevé, il ne regarde pas. Clic sur la tour : la fiche de l'Œil, une ligne par cible avec son bouton
// (Décider, Corriger, Remettre à jour, GitHub, Voir) et « ✓ Vu », qui sort la cible de la ronde jusqu'à du nouveau
// (retenu dans le navigateur).
// Données : dataset oeil (workflows/oeil_snapshot.py, cron office : tes PR de tous tes dépôts, les relectures demandées),
// GATES (dataset gates), STATUTS (48-statuts.js), MAILS (48-mail.js) ; démo : oeilDemo().
let OEIL=null, OEIR=null; // OEIR : objects.oeil du plan (40-furniture.js)
function readOeil(src){
  try{
    if(!src||!src.datasets)return null;
    let d=src.datasets.oeil;
    if(d&&d.current!==undefined)d=d.current;
    if(typeof d==='string')d=JSON.parse(d);
    return d&&Array.isArray(d.mine)&&Array.isArray(d.asked)?d:null;
  }catch(e){return null;}
}
function oeilDemo(){ // équipe fictive : une PR à relire, une des tiennes avec des retours, une autre en conflit ; relevée à 11 h du jour affiché
  const at=m=>new Date(DAY0+11*36e5-m*60e3).toISOString();
  return {generated_at:at(0),me:'michaelscott',warnings:[],
    mine:[{id:'dunder-mifflin/site-web#2051',repo:'dunder-mifflin/site-web',n:2051,title:'Fil d\'Ariane des pages vidéo',url:'https://github.com/dunder-mifflin/site-web/pull/2051',
      draft:false,review:'changes',threads:2,ci:'ok',conflict:false,updated:at(40),last:{who:'jimh',at:at(40),text:'Le cache doit varier selon la langue',k:'changes'}},
    {id:'dunder-mifflin/api#31',repo:'dunder-mifflin/api',n:31,title:'Pagination des tags',url:'https://github.com/dunder-mifflin/api/pull/31',
      draft:false,review:'review',threads:0,ci:'ko',conflict:true,updated:at(300),last:null}],
    asked:[{id:'dunder-mifflin/site-web#2060',repo:'dunder-mifflin/site-web',n:2060,title:'Compteur de partages',url:'https://github.com/dunder-mifflin/site-web/pull/2060',author:'pambeesly',since:at(26*60)}]};
}
// l'heure affichée est celle du direct, ou proche du relevé (15 min avant, 40 min après) : les PR relevées valent pour elle
const oeLive=()=>{const g=ms(OEIL&&OEIL.generated_at);return typeof mode==='undefined'||mode==='live'||!!g&&T>=g-15*60e3&&T<=g+40*60e3;};
// ---------- « ✓ Vu » : clé de la cible -> signature de ce qu'on a vu ; du nouveau (autre signature) la remet dans la ronde ----------
let OE_SEEN={};
try{OE_SEEN=JSON.parse(localStorage.getItem('bureau.oeil.vu')||'{}')||{};}catch(e){OE_SEEN={};}
function oeSee(t){OE_SEEN[t.k]=t.sig;try{localStorage.setItem('bureau.oeil.vu',JSON.stringify(OE_SEEN));}catch(e){}}
const oeSeen=t=>OE_SEEN[t.k]===t.sig;
// ---------- les cibles ----------
const oeBoss=()=>{const b=chars.find(c=>c.boss&&c.pos);return b?{x:b.pos.x,y:b.pos.y-18}:{x:W/2,y:H/2};};
const oePrName=p=>(String(p.repo||'').split('/')[1]||'')+'#'+p.n;
// toutes les cibles à l'heure t, triées : prio (0 = quelqu'un attend ta décision) puis la plus ancienne
function oeTargets(t){
  const out=[], boss=oeBoss();
  for(const g of GATES||[])out.push({k:'g:'+g.run,sig:g.gate||'',prio:0,ico:'✋',kind:'gate',x:boss.x,y:boss.y,since:ms(g.since),
    txt:(g.wf_name||'Un workflow')+' attend ta validation',g});
  if(OEIL){
    for(const p of OEIL.asked||[]){const c=ghChar(p.author), at=c&&c.pos?{x:c.pos.x,y:c.pos.y-18}:boss;
      out.push({k:'a:'+p.id,sig:p.since||'',prio:1,ico:'👀',kind:'asked',...at,since:ms(p.since),txt:oePrName(p)+' attend ta relecture'+(p.author?' · '+p.author:''),p});}
    for(const p of OEIL.mine||[]){
      if(p.review==='changes'||p.threads>0)out.push({k:'f:'+p.id,sig:(p.last&&p.last.at)||p.updated||'',prio:2,ico:'🛠',kind:'fix',...boss,since:ms(p.last&&p.last.at)||ms(p.updated),
        txt:oePrName(p)+' : '+(p.review==='changes'?'changements demandés':plural(p.threads,'fil','fils')+' à traiter')+(p.last?' · '+p.last.who:''),p});
      else if(p.ci==='ko'||p.conflict)out.push({k:'c:'+p.id,sig:(p.conflict?'conflit':'')+(p.ci||'')+(p.updated||''),prio:3,ico:'🔴',kind:'broken',...boss,since:ms(p.updated),
        txt:oePrName(p)+' : '+[p.conflict&&'en conflit',p.ci==='ko'&&'CI rouge'].filter(Boolean).join(', '),p});
    }
  }
  if(typeof svBad==='function'&&STATUTS){const r=svRect(t), at=r?{x:r.x+r.w/2,y:r.y+r.h/2}:boss;
    for(const x of svBad(t))out.push({k:'s:'+x.s.k,sig:x.st,prio:4,ico:'🔥',kind:'service',...at,since:null,txt:x.s.n+' : '+SV_ST[x.st][1],s:x.s});}
  if(MAILS&&MAILS.sorted)for(const a of MAILS.accounts||[]){const n=a.ok?mailCount(a):0, h=(MAIL_HITS||[]).find(o=>o.id===a.id);
    if(n>0)out.push({k:'m:'+a.id,sig:String(n),prio:5,ico:'✉',kind:'mail',x:h?h.x+h.w/2:boss.x,y:h?h.y+h.h/2:boss.y,since:null,txt:plural(n,'mail utile','mails utiles')+' · '+(a.label||a.id),a});}
  return out.sort((a,b)=>a.prio-b.prio||(a.since||Infinity)-(b.since||Infinity));
}
const oeRound=t=>oeLive()?oeTargets(t).filter(x=>!oeSeen(x)):[];
// ---------- dessin ----------
const OE_H=226, OE_WB=72, OE_WT=30;
const oeEyePos=()=>OEIR&&{x:OEIR.x,y:OEIR.y-OE_H+20};
const oeRect=()=>OEIR&&{x:OEIR.x-OE_WB/2-8,y:OEIR.y-OE_H-6,w:OE_WB+16,h:OE_H+6};
function oeHit(mx,my){const r=oeRect();return !!r&&mx>=r.x&&mx<=r.x+r.w&&my>=r.y&&my<=r.y+r.h;}
// la tour (avec les meubles, triée par son pied) : fût sombre qui s'affine, contreforts, meurtrières, deux cornes autour de l'œil
const OEIL_TOWER={get y(){return OEIR?OEIR.y:-1;},draw:()=>{
  if(!OEIR)return;
  const cx=OEIR.x, base=OEIR.y, ey=base-OE_H+20, hot=oeRound(T).length>0, y1=base-18, y2=ey+18;
  R(ctx,cx-OE_WB/2-8,base-10,OE_WB+16,10,'#18121a');R(ctx,cx-OE_WB/2-3,base-18,OE_WB+6,8,'#221a22');
  for(let y=y1;y>y2;y-=2){const k=(y1-y)/(y1-y2), w=Math.round(OE_WB-k*(OE_WB-OE_WT));
    R(ctx,cx-w/2,y-2,w,2,'#2a2228');R(ctx,cx-w/2,y-2,3,2,'#4a3b44');R(ctx,cx+w/2-3,y-2,3,2,'#150f13');
    if(Math.round(y1-y)%56<2)R(ctx,cx-w/2-2,y-2,w+4,3,'#3a2e36');}
  ctx.fillStyle='#211920';for(const s of [-1,1]){ctx.beginPath();ctx.moveTo(cx+s*OE_WB*.3,y1);ctx.lineTo(cx+s*OE_WB*.62,y1);ctx.lineTo(cx+s*OE_WB*.22,y1-OE_H*.38);ctx.fill();}
  for(let k=0;k<4;k++){const y=y1-40-k*44;R(ctx,cx-2+(k%2?6:-8),y,3,6,hot?(k%3?'#ff9a1a':'#ffd060'):'#4a3a34');}
  ctx.fillStyle='#2a2228';
  for(const s of [-1,1]){ctx.beginPath();ctx.moveTo(cx+s*6,ey+18);ctx.lineTo(cx+s*OE_WT*.75,ey+18);ctx.lineTo(cx+s*OE_WT*.75,ey+6);ctx.lineTo(cx+s*OE_WT*.6,ey-20);
    ctx.lineTo(cx+s*OE_WT*.5,ey-2);ctx.lineTo(cx+s*10,ey+10);ctx.fill();}
  R(ctx,cx-OE_WT*.75,ey+15,OE_WT*1.5,5,'#3a2e36');
}};
// l'œil : amande, pupille fendue tournée vers (tx, ty) ; heat 0..1 = l'attente (orange -> rouge) ; null = fermé
function oeEye(cx,cy,tx,ty,heat){
  const w=30, h=15;
  if(heat!=null){const g0=ctx.createRadialGradient(cx,cy,2,cx,cy,w*1.6);g0.addColorStop(0,`rgba(255,${Math.round(170-heat*60)},40,${.4+heat*.3})`);g0.addColorStop(1,'rgba(255,60,0,0)');
    ctx.fillStyle=g0;ctx.fillRect(cx-w*1.6,cy-w*1.6,w*3.2,w*3.2);}
  ctx.save();ctx.beginPath();ctx.ellipse(cx,cy,w/2,h/2,0,0,7);ctx.clip();
  if(heat==null){ctx.fillStyle='#2a2026';ctx.fillRect(cx-w/2,cy-h/2,w,h);R(ctx,cx-w/2,cy,w,2,'#7a4a2a');ctx.restore();return;}
  const g=ctx.createRadialGradient(cx,cy,1,cx,cy,w/2);g.addColorStop(0,'#fff2a0');g.addColorStop(.45,heat>.5?'#ff9a1a':'#e08a2a');g.addColorStop(1,heat>.5?'#c01a04':'#7a3410');
  ctx.fillStyle=g;ctx.fillRect(cx-w/2,cy-h/2,w,h);
  const dx=tx-cx, dy=ty-cy, L=Math.hypot(dx,dy)||1, px=cx+dx/L*w*.28;
  R(ctx,px-2,cy-h/2,4,h,'#120606');
  ctx.restore();
}
function oeBeam(x,y,tx,ty,heat){
  const r=26, dx=tx-x, dy=ty-y, L=Math.hypot(dx,dy)||1, nx=-dy/L, ny=dx/L, a=`255,${Math.round(214-heat*124)},${Math.round(140-heat*120)}`;
  const g=ctx.createLinearGradient(x,y,tx,ty);g.addColorStop(0,`rgba(${a},.38)`);g.addColorStop(1,`rgba(${a},.1)`);
  ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(x+nx*3,y+ny*3);ctx.lineTo(tx+nx*r,ty+ny*r);ctx.lineTo(tx-nx*r,ty-ny*r);ctx.lineTo(x-nx*3,y-ny*3);ctx.fill();
  ctx.strokeStyle=`rgba(${a},.85)`;ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.beginPath();ctx.ellipse(tx,ty,r,r*.55,0,0,7);ctx.stroke();ctx.setLineDash([]);
}
function oeFire(x,y,now){for(const [c,d] of [['#ff5a14',0],['#ffb020',3],['#fff0a0',6]]){ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(x-12+d,y);
  for(let i=0;i<=6;i++)ctx.lineTo(x-12+d+i*(24-2*d)/6,y-(i%2?14-d*1.4+(Math.floor(now/120+i)%3)*2:4+d));ctx.lineTo(x+12-d,y);ctx.fill();}}
const OE_DWELL=4000, OE_MOVE=.3; // une cible toutes les 4 s, le faisceau se déplace pendant 30 % du temps
// par-dessus les personnages (41-render.js) : le faisceau, l'œil, et sous lui l'étiquette de la cible regardée
function oeilOverlay(now){
  const e=oeEyePos();if(!e)return;
  const l=oeRound(T);
  if(!l.length){oeEye(e.x,e.y,0,0,null);return;}
  const n=l.length, f=REDUCED_MOTION?0:now/OE_DWELL, k=Math.floor(f)%n, u=f-Math.floor(f), prev=l[(k+n-1)%n], g=l[k];
  const m=n<2||REDUCED_MOTION?1:Math.min(1,u/OE_MOVE), s=m<.5?2*m*m:1-Math.pow(-2*m+2,2)/2, tx=prev.x+(g.x-prev.x)*s, ty=prev.y+(g.y-prev.y)*s;
  const heat=Math.min(1,Math.max(0,g.since?(T-g.since)/(4*36e5):.3));
  oeBeam(e.x,e.y,tx,ty,heat);oeEye(e.x,e.y,tx,ty,heat);
  if(heat>=1)oeFire(e.x,e.y-10,now);
  if(m<1)return;
  ctx.font=`bold 12px ${FONT_MONO}`;const txt=(n>1?(k+1)+'/'+n+' · ':'')+g.ico+' '+g.txt, w=ctx.measureText(txt).width+14;
  const x=Math.max(4,e.x-24-w), y=e.y+26; // sous l'œil, à gauche de la tour : le faisceau montre la cible
  ctx.fillStyle='rgba(58,14,8,.92)';pixRect(ctx,x,y,w,20);ctx.fill();
  ctx.fillStyle='#ffd9a0';ctx.textBaseline='middle';ctx.fillText(txt,x+7,y+11);ctx.textBaseline='alphabetic';
}
function oeilTip(){const l=oeRound(T);
  return !oeLive()?'L\'Œil : loin de son relevé, il ne regarde pas':l.length?'L\'Œil : '+plural(l.length,'chose t\'attend','choses t\'attendent')+' · '+l[0].ico+' '+l[0].txt+' · clic : la liste'
    :'L\'Œil dort : rien ne t\'attend · clic : ce qu\'il surveille';}
// ---------- la fiche ----------
function renderOeil(side){
  const all=oeLive()?oeTargets(T):[], box=document.createElement('div');
  const vu=OEIL&&OEIL.generated_at?' · vu à '+hm(ms(OEIL.generated_at)):'';
  box.innerHTML=`<h2>👁 L'Œil</h2><div class="note">${all.length?esc(plural(all.filter(t=>!oeSeen(t)).length,'chose t\'attend','choses t\'attendent')):'Rien ne t\'attend.'}${esc(vu)}</div>`;
  if(!oeLive())box.innerHTML+='<div class="note">Loin de l\'heure de son relevé, l\'Œil ne regarde pas : ses PR sont celles du relevé.</div>';
  for(const t of all){
    const row=document.createElement('div');row.className='oe-row'+(oeSeen(t)?' oe-vu':'');
    const age=t.since?' · '+agoTxt(T-t.since):'';
    row.innerHTML=`<div class="oe-t"><b>${esc(t.ico)}</b> ${esc(t.txt)}<span class="mut">${esc(age)}</span></div>`+
      (t.p&&t.p.title?`<div class="oe-s">${esc(t.p.title)}</div>`:'')+(t.p&&t.p.last&&t.p.last.text?`<div class="oe-q">« ${esc(t.p.last.text)} »</div>`:'');
    const acts=document.createElement('div');acts.className='oe-acts';
    const btn=(label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;acts.appendChild(b);return b;};
    if(t.kind==='gate')btn('✋ Décider',()=>select('gate:'+t.g.run));
    if(t.kind==='service')btn('Voir les services',()=>select('services'));
    if(t.kind==='mail')btn('Ouvrir le courrier',()=>select('mail:'+t.a.id));
    if(t.p&&t.p.url){const a=document.createElement('a');a.href=t.p.url;a.target='_blank';a.rel='noopener';a.textContent='↗ GitHub';acts.appendChild(a);}
    if(!oeSeen(t))btn('✓ Vu',()=>{oeSee(t);renderSide(true);});
    row.appendChild(acts);
    // les boutons Kronn des PR : liés par « owner/dépôt#n » au dataset actions (actions_snapshot.py y ajoute les PR de l'Œil)
    if(t.kind==='fix'&&ACTIONS.fix_pr)launchBlock(row,{action:'bureau-fixpr',bind:{id:t.p.id},verb:'corrige les retours de '+oePrName(t.p),
      sub:'Tu valides le diff et ses réponses, puis il pousse',label:'🛠 Corriger',title:'Corriger les retours de '+oePrName(t.p)});
    if(t.kind==='broken'&&t.p.conflict&&ACTIONS.rebase)launchBlock(row,{action:'bureau-rebase',bind:{id:t.p.id},verb:'remet '+oePrName(t.p)+' à jour',
      sub:'Conflit : l\'IA propose une résolution, tu la valides avant tout push.',label:'⟳ Remettre à jour',title:'Remettre à jour '+oePrName(t.p)});
    box.appendChild(row);
  }
  const calm=OEIL?(OEIL.mine||[]).filter(p=>!all.some(t=>t.p&&t.p.id===p.id)).length:0;
  if(calm)box.insertAdjacentHTML('beforeend',`<div class="note">${esc(plural(calm,'autre PR ouverte','autres PR ouvertes'))} sans retour à traiter.</div>`);
  if(!OEIL)box.insertAdjacentHTML('beforeend','<div class="note">Tes PR ne sont pas encore relevées : le cron « refresh (page) » les lit toutes les 10 minutes.</div>');
  side.appendChild(box);
}
