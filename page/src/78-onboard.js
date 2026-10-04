// ---------- accueil : visite guidée en 3 bulles (plan, « À traiter », barre de lecture) ----------
// Lancée d'office au premier passage quand le navigateur peut s'en souvenir ; dans Kronn la page n'a pas de
// stockage (sandbox sans allow-same-origin) : elle ne s'ouvre alors que par le bouton « ? Visite ».
const TOUR=[
  {at:'#cv',title:'Le plan',txt:"Chaque personnage est un collègue (en couleur) ou un agent Kronn (hologramme bleu). Clique sur l'un d'eux pour voir sa journée."},
  {at:'#todo',alt:'#kpis',title:'À traiter',txt:"Ce qui t'attend : pannes, validations à donner, PR à relire, tickets bloqués. Chaque ligne a son bouton."},
  {at:'.bar',title:'Rejouer la journée',txt:'Fais glisser l\'heure ou lance « Rejouer » pour revoir la journée en accéléré. « Mode TV » : l\'écran de l\'open space et du daily.'},
];
let TOUR_I=-1;
function tourTarget(s){
  const el=document.querySelector(s.at);
  return el&&el.offsetParent!==null&&el.getBoundingClientRect().height>0?el:document.querySelector(s.alt||s.at);
}
function tourShow(i){
  let box=document.getElementById('tour');
  if(i<0||i>=TOUR.length){if(box)box.remove();document.querySelectorAll('.tour-on').forEach(e=>e.classList.remove('tour-on'));TOUR_I=-1;return;}
  TOUR_I=i;
  const s=TOUR[i], el=tourTarget(s); if(!el){tourShow(i+1);return;}
  document.querySelectorAll('.tour-on').forEach(e=>e.classList.remove('tour-on'));
  el.classList.add('tour-on');
  el.scrollIntoView({block:'center',behavior:'instant'});
  if(!box){box=document.createElement('div');box.id='tour';box.setAttribute('role','dialog');box.setAttribute('aria-live','polite');document.body.appendChild(box);}
  box.innerHTML=`<b>${esc(s.title)}</b> <span class="tn">${i+1}/${TOUR.length}</span><p>${esc(s.txt)}</p>`+
    `<div class="ta"><button data-tour="skip">Passer</button><button class="on" data-tour="next">${i===TOUR.length-1?'Terminé':'Suivant'}</button></div>`;
  // en coordonnées de la page : la bulle suit sa cible quand on fait défiler
  const r=el.getBoundingClientRect(), bw=Math.min(320,innerWidth-24), below=r.bottom+box.offsetHeight+16<innerHeight;
  box.style.width=bw+'px';
  box.style.left=scrollX+Math.max(12,Math.min(innerWidth-bw-12,r.left+r.width/2-bw/2))+'px';
  box.style.top=scrollY+(below?Math.min(r.bottom+10,innerHeight-box.offsetHeight-12):Math.max(12,r.top-box.offsetHeight-10))+'px';
  box.querySelector('[data-tour=next]').focus();
}
function tourDone(){tourShow(-1);try{localStorage.setItem('bureau:tour','1');}catch(e){}}
document.addEventListener('click',e=>{const b=e.target.closest('[data-tour]');if(!b)return;if(b.dataset.tour==='next'&&TOUR_I<TOUR.length-1)tourShow(TOUR_I+1);else tourDone();});
addEventListener('keydown',e=>{if(TOUR_I>=0&&e.key==='Escape')tourDone();});
document.getElementById('tourbtn').addEventListener('click',()=>tourShow(0));
// premier passage : seulement si le navigateur sait s'en souvenir (sinon elle reviendrait à chaque chargement)
function tourAuto(){
  if(TV)return;
  try{if(localStorage.getItem('bureau:tour'))return;localStorage.setItem('bureau:tour-test','1');localStorage.removeItem('bureau:tour-test');}catch(e){return;}
  setTimeout(()=>tourShow(0),800);
}
