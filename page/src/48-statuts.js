// ---------- Services extérieurs : le bandeau « flash info » du plateau TV ----------
// Dataset statuts (workflows/statuts_snapshot.py, cron office toutes les 10 min) : l'état des pages de statut de GitHub,
// Claude, Jira et Confluence (réglage statuts) et leurs incidents datés par la page de statut. Sous l'écran « Mises en
// prod » : un point vert par service quand tout va bien, un bandeau rouge qui nomme chaque service touché sinon ; un clic
// ouvre la fiche (état, incidents, journée). Les incidents du jour entrent aussi dans le fil (et donc le bandeau du mode
// TV), et le conseil d'une panne « agent indisponible » du 1er dit si Claude a un incident (68-atelier.js, atConseil).
// L'état se rejoue à toute heure : les incidents ouverts à t, plus l'état des composants près de l'heure du relevé.
let STATUTS=null;
// état -> couleur, mot, pictogramme ; SV_RANK : du moins grave au pire (même ordre que RANK du script)
const SV_ST={op:['#3fbf6a','opérationnel','☀️'],maint:['#5b8def','maintenance','🔧'],degraded:['#e0c020','ralenti','⛅'],partial:['#e0802a','panne partielle','🌧️'],major:['#e0614f','en panne','⛈️']};
const SV_RANK=['op','maint','degraded','partial','major'];
const svWorse=(a,b)=>SV_RANK.indexOf(a)>=SV_RANK.indexOf(b)?a:b;
function readStatuts(src){
  try{const d=dsOf(src,'statuts');if(!d||!Array.isArray(d.services))return null;
    return {generated_at:d.generated_at,services:d.services.filter(s=>s&&typeof s.k==='string'&&typeof s.n==='string'),
      incidents:(Array.isArray(d.incidents)?d.incidents:[]).filter(i=>i&&typeof i.k==='string'&&SV_ST[i.impact]&&ms(i.from))};}catch(e){return null;}
}
const svName=k=>{const s=((STATUTS&&STATUTS.services)||[]).find(x=>x.k===k);return s?s.n:k;};
// incidents ouverts à t (du pire au moins grave)
const svOpen=(k,t)=>((STATUTS&&STATUTS.incidents)||[]).filter(i=>i.k===k&&ms(i.from)<=t&&(!i.to||t<ms(i.to)))
  .sort((a,b)=>SV_RANK.indexOf(b.impact)-SV_RANK.indexOf(a.impact));
