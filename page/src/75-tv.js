// ---------- mode TV (écran d'open space) ----------
let TV=false;try{TV=localStorage.getItem('bureau:tv')==='1';}catch(e){}
let NAMES_BEFORE_TV=null, TICK_SIG='';
function setTv(on,remember=true){
  TV=on;if(remember)try{localStorage.setItem('bureau:tv',on?'1':'0');}catch(e){}
  document.body.classList.toggle('tv',on);
  if(on){NAMES_BEFORE_TV=NAMES;NAMES='all';if(EDIT)closeEditor();sel=null;renderSide(true);
    try{const el=document.documentElement;if(el.requestFullscreen&&!document.fullscreenElement)el.requestFullscreen().catch(()=>{});}catch(e){}}
  else{if(NAMES_BEFORE_TV)NAMES=NAMES_BEFORE_TV;try{if(document.fullscreenElement)document.exitFullscreen();}catch(e){}}
  updateTv(true);
}
// paramètres d'affichage de l'adresse Kronn (#page/<id>?tv=1&scene=standup, reçus dans KronnPageData.page.params) :
// appliqués une seule fois, au premier envoi qui en contient, sans toucher au réglage mémorisé ; tv=0 force le plan
let VIEW_PARAMS_DONE=false;
function viewParams(src){const p=src&&src.page&&src.page.params;return p&&typeof p==='object'?p:null;}
function applyViewParams(src){
  const p=viewParams(src); if(VIEW_PARAMS_DONE||!p)return; VIEW_PARAMS_DONE=true;
  if(p.tv==='1'&&!TV)setTv(true,false); else if(p.tv==='0'&&TV)setTv(false,false);
  if(p.scene==='standup'&&TV){TVSCENE.manual=true;TVSCENE.idx=0;TVSCENE.since=0;updateTv(true);}
  if(p.loupe==='0')setLoupe(false,false); // écran mural sans loupe
  if(p.skin&&UI_SKINS[p.skin])applySkin(p.skin); // écran mural : thème choisi par l'adresse (pas de bouton 🎨 en mode TV), non mémorisé
}
let TVWHO_SIG='';
// la colonne défile toute seule si elle déborde (personne ne touche la TV) : descente lente, pause en bas, retour en haut ;
// une interaction (molette, survol, toucher) suspend le défilement automatique 15 s
const TVSCROLL={hold:0,pause:0,pos:0}, SCSCROLL={hold:0,pause:0,pos:0,el:null};
function softScroll(box,S,now,dt){
  const max=box.scrollHeight-box.clientHeight; if(max<=4){S.pos=0;return;}
  if(now<S.hold){S.pos=box.scrollTop;return;}
  if(now<S.pause)return;
  if(S.pos>=max){S.pos=0;box.scrollTo({top:0,behavior:SCROLL_BEHAVIOR});S.pause=now+6000;return;}
  S.pos=Math.min(max,S.pos+dt*18); // ~18 px/s
  box.scrollTop=S.pos;
  if(S.pos>=max)S.pause=now+5000;
}
function tvAutoScroll(now,dt){
  if(!TV)return;
  const box=document.getElementById('tvwho'); if(box)softScroll(box,TVSCROLL,now,dt);
  const body=document.querySelector('#tvscene .sc-body');
  if(body&&document.body.classList.contains('tvscene')){
    if(SCSCROLL.el!==body){SCSCROLL.el=body;SCSCROLL.pos=0;SCSCROLL.pause=now+4000;} // nouvelle scène : on lit d'abord le haut
    softScroll(body,SCSCROLL,now,dt);
  }
}
{const box=document.getElementById('tvwho');
  if(box)for(const ev of ['wheel','touchstart','pointerdown','mousemove'])box.addEventListener(ev,()=>{TVSCROLL.hold=performance.now()+15000;},{passive:true});}

