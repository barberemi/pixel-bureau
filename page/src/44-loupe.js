// ---------- loupe : un médaillon agrandi sur le plan quand un événement fort commence ----------
// Réouverture (le héraut convoque l'assigné), mise en prod réussie (le sage félicite), invité qui arrive, fête de MEP,
// pouce du testeur, daily, sprint planning, rétro, lancement et pizza du sprint. Le plan reste entier : un cadre entoure la
// scène ; une fenêtre flottante l'agrandit, en bas à gauche de l'écran (à droite si elle couvrirait la scène), avec un liseré
// de la couleur de l'événement et sa légende (clic : la fiche, ✕ : fermer). Un événement à la fois, une fois les personnages arrivés, LOUPE_MS ;
// en rejeu accéléré la lecture se met en pause le temps de la loupe ; rien quand on fait glisser l'heure ou qu'on survole le
// plan. Bouton « 🔍 Loupe » de la barre (retenu dans le navigateur), ?loupe=0 dans l'adresse de l'écran mural.
const LOUPE_MS=20e3, LOUPE_WAIT_MAX=40e3, LOUPE_HOVER_MS=5e3;
const LOUPE_KINDS={reopen:['⛔','#b3122e'],proud:['🎉','#0172f0'],party:['🎉','#0172f0'],thumbs:['👍','#2e9e5b'],guest:['👋','#2e9e5b'],
  daily:['☀️','#2e9e9b'],planning:['🗓','#2e9e9b'],retro:['🔄','#c25a9e'],kickoff:['🏁','#2e9e9b'],pizza:['🍕','#2e9e9b'],duck:['🦆','#c47f00'],hatch:['🐣','#c47f00'],trophy:['🏆','#c47f00']};
