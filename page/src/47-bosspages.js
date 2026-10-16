// ---------- écran mural « Mes pages Kronn » de la salle de réunion (#61 ; avant : l'écran du bureau du boss) ----------
// Dataset bosspages (cron fiche de paie, pages_snapshot.py) : titre, mise à jour, miniature de chaque page, et choices
// (les pages qu'on peut ajouter). Dataset pagelist (workflow « Le Bureau · pages », pages_save.py) : la liste rangée depuis
// la page, lue tout de suite (une page ajoutée s'affiche sans aperçu jusqu'au cron suivant), sinon celle de bosspages
// (clé boss_pages de la config). Le tableau blanc du plan devient un écran : 4 miniatures à la fois et une case « + » ;
// un clic ouvre la fenêtre, une carte par page qui l'ouvre dans Kronn, × pour la retirer, « + Ajouter » (code copié,
// carte Kronn). Rien en mode TV : ce sont les pages du boss.
let BOSS_PAGES=[], BOSS_CHOICES=[], PAGELIST=null;
const BOSS_PAGE_MS=4000, BP_IMG={};
const BP_IMG_OK=/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/;
const dsOf=(src,n)=>{let d=src&&src.datasets&&src.datasets[n];if(d&&d.current!==undefined)d=d.current;return typeof d==='string'?JSON.parse(d):d;};
function readBossPages(src){
  try{const d=dsOf(src,'bosspages');if(d&&Array.isArray(d.choices))BOSS_CHOICES=d.choices.filter(p=>p&&typeof p.id==='string');
    return d&&Array.isArray(d.pages)?d.pages.filter(p=>p&&typeof p.id==='string'):null;}catch(e){return null;}
}
function readPageList(src){try{const d=dsOf(src,'pagelist');return d&&Array.isArray(d.pages)?d.pages.filter(x=>typeof x==='string'):null;}catch(e){return null;}}
// les pages de l'écran, dans l'ordre de la liste rangée par la page s'il y en a une
function shownPages(){
  if(!PAGELIST)return BOSS_PAGES;
  return PAGELIST.map(id=>BOSS_PAGES.find(p=>p.id===id)||{id,title:(BOSS_CHOICES.find(p=>p.id===id)||{}).title||id.slice(0,8),updated:null,img:null});
}
const bossPagesOn=()=>!TV&&!!wallRect()&&(shownPages().length>0||!!ACTIONS.pages);
// image décodée une fois par page (et de nouveau quand la miniature change)
function bossPageImg(p){
  if(!p.img||!BP_IMG_OK.test(p.img))return null;
  let im=BP_IMG[p.id];
  if(!im||im.src!==p.img){im=new Image();im.src=p.img;BP_IMG[p.id]=im;}
  return im.complete&&im.naturalWidth?im:null;
}
// l'écran, centré sur le tableau blanc du plan (LAYOUT.wall), en pixels ; null sans tableau blanc
function wallRect(){const w=(LAYOUT.wall||[]).find(d=>d.type==='whiteboard');return w?{x:w.at[0]*TS+48-56,y:TS+5,w:112,h:21}:null;}
const WALL_SCREEN={y:TS+1,draw:now=>{
  if(!bossPagesOn())return;
  const r=wallRect(), l=shownPages(), n=Math.min(4,l.length), k=l.length>4?Math.floor(now/BOSS_PAGE_MS):0;
  R(ctx,r.x,r.y,r.w,r.h,'#14171e');R(ctx,r.x+1,r.y+1,r.w-2,1,'#2c313c');
  for(let i=0;i<5;i++){
    const x=r.x+3+i*22, y=r.y+3;
    if(i===4||i>=n){if(i===4&&ACTIONS.pages){R(ctx,x,y,20,15,'#2c313c');R(ctx,x+1,y+1,18,13,'#14171e');R(ctx,x+9,y+4,2,7,'#cfd6e3');R(ctx,x+6,y+6,8,2,'#cfd6e3');}continue;}
    const p=l[(i+k)%l.length], im=bossPageImg(p);
    R(ctx,x,y,20,15,'#1d3550');
    // les pages sont souvent sombres : à 20 px de large, une miniature éclaircie et saturée reste lisible
    if(im){ctx.save();ctx.imageSmoothingEnabled=true;ctx.filter='brightness(1.9) saturate(1.5)';ctx.drawImage(im,x,y,20,15);ctx.restore();}
  }
}};
const bpAge=a=>a>=864e5?Math.floor(a/864e5)+' j':agoTxt(a); // au-delà d'un jour, en jours
// Kronn ouvre dans l'onglet courant un lien vers sa propre adresse (même chemin + #page/…) ; avec /index.html, le
// chemin diffère : le lien part dans un nouvel onglet, sur le même Kronn
const bpLink=id=>kronnTab()+'#page/'+encodeURIComponent(id);
const pagesCode=(op,id)=>'PAGES1:'+btoa(JSON.stringify({op,id,at:Date.now()}));
let BP_ADDED=null, BP_SENT=null; // page ajoutée depuis la fenêtre (miniature en cours) ; demande en cours {b, op, p}
const bpPageOf=id=>shownPages().find(p=>p.id===id)||BOSS_CHOICES.find(p=>p.id===id)||{id,title:id.slice(0,8)};
const bpImg=(p,empty)=>p.img&&BP_IMG_OK.test(p.img)?`<img src="${p.img}" alt="">`:`<span class="bp-noimg">${empty}</span>`;
function bossPagesHtml(){
  const now=Date.now(), del=!!ACTIONS.pages;
  return shownPages().map(p=>{
    const age=p.updated?now-ms(p.updated):null, nw=p.id===BP_ADDED;
    return `<div class="bp-cell"><a class="bp-card" href="${esc(bpLink(p.id))}" target="_blank" rel="noopener">${bpImg(p,nw?'⏳ Miniature en cours…':'Pas d\'aperçu')}`+
      `<b>${esc(p.title||p.id.slice(0,8))}</b><small>${nw?'Ajoutée à l\'instant':age!=null&&age>=0?'Mise à jour il y a '+esc(bpAge(age)):''}<span aria-hidden="true">↗</span></small></a>`+
      (nw?'<span class="bp-badge">✓ Ajoutée</span>':'')+
      (del?`<button type="button" class="bp-del" data-kronn-action="bureau-pages" data-id="${esc(p.id)}" aria-label="Retirer ${esc(p.title||'')}">×</button>`:'')+'</div>';
  }).join('')+(del?'<button type="button" class="bp-card bp-plus"><span>+</span>Ajouter</button>':'');
}
const bpOpts=()=>{const have=new Set(shownPages().map(p=>p.id)), o=BOSS_CHOICES.filter(p=>!have.has(p.id));
  return `<option value="">${o.length?'Choisir parmi tes pages Kronn…':'Aucune autre page Kronn'}</option>`+o.map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('');};
