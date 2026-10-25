// ---------- Mur Kanban : la fenêtre des tickets du sprint ----------
// Une fenêtre large (openWide, 47-bosspages.js). En haut, une barre de personnes (portrait, prénom, nombre de tickets)
// filtre les colonnes sur les tickets d'un personnage (ceux de sa fiche, rôle compris : la testeuse voit ce qui est en
// test) ; six colonnes, une carte par ticket (clé, composant, titre, points, personne), 7 par colonne, « + N autres ».
// KB_WHO : clé du personnage filtré ('' : tout le sprint, '-' : les non assignés).
// Un ticket ouvre sa fiche dans un volet à droite des colonnes (KB_VOL : {t:'ticket',k} ou {t:'pr',id}) ; un lien du
// volet (sa PR, son ticket) y ouvre l'autre fiche, « ← » revient (KB_BACK) ; × ou Échap ferme le volet, puis la fenêtre.
// Volet ouvert : cartes compactes (clé, points, titre), « Déployé » repliée en bande.
const KB_MAX=7, KB_ALL={};
let KB_WHO='', KB_VOL=null, KB_BACK=[];
// un ticket réouvert (statut jira.flow.reopened, rangé dans « En cours ») : pastille « ↺ Réouvert » et liseré rouge
const kbReopened=x=>!!x.status&&x.status===FLOW.reopened;
const kbPeople=()=>chars.filter(c=>c.person&&c.team&&c.team.tickets.length);
function kbTitle(){
  const c=byKey[KB_WHO];
  return 'Mur Kanban'+(c?' · '+c.name:KB_WHO==='-'?' · non assignés':TEAM&&TEAM.sprint&&TEAM.sprint.name?' · sprint '+TEAM.sprint.name:'');
}
// o : {who} ; true garde le filtre d'avant (retour par l'historique du panneau) ; sans rien, tout le sprint
function openKanban(o){
  if(o!==true){o=o||{};KB_WHO=o.who||'';KB_BACK=[];KB_VOL=o.ticket?{t:'ticket',k:o.ticket}:o.pr?{t:'pr',id:o.pr}:null;}
  openWide('kanban',kbTitle(),kanbanFill);
}
// une fiche dans le volet : depuis une carte, le volet repart de zéro ; depuis un lien du volet, « ← » y revient
function kbShow(v,fromCard){
  if(fromCard)KB_BACK=[];else if(KB_VOL){const b=KB_BACK[KB_BACK.length-1];if(b&&b.t===v.t&&(b.k||b.id)===(v.k||v.id))KB_BACK.pop();else KB_BACK.push(KB_VOL);}
  KB_VOL=v;const box=document.querySelector('.bp-wide[data-win="kanban"] .bp-wbody');if(box)kanbanFill(box);
}
function kbClose(){KB_VOL=null;KB_BACK=[];const box=document.querySelector('.bp-wide[data-win="kanban"] .bp-wbody');if(box)kanbanFill(box);}
// une PR cite-t-elle un ticket du sprint ? (ses clés, relevées dans son titre par le cron équipe)
function kbPrInSprint(id){
  const x=TEAM&&[...TEAM.people.flatMap(p=>p.prs||[]),...(TEAM.other_prs||[])].find(q=>prId(q)===id);
  return !!x&&(x.keys||[]).some(k=>ticketOf(k));
}
const kbLabel=v=>v.t==='pr'?'PR #'+String(v.id).split('#').pop():v.k;
function kbCols(){
  const c=byKey[KB_WHO], keys=c&&c.team?new Set(c.team.tickets.map(x=>x.key)):null;
  return kanbanCols().map(({k,list})=>({k,list:KB_WHO==='-'?list.filter(x=>!x.owner):keys?list.filter(x=>keys.has(x.key)):list}));
}
function kbBar(){
  const btn=(k,label,n,cls)=>`<button type="button" class="kbp-b${cls?' '+cls:''}${KB_WHO===k?' on':''}" data-who="${esc(k)}" aria-pressed="${KB_WHO===k}">`+
    (byKey[k]?`<span class="kbp-pt" data-pt="${esc(k)}"></span>`:'')+`${esc(label)} <span class="n">${n}</span></button>`;
  const un=(TEAM.unassigned||[]).length;
  return `<div class="kbp" role="group" aria-label="Filtrer par personne">`+btn('','Tous',kanbanCols().reduce((a,c)=>a+c.list.length,0),'all')+
    kbPeople().map(c=>btn(c.key,c.name,c.team.tickets.length)).join('')+(un?btn('-','Non assigné',un,'none'):'')+'</div>';
}
function kanbanFill(box){
  if(!TEAM){box.innerHTML='<div class="empty">Données de l\'équipe pas encore publiées.</div>';return;}
  // une carte Kronn ouverte depuis le volet, ou une saisie : on ne redessine pas (les données reviennent chaque minute)
  if(KM_OPEN&&box.contains(KM_OPEN)||box.querySelector('[data-kronn-action-slot]'))return;
  const old=box.querySelector('.kbv'), vs=old?old.scrollTop:0, win=box.closest('.bp-modal'), ws=win?win.scrollTop:0;
  if(win)win.classList.toggle('kb-vol',!!KB_VOL);
  if(KB_WHO&&KB_WHO!=='-'&&!byKey[KB_WHO])KB_WHO='';
  const h=box.closest('.bp-modal')&&box.closest('.bp-modal').querySelector('.bp-head h2');if(h)h.textContent=kbTitle();
  const cur=KB_VOL&&KB_VOL.t==='ticket'?KB_VOL.k:null;
  box.innerHTML=kbBar()+'<div class="kbm"><div class="kbw">'+kbCols().map(({k,list})=>{
    const pts=list.reduce((a,x)=>a+(+x.points||0),0), n=KB_ALL[k]?list.length:KB_MAX;
    if(KB_VOL&&k==='done')return `<button type="button" class="kbw-col kbw-strip" title="${esc(TCAT[k].t)} : ${list.length} tickets (fermer le volet pour les voir)"><span class="dot" style="background:${TCAT[k].c}"></span>${esc(TCAT[k].t)} · ${list.length}</button>`;
    return `<section class="kbw-col" aria-label="${esc(TCAT[k].t)}"><h3><span class="dot" style="background:${TCAT[k].c}"></span>${esc(TCAT[k].t)}<small>${list.length}${pts?' · '+Math.round(pts)+' pts':''}</small></h3>`+
      list.slice(0,n).map(x=>{const t=tkComp(x.summary), ro=kbReopened(x);
        return `<a href="#" class="kbw-c${x.key===cur?' kb-on':''}${ro?' kb-ro':''}" data-tk="${esc(x.key)}"${x.key===cur?' aria-current="true"':''} style="--c:${TCAT[k].c}" title="Ouvrir sa fiche et ses actions">`+
          (ro?'<span class="kb-rot" title="Réouvert en test : retour en cours">↺ Réouvert</span>':'')+`<b>${esc(x.key)}</b>${x.points?`<em>${esc(x.points)} pts</em>`:''}`+
          `<span class="kbw-t">${t.comp?`<span class="kbw-cp">${esc(t.comp)}</span>`:''}${esc(t.title)}</span><small>${esc(x.owner?String(x.owner).split(' ')[0]:'non assigné')}</small></a>`;}).join('')+
      (list.length>n?`<button type="button" class="kbw-more" data-col="${k}">+ ${list.length-n} autre${list.length-n>1?'s':''}</button>`:'')+
      (list.length?'':'<span class="kbw-none">—</span>')+'</section>';
  }).join('')+'</div></div><p class="hint">'+(KB_VOL?'Un autre ticket change le volet ; un lien de PR l\'y ouvre, « ← » revient ; Échap ferme le volet, puis la fenêtre.':
    'Un portrait filtre les colonnes sur ses tickets, « Tous » revient au sprint entier. Un ticket ouvre sa fiche dans un volet, à droite.')+'</p>';
  if(KB_VOL)kbVolet(box.querySelector('.kbm'));
  const v=box.querySelector('.kbv');if(v)v.scrollTop=vs;if(win)win.scrollTop=ws;
  for(const e of box.querySelectorAll('[data-pt]'))e.appendChild(portrait(byKey[e.dataset.pt],24));
  for(const b of box.querySelectorAll('.kbp-b'))b.onclick=()=>{KB_WHO=b.dataset.who;kanbanFill(box);};
  for(const b of box.querySelectorAll('.kbw-more'))b.onclick=()=>{KB_ALL[b.dataset.col]=true;kanbanFill(box);};
  for(const a of box.querySelectorAll('.kbw-c'))a.onclick=e=>{e.preventDefault();e.stopPropagation();kbShow({t:'ticket',k:a.dataset.tk},true);}; // pas le lien global (62-ticket.js)
  const st=box.querySelector('.kbw-strip');if(st)st.onclick=kbClose;
}
// le volet : « ← » (fiche d'avant) ou rien, × ; puis la fiche du ticket ou de la PR (62-ticket.js), comme dans le panneau
function kbVolet(m){
  const v=document.createElement('div');v.className='kbv side';v.setAttribute('aria-label','Fiche');
  const top=document.createElement('div');top.className='kbv-top';
  const prev=KB_BACK[KB_BACK.length-1];
  if(prev){const b=document.createElement('button');b.type='button';b.className='back';b.textContent='← '+kbLabel(prev);b.onclick=()=>{KB_VOL=KB_BACK.pop();kanbanFill(m.parentNode);};top.appendChild(b);}
  // une PR dont aucun ticket n'est dans le sprint (ouverte depuis « Ses autres PR ouvertes ») : aucune carte encadrée, on le dit
  if(KB_VOL.t==='pr'&&!kbPrInSprint(KB_VOL.id))top.insertAdjacentHTML('beforeend','<span class="kbv-tag">PR sans ticket dans le sprint</span>');
  else if(!prev)top.insertAdjacentHTML('beforeend','<span class="kbv-esc">Échap ferme le volet</span>');
  const x=document.createElement('button');x.type='button';x.className='bp-x';x.setAttribute('aria-label','Fermer le volet');x.textContent='×';x.onclick=kbClose;top.appendChild(x);
  v.appendChild(top);m.appendChild(v);
  // un nom (auteur, agent du jour) : sa fiche dans le panneau, la fenêtre se ferme et « ← Mur Kanban » la rouvre
  v.addEventListener('click',e=>{const a=e.target.closest('[data-who]');if(a&&byKey[a.dataset.who]){e.preventDefault();e.stopPropagation();winGo(a.dataset.who);}});
  if(KB_VOL.t==='pr')renderPr(v,KB_VOL.id);else renderTicket(v,KB_VOL.k);
}
