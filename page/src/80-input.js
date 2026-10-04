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
    tip.textContent=(z==='tv'&&stageClosed(T)?'Plateau fermé : pas de MEP le vendredi ni le week-end':z==='paie'?'Fiche de paie des agents':z==='tv'?'Mises en prod du jour':z==='kanban'?'Mur Kanban du sprint':z==='planning'?'Planning des crons':'Employé du sprint');
    return;
  }
  if(c){
    tip.style.display='block';
    tip.style.left=e.clientX+'px';
    tip.style.top=e.clientY+'px';
    tip.textContent=c.name+' · '+(c._st?c._st.label:'');
  }else tip.style.display='none';
  });
cv.addEventListener('mouseleave',()=>{tip.style.display='none';hoverKey=null;});
function hitZone(ev){
  const r=cv.getBoundingClientRect(),mx=(ev.clientX-r.left)*W/r.width,my=(ev.clientY-r.top)*H/r.height;
  const inR=o=>mx>=o.x&&mx<=o.x+o.w&&my>=o.y&&my<=o.y+o.h;
  return inR(PAYR)?'paie':inR(TVR)?'tv':inR(KANR)?'kanban':inR(PLANR)?'planning':inR(EMPR)&&bestEmployee().length?'emp':null;}
cv.addEventListener('click',e=>{if(TV)return;const c=hitTest(e);if(c){select(c.key);return;}select(hitZone(e));});
const slider=document.getElementById('slider'), playBtn=document.getElementById('play'), liveBtn=document.getElementById('live'), speedSel=document.getElementById('speed');
function setMode(m){
  mode=m;
  liveBtn.classList.toggle('on',m==='live');
  playBtn.classList.toggle('on',m==='play');
  playBtn.textContent=m==='play'?'❚❚ Pause':'▶ Rejouer';
}
liveBtn.onclick=()=>{setMode('live');needTeleport=true;};
playBtn.onclick=()=>{if(mode==='play'){setMode('pause');return;}if(mode==='live'||T>=REND-1000){T=RSTART;needTeleport=true;}setMode('play');};
slider.addEventListener('input',()=>{setMode('pause');T=RSTART+(REND-RSTART)*slider.value/1000;needTeleport=true;});