// « Qui fait quoi » de l'écran mural : l'équipe (rien de personnel : la carte du boss sans ses validations), puis les agents
// actifs ou en panne, nommés par leur métier comme sur le plan ; même carte que la page (titre sur 2 lignes, depuis quand)
function tvWhoCard(x,name){
  const img=portraitUrl(x.c), tip=[x.what,x.sub,x.tip].filter(Boolean).join('\n');
  return `<div class="tw${x.c.person?'':' ag'}" title="${esc(tip)}" style="--st:${ST_CSS[x.st.st]||'var(--idle)'};--tk:${x.tone||'transparent'}"><span class="wp">${img?`<img src="${img}" alt="">`:''}</span>`+
    `<span class="wt"><span class="wn">${esc(name)}<span class="ws">${esc(shortSt(x.st))}${x.since?' · '+esc(x.since):''}</span></span><span class="ww${x.tone?'':' nt'}">${esc(x.what)}</span>${x.sub?`<span class="wsub">${esc(x.sub)}</span>`:''}</span></div>`;
}
function renderTvWho(){
  const box=document.getElementById('tvwho');if(!box)return;
  const team=whoCards(T,true), agents=whoCards(T).filter(x=>!x.c.person&&!x.c.visitor&&!x.c.guest);
  const html='<h2>Qui fait quoi</h2>'+team.map(x=>tvWhoCard(x,x.c.name)).join('')+
    (agents.length?`<h2>Les agents</h2>`+agents.map(x=>tvWhoCard(x,labelText(x.c))).join(''):'');
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
  // titre, horloge, fraîcheur des données, boutons : sprint, MEP, PR et pannes sont dans les cartes du bas (tvKpis)
  bar.innerHTML=`<span class="tvt">LE BUREAU</span><span class="tvc">${hms(T)}</span><span class="tvchips">${tvLiveChip()}`+
    `</span><span class="tvhint">S stand-up · P planning · R rétro · Échap ou T pour quitter</span>`+
    [['daily','tvstand','Stand-up'],['planning','tvplan','Planning'],['retro','tvretro','Rétro']].map(([k,id,l])=>
      `<button id="${id}" class="${sceneMode(T)===k?'on':''}">${sceneMode(T)===k?'Retour au plan':l}</button>`).join('')+`<button id="tvexit">Quitter</button>`;
  bar.querySelector('#tvexit').onclick=()=>setTv(false);
  bar.querySelector('#tvstand').onclick=()=>toggleScenes('daily');
  bar.querySelector('#tvplan').onclick=()=>toggleScenes('planning');
  bar.querySelector('#tvretro').onclick=()=>toggleScenes('retro');
  renderTvScenes(performance.now());
  renderTvWho();
  // fil défilant : les derniers événements d'équipe (merges, releases, MEP, daily), sans les runs des agents
  const strip=h=>{const d=document.createElement('div');d.innerHTML=h;return d.textContent.replace(/\s+/g,' ').trim();};
  const items=FEED_EV.filter(e=>e.team).slice(0,8).map(e=>({tm:hm(e.t),tx:strip(e.txt)}));
  const sig=items.map(i=>i.tm+i.tx).join('|');
  if(force||sig!==TICK_SIG){
    TICK_SIG=sig;
    document.getElementById('tvticker').innerHTML=items.length?'<div class="run">'+items.map(i=>`<span><span class="tm">${esc(i.tm)}</span>${esc(i.tx)}</span>`).join('')+'</div>':
      `<div class="calm">Pas encore d'événement d'équipe aujourd'hui (merges, releases, MEP, tickets, reviews)</div>`; // un bandeau vide ressemble à un bug
  }
}
document.getElementById('tvbtn').onclick=()=>setTv(true);
addEventListener('keydown',e=>{
  if(e.target&&/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
  if(e.key==='Escape'&&TV){setTv(false);}
  else if((e.key==='t'||e.key==='T')&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&!EDIT)setTv(!TV);
});

