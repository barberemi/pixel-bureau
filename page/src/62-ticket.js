// ---------- fiche d'un ticket : son état, ses PR, et les workflows qu'on lance dessus ----------
// Un clic sur un ticket (Kanban, fiche d'un collègue) ouvre sa fiche dans le panneau. Les boutons sont des cartes
// d'action Kronn (bureau-impl, bureau-mep, bureau-review, bureau-fix ; clé launch de la config) : Kronn relit côté
// serveur la clé du ticket ou le n° de PR dans le dataset actions (cron équipe), puis suit le run dans sa carte.
let ACTS=null; // dataset actions : {tickets[{key,cat,pr}], prs[{id,n,repo}]} ; id = « owner/dépôt#n » (#56)
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
// depuis le Kanban (fenêtre), « ← Mur Kanban » la rouvre (winGo, 50-panel.js)
// la fiche d'un ticket ou d'une PR s'ouvre dans le volet du Mur Kanban (63-kanban.js), filtré sur la personne qui a le
// ticket ou l'auteur de la PR (sa carte est donc visible) ; Kanban déjà ouvert : le volet seul change
const kbCharOf=p=>p?(chars.find(c=>c.person&&c.team&&c.team.id===p.id)||{}).key||'':'';
function openTicket(key){
  if(WIN_OPEN==='kanban')return kbShow({t:'ticket',k:key});
  const p=TEAM&&TEAM.people.find(q=>q.tickets.some(t=>t.key===key)), un=TEAM&&(TEAM.unassigned||[]).some(t=>t.key===key);
  openKanban({who:p?kbCharOf(p):un?'-':'',ticket:key});
}
function openPr(id){
  if(WIN_OPEN==='kanban')return kbShow({t:'pr',id});
  openKanban({who:kbCharOf(TEAM&&TEAM.people.find(q=>(q.prs||[]).some(x=>prId(x)===id))),pr:id});
}
// lien vers la fiche : <a data-tk="EW-1234"> ou <a data-pr="owner/dépôt#12"> n'importe où dans la page
document.addEventListener('click',e=>{
  const a=e.target.closest&&e.target.closest('[data-tk],[data-pr]');
  if(!a)return;
  e.preventDefault();
  if(a.dataset.tk)openTicket(a.dataset.tk);else openPr(a.dataset.pr);
});
const TK_REV={approved:['approuvée','var(--ok)'],changes:['changements demandés','var(--err)'],pending:['review en attente','var(--warn)']};
// clés de data-kronn-bindings d'une action : chaque variable liée (son nom chez toi) -> la valeur du champ de la ligne
// qu'elle relit (ex. {jira_ticket_key: 'EW-1', pr_number: 'EW-1'} pour une ligne {key:'EW-1'}) ; null si rien à lier
function bindsFor(action,row){
  const e=Object.entries(ACTION_BINDS[action]||{}).filter(([,f])=>row[f]!=null);
  return e.length?Object.fromEntries(e.map(([n,f])=>[n,String(row[f])])):null;
}
// ---------- qui fait quoi dans « Lancer un workflow » (#86) ----------
// chaque bouton montre l'agent qui l'incarne : celui dont agents[].wf contient l'id du workflow de l'action (CFG.action_wf,
// calculé à l'assemblage ; jamais un nom écrit en dur), un agent par workflow, jamais celui d'un autre bouton ni un
// intérimaire (il change chaque jour) ; « Commenter » : toi (le commentaire part avec ton compte Jira) ; sinon
// l'hologramme du Bureau
const actKey=a=>({meppr:'mep_pr',fixpr:'fix_pr'})[a.slice(7)]||a.slice(7); // 'bureau-fixpr' -> clé fix_pr de la config
function actAgent(action){
  const wf=((CFG.action_wf||{})[actKey(action)]||'').slice(0,8);
  return wf&&chars.find(x=>!x.person&&!x.visitor&&!x.temp&&(x.wf||[]).includes(wf))
    ||(action==='bureau-comment'?chars.find(x=>x.boss):null)||null;
}
// le run en cours de cet agent sur ce ticket ou cette PR (sa carte dit « dessus depuis… » et grise le bouton), sinon null
function agentBusy(c,bind){
  const id=String(bind.id||''), i=id.lastIndexOf('#');
  return c&&!c.boss&&(c.runs||[]).find(r=>{const ref=['Running','Pending','WaitingApproval'].includes(r.status)&&r._s<=T&&runRef(r);
    return !!ref&&(bind.key?ref.key===bind.key:ref.pr===id.slice(i+1)&&repoKey(ref.repo||CFG.github_repo)===repoKey(id.slice(0,i)));})||null;
}
// coût moyen d'un run de cet agent (fiche de paie, 7 jours), quand il est connu
function runCost(c){
  const p=c&&!c.boss&&payFor(c), v=p&&p.week.runs?usd(p.week.tok/p.week.runs):null;
  return v==null?'':fmtUsd(v)+' par run en moyenne (7 j)';
}
// l'action logique d'une fiche (● conseillé) : ticket à déployer → mise en prod ; sinon sur sa première PR ouverte :
// conflit → remettre à jour, fils ou changements demandés → corriger, retard → remettre à jour, pas approuvée → faire
// relire ; à faire ou en cours sans PR → implémenter
function tkNext(x,prs){
  const A=(a,p)=>({action:'bureau-'+a,id:p&&prId(p)}), F=ACTIONS.fix_pr?'fixpr':'fix';
  if(x&&x.cat==='deploy')return ACTIONS.mep_pr&&prs.length?A('meppr',prs[0]):A('mep');
  for(const p of prs){
    if(p.conflict&&ACTIONS.rebase)return A('rebase',p);
    if((p.threads>0||p.review==='changes')&&ACTIONS[actKey('bureau-'+F)])return A(F,p);
    if(p.behind>0&&ACTIONS.rebase)return A('rebase',p);
    if(p.review!=='approved'&&ACTIONS.review)return A('review',p);
  }
  return x&&(x.cat==='todo'||x.cat==='doing')&&!prs.length?A('impl'):null;
}
// la chaîne du ticket (bandeau en tête) : implémente › corrige › relit › met en prod, seulement les étapes branchées ;
// état de chaque étape (done, cur, later) d'après le statut du ticket et ses PR
function tkChain(x,prs){
  const st=[['impl','implémente'],[ACTIONS.fix_pr?'fixpr':'fix','corrige'],['review','relit'],[ACTIONS.mep_pr?'meppr':'mep','met en prod']]
    .map(([a,verb],i)=>({action:'bureau-'+a,verb,i})).filter(s=>ACTIONS[actKey(s.action)]);
  if(st.length<2||!x)return [];
  const asked=prs.some(p=>p.threads>0||p.review==='changes'), c=x.cat;
  const cur=c==='done'?4:c==='deploy'?3:c==='test'?2.5:c==='review'?(asked?1:2):prs.length&&asked?1:0;
  return st.map(({action,verb,i})=>({action,verb,who:actAgent(action),state:i<cur?'done':i===cur?'cur':'later'}));
}
// un portrait d'agent (clic : sa fiche), ou l'hologramme du Bureau
function agentFace(c,cls){
  const d=document.createElement('div');d.className=cls; // pas un <button> : le cadre pixel des boutons masquerait le portrait
  if(c){d.setAttribute('role','button');d.tabIndex=0;d.title='Fiche de '+c.name;d.appendChild(portrait(c,32));
    d.onclick=e=>{e.stopPropagation();winGo(c.key);}; // depuis le volet du Kanban : la fenêtre se ferme, « ← » la rouvred.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();d.onclick(e);}};
    if(!c.boss&&!c.person){const i=document.createElement('i');i.textContent=agentIcon(c);d.appendChild(i);}}
  else{d.textContent='🤖';d.title='Un workflow du Bureau, sans agent';}
  return d;
}
function tkChainStrip(box,steps){
  if(!steps.length)return;
  const ch=document.createElement('div');ch.className='la-chain';
  steps.forEach((s,i)=>{
    if(i)ch.insertAdjacentHTML('beforeend','<span class="la-ar">›</span>');
    const e=document.createElement('div'), n=s.who?s.who.name:'Le Bureau';e.className='la-st '+s.state;
    e.title=n+' '+s.verb+' : '+{done:'fait',cur:'en cours',later:'à venir'}[s.state];
    e.appendChild(agentFace(s.who,'la-av'));e.insertAdjacentHTML('beforeend',`<div><b>${esc(n)}</b><br>${esc(s.verb)}</div>`);
    ch.appendChild(e);
  });
  box.appendChild(ch);
}
const KM_NOTE='Chaque bouton ouvre la carte Kronn : tu valides, puis elle suit le run étape par étape.'; // une seule fois, en bas des boutons
const actGroup=(box,t)=>{const h=document.createElement('div');h.className='la-h';h.textContent=t;box.appendChild(h);};
// un bouton de lancement : bloc qui devient la fenêtre de la carte Kronn, note qui suit l'état du lancement (done : texte
// du succès, sinon « l'agent se met au travail »). verb (fiche d'un ticket ou d'une PR, #86) : l'agent de l'action, son
// portrait et sa phrase (« Nate corrige les 5 fils »), next = l'action conseillée ; grisé (off) ou agent déjà dessus
function launchBlock(box,{action,bind,name,sub,label,title,off,done,verb,next}){
  const raw=bind;bind=bindsFor(action,bind);if(!bind)return;
  const host=document.createElement('div');host.className='relaunch';host.setAttribute('data-kronn-action-slot-host','');
  const b=document.createElement('button');b.textContent=label;
  if(verb){
    const c=actAgent(action), busy=off?null:agentBusy(c,raw), cost=off||busy?'':runCost(c);
    if(busy)off=c.name+' est dessus depuis '+hm(busy._s);
    host.className='relaunch la'+(next&&!off?' next':'')+(off?' off':'');
    host.appendChild(agentFace(c,'la-av'));
    const t=document.createElement('div');t.className='la-t';
    t.innerHTML=`<div class="la-n"><b>${esc(c?c.name:'Le Bureau')}</b> ${esc(verb)}${next&&!off?' <span class="la-tag">● conseillé</span>':''}</div>`+
      `<div class="rl-s">${esc(busy?off+'.':sub)}${cost?` <span class="la-cost">${esc(cost)}</span>`:''}</div>`;
    host.appendChild(t);
  }else host.innerHTML=`<div class="rl-n">${esc(name)}</div><div class="rl-s">${esc(sub)}</div>`;
  if(off){b.disabled=true;b.title=off;host.appendChild(b);box.appendChild(host);return host;}
  b.setAttribute('data-kronn-action',action);b.setAttribute('data-kronn-bindings',JSON.stringify(bind));
  const n=document.createElement('div');n.className='note';n.style.margin='6px 0 0';
  if(!verb)n.textContent='Kronn ouvre sa carte : tu valides, puis elle suit le run étape par étape.'; // fiches : une seule note en bas
  new MutationObserver(()=>{
    const v=b.getAttribute('data-kronn-action-state');
    if(v==='succeeded')n.innerHTML=done||'<b style="color:var(--ok)">✓ Lancé.</b> L\'agent se met au travail d\'ici une minute sur le plan.';
    else if(v==='failed')n.innerHTML='<b style="color:var(--err)">Lancement refusé</b> (déjà en cours ?). Détail dans la carte.';
  }).observe(b,{attributes:true,attributeFilter:['data-kronn-action-state']});
  host.append(b,n);kronnModal(host,b,title,()=>{const c=verb&&actAgent(action);return verb?{c,ico:'🤖',name:(c?c.name:'Le Bureau')+' '+verb,small:sub}:{ico:'🎫'};});box.appendChild(host);
  return host;
}
// ◀ / ▶ : déplacer le ticket d'une colonne (workflow « déplacer un ticket », actions.move). Les sens et le statut Jira
// visé viennent du dataset actions (moves, cron équipe) : le bouton n'envoie que l'id de la ligne, Kronn y relit le reste.
// Avancer en bleu, reculer en gris ; chaque bouton dit la colonne visée et la raison du passage.
const MV_ORDER=['todo','doing','review','test','deploy','done'];
const MV_WHY={'doing>todo':'pas encore commencé','review>doing':'refusé en review','test>review':'à revoir','deploy>test':'à retester',
  'todo>doing':'on s\'y met','doing>review':'PR prête','review>test':'review validée','test>deploy':'test validé','deploy>done':'mis en prod à la main'};