// l'état d'un service à t : ses incidents ouverts, plus l'état relevé si t est proche du relevé (null : injoignable)
function svState(s,t){
  const g=ms(STATUTS&&STATUTS.generated_at), near=g&&t>=g-10*60e3&&t<=g+20*60e3;
  const st=svOpen(s.k,t).reduce((w,i)=>svWorse(i.impact,w),'op');
  if(!near)return st;
  return s.st?svWorse(s.st,st):st==='op'?null:st;
}
const svAll=t=>((STATUTS&&STATUTS.services)||[]).map(s=>({s,st:svState(s,t)}));
const svBad=t=>svAll(t).filter(x=>x.st&&x.st!=='op').sort((a,b)=>SV_RANK.indexOf(b.st)-SV_RANK.indexOf(a.st));
const svLine=x=>'⚠ '+x.s.n.toUpperCase()+' · '+SV_ST[x.st][1];
const SV_FONT='bold 12px system-ui,sans-serif';
// sous l'écran du plateau TV : 8 px de points, ou une ligne de 15 px par service touché ; assez large pour la plus longue
function svRect(t){
  if(!STATUTS||!STATUTS.services.length||!TVR)return null;
  const bad=svBad(t);
  let w=TVR.w+40;
  if(bad.length){ctx.font=SV_FONT;for(const x of bad)w=Math.max(w,ctx.measureText(svLine(x)).width+16);}
  return {x:Math.round(TVR.x+TVR.w/2-w/2),y:TVR.y+TVR.h+4,w:Math.round(w),h:bad.length?6+15*bad.length:8,bad};
}
const SV_BAND={y:-1,draw:()=>{ // dessiné avec le mobilier du fond : les personnages du plateau passent devant
  const r=svRect(T);if(!r)return;
  if(!r.bad.length){const all=svAll(T), cx=r.x+r.w/2;
    all.forEach((x,k)=>{ctx.fillStyle=x.st?SV_ST[x.st][0]:'#8a8f99';ctx.beginPath();ctx.arc(cx+(k-(all.length-1)/2)*14,r.y+4,3,0,7);ctx.fill();});return;}
  R(ctx,r.x,r.y,r.w,r.h,'#b8322a');R(ctx,r.x,r.y,4,r.h,'#ffffff');
  ctx.font=SV_FONT;ctx.fillStyle='#ffffff';ctx.textAlign='left';
  r.bad.forEach((x,k)=>ctx.fillText(svLine(x),r.x+10,r.y+15+k*15));
}};
function svTip(){
  const bad=svBad(T);
  return bad.length?'Services extérieurs : '+bad.map(x=>x.s.n+' : '+SV_ST[x.st][1]).join(', ')
    :'Services extérieurs : tout est au vert ('+STATUTS.services.map(s=>s.n).join(', ')+')';
}
// la fiche : l'état à l'heure affichée, les incidents ouverts, puis ceux de la journée
function renderServices(side){
  const h=document.createElement('h2');h.textContent='Services extérieurs';side.appendChild(h);
  const box=document.createElement('div');side.appendChild(box);
  if(!STATUTS){box.innerHTML='<div class="empty">Pas encore de relevé des pages de statut.</div>';return;}
  const g=ms(STATUTS.generated_at), link=(u,t)=>`<a ${hrefOf(u)} target="_blank" rel="noopener" style="color:var(--accent)">${esc(t)}</a>`;
  const rows=svAll(T).map(({s,st})=>`<li><span class="dot" style="background:${st?SV_ST[st][0]:'var(--idle)'}"></span><span>${link(s.url,s.n)}</span><span class="k">${st?SV_ST[st][1]:'injoignable'}</span></li>`).join('');
  const open=STATUTS.services.flatMap(s=>svOpen(s.k,T)).map(i=>`<li><span class="dot" style="background:${SV_ST[i.impact][0]}"></span><span><b>${esc(svName(i.k))}</b> · ${esc(i.name)} ${link(i.link,'↗')}</span><span class="k">depuis ${hm(ms(i.from))}</span></li>`).join('');
  const day=STATUTS.incidents.filter(i=>ms(i.from)<=T&&(!i.to||ms(i.to)>=DAY0)&&!svOpen(i.k,T).includes(i))
    .map(i=>`<li><span class="dot" style="background:var(--idle)"></span><span><b>${esc(svName(i.k))}</b> · ${esc(i.name)} ${link(i.link,'↗')}</span><span class="k">${hm(ms(i.from))} → ${i.to&&ms(i.to)<=T?hm(ms(i.to)):'…'}</span></li>`).join('');
  box.innerHTML=`<div class="note" style="margin:0 0 8px">${g?'Relevé à '+hm(g)+', d\'après les pages de statut publiques.':''}</div><ul class="steps">${rows}</ul>`+
    (open?`<h3>En cours</h3><ul class="steps">${open}</ul>`:'')+(day?`<h3>Plus tôt aujourd'hui</h3><ul class="steps">${day}</ul>`:'')+svBandHtml(T);
}
// les 24 dernières heures : une case par heure et par service, de la couleur du pire incident ouvert dans l'heure (vert sans
// incident) ; la dernière case est l'heure en cours, jusqu'à t. Seuls les incidents déclarés y laissent une trace.
function svHours(k,t){
  const h0=Math.floor(t/36e5)*36e5;
  return Array.from({length:24},(_,j)=>{const a=h0-(23-j)*36e5, b=Math.min(a+36e5,t+1);
    return ((STATUTS&&STATUTS.incidents)||[]).filter(i=>i.k===k&&ms(i.from)<b&&(!i.to||ms(i.to)>a)).reduce((w,i)=>svWorse(i.impact,w),'op');});
}
function svBandHtml(t){
  if(!STATUTS||!STATUTS.services.length)return '';
  const h0=Math.floor(t/36e5)*36e5;
  const rows=STATUTS.services.map(s=>`<div class="mut" style="font-size:11px;margin-top:4px">${esc(s.n)}</div><div style="display:flex;gap:1px">`+
    svHours(s.k,t).map((st,j)=>`<i style="flex:1;height:10px;background:${SV_ST[st][0]}" title="${hm(h0-(23-j)*36e5)} · ${esc(s.n)} : ${SV_ST[st][1]}"></i>`).join('')+'</div>').join('');
  return `<h3>Les dernières 24 h</h3>${rows}<div class="mut" style="display:flex;justify-content:space-between;font-size:11px;margin-top:2px"><span>${hm(h0-23*36e5)}</span><span>maintenant</span></div>`;
}
// le fil : début et fin de chaque incident du jour (une maintenance n'est pas « Important »)
function svFeedEvents(t){
  const ev=[];if(!STATUTS)return ev;
  for(const i of STATUTS.incidents){
    const a=ms(i.from), b=i.to&&ms(i.to), n=esc(svName(i.k)), imp=i.impact!=='maint', name=`« ${esc(clip(i.name,90))} »`;
    if(a>=DAY0&&a<=t)ev.push({t:a,sv:true,team:true,ty:'equipe',imp,txt:`${SV_ST[i.impact][2]} <b>${n}</b> : ${SV_ST[i.impact][1]} <small>${name}</small>`});
    if(b&&b>=DAY0&&b<=t)ev.push({t:b,sv:true,team:true,ty:'equipe',imp,txt:`☀️ <b>${n}</b> rétabli <small>${name} · après ${esc(fmtDur(b-a))}</small>`});
  }
  return ev;
}
// la démo : un matin agité, aux heures de la journée rejouée (GitHub ralenti à 9 h, Claude en panne partielle de 10 h 15 à
// 10 h 54), relevé à 11 h, tout au vert (les captures de 11 h ne montrent que les points)
function svDemo(){
  const at=h=>new Date(DAY0+h*3600e3).toISOString(), page=u=>'https://'+u, sv=(k,n,u,state)=>({k,n,url:page(u),st:state});
  return {generated_at:at(11),services:[sv('github','GitHub','www.githubstatus.com','op'),sv('claude','Claude','status.claude.com','op'),
    sv('jira','Jira','jira-software.status.atlassian.com','op'),sv('confluence','Confluence','confluence.status.atlassian.com','op')],
    incidents:[{k:'github',name:'Retards sur les Actions et les webhooks',impact:'degraded',from:at(9),to:at(9.6),link:page('www.githubstatus.com')},
      {k:'claude',name:'Taux d\'erreurs élevé sur l\'API',impact:'partial',from:at(10.25),to:at(10.9),link:page('status.claude.com')}]};
}
// le conseil d'une panne « agent ou API indisponible » (68-atelier.js) : l'incident Claude ouvert à t, s'il y en a un
const svClaudeNow=t=>svOpen('claude',t)[0]||null;