const LOUPE_ORDER=['reopen','proud','guest','thumbs','kickoff','planning','retro','daily','pizza','party','trophy','hatch','duck'];
// cérémonies : toute l'équipe est dans la scène, la légende la nomme au lieu d'énumérer tout le monde
const LOUPE_CEREMONY={daily:"Daily de l'équipe",planning:'Sprint planning',retro:'Rétrospective',kickoff:'Lancement du sprint',pizza:'Pizza de fin de sprint'};
let LOUPE_ON=!REDUCED_MOTION;try{const v=localStorage.getItem('bureau:loupe');if(v!==null)LOUPE_ON=v!=='0';}catch(e){} // un choix du bouton passe avant le réglage système
const LOUPE={seen:null,queue:[],cur:null,resume:false,hoverUntil:0,lastScan:0};
// le type d'événement que vit ce personnage (null : rien à montrer) ; un invité qui n'est pas en scène de héraut = une visite
function loupeKind(c){
  const st=c._st&&c._st.st;
  if(st&&st!=='guest'&&LOUPE_KINDS[st])return st;
  return c.guest&&!c.on&&c.present!==false?'guest':null; // les hérauts (on : reopen, prod) n'ont que leur scène
}
// événements qui commencent depuis le dernier passage ; le premier passage ne fait que noter ce qui est déjà en cours
function loupeScan(){
  const groups={}, now=new Set(), fresh=[];
  for(const c of chars){
    const k=loupeKind(c); if(!k||c.present===false||!c.pos)continue;
    const id=k==='guest'?'guest:'+c.key:k;(groups[id]=groups[id]||[]).push(c);
  }
  for(const id in groups){now.add(id);if(LOUPE.seen&&!LOUPE.seen.has(id))fresh.push({id,kind:id.split(':')[0],cs:groups[id]});}
  for(const ev of duckLoupeEvents(T)){now.add(ev.id);if(LOUPE.seen&&!LOUPE.seen.has(ev.id))fresh.push(ev);} // canard d'équipe (39-duckgame.js)
  LOUPE.seen=now;
  // au même endroit, le plus parlant d'abord : le sage avant la fête de MEP (l'autre est écarté, même cadre)
  return fresh.sort((a,b)=>LOUPE_ORDER.indexOf(a.kind)-LOUPE_ORDER.indexOf(b.kind));
}
// cadre de la scène sur la toile (px) : les personnages, la place de leurs bulles au-dessus, au format 16:10, dans la toile
function loupeBox(cs){
  const xs=cs.map(c=>c.pos.x), ys=cs.map(c=>c.pos.y), W=cv.width, H=cv.height;
  let x0=Math.min(...xs)-3*TS, x1=Math.max(...xs)+3*TS, y0=Math.min(...ys)-3.5*TS, y1=Math.max(...ys)+1.2*TS;
  const w=Math.max(x1-x0,(y1-y0)*1.6,8*TS), h=w/1.6, cx=(x0+x1)/2, cy=(y0+y1)/2;
  const bw=Math.min(w,W), bh=Math.min(h,H);
  return {x:Math.round(Math.min(Math.max(cx-bw/2,0),W-bw)),y:Math.round(Math.min(Math.max(cy-bh/2,0),H-bh)),w:Math.round(bw),h:Math.round(bh)};
}
// légende : qui (l'invité ou le héraut d'abord), avec qui, et ce qui se passe (le libellé de son état)
function loupeCaption(ev){
  if(LOUPE_CEREMONY[ev.kind]){ // l'animateur (rétro, planning) d'abord s'il y en a un
    const host=ev.cs.find(c=>/^Anime/.test((c._st&&c._st.label)||''))||ev.cs.find(c=>c.roleKind==='sm')||ev.cs[0];
    return {lead:host,ico:LOUPE_KINDS[ev.kind][0],color:LOUPE_KINDS[ev.kind][1],
      title:LOUPE_CEREMONY[ev.kind]+' · '+ev.cs.length+(ev.cs.length>1?' personnes':' personne'),sub:(host._st&&host._st.label)||''};
  }
  const lead=ev.cs.find(c=>c.guest)||(ev.kind==='thumbs'&&ev.cs.find(c=>c.roleKind==='qa'))||ev.cs[0];
  const others=ev.cs.filter(c=>c!==lead).map(c=>c.name);
  return {lead,ico:LOUPE_KINDS[ev.kind][0],color:LOUPE_KINDS[ev.kind][1],
    title:lead.name+(others.length?' · '+others.slice(0,3).join(', '):''),sub:(lead._st&&lead._st.label)||''};
}
const overlaps=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
function loupeShow(ev,now){
  const box=loupeBox(ev.cs);
  LOUPE.cur={...ev,box,cap:loupeCaption(ev),until:now+LOUPE_MS};
  if(mode==='play'){setMode('pause');LOUPE.resume=true;} // rejeu accéléré : on regarde la scène, puis la lecture reprend
}
function loupeHide(){
  LOUPE.cur=null;
  if(LOUPE.queue.length)return loupeHideView(); // d'autres événements attendent : la lecture reste en pause
  loupeHideView();
  if(LOUPE.resume){LOUPE.resume=false;if(mode==='pause')setMode('play');}
}
function loupeHideView(){
  const o=document.getElementById('loupecv'), f=document.getElementById('loupefly');
  if(o)o.hidden=true; if(f)f.hidden=true;
}
// à chaque image : repérer les nouveaux événements, en montrer un quand ses personnages sont arrivés, dessiner le médaillon
function loupeFrame(now){
  if(!LOUPE_ON||!DATA){LOUPE.queue=[];if(LOUPE.cur)loupeHide();return;}
  if(mode==='pause'&&!LOUPE.resume){if(LOUPE.cur)loupeHide();LOUPE.queue=[];LOUPE.seen=null;return;} // on fait glisser l'heure
  // en rejeu, à chaque image (à x480, une scène de 3 min ne dure que 0,4 s) ; en direct, 4 fois par seconde
  if(mode==='play'||now-LOUPE.lastScan>250){
    LOUPE.lastScan=now;
    for(const ev of loupeScan()){ev.added=now;if(!LOUPE.queue.some(q=>q.id===ev.id))LOUPE.queue.push(ev);}
  }
  // une scène finie avant d'avoir été montrée sort de la file
  LOUPE.queue=LOUPE.queue.filter(q=>q.cs.some(c=>loupeKind(c)===q.kind));
  // rejeu : la lecture s'arrête dès qu'un événement commence, le temps que les personnages arrivent et que la loupe passe
  if(mode==='play'&&LOUPE.queue.length&&!LOUPE.cur){setMode('pause');LOUPE.resume=true;}
  if(LOUPE.cur&&now>LOUPE.cur.until)loupeHide();
  if(!LOUPE.cur&&LOUPE.queue.length&&now>LOUPE.hoverUntil){
    const ev=LOUPE.queue[0];
    if(ev.cs.every(c=>!c.moving)||now-ev.added>LOUPE_WAIT_MAX){
      LOUPE.queue.shift();
      const box=loupeBox(ev.cs);
      LOUPE.queue=LOUPE.queue.filter(q=>!overlaps(loupeBox(q.cs),box)); // fête de MEP et sage au même endroit : une seule loupe
      loupeShow(ev,now);
    }
  }
  if(LOUPE.cur)drawLoupe(now);
}
function drawLoupe(now){
  const {box,cap:k}=LOUPE.cur;
  // le cadre sur le plan : un calque posé exactement sur la toile (centrée en mode TV)
  let o=document.getElementById('loupecv');
  if(!o){o=document.createElement('canvas');o.id='loupecv';cv.parentElement.appendChild(o);}
  if(o.width!==cv.width||o.height!==cv.height){o.width=cv.width;o.height=cv.height;}
  Object.assign(o.style,{left:cv.offsetLeft+'px',top:cv.offsetTop+'px',width:cv.offsetWidth+'px',height:cv.offsetHeight+'px'});
  o.hidden=false;
  const g=o.getContext('2d');g.clearRect(0,0,o.width,o.height);
  g.lineWidth=4;g.strokeStyle=k.color;g.strokeRect(box.x+2,box.y+2,box.w-4,box.h-4);
  // la fenêtre flottante : la scène agrandie (×2 de la toile), liseré de l'événement, légende, temps restant
  let f=document.getElementById('loupefly');
  if(!f){
    f=document.createElement('div');f.id='loupefly';
    f.innerHTML='<canvas></canvas><div class="lh" title="Ouvrir sa fiche"><button class="lx" aria-label="Fermer">✕</button><b role="button" tabindex="0"></b><small></small><i></i></div>';
    document.body.appendChild(f);
    f.querySelector('.lx').onclick=e=>{e.stopPropagation();loupeHide();};
    f.querySelector('.lh').onclick=()=>{const c=LOUPE.cur&&LOUPE.cur.cap.lead;loupeHide();if(c)select(c.key);};
    f.addEventListener('keydown',keyClick); // le titre (role=button, pas la légende entière : elle contient le bouton Fermer)
  }
  f.style.setProperty('--lc',k.color);
  const fc=f.querySelector('canvas');
  if(fc.width!==box.w*2||fc.height!==box.h*2){fc.width=box.w*2;fc.height=box.h*2;}
  const h=fc.getContext('2d');h.imageSmoothingEnabled=false;h.drawImage(cv,box.x,box.y,box.w,box.h,0,0,fc.width,fc.height);
  const t=k.ico+' '+k.title;
  if(f.dataset.sig!==t+k.sub){f.dataset.sig=t+k.sub;f.querySelector('b').textContent=t;f.querySelector('small').textContent=k.sub;}
  f.querySelector('i').style.width=Math.max(0,Math.min(100,(LOUPE.cur.until-now)/LOUPE_MS*100))+'%';
  f.hidden=false;
  // à gauche, sauf si elle couvrirait la scène encadrée : alors à droite
  const r=cv.getBoundingClientRect(), s=r.width/cv.width;
  const scene={x:r.left+box.x*s,y:r.top+box.y*s,w:box.w*s,h:box.h*s};
  f.classList.remove('right');
  const a=f.getBoundingClientRect();
  if(overlaps({x:a.left,y:a.top,w:a.width,h:a.height},scene))f.classList.add('right');
}

cv.addEventListener('mousemove',()=>{LOUPE.hoverUntil=performance.now()+LOUPE_HOVER_MS;});
cv.addEventListener('click',()=>{if(LOUPE.cur)loupeHide();});
addEventListener('keydown',e=>{if(e.key==='Escape'&&LOUPE.cur)loupeHide();});
function setLoupe(on,remember=true){
  LOUPE_ON=on;if(!on){LOUPE.queue=[];loupeHide();}
  if(remember)try{localStorage.setItem('bureau:loupe',on?'1':'0');}catch(e){}
  const b=document.getElementById('loupebtn');if(b)b.classList.toggle('on',on);
}
document.getElementById('loupebtn')?.addEventListener('click',()=>setLoupe(!LOUPE_ON));
setLoupe(LOUPE_ON,false);
