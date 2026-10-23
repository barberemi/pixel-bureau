// ---------- Mur Kanban : la fenêtre des tickets du sprint ----------
// Une fenêtre large (openWide, 47-bosspages.js). En haut, une barre de personnes (portrait, prénom, nombre de tickets)
// filtre les colonnes sur les tickets d'un personnage (ceux de sa fiche, rôle compris : la testeuse voit ce qui est en
// test) ; six colonnes, une carte par ticket (clé, composant, titre, points, personne), 7 par colonne, « + N autres ».
// KB_WHO : clé du personnage filtré ('' : tout le sprint, '-' : les non assignés).
const KB_MAX=7, KB_ALL={};
let KB_WHO='';
const kbPeople=()=>chars.filter(c=>c.person&&c.team&&c.team.tickets.length);
function kbTitle(){
  const c=byKey[KB_WHO];
  return 'Mur Kanban'+(c?' · '+c.name:KB_WHO==='-'?' · non assignés':TEAM&&TEAM.sprint&&TEAM.sprint.name?' · sprint '+TEAM.sprint.name:'');
}
// o : {who} ; true garde le filtre d'avant (retour par l'historique du panneau) ; sans rien, tout le sprint
function openKanban(o){if(o!==true){o=o||{};KB_WHO=o.who||'';}openWide('kanban',kbTitle(),kanbanFill);}
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
  if(KB_WHO&&KB_WHO!=='-'&&!byKey[KB_WHO])KB_WHO='';
  const h=box.closest('.bp-modal')&&box.closest('.bp-modal').querySelector('.bp-head h2');if(h)h.textContent=kbTitle();
  box.innerHTML=kbBar()+'<div class="kbw">'+kbCols().map(({k,list})=>{
    const pts=list.reduce((a,x)=>a+(+x.points||0),0), n=KB_ALL[k]?list.length:KB_MAX;
    return `<section class="kbw-col" aria-label="${esc(TCAT[k].t)}"><h3><span class="dot" style="background:${TCAT[k].c}"></span>${esc(TCAT[k].t)}<small>${list.length}${pts?' · '+Math.round(pts)+' pts':''}</small></h3>`+
      list.slice(0,n).map(x=>{const t=tkComp(x.summary);
        return `<a href="#" class="kbw-c" data-tk="${esc(x.key)}" style="--c:${TCAT[k].c}" title="Ouvrir sa fiche et ses actions"><b>${esc(x.key)}</b>${x.points?`<em>${esc(x.points)} pts</em>`:''}`+
          `<span class="kbw-t">${t.comp?`<span class="kbw-cp">${esc(t.comp)}</span>`:''}${esc(t.title)}</span><small>${esc(x.owner?String(x.owner).split(' ')[0]:'non assigné')}</small></a>`;}).join('')+
      (list.length>n?`<button type="button" class="kbw-more" data-col="${k}">+ ${list.length-n} autre${list.length-n>1?'s':''}</button>`:'')+
      (list.length?'':'<span class="kbw-none">—</span>')+'</section>';
  }).join('')+'</div><p class="hint">Un portrait filtre les colonnes sur ses tickets, « Tous » revient au sprint entier. Un ticket ouvre sa fiche dans le panneau de droite ; « ← Mur Kanban » rouvre cette fenêtre.</p>';
  for(const e of box.querySelectorAll('[data-pt]'))e.appendChild(portrait(byKey[e.dataset.pt],24));
  for(const b of box.querySelectorAll('.kbp-b'))b.onclick=()=>{KB_WHO=b.dataset.who;kanbanFill(box);};
  for(const b of box.querySelectorAll('.kbw-more'))b.onclick=()=>{KB_ALL[b.dataset.col]=true;kanbanFill(box);};
}
