// ---------- mode TV (écran d'open space) ----------
let TV=false;try{TV=localStorage.getItem('bureau:tv')==='1';}catch(e){}
let NAMES_BEFORE_TV=null, TICK_SIG='';
function setTv(on){
  TV=on;try{localStorage.setItem('bureau:tv',on?'1':'0');}catch(e){}
  document.body.classList.toggle('tv',on);
  if(on){NAMES_BEFORE_TV=NAMES;NAMES='all';if(EDIT)closeEditor();sel=null;renderSide(true);
    try{const el=document.documentElement;if(el.requestFullscreen&&!document.fullscreenElement)el.requestFullscreen().catch(()=>{});}catch(e){}}
  else{if(NAMES_BEFORE_TV)NAMES=NAMES_BEFORE_TV;try{if(document.fullscreenElement)document.exitFullscreen();}catch(e){}}
  updateTv(true);
}
// écran d'open space vu par toute l'équipe : sprint, prod et alertes d'équipe, rien de personnel (validations, tokens)
function tvChips(d){
  const out=[];
  if(d.sprint){const s=d.sprint, pct=s.ptsAll?Math.round(s.ptsDone/s.ptsAll*100):0;
    out.push(`<span class="chip"><b>${pct}%</b>Sprint ${esc(s.name)}${s.j!=null?' · J-'+s.j:''}</span>`);}
  if(d.prod){const p=d.prod, live=p.live[p.live.length-1];
    out.push(`<span class="chip mep"><b>${p.done}</b>MEP${live?' · 🚀 '+esc(live.m.tag)+' '+esc(MEP_TXT[live.phase]):p.last?' · dernière '+esc(p.last.m.tag)+' à '+hm(ms(p.last.m.prod.end)):''}</span>`);
    for(const x of p.failed)out.push(`<span class="chip err"><b>✗</b>${esc(x.m.tag)} en échec</span>`);}
  if(d.prs&&d.prs.stale)out.push(`<span class="chip warn"><b>${d.prs.stale}</b>${d.prs.stale>1?'PR sans review depuis plus de 24 h':'PR sans review depuis plus de 24 h'}</span>`);
  if(d.prs&&d.prs.wait&&!d.prs.stale)out.push(`<span class="chip"><b>${d.prs.wait}</b>${d.prs.wait>1?'PR attendent':'PR attend'} une review</span>`);
  return out.join('');
}
let TVWHO_SIG='';
// la colonne défile toute seule si elle déborde (personne ne touche la TV) : descente lente, pause en bas, retour en haut ;
// une interaction (molette, survol, toucher) suspend le défilement automatique 15 s
const TVSCROLL={hold:0,pause:0,pos:0};
function tvAutoScroll(now,dt){
  const box=document.getElementById('tvwho'); if(!TV||!box)return;
  const max=box.scrollHeight-box.clientHeight; if(max<=4){TVSCROLL.pos=0;return;}
  if(now<TVSCROLL.hold){TVSCROLL.pos=box.scrollTop;return;}
  if(now<TVSCROLL.pause)return;
  if(TVSCROLL.pos>=max){TVSCROLL.pos=0;box.scrollTo({top:0,behavior:'smooth'});TVSCROLL.pause=now+6000;return;}
  TVSCROLL.pos=Math.min(max,TVSCROLL.pos+dt*18); // ~18 px/s
  box.scrollTop=TVSCROLL.pos;
  if(TVSCROLL.pos>=max)TVSCROLL.pause=now+5000;
}
{const box=document.getElementById('tvwho');
  if(box)for(const ev of ['wheel','touchstart','pointerdown','mousemove'])box.addEventListener(ev,()=>{TVSCROLL.hold=performance.now()+15000;},{passive:true});}

function renderTvWho(){
  const box=document.getElementById('tvwho');if(!box)return;
  const cards=whoCards(T,true);
  const html='<h2>Qui fait quoi</h2>'+cards.map(x=>{const img=portraitUrl(x.c);
    return `<div class="tw" style="--st:${ST_CSS[x.st.st]||'var(--idle)'};--tk:${x.tone||'transparent'}"><span class="wp">${img?`<img src="${img}" alt="">`:''}</span>`+
      `<span class="wt"><span class="wn">${esc(x.c.name)}<span class="ws">${esc(shortSt(x.st))}</span></span><span class="ww${x.tone?'':' nt'}">${esc(x.what)}</span>${x.sub?`<span class="wsub">${esc(x.sub)}</span>`:''}</span></div>`;}).join('');
  if(html!==TVWHO_SIG){TVWHO_SIG=html;box.innerHTML=html;}
}
// puce « direct » : anneau du prochain passage du cron live, orange en cas de retard (même calcul que le badge)
function tvLiveChip(){
  if(!LIVE_DATA)return `<span class="chip"><b>●</b>instantané</span>`;
  const v=FRESH_VIEW;
  if(!v)return `<span class="chip ok"><b>●</b>direct</span>`;
  return `<span class="chip ${v.late?'warn':'ok'} tvfresh">${freshRing(v.frac,18)}${esc(v.txt)}</span>`;
}
function updateTv(force){
  if(!TV||!DATA)return;
  const bar=document.getElementById('tvbar');
  bar.innerHTML=`<span class="tvt">LE BUREAU</span><span class="tvc">${hms(T)}</span>${tvLiveChip()}`+
    tvChips(dashData(T))+
    `<span class="sp"></span><span class="tvhint">Échap ou T pour quitter</span><button id="tvexit">Quitter</button>`;
  bar.querySelector('#tvexit').onclick=()=>setTv(false);
  renderTvWho();
  // fil défilant : les derniers événements d'équipe (merges, releases, MEP, daily), sans les runs des agents
  const strip=h=>{const d=document.createElement('div');d.innerHTML=h;return d.textContent.replace(/\s+/g,' ').trim();};
  const items=FEED_EV.filter(e=>e.team).slice(0,8).map(e=>({tm:hm(e.t),tx:strip(e.txt)}));
  const sig=items.map(i=>i.tm+i.tx).join('|');
  if(force||sig!==TICK_SIG){
    TICK_SIG=sig;
    document.getElementById('tvticker').innerHTML=items.length?'<div class="run">'+items.map(i=>`<span><span class="tm">${esc(i.tm)}</span>${esc(i.tx)}</span>`).join('')+'</div>':'';
  }
}
document.getElementById('tvbtn').onclick=()=>setTv(true);
addEventListener('keydown',e=>{
  if(e.target&&/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
  if(e.key==='Escape'&&TV){setTv(false);}
  else if((e.key==='t'||e.key==='T')&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&!EDIT)setTv(!TV);
});

