// ---------- fiches du panneau latéral : visiteur, mode TV, planning, kanban, employé du sprint, collègue ----------
// lien vers une discussion Kronn, dans un nouvel onglet : Kronn ouvre dans l'onglet courant un lien vers sa propre adresse
// (même chemin + #discussion-…) ; par /index.html (servi pareil), il le traite en lien externe (même astuce que bpLink)
const kronnTab=()=>/\/$/.test(KRONN_BASE)?KRONN_BASE+'index.html':KRONN_BASE;
function discLink(id,label){
  return `<a href="${kronnTab()}#discussion-${encodeURIComponent(id)}" target="_blank" rel="noopener" style="color:var(--accent);font-weight:600">${label}</a>`;
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
    `<div class="stats">${d.fromQ?'':`<div><b>${d.msgs||0}</b><span>messages</span></div><div><b>${hm(ms(d.start))}</b><span>ouverte</span></div><div><b>${hm(ms(d.end))}</b><span>dernière activité</span></div>`}<div><b>${Math.max(d.pending||0,discQuestions(d.id,T).length)}</b><span>questions pour toi</span></div></div>`+
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
    prod:['Prod en cours',MEP_COLOR],
    done:['En prod','var(--ok)'],
    failed:['Échec','var(--err)']
  };
  for(const {m,phase} of list.slice().reverse()){
    const d=document.createElement('details');d.open=phase!=='done';
    const step=(lbl,o,url)=>o?((fin)=>`<li><span class="dot" style="background:${!fin?'#2f6fd6':o.conclusion==='success'?'var(--ok)':'var(--err)'}"></span><span>${lbl}</span><span class="k">${hm(ms(o.start))}${fin?' → '+hm(ms(o.end)):' · en cours'}</span>`)(o.end&&ms(o.end)<=T)+`${url?`<a ${hrefOf(url)} target="_blank" rel="noopener" style="color:var(--accent)">run</a>`:''}</li>`:`<li><span class="dot" style="background:var(--line)"></span><span>${lbl}</span><span class="k">à venir</span></li>`;
    d.innerHTML=`<summary><span class="dot" style="background:${PH[phase][1]}"></span><span class="tm">${esc(m.tag)}</span><span class="wn">${esc(mepName(m)||'?')} · ${esc(PH[phase][0])}</span><span class="du">${hm(ms(mepStart(m)))}</span></summary>`+
      `<div style="font-size:12px;margin:6px 0 4px 18px">${m.ticket?`<a href="${JIRA_BROWSE}${encodeURIComponent(m.ticket)}" target="_blank" rel="noopener" style="color:var(--accent);font-weight:600">${esc(m.ticket)}</a> `:''}${esc(m.summary||m.name||'')}</div>`+
      `<ul class="steps">${m.released?`<li><span class="dot" style="background:var(--ok)"></span><span>Release</span><span class="k">${hm(ms(m.released))}</span><a ${hrefOf('https://github.com/'+(m.repo||CFG.github_repo||'')+'/releases/tag/'+encodeURIComponent(m.tag))} target="_blank" rel="noopener" style="color:var(--accent)">release</a></li>`:''}${step('Staging',m.staging&&ms(m.staging.start)<=T?m.staging:null,m.staging&&m.staging.url)}${step('Production',m.prod&&ms(m.prod.start)<=T?m.prod:null,m.prod&&m.prod.url)}</ul>`;
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
  const groups=[['written','Tickets écrits','var(--info)'],['triaged','Tickets triés','#8a8478'],['tested','Testés depuis le dernier daily',MEP_COLOR],['reopened','Réouverts depuis le dernier daily','var(--err)']];
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
// une ligne de « Ses tickets » : clé (🐛 si bug), composant (le « [Panier] » du titre), points (0 compris), titre,
// puis depuis quand il est dans sa colonne (orange : bloqué, en review ou en test depuis plus de BLOCKED_DAYS jours), « Réouvert », ses PR ouvertes
const tkPts=v=>v==null||v===''?'':`<span class="k pts">${esc(+v)} pt${+v>1?'s':''}</span>`;
function tkRow(x){const li=document.createElement('li');li.className='tkr';li.innerHTML=tkRowHtml(x);return li;}
function tkRowHtml(x){
  const {comp,title}=tkComp(x.summary), u=tkSince(x);
  const meta=[];
  if(x.cat!=='done'&&x.cat!=='todo'&&u&&u<=T){
    const age=tkAge(x,T), stuck=(x.cat==='review'||x.cat==='test')&&T-u>BLOCKED_DAYS*864e5;
    meta.push(`<span${stuck?' class="warn" title="Bloqué : sans bouger depuis plus de '+BLOCKED_DAYS+' j">⏳ ':'>'}${age?'depuis '+age:u>=DAY0?"aujourd'hui":'depuis hier'}</span>`);
  }
  if(x.status&&x.status===FLOW.reopened)meta.push('<span class="tk-tag">Réouvert</span>');
  for(const p of prsOf(x.key)){
    const r=p.draft?['brouillon','var(--idle)']:TK_REV[p.review]||TK_REV.pending;
    meta.push(`<span><span class="dot" style="background:${r[1]}"></span><a href="#" data-pr="${esc(prId(p))}" title="Fiche de la PR">${esc(prNum(p))}</a> ${r[0]}</span>`,...prMarks(p));
  }
  return `<div class="tk-top">${x.type==='Bug'?'<span title="Bug">'+TYPE_ICO.Bug+'</span>':''}<a class="tk-key" href="${JIRA_BROWSE}${encodeURIComponent(x.key)}" target="_blank" rel="noopener" title="Ouvrir dans Jira">${esc(x.key)}</a>`+
    `${comp?`<span class="tk-comp">${esc(comp)}</span>`:''}${tkPts(x.points)}</div>`+
    `<div class="tk-t">${tkOpen({...x,summary:title})}</div>${meta.length?`<div class="tk-meta">${meta.join('')}</div>`:''}`;
}
// ordre dans un groupe de « Ses tickets » : le plus ancien dans sa colonne d'abord ; déployés : le plus récent d'abord
function tkSorted(list,k){
  if(k==='done')return list.slice().sort((a,b)=>(ms(b.updated)||0)-(ms(a.updated)||0));
  if(k==='todo')return list;
  return list.slice().sort((a,b)=>(tkSince(a)||Infinity)-(tkSince(b)||Infinity));
}
// barre en tête de « Ses tickets » : un segment par colonne, aux couleurs des groupes, en points (en tickets si aucun n'est estimé)
function tkBarHtml(tickets){
  const byPts=tickets.some(x=>+x.points>0), w=x=>byPts?(+x.points||0):1;
  const tot=tickets.reduce((a,x)=>a+w(x),0); if(!tot)return '';
  const unit=n=>byPts?Math.round(n)+' pt'+(Math.round(n)>1?'s':''):n+' ticket'+(n>1?'s':'');
  const seg=TORDER.map(k=>[k,tickets.filter(x=>x.cat===k).reduce((a,x)=>a+w(x),0)]).filter(([,n])=>n>0);
  const done=seg.find(([k])=>k==='done');
  return `<div class="tk-bar" role="img" aria-label="${seg.map(([k,n])=>TCAT[k].t+' : '+unit(n)).join(', ')}">`+
    seg.map(([k,n])=>`<i style="flex:${n};background:${TCAT[k].c}" title="${TCAT[k].t} : ${unit(n)}"></i>`).join('')+'</div>'+
    `<div class="tk-bar-cap"><b>${unit(done?done[1]:0)}</b> déployé${byPts?'s':(done&&done[1]>1?'s':'')} sur ${unit(tot)}</div>`;
}
// PR ouvertes qui ne citent aucun de ses tickets (les autres sont sur la ligne de leur ticket)
function loosePrs(p){
  const mine=new Set(p.tickets.map(x=>x.key));
  return p.prs.filter(x=>!(x.keys||[]).some(k=>mine.has(k)));
}
// « Ses autres PR ouvertes » : mêmes groupes à liseré et mêmes lignes que « Ses tickets », un groupe par état de review
const PR_GROUPS=[['changes','Changements demandés','var(--err)'],['pending','En attente de review','var(--warn)'],['approved','Approuvées','var(--ok)'],['draft','Brouillons','var(--idle)']];
const prGroup=x=>x.draft?'draft':PR_GROUPS.some(([k])=>k===x.review)?x.review:'pending';
const daysAgoTxt=d=>d<1?"aujourd'hui":d<2?'hier':d<60?'il y a '+Math.floor(d)+' j':'il y a '+Math.floor(d/30.4)+' mois';
// une ligne : n° (lien GitHub), ticket cité (lien Jira, en gris : la PR est l'objet de la ligne), composant ; titre sans « feat(DM-1): » ni « [Composant] » ;
// dernière activité (orange avec ⏳ si elle attend une review depuis plus de PR_STALE_H heures)
// état d'une PR dans une liste (#74, #75) : conflit avec sa base, commits de retard, fils de review non résolus
function prMarks(x){
  const m=[];
  if(x.conflict)m.push('<span class="prm err" title="Conflit avec sa base">⛔ conflit</span>');
  if(x.behind>0)m.push(`<span class="prm" title="Commits de ${esc(x.base||'main')} absents de la PR">⟳ ${x.behind} de retard</span>`);
  if(x.threads>0)m.push(`<span class="prm" title="Fils de review non résolus">💬 ${x.threads} fil${x.threads>1?'s':''}</span>`);
  return m;
}
function prRowHtml(x){
  let t=String(x.title||'').replace(/^\s*\w+(\([^)]*\))?!?:\s*/,'');
  const {comp,title}=tkComp(t); t=title;
  const keys=(x.keys||[]).map(k=>`<a class="tk-key tk-cite" href="${JIRA_BROWSE}${encodeURIComponent(k)}" target="_blank" rel="noopener" title="Ouvrir dans Jira">${esc(k)}</a>`).join('');
  const meta=[], u=ms(x.updated), s=prSince(x);
  const stale=!x.draft&&prGroup(x)==='pending'&&s&&T-s>PR_STALE_H*36e5;
  if(stale)meta.push(`<span class="warn" title="Sans review depuis plus de ${PR_STALE_H} h">⏳ attend une review depuis ${daysAgoTxt((T-s)/864e5).replace(/^il y a /,'')}</span>`);
  else if(u&&u<=T)meta.push(`<span>activité ${daysAgoTxt((T-u)/864e5)}</span>`);
  meta.push(...prMarks(x));
  return `<div class="tk-top"><a class="tk-key" href="#" data-pr="${esc(prId(x))}" title="Fiche de la PR">${esc(prNum(x))}</a><a class="tk-gh" ${hrefOf(x.url)} target="_blank" rel="noopener" title="Ouvrir sur GitHub">↗</a>${keys}`+
    `${comp?`<span class="tk-comp">${esc(comp)}</span>`:''}</div><div class="tk-t">${esc(t)}</div>${meta.length?`<div class="tk-meta">${meta.join('')}</div>`:''}`;
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
  stats.innerHTML=`<div><b>${open.length}</b><span>tickets ouverts</span></div><div><b style="color:${TCAT.doing.c}">${cnt('doing')}</b><span>en cours</span></div><div><b>${p.prs.length}</b><span>PR ouvertes</span></div><div><b style="color:var(--ok)">${p.merged.length}</b><span>mergées auj.</span></div>`;
  side.appendChild(stats);
  if(TEAM&&TEAM.sprint&&TEAM.sprint.name){
    const m=document.createElement('div');
    m.style.cssText='color:var(--muted);font-size:12px;margin-bottom:8px';
    m.textContent='Sprint '+TEAM.sprint.name+(p.gh.length?' · GitHub : '+p.gh.join(', '):'');
    side.appendChild(m);
  }
  const tb=foldSection(side,'tickets','Ses tickets',p.tickets.length);
  if(!p.tickets.length){const e=document.createElement('div');e.className='empty';e.textContent='Aucun ticket.';tb.appendChild(e);}
  else{const bar=document.createElement('div');bar.innerHTML=tkBarHtml(p.tickets);tb.appendChild(bar);}
  for(const k of TORDER){
    const list=p.tickets.filter(x=>x.cat===k); if(!list.length)continue;
    const d=memoDetails(document.createElement('details'),c.key+':'+k,k!=='done'&&k!=='todo');
    const pts=list.reduce((a,x)=>a+(+x.points||0),0);
    d.className='tkg';d.style.setProperty('--c',TCAT[k].c); // liseré aux couleurs de la colonne
    d.innerHTML=`<summary><span class="chev" aria-hidden="true"></span><span class="wn">${TCAT[k].t}</span><span class="du">${list.length} ticket${list.length>1?'s':''}${pts?' · '+Math.round(pts)+' pts':''}</span></summary>`;
    const ul=document.createElement('ul');ul.className='steps';
    for(const x of tkSorted(list,k))ul.appendChild(tkRow(x));
    d.appendChild(ul);tb.appendChild(d);
  }
  const loose=loosePrs(p);
  if(loose.length){
    const pb=foldSection(side,'prs',loose.length<p.prs.length?'Ses autres PR ouvertes':'Ses PR ouvertes',loose.length);
    for(const [k,t,col] of PR_GROUPS){
      const list=loose.filter(x=>prGroup(x)===k).sort((a,b)=>(ms(b.updated)||0)-(ms(a.updated)||0)); if(!list.length)continue;
      const d=memoDetails(document.createElement('details'),c.key+':pr:'+k,k!=='draft');
      d.className='tkg';d.style.setProperty('--c',col);
      d.innerHTML=`<summary><span class="chev" aria-hidden="true"></span><span class="wn">${t}</span><span class="du">${list.length} PR</span></summary>`;
      const ul=document.createElement('ul');ul.className='steps';
      for(const x of list){const li=document.createElement('li');li.className='tkr';li.innerHTML=prRowHtml(x);ul.appendChild(li);}
      d.appendChild(ul);pb.appendChild(d);
    }
  }
  if(p.merged.length){
    const mb=foldSection(side,'merged',"Mergées aujourd'hui",p.merged.length);
    const ul=document.createElement('ul');ul.className='steps';ul.style.marginLeft='0';
    for(const x of p.merged){
      const li=document.createElement('li');
      li.innerHTML=`<span class="dot" style="background:var(--ok)"></span><span class="k">${hm(ms(x.mergedAt))}</span><a ${hrefOf(x.url)} target="_blank" rel="noopener" style="color:var(--accent);white-space:nowrap">${esc(prNum(x))}</a><span>${esc(x.title)}</span>`;
      ul.appendChild(li);
    }
    mb.appendChild(ul);
  }
}
function shortSt(st){
  if(st.abs)return ABS_SHORT[st.abs]; // 36-absences.js
  if(st.tt)return '🏠 télétravail · '+shortSt({...st,tt:false});
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
// back : retour par l'historique (50-panel.js), sans y ajouter la vue quittée
function select(k,back){if(EDIT)closeEditor();if(WIN_VIEWS[k]){WIN_VIEWS[k]();return;} // Kanban, calendrier : en fenêtre large
  if(k==null)SEL_BACK=[];else if(!back&&k!==sel){SEL_BACK.push(sel);if(SEL_BACK.length>20)SEL_BACK.shift();}
  sel=k;if(k)SIDE_FOLDED=false;renderSide(true);} // choisir quelqu'un rouvre le panneau replié

