// ---------- interactions ----------
function hitTest(ev){
  const r=cv.getBoundingClientRect(), sx=W/r.width, mx=(ev.clientX-r.left)*sx, my=(ev.clientY-r.top)*(H/r.height);
  let best=null,bd=1e9;
  for(const c of chars){if(!c.present||!c.pos)continue;const dx=mx-c.pos.x, dy=my-(c.pos.y-24);
    if(Math.abs(dx)<16&&Math.abs(dy)<30){const d=dx*dx+dy*dy;if(d<bd){bd=d;best=c;}}}
  return best;
}
const tip=document.getElementById('tip');
cv.addEventListener('mousemove',e=>{
  const c=hitTest(e),z=c?null:hitZone(e), wc=z==='bosspages'&&wallCellAt(e), wa=wc&&wallAgent(wc.id);
  hoverKey=c?c.key:wa?wa.key:null;WALL_HOVER=!!wa; // une miniature de l'écran : son agent ressort sur le plan (32-familles.js)
  RACK_HOVER=z==='newagent'; // 66-newagent.js : le « + » de la baie s'allume
  cv.style.cursor=(c||z)?'pointer':'default';
  if(z&&!c){
    tip.style.display='block';
    tip.style.left=e.clientX+'px';
    tip.style.top=e.clientY+'px';
    tip.textContent=(String(z).startsWith('mail:')?mailTip(z.slice(5)):z==='duck'?'Le canard en plastique : parle-lui de ton problème':z==='support'?supportTip():z==='todo'?todoTip():z==='bosspages'?(wc?pageName((shownPages().find(p=>p.id===wc.id)||{}).title)+(wa?' · remplie par '+wa.name+(cronTag(wa)?' · '+cronTag(wa):''):'')+' · ':'')+'Mes pages Kronn ('+shownPages().length+')':z==='newagent'?'Ajouter un agent':z==='tv'&&stageClosed(T)?'Plateau fermé : pas de MEP le vendredi ni le week-end':z==='paie'?'Fiche de paie des agents':z==='tv'?'Mises en prod du jour':z==='kanban'?'Mur Kanban du sprint':z==='planning'?cronNotesTip():z==='calendar'?"Calendrier de l'équipe : qui est là":z==='departs'?'Tableau des départs : DEV, STG et PRD de chaque projet':'Employé du sprint')+(WIN_ZONES.has(z)?' ↗ s\'ouvre en fenêtre':'');
    return;
  }
  const p=c?null:pileAt(e);
  if(c||p){
    tip.style.display='block';
    tip.style.left=e.clientX+'px';
    tip.style.top=e.clientY+'px';
    tip.textContent=c?c.name+' · '+(c._st?c._st.label:''):pileTip(p);
  }else tip.style.display='none';
  });
// la case de l'écran mural sous la souris (WALL_CELLS, 47-bosspages.js), et l'agent de sa page
function wallCellAt(ev){
  const r=cv.getBoundingClientRect(),mx=(ev.clientX-r.left)*W/r.width,my=(ev.clientY-r.top)*H/r.height;
  return WALL_CELLS.find(h=>mx>=h.x-1&&mx<=h.x+h.w+1&&my>=h.y-2&&my<=h.y+h.h+2)||null;
}
const wallAgent=id=>chars.find(c=>famKind(c)==='page'&&(agentPage(c)||{}).id===id)||null;
// piles posées sur les bureaux (40-furniture.js) : ce qu'elles comptent
function pileAt(ev){
  const r=cv.getBoundingClientRect(),mx=(ev.clientX-r.left)*W/r.width,my=(ev.clientY-r.top)*H/r.height;
  return PILE_HITS.find(h=>mx>=h.x&&mx<=h.x+h.w&&my>=h.y&&my<=h.y+h.h)||null;
}
function pileTip(h){
  const keys=l=>l.slice(0,6).map(x=>x.key).join(', ')+(l.length>6?'…':'');
  if(h.kind==='doc')return h.o.name+' : '+plural(h.list.length,'ticket créé','tickets créés')+" par l'équipe depuis le daily · "+keys(h.list);
  if(h.kind==='folder')return h.o.name+' : '+plural(h.list.length,'ticket','tickets')+' à tester · '+keys(h.list);
  const open=(h.o.team&&h.o.team.tickets||[]).filter(x=>x.cat!=='done'), by={};
  for(const x of open)by[x.cat]=(by[x.cat]||0)+1;
  return h.o.name+' : '+plural(open.length,'ticket ouvert','tickets ouverts')+' · '+TORDER.filter(k=>by[k]).map(k=>by[k]+' '+TCAT[k].t.toLowerCase()).join(', ')+(open.length>5?' (5 sur la pile)':'');
}
cv.addEventListener('mouseleave',()=>{tip.style.display='none';hoverKey=null;WALL_HOVER=false;RACK_HOVER=false;});
function hitZone(ev){
  const r=cv.getBoundingClientRect(),mx=(ev.clientX-r.left)*W/r.width,my=(ev.clientY-r.top)*H/r.height;
  const inR=o=>mx>=o.x&&mx<=o.x+o.w&&my>=o.y&&my<=o.y+o.h;
  const bs=bossPagesOn()&&wallRect(), na=newAgentOn()&&newAgentRack();
  const mb=mailAt(mx,my);
  return mb?'mail:'+mb:duckHit(mx,my)?'duck':supportOpenable()&&inR(supportRect())?'support':bs&&inR(bs)?'bosspages':na&&inR(na)?'newagent':inR(PAYR)?'paie':inR(TVR)?'tv':inR(KANR)?'kanban':(()=>{const r=cronNoteRect();return r&&inR(r);})()?'planning':todosOn()&&inR(todoRect())?'todo':CALR&&ABSENCES&&inR(CALR)?'calendar':DEPR&&inR(DEPR)?'departs':inR(EMPR)&&bestEmployee().length?'emp':null;}
