// ---------- fiches du panneau latéral : visiteur, mode TV, planning, kanban, employé du sprint, collègue ----------
function discLink(id,label){
  return `<a href="${KRONN_BASE}#discussion-${encodeURIComponent(id)}" target="_blank" rel="noopener" style="color:var(--accent);font-weight:600">${label}</a>`;
}
function ownerOfRun(runId){
  for(const c of chars){
    if(c.visitor)continue;
    const r=c.runs.find(x=>x.run===runId);
    if(r)return {c,r:(r.parent&&c.runs.find(x=>x.run===r.parent))||r};
  }
  return null;
}
function renderVisitor(side,c){
  const d=c.disc;
  const box=document.createElement('div');box.style.cssText='font-size:13px;margin-bottom:10px';
  box.innerHTML=`<div style="margin-bottom:8px">${esc(clean(d.title))}</div>`+
    `<div class="stats"><div><b>${d.msgs||0}</b><span>messages</span></div><div><b>${hm(ms(d.start))}</b><span>ouverte</span></div><div><b>${hm(ms(d.end))}</b><span>dernière activité</span></div><div><b>${d.pending||0}</b><span>questions pour toi</span></div></div>`+
    `<div style="color:var(--muted);font-size:12px;margin-bottom:10px">${esc(d.agent||'Agent')}${d.project?' · projet '+esc(d.project):''}${(d.participants||[]).length>1?' · '+d.participants.length+' agents':''}</div>`+
    `<div>${discLink(d.id,'Ouvrir la discussion dans Kronn ↗')}</div>`;
  side.appendChild(box);
  if(d.run){
    const o=ownerOfRun(d.run), p=document.createElement('div');p.style.cssText='font-size:13px;margin-top:6px';
    if(o){
      p.innerHTML=`Lancée par le run de ${hm(o.r._s)} de `;
      const b=document.createElement('button');
      b.textContent=o.c.name;
      b.style.padding='2px 8px';
      b.onclick=()=>select(o.c.key);
      p.appendChild(b);
    }
    else p.textContent="Lancée par un run d'un autre jour.";
    side.appendChild(p);
  }
}
function firstName(id,fallback){const c=chars.find(x=>x.team&&x.team.id===id);return c?c.name:(fallback||'?');}
function renderTv(side){
  const h=document.createElement('h2');h.textContent="Mises en prod du jour";side.appendChild(h);
  const list=mepsAt(T);
  if(!list.length){
    const e=document.createElement('div');
    e.className='empty';
    e.textContent="Aucune mise en prod à cette heure-ci.";
    side.appendChild(e);
    return;
  }
  const PH={
    released:['Release publiée','#9a9284'],
    staging:['Staging en cours','#2f6fd6'],
    staged:['Validée sur staging','#2e9e9b'],
    prod:['Prod en cours','#7a5cc8'],
    done:['En prod','var(--ok)'],
    failed:['Échec','var(--err)']
  };
  for(const {m,phase} of list.slice().reverse()){
    const d=document.createElement('details');d.open=phase!=='done';
    const step=(lbl,o,url)=>o?((fin)=>`<li><span class="dot" style="background:${!fin?'#2f6fd6':o.conclusion==='success'?'var(--ok)':'var(--err)'}"></span><span>${lbl}</span><span class="k">${hm(ms(o.start))}${fin?' → '+hm(ms(o.end)):' · en cours'}</span>`)(o.end&&ms(o.end)<=T)+`${url?`<a href="${esc(url)}" target="_blank" rel="noopener" style="color:var(--accent)">run</a>`:''}</li>`:`<li><span class="dot" style="background:var(--line)"></span><span>${lbl}</span><span class="k">à venir</span></li>`;
    d.innerHTML=`<summary><span class="dot" style="background:${PH[phase][1]}"></span><span class="tm">${esc(m.tag)}</span><span class="wn">${esc(firstName(m.who,m.who_name))} · ${esc(PH[phase][0])}</span><span class="du">${hm(ms(mepStart(m)))}</span></summary>`+
      `<div style="font-size:12px;margin:6px 0 4px 18px">${m.ticket?`<a href="${JIRA_BROWSE}${encodeURIComponent(m.ticket)}" target="_blank" rel="noopener" style="color:var(--accent);font-weight:600">${esc(m.ticket)}</a> `:''}${esc(m.summary||m.name||'')}</div>`+
      `<ul class="steps">${m.released?`<li><span class="dot" style="background:var(--ok)"></span><span>Release</span><span class="k">${hm(ms(m.released))}</span><a href="https://github.com/${m.repo||CFG.github_repo||''}/releases/tag/${encodeURIComponent(m.tag)}" target="_blank" rel="noopener" style="color:var(--accent)">release</a></li>`:''}${step('Staging',m.staging&&ms(m.staging.start)<=T?m.staging:null,m.staging&&m.staging.url)}${step('Production',m.prod&&ms(m.prod.start)<=T?m.prod:null,m.prod&&m.prod.url)}</ul>`;
    side.appendChild(d);
  }
}
function renderPlanning(side){
  const h=document.createElement('h2');h.textContent="Planning des crons aujourd'hui";side.appendChild(h);
  const list=planningToday();
  if(!list.length){
    const e=document.createElement('div');
    e.className='empty';
    e.textContent='Aucun cron programmé.';
    side.appendChild(e);
    return;
  }
  const hr=[...new Map(list.filter(p=>p.hourly).map(p=>[p.c.wf,p])).values()];
  if(hr.length){
    const d=document.createElement('div');
    d.className='note';
    d.style.margin='0 0 8px';
    d.textContent='Toutes les heures : '+hr.map(p=>(p.who?p.who.name:clean(p.c.name))+' à :'+String(new Date(p.t).getUTCMinutes()).padStart(2,'0')).join(', ');
    side.appendChild(d);
  }
  const rows=list.filter(p=>!p.hourly).map(p=>({p,r:p.who&&p.who.runs.find(x=>!x.parent&&x._s<=T&&Math.abs(x._s-p.t)<10*60e3),past:p.t<T}));
  const line=({p,r,past})=>{
    const col=r?(r.status==='Failed'?'var(--err)':r.status==='Success'?'var(--ok)':'#2f6fd6'):past?'var(--idle)':'var(--line)';
    const stt=r?(STATUS_TXT[r.status]||r.status):past?'pas vu':'';
    const li=document.createElement('li');li.className='pl';
    li.innerHTML=`<span class="dot" style="background:${col}"></span><span class="tm">${hm(p.t)}</span><span class="plw"><b>${esc(p.who?p.who.name:clean(p.c.name))}</b><small>${esc(clean(p.c.name))}</small></span>${stt?`<span class="k">${esc(stt)}</span>`:''}`;
    if(p.who){li.style.cursor='pointer';li.onclick=()=>select(p.who.key);}
    return li;};
  const block=(id,title,items,open)=>{
    if(!items.length)return;
    const box=foldSection(side,id,title,items.length,open);
    const ul=document.createElement('ul');
    ul.className='steps';
    ul.style.marginLeft='0';
    items.forEach(x=>ul.appendChild(line(x)));
    box.appendChild(ul);
  };
  block('plan-next','À venir',rows.filter(x=>!x.past),true);
  block('plan-past','Déjà passés',rows.filter(x=>x.past).reverse(),false);
}
function renderKanban(side){
  const h=document.createElement('h2');
  h.textContent='Mur Kanban'+(TEAM&&TEAM.sprint&&TEAM.sprint.name?' · sprint '+TEAM.sprint.name:'');
  side.appendChild(h);
  if(!TEAM){
    const e=document.createElement('div');
    e.className='empty';
    e.textContent="Données de l'équipe pas encore publiées.";
    side.appendChild(e);
    return;
  }
  for(const {k,list} of kanbanCols()){
    const d=memoDetails(document.createElement('details'),'kb:'+k,false);
    const pts=list.reduce((a,x)=>a+(+x.points||0),0);
    d.innerHTML=`<summary><span class="dot" style="background:${TCAT[k].c}"></span><span class="wn">${TCAT[k].t}</span><span class="du">${list.length} tickets${pts?' · '+Math.round(pts)+' pts':''}</span></summary>`;
    const ul=document.createElement('ul');ul.className='steps';
    for(const x of list){
      const li=document.createElement('li');
      li.innerHTML=`<a href="${JIRA_BROWSE}${encodeURIComponent(x.key)}" target="_blank" rel="noopener" style="color:var(--accent);font-weight:600;white-space:nowrap">${esc(x.key)}</a><span>${tkOpen(x)} <small style="color:var(--muted)">(${esc(x.owner?String(x.owner).split(' ')[0]:'non assigné')})</small></span>${x.points?`<span class="k pts">${esc(x.points)} pts</span>`:''}`;
      ul.appendChild(li);
    }
    d.appendChild(ul);side.appendChild(d);
  }
}
function renderEmp(side){
  const rank=bestEmployee(), b=rank[0];
  const h=document.createElement('h2');h.textContent="Employé du sprint";side.appendChild(h);
  if(!b||!b.pts){
    const e=document.createElement('div');
    e.className='empty';
    e.textContent='Aucun point déployé pour le moment.';
    side.appendChild(e);
    return;
  }
  const c=empChar(b);
  const f=document.createElement('div');f.className='face';if(c)f.appendChild(portrait(c,64));
  const ft=document.createElement('div');
  ft.innerHTML=`<div class="n">🏆 ${esc(c?c.name:b.p.name)}</div><div class="r">${Math.round(b.pts)} points déployés · ${b.tickets.length} tickets${rank.sprint?' · sprint '+esc(rank.sprint)+(rank.prev?' (terminé)':''):''}</div>`;
  f.appendChild(ft);
  side.appendChild(f);
  const h2=document.createElement('h2');h2.textContent='Classement';h2.style.marginTop='8px';side.appendChild(h2);
  const ul=document.createElement('ul');ul.className='steps';ul.style.marginLeft='0';
  rank.forEach((r,i)=>{
    const cc=empChar(r);
    const li=document.createElement('li');
    li.innerHTML=`<span class="tm" style="min-width:18px;font-weight:600">${i+1}.</span><span>${esc(cc?cc.name:r.p.name)}</span><span class="k">${r.tickets.length} tickets</span><span class="k pts" style="margin-left:6px;padding-left:7px">${Math.round(r.pts)} pts</span>`;
    ul.appendChild(li);
  });
  side.appendChild(ul);
  const db=foldSection(side,'emp-done','Ses tickets déployés',b.tickets.length);
  const ul2=document.createElement('ul');ul2.className='steps';ul2.style.marginLeft='0';
  for(const x of b.tickets.slice().sort((a,z)=>(+z.points||0)-(+a.points||0))){
    const li=document.createElement('li');
    li.innerHTML=`<a href="${JIRA_BROWSE}${encodeURIComponent(x.key)}" target="_blank" rel="noopener" style="color:var(--accent);font-weight:600;white-space:nowrap">${esc(x.key)}</a><span>${esc(x.summary)}</span>${x.points?`<span class="k pts">${esc(x.points)} pts</span>`:''}`;
    ul2.appendChild(li);
  }
  db.appendChild(ul2);
}
// section dépliable de fiche (même style que les groupes de la liste), pliée par défaut ; état mémorisé par section
function foldSection(side,id,title,count,defOpen){
  const key='fiche:'+id, closed=key in COLLAPSED?!!COLLAPSED[key]:!defOpen; // pliée par défaut, ouverte si on l'a dépliée
  const h=document.createElement('h2');
  h.className='grp fold';
  h.setAttribute('role','button');
  h.tabIndex=0;
  h.setAttribute('aria-expanded',String(!closed));
  h.innerHTML=`<span class="chev">${closed?'▸':'▾'}</span>${esc(title)}${count!=null?` <span class="cnt">${count}</span>`:''}`;
  const box=document.createElement('div');box.hidden=closed;
  const toggle=()=>{
    const now=!box.hidden;
    box.hidden=now;
    COLLAPSED[key]=now;
    h.setAttribute('aria-expanded',String(!now));
    h.querySelector('.chev').textContent=now?'▸':'▾';
    try{localStorage.setItem('bureau:collapsed',JSON.stringify(COLLAPSED));}catch(e){}
  };
  h.onclick=toggle;h.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}};
  side.appendChild(h);side.appendChild(box);return box;
}
// <details> dont on retient l'ouverture d'un rafraîchissement à l'autre
const DET_OPEN={};
function memoDetails(d,id,def){d.open=id in DET_OPEN?DET_OPEN[id]:def;d.addEventListener('toggle',()=>{DET_OPEN[id]=d.open;});return d;}
// « Cette semaine dans Jira » : ce que font la PO et la SM (écrits, triés : 7 jours) et la QA (testés, réouverts : depuis le dernier daily)
function workBlock(side,c){
  const W=workOf(c); if(!W)return;
  const box=foldSection(side,'work','Cette semaine dans Jira',null,true);
  const groups=[['written','Tickets écrits','var(--info)'],['triaged','Tickets triés','#8a8478'],['tested','Testés depuis le dernier daily','#7a5cc8'],['reopened','Réouverts depuis le dernier daily','var(--err)']];
  for(const [k,t,col] of groups){
    const list=W[k]; if(!list.length)continue;
    const d=memoDetails(document.createElement('details'),c.key+':w:'+k,k!=='triaged');
    d.innerHTML=`<summary><span class="dot" style="background:${col}"></span><span class="wn">${t}</span><span class="du">${cnt50(list.length)}</span></summary>`;
    const ul=document.createElement('ul');ul.className='steps';
    for(const x of list.slice(0,15)){
      const li=document.createElement('li');
      li.innerHTML=`<a href="${JIRA_BROWSE}${encodeURIComponent(x.key)}" target="_blank" rel="noopener" style="color:var(--accent);font-weight:600;white-space:nowrap">${esc(x.key)}</a><span>${esc(x.summary)}</span>`;
      ul.appendChild(li);
    }
    if(list.length>15){const li=document.createElement('li');li.innerHTML=`<span></span><span style="color:var(--muted)">+ ${list.length-15} autres</span>`;ul.appendChild(li);}
    d.appendChild(ul);box.appendChild(d);
  }
}
function renderPerson(side,c){
  const p=c.team;
  workBlock(side,c);
  if(!p&&c.roleKind!=='sm'){
    if(workOf(c))return;
    const e=document.createElement('div');
    e.className='empty';
    e.textContent=TEAM?"Aucun ticket dans le sprint en cours, et pas d'activité Jira cette semaine.":"Données de l'équipe pas encore publiées.";
    side.appendChild(e);
    return;
  }
  const open=p?p.tickets.filter(x=>x.cat!=='done'):[], cnt=k=>p?p.tickets.filter(x=>x.cat===k).length:0;
  if(c.roleKind==='sm'&&TEAM){
    const all=TEAM.people.flatMap(q=>q.tickets),pts=f=>all.filter(f).reduce((a,x)=>a+(+x.points||0),0),n=k=>all.filter(x=>x.cat===k).length;
    const sp=TEAM.sprint||{};
    const end=sp.end?ms(sp.end):null;
    const box=document.createElement('div');
    box.innerHTML=`<div class="stats"><div><b>${end?Math.max(0,Math.ceil((end-T)/864e5)):'?'}</b><span>jours restants</span></div><div><b style="color:var(--ok)">${Math.round(pts(x=>x.cat==='done'))}</b><span>pts déployés</span></div><div><b>${Math.round(pts(()=>true))}</b><span>pts du sprint</span></div><div><b>${all.length}</b><span>tickets</span></div></div><div style="color:var(--muted);font-size:12px;margin-bottom:8px">Sprint ${esc(sp.name||'')}${sp.start?' · du '+new Date(ms(sp.start)).toLocaleDateString('fr-FR')+' au '+new Date(ms(sp.end)).toLocaleDateString('fr-FR'):''}</div>`;
    const ul=document.createElement('ul');
    ul.className='steps';
    ul.style.marginLeft='0';
    for(const k of TORDER){
      const li=document.createElement('li');
      li.innerHTML=`<span class="dot" style="background:${TCAT[k].c}"></span><span>${TCAT[k].t}</span><span class="k">${n(k)} tickets</span>`;
      ul.appendChild(li);
    }
    box.appendChild(ul);
    side.appendChild(box);
    return;
    }
  const stats=document.createElement('div');stats.className='stats';
  stats.innerHTML=`<div><b>${open.length}</b><span>tickets ouverts</span></div><div><b style="color:#2f6fd6">${cnt('doing')}</b><span>en cours</span></div><div><b>${p.prs.length}</b><span>PR ouvertes</span></div><div><b style="color:var(--ok)">${p.merged.length}</b><span>mergées auj.</span></div>`;
  side.appendChild(stats);
  if(TEAM&&TEAM.sprint&&TEAM.sprint.name){
    const m=document.createElement('div');
    m.style.cssText='color:var(--muted);font-size:12px;margin-bottom:8px';
    m.textContent='Sprint '+TEAM.sprint.name+(p.gh.length?' · GitHub : '+p.gh.join(', '):'');
    side.appendChild(m);
  }
  const tb=foldSection(side,'tickets','Ses tickets',p.tickets.length);
  if(!p.tickets.length){const e=document.createElement('div');e.className='empty';e.textContent='Aucun ticket.';tb.appendChild(e);}
  for(const k of TORDER){
    const list=p.tickets.filter(x=>x.cat===k); if(!list.length)continue;
    const d=memoDetails(document.createElement('details'),c.key+':'+k,k!=='done'&&k!=='todo');
    const pts=list.reduce((a,x)=>a+(+x.points||0),0);
    d.innerHTML=`<summary><span class="dot" style="background:${TCAT[k].c}"></span><span class="wn">${TCAT[k].t}</span><span class="du">${list.length} ticket${list.length>1?'s':''}${pts?' · '+Math.round(pts)+' pts':''}</span></summary>`;
    const ul=document.createElement('ul');ul.className='steps';
    for(const x of list){
      const li=document.createElement('li');
      li.innerHTML=`<a href="${JIRA_BROWSE}${encodeURIComponent(x.key)}" target="_blank" rel="noopener" style="color:var(--accent);font-weight:600;white-space:nowrap">${esc(x.key)}</a><span>${tkOpen(x)}${x.owner?' <small style="color:var(--muted)">('+esc(String(x.owner).split(' ')[0])+')</small>':''}</span>${x.points?`<span class="k pts">${esc(x.points)} pts</span>`:''}`;
      ul.appendChild(li);
    }
    d.appendChild(ul);tb.appendChild(d);
  }
  const REV={approved:['approuvée','var(--ok)'],changes:['changements demandés','var(--err)'],pending:['review en attente','var(--warn)']};
  if(p.prs.length){
    const pb=foldSection(side,'prs','Ses PR ouvertes',p.prs.length);
    const ul=document.createElement('ul');ul.className='steps';ul.style.marginLeft='0';
    for(const x of p.prs.slice().sort((a,b)=>(a.draft?1:0)-(b.draft?1:0))){
      const r=x.draft?['brouillon','var(--idle)']:REV[x.review]||REV.pending;
      const li=document.createElement('li');
      li.innerHTML=`<span class="dot" style="background:${r[1]}"></span><a href="${esc(x.url)}" target="_blank" rel="noopener" style="color:var(--accent);white-space:nowrap">#${x.n}</a><span>${esc(x.title)}</span><span class="k">${r[0]}</span>`;
      ul.appendChild(li);
    }
    pb.appendChild(ul);
  }
  if(p.merged.length){
    const mb=foldSection(side,'merged',"Mergées aujourd'hui",p.merged.length);
    const ul=document.createElement('ul');ul.className='steps';ul.style.marginLeft='0';
    for(const x of p.merged){
      const li=document.createElement('li');
      li.innerHTML=`<span class="dot" style="background:var(--ok)"></span><span class="k">${hm(ms(x.mergedAt))}</span><a href="${esc(x.url)}" target="_blank" rel="noopener" style="color:var(--accent);white-space:nowrap">#${x.n}</a><span>${esc(x.title)}</span>`;
      ul.appendChild(li);
    }
    mb.appendChild(ul);
  }
}
function shortSt(st){
  if(st.human&&st.st==='work')return 'en cours';
  return {
    sax:'joue du sax',
    daily:'daily',
    ask:'attend ta réponse',
    mep:'en MEP',
    party:'fête',
    work:'au travail',
    srv:'serveurs',
    meet:'réunion',
    gate:'attend toi',
    error:'en panne',
    coffee:'café',
    idle:'dispo',
    boss:'au bureau',
    reopen:'signale un reopen',
    passion:'pause',
    proud:'félicite',
    deliver:'livre un ticket',
    thumbs:'valide',
    cheer:'ticket validé',
    pizza:'pizza',
    kickoff:'lancement du sprint',
    planning:'sprint planning',
    retro:'rétro',
    absent:'pas arrivé',
    off:'absent',
    gone:'parti'
  }[st.st]||st.st;
}
function rank(c){
  const s=(c._st||{}).st;
  return c.boss?-1:({
    daily:0,
    planning:0,
    retro:0,
    ask:0,
    mep:0,
    party:0,
    gate:0,
    error:1,
    work:2,
    srv:2,
    meet:2,
    coffee:3,
    idle:4,
    absent:6,
    gone:7,
    off:8
  }[s]??5)*100+chars.indexOf(c);
}
function select(k){if(EDIT)closeEditor();sel=k;if(k)SIDE_FOLDED=false;renderSide(true);} // choisir quelqu'un rouvre le panneau replié

