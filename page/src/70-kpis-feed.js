// ---------- tuiles KPI du haut et fil de la journée ----------
document.getElementById('kpis').addEventListener('click',e=>{
  const k=e.target.closest('[data-open]');if(k)select(k.dataset.open);
});
// tous les chiffres du haut de page et du mode TV, à l'instant t (une seule source pour les deux)
function dashData(t){
  let sprint=null, prod=null;
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
  return {sprint,prod,agents};
}
const plural=(n,a,b)=>n+' '+(n>1?b:a);
let KPI_SIG='', KPI_FIG=[]; // html complet ; chiffres de chaque tuile (une tuile dont un chiffre change clignote)
function renderKpis(){
  if(!DATA)return;
  const d=dashData(T), out=[], fig=[]; // fig : les chiffres de chaque tuile, sans le repère du temps qui avance
  if(d.sprint){ // 1. Sprint
    const s=d.sprint, c=s.cats, tot=Math.max(1,c.todo+c.doing+c.review+c.test+c.done), pct=s.ptsAll?Math.round(s.ptsDone/s.ptsAll*100):0;
    const seg=(k,col)=>c[k]?`<i style="width:${c[k]/tot*100}%;background:${col}" title="${c[k]} ${CAT_TXT[k]||'terminés'}"></i>`:'';
    out.push(`<section class="dash sprint"><h3>Sprint ${esc(s.name)}${s.j!=null?` <span class="j${s.j<=1?' hot':''}">J-${s.j}</span>`:''}</h3>`+
      `<div class="row"><div class="big">${pct}<small>%</small></div><div class="grow"><div class="meter"><i style="width:${pct}%"></i>${s.time!=null?`<u style="left:${s.time*100}%" title="Temps écoulé du sprint"></u>`:''}</div>`+
      `<div class="cap">${fmtPts(s.ptsDone)} / ${fmtPts(s.ptsAll)} points terminés${s.time!=null?' · '+Math.round(s.time*100)+' % du temps écoulé':''}</div></div></div>`+
      `<div class="stack">${seg('done','var(--idle)')}${seg('test',CAT_COLOR.test)}${seg('review',CAT_COLOR.review)}${seg('doing',CAT_COLOR.doing)}${seg('todo','var(--line)')}</div>`+
      `<div class="cap">${c.todo} à faire · <span style="color:${CAT_COLOR.doing}">${c.doing} en cours</span> · <span style="color:${CAT_COLOR.review}">${c.review} en review</span> · <span style="color:${CAT_COLOR.test}">${c.test} en test</span> · ${c.done} terminés</div>`+
      '</section>');
    fig.push([s.ptsDone,s.ptsAll,c.todo,c.doing,c.review,c.test,c.done].join());
  }
  if(!d.sprint){fig.push('');out.push(`<section class="dash sprint"><h3>L'équipe</h3><div class="calm muted">Pas encore de données Jira ni GitHub.</div><div class="cap">Elles arrivent avec le cron « équipe » (sprint, tickets, PR, mises en prod).</div></section>`);}
  if(d.prod){ // 2. Prod aujourd'hui
    const p=d.prod;
    const lines=[
      ...p.failed.map(x=>`<div class="cap err">✗ ${esc(x.m.tag)} : ${esc(MEP_TXT.failed)}${x.m.ticket?' · '+esc(x.m.ticket):''}</div>`),
      ...p.live.map(x=>`<div class="cap live">🚀 ${esc(x.m.tag)} : ${esc(MEP_TXT[x.phase])}${x.m.ticket?' · '+esc(x.m.ticket):''}</div>`),
      p.last?`<div class="cap">Dernière : <b>${esc(p.last.m.tag)}</b> à ${hm(ms(p.last.m.prod.end))}${p.last.m.ticket?' · '+esc(p.last.m.ticket):''}</div>`:'',
      p.closed?`<div class="cap">Plateau fermé : pas de MEP le vendredi ni le week-end</div>`:''
    ].filter(Boolean);
    fig.push([p.done,p.failed.length,p.live.length].join());
    out.push(`<section class="dash prod click${p.failed.length?' err':''}" data-open="tv"><h3>La prod aujourd'hui</h3><div class="row"><div class="big">${p.done}</div><div class="grow">${plural(p.done,'mise en prod','mises en prod')}</div></div>${lines.join('')}</section>`);
  }
  if(d.agents){ // 3. Agents (suivi, pas alerte)
    const a=d.agents, down=chars.some(c=>!c.person&&!c.visitor&&c._st&&c._st.st==='error');
    fig.push([a.runs,a.ok,a.ko,down].join());
    out.push(`<section class="dash agents click${down?' err':a.ko?' warn':''}" data-open="paie" title="Voir la fiche de paie"><h3>Les agents</h3><div class="cap">${a.runs} runs · <span style="color:var(--ok)">${a.ok} ✓</span> · <span style="color:${a.ko?'var(--err)':'inherit'}">${a.ko} ✗</span></div><div class="cap">${fmtTok(a.tok)} tokens · fiche de paie ›</div></section>`);
  }
  const html=out.join('');
  if(html===KPI_SIG)return;
  const box=document.getElementById('kpis'), first=!KPI_SIG;
  KPI_SIG=html;box.innerHTML=html;
  // une tuile dont un chiffre change clignote une fois (pas au premier affichage, ni en rejeu)
  fig.forEach((f,i)=>{if(!first&&mode==='live'&&KPI_FIG[i]!==undefined&&KPI_FIG[i]!==f&&box.children[i])box.children[i].classList.add('flash');});
  KPI_FIG=fig;
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
  if(id){const c=chars.find(x=>(x.team&&x.team.id===id)||(x.jira_id&&x.jira_id===id));if(c)return c;}
  if(!name)return null;
  const full=nameKey(name), first=nameKey(String(name).split(' ')[0]);
  return chars.find(x=>x.person&&(nameKey(x.person)===full||nameKey(String(x.person).split(' ')[0])===first))||null;
}
function prOwnerChar(n){
  if(!TEAM)return null;
  const p=TEAM.people.find(q=>(q.prs||[]).some(x=>String(x.n)===String(n)));
  return p?personChar(p.id,p.name):null;
}
// ---------- liens du fil : une étiquette par ticket, PR et version, un lien par personne ----------
// Dans la page d'abord (fiche), sinon dehors avec ↗ (Jira, GitHub), sinon du texte grisé qui dit pourquoi au survol.
const extA=(url,title,txt)=>`<a class="lk lk-id lk-ext" href="${esc(url)}" target="_blank" rel="noopener" title="${esc(title)}">${esc(txt)}</a>`;
function refWho(c,name){
  if(c)return `<a href="#" class="lk lk-who" data-who="${esc(c.key)}" title="Ouvrir sa fiche">${esc(c.name)}</a>`;
  return `<span class="lk-off" title="Pas dans l'équipe : pas de fiche">${esc(name||'Quelqu’un')}</span>`;
}
// ticket du sprint : sa fiche ; sinon (ou créé aujourd'hui : ext) Jira
function refTk(key,ext){
  if(!key)return '';
  if(!ext&&ticketOf(key))return `<a href="#" class="lk lk-id" data-tk="${esc(key)}" title="Ouvrir sa fiche">${esc(key)}</a>`;
  return extA(JIRA_BROWSE+encodeURIComponent(key),ext?'Ouvrir dans Jira':'Pas dans le sprint : ouvrir dans Jira',key);
}
// PR qui cite un ticket du sprint : la fiche de ce ticket (ses PR, Relire, Corriger) ; sinon GitHub ; sinon texte
function refPr(n,url){
  const p=[...((TEAM&&TEAM.people)||[]).flatMap(q=>q.prs||[]),...((TEAM&&TEAM.other_prs)||[])].find(x=>String(x.n)===String(n));
  const k=p&&(p.keys||[]).find(x=>ticketOf(x));
  if(k)return `<a href="#" class="lk lk-id" data-tk="${esc(k)}" title="Fiche du ticket ${esc(k)} : ses PR et ses actions">#${esc(n)}</a>`;
  const u=url||(p&&p.url)||(CFG.github_repo?`https://github.com/${CFG.github_repo}/pull/${encodeURIComponent(n)}`:'');
  return u?extA(u,'Ouvrir sur GitHub','#'+n):`<span class="lk-off" title="Dépôt GitHub inconnu">#${esc(n)}</span>`;
}
const refTag=tag=>`<a href="#" class="lk lk-id" data-mep title="Fiche de la mise en prod">${esc(tag)}</a>`;
function teamEventTxt(e){
  const nm=(id,name)=>{const c=personChar(id,name);return {c,n:c?c.name:String(name||'Quelqu’un').split(' ')[0],r:refWho(c,String(name||'Quelqu’un').split(' ')[0])};};
  const sum=e.summary?' <small>'+esc(clip(e.summary,70))+'</small>':'';
  if(e.kind==='move'){const w=nm(e.who,e.who_name);
    const col=CAT_COLOR[e.cat]||'var(--muted)';
    if(e.from==='Proposed'&&((TEAM&&TEAM.events)||[]).some(x=>x.kind==='new'&&x.key===e.key))return null; // création puis mise au planning : déjà « Nouveau ticket »
    return {c:w.c,txt:`<span style="color:${col}">➜</span> ${w.r} : ${refTk(e.key)} ${esc(jst(e.from))} → ${esc(jst(e.to))}${sum}`};}
  if(e.kind==='new'){const w=e.who?nm(e.who,null):null;
    return {c:w&&w.c,txt:`<span style="color:var(--info)">＋</span> Nouveau ticket ${refTk(e.key,true)}${w?' pour '+w.r:''}${sum}`};}
  if(e.kind==='pr'){const w=nm(e.author,e.author_name);
    return {c:w.c,txt:`<span style="color:#7a5cc8">⇡</span> ${w.r} ouvre la PR ${refPr(e.n,e.url)} <small>${esc(clip(e.title,70))}</small>`};}
  if(e.kind==='review'){
    if(e.by&&e.by===e.author)return null; // réponse de l'auteur sur sa propre PR
    const b=nm(e.by,e.by_name), a=nm(e.author,e.author_name), of=' de '+a.r, pr=refPr(e.n,e.url);
    if(e.state==='approved')return {c:b.c,txt:`<span style="color:var(--ok)">✓</span> ${b.r} approuve la PR ${pr}${of}`};
    if(e.state==='changes')return {c:b.c,txt:`<span style="color:var(--warn)">✋</span> ${b.r} demande des changements sur ${pr}${of}`};
    return {c:b.c,txt:`<span style="color:var(--muted)">💬</span> ${b.r} commente la PR ${pr}${of}`};
  }
  return null;
}
// pannes d'un agent jusqu'à t, avec la règle de l'alarme (failStreak) : en panne au ALARM_FAILS-ième échec d'affilée
// (runs de premier niveau), rétabli au succès suivant ; [{t, up, n, wf}], n = échecs d'affilée à ce moment
function agentDowns(c,t){
  const ids=new Set(c.runs.map(r=>r.run)), done=c.runs.filter(r=>!(r.parent&&ids.has(r.parent))&&r._s<=t&&t>=r._ve), out=[];
  let n=0;
  for(const r of done){
    if(r.status==='Failed'||r.status==='Cancelled'){if(++n===ALARM_FAILS)out.push({t:r._ve,up:false,n,wf:clean(r.wf_name)});}
    else{if(n>=ALARM_FAILS)out.push({t:r._ve,up:true,n,wf:clean(r.wf_name)});n=0;}
  }
  return out;
}
// ---------- la vie du bureau : cérémonies, visites, canard d'équipe (imp:false = seulement dans « Tout ») ----------
const duckLink=txt=>`<a href="#" class="lk lk-who" data-who="duck" title="Ouvrir la fiche du canard">${esc(txt)}</a>`;
function feedLifeEvents(t){
  const ev=[], today=x=>x&&x>=DAY0&&x<=t;
  // planning et rétro : à leur heure de début, si elles ont lieu ce jour-là (ceremonyAt : jour, semaine, réglages rhythm)
  for(const k of ['planning','retro']){
    const cf=RHYTHM[k]; if(!cf||!cf.at)continue;
    const [h,m]=String(cf.at).split(':').map(Number), cr=ceremonyAt(DAY0+((h||0)*60+(m||0))*60e3+1e3);
    if(!cr||cr.k!==k||!today(cr.start))continue;
    const host=ceremonyHost(cr), len=fmtDur(cr.end-cr.start);
    ev.push({t:cr.start,c:host,imp:false,txt:`${k==='planning'?'🗓️':'🔁'} ${esc(cr.title)} en salle de réunion <small>${host?(k==='planning'?'animé':'animée')+' par '+refWho(host)+' · ':''}${esc(len)}</small>`});
  }
  // visites : les hérauts avec leur événement (réouverture, mise en prod réussie), les invités à leur arrivée
  for(const c of chars){if(!c.guest)continue;
    const shout=n=>c.shout?` <small>« ${esc(String(c.shout).replace(/,?\s*\{name\}/g,n?' '+n:'').trim())} »</small>`:'';
    if(c.on==='reopen'){for(const m of teamMoves())if(m.kind==='reopened'&&today(m.t))ev.push({t:m.t,c,imp:false,txt:`🧙 ${refWho(c)} passe pour la réouverture de ${refTk(m.key)}${shout()}`});continue;}
    if(c.on==='prod'){if(TEAM)for(const z of (TEAM.meps||[])){const e=z.prod&&z.prod.end&&ms(z.prod.end);if(!today(e)||z.prod.conclusion!=='success')continue;
      const a=personChar(z.who,z.who_name), n=a?a.name:String(z.who_name||'').split(' ')[0];
      ev.push({t:e,c,imp:false,txt:`🧘 ${refWho(c)} passe féliciter ${a?refWho(a):esc(n||"l'équipe")} pour ${refTag(z.tag)}${shout(n)}`});}continue;}
    if(c.on)continue;
    const v=guestVisit(c,DAY0+12*36e5); if(!v||!today(v.s))continue;
    const p=/^Passe voir (.+?) ·/.exec((guestState(c,v.s+1e3)||{}).label||''), pc=p&&chars.find(x=>x.person&&x.name===p[1]);
    ev.push({t:v.s,c,imp:false,txt:`👋 ${refWho(c)} ${pc?'passe voir '+refWho(pc):'passe au bureau'} <small>jusqu'à ${hm(v.e)}</small>`});
  }
  // canard d'équipe : succès débloqué et caneton né (Important), changement de stade et mue (Tout)
  if(DUCKGAME){
    const T_=DUCKGAME.trophies||{};
    for(const x of DUCK_TROPHIES){const s=T_[x.id];if(s&&s.ok&&today(ms(s.at)))
      ev.push({t:ms(s.at),txt:`🏆 ${duckLink('Le canard')} débloque un succès : <b>${esc(x.name)}</b> <small>${esc(x.what)}</small>`});}
    const sp=(TEAM&&TEAM.sprint)||{}, last=DUCKGAME.sprints[0];
    if(last&&last.held&&today(ms(sp.start))&&DUCKGAME.sprint&&DUCKGAME.sprint.name===sp.name)
      ev.push({t:ms(sp.start),txt:`🐣 Un ${duckLink('caneton')} est né <small>le sprint ${esc(last.name)} a fait mieux que la moyenne des 4 d'avant</small>`});
    for(const s of duckStageTimes()){if(!today(s.at))continue;
      const to=DUCK_STAGES.find(d=>d.id===s.to)||{};
      ev.push({t:s.at,imp:false,txt:s.mue?`🦆 Nouveau sprint : ${duckLink('le canard')} mue <small>il repart de l'œuf</small>`
        :`🦆 ${duckLink('Le canard')} passe <b>${esc(to.name||'')}</b> <small>${Math.round((to.at||0)*100)} % des points visés sont terminés</small>`});}
  }
  return ev;
}
function renderFeed(){
  if(!DATA)return;
  const ev=[];
  // pannes et rétablissements : en « Important », elles remplacent la ligne « ×16 · 16 ✗ » de l'agent (feedView)
  for(const c of chars){if(c.person||c.visitor||c.guest||!c.runs)continue;
    for(const d of agentDowns(c,T))ev.push({t:d.t,c,down:c.key,
      txt:d.up?`<span style="color:var(--ok)">✅</span> ${refWho(c)} rétabli <small>après ${plural(d.n,'échec','échecs')} d'affilée</small>`
        :`🚨 ${refWho(c)} en panne <small>${d.n} échecs d'affilée sur <b>${esc(d.wf)}</b></small>`});}
  for(const c of chars)for(const r of (c.top||c.runs)){
    const g=c.visitor?null:c.key+'|'+(r.wf||''), done=r._e&&r._e<=T;
    if(r._s<=T)ev.push({
      t:r._s,
      c,
      agent:!c.visitor,grp:g,kind:'start',done,
      txt:c.visitor?`<span style="color:#d97757">●</span> ${refWho(c)} arrive pour « ${esc(clean(c.disc.title).replace(/\s+/g,' ').slice(0,70))} »`:`${refWho(c)} lance <b>${esc(clean(r.wf_name))}</b>`
    });
    if(done){
      const fs=(r.steps||[]).find(s=>s.s==='Failed'), ko=r.status==='Failed';
      ev.push({
        t:r._e,
        c,
        agent:!c.visitor,grp:g,kind:ko?'ko':'ok',wf:clean(r.wf_name),
        txt:ko?`<span style="color:var(--err)">✗</span> ${refWho(c)} se plante${fs?' sur <b>'+esc(fs.n)+'</b>':''} <small>${esc((fs&&fs.err||'').slice(0,90))}</small>`:`<span style="color:var(--ok)">✓</span> ${refWho(c)} termine <b>${esc(clean(r.wf_name))}</b> <small>${esc(fmtDur(r._e-r._s))}${r.tok?' · '+fmtTok(r.tok)+' tokens':''}</small>`
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
      txt:`<span style="color:#7a5cc8">⇡</span> ${refWho(c,m.author)} merge ${refPr(m.n,m.url)} <small>${esc(m.title)}</small>`
    });
  }
  if(TEAM)for(const m of (TEAM.meps||[])){
    const c=chars.find(x=>x.team&&x.team.id===m.who)||null;
    const who=refWho(c,String(m.who_name||'Quelqu’un').split(' ')[0]), tag=refTag(m.tag);
    const tk=m.ticket?' '+refTk(m.ticket):'';
    const push=(t,txt)=>{if(t&&t<=T)ev.push({t,c,txt,tv:true,team:true});};
    push(ms(m.released),`<span style="color:#7a5cc8">●</span> ${who} publie la release ${tag}${tk}`);
    if(m.staging&&m.staging.end)push(ms(m.staging.end),`<span style="color:#2e9e9b">●</span> ${tag} ${m.staging.conclusion==='success'?'validée sur staging':'échoue sur staging'}`);
    if(m.prod)push(ms(m.prod.start),`<span style="color:#7a5cc8">🚀</span> ${tag} part en prod`);
    if(m.prod&&m.prod.end)push(ms(m.prod.end),m.prod.conclusion==='success'?`<span style="color:var(--ok)">✓</span> ${tag} est en prod${tk}`:`<span style="color:var(--err)">✗</span> ${tag} échoue en prod`);
    }
  const created=TEAM?teamCreated(DAY0,T):[], createdKeys=new Set(created.map(x=>x.key)); // tickets créés aujourd'hui par l'équipe
  for(const x of created)ev.push({t:ms(x.created),c:x.c,tv:true,team:true,
    txt:`<span style="color:var(--info)">📝</span> ${refWho(x.c)} crée ${refTk(x.key,true)} <small>${esc(clip(x.summary,70))}</small>`});
  if(TEAM)for(const e of (TEAM.events||[])){const t=ms(e.t);if(t&&t<=T&&!(e.kind==='new'&&createdKeys.has(e.key))){const x=teamEventTxt(e);if(x)ev.push({t,c:x.c,txt:x.txt,team:true});}} // déjà « X crée »
  // relectures et travaux des agents sur le ticket ou la PR d'un collègue (A1)
  for(const c of chars){if(c.person||c.visitor)continue;
    for(const r of c.runs){if(!r._e||r._e>T||r.status!=='Success')continue;const ref=runRef(r);if(!ref)continue;
      const pc=runPartner(r)||(ref.pr&&prOwnerChar(ref.pr)), what=ref.pr?'la PR '+refPr(ref.pr):refTk(ref.key);
      ev.push({t:r._e,c,team:true,txt:`🤖 ${refWho(c)} ${/review|revue|relu/i.test(r.wf_name||'')?'a relu':'a travaillé sur'} ${what}${pc?' de '+refWho(pc):''}${ref.pr&&ref.key?' '+refTk(ref.key):''}`});}}
  // sprint : lancement et fin du jour (A2)
  if(TEAM&&TEAM.sprint){const sp=TEAM.sprint, st=ms(sp.start), en=ms(sp.end), sameDay=x=>x&&parisDay(x)===parisDay(T);
    if(sameDay(st)&&st<=T)ev.push({t:st,c:smChar(),team:true,txt:`🏁 Le sprint <b>${esc(sp.name)}</b> commence <small>fin le ${esc(dtf('fr-FR',{weekday:'short',day:'numeric',month:'short'}).format(new Date(en)))}</small>`});
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
  ev.push(...feedLifeEvents(T));
  ev.sort((a,b)=>b.t-a.t);
  FEED_EV=ev;
  renderFeedList(feedView(ev,FEED_MODE));
}
// ---------- vue du fil : runs répétés regroupés, filtre « Important / Tout », séparateurs par heure ----------
const FEED_REPEAT=4, FEED_PAGE=30;
let FEED_MODE='important', FEED_N=FEED_PAGE, FEED_SIG='', FEED_VIEW=[];
try{FEED_MODE=localStorage.getItem('bureau:feed')||'important';}catch(e){}
// important : l'équipe, les MEP, les visiteurs, les pannes et les échecs d'agents ; tout : en plus les lancements et les succès.
// Un même workflow lancé plus de FEED_REPEAT fois dans la journée (crons horaires) tient en une ligne : « ×21, 0 ✓ 21 ✗ ».
// jour des données affichées : « aujourd'hui », sinon « hier » ou la date (avant le premier cron du matin, c'est la veille)
function dataDayWord(){
  const d=Math.round((parisMidnight(Date.now())-DAY0)/864e5);
  return d<=0?"aujourd'hui":d===1?'hier':'le '+dtf('fr-FR',{weekday:'long',day:'numeric'}).format(new Date(DAY0+12*36e5));
}
function feedView(ev,mode){
  const groups={};
  for(const e of ev)if(e.agent&&e.kind!=='start')(groups[e.grp]=groups[e.grp]||[]).push(e);
  const out=[], summarized=new Set(), down=new Set(ev.filter(e=>e.down).map(e=>e.down));
  for(const e of ev){
    if(!e.agent){if(mode!=='important'||e.imp!==false)out.push(e);continue;}
    const g=groups[e.grp]||[];
    if(g.length>FEED_REPEAT){
      if(summarized.has(e.grp))continue;
      summarized.add(e.grp);
      const ko=g.filter(x=>x.kind==='ko').length, ok=g.length-ko, last=g[0];
      if(mode==='important'&&(!ko||down.has(last.c.key)))continue; // en panne : ses lignes de panne le disent mieux
      out.push({t:last.t,c:last.c,txt:`<span style="color:${last.kind==='ko'?'var(--err)':'var(--ok)'}">${last.kind==='ko'?'✗':'✓'}</span> ${refWho(last.c)} · <b>${esc(last.wf||'')}</b> <small>×${g.length} ${dataDayWord()} · ${ok} ✓ · ${ko} ✗${last.kind==='ko'?' · dernier en échec':''}</small>`});
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
  const ttl=document.getElementById('feedtitle'), w=dataDayWord();
  if(ttl)ttl.textContent=w==="aujourd'hui"?'Fil de la journée':'Fil de la journée · '+w;
  const seg=document.getElementById('feedmode');
  if(seg)seg.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.mode===FEED_MODE));
  if(html===FEED_SIG)return;
  FEED_SIG=html;box.innerHTML=html;
}
document.getElementById('feed').addEventListener('click',ev=>{
  if(ev.target.closest('[data-feed-more]')){FEED_N+=FEED_PAGE;renderFeedList(FEED_VIEW);return;}
  const lk=ev.target.closest('.lk');
  if(lk){ // un lien de la ligne : data-tk (fiche du ticket) est pris par le gestionnaire commun de 62-ticket.js, ↗ s'ouvre seul
    if(lk.dataset.who){ev.preventDefault();select(lk.dataset.who);}
    else if(lk.hasAttribute('data-mep')){ev.preventDefault();select('tv');}
    return;
  }
  const d=ev.target.closest('[data-i]');if(!d)return;
  const e=FEED_VIEW[+d.dataset.i];if(!e)return;
  if(e.tv)select('tv');else if(e.c)select(e.c.key);
});
// survol d'un nom du fil : la personne s'allume sur le plan (comme une carte de « Qui fait quoi »)
document.getElementById('feed').addEventListener('mouseover',e=>{const a=e.target.closest('.lk-who');hoverKey=a?a.dataset.who:null;});
document.getElementById('feed').addEventListener('mouseleave',()=>{hoverKey=null;});
{const seg=document.getElementById('feedmode');if(seg)seg.addEventListener('click',ev=>{
  const b=ev.target.closest('[data-mode]');if(!b)return;
  FEED_MODE=b.dataset.mode;FEED_N=FEED_PAGE;try{localStorage.setItem('bureau:feed',FEED_MODE);}catch(e){}
  renderFeedList(feedView(FEED_EV,FEED_MODE));
});}
