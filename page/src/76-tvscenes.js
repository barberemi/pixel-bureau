// ---------- mode TV : bande de chiffres sous le plan, et scènes du daily (stand-up) ----------
// Lisible à 3 m : chiffres de 48 px environ, rien de personnel (pas de validation ni de PR « à toi »).
// Pendant le daily (RHYTHM.daily, en semaine), la TV enchaîne d'elle-même les scènes Sprint, Bloqués, MEP du jour et
// Agents en panne, TVSCENE_MS chacune ; le bouton « Stand-up » (ou la touche S) les lance ou les arrête à la main.
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
function sceneBlocked(t){
  const tk=blockedTickets(t), pr=stalePrs(t);
  if(!tk.length&&!pr.length)return '<p class="sc-ok">✓ Rien de bloqué : pas de ticket immobile, pas de PR qui attend.</p>';
  const first=n=>String(n||'').split(' ')[0];
  return `<div class="sc-cols"><div><h3>Tickets immobiles (${tk.length})</h3><ul>`+tk.slice(0,8).map(x=>`<li><b>${esc(x.key)}</b> ${esc(CAT_TXT[x.cat]||x.cat)} depuis ${ageTxt(t-ms(x.updated))}${x.who?' · '+esc(first(x.who)):''}<small>${esc(clip(x.summary,70))}</small></li>`).join('')+
    (tk.length>8?`<li class="more">+ ${tk.length-8} autres</li>`:'')+`</ul></div><div><h3>PR sans review (${pr.length})</h3><ul>`+
    pr.slice(0,8).map(x=>`<li><b>#${x.n}</b> de ${esc(first(x.who))} · ${ageTxt(t-ms(x.updated))}<small>${esc(clip(x.title,70))}</small></li>`).join('')+
    (pr.length>8?`<li class="more">+ ${pr.length-8} autres</li>`:'')+'</ul></div></div>';
}
function sceneMep(t){
  const l=mepsAt(t);
  if(!l.length)return `<p class="sc-empty">Pas de mise en prod aujourd'hui.${stageClosed(t)?' Plateau fermé : pas de MEP le vendredi ni le week-end.':''}</p>`;
  const col={done:'var(--ok)',failed:'var(--err)'};
  return '<ul class="sc-list">'+l.slice().reverse().map(x=>`<li><span class="sc-dot" style="background:${col[x.phase]||'#7a5cc8'}"></span><b>${esc(x.m.tag)}</b> ${esc(MEP_TXT[x.phase])}`+
    `${x.m.ticket?' · '+esc(x.m.ticket):''}${x.m.who_name?' · '+esc(String(x.m.who_name).split(' ')[0]):''}<small>${esc(clip(x.m.summary||x.m.name||'',80))}</small></li>`).join('')+'</ul>';
}
function sceneAgents(t){
  const down=agentsDown();
  if(!down.length)return '<p class="sc-ok">✓ Tous les agents tournent.</p>';
  return '<ul class="sc-list">'+down.map(c=>{const s=c._st, w=weekHealth(c);
    return `<li><span class="sc-dot" style="background:var(--err)"></span><b>${esc(c.name)}</b> ${s.alarm?'🚨 '+s.alarm+' échecs d\'affilée':'en panne'}${s.step?' · sur '+esc(s.step.n):''}<small>${esc(clean(s.run&&s.run.wf_name||''))}${w?' · '+esc(w):''}</small></li>`;}).join('')+'</ul>';
}
const SCENES=[{t:'Le sprint',f:sceneSprint},{t:'Ce qui est bloqué',f:sceneBlocked},{t:'Les mises en prod du jour',f:sceneMep},{t:'Les agents en panne',f:sceneAgents}];
function sceneOn(t){return TVSCENE.manual!==null?TVSCENE.manual:inDaily(t);}
function renderTvScenes(now){
  const box=document.getElementById('tvscene'), kpi=document.getElementById('tvkpi'); if(!box||!kpi)return;
  const k=tvKpis(T); if(kpi.dataset.sig!==k){kpi.dataset.sig=k;kpi.innerHTML=k;}
  const on=TV&&sceneOn(T);
  document.body.classList.toggle('tvscene',on);
  if(!on){TVSCENE.since=0;return;}
  if(!TVSCENE.since)TVSCENE.since=now;
  if(now-TVSCENE.since>=TVSCENE_MS){TVSCENE.idx=(TVSCENE.idx+1)%SCENES.length;TVSCENE.since=now;}
  const sc=SCENES[TVSCENE.idx], left=Math.max(0,TVSCENE_MS-(now-TVSCENE.since));
  const html=`<div class="sc-head"><h2>${esc(sc.t)}</h2><span class="sc-dots">${SCENES.map((_,i)=>`<i class="${i===TVSCENE.idx?'on':''}"></i>`).join('')}</span>`+
    `<span class="sc-tag">${TVSCENE.manual?'Stand-up':'Daily'}</span></div><div class="sc-body">${sc.f(T)}</div>`;
  if(html!==TVSCENE.sig){TVSCENE.sig=html;box.innerHTML=html;}
  box.style.setProperty('--sc-left',(left/TVSCENE_MS).toFixed(3));
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
  else if(sceneOn(T)&&(e.key==='ArrowRight'||e.key==='ArrowLeft')){TVSCENE.idx=(TVSCENE.idx+(e.key==='ArrowRight'?1:SCENES.length-1))%SCENES.length;TVSCENE.since=0;}
});
