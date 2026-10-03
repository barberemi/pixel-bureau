// ---------- tuiles KPI du haut et fil de la journée ----------
document.getElementById('kpis').addEventListener('click',e=>{
  if(e.target.closest('[data-todo-scroll]')){const t=document.getElementById('todo');if(t)t.scrollIntoView({behavior:'smooth',block:'start'});return;}
  const k=e.target.closest('[data-open]');if(k)select(k.dataset.open);
});
// tous les chiffres du haut de page et du mode TV, à l'instant t (une seule source pour les deux)
function dashData(t){
  const of=k=>chars.filter(c=>c._st&&c._st.st===k);
  const me={gates:of('gate'),asks:of('ask'),broken:of('error').filter(c=>!c.person)};
  me.total=me.gates.length+me.asks.length+me.broken.length;
  let sprint=null, prs=null, prod=null;
  if(TEAM){
    const all=[...TEAM.people.flatMap(p=>p.tickets||[]),...(TEAM.unassigned||[])];
    const n=k=>all.filter(x=>x.cat===k).length, pts=l=>l.reduce((a,x)=>a+(+x.points||0),0);
    const sp=TEAM.sprint||{}, st=ms(sp.start), en=ms(sp.end);
    sprint={
      name:sp.name||'',
      j:en?daysLeft(en,t):null,
      time:st&&en&&en>st?Math.min(1,Math.max(0,(t-st)/(en-st))):null,
      ptsDone:pts(all.filter(x=>x.cat==='done')),ptsAll:pts(all),
      cats:{todo:n('todo'),doing:n('doing'),review:n('review'),test:n('test'),done:n('done')}
    };
    const open=TEAM.people.flatMap(p=>p.prs||[]).filter(x=>!x.draft);
    const wait=open.filter(x=>x.review==='pending'), age=x=>t-(ms(x.updated)||t);
    prs={
      wait:wait.length,
      stale:wait.filter(x=>age(x)>864e5).length,
      oldest:wait.length?Math.max(...wait.map(age)):0,
      changes:open.filter(x=>x.review==='changes').length
    };
    const l=mepsAt(t), done=l.filter(x=>x.phase==='done');
    prod={
      done:done.length,
      live:l.filter(x=>['released','staging','staged','prod'].includes(x.phase)),
      failed:l.filter(x=>x.phase==='failed'),
      last:done.length?done.slice().sort((a,b)=>ms(b.m.prod.end)-ms(a.m.prod.end))[0]:null,
      closed:stageClosed(t)
    };
  }
  let agents=null;
  if(DATA){
    const ids=new Set(DATA.runs.map(r=>r.run)), started=DATA.runs.filter(r=>r._s<=t);
    const top=started.filter(r=>!r.parent||!ids.has(r.parent)); // un parent inclut déjà les tokens de ses sous-runs
    agents={
      runs:started.length,
      ok:started.filter(r=>r.status==='Success'&&(r._e||0)<=t).length,
      ko:started.filter(r=>r.status==='Failed'&&(r._e||0)<=t).length,
      tok:top.reduce((a,r)=>a+(r.tok||0),0)
    };
  }
  return {me,sprint,prs,prod,agents};
}
const daysTxt=d=>d<36e5?Math.max(1,Math.round(d/6e4))+' min':d<864e5?Math.round(d/36e5)+' h':Math.floor(d/864e5)+' j';
const plural=(n,a,b)=>n+' '+(n>1?b:a);
let KPI_SIG='';
function renderKpis(){
  if(!DATA)return;
  const d=dashData(T), out=[];
  { // 1. À toi : résumé de la zone « À traiter » (le détail et les boutons sont dessous)
    const items=todoItems(T), act=items.filter(x=>x.sev!=='info'), by=k=>items.filter(x=>x.key.startsWith(k+':')||x.key===k).length;
    const rows=[['err','🔧',['agent en panne','agents en panne']],['mep','✗',['MEP échouée','MEP échouées']],['gate','✋',['validation à faire','validations à faire']],
      ['ask','❓',['question en attente','questions en attente']],['rev','👀',['PR à relire','PR à relire']],['fix','✏️',['PR à corriger','PR à corriger']],['tk','⏳',['ticket bloqué','tickets bloqués']]]
      .filter(r=>by(r[0])).map(([k,ico,w])=>`<div class="dl">${ico} <b>${plural(by(k),w[0],w[1])}</b></div>`);
    out.push(`<section class="dash me click${act.length?' on':''}" data-todo-scroll><h3>À toi</h3>`+(act.length?`<div class="big">${act.length}</div>${rows.join('')}`:`<div class="calm">Rien ne t'attend ✓</div>${rows.join('')}`)+'</section>');
  }
  if(d.sprint){ // 2. Sprint
    const s=d.sprint, c=s.cats, tot=Math.max(1,c.todo+c.doing+c.review+c.test+c.done), pct=s.ptsAll?Math.round(s.ptsDone/s.ptsAll*100):0;
    const seg=(k,col)=>c[k]?`<i style="width:${c[k]/tot*100}%;background:${col}" title="${c[k]} ${CAT_TXT[k]||'terminés'}"></i>`:'';
    const pr=d.prs;
    out.push(`<section class="dash sprint"><h3>Sprint ${esc(s.name)}${s.j!=null?` <span class="j${s.j<=1?' hot':''}">J-${s.j}</span>`:''}</h3>`+
      `<div class="row"><div class="big">${pct}<small>%</small></div><div class="grow"><div class="meter"><i style="width:${pct}%"></i>${s.time!=null?`<u style="left:${s.time*100}%" title="Temps écoulé du sprint"></u>`:''}</div>`+
      `<div class="cap">${fmtPts(s.ptsDone)} / ${fmtPts(s.ptsAll)} points terminés${s.time!=null?' · '+Math.round(s.time*100)+' % du temps écoulé':''}</div></div></div>`+
      `<div class="stack">${seg('done','var(--idle)')}${seg('test',CAT_COLOR.test)}${seg('review',CAT_COLOR.review)}${seg('doing',CAT_COLOR.doing)}${seg('todo','var(--line)')}</div>`+
      `<div class="cap">${c.todo} à faire · <span style="color:${CAT_COLOR.doing}">${c.doing} en cours</span> · <span style="color:${CAT_COLOR.review}">${c.review} en review</span> · <span style="color:${CAT_COLOR.test}">${c.test} en test</span> · ${c.done} terminés</div>`+
      (pr?`<div class="cap${pr.stale?' warn':''}">⏳ ${plural(pr.wait,'PR attend','PR attendent')} une review${pr.wait?' · la plus ancienne sans activité depuis '+daysTxt(pr.oldest):''}${pr.changes?' · '+plural(pr.changes,'PR à corriger','PR à corriger'):''}</div>`:'')+
      '</section>');
  }
  if(!d.sprint)out.push(`<section class="dash sprint"><h3>L'équipe</h3><div class="calm muted">Pas encore de données Jira ni GitHub.</div><div class="cap">Elles arrivent avec le cron « équipe » (sprint, tickets, PR, mises en prod).</div></section>`);
  if(d.prod){ // 3. Prod aujourd'hui
    const p=d.prod;
    const lines=[
      ...p.failed.map(x=>`<div class="cap err">✗ ${esc(x.m.tag)} : ${esc(MEP_TXT.failed)}${x.m.ticket?' · '+esc(x.m.ticket):''}</div>`),
      ...p.live.map(x=>`<div class="cap live">🚀 ${esc(x.m.tag)} : ${esc(MEP_TXT[x.phase])}${x.m.ticket?' · '+esc(x.m.ticket):''}</div>`),
      p.last?`<div class="cap">Dernière : <b>${esc(p.last.m.tag)}</b> à ${hm(ms(p.last.m.prod.end))}${p.last.m.ticket?' · '+esc(p.last.m.ticket):''}</div>`:'',
      p.closed?`<div class="cap">Plateau fermé : pas de MEP le vendredi ni le week-end</div>`:''
    ].filter(Boolean);
    out.push(`<section class="dash prod click" data-open="tv"><h3>La prod aujourd'hui</h3><div class="row"><div class="big">${p.done}</div><div class="grow">${plural(p.done,'mise en prod','mises en prod')}</div></div>${lines.join('')}</section>`);
  }
  if(d.agents){ // 4. Agents (suivi, pas alerte)
    const a=d.agents;
    out.push(`<section class="dash agents click" data-open="paie" title="Voir la fiche de paie"><h3>Les agents</h3><div class="cap">${a.runs} runs · <span style="color:var(--ok)">${a.ok} ✓</span> · <span style="color:${a.ko?'var(--err)':'inherit'}">${a.ko} ✗</span></div><div class="cap">${fmtTok(a.tok)} tokens · fiche de paie ›</div></section>`);
  }
  const html=out.join('');
  if(html===KPI_SIG)return;
  KPI_SIG=html;document.getElementById('kpis').innerHTML=html;
}
const fmtPts=n=>String(Math.round(n*10)/10).replace('.',',');
let FEED_EV=[];
const smChar=()=>chars.find(c=>c.roleKind==='sm')||null; // anime le daily et le sprint
// ---------- événements d'équipe du dataset team (changements de statut Jira, tickets créés, PR, reviews) ----------
const JIRA_ST={'To Do':'à faire','À faire':'à faire','To Frame':'à cadrer','Proposed':'proposé','En cours':'en cours','In Progress':'en cours',
  'To Review':'review','To Test':'test','To Deploy':'à déployer','Deployed':'déployé','Reopen':'réouvert','Done':'terminé'};
