// ---------- le vidéoprojecteur de la salle de réunion, en mode TV ----------
// Les pages de l'écran mural cochées « 📽 Projeter en TV » (liste tv du dataset pagelist, pages_save.py) passent sur une
// toile tendue devant le tableau blanc, une toutes les PJ_MS : leur chiffre clé (kpi que la page publie elle-même, relevé
// par pages_snapshot.py : value, label, pct ou parts, short), sinon le haut de leur miniature. Un projecteur sur la table,
// son faisceau, la salle dans la pénombre. Veille dès que quelqu'un est dans la salle (réunion, scène d'un reopen…) :
// la toile remonte, le faisceau s'éteint, voyant orange. Hors mode TV, rien ne change (l'écran mural et ses miniatures).
let PAGE_TV=null; // ids projetés (dataset pagelist) ; null : ceux marqués tv dans bosspages
const PJ_MS=6000, PJ_HEX=/^#[0-9a-fA-F]{6}$/;
function readPageTv(src){try{const d=dsOf(src,'pagelist');return d&&Array.isArray(d.tv)?d.tv.filter(x=>typeof x==='string'):null;}catch(e){return null;}}
const projoTv=p=>PAGE_TV?PAGE_TV.includes(p.id):!!p.tv;
const projoPages=()=>shownPages().filter(projoTv);
// demande acceptée par Kronn : la fenêtre et la toile suivent tout de suite, sans attendre le dataset
function projoSent(op,id){
  if(op!=='tv_on'&&op!=='tv_off')return;
  const cur=PAGE_TV||shownPages().filter(p=>p.tv).map(p=>p.id);
  PAGE_TV=op==='tv_on'?[...new Set([...cur,id])]:cur.filter(x=>x!==id);
}
// la salle de réunion : la pièce éclairée (light_rooms du plan) qui contient le tableau blanc
function projoRoom(){
  const w=(LAYOUT.wall||[]).find(d=>d.type==='whiteboard'); if(!w)return null;
  const r=(LAYOUT.light_rooms||[]).find(([x0,y0,x1,y1])=>w.at[0]>=x0&&w.at[0]<=x1&&y0>=w.at[1]&&y0<=w.at[1]+2);
  return r?{x:r[0]*TS,y:w.at[1]*TS+8,w:(r[2]-r[0]+1)*TS,h:(r[3]+1-w.at[1])*TS-8}:null;
}
const projoOn=()=>TV&&!!wallRect()&&projoPages().length>0;
function projoBusy(){const r=projoRoom();return !!r&&chars.some(c=>c.pos&&c.pos.x>=r.x&&c.pos.x<=r.x+r.w&&c.pos.y>=r.y&&c.pos.y<=r.y+r.h);}
const projoScreen=()=>{const r=wallRect();return {x:r.x-8,y:r.y-6,w:r.w+16,h:r.h+26};};
function pjText(t,x,y,size,col,max){
  ctx.font=size+'px BureauPixel, ui-monospace, monospace';
  if(max)while(t.length>4&&ctx.measureText(t).width>max)t=t.replace(/…$/,'').slice(0,-1).trimEnd()+'…';
  ctx.fillStyle=col;ctx.textBaseline='top';ctx.fillText(t,x,y);ctx.textBaseline='alphabetic';
}
function pjBar(k,x,y,w,h){
  R(ctx,x,y,w,h,'#2c313c');
  if(k.parts){const t=k.parts.reduce((a,b)=>a+b[0],0);let cx=x;k.parts.forEach(([n,c],i)=>{const pw=i===k.parts.length-1?x+w-cx:Math.round(w*n/t);R(ctx,cx,y,pw,h,PJ_HEX.test(c)?c:'#888');cx+=pw;});}
  else if(k.pct!=null)R(ctx,x,y,Math.round(w*Math.max(0,Math.min(100,k.pct))/100),h,PJ_HEX.test(k.color||'')?k.color:'#5b8def');
}
// la toile, dessinée à la place de l'écran mural (WALL_SCREEN, 47-bosspages.js) en mode TV
function drawProjoScreen(now){
  const s=projoScreen();
  R(ctx,s.x-2,s.y-2,s.w+4,2,'#5a5f6b');R(ctx,s.x+s.w/2-1,s.y-6,2,4,'#5a5f6b');                       // barre, suspente
  if(projoBusy()){R(ctx,s.x-3,s.y,s.w+6,5,'#d9d4c4');R(ctx,s.x-3,s.y+4,s.w+6,1,'#a49f90');R(ctx,s.x+s.w/2-3,s.y+5,6,3,'#5a5f6b');return;} // remontée
  const l=projoPages(), p=l[Math.floor(now/PJ_MS)%l.length], k=p.kpi;
  R(ctx,s.x,s.y,s.w,s.h,'#f4f1e8');R(ctx,s.x+3,s.y+3,s.w-6,s.h-6,'#16191f');
  const title=(k&&k.short)||p.title||'';
  if(k&&k.value!=null&&k.label){ // le chiffre clé, lisible de loin
    pjText(title,s.x+7,s.y+6,6,'#cfd6e3',s.w-14);
    pjText(String(k.value),s.x+7,s.y+15,16,k.parts?'#ffffff':PJ_HEX.test(k.color||'')?k.color:'#5b8def',s.w-14);
    pjText(k.label,s.x+7,s.y+s.h-15,6,'#9aa3b5',s.w-14);pjBar(k,s.x+7,s.y+s.h-8,s.w-14,4);
  }else{ // sans chiffre : le haut de la miniature, et le titre dessous
    const im=bossPageImg(p), iw=s.w-6, ih=s.h-15;
    if(im){ctx.save();ctx.imageSmoothingEnabled=true;ctx.filter='brightness(1.35) saturate(1.2)';ctx.drawImage(im,0,0,im.naturalWidth,Math.min(im.naturalWidth*ih/iw,im.naturalHeight),s.x+3,s.y+3,iw,ih);ctx.restore();}
    pjText(title,s.x+7,s.y+s.h-11,6,'#ffffff',s.w-14);
  }
  if(l.length>1)l.forEach((q,i)=>R(ctx,s.x+s.w/2-l.length*3+i*6,s.y+s.h+2,3,2,q===p?'#f2d44e':'#5a5f6b')); // pagination
}
// le projecteur sur la table, son faisceau et la pénombre (mobilier trié en profondeur, au niveau de la table)
const PROJECTOR={get y(){const r=projoRoom();return r?r.y+r.h-40:0;},draw:now=>{
  if(!projoOn())return;
  const r=projoRoom(), s=projoScreen(), px=Math.round(s.x+s.w/2), py=s.y+s.h+26, busy=projoBusy();
  if(!busy&&r){
    ctx.save();ctx.fillStyle='rgba(8,10,20,.35)';ctx.fillRect(r.x,r.y-8,r.w,r.h+8);
    const g=ctx.createLinearGradient(0,py,0,s.y+s.h);g.addColorStop(0,'rgba(255,248,210,.55)');g.addColorStop(1,'rgba(255,248,210,.10)');
    ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(px-3,py);ctx.lineTo(s.x+2,s.y+s.h);ctx.lineTo(s.x+s.w-2,s.y+s.h);ctx.lineTo(px+3,py);ctx.closePath();ctx.fill();ctx.restore();
  }
  R(ctx,px-9,py-2,18,9,'#2b2f38');R(ctx,px-9,py-2,18,2,'#4a505c');R(ctx,px-3,py-4,6,3,'#2b2f38');         // boîtier
  R(ctx,px-2,py-4,4,2,busy?'#5a5f6b':'#fff6c8');R(ctx,px+5,py+2,2,2,busy?'#e0902a':(Math.floor(now/700)%2?'#5bd16b':'#2e7d3c')); // objectif, voyant
}};
// la fenêtre Mes pages Kronn : sous chaque page, projeter ou non, et ce que la toile montrera
function projoFoot(p){
  const on=projoTv(p), k=p.kpi&&p.kpi.value!=null&&p.kpi.label?p.kpi:null;
  const line=k?`<div class="pj-kpi"><b>📊 ${esc(String(k.value))}</b><span>${esc(k.label)}</span></div>${k.short?`<div class="pj-short">Sur la toile : « ${esc(k.short)} »</div>`:''}`:
    `<div class="pj-none">${on?'<span class="pj-warn">⚠ pas de chiffre : projetée en miniature</span>':'pas de chiffre'} <a href="#" class="pj-how">ⓘ Comment ?</a></div>`;
  return `<div class="pj-foot"><button type="button" class="pj-tv${on?' on':''}" data-kronn-action="bureau-pages" data-id="${esc(p.id)}" data-op="${on?'tv_off':'tv_on'}" aria-pressed="${on}">${on?'☑':'☐'} 📽 Projeter en TV</button>${line}</div>`;
}
function projoInfoHtml(){
  return `<div class="pj-info" hidden><h3>📊 Donner un chiffre à une page projetée</h3>
<p>En mode TV, le vidéoprojecteur de la salle de réunion montre le chiffre clé d'une page, lisible de loin. La page le publie elle-même : un champ <b>kpi</b> dans un de ses datasets, rempli par le cron qui la met à jour. Le Bureau le relève chaque heure, avec la miniature.</p>
<pre>"kpi": {
  "value": "55 %",
  "label": "blocks migrés",
  "pct": 54.9,
  "short": "Migration blocks"
}</pre><ul><li><b>value</b>, <b>label</b> : le chiffre et ce qu'il compte (obligatoires)</li><li><b>pct</b> : la barre, de 0 à 100 (couleur : <b>color</b>) ; ou <b>parts</b> : [[45, "#3fbf6a"], [24, "#e0a020"]] pour une barre en plusieurs couleurs</li><li><b>short</b> : le titre sur la toile, 18 caractères au plus</li><li>Sans kpi : la page est projetée en miniature</li></ul>
<p>Tout le détail : le guide « Murs du bureau », section « Projeter une page en TV » (guide/fonctionnalites/08-murs.md).</p></div>`;
}
