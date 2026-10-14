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
  const c=hitTest(e),z=c?null:hitZone(e);
  hoverKey=c?c.key:null;
  cv.style.cursor=(c||z)?'pointer':'default';
  if(z&&!c){
    tip.style.display='block';
    tip.style.left=e.clientX+'px';
    tip.style.top=e.clientY+'px';
    tip.textContent=(String(z).startsWith('mail:')?mailTip(z.slice(5)):z==='duck'?'Le canard en plastique : parle-lui de ton problème':z==='bosspages'?'Mes pages Kronn ('+BOSS_PAGES.length+')':z==='tv'&&stageClosed(T)?'Plateau fermé : pas de MEP le vendredi ni le week-end':z==='paie'?'Fiche de paie des agents':z==='tv'?'Mises en prod du jour':z==='kanban'?'Mur Kanban du sprint':z==='planning'?'Planning des crons':z==='calendar'?"Calendrier de l'équipe : qui est là":'Employé du sprint');
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
cv.addEventListener('mouseleave',()=>{tip.style.display='none';hoverKey=null;});
function hitZone(ev){
  const r=cv.getBoundingClientRect(),mx=(ev.clientX-r.left)*W/r.width,my=(ev.clientY-r.top)*H/r.height;
  const inR=o=>mx>=o.x&&mx<=o.x+o.w&&my>=o.y&&my<=o.y+o.h;
  const bs=bossPagesOn()&&bossScreenRect();
  const mb=mailAt(mx,my);
  return mb?'mail:'+mb:duckHit(mx,my)?'duck':bs&&inR(bs)?'bosspages':inR(PAYR)?'paie':inR(TVR)?'tv':inR(KANR)?'kanban':inR(PLANR)?'planning':CALR&&ABSENCES&&inR(CALR)?'calendar':inR(EMPR)&&bestEmployee().length?'emp':null;}
cv.addEventListener('click',e=>{if(TV)return;const c=hitTest(e);if(c){select(c.key);return;}const z=hitZone(e);if(z==='bosspages')openBossPages();else select(z);});
const slider=document.getElementById('slider'), playBtn=document.getElementById('play'), liveBtn=document.getElementById('live'), speedSel=document.getElementById('speed');
function setMode(m){
  mode=m;
  liveBtn.classList.toggle('on',m==='live');liveBtn.setAttribute('aria-pressed',String(m==='live'));
  playBtn.classList.toggle('on',m==='play');playBtn.setAttribute('aria-pressed',String(m==='play'));
  playBtn.textContent=m==='play'?'❚❚ Pause':'▶ Rejouer';
  updateBadge();
}
liveBtn.onclick=()=>{setMode('live');needTeleport=true;};
playBtn.onclick=()=>{if(mode==='play'){setMode('pause');return;}if(mode==='live'||T>=REND-1000){T=RSTART;needTeleport=true;}setMode('play');};
slider.addEventListener('input',()=>{setMode('pause');T=RSTART+(REND-RSTART)*slider.value/1000;needTeleport=true;});

