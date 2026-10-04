// ---------- mode TV : bande de chiffres sous le plan, et scènes du daily (stand-up) ----------
// Lisible à 3 m : chiffres de 48 px environ, rien de personnel (pas de validation ni de PR « à toi »).
// Pendant le daily (RHYTHM.daily, en semaine), la TV enchaîne d'elle-même le sprint puis un tour de table (une scène par
// personne) ; le bouton « Stand-up » (ou la touche S) le lance ou l'arrête à la main, les flèches passent d'une scène à l'autre.
const TVSCENE_MS=20000;
const TVSCENE={manual:null,idx:0,since:0,sig:''}; // manual : null = automatique (daily), true / false = forcé
function agentsDown(){return chars.filter(c=>!c.person&&!c.visitor&&c._st&&c._st.st==='error');}
function tvKpis(t){
  const d=dashData(t), out=[], k=(cls,num,lbl,sub)=>`<div class="tk ${cls}"><b>${num}</b><span>${lbl}</span>${sub?`<small>${sub}</small>`:''}</div>`;
  if(d.sprint){const s=d.sprint, pct=s.ptsAll?Math.round(s.ptsDone/s.ptsAll*100):0;
    out.push(k('',pct+'<i>%</i>','du sprint '+esc(s.name),(s.j!=null?'J-'+s.j:'')+(s.time!=null?' · '+Math.round(s.time*100)+' % du temps':'')));}
  if(d.prod){const p=d.prod, live=p.live[p.live.length-1];
    out.push(k(p.failed.length?'err':'mep',p.done,plural(p.done,'mise en prod','mises en prod').replace(/^\d+ /,''),
      live?'🚀 '+esc(live.m.tag)+' : '+esc(MEP_TXT[live.phase]):p.failed.length?'✗ '+esc(p.failed[0].m.tag)+' en échec':p.closed?'plateau fermé':''));}
  const bt=blockedTickets(t).length, sp=stalePrs(t).length;
  out.push(k(bt?'warn':'ok',bt,bt>1?'tickets bloqués':'ticket bloqué','en review ou test depuis plus de '+BLOCKED_DAYS+' j'));
  out.push(k(sp?'warn':'ok',sp,'PR sans review','depuis plus de '+PR_STALE_H+' h'));
  const down=agentsDown();
  out.push(k(down.length?'err':'ok',down.length,down.length>1?'agents en panne':'agent en panne',down.length?esc(down.slice(0,3).map(c=>c.name).join(', ')):'tout tourne'));
  return out.join('');
}
// ---------- scènes ----------
function sceneSprint(t){
  const d=dashData(t); if(!d.sprint)return '<p class="sc-empty">Pas de données Jira.</p>';
  const s=d.sprint, c=s.cats, pct=s.ptsAll?Math.round(s.ptsDone/s.ptsAll*100):0;
  const rows=(TEAM.people||[]).map(p=>{const tk=p.tickets||[], n=k=>tk.filter(x=>x.cat===k).length;
    return {name:String(p.name||'').split(' ')[0],doing:n('doing'),review:n('review'),test:n('test'),done:n('done')};}).filter(r=>r.doing+r.review+r.test+r.done)
    .sort((a,b)=>(b.doing+b.review+b.test)-(a.doing+a.review+a.test));
  return `<div class="sc-hero"><b>${pct}<i>%</i></b><div><div class="sc-meter"><i style="width:${pct}%"></i>${s.time!=null?`<u style="left:${s.time*100}%"></u>`:''}</div>`+
    `<p>${fmtPts(s.ptsDone)} / ${fmtPts(s.ptsAll)} points terminés${s.time!=null?' · '+Math.round(s.time*100)+' % du temps écoulé':''}${s.j!=null?' · J-'+s.j:''}</p>`+
    `<p class="sc-cats"><span>${c.todo} à faire</span><span style="color:${CAT_COLOR.doing}">${c.doing} en cours</span><span style="color:${CAT_COLOR.review}">${c.review} en review</span><span style="color:${CAT_COLOR.test}">${c.test} en test</span><span>${c.done} terminés</span></p></div></div>`+
    `<table class="sc-tab"><tr><th></th><th>en cours</th><th>review</th><th>test</th><th>terminés</th></tr>`+
    rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${r.doing||''}</td><td>${r.review||''}</td><td>${r.test||''}</td><td>${r.done||''}</td></tr>`).join('')+'</table>';
}
// ---------- tour de table : une scène par personne, en commençant par le Tech Lead ----------
// ordre : Tech Lead, développeurs, testeur, cheffe produit, apprentis sans ticket, facilitatrice (qui conclut)
const STANDUP_RANK={lead:0,qa:2,po:3,sm:5};
const ST_ORDER=['doing','review','test','todo','deploy','done'];
function standupPeople(){
  return chars.filter(c=>c.person).map((c,i)=>({c,i,r:c.roleKind in STANDUP_RANK?STANDUP_RANK[c.roleKind]:(!c.team&&c.standup?4:1)}))
    .sort((a,b)=>a.r-b.r||a.i-b.i).map(x=>x.c);
}
// dernier daily avant t (jours ouvrés) : les « nouveaux tickets » sont ceux créés depuis
function prevDaily(t){
  for(let k=1;k<8;k++){const d=parisMidnight(t-k*864e5)+DAILY_MIN*60e3;if(!['Sat','Sun'].includes(parisHM(d).wd))return d;}
  return t-864e5;
}
function sprintTickets(){return TEAM?[...TEAM.people.flatMap(p=>(p.tickets||[]).map(x=>({...x,who:p.name}))),...(TEAM.unassigned||[])]:[];}
function newTickets(t){const s=prevDaily(t);return sprintTickets().filter(x=>x.created&&ms(x.created)>s).sort((a,b)=>ms(b.created)-ms(a.created));}
const tkLi=x=>`<li>${x.status||x.cat?`<span class="st st-${esc(x.cat||'')}">${esc(x.status||CAT_TXT[x.cat]||'')}</span>`:''}<b>${esc(x.key)}</b> ${esc(clip(x.summary||'',90))}${x.who?` <small>· ${esc(String(x.who).split(' ')[0])}</small>`:''}</li>`;
const tkList=(l,n)=>`<ul class="sc-tk">${l.slice(0,n).map(tkLi).join('')}${l.length>n?`<li class="more">+ ${l.length-n} autres</li>`:''}</ul>`;
function personScene(c,t){
  const W=workOf(c), own=(c.team&&c.team.tickets||[]).slice().sort((a,b)=>ST_ORDER.indexOf(a.cat)-ST_ORDER.indexOf(b.cat));
  const lines=[].concat(c.standup||[]); // roster : une phrase, ou une liste (la première en grand, les autres en puces)
  const note=lines.length?`<p class="sc-note">${esc(lines[0])}</p>`+(lines.length>1?`<ul class="sc-lines">${lines.slice(1).map(l=>`<li>${esc(l)}</li>`).join('')}</ul>`:''):'';
  if(c.roleKind==='sm'){
    const nw=newTickets(t), rv=sprintTickets().filter(x=>x.cat==='review');
    return `<h3>Nouveaux tickets depuis le dernier daily (${nw.length})</h3>${nw.length?tkList(nw,50):'<p class="sc-empty">Aucun.</p>'}`+
      `<p class="sc-big">${plural(rv.length,'ticket en review','tickets en review')}</p><p class="sc-shout">FAITES DES REVIEWS</p>`;
  }
  if(c.roleKind==='po'){
    const nw=W&&W.written.length?W.written:newTickets(t);
    return note+`<h3>Nouveaux tickets (${nw.length})</h3>${nw.length?tkList(nw,50):'<p class="sc-empty">Aucun cette semaine.</p>'}`;
  }
  if(c.roleKind==='qa'){
    const ok=W?W.validated:[], back=W?W.reopened:[];
    return `<div class="sc-cols"><div><h3>Testés cette semaine (${cnt50(ok.length)})</h3>${ok.length?tkList(ok,50):'<p class="sc-empty">Aucun.</p>'}</div>`+
      `<div><h3>Réouverts (${cnt50(back.length)})</h3>${back.length?tkList(back,50):'<p class="sc-empty">Aucun.</p>'}</div></div>`;
  }
  if(!own.length)return note||'<p class="sc-empty">Pas de ticket dans le sprint.</p>';
  return note+`<h3>Ses tickets (${own.length})</h3>${tkList(own,50)}`;
}
const sceneMs=c=>c?Math.min(45000,15000+1500*((c.team&&c.team.tickets||[]).length)):TVSCENE_MS; // plus de tickets, plus de temps
function standupScenes(){
  return [{t:'Le sprint',f:sceneSprint,ms:TVSCENE_MS},
    ...standupPeople().map(c=>({t:c.name+(c.role?' · '+c.role:''),f:t=>personScene(c,t),ms:sceneMs(c),c}))];
}
function sceneOn(t){return TVSCENE.manual!==null?TVSCENE.manual:inDaily(t);}
function renderTvScenes(now){
  const box=document.getElementById('tvscene'), kpi=document.getElementById('tvkpi'); if(!box||!kpi)return;
  const k=tvKpis(T); if(kpi.dataset.sig!==k){kpi.dataset.sig=k;kpi.innerHTML=k;}
  const on=TV&&sceneOn(T);
  document.body.classList.toggle('tvscene',on);
  if(!on){TVSCENE.since=0;return;}
  const SC=standupScenes(); TVSCENE.idx%=SC.length;
  if(!TVSCENE.since)TVSCENE.since=now;
  if(now-TVSCENE.since>=SC[TVSCENE.idx].ms){TVSCENE.idx=(TVSCENE.idx+1)%SC.length;TVSCENE.since=now;}
  const sc=SC[TVSCENE.idx], left=Math.max(0,sc.ms-(now-TVSCENE.since));
  const img=sc.c&&typeof portraitUrl==='function'?portraitUrl(sc.c):null;
  const html=`<div class="sc-head">${img?`<img class="sc-face" src="${img}" alt="">`:''}<h2>${esc(sc.t)}</h2><span class="sc-dots">${SC.map((_,i)=>`<i class="${i===TVSCENE.idx?'on':''}"></i>`).join('')}</span>`+
    `<span class="sc-tag">${TVSCENE.manual?'Stand-up':'Daily'}</span></div><div class="sc-body">${sc.f(T)}</div>`;
  if(html!==TVSCENE.sig){TVSCENE.sig=html;box.innerHTML=html;}
  box.style.setProperty('--sc-left',(left/sc.ms).toFixed(3));
}
function toggleStandup(){
  const cur=sceneOn(T);
  TVSCENE.manual=!cur; TVSCENE.idx=0; TVSCENE.since=0;
  // hors daily, revenir au plan = repasser en automatique
  if(!TVSCENE.manual&&!inDaily(T))TVSCENE.manual=null;
  updateTv(true);
}
addEventListener('keydown',e=>{
  if(!TV||e.metaKey||e.ctrlKey||e.altKey||(e.target&&/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)))return;
  if(e.key==='s'||e.key==='S')toggleStandup();
  else if(sceneOn(T)&&(e.key==='ArrowRight'||e.key==='ArrowLeft')){const n=standupScenes().length;TVSCENE.idx=(TVSCENE.idx+(e.key==='ArrowRight'?1:n-1))%n;TVSCENE.since=0;}
});
