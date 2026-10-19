// ---------- fiche d'un ticket : son état, ses PR, et les workflows qu'on lance dessus ----------
// Un clic sur un ticket (Kanban, fiche d'un collègue) ouvre sa fiche dans le panneau. Les boutons sont des cartes
// d'action Kronn (bureau-impl, bureau-mep, bureau-review, bureau-fix ; clé launch de la config) : Kronn relit côté
// serveur la clé du ticket ou le n° de PR dans le dataset actions (cron équipe), puis suit le run dans sa carte.
let ACTS=null; // dataset actions : {tickets[{key,cat,pr}], prs[{id,n,repo}]} ; id = « owner/dépôt#n » (#56)
let TICKET_BACK=null; // la vue d'où l'on vient (Kanban, un collègue) : bouton retour
function readActs(src){
  try{
    if(!src||!src.datasets)return null;
    let d=src.datasets.actions;
    if(d&&d.current!==undefined)d=d.current;
    if(typeof d==='string')d=JSON.parse(d);
    return d&&Array.isArray(d.tickets)&&Array.isArray(d.prs)?d:null;
  }catch(e){return null;}
}
function ticketOf(key){
  if(!TEAM)return null;
  for(const p of TEAM.people){const x=p.tickets.find(t=>t.key===key);if(x)return {...x,owner:p.name};}
  const u=(TEAM.unassigned||[]).find(t=>t.key===key);
  return u?{...u,owner:null}:null;
}
// PR ouvertes qui citent la clé dans leur titre
function prsOf(key){
  if(!TEAM)return [];
  const all=[...TEAM.people.flatMap(p=>(p.prs||[]).map(x=>({...x,author:p.name}))),...(TEAM.other_prs||[])];
  return all.filter(x=>(x.keys||[]).includes(key));
}
const ficheSel=k=>/^(ticket|pr):/.test(String(k)); // fiches d'un ticket ou d'une PR : le retour mène à la vue d'avant
function openTicket(key){
  if(!ficheSel(sel))TICKET_BACK=sel;
  select('ticket:'+key);
}
function openPr(id){
  if(!ficheSel(sel))TICKET_BACK=sel;
  select('pr:'+id);
}
// lien vers la fiche : <a data-tk="EW-1234"> ou <a data-pr="owner/dépôt#12"> n'importe où dans la page
document.addEventListener('click',e=>{
  const a=e.target.closest&&e.target.closest('[data-tk],[data-pr]');
  if(!a)return;
  e.preventDefault();
  if(a.dataset.tk)openTicket(a.dataset.tk);else openPr(a.dataset.pr);
});
const tkOpen=x=>`<a href="#" data-tk="${esc(x.key)}" title="Ouvrir sa fiche et ses actions" style="color:inherit">${esc(x.summary)}</a>`;
const TK_REV={approved:['approuvée','var(--ok)'],changes:['changements demandés','var(--err)'],pending:['review en attente','var(--warn)']};
// clés de data-kronn-bindings d'une action : chaque variable liée (son nom chez toi) -> la valeur du champ de la ligne
// qu'elle relit (ex. {jira_ticket_key: 'EW-1', pr_number: 'EW-1'} pour une ligne {key:'EW-1'}) ; null si rien à lier
function bindsFor(action,row){
  const e=Object.entries(ACTION_BINDS[action]||{}).filter(([,f])=>row[f]!=null);
  return e.length?Object.fromEntries(e.map(([n,f])=>[n,String(row[f])])):null;
}
// un bouton de lancement : bloc qui devient la fenêtre de la carte Kronn, note qui suit l'état du lancement (done : texte
// du succès, sinon « l'agent se met au travail »)
function launchBlock(box,{action,bind,name,sub,label,title,off,done}){
  bind=bindsFor(action,bind);if(!bind)return;
  const host=document.createElement('div');host.className='relaunch';host.setAttribute('data-kronn-action-slot-host','');
  host.innerHTML=`<div class="rl-n">${esc(name)}</div><div class="rl-s">${esc(sub)}</div>`;
  const b=document.createElement('button');b.textContent=label;
  if(off){b.disabled=true;b.title=off;host.appendChild(b);box.appendChild(host);return;}
  b.setAttribute('data-kronn-action',action);b.setAttribute('data-kronn-bindings',JSON.stringify(bind));
  const n=document.createElement('div');n.className='note';n.style.margin='6px 0 0';
  n.textContent='Kronn ouvre sa carte : tu valides, puis elle suit le run étape par étape.';
  new MutationObserver(()=>{
    const v=b.getAttribute('data-kronn-action-state');
    if(v==='succeeded')n.innerHTML=done||'<b style="color:var(--ok)">✓ Lancé.</b> L\'agent se met au travail d\'ici une minute sur le plan.';
    else if(v==='failed')n.innerHTML='<b style="color:var(--err)">Lancement refusé</b> (déjà en cours ?). Détail dans la carte.';
  }).observe(b,{attributes:true,attributeFilter:['data-kronn-action-state']});
  host.append(b,n);kronnModal(host,b,title);box.appendChild(host);
}
function renderTicket(side,key){
  const x=ticketOf(key);
  const jira=`<a href="${JIRA_BROWSE}${encodeURIComponent(key)}" target="_blank" rel="noopener" style="color:var(--accent)">Ouvrir dans Jira ↗</a>`;
  const h=document.createElement('h2');h.textContent=x?tkHead(x):key;side.appendChild(h);
  if(!x){
    const e=document.createElement('div');e.className='empty';
    e.innerHTML=`Ce ticket n'est pas dans le sprint en cours. ${jira}`;
    side.appendChild(e);return;
  }
  const cat=TCAT[x.cat]||{t:x.status,c:'var(--idle)'}, age=tkAge(x,T);
  const head=document.createElement('div');head.style.cssText='margin:0 0 12px';
  head.innerHTML=`<div style="font-size:14px;margin-bottom:6px">${esc(x.summary)}</div>`+
    `<div style="font-size:12px;color:var(--muted)"><span class="dot" style="background:${cat.c};display:inline-block;margin-right:6px"></span>${esc(x.status||cat.t)}`+
    `${age?' depuis '+age:''} · ${x.owner?esc(x.owner):'non assigné'}${x.points?' · '+esc(x.points)+' pts':''} · ${jira}</div>`;
  side.appendChild(head);
  const prs=prsOf(key);
  if(prs.length){
    const pb=foldSection(side,'tk-prs','Ses PR ouvertes',prs.length,true);
    const ul=document.createElement('ul');ul.className='steps';ul.style.marginLeft='0';
    for(const p of prs){
      const r=p.draft?['brouillon','var(--idle)']:TK_REV[p.review]||TK_REV.pending;
      const li=document.createElement('li');
      li.innerHTML=`<span class="dot" style="background:${r[1]}"></span><a ${hrefOf(p.url)} target="_blank" rel="noopener" style="color:var(--accent);white-space:nowrap">${esc(prNum(p))}</a><span>${esc(p.title)}</span><span class="k">${r[0]}</span>`;
      ul.appendChild(li);
    }
    pb.appendChild(ul);
  }
  if(!(ACTIONS.impl||ACTIONS.mep||ACTIONS.mep_pr||ACTIONS.review||ACTIONS.fix||ACTIONS.comment))return;
  const box=foldSection(side,'tk-launch','🤖 Lancer un workflow',null,true);
  const note=t=>{const e=document.createElement('div');e.className='note';e.textContent=t;box.appendChild(e);};
  if(!ACTS){note('Les boutons arrivent au prochain passage du cron équipe (10 min au plus).');return;}
  const known=ACTS.tickets.some(t=>t.key===key);
  const before=box.childElementCount;
  if(known&&ACTIONS.impl&&(x.cat==='todo'||x.cat==='doing')&&!prs.length)
    launchBlock(box,{action:'bureau-impl',bind:{key},name:'Implémenter',sub:'Après ta validation du plan, le ticket t\'est assigné et passe En cours ; Ryan le code, ouvre la PR et la fait relire',label:'🤖 Implémenter',title:'Implémenter '+key});
  if(known&&ACTIONS.mep&&x.cat==='deploy'){
    const frozen=stageClosed(Date.now());
    launchBlock(box,{action:'bureau-mep',bind:{key},name:'Mettre en prod',sub:frozen?'Gel des mises en prod aujourd\'hui':'Rebase, CI, merge, release, staging puis prod, avec tes validations',
      label:'🚀 Mettre en prod',title:'Mettre en prod '+key,off:frozen?'Gel des mises en prod (rhythm.mep_freeze)':null});
  }
  for(const p of prs)prLaunch(box,p);
  if(known&&ACTIONS.comment) // à tout statut ; le texte se saisit dans la carte Kronn
    launchBlock(box,{action:'bureau-comment',bind:{key},name:'Commenter',sub:'Ton commentaire part sur le ticket dans Jira',label:'💬 Commenter',title:'Commenter '+key});
  if(known&&ACTIONS.estimate&&x.cat!=='done') // ton workflow de réestimation (launch.estimate) : Story Points et raison dans la carte
    launchBlock(box,{action:'bureau-estimate',bind:{key},name:'Réestimer',sub:'Nouveaux Story Points et raison : le ticket est mis à jour dans Jira, avec un commentaire',label:'📏 Réestimer',title:'Réestimer '+key});
  if(box.childElementCount===before)note(known?'Rien à lancer à ce statut.':'Ticket pas encore dans les données des boutons : prochain passage du cron équipe.');
}
// la ligne du dataset actions d'une PR (même dépôt, même numéro) ; ancien dataset sans id : son repo et son n°
const actPr=p=>ACTS&&ACTS.prs.find(q=>String(q.id||prId(q)).toLowerCase()===prId(p).toLowerCase())||null;
// « 🛠 Corriger » et « 🔎 Faire relire » d'une PR (fiche du ticket, fiche de la PR) : liées par « owner/dépôt#n » (#56),
// Kronn relit le dépôt et le numéro dans actions.prs. Corriger une PR d'un autre dépôt : si ton workflow prend le dépôt.
function prLaunch(box,p){
  const a=actPr(p);
  if(!a)return;
  const dr=p.draft?' (brouillon)':'', nm=prNum(p); // un brouillon se relit et se corrige aussi
  // « ⟳ Remettre à jour » (#74) : rebase sur la base, sans squash ; en retard ou en conflit d'après le cron équipe, ou état inconnu
  if(ACTIONS.rebase&&!p.merged&&(p.conflict||p.behind!==0)){
    const base=p.base||'main';
    launchBlock(box,{action:'bureau-rebase',bind:{id:a.id||prId(p)},name:'Remettre à jour · '+nm,
      sub:p.conflict?'Conflit avec '+base+' : l\'IA propose une résolution, tu la valides avant tout push.':'Rebase sur '+base+', commits gardés, push protégé, CI relancée. Sans conflit : 0 token.',
      label:'⟳ Remettre à jour',title:'Remettre à jour '+nm});
  }
  // « 🛠 Corriger » (#75) : modèle du Bureau, tout dépôt, dès qu'il reste des fils de review non résolus (inconnus : changements
  // demandés) ; sinon ton workflow de launch.fix, comme avant
  if(ACTIONS.fix_pr){
    const t=p.threads;
    if(t>0||t==null&&p.review==='changes')launchBlock(box,{action:'bureau-fixpr',bind:{id:a.id||prId(p)},name:'Corriger les retours · '+nm+dr,
      sub:(t>0?t+' fil'+(t>1?'s':'')+' de review non résolu'+(t>1?'s':'')+' : ':'')+'Nate corrige, tu valides le diff et ses réponses, puis il pousse',
      label:'🛠 Corriger',title:'Corriger les retours de '+nm});
  }
  else if(ACTIONS.fix&&p.review==='changes'&&(!otherRepo(p.repo)||CFG.fix_any_repo))
    launchBlock(box,{action:'bureau-fix',bind:{id:a.id||prId(p)},name:'Corriger les retours · '+nm+dr,sub:'Un agent applique les commentaires de review et pousse',label:'🛠 Corriger',title:'Corriger les retours de '+nm});
  // « 🚀 Mise en prod » d'une PR (#58) : dépôt de la config (CFG.mep_repos), PR prête (ni brouillon ni changements demandés)
  if(ACTIONS.mep_pr&&(CFG.mep_repos||[]).some(r=>r.toLowerCase()===String(a.id||prId(p)).replace(/#\d+$/,'').toLowerCase())&&!p.draft&&p.review!=='changes'){
    const frozen=stageClosed(Date.now());
    launchBlock(box,{action:'bureau-meppr',bind:{id:a.id||prId(p)},name:'Mettre en prod · '+nm,sub:frozen?'Gel des mises en prod aujourd\'hui':'Rebase, CI, merge, release, staging puis prod, avec tes validations',
      label:'🚀 Mise en prod',title:'Mettre en prod '+nm,off:frozen?'Gel des mises en prod (rhythm.mep_freeze)':null});
  }
  if(ACTIONS.review&&p.review!=='approved')
    launchBlock(box,{action:'bureau-review',bind:{id:a.id||prId(p)},name:'Faire relire · '+nm+dr,sub:'Dwight relit la PR et poste sa review',label:'🔎 Faire relire',title:'Faire relire '+nm});
}
// ---------- fiche d'une PR (lien du fil) : « owner/dépôt#n », dépôt vide = inconnu ----------
// Ce que la page en sait : la PR de l'équipe (titre, auteur, review, tickets cités) quand elle est d'un dépôt suivi
// (github.pr_repos, #56), sinon ce qu'en disent les runs des agents (auteur) ; les runs d'agents du jour qui l'ont traitée ;
// GitHub en lien ; Faire relire et Corriger comme dans la fiche du ticket.
function prInfo(id){
  const i=String(id).lastIndexOf('#'), repo=String(id).slice(0,i), n=String(id).slice(i+1);
  const all=TEAM?[...TEAM.people.flatMap(p=>(p.prs||[]).map(x=>({...x,who:p.id,who_name:p.name}))),...(TEAM.other_prs||[]),
    ...(TEAM.merged_today||[]).map(m=>({...m,merged:true,who_name:m.author}))]:[];
  const pr=all.find(x=>samePr(x,repo,n))||null;
  const runs=[];
  for(const c of chars){if(c.person||c.visitor)continue;
    for(const r of c.runs){const ref=runRef(r);if(ref&&ref.pr===n&&repoKey(ref.repo)===repoKey(repo)&&r._s<=T)runs.push({r,c});}}
  runs.sort((a,b)=>a.r._s-b.r._s);
  const au=(runs.find(x=>x.r.vars&&x.r.vars['current_task.author'])||{r:{vars:{}}}).r.vars['current_task.author'];
  const owner=(pr&&personChar(pr.who,pr.who_name))||ghChar(au)||null;
  return {repo,n,pr,runs,owner,ownerName:(pr&&pr.who_name)||au||null,
    url:(pr&&pr.url)||(repo?`https://github.com/${repo}/pull/${encodeURIComponent(n)}`:'')};
}
// pastilles d'état d'une PR ouverte (#74, cron équipe) : en conflit avec sa base, ou commits de retard
function prChips(pr){
  if(!pr||pr.merged)return '';
  const base=esc(pr.base||'main'), n=pr.behind;
  const c=pr.conflict?`<span class="prchip err">⛔ conflit avec ${base}</span>`:'';
  const b=n>0?`<span class="prchip warn">⟳ ${n} commit${n>1?'s':''} de retard sur ${base}</span>`:n===0&&!pr.conflict?`<span class="prchip ok">✓ à jour de ${base}</span>`:'';
  return c||b?`<div class="prchips">${c}${b}</div>`:'';
}
function renderPr(side,id){
  const x=prInfo(id);
  const h=document.createElement('h2');h.textContent=prNum({repo:x.repo,n:x.n});side.appendChild(h);
  const gh=x.url?`<a ${hrefOf(x.url)} target="_blank" rel="noopener" style="color:var(--accent)">Ouvrir sur GitHub ↗</a>`:'dépôt GitHub inconnu';
  const rv=x.pr&&(x.pr.merged?['mergée','var(--ok)']:x.pr.draft?['brouillon','var(--idle)']:TK_REV[x.pr.review]);
  const head=document.createElement('div');head.style.cssText='margin:0 0 12px';
  head.innerHTML=(x.pr&&x.pr.title?`<div style="font-size:14px;margin-bottom:6px">${esc(x.pr.title)}</div>`:'')+
    `<div style="font-size:12px;color:var(--muted)">`+(rv?`<span class="dot" style="background:${rv[1]};display:inline-block;margin-right:6px"></span>${esc(rv[0])} · `:'')+
    (x.owner||x.ownerName?'de '+refWho(x.owner,x.ownerName)+' · ':'')+(x.repo?esc(x.repo)+' · ':'')+gh+`</div>`+prChips(x.pr);
  side.appendChild(head);
  const keys=(x.pr&&x.pr.keys)||[];
  if(keys.length){
    const tb=foldSection(side,'pr-tk','Son ticket',keys.length,true);
    const ul=document.createElement('ul');ul.className='steps';ul.style.marginLeft='0';
    for(const k of keys){const t=ticketOf(k);const li=document.createElement('li');
      li.innerHTML=t?`<span class="dot" style="background:${(TCAT[t.cat]||{c:'var(--idle)'}).c}"></span><a href="#" data-tk="${esc(k)}" style="color:var(--accent);white-space:nowrap">${esc(k)}</a><span>${esc(t.summary)}</span><span class="k">${esc(t.status||'')}</span>`
        :`<span class="dot" style="background:var(--idle)"></span><a href="${JIRA_BROWSE}${encodeURIComponent(k)}" target="_blank" rel="noopener" style="color:var(--accent)">${esc(k)} ↗</a><span>hors du sprint</span>`;
      ul.appendChild(li);}
    tb.appendChild(ul);
  }
  if(x.pr&&!x.pr.merged&&(ACTIONS.review||ACTIONS.fix)){
    const box=foldSection(side,'pr-launch','🤖 Lancer un workflow',null,true), before=box.childElementCount;
    const note=t=>{const e=document.createElement('div');e.className='note';e.textContent=t;box.appendChild(e);};
    if(!ACTS)note('Les boutons arrivent au prochain passage du cron équipe (10 min au plus).');
    else{const p={...x.pr,repo:x.pr.repo||x.repo};prLaunch(box,p);
      if(box.childElementCount===before)note(!actPr(p)?'PR pas encore dans les données des boutons : prochain passage du cron équipe.'
        :p.review==='approved'?'Rien à lancer : PR approuvée.':'Rien à lancer sur cette PR.');}
  }
  const rb=foldSection(side,'pr-runs','Les agents dessus aujourd\'hui',x.runs.length,true);
  if(!x.runs.length){const e=document.createElement('div');e.className='empty';e.textContent='Aucun run d\'agent sur cette PR aujourd\'hui.';rb.appendChild(e);return;}
  const ul=document.createElement('ul');ul.className='steps';ul.style.marginLeft='0';
  for(const {r,c} of x.runs){const ok=r.status==='Success', ko=r.status==='Failed';
    const li=document.createElement('li');
    li.innerHTML=`<span class="dot" style="background:${ok?'var(--ok)':ko?'var(--err)':'var(--warn)'}"></span><span class="k" style="white-space:nowrap">${esc(hm(r._s))}</span>`+
      `<a href="#" data-who="${esc(c.key)}" style="color:var(--accent)">${esc(c.name)}</a><span>${esc(clean(r.wf_name))}</span>`;
    ul.appendChild(li);}
  ul.addEventListener('click',e=>{const a=e.target.closest('[data-who]');if(a){e.preventDefault();select(a.dataset.who);}});
  rb.appendChild(ul);
}
