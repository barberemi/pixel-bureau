// ---------- « Comment lire le plan », à l'étage affiché ----------
// Sous le plan, la légende de l'étage ; dans « Comment lire le plan », un onglet à la fois : au RDC les blocs du gabarit (Qui,
// Où, États, Enveloppes), aux étages Qui, Où, Postes et Moments (AT_HELP, RD_HELP, RT_HELP, CS_HELP, écrits à côté du dessin
// de chaque étage) ; partout, 🎬 Scènes en dernier (la galerie, 46-gallery.js). L'onglet Postes se tire de la liste des
// postes de l'étage, celle que le dessin utilise : un poste ajouté ou renommé y paraît avec sa phrase (d).
const LEG_RDC_TABS=[['qui','Qui'],['ou','Où'],['etats','États'],['env','Enveloppes'],['scenes','🎬 Scènes']];
const LEG_FLOOR_TABS=[['qui','Qui'],['ou','Où'],['postes','Postes'],['moments','Moments'],['scenes','🎬 Scènes']];
const LEG_NAME={1:'1er · atelier',2:'2e · rédaction et revue',3:'3e · retours de PR','-1':'-1 · caserne Support'};
let LEG_TAB='qui';
// des pastilles de couleur, une par libellé : m = {clé: [couleur, libellé]} (AT_ST, RD_TK…)
const legSwatches=m=>{const seen=new Set();return Object.values(m).filter(([,t])=>!seen.has(t)&&seen.add(t)).map(([c,t])=>`<span class="lk"><i class="sq" style="background:${c}"></i>${esc(t)}</span>`).join('');};
// groups : [[titre, postes]] ; un poste = {i, n, d}
const legPostes=groups=>groups.map(([h,l])=>(h?`<h5>${esc(h)}</h5>`:'')+l.map(p=>`<p><b>${p.i} ${esc(p.n)}</b> : ${esc(p.d||'')}</p>`).join('')).join('');
const floorHelp=f=>f===1?AT_HELP:f===2?RD_HELP:f===3?RT_HELP:f===-1?CS_HELP:null;
// le contenu d'un onglet d'étage (null au RDC : ses blocs sont dans le gabarit)
function legPane(f,tab){const h=floorHelp(f);if(!h)return null;return tab==='postes'?legPostes(h.postes()):h[tab]||'';}
function renderLegend(){
  const det=document.querySelector('.legend-help'), bar=document.querySelector('.stage .legend');if(!det||!bar)return;
  const grid=det.querySelector('.lh-grid:not(.lh-floor)'), sum=det.querySelector('summary');if(!grid||!sum)return;
  const h=floorHelp(FLOOR), tabs=h?LEG_FLOOR_TABS:LEG_RDC_TABS;
  if(!tabs.some(t=>t[0]===LEG_TAB))LEG_TAB='qui';
  let fb=document.getElementById('legfloor');
  if(!fb){fb=document.createElement('div');fb.id='legfloor';fb.className='legend';bar.parentElement.insertBefore(fb,bar.nextSibling);}
  bar.hidden=!!h;fb.hidden=!h;
  if(h&&fb.dataset.f!==String(FLOOR)){fb.innerHTML=h.bar();fb.dataset.f=String(FLOOR);paintLegend(fb);}
  let tb=det.querySelector('.lh-tabs');
  if(!tb){tb=document.createElement('div');tb.className='lh-tabs';tb.setAttribute('role','tablist');det.insertBefore(tb,sum.nextSibling);
    tb.addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b){LEG_TAB=b.dataset.tab;renderLegend();}});}
  tb.innerHTML=tabs.map(([k,n])=>`<button type="button" role="tab" data-tab="${k}" aria-selected="${k===LEG_TAB}"${k===LEG_TAB?' class="on"':''}>${n}</button>`).join('');
  let fp=det.querySelector('.lh-floor');
  if(!fp){fp=document.createElement('div');fp.className='lh-grid lh-floor';det.insertBefore(fp,grid);}
  const sc=LEG_TAB==='scenes';
  grid.hidden=!!h||sc;fp.hidden=!h||sc;
  if(!h)for(const d of grid.children)d.hidden=d.dataset.tab!==LEG_TAB;
  else if(!sc){fp.innerHTML=legPane(FLOOR,LEG_TAB);paintLegend(fp);}
  sum.textContent='? Comment lire le plan'+(h?' · '+LEG_NAME[FLOOR]:'');
  const g=document.getElementById('gallery');if(g){g.hidden=!sc;if(sc&&det.open)renderGallery();}
}
{const det=document.querySelector('.legend-help');if(det&&det.addEventListener)det.addEventListener('toggle',()=>{if(det.open)renderLegend();});}
