// ---------- ce qui t'attend, tous étages : la pastille au bout de la rangée des onglets d'étage ----------
// Un seul boss reçoit toutes les décisions : celles du RDC (les gates des agents, les workflows sans personnage) et celles
// des étages (le plan du 1er, le tampon du 2e, les corrections du 3e, la réponse Support du -1). La pastille les compte et
// donne l'âge de la plus ancienne ; un clic déroule la liste, la plus ancienne d'abord, et « Ouvrir » mène à l'étage, la
// décision ouverte dans le panneau. Sans décision, pas de pastille. En mode TV, rien (pas de clic sur l'écran mural).
const WAIT_FL={'-1':['🚒','-1'],0:['🏢','RDC'],1:['🏭','1er'],2:['✍','2e'],3:['🛠','3e']};
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
function waitChipHtml(L){
  const age=waitAge(L[0]&&L[0].t);
  return `✋ ${plural(L.length,'décision','décisions')}${age?`<small> · la plus ancienne ${age}</small>`:''}`;
}
function waitRowsHtml(L){
  return `<h4>✋ Ce qui t'attend, tous étages · la plus ancienne d'abord</h4>`+L.map((x,i)=>{const [ico,n]=WAIT_FL[x.fl];
    return `<div class="wl-r${i===0?' old':''}"><span class="wl-fl">${ico} ${n}</span><span class="wl-x"><b>${esc(x.a)}</b><small>${esc(x.b)}</small></span>`+
      `<span class="wl-age">${waitAge(x.t)}</span><button type="button" data-wl="${i}">Ouvrir ›</button></div>`;}).join('');
}
let WAIT_L=[];
function waitClose(){const p=document.getElementById('waitlist'), c=document.getElementById('waitchip');if(p)p.hidden=true;if(c)c.setAttribute('aria-expanded','false');}
// chaque seconde (90-boot.js), avec la barre des agents : l'âge de la plus ancienne avance avec l'heure du plan
function waitChip(){
  const bar=document.querySelector('.floorbar');if(!bar)return;
  let c=document.getElementById('waitchip'), p=document.getElementById('waitlist');
  if(!c){c=document.createElement('button');c.type='button';c.id='waitchip';c.className='waitchip';c.setAttribute('aria-expanded','false');c.setAttribute('aria-controls','waitlist');
    p=document.createElement('div');p.id='waitlist';p.className='waitlist';p.hidden=true;bar.append(c,p);
    c.addEventListener('click',e=>{e.stopPropagation();const open=p.hidden;p.hidden=!open;c.setAttribute('aria-expanded',String(open));});
    p.addEventListener('click',e=>{e.stopPropagation();const b=e.target.closest('[data-wl]');if(!b)return;const x=WAIT_L[+b.dataset.wl];waitClose();if(x)x.go();});
    document.addEventListener('click',waitClose);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!p.hidden){waitClose();c.focus();}});}
  const L=waitList();WAIT_L=L;c.hidden=!L.length;if(!L.length)waitClose();
  const h=waitChipHtml(L);if(c.dataset.sig!==h){c.innerHTML=c.dataset.sig=h;c.title=plural(L.length,'décision attend','décisions attendent')+' ta validation, tous étages';}
  const r=waitRowsHtml(L);if(p.dataset.sig!==r)p.innerHTML=p.dataset.sig=r;
}
