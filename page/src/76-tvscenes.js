// ---------- mode TV : bande de chiffres sous le plan, et scènes du daily (stand-up), du sprint planning et de la rétro ----------
// Lisible à 3 m : chiffres de 48 px environ, rien de personnel (pas de validation ni de PR « à toi »).
// Pendant le daily (RHYTHM.daily, en semaine), la TV enchaîne d'elle-même le sprint puis un tour de table (une scène par
// personne) ; le bouton « Stand-up » (ou la touche S) le lance ou l'arrête à la main, les flèches passent d'une scène à l'autre.
// Pendant le sprint planning et la rétro (ceremonyAt, 30-data.js), leurs scènes à elles ; touches P et R, boutons de la barre.
const TVSCENE_MS=20000;
const TVSCENE={manual:null,idx:0,since:0,sig:''}; // manual : null = automatique (daily, cérémonies), 'daily' / 'planning' / 'retro' / false = forcé
function agentsDown(){return chars.filter(c=>!c.person&&!c.visitor&&c._st&&c._st.st==='error');}
function tvKpis(t){
  const d=dashData(t), out=[], k=(cls,num,lbl,sub)=>`<div class="tk ${cls}"><b>${num}</b><span>${lbl}</span>${sub?`<small>${sub}</small>`:''}</div>`;
  if(d.sprint){const s=d.sprint, pct=s.ptsAll?Math.round(s.ptsDone/s.ptsAll*100):0;
    out.push(k('',pct+'<i>%</i>','du sprint '+esc(s.name),(s.j!=null?'J-'+s.j:'')+(s.time!=null?' · '+Math.round(s.time*100)+' % du temps':'')));}
  if(d.prod){const p=d.prod, live=p.live[p.live.length-1];
    out.push(k(p.failed.length?'err':'mep',p.done,plural(p.done,'mise en prod','mises en prod').replace(/^\d+ /,''),
      live?'🚀 '+esc(live.m.tag)+' : '+esc(MEP_TXT[live.phase]):p.failed.length?'✗ '+esc(p.failed[0].m.tag)+' en échec':
      [p.last?'dernière '+esc(p.last.m.tag)+' à '+hm(ms(p.last.m.prod.end)):'',p.closed?'plateau fermé':''].filter(Boolean).join(' · ')));}
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
    rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${r.doing||''}</td><td>${r.review||''}</td><td>${r.test||''}</td><td>${r.done||''}</td></tr>`).join('')+'</table>'+sceneAway(t);
}
// qui n'est pas au bureau aujourd'hui (36-absences.js) : sous le tableau du sprint
function sceneAway(t){
  const ppl=chars.filter(c=>c.person&&c.sprite!=='temp'), abs=ppl.filter(c=>presenceAt(c,t).abs||dayCode(c,t)==='aa'), tt=ppl.filter(c=>!abs.includes(c)&&presenceAt(c,t).tt);
  const half=c=>{const v=dayCode(c,t);return v==='ab'||v==='at'?' (ce matin)':v==='ba'||v==='ta'?' (cet après-midi)':'';};
  return abs.length||tt.length?`<p class="sc-away">${abs.length?`Absences aujourd'hui : <b>${abs.map(c=>esc(c.name)+half(c)).join(', ')}</b>`:''}${abs.length&&tt.length?' · ':''}${tt.length?`🏠 En télétravail : <b>${tt.map(c=>esc(c.name)).join(', ')}</b>`:''}</p>`:'';
}
// ---------- tour de table : une scène par personne, en commençant par le Tech Lead ----------
// ordre : Tech Lead, développeurs, testeur, cheffe produit, apprentis sans ticket, facilitatrice (qui conclut)
const STANDUP_RANK={lead:0,qa:2,po:3,sm:5};
const ST_ORDER=['doing','review','test','todo','deploy','done'];
function standupPeople(){
  return chars.filter(c=>c.person&&(c.boss||!absentAt(c,T))).map((c,i)=>({c,i,r:c.roleKind in STANDUP_RANK?STANDUP_RANK[c.roleKind]:(!c.team&&c.standup?4:1)}))
    .sort((a,b)=>a.r-b.r||a.i-b.i).map(x=>x.c);
}
// dernier daily avant t (jours ouvrés) : les « nouveaux tickets » sont ceux créés depuis
function prevDaily(t){
  for(let k=1;k<8;k++){const d=parisMidnight(t-k*864e5)+DAILY_MIN*60e3;if(!['Sat','Sun'].includes(parisHM(d).wd))return d;}
  return t-864e5;
}
// dernier daily passé à t (aujourd'hui s'il a eu lieu, sinon le précédent) : la pile de la facilitatrice repart de zéro
function lastDaily(t){const d=parisMidnight(t)+DAILY_MIN*60e3;return t>=d&&!['Sat','Sun'].includes(parisHM(d).wd)?d:prevDaily(t);}
// tickets créés par des collègues entre since et t (team.new_tickets, cron équipe), le plus récent d'abord, avec leur auteur
function teamCreated(since,t){
  return ((TEAM&&TEAM.new_tickets)||[]).map(x=>({...x,c:personChar(x.by,x.by_name)})).filter(x=>x.c&&x.c.person&&ms(x.created)>since&&ms(x.created)<=t)
    .sort((a,b)=>ms(b.created)-ms(a.created));
}
function sprintTickets(){return TEAM?[...TEAM.people.flatMap(p=>(p.tickets||[]).map(x=>({...x,who:p.name}))),...(TEAM.unassigned||[])]:[];}
function newTickets(t){const s=prevDaily(t);return sprintTickets().filter(x=>x.created&&ms(x.created)>s).sort((a,b)=>ms(b.created)-ms(a.created));}
// étiquette du statut : couleur de sa colonne, rouge pour un ticket réouvert (il est retombé « en cours »)
const tkLi=x=>`<li>${x.status||x.cat?`<span class="st st-${x.status&&x.status===FLOW.reopened?'reopen':esc(x.cat||'')}">${esc(x.status||CAT_TXT[x.cat]||'')}</span>`:''}<b>${esc(x.key)}</b> ${esc(clip(x.summary||'',90))}${x.who?` <small>· ${esc(String(x.who).split(' ')[0])}</small>`:''}</li>`;
const tkList=(l,n)=>`<ul class="sc-tk">${l.slice(0,n).map(tkLi).join('')}${l.length>n?`<li class="more">+ ${l.length-n} autres</li>`:''}</ul>`;
function personScene(c,t){
  const W=workOf(c), own=(c.team&&c.team.tickets||[]).slice().sort((a,b)=>ST_ORDER.indexOf(a.cat)-ST_ORDER.indexOf(b.cat));
  const lines=[].concat(c.standup||[]); // roster : une phrase, ou une liste (la première en grand, les autres en puces)
  const note=lines.length?`<p class="sc-note">${esc(lines[0])}</p>`+(lines.length>1?`<ul class="sc-lines">${lines.slice(1).map(l=>`<li>${esc(l)}</li>`).join('')}</ul>`:''):'';
  if(c.roleKind==='sm'){ // tickets créés par l'équipe (sprint ou backlog), sinon ceux du sprint (données sans new_tickets)
    const rv=sprintTickets().filter(x=>x.cat==='review');
    const byTeam=!!(TEAM&&TEAM.new_tickets), nw=byTeam?teamCreated(prevDaily(t),t).map(x=>({...x,who:x.c.name})):newTickets(t);
    return `<h3>${byTeam?"Tickets créés par l'équipe":'Nouveaux tickets'} depuis le dernier daily (${nw.length})</h3>${nw.length?tkList(nw,50):'<p class="sc-empty">Aucun.</p>'}`+
      `<p class="sc-big">${plural(rv.length,'ticket en review','tickets en review')}</p><p class="sc-shout">FAITES DES REVIEWS</p>`;
  }
  if(c.roleKind==='po'){
    const nw=W&&W.written.length?W.written:newTickets(t);
    return note+`<h3>Nouveaux tickets (${nw.length})</h3>${nw.length?tkList(nw,50):'<p class="sc-empty">Aucun cette semaine.</p>'}`;
  }
  if(c.roleKind==='qa'){
    const ok=W?W.tested:[], back=W?W.reopened:[];
    // l'un sous l'autre, pleine largeur : les réouverts d'abord (peu nombreux, ce qui compte au daily), puis les testés (jusqu'à 50)
    return `<h3>Réouverts (${cnt50(back.length)})</h3>${back.length?tkList(back,50):'<p class="sc-empty">Aucun.</p>'}`+
      `<h3 style="margin-top:18px">Testés depuis le dernier daily (${cnt50(ok.length)})</h3>${ok.length?tkList(ok,50):'<p class="sc-empty">Aucun.</p>'}`;
  }
  if(!own.length)return note||'<p class="sc-empty">Pas de ticket dans le sprint.</p>';
  return note+`<h3>Ses tickets (${own.length})</h3>${tkList(own,50)}`;
}
const sceneMs=c=>c?Math.min(45000,15000+1500*((c.team&&c.team.tickets||[]).length)):TVSCENE_MS; // plus de tickets, plus de temps
function standupScenes(){
  return [{t:'Le sprint',f:sceneSprint,ms:TVSCENE_MS},
    ...standupPeople().map(c=>({t:c.name+(c.role?' · '+c.role:''),f:t=>personScene(c,t),ms:sceneMs(c),c}))];
}
// ---------- sprint planning : la facilitatrice anime ; les tickets des 2 prochains sprints sans story points, à estimer ----------
function hostIntro(cr,t){
  const h=cr&&ceremonyHost(cr), img=h&&typeof portraitUrl==='function'?portraitUrl(h):null;
  return h?`<p class="sc-host">${img?`<img class="sc-face" src="${img}" alt="">`:''}<span>Animée par <b>${esc(h.name)}</b>${cr.end?` · jusqu'à ${hm(cr.end)}`:''}</span></p>`:'';
}
const dayMonth=x=>x?dtf('fr-FR',{day:'numeric',month:'long'}).format(new Date(ms(x))):'';
// team.planning (cron équipe : future_sprints, planning_tickets) : {sprints:[{id, name, start, end}], tickets:[{key, …, sprint}]}
function scenePlanEstimate(cr,t){
  const P=TEAM&&TEAM.planning;
  if(!P||!(P.sprints||[]).length)return hostIntro(cr,t)+`<p class="sc-empty">${TEAM&&TEAM.sources&&!TEAM.sources.jira?'Pas de données Jira.':'Pas de sprint à venir sur le board.'}</p>`;
  const cols=P.sprints.map(sp=>{const l=(P.tickets||[]).filter(x=>x.sprint===sp.id);
    return `<div><h3>${esc(sp.name||'')}${sp.start?` · du ${dayMonth(sp.start)} au ${dayMonth(sp.end)}`:''} (${l.length})</h3>`+
      (l.length?tkList(l,50):'<p class="sc-ok">Tout est estimé.</p>')+'</div>';});
  return hostIntro(cr,t)+`<div class="sc-cols">${cols.join('')}</div>`;
}
function planningScenes(t){
  const cr=ceremonyAt(t)||{k:'planning',title:CEREMONY_TITLE.planning,start:t};
  return [{t:'Sans story points',f:t=>scenePlanEstimate(cr,t),ms:30*60e3}]; // une seule scène : on estime ensemble
}
// ---------- rétrospective : un collègue tiré au sort anime ; chiffres, livré, ce qui a coincé, agents, tour de table ----------
function sceneRetroDone(t){
  const done=sprintTickets().filter(x=>x.cat==='done'), best=typeof bestEmployee==='function'?bestEmployee():[], b=best[0];
  const bc=b&&b.pts&&typeof empChar==='function'?empChar(b):null;
  return (bc?`<p class="sc-note">🏆 ${esc(bc.name)} : ${fmtPts(b.pts)} points livrés${best.prev?' (sprint '+esc(best.sprint||'')+')':''}</p>`:'')+
    `<h3>Terminés (${done.length})</h3>${done.length?tkList(done,50):'<p class="sc-empty">Rien de terminé pour le moment.</p>'}`;
}
function sceneRetroStuck(t){
  const bt=blockedTickets(t), sp=stalePrs(t), qa=chars.find(c=>c.person&&c.roleKind==='qa'), W=qa&&workOf(qa), back=W?W.reopened:[];
  const prLi=x=>`<li><b>#${esc(x.n||x.number||'')}</b> ${esc(clip(x.title||'',80))}${x.who?` <small>· ${esc(String(x.who).split(' ')[0])}</small>`:''}</li>`;
  return `<div class="sc-cols"><div><h3>Bloqués en review ou test (${bt.length})</h3>${bt.length?tkList(bt,20):'<p class="sc-empty">Aucun.</p>'}`+
    `<h3 style="margin-top:18px">Réouverts (${cnt50(back.length)})</h3>${back.length?tkList(back,20):'<p class="sc-empty">Aucun.</p>'}</div>`+
    `<div><h3>PR sans review depuis plus de ${PR_STALE_H} h (${sp.length})</h3>${sp.length?`<ul class="sc-tk">${sp.slice(0,20).map(prLi).join('')}</ul>`:'<p class="sc-empty">Aucune.</p>'}</div></div>`;
}
function sceneRetroAgents(t){
  const rows=chars.filter(c=>!c.person&&!c.visitor&&!c.guest).map(c=>({c,p:payFor(c)})).filter(x=>x.p&&x.p.week.runs)
    .sort((a,b)=>b.p.week.runs-a.p.week.runs);
  if(!rows.length)return '<p class="sc-empty">Pas de fiche de paie des agents.</p>';
  return `<table class="sc-tab"><tr><th></th><th>runs (7 j)</th><th>échecs</th><th>coût</th></tr>`+
    rows.slice(0,12).map(r=>`<tr><td>${esc(r.c.name)}</td><td>${r.p.week.runs}</td><td>${r.p.week.fail?r.p.week.fail+' ('+Math.round(r.p.week.fail/r.p.week.runs*100)+' %)':''}</td><td>${esc(fmtUsd(usd(r.p.week.tok)))}</td></tr>`).join('')+'</table>';
}
// tour de table : l'ordre de parole est tiré au sort pour la date (le même pour tous), l'animateur commence
function retroOrder(cr){
  const h=ceremonyHost(cr), r=rng(dayNum(cr.start)*31+7);
  const rest=chars.filter(c=>c.person&&c!==h&&c.sprite!=='temp').map(c=>({c,k:r()})).sort((a,b)=>a.k-b.k).map(x=>x.c);
  return h?[h,...rest]:rest;
}
function sceneRetroTour(cr,t){
  const who=retroOrder(cr);
  return `<div class="sc-rq"><div class="rq ok"><b>👍</b>Ce qui a bien marché</div><div class="rq ko"><b>👎</b>Ce qui a coincé</div><div class="rq try"><b>💡</b>Ce qu'on essaie au prochain sprint</div></div>`+
    `<h3>Ordre de parole</h3><ol class="sc-order">${who.map(c=>{const img=typeof portraitUrl==='function'?portraitUrl(c):null;
      return `<li>${img?`<img src="${img}" alt="">`:''}<span>${esc(c.name)}</span></li>`;}).join('')}</ol>`;
}
function retroScenes(t){
  const cr=ceremonyAt(t)||{k:'retro',title:CEREMONY_TITLE.retro,start:t};
  return [{t:'Rétrospective',f:t=>hostIntro(cr,t)+sceneSprint(t),ms:TVSCENE_MS},
    {t:"Ce qu'on a livré",f:sceneRetroDone,ms:30000},
    {t:'Ce qui a coincé',f:sceneRetroStuck,ms:30000},
    {t:'Les agents',f:sceneRetroAgents,ms:TVSCENE_MS},
    {t:'Tour de table',f:t=>sceneRetroTour(cr,t),ms:40*60e3}]; // on y discute : la scène reste
}
// mode des scènes à t : forcé à la main, sinon le daily, sinon une cérémonie en cours, sinon rien (le plan)
function sceneMode(t){
  if(TVSCENE.manual!==null)return TVSCENE.manual;
  if(inDaily(t))return 'daily';
  const cr=ceremonyAt(t); return cr?cr.k:false;
}
function sceneOn(t){return !!sceneMode(t);}
function scenesFor(mode,t){return mode==='planning'?planningScenes(t):mode==='retro'?retroScenes(t):standupScenes();}
const SCENE_TAG={planning:'Sprint planning',retro:'Rétro'};
function renderTvScenes(now){
  const box=document.getElementById('tvscene'), kpi=document.getElementById('tvkpi'); if(!box||!kpi)return;
  const k=tvKpis(T); if(kpi.dataset.sig!==k){kpi.dataset.sig=k;kpi.innerHTML=k;}
  const on=TV&&sceneOn(T);
  document.body.classList.toggle('tvscene',on);
  if(!on){TVSCENE.since=0;return;}
  const mode=sceneMode(T), SC=scenesFor(mode,T); TVSCENE.idx%=SC.length;
  if(!TVSCENE.since)TVSCENE.since=now;
  if(now-TVSCENE.since>=SC[TVSCENE.idx].ms){TVSCENE.idx=(TVSCENE.idx+1)%SC.length;TVSCENE.since=now;}
  const sc=SC[TVSCENE.idx], left=Math.max(0,sc.ms-(now-TVSCENE.since));
  const img=sc.c&&typeof portraitUrl==='function'?portraitUrl(sc.c):null;
  const html=`<div class="sc-head">${img?`<img class="sc-face" src="${img}" alt="">`:''}<h2>${esc(sc.t)}</h2><span class="sc-dots">${SC.map((_,i)=>`<i class="${i===TVSCENE.idx?'on':''}"></i>`).join('')}</span>`+
    `<span class="sc-tag sc-${mode}">${SCENE_TAG[mode]||(TVSCENE.manual?'Stand-up':'Daily')}</span></div><div class="sc-body">${sc.f(T)}</div>`;
  if(html!==TVSCENE.sig){TVSCENE.sig=html;box.innerHTML=html;}
  box.style.setProperty('--sc-left',(left/sc.ms).toFixed(3));
}
// bouton ou touche : lance ces scènes, ou revient au plan si elles sont déjà à l'écran
function toggleScenes(mode){
  const cur=sceneMode(T);
  TVSCENE.manual=cur===mode?false:mode; TVSCENE.idx=0; TVSCENE.since=0;
  // revenir au plan hors daily et hors cérémonie = repasser en automatique
  if(TVSCENE.manual===false&&!inDaily(T)&&!ceremonyAt(T))TVSCENE.manual=null;
  updateTv(true);
}
const toggleStandup=()=>toggleScenes('daily');
const SCENE_KEYS={s:'daily',p:'planning',r:'retro'};
addEventListener('keydown',e=>{
  if(!TV||e.metaKey||e.ctrlKey||e.altKey||(e.target&&/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)))return;
  const k=SCENE_KEYS[String(e.key).toLowerCase()];
  if(k)toggleScenes(k);
  else if(sceneOn(T)&&(e.key==='ArrowRight'||e.key==='ArrowLeft')){const n=scenesFor(sceneMode(T),T).length;TVSCENE.idx=(TVSCENE.idx+(e.key==='ArrowRight'?1:n-1))%n;TVSCENE.since=0;}
});
