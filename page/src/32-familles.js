// ---------- familles d'agents : au quotidien, pages, autres ----------
// Au quotidien : les agents nommés (config, pack), un bouton chacun ou lancés depuis leur fiche. Pages : un workflow qui
// publie dans une page Kronn (pour un agent nommé, seulement par un cron : un agent à la demande peut aussi publier dans
// une page sans en être) ; son intérimaire prend le nom de la page, un seul par page. Autres : les intérimaires de passage, sans
// page, et l'agent nommé qui tourne seul en cron, sans page ni bouton. Le lien
// workflow -> page vient de bosspages (pages[].feeds pour l'écran mural, choices[].feeds pour les autres pages) ;
// agents[].family du pack le force (jour, page, autre).
const AFAM={jour:{t:'Au quotidien',ico:'🧰',c:'#5fd4ff',sub:'Les boutons des fiches'},
  page:{t:'Pages',ico:'📺',c:'#b58cff',sub:'Remplissent tes pages Kronn'},
  autre:{t:'Autres',ico:'🛰',c:'#ffb547',sub:'De passage, ou seuls en cron'}};
const AFAM_ORDER=['jour','page','autre'];
// la page où publie ce workflow (préfixe), {id, title, wall, img, cron} ; l'écran mural d'abord
function pageFeed(w){
  w=String(w||'').slice(0,8);if(!w)return null;
  for(const [list,wall] of [[BOSS_PAGES,true],[BOSS_CHOICES,false]])for(const p of list||[]){
    const f=(Array.isArray(p.feeds)?p.feeds:[]).find(x=>x&&String(x.wf).startsWith(w));
    if(f)return {id:p.id,title:String(p.title||''),wall:wall||BOSS_PAGES.some(b=>b.id===p.id),img:p.img||null,cron:f.trigger==='cron'};
  }
  return null;
}
// nom d'un intérimaire de page : le titre sans son sous-titre (« Ventes du trimestre — siège » -> « Ventes du trimestre »)
const pageName=t=>String(t||'').split(/\s+[—·:|]\s+/)[0].trim().slice(0,30)||'Page';
// la page d'un agent : celle de son intérimaire, sinon la première où publie un de ses crons
function agentPage(c){
  if(!c||!c.wf)return null;
  for(const w of c.wf){const p=pageFeed(w);if(p&&(c.temp||p.cron))return p;}
  return null;
}
function famKind(c){
  if(!c||c.person||c.visitor||c.guest||c.boss)return null;
  if(AFAM[c.family])return c.family;
  return agentPage(c)?'page':c.temp||!agentButtons(c).length&&cronsOf(c).length?'autre':'jour';
}
// boutons des fiches (CFG.action_wf, #86) et modèles incarnés : ce que l'agent fait, et où l'on clique
const FAM_BTN={impl:['🤖 Implémenter','t'],mep:['🚀 Mettre en prod','t'],estimate:['📏 Réestimer','t'],mep_pr:['🚀 Mise en prod','p'],
  review:['🔎 Faire relire','p'],fix:['🛠 Corriger','p'],fix_pr:['🛠 Corriger','p'],rebase:['⟳ Remettre à jour','p'],
  env:["🌿 Générer l'env de branche",'p'],deploy:['🚀 Déployer','p']};
const FAM_WHERE={t:"la fiche d'un ticket",p:"la fiche d'une PR",s:'la fenêtre Support',m:'ta fiche'};
function agentButtons(c){
  const has=w=>!!w&&(c.wf||[]).includes(String(w).slice(0,8)), out=[];
  for(const [k,w] of Object.entries(CFG.action_wf||{}))if(FAM_BTN[k]&&has(w)&&!out.some(b=>b[0]===FAM_BTN[k][0]))out.push(FAM_BTN[k]);
  if(CFG.ticket&&has(CFG.ticket.wf))out.push(['🎫 Créer un ticket','m']);
  if(CFG.support&&has(CFG.support.wf))out.push(['🔎 Investiguer','s']);
  return out;
}
const famPortraitHolo=c=>{const k=famKind(c);return k&&HOLO_STYLE[k]&&!c.holo?HOLO_STYLE[k]:null;};
// bloc de la fiche d'un agent : à quoi il sert (sa page, son bouton, ou de passage)
function famBlock(side,c){
  const k=famKind(c);if(!k)return;
  const d=document.createElement('div');d.className='famw';d.style.setProperty('--f',AFAM[k].c);
  let body;
  if(k==='page'){
    const p=agentPage(c);
    body=p?`${p.img&&BP_IMG_OK.test(p.img)?`<img src="${p.img}" alt="">`:''}<div><div class="famt">Remplit <a ${hrefOf(bpLink(p.id))} target="_blank" rel="noopener">${esc(p.title)} ↗</a></div>`+
      `<div class="fams">${p.wall?"Sur l'écran mural de la salle de réunion":"Pas sur l'écran mural"+(ACTIONS.pages?' · <a href="#" data-fam-wall>+ l\'y ajouter</a>':'')}</div></div>`
      :'<div><div class="famt">Rangé dans les pages</div></div>';
  }else if(k==='jour'){
    const b=agentButtons(c);
    body=`<div><div class="famt">${b.length?'Son bouton : '+b.map(x=>'<b>'+esc(x[0])+'</b>').join(', '):'Se lance depuis sa fiche'}</div>`+
      `<div class="fams">${b.length?'sur '+[...new Set(b.map(x=>FAM_WHERE[x[1]]))].join(', '):'▶ Lancer, plus bas'}</div></div>`;
  }else if(!c.temp){
    body=`<div><div class="famt">Tourne seul, sans bouton ni page</div><div class="fams">${esc(cronsOf(c).map(x=>cronText(x.schedule,T)).join(' ; '))}</div></div>`;
  }else{
    const r=c.runs[0];
    body=`<div><div class="famt">De passage : aucun agent pour ce workflow</div><div class="fams">${r?'Lancé à '+hm(r._s):''}</div></div>`;
  }
  d.innerHTML=`<div class="famk">${AFAM[k].ico} ${AFAM[k].t}</div>${body}`;
  const a=d.querySelector('[data-fam-wall]');if(a)a.onclick=e=>{e.preventDefault();openBossPages();};
  side.appendChild(d);
}
// pastille de famille sur le portrait d'une carte (Qui fait quoi) : hors du texte, qui ne bouge pas
const famBadge=c=>{const k=famKind(c);return k?`<i class="famb2" style="--f:${AFAM[k].c}" title="${AFAM[k].t}">${AFAM[k].ico}</i>`:'';};
// en-tête d'un sous-groupe (panneau, fiche de paie) : pastille, nom, nombre, ce qu'ils font ; extra à droite
const famHead=(k,n,extra)=>`<div class="famh"><span class="famn"><i style="background:${AFAM[k].c}"></i>${AFAM[k].ico} ${AFAM[k].t}${n!=null?' <b>'+n+'</b>':''}<small>${AFAM[k].sub}</small></span>${extra?`<span class="famx">${extra}</span>`:''}</div>`;