const jst=x=>JIRA_ST[x]||String(x||'').toLowerCase();
// le personnage d'un collègue : par compte Jira, sinon par nom (les collègues sans ticket ne sont pas dans TEAM.people)
function personChar(id,name){
  if(id){const c=chars.find(x=>x.team&&x.team.id===id);if(c)return c;}
  if(!name)return null;
  const full=nameKey(name), first=nameKey(String(name).split(' ')[0]);
  return chars.find(x=>x.person&&(nameKey(x.person)===full||nameKey(String(x.person).split(' ')[0])===first))||null;
}
function prOwnerChar(n){
  if(!TEAM)return null;
  const p=TEAM.people.find(q=>(q.prs||[]).some(x=>String(x.n)===String(n)));
  return p?personChar(p.id,p.name):null;
}
function teamEventTxt(e){
  const nm=(id,name)=>{const c=personChar(id,name);return {c,n:c?c.name:String(name||'Quelqu’un').split(' ')[0]};};
  const sum=e.summary?' <small>'+esc(clip(e.summary,70))+'</small>':'';
  if(e.kind==='move'){const w=nm(e.who,e.who_name);
    const col=CAT_COLOR[e.cat]||'var(--muted)';
    if(e.from==='Proposed'&&((TEAM&&TEAM.events)||[]).some(x=>x.kind==='new'&&x.key===e.key))return null; // création puis mise au planning : déjà « Nouveau ticket »
    return {c:w.c,txt:`<span style="color:${col}">➜</span> ${esc(w.n)} : <b>${esc(e.key)}</b> ${esc(jst(e.from))} → ${esc(jst(e.to))}${sum}`};}
  if(e.kind==='new'){const w=e.who?nm(e.who,null):null;
    return {c:w&&w.c,txt:`<span style="color:var(--info)">＋</span> Nouveau ticket <b>${esc(e.key)}</b>${w?' pour '+esc(w.n):''}${sum}`};}
  if(e.kind==='pr'){const w=nm(e.author,e.author_name);
    return {c:w.c,txt:`<span style="color:#7a5cc8">⇡</span> ${esc(w.n)} ouvre la PR <b>#${e.n}</b> <small>${esc(clip(e.title,70))}</small>`};}
  if(e.kind==='review'){
    if(e.by&&e.by===e.author)return null; // réponse de l'auteur sur sa propre PR
    const b=nm(e.by,e.by_name), a=nm(e.author,e.author_name), of=' de '+esc(a.n);
    if(e.state==='approved')return {c:b.c,txt:`<span style="color:var(--ok)">✓</span> ${esc(b.n)} approuve la PR <b>#${e.n}</b>${of}`};
    if(e.state==='changes')return {c:b.c,txt:`<span style="color:var(--warn)">✋</span> ${esc(b.n)} demande des changements sur <b>#${e.n}</b>${of}`};
    return {c:b.c,txt:`<span style="color:var(--muted)">💬</span> ${esc(b.n)} commente la PR <b>#${e.n}</b>${of}`};
  }
  return null;
}
function renderFeed(){
  if(!DATA)return;
  const ev=[];
  for(const c of chars)for(const r of (c.top||c.runs)){
    const g=c.visitor?null:c.key+'|'+(r.wf||''), done=r._e&&r._e<=T;
    if(r._s<=T)ev.push({
      t:r._s,
      c,
      agent:!c.visitor,grp:g,kind:'start',done,
      txt:c.visitor?`<span style="color:#d97757">●</span> ${esc(c.name)} arrive pour « ${esc(clean(c.disc.title).replace(/\s+/g,' ').slice(0,70))} »`:`${esc(c.name)} lance <b>${esc(clean(r.wf_name))}</b>`
    });
    if(done){
      const fs=(r.steps||[]).find(s=>s.s==='Failed'), ko=r.status==='Failed';
      ev.push({
        t:r._e,
        c,
        agent:!c.visitor,grp:g,kind:ko?'ko':'ok',wf:clean(r.wf_name),
        txt:ko?`<span style="color:var(--err)">✗</span> ${esc(c.name)} se plante${fs?' sur <b>'+esc(fs.n)+'</b>':''} <small>${esc((fs&&fs.err||'').slice(0,90))}</small>`:`<span style="color:var(--ok)">✓</span> ${esc(c.name)} termine <b>${esc(clean(r.wf_name))}</b> <small>${esc(fmtDur(r._e-r._s))}${r.tok?' · '+fmtTok(r.tok)+' tokens':''}</small>`
      });
    }
  }
  if(TEAM)for(const m of (TEAM.merged_today||[])){
    const t=ms(m.mergedAt);
    if(t>T)continue;
    const c=chars.find(x=>x.team&&x.team.id===m.who);
    ev.push({
      t,
      c:c||null,
      team:true,
      txt:`<span style="color:#7a5cc8">⇡</span> ${esc(c?c.name:m.author)} merge <b>#${m.n}</b> <small>${esc(m.title)}</small>`
    });
  }
  if(TEAM)for(const m of (TEAM.meps||[])){
    const c=chars.find(x=>x.team&&x.team.id===m.who)||null;
    const who=esc(c?c.name:(m.who_name||'Quelqu’un'));
    const tk=m.ticket?' <small>'+esc(m.ticket)+'</small>':'';
    const push=(t,txt)=>{if(t&&t<=T)ev.push({t,c,txt,tv:true,team:true});};
    push(ms(m.released),`<span style="color:#7a5cc8">●</span> ${who} publie la release <b>${esc(m.tag)}</b>${tk}`);
    if(m.staging&&m.staging.end)push(ms(m.staging.end),`<span style="color:#2e9e9b">●</span> <b>${esc(m.tag)}</b> ${m.staging.conclusion==='success'?'validée sur staging':'échoue sur staging'}`);
    if(m.prod)push(ms(m.prod.start),`<span style="color:#7a5cc8">🚀</span> <b>${esc(m.tag)}</b> part en prod`);
    if(m.prod&&m.prod.end)push(ms(m.prod.end),m.prod.conclusion==='success'?`<span style="color:var(--ok)">✓</span> <b>${esc(m.tag)}</b> est en prod${tk}`:`<span style="color:var(--err)">✗</span> <b>${esc(m.tag)}</b> échoue en prod`);
    }
  if(TEAM)for(const e of (TEAM.events||[])){const t=ms(e.t);if(t&&t<=T){const x=teamEventTxt(e);if(x)ev.push({t,c:x.c,txt:x.txt,team:true});}}
  // relectures et travaux des agents sur le ticket ou la PR d'un collègue (A1)
  for(const c of chars){if(c.person||c.visitor)continue;
    for(const r of c.runs){if(!r._e||r._e>T||r.status!=='Success')continue;const ref=runRef(r);if(!ref)continue;
      const pc=runPartner(r)||(ref.pr&&prOwnerChar(ref.pr)), what=ref.pr?'la PR #'+ref.pr:ref.key;
      ev.push({t:r._e,c,team:true,txt:`🤖 ${esc(c.name)} ${/review|revue|relu/i.test(r.wf_name||'')?'a relu':'a travaillé sur'} <b>${esc(what)}</b>${pc?' de '+esc(pc.name):''}${ref.pr&&ref.key?' <small>'+esc(ref.key)+'</small>':''}`});}}
  // sprint : lancement et fin du jour (A2)
  if(TEAM&&TEAM.sprint){const sp=TEAM.sprint, st=ms(sp.start), en=ms(sp.end), sameDay=x=>x&&parisDay(x)===parisDay(T);
    if(sameDay(st)&&st<=T)ev.push({t:st,c:smChar(),team:true,txt:`🏁 Le sprint <b>${esc(sp.name)}</b> commence <small>fin le ${esc(new Intl.DateTimeFormat('fr-FR',{timeZone:TZ,weekday:'short',day:'numeric',month:'short'}).format(new Date(en)))}</small>`});
    if(sameDay(en)&&en<=T){const d=dashData(T).sprint;ev.push({t:en,c:smChar(),team:true,txt:`🏁 Fin du sprint <b>${esc(sp.name)}</b> <small>${d&&d.ptsAll?Math.round(d.ptsDone/d.ptsAll*100)+' % des points terminés':''}</small>`});}}
  {
    const dt=DAY0+DAILY_MIN*60e3;
    if(dt<=T&&!['Sat','Sun'].includes(parisHM(dt).wd))ev.push({
      t:dt,
      c:smChar(),
      team:true,
      txt:`<span style="color:#2e9e9b">●</span> Daily de l'équipe en cafétéria`
    });
  }
  ev.sort((a,b)=>b.t-a.t);
  FEED_EV=ev;
  renderFeedList(feedView(ev,FEED_MODE));
}
// ---------- vue du fil : runs répétés regroupés, filtre « Important / Tout », séparateurs par heure ----------
const FEED_REPEAT=4, FEED_PAGE=30;
let FEED_MODE='important', FEED_N=FEED_PAGE, FEED_SIG='', FEED_VIEW=[];
try{FEED_MODE=localStorage.getItem('bureau:feed')||'important';}catch(e){}
// important : l'équipe, les MEP, les visiteurs et les échecs d'agents ; tout : en plus les lancements et les succès.
// Un même workflow lancé plus de FEED_REPEAT fois dans la journée (crons horaires) tient en une ligne : « ×21, 0 ✓ 21 ✗ ».
function feedView(ev,mode){
  const groups={};
  for(const e of ev)if(e.agent&&e.kind!=='start')(groups[e.grp]=groups[e.grp]||[]).push(e);
  const out=[], summarized=new Set();
  for(const e of ev){
    if(!e.agent){out.push(e);continue;}
    const g=groups[e.grp]||[];
    if(g.length>FEED_REPEAT){
      if(summarized.has(e.grp))continue;
      summarized.add(e.grp);
      const ko=g.filter(x=>x.kind==='ko').length, ok=g.length-ko, last=g[0];
      if(mode==='important'&&!ko)continue;
      out.push({t:last.t,c:last.c,txt:`<span style="color:${last.kind==='ko'?'var(--err)':'var(--ok)'}">${last.kind==='ko'?'✗':'✓'}</span> ${esc(last.c.name)} · <b>${esc(last.wf||'')}</b> <small>×${g.length} aujourd'hui · ${ok} ✓ · ${ko} ✗${last.kind==='ko'?' · dernier en échec':''}</small>`});
      continue;
    }
    if(e.kind==='start'&&e.done)continue; // le run est fini : sa ligne de fin dit tout
    if(mode==='important'&&e.kind!=='ko')continue;
    out.push(e);
  }
  return out;
}
function renderFeedList(view){
  FEED_VIEW=view;
  const box=document.getElementById('feed');
  let html='';
  if(!view.length)html=`<div class="empty">${FEED_MODE==='important'&&FEED_EV.length?'Rien d\'important pour l\'instant.':'Rien pour l\'instant. Le bureau est encore vide.'}</div>`;
  let lastH=null;
  view.slice(0,FEED_N).forEach((e,i)=>{
    const h=parisHM(e.t).h;
    if(h!==lastH){html+=`<div class="evh">${h} h</div>`;lastH=h;}
    html+=`<div class="ev${e.c?' fam-'+famOf(e.c):''}" data-i="${i}"><span class="tm">${hm(e.t)}</span><span class="x">${e.txt}</span></div>`;
  });
  if(view.length>FEED_N)html+=`<button class="feedmore" data-feed-more>Voir plus (${view.length-FEED_N})</button>`;
  const seg=document.getElementById('feedmode');
  if(seg)seg.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.mode===FEED_MODE));
  if(html===FEED_SIG)return;
  FEED_SIG=html;box.innerHTML=html;
}
document.getElementById('feed').addEventListener('click',ev=>{
  if(ev.target.closest('[data-feed-more]')){FEED_N+=FEED_PAGE;renderFeedList(FEED_VIEW);return;}
  const d=ev.target.closest('[data-i]');if(!d)return;
  const e=FEED_VIEW[+d.dataset.i];if(!e)return;
  if(e.tv)select('tv');else if(e.c)select(e.c.key);
});
{const seg=document.getElementById('feedmode');if(seg)seg.addEventListener('click',ev=>{
  const b=ev.target.closest('[data-mode]');if(!b)return;
  FEED_MODE=b.dataset.mode;FEED_N=FEED_PAGE;try{localStorage.setItem('bureau:feed',FEED_MODE);}catch(e){}
  renderFeedList(feedView(FEED_EV,FEED_MODE));
});}
