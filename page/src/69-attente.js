// ---------- ce qui t'attend, tous étages : la tuile « À toi » des chiffres du haut, et sa liste ----------
// Un seul boss reçoit toutes les décisions : celles du RDC (les gates des agents, les workflows sans personnage) et celles
// des étages (le plan du 1er, le tampon du 2e, les corrections du 3e, la réponse Support du -1). La tuile « À toi » les compte
// et donne l'âge de la plus ancienne ; un clic déroule la liste, la plus ancienne d'abord, et « Ouvrir » mène à l'étage, la
// décision ouverte dans le panneau. Sans décision ni panne, pas de tuile. En mode TV, rien (pas de clic sur l'écran mural).
function waitList(){
  const out=[], taken=new Set(), add=(fl,run,a,b,t,go)=>{if(run)taken.add(run);out.push({fl,run,a,b,t:t||null,go});};
  if(atelierOn())for(const {r} of atGateRooms()){const g=atGate(r);add(1,r.run,r.ticket||'Un ticket',AT_GATE_TXT[r.gate]||'ta décision',(g&&g._s)||ms(r.since),()=>{atGoto(r.run);atGateFocus();});}
  if(redactionOn())for(const t of rdTables()){const n=(t.tickets||[]).filter(x=>x.etat==='gate').length;
    if(n)add(2,t.run,plural(n,'ticket','tickets')+' au tampon',clip(t.intention||'',44),ms(t.since),()=>rdGoto(t.run));}
  if(retoursOn())for(const r of rtRooms())if(r.gate)add(3,r.run,rtName(r),'corrections à valider avant le push',ms(r.since),()=>rtGoto(r.run));
  if(caserneOn())for(const {t,s} of csActive())if(s.k==='gate')add(-1,t.run&&t.run.run,'Support · '+clip(t.subject||t.text||'',36),'réponse à valider avant Teams',ms((t.run&&t.run.at)||t.at),
    ()=>{setFloor(-1);CS_SEL=t.id;CS_PICK=null;SIDE_FOLDED=false;renderSide(true);});
  // le RDC : ce que la fiche du boss liste déjà (50-panel.js), sans ce qu'un étage montre (le tampon du 2e passe par une gate)
  const boss=chars.find(c=>c.boss), since=run=>{const g=GATES.find(x=>x.run===run);return g?ms(g.since):null;};
  const floorGate=g=>taken.has(g.run)||redactionOn()&&/un ticket/.test(String(g.wf_name||''));
  for(const c of chars)for(const r of gateRunsOf(c))if(r&&!floorGate(r))add(0,r.run,c.name,r.wf_name||'une validation',since(r.run)||r._s,()=>{setFloor(0);select(c.key);});
  for(const g of loneGates())if(!floorGate(g))add(0,g.run,g.wf_name||'Une validation','sans personnage, dans ta fiche',ms(g.since),()=>{setFloor(0);if(boss)select(boss.key);});
  return out.sort((a,b)=>(a.t==null)-(b.t==null)||a.t-b.t);
}
const waitAge=t=>{if(!t)return '';const m=Math.max(1,Math.round((T-t)/6e4));return m<60?m+' min':Math.floor(m/60)+' h '+String(m%60).padStart(2,'0');};
// pannes à voir : les agents du RDC en panne et celles des étages (1er, 3e)
function waitPannes(){
  const rdc=chars.filter(c=>!c.person&&!c.visitor&&c._st&&c._st.st==='error').length;
  return rdc+(atelierOn()&&ATELIER?(ATELIER.pannes||[]).length:0)+(retoursOn()&&RETOURS?(RETOURS.pannes||[]).length:0);
}
// la tuile « À toi », en tête des chiffres du haut (70-kpis-feed.js) : le nombre de décisions, la plus ancienne, les trois
// plus anciennes, le reste et les pannes ; un clic déroule la liste entière. Rien à décider ni à réparer : pas de tuile.
function toiKpiHtml(L,pannes){
  if(!L.length&&!pannes)return '';
  // trois lignes au plus (le bandeau ne grandit pas) : les deux plus anciennes, puis le reste et les pannes
  const age=waitAge(L[0]&&L[0].t), lines=L.slice(0,2).map(x=>`<li>✋ <b>${esc(x.a)}</b> ${esc(x.b)} · ${ETAGES[x.fl].n}</li>`);
  const tail=[L.length>2?`et ${L.length-2} de plus`:'',pannes?`🧯 <b>${plural(pannes,'agent','agents')}</b> en panne`:''].filter(Boolean);
  if(tail.length)lines.push(`<li>${tail.join(' · ')}</li>`);
  const tip=plural(L.length,'décision attend','décisions attendent')+' ta validation, tous étages'+(pannes?' · '+plural(pannes,'panne','pannes'):'');
  return `<section class="dash toi click${L.length?' warn':' err'}" data-open="attente" tabindex="0" role="button" aria-expanded="false" aria-controls="waitlist" title="${esc(tip)}">`+
    `<h3>À toi</h3><div class="row"><div class="big">${L.length}</div><div class="grow">${L.length>1?'décisions':'décision'}${age?`<br>la plus ancienne ${age}`:''}</div></div>`+
    `<ul class="toi-l">${lines.join('')}</ul></section>`;
}
function waitRowsHtml(L){
  return `<h4>✋ Ce qui t'attend, tous étages · la plus ancienne d'abord</h4>`+L.map((x,i)=>{const {ico,n}=ETAGES[x.fl];
    return `<div class="wl-r${i===0?' old':''}"><span class="wl-fl">${ico} ${n}</span><span class="wl-x"><b>${esc(x.a)}</b><small>${esc(x.b)}</small></span>`+
      `<span class="wl-age">${waitAge(x.t)}</span><button type="button" data-wl="${i}">Ouvrir ›</button></div>`;}).join('');
}
let WAIT_L=[];
const waitTile=()=>document.querySelector('#kpis .toi');
function waitClose(){const p=document.getElementById('waitlist'), c=waitTile();if(p)p.hidden=true;if(c)c.setAttribute('aria-expanded','false');}
function waitToggle(){const p=document.getElementById('waitlist');if(!p)return;const open=p.hidden;p.hidden=!open;const c=waitTile();if(c)c.setAttribute('aria-expanded',String(open));}
// lecteur d'écran : une phrase discrète quand une décision de plus t'attend (rien quand le nombre baisse)
let WAIT_N=null;
function waitAnnounce(n){
  const lv=document.getElementById('waitlive');
  if(lv&&WAIT_N!=null&&n>WAIT_N)lv.textContent=n===1?'Une décision t\'attend.':n+' décisions t\'attendent.';
  WAIT_N=n;
}
// chaque seconde (90-boot.js) : la liste sous les chiffres du haut, déroulée par la tuile « À toi » ; l'âge de la plus
// ancienne avance avec l'heure du plan
function waitChip(){
  const k=document.getElementById('kpis');if(!k||!k.parentElement)return;
  let p=document.getElementById('waitlist');
  if(!p){const w=document.createElement('div');w.className='waitwrap';p=document.createElement('div');p.id='waitlist';p.className='waitlist';p.hidden=true;p.setAttribute('role','region');p.setAttribute('aria-label','Ce qui t\'attend');
    const lv=document.createElement('div');lv.id='waitlive';lv.className='sr-only';lv.setAttribute('aria-live','polite');w.appendChild(lv);
    w.appendChild(p);k.parentElement.insertBefore(w,k.nextSibling);
    p.addEventListener('click',e=>{e.stopPropagation();const b=e.target.closest('[data-wl]');if(!b)return;const x=WAIT_L[+b.dataset.wl];waitClose();if(x)x.go();});
    document.addEventListener('click',waitClose);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!p.hidden){waitClose();const c=waitTile();if(c)c.focus();}});}
  const L=waitList();WAIT_L=L;if(!L.length)waitClose();
  waitAnnounce(L.length);
  const r=waitRowsHtml(L);if(p.dataset.sig!==r)p.innerHTML=p.dataset.sig=r;
}
