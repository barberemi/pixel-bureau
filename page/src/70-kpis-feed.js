// ---------- tuiles KPI du haut et fil de la journée ----------
document.getElementById('kpis').addEventListener('click',e=>{
  const k=e.target.closest('[data-open]');if(k)select(k.dataset.open);
});
document.getElementById('kpis').addEventListener('keydown',keyClick);
// redessin d'une zone par innerHTML : le focus clavier revient à l'élément de même attr (sinon il tombe sur <body>)
function keepFocus(box,attr,draw){
  const a=document.activeElement, v=a&&a!==document.body&&box.contains&&box.contains(a)&&a.getAttribute&&a.getAttribute(attr);
  draw();
  if(v!=null&&v!==false){const e=box.querySelector(`[${attr}="${v}"]`);if(e)e.focus();}
}
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
      `<div class="stack">${seg('done',CAT_COLOR.done)}${seg('test',CAT_COLOR.test)}${seg('review',CAT_COLOR.review)}${seg('doing',CAT_COLOR.doing)}${seg('todo','var(--line)')}</div>`+
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
    out.push(`<section class="dash prod click${p.failed.length?' err':''}" data-open="tv" tabindex="0" role="button"><h3>La prod aujourd'hui</h3><div class="row"><div class="big">${p.done}</div><div class="grow">${plural(p.done,'mise en prod','mises en prod')}</div></div>${lines.join('')}</section>`);
  }
  if(d.agents){ // 3. Agents (suivi, pas alerte)
    const a=d.agents, down=chars.some(c=>!c.person&&!c.visitor&&c._st&&c._st.st==='error');
    fig.push([a.runs,a.ok,a.ko,down].join());
    out.push(`<section class="dash agents click${down?' err':a.ko?' warn':''}" data-open="paie" tabindex="0" role="button" title="Voir la fiche de paie"><h3>Les agents</h3><div class="cap">${a.runs} runs · <span style="color:var(--ok)">${a.ok} ✓</span> · <span style="color:${a.ko?'var(--err)':'inherit'}">${a.ko} ✗</span></div><div class="cap">${fmtTok(a.tok)} tokens · fiche de paie ›</div></section>`);
  }
  const html=out.join('');
  if(html===KPI_SIG)return;
  const box=document.getElementById('kpis'), first=!KPI_SIG;
  KPI_SIG=html;keepFocus(box,'data-open',()=>{box.innerHTML=html;});
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
  const g=ghChar(name);if(g)return g; // une review GitHub ne donne que le login (« pam-beesly ») : son personnage, sous son nom
  const full=nameKey(name), first=nameKey(String(name).split(' ')[0]);
  return chars.find(x=>x.person&&(nameKey(x.person)===full||nameKey(String(x.person).split(' ')[0])===first))||null;
}
// le personnage d'un compte GitHub (roster : github, équipe : gh), casse ignorée ; null si personne
function ghChar(login){
  const l=String(login||'').toLowerCase();
  if(!l)return null;
  return chars.find(x=>x.person&&(String(x.github||'').toLowerCase()===l||((x.team&&x.team.gh)||[]).some(g=>String(g).toLowerCase()===l)))||null;
}
function prOwnerChar(n,repo){
  if(!TEAM)return null;
  const p=TEAM.people.find(q=>(q.prs||[]).some(x=>samePr(x,repo,n)));
  return p?personChar(p.id,p.name):null;
}
// ---------- liens du fil : une étiquette par ticket, PR et version, un lien par personne ----------
// Dans la page d'abord (fiche), sinon dehors avec ↗ (Jira, GitHub), sinon du texte grisé qui dit pourquoi au survol.
const extA=(url,title,txt)=>`<a class="lk lk-id lk-ext" ${hrefOf(url)} target="_blank" rel="noopener" title="${esc(title)}">${esc(txt)}</a>`;
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
// PR : toujours sa fiche dans le panneau (62-ticket.js), nommée par son dépôt (« front_web#2033 ») ; repo absent :
// le dépôt de l'équipe (github_repo), inconnu : « #2033 »
function refPr(n,url,repo){
  const r=otherRepo(repo)?repo:(CFG.github_repo||''), nm=r?r.split('/')[1]+'#'+n:'#'+n;
  return `<a href="#" class="lk lk-id" data-pr="${esc(r+'#'+n)}" title="Fiche de la PR">${esc(nm)}</a>`;
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
  if(e.kind==='sprint_in'){const w=e.who?nm(e.who,e.who_name):null;
    return {c:w&&w.c,txt:`🛸 ${refTk(e.key)} arrive en cours de sprint${e.points?' ('+e.points+' pts)':''}${w?' pour '+w.r:''}${sum}`};}
  if(e.kind==='pr'){const w=nm(e.author,e.author_name);
    return {c:w.c,txt:`<span style="color:${MEP_COLOR}">⇡</span> ${w.r} ouvre la PR ${refPr(e.n,e.url,e.repo)} <small>${esc(clip(e.title,70))}</small>`};}
  if(e.kind==='review'){
    if(e.by&&e.by===e.author)return null; // réponse de l'auteur sur sa propre PR
    const b=nm(e.by,e.by_name), a=nm(e.author,e.author_name), of=' de '+a.r, pr=refPr(e.n,e.url,e.repo);
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
      const a=mepChar(z), n=mepName(z);
      ev.push({t:e,c,imp:false,txt:`🧘 ${refWho(c)} passe féliciter ${a?refWho(a):esc(n||"l'équipe")} pour ${refTag(z.tag)}${shout(n)}`});}continue;}
    if(c.on==='coffee'){const r=coffeeTour(c,DAY0+12*36e5);if(r&&today(r.s)) // 49-coffee.js : une ligne à son arrivée
      ev.push({t:r.s,c,imp:false,txt:'☕ '+String(c.feed||"{name} apporte le café à l'équipe").split('{name}').map(esc).join(refWho(c))});continue;}
    if(c.on==='cleaning'){const v=cleaningVisit(c,DAY0+12*36e5);if(v&&today(v.s)){ // 49-menage.js : son arrivée et son départ
      ev.push({t:v.s,c,imp:false,txt:`🧹 ${refWho(c)} commence le ménage du soir`});
      if(today(v.e))ev.push({t:v.e,c,imp:false,txt:`🧹 ${refWho(c)} a fini le ménage, le bureau est propre`});}continue;}
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
// ---------- « En ce moment » : ce qui t'attend à l'heure affichée, et les repères du jour ; en haut du fil, hors de la liste ----------
// étapes Gate des runs d'agents (premier niveau) : attente en cours à t, ou décision prise (Success = validée, Failed = refusée)
function gateSteps(t){
  const out=[];
  for(const c of chars){if(c.person||c.visitor||c.guest||!c.runs)continue;
    for(const r of c.runs){if(r._s>t)continue;
      for(const s of (r.steps||[])){if(s.k!=='Gate'||!s.at||ms(s.at)>t)continue;
        // run arrêté (annulé) pendant la gate : Kronn laisse l'étape en WaitingApproval, la gate se ferme à la fin du run
        const a=ms(s.at), live=['Running','Pending','WaitingApproval'].includes(r.status), cut=s.s==='WaitingApproval'&&!live,
          e=s.s!=='WaitingApproval'?a+(s.ms||0):cut?Math.max(a,ms(r.end)||a):Infinity;
        out.push({c,r,n:s.n,since:a,end:e,ok:s.s!=='Failed',cut,waiting:e>t});}}}
  return out;
}
const waitSince=(a,t)=>`<b class="since">depuis ${hm(a)} · ${esc(fmtDur(t-a))}</b>`;
// une seule ligne : MEP du jour (plateau fermé), fin ou début du sprint, week-end
function landmarks(t){
  const p=[], wd=parisHM(t).wd, next=parisHM(t+864e5).wd, day=dtf('fr-FR',{weekday:'long'}).format(new Date(t));
  if(RHYTHM.weekend.includes(wd))p.push("C'est le week-end");
  else if(stageClosed(t))p.push(`Pas de MEP aujourd'hui <small>(${esc(day)})</small>`);
  else if(stageClosed(t+864e5))p.push(`Dernière MEP de la semaine <small>plateau fermé demain</small>`);
  const sp=TEAM&&TEAM.sprint, st=sp&&ms(sp.start), en=sp&&ms(sp.end);
  if(en&&en>=t){const name=`<a href="#" class="lk lk-id" data-sprint title="Voir le sprint">${esc(sp.name)}</a>`, j=daysLeft(en,t);
    if(st&&parisDay(st)===parisDay(t))p.push(`Premier jour du sprint ${name}`);
    else if(j===0)p.push(`Dernier jour du sprint ${name}`);
    else if(j===1)p.push(`Fin du sprint ${name} demain`);
    else if(j<=3)p.push(`Fin du sprint ${name} dans ${j} jours`);}
  if(!RHYTHM.weekend.includes(wd)&&RHYTHM.weekend.includes(next)&&parisHM(t).h>=15)p.push('Bon week-end');
  return p.length?'📌 '+p.join(' · '):'';
}
function feedPins(t){
  const out=[];
  for(const g of gateSteps(t))if(g.waiting){const ref=runRef(g.r);
    out.push({t:g.since,c:g.c,txt:`✋ ${refWho(g.c)} attend ta validation <small>« ${esc(g.n)} »${ref&&ref.key?' · '+refTk(ref.key):''}</small> ${waitSince(g.since,t)}`});}
  for(const g of loneGates()){const a=ms(g.since);if(a&&a<=t)out.push({t:a,c:chars.find(x=>x.boss)||null,
    txt:`✋ <b>${esc(clean(g.wf_name))}</b> attend ta validation <small>« ${esc(g.gate)} »</small> ${waitSince(a,t)}`});}
  for(const c of chars)if(c.visitor&&c._st&&c._st.st==='ask'){const qs=c._st.qs||[], a=qs.length?Math.min(...qs.map(q=>ms(q.since)||t)):Math.min(t,ms(c.disc.end)||t);
    out.push({t:a,c,txt:`💬 ${refWho(c)} attend ta réponse <small>« ${esc(clip(clean(c.disc.title),60))} »</small> ${waitSince(a,t)}`});}
  for(const q of loneQuestions(t))if(!String(q.title||'').startsWith('🦆')){const a=ms(q.since)||t; // « interroger un agent » (le canard : ci-dessous)
    out.push({t:a,c:chars.find(x=>x.boss)||null,txt:`💬 <b>${esc(askerOf(q))}</b> attend ta réponse <small>« ${esc(clip(clean(q.title),60))} »</small> ${waitSince(a,t)}`});}
  for(const d of DUCKS)if(d.awaiting){const a=ms(d.updated);if(a&&a<=t)out.push({t:a,duck:true,
    txt:`🦆 ${duckLink('Le canard')} attend ta réponse <small>« ${esc(clip(String(d.title).replace(/^🦆\s*/,''),60))} »</small> ${waitSince(a,t)}`});}
  out.sort((a,b)=>a.t-b.t);
  const lm=landmarks(t); if(lm)out.push({t:null,txt:lm});
  return out;
}
// ---------- tes actions (hors validations, dans gateSteps) : un lancement compte (Important), un mot posé se raconte (Tout) ----------
function feedMyActions(t){
  const ev=[], today=x=>x&&x>=DAY0&&x<=t;
  // runs lancés à la main (« man » : bouton du Bureau, page d'un workflow, Kronn) : relance, ou travail sur un ticket
  for(const c of chars){if(c.person||c.visitor||c.guest||!c.runs)continue;
    const top=c.top||c.runs;
    top.forEach((r,i)=>{if(!r.man||!today(r._s))return;
      const key=r.vars&&r.vars.jira_ticket_key, wf=clean(r.wf_name);
      ev.push({t:r._s,c,txt:key?`🤖 Tu lances <a href="#" class="lk lk-who" data-who="${esc(c.key)}" title="Ouvrir sa fiche">${esc(wf)}</a> sur ${refTk(key)} <small>${refWho(c)} s'y met</small>`
        :(top.slice(0,i).some(x=>today(x._s))?`🔁 Tu relances ${refWho(c)}`:`▶️ Tu lances ${refWho(c)}`)+` <small>${esc(wf)}</small>`});});}
  for(const a of ((DATA&&DATA.actions)||[])){const at=ms(a.at);if(!today(at))continue;
    if(a.k==='comment')ev.push({t:at,imp:false,txt:`💬 Tu commentes ${refTk(a.key)} <small>« ${esc(a.txt||'')} »${a.ok?'':' · échec'}</small>`});
    if(a.k==='ask'){const c=a.wf&&chars.find(x=>x.wf&&x.wf.includes(String(a.wf).slice(0,8)));
      ev.push({t:at,c,imp:false,txt:`❓ Tu interroges ${c?refWho(c):'un agent'}${a.q?` <small>« ${esc(a.q)} »</small>`:''}`});}}
  for(const d of DUCKS){const at=ms(d.created);if(today(at))ev.push({t:at,imp:false,duck:true,
    txt:`🦆 Tu ouvres une discussion avec ${duckLink('le canard')} <small>« ${esc(clip(String(d.title).replace(/^🦆\s*/,''),60))} »</small>`});}
  return ev;
}
let FEED_PIN=[];
function renderFeed(){
  if(!DATA)return;
  const ev=[];
  FEED_PIN=feedPins(T);
  // tes décisions : la gate quitte « En ce moment » et entre dans le fil
  for(const g of gateSteps(T))if(!g.waiting)ev.push({t:g.end,c:g.c,ty:'toi',
    txt:g.cut?`⏹ Gate de ${refWho(g.c)} close sans décision <small>« ${esc(g.n)} » · run arrêté après ${esc(fmtDur(g.end-g.since))} d'attente</small>`
      :g.ok?`<span style="color:var(--ok)">✅</span> Tu valides la gate de ${refWho(g.c)} <small>« ${esc(g.n)} » · après ${esc(fmtDur(g.end-g.since))} d'attente</small>`
      :`⛔ Tu refuses la gate de ${refWho(g.c)} <small>« ${esc(g.n)} » · après ${esc(fmtDur(g.end-g.since))} d'attente</small>`});
  // pannes et rétablissements : en « Important », elles remplacent la ligne « ×16 · 16 ✗ » de l'agent (feedView)
  for(const c of chars){if(c.person||c.visitor||c.guest||!c.runs)continue;
    for(const d of agentDowns(c,T))ev.push({t:d.t,c,down:c.key,ty:'agents',
      txt:d.up?`<span style="color:var(--ok)">✅</span> ${refWho(c)} rétabli <small>après ${plural(d.n,'échec','échecs')} d'affilée</small>`
        :`🚨 ${refWho(c)} en panne <small>${d.n} échecs d'affilée sur <b>${esc(d.wf)}</b></small>`});}
  for(const c of chars)for(const r of (c.top||c.runs)){
    const g=c.visitor?null:c.key+'|'+(r.wf||''), done=r._e&&r._e<=T;
    if(r._s<=T)ev.push({
      t:r._s,
      c,
      agent:!c.visitor,grp:g,kind:'start',done,ty:'agents',
      txt:c.visitor?`<span style="color:#d97757">●</span> ${refWho(c)} arrive pour « ${esc(clean(c.disc.title).replace(/\s+/g,' ').slice(0,70))} »`:`${refWho(c)} lance <b>${esc(clean(r.wf_name))}</b>`
    });
    if(done){
      const fs=(r.steps||[]).find(s=>s.s==='Failed'), ko=r.status==='Failed';
      ev.push({
        t:r._e,
        c,
        agent:!c.visitor,grp:g,kind:ko?'ko':'ok',wf:clean(r.wf_name),ty:'agents',
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
      team:true,ty:'pr',
      txt:`<span style="color:${MEP_COLOR}">⇡</span> ${refWho(c,m.author)} merge ${refPr(m.n,m.url,m.repo)} <small>${esc(m.title)}</small>`
    });
  }
  if(TEAM)for(const m of (TEAM.meps||[])){
    const c=mepChar(m);
    const who=refWho(c,mepName(m)||'Quelqu’un'), tag=refTag(m.tag);
    const tk=m.ticket?' '+refTk(m.ticket):'';
    const push=(t,txt)=>{if(t&&t<=T)ev.push({t,c,txt,tv:true,team:true,ty:'mep'});};
    push(ms(m.released),`<span style="color:${MEP_COLOR}">●</span> ${who} publie la release ${tag}${tk}`);
    if(m.staging&&m.staging.end)push(ms(m.staging.end),`<span style="color:#2e9e9b">●</span> ${tag} ${m.staging.conclusion==='success'?'validée sur staging':'échoue sur staging'}`);
    // qui a lancé le déploiement (login du run), s'il est connu ; sinon la version part en prod
    if(m.prod)push(ms(m.prod.start),m.prod.by?`<span style="color:${MEP_COLOR}">🚀</span> ${refWho(byChar(m.prod.by),m.prod.by)} met ${tag} en prod`:`<span style="color:${MEP_COLOR}">🚀</span> ${tag} part en prod`);
    if(m.prod&&m.prod.end)push(ms(m.prod.end),m.prod.conclusion==='success'?`<span style="color:var(--ok)">✓</span> ${tag} est en prod${tk}`:`<span style="color:var(--err)">✗</span> ${tag} échoue en prod`);
    }
  const created=TEAM?teamCreated(DAY0,T):[], createdKeys=new Set(created.map(x=>x.key)); // tickets créés aujourd'hui par l'équipe
  for(const x of created)ev.push({t:ms(x.created),c:x.c,tv:true,team:true,ty:'tickets',
    txt:`<span style="color:var(--info)">📝</span> ${refWho(x.c)} crée ${refTk(x.key,true)} <small>${esc(clip(x.summary,70))}</small>`});
  if(TEAM)for(const e of (TEAM.events||[])){const t=ms(e.t);if(t&&t<=T&&!(e.kind==='new'&&createdKeys.has(e.key))){const x=teamEventTxt(e);if(x)ev.push({t,c:x.c,txt:x.txt,team:true,ty:e.kind==='pr'||e.kind==='review'?'pr':'tickets'});}} // déjà « X crée »
  // relectures et travaux des agents sur le ticket ou la PR d'un collègue (A1)
  for(const c of chars){if(c.person||c.visitor)continue;
    for(const r of c.runs){if(!r._e||r._e>T||r.status!=='Success')continue;const ref=runRef(r);if(!ref)continue;
      const au=r.vars&&r.vars['current_task.author'], pc=runPartner(r)||ghChar(au)||(ref.pr&&prOwnerChar(ref.pr,ref.repo)), what=ref.pr?'la PR '+refPr(ref.pr,null,ref.repo):refTk(ref.key);
      ev.push({t:r._e,c,team:true,ty:ref.pr?'pr':'tickets',txt:`🤖 ${refWho(c)} ${/review|revue|relu/i.test(r.wf_name||'')?'a relu':'a travaillé sur'} ${what}${pc||au?' de '+refWho(pc,au):''}${ref.pr&&ref.key?' '+refTk(ref.key):''}`});}}
  // sprint : lancement et fin du jour (A2)
  if(TEAM&&TEAM.sprint){const sp=TEAM.sprint, st=ms(sp.start), en=ms(sp.end), sameDay=x=>x&&parisDay(x)===parisDay(T);
    if(sameDay(st)&&st<=T)ev.push({t:st,c:smChar(),team:true,ty:'equipe',txt:`🏁 Le sprint <b>${esc(sp.name)}</b> commence <small>fin le ${esc(dtf('fr-FR',{weekday:'short',day:'numeric',month:'short'}).format(new Date(en)))}</small>`});
    if(sameDay(en)&&en<=T){const d=dashData(T).sprint;ev.push({t:en,c:smChar(),team:true,ty:'equipe',txt:`🏁 Fin du sprint <b>${esc(sp.name)}</b> <small>${d&&d.ptsAll?Math.round(d.ptsDone/d.ptsAll*100)+' % des points terminés':''}</small>`});}}
  {
    const dt=DAY0+DAILY_MIN*60e3;
    if(dt<=T&&!['Sat','Sun'].includes(parisHM(dt).wd))ev.push({
      t:dt,
      c:smChar(),
      team:true,ty:'equipe',
      txt:`<span style="color:#2e9e9b">●</span> Daily de l'équipe en cafétéria`
    });
  }
  ev.push(...feedLifeEvents(T).map(e=>({ty:'equipe',...e})),...feedMyActions(T).map(e=>({ty:'toi',...e})));
  ev.sort((a,b)=>b.t-a.t);
  FEED_EV=ev;
  showFeed();
}
// ---------- vue du fil : runs répétés regroupés, filtre « Important / Tout », séparateurs par heure ----------
const FEED_REPEAT=4, FEED_PAGE=30;
let FEED_MODE='important', FEED_N=FEED_PAGE, FEED_SIG='', FEED_VIEW=[], FEED_ALL=[];
try{FEED_MODE=localStorage.getItem('bureau:feed')||'important';}catch(e){}
// filtre par type (pastilles, en plus d'« Important / Tout ») : on retient les types éteints, un type nouveau est donc allumé
const FEED_TYPES=[['toi','Toi','🙋'],['agents','Agents','🤖'],['tickets','Tickets','📝'],['pr','PR','⇡'],['mep','MEP','🚀'],['equipe','Équipe','👥']];
let FEED_OFF=new Set();
try{FEED_OFF=new Set(JSON.parse(localStorage.getItem('bureau:feedtypes')||'[]'));}catch(e){}
function showFeed(){const all=feedView(FEED_EV,FEED_MODE);renderFeedList(all.filter(e=>!FEED_OFF.has(e.ty||'equipe')),all);}
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
      out.push({t:last.t,c:last.c,ty:'agents',txt:`<span style="color:${last.kind==='ko'?'var(--err)':'var(--ok)'}">${last.kind==='ko'?'✗':'✓'}</span> ${refWho(last.c)} · <b>${esc(last.wf||'')}</b> <small>×${g.length} ${dataDayWord()} · ${ok} ✓ · ${ko} ✗${last.kind==='ko'?' · dernier en échec':''}</small>`});
      continue;
    }
    if(e.kind==='start'&&e.done)continue; // le run est fini : sa ligne de fin dit tout
    if(mode==='important'&&e.kind!=='ko')continue;
    out.push(e);
  }
  return out;
}
// « ⏵ revoir » d'une ligne du fil (replayAt, 80-input.js) : seulement dans la journée rejouable, pas en mode TV
const rvBtn=t=>!TV&&t>=RSTART&&t<=REND?`<button class="rv" data-rv="${t}" title="Revoir ce moment sur le plan : 20 s avant, en ×1" aria-label="Revoir ${hm(t)} sur le plan">⏵ revoir</button>`:'';
function renderFeedList(view,all=FEED_ALL){
  FEED_VIEW=view;FEED_ALL=all;
  const box=document.getElementById('feed');
  let html=FEED_PIN.length?`<div class="feedpin"><div class="pinh">En ce moment</div>${FEED_PIN.map((e,i)=>
    `<div class="ev" data-pin="${i}"${e.duck||e.c?' tabindex="0" role="button"':''}><span class="tm">${e.t?hm(e.t):'auj.'}</span><span class="x">${e.txt}</span></div>`).join('')}</div>`:'';
  if(!view.length)html+=`<div class="empty">${all.length?'Rien pour ces types : rallume une pastille.':FEED_MODE==='important'&&FEED_EV.length?'Rien d\'important pour l\'instant.':'Rien pour l\'instant. Le bureau est encore vide.'}</div>`;
  let lastH=null;
  view.slice(0,FEED_N).forEach((e,i)=>{
    const h=parisHM(e.t).h;
    if(h!==lastH){html+=`<div class="evh">${h} h</div>`;lastH=h;}
    html+=`<div class="ev${e.c?' fam-'+famOf(e.c):''}" data-i="${i}"${e.tv||e.duck||e.c?' tabindex="0" role="button"':''}><span class="tm">${hm(e.t)}</span>${rvBtn(e.t)}<span class="x">${e.txt}</span></div>`;
  });
  if(view.length>FEED_N)html+=`<button class="feedmore" data-feed-more>Voir plus (${view.length-FEED_N})</button>`;
  const ttl=document.getElementById('feedtitle'), w=dataDayWord();
  if(ttl)ttl.textContent=w==="aujourd'hui"?'Fil de la journée':'Fil de la journée · '+w;
  const seg=document.getElementById('feedmode');
  if(seg)seg.querySelectorAll('button').forEach(b=>{const on=b.dataset.mode===FEED_MODE;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));});
  const tys=document.getElementById('feedtypes');
  if(tys){const n={};all.forEach(e=>{const k=e.ty||'equipe';n[k]=(n[k]||0)+1;});
    const th=FEED_TYPES.map(([k,l,i])=>`<button data-ty="${k}" class="${FEED_OFF.has(k)?'':'on'}" aria-pressed="${!FEED_OFF.has(k)}" title="${FEED_OFF.has(k)?'Montrer':'Masquer'} : ${l}">${i} ${l} <small>${n[k]||0}</small></button>`).join('');
    if(tys.innerHTML!==th)tys.innerHTML=th;}
  if(html===FEED_SIG)return;
  FEED_SIG=html;
  const a=document.activeElement, pin=a&&a.getAttribute&&a.getAttribute('data-pin')!=null;
  keepFocus(box,pin?'data-pin':'data-i',()=>{box.innerHTML=html;});
}
document.getElementById('feed').addEventListener('keydown',keyClick);
document.getElementById('feed').addEventListener('click',ev=>{
  if(ev.target.closest('[data-feed-more]')){FEED_N+=FEED_PAGE;renderFeedList(FEED_VIEW);return;}
  const rv=ev.target.closest('[data-rv]'); // 80-input.js : revoir le moment sur le plan
  if(rv){replayAt(+rv.dataset.rv);const s=document.querySelector('.stage');if(s)s.scrollIntoView({behavior:SCROLL_BEHAVIOR,block:'start'});return;}
  const lk=ev.target.closest('.lk');
  if(lk){ // un lien de la ligne : data-tk (fiche du ticket) est pris par le gestionnaire commun de 62-ticket.js, ↗ s'ouvre seul
    if(lk.dataset.who){ev.preventDefault();select(lk.dataset.who);}
    else if(lk.hasAttribute('data-mep')){ev.preventDefault();select('tv');}
    else if(lk.hasAttribute('data-sprint')){ev.preventDefault();const s=document.querySelector('#kpis .sprint'); // la tuile du sprint
      if(s){s.scrollIntoView({behavior:SCROLL_BEHAVIOR,block:'center'});s.classList.remove('flash');void s.offsetWidth;s.classList.add('flash');}}
    return;
  }
  const pin=ev.target.closest('[data-pin]');
  if(pin){const e=FEED_PIN[+pin.dataset.pin];if(e&&e.duck)select('duck');else if(e&&e.c)select(e.c.key);return;}
  const d=ev.target.closest('[data-i]');if(!d)return;
  const e=FEED_VIEW[+d.dataset.i];if(!e)return;
  if(e.tv)select('tv');else if(e.duck)select('duck');else if(e.c)select(e.c.key);
});
// survol d'un nom du fil : la personne s'allume sur le plan (comme une carte de « Qui fait quoi »)
document.getElementById('feed').addEventListener('mouseover',e=>{const a=e.target.closest('.lk-who');hoverKey=a?a.dataset.who:null;});
document.getElementById('feed').addEventListener('mouseleave',()=>{hoverKey=null;});
{const seg=document.getElementById('feedmode');if(seg)seg.addEventListener('click',ev=>{
  const b=ev.target.closest('[data-mode]');if(!b)return;
  FEED_MODE=b.dataset.mode;FEED_N=FEED_PAGE;try{localStorage.setItem('bureau:feed',FEED_MODE);}catch(e){}
  showFeed();
});}
{const tys=document.getElementById('feedtypes');if(tys)tys.addEventListener('click',ev=>{
  const b=ev.target.closest('[data-ty]');if(!b)return;
  const k=b.dataset.ty;if(FEED_OFF.has(k))FEED_OFF.delete(k);else FEED_OFF.add(k);
  FEED_N=FEED_PAGE;try{localStorage.setItem('bureau:feedtypes',JSON.stringify([...FEED_OFF]));}catch(e){}
  showFeed();
});}