// les boutons d'un ticket : [{m (ligne de actions.moves), to (colonne visée), why, bind}], reculer d'abord ; [] sans le workflow
function mvRows(x){
  if(!ACTIONS.move||!ACTS||!Array.isArray(ACTS.moves))return [];
  return ['prev','next'].map(d=>ACTS.moves.find(m=>m.key===x.key&&m.dir===d)).filter(Boolean).map(m=>{
    const to=MV_ORDER[MV_ORDER.indexOf(x.cat)+(m.dir==='next'?1:-1)];
    return {m,to,why:MV_WHY[x.cat+'>'+to]||'',bind:bindsFor('bureau-move',m)};}).filter(r=>r.bind);
}
// infobulle d'un bouton : un statut secondaire de la colonne (Reopen) passe d'abord par son statut principal (En cours) ;
// vers En cours, un ticket que personne n'a t'est affecté (le workflow le fait avant la transition)
const mvMine=(x,to)=>to==='doing'&&!x.owner;
function mvTitle(x,m,to){
  const via=(CFG.jira_main||{})[x.cat];
  return (m.dir==='next'?'Avancer':'Reculer')+' : passer le ticket en '+m.to+' dans Jira'+
    (via&&x.status&&x.status.toLowerCase()!==via.toLowerCase()?', en passant par '+via+' si Jira l\'exige depuis '+x.status:'')+
    (mvMine(x,to)?', et t\'y affecte (personne ne l\'a)':'');
}
function moveBlock(side,x){
  const rows=mvRows(x);if(!rows.length)return;
  const host=document.createElement('div');host.className='mv-host';host.setAttribute('data-kronn-action-slot-host','');
  const row=document.createElement('div');row.className='mv';host.appendChild(row);
  const hint=document.createElement('div');hint.className='hint mv-hint'; // dans la fenêtre de la carte Kronn seulement
  const note=document.createElement('div');note.className='note mv-note';
  for(const {m,to,why,bind} of rows){
    const c=TCAT[to]||{t:m.to,c:'var(--idle)'};
    const b=document.createElement('button');b.type='button';b.className='mv-'+m.dir+(m.dir==='next'?' on':'');
    b.title=mvTitle(x,m,to);
    b.innerHTML=`<span class="mv-col">${m.dir==='prev'?'◀ ':''}<span class="dot" style="background:${c.c}"></span>${esc(c.t)}${m.dir==='next'?' ▶':''}</span>${why?`<small>${esc(why)}</small>`:''}`;
    b.setAttribute('data-kronn-action','bureau-move');b.setAttribute('data-kronn-bindings',JSON.stringify(bind));
    b.addEventListener('click',()=>{hint.innerHTML=`<b>Lancer</b> : ${esc(x.key)} passe en <b>${esc(m.to)}</b> dans Jira${mvMine(x,to)?' et t\'est affecté (personne ne l\'a)':''} (transition vérifiée par Kronn, 0 token). Sa carte change de colonne au prochain passage du cron équipe (10 min au plus).`;});
    new MutationObserver(()=>{const v=b.getAttribute('data-kronn-action-state');
      if(v==='succeeded')note.innerHTML=`<b style="color:var(--ok)">✓ Demandé.</b> ${esc(x.key)} passe en ${esc(m.to)} ; sa carte suivra au prochain passage du cron équipe.`;
      else if(v==='failed')note.innerHTML='<b style="color:var(--err)">Déplacement refusé</b> : le détail est dans la carte (Jira ne propose peut-être pas ce passage).';
    }).observe(b,{attributes:true,attributeFilter:['data-kronn-action-state']});
    row.appendChild(b);
    kronnModal(host,b,'Déplacer un ticket',{ico:'🗂',tag:m.dir==='next'?'Avancer ▶':'◀ Reculer',name:x.key+' : '+(x.status||'')+' → '+m.to,small:x.summary});
  }
  if(rows.some(r=>r.to==='done'))host.insertAdjacentHTML('beforeend','<div class="note mv-done">D\'habitude, la mise en prod passe le ticket en Déployé toute seule ; ce bouton le fait à la main.</div>');
  host.append(hint,note);side.appendChild(host);
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
  head.innerHTML=prioLine(x)+`<div style="font-size:14px;margin-bottom:6px">${esc(x.summary)}</div>`+
    `<div style="font-size:12px;color:var(--muted)"><span class="dot" style="background:${cat.c};display:inline-block;margin-right:6px"></span>${esc(x.status||cat.t)}`+
    `${age?' depuis '+age:''} · ${x.owner?esc(x.owner):'non assigné'}${x.points?' · '+esc(x.points)+' pts':''} · ${jira}</div>`;
  side.appendChild(head);
  moveBlock(side,x);
  const prs=prsOf(key);
  if(prs.length){
    const pb=foldSection(side,'tk-prs','Ses PR ouvertes',prs.length,true);
    const ul=document.createElement('ul');ul.className='steps';ul.style.marginLeft='0';
    for(const p of prs){
      const r=p.draft?['brouillon','var(--idle)']:TK_REV[p.review]||TK_REV.pending;
      // sur deux lignes comme « Ses tickets » : n°, lien GitHub et état en tête, puis le titre sur toute la largeur (sans
      // « feat: » ni la clé du ticket, déjà en titre de la fiche), puis conflit, retard et fils de review
      const t=String(p.title||'').replace(/^\s*\w+(\([^)]*\))?!?:\s*/,'').replace(new RegExp('^'+key.replace(/\W/g,'\\$&')+'\\b[\\s:-]*'),'')||p.title||'', m=prMarks(p);
      const li=document.createElement('li');li.className='tkr';
      li.innerHTML=`<div class="tk-top"><span class="dot" style="background:${r[1]}"></span><a class="tk-key" href="#" data-pr="${esc(prId(p))}" title="Fiche de la PR">${esc(prNum(p))}</a>`+
        `<a class="tk-gh" ${hrefOf(p.url)} target="_blank" rel="noopener" title="Ouvrir sur GitHub">↗</a><span class="tk-rev">${r[0]}</span></div>`+
        `<div class="tk-t">${esc(t)}</div>${m.length?`<div class="tk-meta">${m.join('')}</div>`:''}`+prEnvLine(p);
      ul.appendChild(li);
    }
    pb.appendChild(ul);
  }
  if(!(ACTIONS.impl||ACTIONS.mep||ACTIONS.mep_pr||ACTIONS.review||ACTIONS.fix||ACTIONS.comment))return;
  const box=foldSection(side,'tk-launch','🤖 Lancer un workflow',null,true);
  const note=t=>{const e=document.createElement('div');e.className='note';e.textContent=t;box.appendChild(e);};
  if(!ACTS){note('Les boutons arrivent au prochain passage du cron équipe (10 min au plus).');return;}
  const known=ACTS.tickets.some(t=>t.key===key);
  tkChainStrip(box,tkChain(x,prs)); // #86 : où en est le ticket, avec les agents de chaque étape
  const nx=tkNext(x,prs), isNext=(a,id)=>!!nx&&nx.action===a&&(!nx.id||nx.id===id);
  const before=box.childElementCount;
  for(const p of prs){const k=box.childElementCount;prLaunch(box,p,{tickets:[x],isNext,group:'Sur la PR '+prNum(p)});
    if(box.childElementCount===k+1&&box.lastChild)box.lastChild.remove();} // groupe vide : son titre part
  const k0=box.childElementCount;
  actGroup(box,'Sur le ticket');
  if(known&&ACTIONS.impl&&(x.cat==='todo'||x.cat==='doing')&&!prs.length)
    launchBlock(box,{action:'bureau-impl',bind:{key},verb:'implémente le ticket',next:isNext('bureau-impl'),
      sub:'Après ta validation du plan, le ticket t\'est assigné et passe En cours ; le code, la PR et sa relecture suivent',label:'🤖 Implémenter',title:'Implémenter '+key});
  // « Mettre en prod » du ticket (launch.mep) : en To Deploy ; avant, grisé avec la raison, sauf si une PR du ticket
  // montre déjà le sien (pas deux fois la même attente)
  const prMep=ACTIONS.mep_pr&&prs.some(p=>mepRepo(prId(p)));
  if(known&&ACTIONS.mep&&x.cat!=='done'&&(x.cat==='deploy'||!prMep)){
    const frozen=stageClosed(Date.now()), later=x.cat!=='deploy'&&mepLater(x);
    launchBlock(box,{action:'bureau-mep',bind:{key},verb:'met le ticket en prod',next:isNext('bureau-mep'),
      sub:later||mepSub(frozen),
      label:'🚀 Mettre en prod',title:'Mettre en prod '+key,off:later||(frozen?MEP_FROZEN:null)});
  }
  if(known&&ACTIONS.comment) // à tout statut ; le texte se saisit dans la carte Kronn
    launchBlock(box,{action:'bureau-comment',bind:{key},verb:'commente le ticket',sub:'Ton commentaire part sur le ticket dans Jira',label:'💬 Commenter',title:'Commenter '+key});
  if(known&&ACTIONS.estimate&&x.cat!=='done') // ton workflow de réestimation (launch.estimate), sinon le modèle du Bureau
    launchBlock(box,{action:'bureau-estimate',bind:{key},verb:'réestime le ticket',sub:'Nouveaux Story Points et raison : le ticket est mis à jour dans Jira, avec un commentaire',label:'📏 Réestimer',title:'Réestimer '+key});
  if(box.childElementCount===k0+1&&box.lastChild)box.lastChild.remove();
  if(box.childElementCount===before)note(known?'Rien à lancer à ce statut.':'Ticket pas encore dans les données des boutons : prochain passage du cron équipe.');
  else note(KM_NOTE);
}
// mise en prod (#86) : seulement d'un ticket en To Deploy ; avant, la raison du bouton grisé (jira.flow.validated)
const MEP_FROZEN='Gel des mises en prod (rhythm.mep_freeze)';
const mepSub=f=>f?'Gel des mises en prod aujourd\'hui':'Rebase, CI, merge, release, staging puis prod, avec tes validations';
const mepStatus=()=>(CFG.jira_flow||{}).validated||'To Deploy';
const mepLater=x=>'Quand le ticket sera en '+mepStatus()+' (aujourd\'hui : '+(x.status||(TCAT[x.cat]||{}).t||'?')+')';
const mepRepo=id=>(CFG.mep_repos||[]).some(r=>r.toLowerCase()===String(id).replace(/#\d+$/,'').toLowerCase()); // id : « owner/dépôt#n »
// la ligne du dataset actions d'une PR (même dépôt, même numéro) ; ancien dataset sans id : son repo et son n°
const actPr=p=>ACTS&&ACTS.prs.find(q=>String(q.id||prId(q)).toLowerCase()===prId(p).toLowerCase())||null;
// « 🛠 Corriger » et « 🔎 Faire relire » d'une PR (fiche du ticket, fiche de la PR) : liées par « owner/dépôt#n » (#56),
// Kronn relit le dépôt et le numéro dans actions.prs. Corriger une PR d'un autre dépôt : si ton workflow prend le dépôt.
function prLaunch(box,p,{tickets,isNext=()=>false,group}={}){
  const a=actPr(p);
  if(!a)return;
  if(group)actGroup(box,group);
  const id=a.id||prId(p), nx=act=>isNext(act,prId(p));
  const dr=p.draft?' (brouillon)':'', nm=prNum(p); // un brouillon se relit et se corrige aussi
  // « 🌿 Générer l'env de branche », en tête : ton workflow de launch.env, sur les PR de ses dépôts (CFG.env_repos), brouillons
  // compris ; la ligne de la PR porte la valeur de sa variable action (actions.prs[].env, « reposer » par défaut). Dessous,
  // où en est son build (ebMount, 62-deploy.js) ; grisé tant qu'il tourne
  const env=ACTIONS.env&&(CFG.env_repos||[]).some(r=>repoKey(r)===repoKey(id.replace(/#\d+$/,'')));
  if(env){
    const s=p.head?ebState(p):{step:'none'}, busy=s.step==='asked'||s.step==='run';
    const h=launchBlock(box,{action:'bureau-env',bind:{id},verb:'génère l\'env de branche'+dr,
      sub:'Retire puis repose le label : crée l\'environnement de la PR, ou le reconstruit après un push',label:'🌿 Générer l\'env de branche',title:'Env de branche de '+nm,
      off:busy?'L\'env se construit : le bouton revient à la fin du build':null,
      done:'<b style="color:var(--ok)">✓ Label reposé.</b> GitHub construit l\'env : son état s\'affiche au-dessus, relu chaque minute.'});
    if(h&&p.head)ebMount(h,p);
  }
  // les envs partagés juste dessous : une ligne qui dit qu'ils n'ont rien à voir avec l'env de branche (on croyait déployer sur DEV)
  if(env&&dpEnvs(p).length){const sep=document.createElement('div');sep.className='eb-sep';sep.textContent='envs partagés, sans rapport avec l\'env de branche';box.appendChild(sep);}
  deployBlock(box,p); // « 🚀 Déployer la branche » hors prod (modèle deploy, 62-deploy.js)
  // « ⟳ Remettre à jour » (#74) : rebase sur la base, sans squash ; en retard ou en conflit d'après le cron équipe, ou état inconnu
  if(ACTIONS.rebase&&!p.merged&&(p.conflict||p.behind!==0)){
    const base=p.base||'main';
    launchBlock(box,{action:'bureau-rebase',bind:{id},verb:'remet la PR à jour',next:nx('bureau-rebase'),
      sub:p.conflict?'Conflit avec '+base+' : l\'IA propose une résolution, tu la valides avant tout push.':'Rebase sur '+base+', commits gardés, push protégé, CI relancée. Sans conflit : 0 token.',
      label:'⟳ Remettre à jour',title:'Remettre à jour '+nm});
  }
  // « 🛠 Corriger » (#75) : modèle du Bureau, tout dépôt, dès qu'il reste des fils de review non résolus (inconnus : changements
  // demandés) ; sinon ton workflow de launch.fix, comme avant
  if(ACTIONS.fix_pr){
    const t=p.threads;
    if(t>0||t==null&&p.review==='changes')launchBlock(box,{action:'bureau-fixpr',bind:{id},next:nx('bureau-fixpr'),
      verb:t>0?'corrige les '+(t>1?t+' fils':'fil')+' de review'+dr:'corrige les retours'+dr,
      sub:'Tu valides le diff et ses réponses, puis il pousse',
      label:'🛠 Corriger',title:'Corriger les retours de '+nm});
  }
  else if(ACTIONS.fix&&p.review==='changes'&&(!otherRepo(p.repo)||CFG.fix_any_repo))
    launchBlock(box,{action:'bureau-fix',bind:{id},verb:'corrige les retours'+dr,next:nx('bureau-fix'),sub:'Il applique les commentaires de review et pousse',label:'🛠 Corriger',title:'Corriger les retours de '+nm});
  if(ACTIONS.review&&p.review!=='approved')
    launchBlock(box,{action:'bureau-review',bind:{id},verb:'relit la PR'+dr,next:nx('bureau-review'),sub:'Sa review part sur GitHub',label:'🔎 Faire relire',title:'Faire relire '+nm});
  // « 🚀 Mise en prod » d'une PR (#58) : dépôt de la config (CFG.mep_repos), PR prête (ni brouillon ni changements demandés),
  // et un de ses tickets en To Deploy (#86) ; sinon grisé avec la raison (pas de mise en prod sans ticket à déployer)
  if(ACTIONS.mep_pr&&mepRepo(id)&&!p.draft&&p.review!=='changes'){
    const tks=tickets||(p.keys||[]).map(ticketOf).filter(Boolean), ready=tks.find(t=>t.cat==='deploy');
    const later=ready?null:!tks.length?'Pas de ticket Jira : pas de mise en prod sans ticket en '+mepStatus():tks.some(t=>t.cat==='done')?null:mepLater(tks[0]);
    const frozen=stageClosed(Date.now());
    if(ready||later)launchBlock(box,{action:'bureau-meppr',bind:{id},verb:'met la PR en prod',next:nx('bureau-meppr'),
      sub:later||mepSub(frozen),
      label:'🚀 Mise en prod',title:'Mettre en prod '+nm,off:later||(frozen?MEP_FROZEN:null)});
  }
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
  if(x.pr&&!x.pr.merged&&(ACTIONS.review||ACTIONS.fix||ACTIONS.fix_pr||ACTIONS.rebase||ACTIONS.mep_pr)){
    const box=foldSection(side,'pr-launch','🤖 Lancer un workflow',null,true), before=box.childElementCount;
    const note=t=>{const e=document.createElement('div');e.className='note';e.textContent=t;box.appendChild(e);};
    if(!ACTS)note('Les boutons arrivent au prochain passage du cron équipe (10 min au plus).');
    else{const p={...x.pr,repo:x.pr.repo||x.repo}, tks=(p.keys||[]).map(ticketOf).filter(Boolean), nx=tkNext(tks[0]||null,[p]);
      prLaunch(box,p,{isNext:(a,id)=>!!nx&&nx.action===a&&(!nx.id||nx.id===id)});
      if(box.childElementCount===before)note(!actPr(p)?'PR pas encore dans les données des boutons : prochain passage du cron équipe.'
        :p.review==='approved'?'Rien à lancer : PR approuvée.':'Rien à lancer sur cette PR.');
      else note(KM_NOTE);}
  }
  const rb=foldSection(side,'pr-runs','Les agents dessus aujourd\'hui',x.runs.length,true);
  if(!x.runs.length){const e=document.createElement('div');e.className='empty';e.textContent='Aucun run d\'agent sur cette PR aujourd\'hui.';rb.appendChild(e);return;}
  const ul=document.createElement('ul');ul.className='steps';ul.style.marginLeft='0';
  for(const {r,c} of x.runs){const ok=r.status==='Success', ko=r.status==='Failed';
    const li=document.createElement('li');
    li.innerHTML=`<span class="dot" style="background:${ok?'var(--ok)':ko?'var(--err)':'var(--warn)'}"></span><span class="k" style="white-space:nowrap">${esc(hm(r._s))}</span>`+
      `<a href="#" data-who="${esc(c.key)}" style="color:var(--accent)">${esc(c.name)}</a><span>${esc(clean(r.wf_name))}</span>`;
    ul.appendChild(li);}
  ul.addEventListener('click',e=>{const a=e.target.closest('[data-who]');if(a){e.preventDefault();e.stopPropagation();winGo(a.dataset.who);}});
  rb.appendChild(ul);
}
