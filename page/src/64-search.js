// ---------- Chercher dans le bureau : une fenêtre, ⌘K (Ctrl+K) ou « / » ----------
// Tickets et PR de l'équipe, tickets de la chaîne (1er étage), personnes et agents du plan, pages Kronn de l'écran du boss :
// un champ, des résultats groupés (5 par groupe). ↑ ↓ choisir, ↵ ouvrir (ticket, PR : volet du Mur Kanban ; ticket du 1er :
// sa fiche à l'étage ; personne, agent : sa fiche ; page : dans Kronn), ⇧↵ la montrer sur le plan (la personne du ticket,
// l'auteur de la PR : sa fiche, le plan assombri autour).
// Chaque mot tapé doit se trouver dans la ligne, sans tenir compte des accents ni de la casse.
const SR_MAX=5;
let SR_Q='', SR_I=0, SR_ROWS=[];
const srNorm=s=>String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const srHit=(q,txt)=>{const t=srNorm(txt);return srNorm(q).split(/\s+/).filter(Boolean).every(w=>t.includes(w));};
function srFind(q){
  if(!srNorm(q).trim())return [];
  const tk=TEAM?[...TEAM.people.flatMap(p=>(p.tickets||[]).map(t=>({t,p}))),...(TEAM.unassigned||[]).map(t=>({t}))]:[];
  const pr=TEAM?[...TEAM.people.flatMap(p=>(p.prs||[]).map(x=>({x,p}))),...(TEAM.other_prs||[]).map(x=>({x}))]:[];
  return [
    ...tk.filter(o=>srHit(q,o.t.key+' '+o.t.summary)).sort((a,b)=>TORDER.indexOf(a.t.cat)-TORDER.indexOf(b.t.cat))
      .map(o=>({g:'Tickets',k:String(o.t.key).replace(/^[A-Z]+-/,''),txt:o.t.summary,cat:o.t.cat,who:kbCharOf(o.p),go:()=>openTicket(o.t.key)})),
    ...atSearchRows(q), // 69-atelier-rdc.js : les tickets de la chaîne, au 1er
    ...pr.filter(o=>srHit(q,'#'+o.x.n+' '+o.x.title)).map(o=>({g:'PR',k:'#'+o.x.n,txt:o.x.title,rev:o.x.review,who:kbCharOf(o.p),go:()=>openPr(prId(o.x))})),
    // agents : un groupe par famille (32-familles.js) ; le titre de sa page trouve un agent de page
    ...chars.filter(c=>c.name&&srHit(q,c.name+' '+(c.role||'')+' '+((agentPage(c)||{}).title||''))).map(c=>{const k=famKind(c),pg=k==='page'&&agentPage(c),b=k==='jour'&&agentButtons(c)[0];
      return {g:k?'Agents · '+AFAM[k].t.toLowerCase():'Personnes',fam:k,k:(k?agentIcon(c)+' ':'')+c.name,
        txt:pg?(c.temp?'📺 remplit sa page':'📺 '+pageName(pg.title))+(pg.wall?", sur l'écran":''):b?b[0]:k?agentShort(c):c.role||'',who:c.key,go:()=>select(c.key)};})
      .sort((a,b)=>(a.fam?AFAM_ORDER.indexOf(a.fam)+1:0)-(b.fam?AFAM_ORDER.indexOf(b.fam)+1:0)),
    ...shownPages().filter(p=>srHit(q,p.title)).map(p=>({g:'Pages Kronn',k:'📊',txt:p.title,href:bpLink(p.id)}))];
}
function srRow(r,i){
  const c=r.who&&byKey[r.who], on=i===SR_I?' on':'';
  const side=(r.cat?`<span class="sr-chip" style="--c:${TCAT[r.cat].c}">${TCAT[r.cat].t}</span>`:'')+
    (r.rev&&TK_REV[r.rev]?`<span class="sr-w">${TK_REV[r.rev][0]}</span>`:'')+(c&&r.g!=='Personnes'&&!r.fam?`<span class="sr-w">${esc(c.name)}</span>`:'');
  const body=`<b class="k">${esc(r.k)}</b><span class="t">${esc(r.txt)}</span>${side}`;
  return r.href?`<a class="sr-r${on}" id="sr-${i}" role="option" aria-selected="${!!on}" data-i="${i}" href="${esc(r.href)}" target="_blank" rel="noopener">${body}</a>`:
    `<div class="sr-r${on}" id="sr-${i}" role="option" aria-selected="${!!on}" data-i="${i}">${body}</div>`;
}
function srFill(box){
  const groups={};for(const r of srFind(SR_Q))(groups[r.g]=groups[r.g]||[]).push(r);
  SR_ROWS=[];let h='';
  for(const [g,list] of Object.entries(groups)){
    h+=`<div class="sr-g" role="group" aria-label="${g}"><h3>${g} <span>${list.length}</span></h3>`;
    for(const r of list.slice(0,SR_MAX))h+=srRow(r,SR_ROWS.push(r)-1);
    if(list.length>SR_MAX)h+=`<p class="sr-none">et ${list.length-SR_MAX} de plus : précise ta recherche</p>`;
    h+='</div>';
  }
  SR_I=Math.min(SR_I,Math.max(0,SR_ROWS.length-1));
  box.innerHTML=h||`<p class="sr-none">${SR_Q.trim()?'Rien pour « '+esc(SR_Q)+' »':'Un ticket (7637), une PR (#2012), un prénom, un agent, une page Kronn'}</p>`;
  const inp=document.querySelector('.sr-in input');if(inp)inp.setAttribute('aria-activedescendant',SR_ROWS.length?'sr-'+SR_I:'');
}
function srOpen(r,plan){
  if(!r)return;
  if(r.href){if(!plan){const a=document.getElementById('sr-'+SR_ROWS.indexOf(r));if(a)a.click();}return;} // le clic sur le lien ferme la fenêtre
  closeBossPages(false);
  if(plan||!r.go){if(r.who){select(r.who);cv.scrollIntoView({block:'nearest',behavior:SCROLL_BEHAVIOR});}}else r.go();
}
function openSearch(){
  if(TV||document.querySelector('.bp-modal'))return;
  openWide('search','Chercher dans le bureau',box=>{
    if(box.querySelector('.sr-in'))return srFill(box.querySelector('#sr-list')); // données rafraîchies (wideRefresh) : la frappe reste
    box.innerHTML=`<label class="sr-in"><span aria-hidden="true">🔍</span><input type="text" role="combobox" aria-expanded="true" aria-controls="sr-list" aria-label="Chercher" placeholder="Ticket, PR, personne, agent, page" value="${esc(SR_Q)}"></label>`+
      `<div id="sr-list" role="listbox"></div><p class="sr-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> choisir</span><span><kbd>↵</kbd> ouvrir</span><span><kbd>⇧↵</kbd> sur le plan</span></p>`;
    const inp=box.querySelector('input'), list=box.querySelector('#sr-list');
    inp.oninput=()=>{SR_Q=inp.value;SR_I=0;srFill(list);};
    inp.onkeydown=e=>{
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!SR_ROWS.length)return;SR_I=(SR_I+(e.key==='ArrowDown'?1:SR_ROWS.length-1))%SR_ROWS.length;srFill(list);
        const r=document.getElementById('sr-'+SR_I);if(r)r.scrollIntoView({block:'nearest'});}
      else if(e.key==='Enter'){e.preventDefault();srOpen(SR_ROWS[SR_I],e.shiftKey);}
    };
    // un lien de page : le pont de Kronn l'ouvre depuis le clic (lien encore dans la page), puis la fenêtre se ferme
    list.onclick=e=>{const r=e.target.closest('.sr-r');if(!r)return;if(r.tagName==='A'){setTimeout(()=>closeBossPages(false));return;}e.preventDefault();SR_I=+r.dataset.i;srOpen(SR_ROWS[SR_I],e.shiftKey);};
    srFill(list);
  });
  const box=document.querySelector('.bp-wide');box.classList.add('sr-win');
  const inp=box.querySelector('.sr-in input');inp.focus();inp.select(); // openWide met le focus sur ×
}
addEventListener('keydown',e=>{
  if(e.target&&/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||EDIT)return;
  if((e.key==='k'||e.key==='K')&&(e.metaKey||e.ctrlKey)||e.key==='/'&&!e.metaKey&&!e.ctrlKey&&!e.altKey){e.preventDefault();openSearch();}
});
document.getElementById('searchbtn')?.addEventListener('click',openSearch);
