// ---------- fenêtres ----------
// Le seul gabarit de fenêtre de la page (audit UX, constat 14) : barre de titre (titre, « Échap pour fermer », ×), une
// ligne de sous-titre facultative, puis le corps (.bp-body), seul à défiler sous la barre. Fenêtre modale : le reste de la
// page est inerte, Tab et Maj+Tab bouclent dedans, Échap ou un clic sur le fond la ferment, et le focus revient à
// l'élément qui l'avait ; ouverte d'un clic sur le canvas (non focalisable), il n'y en a pas : le focus revient alors au
// plan (tabindex -1, hors de l'ordre de tabulation). Une seule à la fois : en ouvrir une referme l'autre. Les cartes
// Kronn (kronnModal, 55-actions.js) prennent la même barre et les mêmes règles.
let BP_BACK=null, BP_INERT=[], DLG=null; // DLG : {k, onClose} de la fenêtre ouverte
const BP_ESC='<span class="bp-esc" aria-hidden="true">Échap pour fermer</span>';
const bpHead=title=>`<div class="bp-head"><h2>${esc(title)}</h2>${BP_ESC}<button type="button" class="bp-x" aria-label="Fermer">×</button></div>`;
// ce que Tab atteint : visible (une règle display:none ou hidden ôte l'élément de l'ordre de tabulation)
const bpFocusables=box=>[...box.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')]
  .filter(e=>!e.closest('[hidden]')&&(!e.getClientRects||e.getClientRects().length>0));
// le nom de la fenêtre pour le lecteur d'écran : le titre sans son pictogramme
const dlgLabel=t=>String(t||'').replace(/^[\u{1F300}-\u{1FAFF}☀-➿]️?\s*/u,'');
// o : {k, title, label, wide, cls, sub, body(el), focus (sélecteur dans le corps), onClose} ; renvoie la fenêtre
function openDialog(o){
  const back=BP_BACK||document.activeElement; // réouverture par-dessus : on garde l'élément d'avant la première ouverture
  closeDialog(false);BP_BACK=back;
  const bd=document.createElement('div');bd.className='bp-backdrop';bd.onclick=()=>closeDialog();
  const box=document.createElement('div');box.className='bp-modal'+(o.wide?' bp-wide':'')+(o.cls?' '+o.cls:'');
  if(o.k)box.dataset.win=o.k;
  box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label',o.label||dlgLabel(o.title));
  box.innerHTML=bpHead(o.title)+(o.sub!=null?`<p class="bp-sub">${esc(o.sub)}</p>`:'')+'<div class="bp-body"></div>';
  const x=box.querySelector('.bp-x'), body=box.querySelector('.bp-body');x.onclick=()=>closeDialog();
  BP_INERT=[...document.body.children].filter(e=>!e.inert&&e.tagName!=='SCRIPT');BP_INERT.forEach(e=>{e.inert=true;});
  document.body.append(bd,box);
  DLG={k:o.k||'',onClose:o.onClose||null};
  if(o.body)o.body(body);
  const f=(o.focus&&body.querySelector(o.focus))||bpFocusables(body)[0]||x;f.focus();
  return box;
}
function closeDialog(restore=true){
  WIN_OPEN=null;
  const boxes=[...document.querySelectorAll('.bp-modal')], d=DLG;DLG=null;
  boxes.forEach(closeKronnCardIn);
  document.querySelectorAll('.bp-backdrop,.bp-modal').forEach(e=>e.remove());
  BP_INERT.forEach(e=>{e.inert=false;});BP_INERT=[];
  if(d&&d.onClose)d.onClose();
  if(!restore)return;
  const back=BP_BACK;BP_BACK=null;
  if(boxes.length)focusBack(back);
}
// carte Kronn ouverte dans une fenêtre qu'on ferme : Kronn la laisse à sa dernière place quand son bouton disparaît
// (pas de successeur, rien ne la referme) et la page ne peut pas la fermer elle-même ; mais Kronn referme la carte quand
// on reclique son bouton (même action, mêmes liaisons) : on le reclique avant de retirer la fenêtre, pendant le clic
// de fermeture (l'activation utilisateur vaut encore ; pas avec Échap, qui n'en donne pas)
function closeKronnCardIn(root){
  const slot=root&&root.querySelector('[data-kronn-action-slot]'), host=slot&&slot.closest('[data-kronn-action-slot-host]');
  const btn=host&&host.querySelector('[data-kronn-action]');
  if(btn)btn.click();
}
// retour du focus à la fermeture : l'élément d'avant, sinon la fenêtre encore ouverte dessous (carte Kronn d'un volet),
// sinon le plan
function focusBack(back){
  if(back&&back!==document.body&&back.isConnected&&back.focus){back.focus();if(document.activeElement===back)return;}
  const box=document.querySelector('.bp-modal');
  if(box){const f=bpFocusables(box)[0];if(f){f.focus();return;}}
  const plan=document.getElementById('cv');
  if(plan){if(!plan.hasAttribute('tabindex'))plan.tabIndex=-1;plan.focus();}
}
// fenêtre large (Kanban, calendrier, départs, installation, ⌘K) : sur 1200 px ; WIN_OPEN dit laquelle est ouverte (un
// ticket ou un nom cliqué dedans la referme et ouvre sa fiche dans le panneau ; « ← » la rouvre) ; elle suit les données
let WIN_OPEN=null;
const WIDE={};
function openWide(k,title,fill,o={}){
  WIDE[k]=fill;
  return openDialog({...o,k,title,wide:true,body:el=>{WIN_OPEN=k;el.innerHTML='<div class="bp-wbody"></div>';fill(el.querySelector('.bp-wbody'));}});
}
function wideRefresh(){const box=document.querySelector('.bp-wide');if(box&&WIDE[box.dataset.win])WIDE[box.dataset.win](box.querySelector('.bp-wbody'));}
// Tab et Maj+Tab bouclent dans box (fenêtre ou carte Kronn)
function trapTab(box,e){
  const f=bpFocusables(box);if(!f.length)return;
  const a=f[0], z=f[f.length-1], cur=document.activeElement, inside=box.contains(cur);
  if(e.shiftKey&&(cur===a||!inside)){e.preventDefault();z.focus();}
  else if(!e.shiftKey&&(cur===z||!inside)){e.preventDefault();a.focus();}
}
function dialogKey(e){
  if(KM_OPEN)return; // carte Kronn ouverte (dans une fenêtre ou non) : la sienne d'abord (55-actions.js)
  const box=document.querySelector('.bp-modal');if(!box)return;
  if(e.key==='Escape'){
    if(box.dataset.win==='kanban'&&KB_VOL){kbClose();return;} // 63-kanban.js : le volet d'abord
    closeDialog();return;}
  if(e.key==='Tab')trapTab(box,e);
}
addEventListener('keydown',dialogKey);
// le corps défile seul : un écran de validation qui s'ouvre repart du haut
const dlgTop=box=>{(box.querySelector('.bp-body')||box).scrollTop=0;};
