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
function openBossPages(){
  closeBossPages(); if(!bossPagesOn())return;
  const bd=document.createElement('div');bd.className='bp-backdrop';bd.onclick=closeBossPages;
  const box=document.createElement('div');box.className='bp-modal';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','Mes pages Kronn');
  box.innerHTML=`<div class="bp-head"><h2>Mes pages Kronn</h2><button type="button" class="bp-x" aria-label="Fermer">×</button></div><div class="bp-grid">${bossPagesHtml()}</div>`;
  document.body.append(bd,box);
  box.querySelector('.bp-x').onclick=closeBossPages;
  const first=box.querySelector('.bp-card');if(first)first.focus();
}
function closeBossPages(){document.querySelectorAll('.bp-backdrop,.bp-modal').forEach(e=>e.remove());}
addEventListener('keydown',e=>{if(e.key==='Escape'&&document.querySelector('.bp-modal'))closeBossPages();});
