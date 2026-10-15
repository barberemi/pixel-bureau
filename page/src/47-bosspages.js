// ---------- l'écran du boss : ses autres pages Kronn (dataset bosspages, cron fiche de paie, clé boss_pages) ----------
// Sur le plan, l'écran du bureau du boss montre leurs miniatures à tour de rôle (pas en mode TV : elles sont à lui) ;
// un clic ouvre une fenêtre centrée, une carte par page (miniature, titre, mise à jour) qui ouvre la page dans Kronn.
let BOSS_PAGES=[];
const BOSS_PAGE_MS=4000, BP_IMG={};
const BP_IMG_OK=/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/;
function readBossPages(src){
  try{
    if(!src||!src.datasets)return null;
    let d=src.datasets.bosspages; if(d&&d.current!==undefined)d=d.current;
    if(typeof d==='string')d=JSON.parse(d);
    return d&&Array.isArray(d.pages)?d.pages.filter(p=>p&&typeof p.id==='string'):null;
  }catch(e){return null;}
}
const bossPagesOn=()=>!TV&&BOSS_PAGES.length>0;
// image décodée une fois par page (et de nouveau quand la miniature change)
function bossPageImg(p){
  if(!p.img||!BP_IMG_OK.test(p.img))return null;
  let im=BP_IMG[p.id];
  if(!im||im.src!==p.img){im=new Image();im.src=p.img;BP_IMG[p.id]=im;}
  return im.complete&&im.naturalWidth?im:null;
}
// l'écran du bureau du boss, en pixels du plan (le plan peut déplacer le bureau) ; null sans bureau du boss
function bossScreenRect(){const o=furnAt('boss_desk');return o?{x:21*TS+4+o.dx,y:9*TS-32+o.dy,w:18,h:13}:null;}
// dessin dans l'écran (repère du meuble) : false = rien à montrer, l'écran ordinaire est dessiné
function drawBossPages(x,y,w,h,now){
  if(!bossPagesOn())return false;
  const p=BOSS_PAGES[Math.floor(now/BOSS_PAGE_MS)%BOSS_PAGES.length], im=bossPageImg(p);
  const pulse=.3+.12*Math.sin(now/600); // halo qui respire : l'écran se clique
  R(ctx,x-2,y-2,w+4,h+4,`rgba(255,214,120,${pulse.toFixed(2)})`);
  R(ctx,x,y,w,h,'#1d3550');
  // les pages sont souvent sombres : à 16 px de large, une miniature éclaircie et saturée reste lisible
  if(im){ctx.save();ctx.imageSmoothingEnabled=true;ctx.filter='brightness(1.9) saturate(1.5)';ctx.drawImage(im,x,y,w,h);ctx.restore();}
  return true;
}
const bpAge=a=>a>=864e5?Math.floor(a/864e5)+' j':agoTxt(a); // au-delà d'un jour, en jours
// Kronn ouvre dans l'onglet courant un lien vers sa propre adresse (même chemin + #page/…) ; avec /index.html, le
// chemin diffère : le lien part dans un nouvel onglet, sur le même Kronn
const bpLink=id=>kronnTab()+'#page/'+encodeURIComponent(id);
function bossPagesHtml(){
  const now=Date.now();
  return BOSS_PAGES.map(p=>{
    const age=p.updated?now-ms(p.updated):null;
    const img=p.img&&BP_IMG_OK.test(p.img)?`<img src="${p.img}" alt="">`:'<span class="bp-noimg">Pas d\'aperçu</span>';
    return `<a class="bp-card" href="${esc(bpLink(p.id))}" target="_blank" rel="noopener">${img}`+
      `<b>${esc(p.title||p.id.slice(0,8))}</b><small>${age!=null&&age>=0?'Mise à jour il y a '+esc(bpAge(age)):''}<span aria-hidden="true">↗</span></small></a>`;
  }).join('');
}
// fenêtre modale : le reste de la page est inerte, Tab et Maj+Tab bouclent dans la fenêtre, et à la fermeture le focus
// revient à l'élément qui l'avait ; ouverte d'un clic sur le canvas (non focalisable), il n'y en a pas : le focus revient
// alors au plan (tabindex -1, hors de l'ordre de tabulation), là où était l'écran cliqué, et Tab reprend aux boutons du rejeu
let BP_BACK=null, BP_INERT=[];
const bpFocusables=box=>[...box.querySelectorAll('a[href],button')];
function openBossPages(){
  const back=BP_BACK||document.activeElement; // réouverture : on garde l'élément d'avant la première ouverture
  closeBossPages(false); if(!bossPagesOn())return;
  BP_BACK=back;
  const bd=document.createElement('div');bd.className='bp-backdrop';bd.onclick=()=>closeBossPages();
  const box=document.createElement('div');box.className='bp-modal';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','Mes pages Kronn');
  box.innerHTML=`<div class="bp-head"><h2>Mes pages Kronn</h2><button type="button" class="bp-x" aria-label="Fermer">×</button></div><div class="bp-grid">${bossPagesHtml()}</div>`;
  BP_INERT=[...document.body.children].filter(e=>!e.inert&&e.tagName!=='SCRIPT');
  BP_INERT.forEach(e=>{e.inert=true;});
  document.body.append(bd,box);
  box.querySelector('.bp-x').onclick=()=>closeBossPages();
  const first=box.querySelector('.bp-card')||box.querySelector('.bp-x');if(first)first.focus();
}
function closeBossPages(restore=true){
  const was=!!document.querySelector('.bp-modal');
  document.querySelectorAll('.bp-backdrop,.bp-modal').forEach(e=>e.remove());
  BP_INERT.forEach(e=>{e.inert=false;});BP_INERT=[];
  if(!restore)return;
  const back=BP_BACK;BP_BACK=null;
  if(!was)return;
  if(back&&back!==document.body&&back.isConnected&&back.focus){back.focus();if(document.activeElement===back)return;}
  const plan=document.getElementById('cv');
  if(plan){if(!plan.hasAttribute('tabindex'))plan.tabIndex=-1;plan.focus();}
}
function bossPagesKey(e){
  const box=document.querySelector('.bp-modal');if(!box)return;
  if(e.key==='Escape'){closeBossPages();return;}
  if(e.key!=='Tab')return;
  const f=bpFocusables(box);if(!f.length)return;
  const a=f[0], z=f[f.length-1], cur=document.activeElement, inside=box.contains(cur);
  if(e.shiftKey&&(cur===a||!inside)){e.preventDefault();z.focus();}
  else if(!e.shiftKey&&(cur===z||!inside)){e.preventDefault();a.focus();}
}
addEventListener('keydown',bossPagesKey);
