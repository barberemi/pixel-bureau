// ---------- loupe : un médaillon agrandi sur le plan quand un événement fort commence ----------
// Réouverture (le héraut convoque l'assigné), mise en prod réussie (le sage félicite), invité qui arrive, fête de MEP,
// pouce du testeur, lancement du sprint. Le plan reste entier : un cadre entoure la scène et un médaillon l'agrandit dans le
// coin opposé, avec sa légende (clic : la fiche). Un événement à la fois, une fois les personnages arrivés, LOUPE_MS ;
// en rejeu accéléré la lecture se met en pause le temps de la loupe ; rien quand on fait glisser l'heure ou qu'on survole le
// plan. Bouton « 🔍 Loupe » de la barre (retenu dans le navigateur), ?loupe=0 dans l'adresse de l'écran mural.
const LOUPE_MS=20e3, LOUPE_WAIT_MAX=40e3, LOUPE_HOVER_MS=5e3;
const LOUPE_KINDS={reopen:['⛔','#b3122e'],proud:['🎉','#0172f0'],party:['🎉','#0172f0'],thumbs:['👍','#2e9e5b'],kickoff:['🏁','#2e9e9b'],guest:['👋','#2e9e5b']};
let LOUPE_ON=true;try{LOUPE_ON=localStorage.getItem('bureau:loupe')!=='0';}catch(e){}
const LOUPE={seen:null,queue:[],cur:null,resume:false,hoverUntil:0,lastScan:0};
// le type d'événement que vit ce personnage (null : rien à montrer) ; un invité qui n'est pas en scène de héraut = une visite
function loupeKind(c){
  const st=c._st&&c._st.st;
  if(st&&st!=='guest'&&LOUPE_KINDS[st])return st;
  return c.guest&&c.present!==false?'guest':null;
}
// événements qui commencent depuis le dernier passage ; le premier passage ne fait que noter ce qui est déjà en cours
function loupeScan(){
  const groups={}, now=new Set(), fresh=[];
  for(const c of chars){
    const k=loupeKind(c); if(!k||c.present===false||!c.pos)continue;
    const id=k==='guest'?'guest:'+c.key:k;(groups[id]=groups[id]||[]).push(c);
  }
  for(const id in groups){now.add(id);if(LOUPE.seen&&!LOUPE.seen.has(id))fresh.push({id,kind:id.split(':')[0],cs:groups[id]});}
  LOUPE.seen=now;
  return fresh;
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
  const o=document.getElementById('loupecv'), cap=document.getElementById('loupecap');
  if(o)o.hidden=true; if(cap)cap.hidden=true;
  if(LOUPE.resume){LOUPE.resume=false;if(mode==='pause')setMode('play');}
}
// à chaque image : repérer les nouveaux événements, en montrer un quand ses personnages sont arrivés, dessiner le médaillon
function loupeFrame(now){
  if(!LOUPE_ON||!DATA){if(LOUPE.cur)loupeHide();LOUPE.queue=[];return;}
  if(mode==='pause'&&!LOUPE.resume){if(LOUPE.cur)loupeHide();LOUPE.queue=[];LOUPE.seen=null;return;} // on fait glisser l'heure
  if(now-LOUPE.lastScan>250){
    LOUPE.lastScan=now;
    for(const ev of loupeScan()){ev.added=now;if(!LOUPE.queue.some(q=>q.id===ev.id))LOUPE.queue.push(ev);}
  }
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
  const wrap=cv.parentElement;
  let o=document.getElementById('loupecv'), cap=document.getElementById('loupecap');
  if(!o){o=document.createElement('canvas');o.id='loupecv';wrap.appendChild(o);}
  if(!cap){cap=document.createElement('div');cap.id='loupecap';cap.title='Ouvrir sa fiche';wrap.appendChild(cap);
    cap.onclick=()=>{const c=LOUPE.cur&&LOUPE.cur.cap.lead;loupeHide();if(c)select(c.key);};}
  if(o.width!==cv.width||o.height!==cv.height){o.width=cv.width;o.height=cv.height;}
  // calque posé exactement sur la toile (centrée en mode TV)
  Object.assign(o.style,{left:cv.offsetLeft+'px',top:cv.offsetTop+'px',width:cv.offsetWidth+'px',height:cv.offsetHeight+'px'});
  o.hidden=false;
  const g=o.getContext('2d'), {box,cap:k}=LOUPE.cur, W=o.width, H=o.height, m=12, capH=54;
  const iw=Math.round(W*0.4), ih=Math.round(iw*box.h/box.w);
  const ix=box.x+box.w/2<W/2?W-iw-m:m, iy=box.y+box.h/2<H/2?H-ih-capH-m:m;
  g.clearRect(0,0,W,H);
  g.imageSmoothingEnabled=false;
  g.lineWidth=4;g.strokeStyle=k.color;g.strokeRect(box.x+2,box.y+2,box.w-4,box.h-4);
  g.fillStyle='#0b2350';g.fillRect(ix-4,iy-4,iw+8,ih+capH+8);
  g.drawImage(cv,box.x,box.y,box.w,box.h,ix,iy,iw,ih);
  const s=cv.offsetWidth/W, left=(ix-4)*s, width=(iw+8)*s;
  Object.assign(cap.style,{left:cv.offsetLeft+left+'px',top:cv.offsetTop+(iy+ih)*s+'px',width:width+'px','--lc':k.color});
  const html=`<b>${k.ico} ${esc(k.title)}</b><small>${esc(k.sub)}</small><i style="width:${Math.max(0,Math.min(100,(LOUPE.cur.until-now)/LOUPE_MS*100))}%"></i>`;
  if(cap.dataset.sig!==html){cap.dataset.sig=html;cap.innerHTML=html;}
  cap.hidden=false;
}
cv.addEventListener('mousemove',()=>{LOUPE.hoverUntil=performance.now()+LOUPE_HOVER_MS;});
cv.addEventListener('click',()=>{if(LOUPE.cur)loupeHide();});
addEventListener('keydown',e=>{if(e.key==='Escape'&&LOUPE.cur)loupeHide();});
function setLoupe(on,remember=true){
  LOUPE_ON=on;if(!on)loupeHide();
  if(remember)try{localStorage.setItem('bureau:loupe',on?'1':'0');}catch(e){}
  const b=document.getElementById('loupebtn');if(b)b.classList.toggle('on',on);
}
document.getElementById('loupebtn')?.addEventListener('click',()=>setLoupe(!LOUPE_ON));
setLoupe(LOUPE_ON,false);