function bossAddHtml(){
  if(!ACTIONS.pages)return '';
  return `<div class="bp-add"><label>+ Ajouter une page<select class="bp-pick">${bpOpts()}</select></label><button type="button" class="on bp-go" data-kronn-action="bureau-pages" disabled>Ajouter</button></div>`+
    `<div class="hint bp-hint">Ajout et retrait passent par une carte Kronn : le bouton copie le <b>code page</b> à y coller. L'écran se met à jour tout de suite, la miniature d'une page ajoutée quelques secondes après.</div>`;
}
// × et Ajouter (#61) : l'écran de validation remplace la grille (la carte Kronn s'ouvre juste dessous, dans le même
// bloc data-kronn-action-slot-host) ; l'aide ne suit que la demande lancée d'ici (Kronn garde l'état de la précédente
// sur tous les boutons de la même action)
function bpAsk(box,b,op,id){
  b.onclick=()=>{
    if(box.classList.contains('bp-on'))return; // second clic (Annuler) : Kronn referme sa carte
    const p=bpPageOf(id()), conf=box.querySelector('.bp-confirm');BP_SENT={b,op,p};
    box.classList.add('bp-on');conf.hidden=false;
    conf.innerHTML=`<div class="bp-what">${bpImg(p,'Pas encore d\'aperçu')}<div><span class="bp-tag ${op}">${op==='add'?'Ajouter à l\'écran mural':'Retirer de l\'écran mural'}</span>`+
      `<b>${esc(p.title||'')}</b><small>${op==='add'?'Sa miniature est faite juste après, en une dizaine de secondes.':'Elle quitte l\'écran ; la page Kronn elle-même n\'est pas touchée.'}</small></div>`+
      `<button type="button" class="bp-back">↩ Annuler</button></div><div class="hint"></div>`;
    codeHint(conf.querySelector('.hint'),pagesCode(op,p.id),'Code page','rien à retoucher');
    conf.querySelector('.bp-back').onclick=()=>bpBack(box);box.scrollTop=0;
  };
  new MutationObserver(()=>{
    if(!BP_SENT||BP_SENT.b!==b)return;
    const st=b.getAttribute('data-kronn-action-state'), h=box.querySelector('.bp-confirm .hint'), t=esc(BP_SENT.p.title||'');if(!h)return;
    if(st==='succeeded'){if(BP_SENT.op==='add')BP_ADDED=BP_SENT.p.id;BP_SENT.done=true;
      h.innerHTML=`<b style="color:var(--ok)">✓ C'est fait.</b> « ${t} » ${BP_SENT.op==='add'?'est sur l\'écran mural ; sa miniature arrive dans quelques secondes.':'a quitté l\'écran mural.'}`;
      box.querySelector('.bp-back').textContent='↩ Retour à mes pages';}
    else if(st==='failed')h.innerHTML='<b style="color:var(--err)">Code refusé.</b> Colle le code en entier (il commence par PAGES1:), puis relance.';
  }).observe(b,{attributes:true,attributeFilter:['data-kronn-action-state']});
}
// retour à la grille : la carte Kronn encore ouverte est refermée (second clic sur son bouton), la grille redessinée
function bpBack(box){
  const s=BP_SENT;
  if(s&&box.querySelector('[data-kronn-action-slot]'))s.b.click();
  box.classList.remove('bp-on');const conf=box.querySelector('.bp-confirm');conf.hidden=true;conf.innerHTML='';BP_SENT=null;
  bpRefresh(box);
  const h=box.querySelector('.bp-hint');if(s&&s.done&&h)h.innerHTML=`<b style="color:var(--ok)">✓ C'est fait.</b> « ${esc(s.p.title||'')} » ${s.op==='add'?'est sur l\'écran mural.':'a quitté l\'écran mural.'}`;
}
// la grille et la liste des pages à ajouter suivent les données (dataset pagelist, miniatures), sauf pendant une validation
function bpRefresh(box){
  box=box||document.querySelector('.bp-modal:not(.na-modal)');
  if(!box||box.classList.contains('bp-on')||!box.querySelector('.bp-confirm'))return;
  if(BP_ADDED&&(bpPageOf(BP_ADDED).img||!shownPages().some(p=>p.id===BP_ADDED)))BP_ADDED=null; // miniature arrivée
  box.querySelector('.bp-grid').innerHTML=bossPagesHtml();
  const pick=box.querySelector('.bp-pick'), go=box.querySelector('.bp-go');
  if(pick){pick.innerHTML=bpOpts();go.disabled=true;}
  bpWireGrid(box);
}
function bpWireGrid(box){
  for(const b of box.querySelectorAll('.bp-del'))bpAsk(box,b,'remove',()=>b.dataset.id);
  // la case « + Ajouter » de la grille ouvre directement la liste des pages à ajouter (sous la grille)
  const plus=box.querySelector('.bp-plus'), pick=box.querySelector('.bp-pick');
  if(plus)plus.onclick=()=>{if(!pick)return;pick.scrollIntoView({block:'nearest',behavior:SCROLL_BEHAVIOR});pick.focus();try{pick.showPicker();}catch(e){}};
}
function bossPagesWire(box){
  if(!box.querySelector('.bp-confirm'))return;
  const pick=box.querySelector('.bp-pick'), go=box.querySelector('.bp-go');
  bpWireGrid(box);
  if(go){pick.onchange=()=>{go.disabled=!pick.value;};bpAsk(box,go,'add',()=>pick.value);}
}
// fenêtre modale : le reste de la page est inerte, Tab et Maj+Tab bouclent dans la fenêtre, et à la fermeture le focus
// revient à l'élément qui l'avait ; ouverte d'un clic sur le canvas (non focalisable), il n'y en a pas : le focus revient
// alors au plan (tabindex -1, hors de l'ordre de tabulation), là où était l'écran cliqué, et Tab reprend aux boutons du rejeu
let BP_BACK=null, BP_INERT=[];
const bpFocusables=box=>[...box.querySelectorAll('a[href],button:not([disabled]),input,select,textarea')];
function openBossPages(){
  const back=BP_BACK||document.activeElement; // réouverture : on garde l'élément d'avant la première ouverture
  closeBossPages(false); if(!bossPagesOn())return;
  BP_BACK=back;
  const bd=document.createElement('div');bd.className='bp-backdrop';bd.onclick=()=>closeBossPages();
  const box=document.createElement('div');box.className='bp-modal';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','Mes pages Kronn');
  box.innerHTML=`<div class="bp-head"><h2>Mes pages Kronn</h2><button type="button" class="bp-x" aria-label="Fermer">×</button></div><div data-kronn-action-slot-host>${ACTIONS.pages?'<div class="bp-confirm" hidden></div>':''}<div class="bp-grid">${bossPagesHtml()}</div>${bossAddHtml()}</div>`;
  BP_INERT=[...document.body.children].filter(e=>!e.inert&&e.tagName!=='SCRIPT');
  BP_INERT.forEach(e=>{e.inert=true;});
  document.body.append(bd,box);
  box.querySelector('.bp-x').onclick=()=>closeBossPages();bossPagesWire(box);
  const first=box.querySelector('.bp-card')||box.querySelector('.bp-x');if(first)first.focus();
}
function closeBossPages(restore=true){
  const was=!!document.querySelector('.bp-modal');
  document.querySelectorAll('.bp-backdrop,.bp-modal').forEach(e=>e.remove());
  BP_INERT.forEach(e=>{e.inert=false;});BP_INERT=[];
  if(!restore)return;
  const back=BP_BACK;BP_BACK=null;
  if(was)focusBack(back);
}
// retour du focus à la fermeture d'une fenêtre (pages du boss, nouvel agent) : l'élément d'avant, sinon le plan
function focusBack(back){
  if(back&&back!==document.body&&back.isConnected&&back.focus){back.focus();if(document.activeElement===back)return;}
  const plan=document.getElementById('cv');
  if(plan){if(!plan.hasAttribute('tabindex'))plan.tabIndex=-1;plan.focus();}
}
function bossPagesKey(e){
  const box=document.querySelector('.bp-modal');if(!box)return;
  if(e.key==='Escape'){(/\bna-modal\b/.test(box.className)?closeNewAgent:closeBossPages)();return;} // 66-newagent.js : même fenêtre
  if(e.key!=='Tab')return;
  const f=bpFocusables(box);if(!f.length)return;
  const a=f[0], z=f[f.length-1], cur=document.activeElement, inside=box.contains(cur);
  if(e.shiftKey&&(cur===a||!inside)){e.preventDefault();z.focus();}
  else if(!e.shiftKey&&(cur===z||!inside)){e.preventDefault();a.focus();}
}
addEventListener('keydown',bossPagesKey);