// zones du plan qui ouvrent une fenêtre (le reste ouvre le panneau) : l'infobulle le dit
const WIN_ZONES=new Set(['bosspages','todo','newagent','kanban','calendar','departs']);
cv.addEventListener('click',e=>{if(TV)return;const c=hitTest(e);if(c){select(c.key);return;}const z=hitZone(e);if(z==='bosspages')openBossPages();else if(z==='departs')openDeparts();else if(z==='todo')openTodos();else if(z==='support')openSupport();else if(z==='newagent')openNewAgent();else select(z);});
const slider=document.getElementById('slider'), playBtn=document.getElementById('play'), liveBtn=document.getElementById('live'), speedBtn=document.getElementById('speed');
const tgo=document.getElementById('tgo'), tbub=document.getElementById('tbub');
// vitesse du replay : un bouton qui passe à la suivante à chaque clic
const SPEEDS=[1,2,10,60,480];
let SPEED=480;
function setSpeed(v){SPEED=v;speedBtn.textContent='⏩ ×'+v;speedBtn.setAttribute('aria-label','Vitesse du replay : ×'+v+', clic pour la suivante');}
speedBtn.onclick=()=>setSpeed(SPEEDS[(SPEEDS.indexOf(SPEED)+1)%SPEEDS.length]);
setSpeed(SPEED);
// heure affichée dans la barre : le champ (tant qu'on n'y tape pas) et la bulle au-dessus du curseur
function timeUi(){
  if(!RSTART)return;
  const f=Math.max(0,Math.min(1,(T-RSTART)/Math.max(1,REND-RSTART)));
  tbub.textContent=hm(T);tbub.style.left=(f*100)+'%';
  if(document.activeElement!==tgo)tgo.value=hm(T);
  timeHours();
}
// repères d'heures sous la frise, toutes les 3 h (et les heures rondes quand la journée est courte)
function timeHours(){
  const box=document.getElementById('thours'); if(!box||!RSTART)return;
  const span=Math.max(1,REND-RSTART), step=span>9*3600e3?3:1, out=[];
  for(let t=parisMidnight(RSTART);t<=REND;t+=step*3600e3)if(t>=RSTART){const f=(t-RSTART)/span*100;
    out.push(`<span style="left:${f}%${f<3?';transform:none':''}">${String(parisHM(t).h).padStart(2,'0')}h</span>`);}
  const html=out.join(''); if(box.innerHTML!==html)box.innerHTML=html; // le direct avance : refait seulement quand ça change
}
// aller à une heure du jour affiché (« 14:36 », « 14h36 », « 9 ») ; refusée hors de la journée rejouable
function parseHm(s){const m=String(s).trim().match(/^(\d{1,2})(?:[:h.](\d{1,2})?)?$/);if(!m)return null;const h=+m[1],mi=+(m[2]||0);return h<24&&mi<60?h*60+mi:null;}
function goToTime(s){
  const m=parseHm(s); if(m==null)return false;
  const t=parisMidnight(RSTART)+m*60e3; if(t<RSTART-60e3||t>REND)return false;
  setMode('pause');T=Math.max(RSTART,Math.min(REND,t));needTeleport=true;timeUi();
  slider.value=Math.round((T-RSTART)/Math.max(1,REND-RSTART)*1000);
  return true;
}
tgo.addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.preventDefault();const ok=goToTime(tgo.value);tgo.setAttribute('aria-invalid',String(!ok));if(ok)tgo.blur();}
  else if(e.key==='Escape'){tgo.value=hm(T);tgo.blur();}
});
tgo.addEventListener('focus',()=>tgo.select());
tgo.addEventListener('blur',()=>{tgo.removeAttribute('aria-invalid');tgo.value=hm(T);});
// « ⏵ revoir » (fil de la journée) : 20 s avant le moment, lu en ×1, pour voir la scène se jouer (soucoupe, Gandalf…)
function replayAt(t){
  T=Math.max(RSTART,Math.min(REND,t-20e3));needTeleport=true;setSpeed(1);setMode('play');timeUi();
}
function setMode(m){
  mode=m;
  liveBtn.classList.toggle('on',m==='live');liveBtn.setAttribute('aria-pressed',String(m==='live'));
  playBtn.classList.toggle('on',m==='play');playBtn.setAttribute('aria-pressed',String(m==='play'));
  playBtn.textContent=m==='play'?'❚❚ Pause':'▶ Rejouer';
  updateBadge();
}
liveBtn.onclick=()=>{setMode('live');needTeleport=true;};
playBtn.onclick=()=>{if(mode==='play'){setMode('pause');return;}if(mode==='live'||T>=REND-1000){T=RSTART;needTeleport=true;}setMode('play');};
slider.addEventListener('input',()=>{setMode('pause');T=RSTART+(REND-RSTART)*slider.value/1000;needTeleport=true;timeUi();});

