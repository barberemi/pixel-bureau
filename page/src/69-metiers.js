// ---------- les agents des étages, au RDC : Support, Ticket, Revue, Retours, Implé ----------
// Un agent du pack ou de la config qui porte « metier » est l'agent d'un étage. Au RDC, il reste toujours à sa place du plan
// (pas d'absence, comme l'agent Support en alerte), en couleurs pleines (pas d'hologramme) et dans la tenue de son étage ;
// son étiquette est son métier, pas son prénom. La barre « AGENTS », au-dessus des onglets d'étage, le montre à tous les
// étages : un clic ouvre ce qu'il lance (la console Support, sinon sa fiche au RDC avec ses boutons de lancement).
// l'icône est celle de l'étage (ETAGES, 68-atelier.js), sauf la Revue, seconde salle du 2e, qui garde la sienne
const METIERS={
  support:{lbl:'Support',ico:'🚒',fl:-1,kit:'pompier'},
  ticket:{lbl:'Ticket',ico:'✍',fl:2,kit:'presse'},
  revue:{lbl:'Revue',ico:'🔍',fl:2,kit:'visiere'},
  retours:{lbl:'Retours',ico:'🛠',fl:3,kit:'chirurgien'},
  impl:{lbl:'Implémentation',court:'Implé',ico:'🏭',fl:1,kit:'chantier'}}; // court : l'étiquette du plan, qui doit rester petite
// les copies d'un agent dessinées aux étages (atWorker, rdAgent…) gardent son champ metier : seul le personnage du RDC compte
const metierOf=c=>c&&!c.person&&!c.visitor&&METIERS[c.metier]&&byKey[c.key]===c?METIERS[c.metier]:null;
// un agent par métier, dans l'ordre de la barre (le premier de la config si deux le revendiquent)
const mtAgents=()=>Object.keys(METIERS).map(k=>chars.find(c=>c.metier===k&&!c.person&&!c.visitor)).filter(Boolean);
// toujours là : sans run du jour (ou reparti), il est à sa place, au repos ; un workflow désactivé dans Kronn le reste aussi
function mtState(c,s){
  if(!s||!['off','absent','gone'].includes(s.st))return s;
  return {...s,st:'idle',zone:'desk',label:'À son poste · '+s.label};
}
// ---------- la tenue, par-dessus le personnage (drawChar, 41-people.js) ----------
// assis à son îlot (pose 'type'), la tête descend de 6 px ; gilet du chantier : à sa hauteur d'origine assis, 3 px plus
// bas debout, pour dégager le menton
function mtChirurgien(g,x,y,dir,seated){
  const d=seated?6:0, hx=x+(dir==='left'?-2:dir==='right'?2:0), hy=y-42+d;
  R(g,x-8,y-26+d,16,12,'#4f9a8a');R(g,x-8,y-26+d,16,1,'#3f7a6e');if(dir!=='up')R(g,x-2,y-26+d,4,3,'#3f7a6e'); // la blouse
  g.fillStyle='#5fb0a0';g.beginPath();g.arc(hx,hy+1,10,Math.PI,0);g.fill();R(g,hx-10,hy,20,3,'#4f9a8a'); // le calot
  if(dir!=='up'){const w=dir==='down'?12:8, mx=dir==='left'?hx-7:dir==='right'?hx-1:hx-6;R(g,mx,hy+11,w,5,'#cfe8e2');R(g,mx,hy+11,w,1,'#a8cfc6');} // le masque
}
function mtKit(c,m){
  m=m||metierOf(c);if(!m||!c.pos)return;
  const x=Math.round(c.pos.x), y=Math.round(c.pos.y), seated=c.pose==='type'&&!c.moving, d=seated?6:0;
  if(m.kit==='pompier')csHelmet(ctx,x,y+d,c.dir,false); // 68-caserne.js
  else if(m.kit==='presse'||m.kit==='visiere')rdHat(ctx,m.kit,x,y+d,c.dir); // 68-redaction.js
  else if(m.kit==='chirurgien')mtChirurgien(ctx,x,y,c.dir,seated);
  else if(m.kit==='chantier')drawGear(c,'chantier'); // 68-atelier.js
}
// ---------- ce qu'il lance : la console Support, sinon sa fiche et ses boutons ----------
function mtOpen(c){
  if(!c)return;
  if(c.metier==='support'&&supportOpenable())return openSupport();
  if(FLOOR!==0)setFloor(0);
  select(c.key);SIDE_FOLDED=false;renderSide(true);
}
const MT_MAX=6; // lignes par liste ; au-delà, ⌘K ou le Kanban
const mtPrs=()=>TEAM?[...TEAM.people.flatMap(p=>(p.prs||[]).map(x=>({...x,author:p.name}))),...(TEAM.other_prs||[])].filter(p=>!p.merged&&actPr(p)):[];
const mtTickets=()=>TEAM?[...TEAM.people.flatMap(p=>p.tickets.map(t=>({...t,owner:p.name}))),...(TEAM.unassigned||[])]:[];
// les PR du boss (OWNER, celui qui a installé la page) : auteur dont le nom contient tous les mots du sien, sans accents
// ni ordre (« Remi Barbe » / « Barbé Rémi »), ou l'un de ses logins GitHub ; sans boss connu, toutes
const mtToks=s=>nameKey(s).split(/[\s._-]+/).filter(Boolean);
function mtMine(){
  const o=byKey[OWNER], me=o?mtToks(o.person||o.name):[];if(!me.length)return ()=>true;
  const has=n=>{const a=new Set(mtToks(n));return me.every(t=>a.has(t));};
  const gh=new Set((TEAM?TEAM.people:[]).filter(p=>has(p.name)).flatMap(p=>(p.gh||[]).map(nameKey)));
  return p=>has(p.author)||gh.has(nameKey(p.author));
}
// les lignes à lancer d'un métier : [{bind, name, sub}] (PR à relire, PR avec des fils, tickets à implémenter)
function mtRows(k){
  const pr=p=>({bind:{id:prId(p)},name:prNum(p)+(p.title?' '+clip(p.title,60):''),sub:p.author?'de '+p.author:''});
  if(k==='revue')return ACTIONS.review?mtPrs().filter(p=>!p.draft&&p.review!=='approved').map(pr):[];
  if(k==='retours'){
    const mine=mtMine();
    // les PR du boss seulement : celle d'un autre se corrige depuis sa fiche ou le Kanban
    if(ACTIONS.fix_pr)return mtPrs().filter(p=>(p.threads>0||p.threads==null&&p.review==='changes')&&mine(p)).map(p=>({...pr(p),sub:p.threads>0?plural(p.threads,'fil','fils')+' à traiter':'changements demandés'}));
    return ACTIONS.fix?mtPrs().filter(p=>p.review==='changes'&&(!otherRepo(p.repo)||CFG.fix_any_repo)&&mine(p)).map(pr):[];
  }
  if(k==='impl'){
    if(!ACTIONS.impl||!ACTS)return [];
    const known=new Set(ACTS.tickets.map(t=>t.key));
    return mtTickets().filter(t=>known.has(t.key)&&(t.cat==='todo'||t.cat==='doing')&&!prsOf(t.key).length)
      .map(t=>({bind:{key:t.key},name:t.key+' '+clip(tkComp(t.summary).title,60),sub:t.owner?'à '+t.owner:'sans responsable'}));
  }
  return [];
}
const MT_ACT={revue:['bureau-review','🔎 Relire','Relire '],retours:[null,'🛠 Corriger','Corriger les retours de '],impl:['bureau-impl','🤖 Implémenter','Implémenter ']};
// en tête de la fiche d'un agent de métier : ce qu'il peut lancer maintenant, sans passer par le Kanban
function mtBlock(side,c){
  const m=metierOf(c);if(!m||!MT_ACT[c.metier])return; // Support : la console (spFiche) ; Ticket : « ▶ Lancer… » (runBlock)
  const [a0,label,title]=MT_ACT[c.metier], action=a0||(ACTIONS.fix_pr?'bureau-fixpr':'bureau-fix'), rows=mtRows(c.metier);
  const box=foldSection(side,'mt-'+c.metier,m.ico+' À lancer',ACTS?rows.length:null,true);
  if(!ACTS){const e=document.createElement('div');e.className='note';e.textContent='Les boutons arrivent au prochain passage du cron équipe (10 min au plus).';box.appendChild(e);return;}
  if(!rows.length){const e=document.createElement('div');e.className='empty';e.textContent=c.metier==='impl'?'Aucun ticket à implémenter.':c.metier==='revue'?'Aucune PR à relire.':'Aucune de tes PR n\'a de fils à traiter. Celle d\'un autre : sa fiche ou le Kanban.';box.appendChild(e);return;}
  for(const r of rows.slice(0,MT_MAX))launchBlock(box,{action,bind:r.bind,name:r.name,sub:r.sub,label,title:title+(r.bind.key||r.bind.id)});
  if(rows.length>MT_MAX){const e=document.createElement('div');e.className='note';e.textContent='Et '+(rows.length-MT_MAX)+' de plus : ⌘K ou le Kanban.';box.appendChild(e);}
}
// ---------- la barre « AGENTS », au-dessus des onglets d'étage, à tous les étages (hors mode TV) ----------
// le personnage de face en tenue, sur une image de 64 × 64 (celle d'une case du sprite) ; null tant que le sprite charge
function mtFrame(c){
  const m=metierOf(c), img=spriteOf(c);if(!m||!ready(img))return null;
  const f=document.createElement('canvas');f.width=f.height=64;const g=f.getContext('2d');g.imageSmoothingEnabled=false;
  g.drawImage(img,2*64,4*64,64,64,0,0,64,64);
  const s=ctx;ctx=g;try{mtKit({...c,pos:{x:32,y:60},dir:'down',moving:false,pose:'stand'},m);}finally{ctx=s;} // pieds en (32, 60) : l'image en (0, 0)
  return f;
}
// la barre : coupé à la taille ; la fiche (portrait, 50-panel.js) : le cadrage des autres portraits
function mtFace(c){
  const f=mtFrame(c);if(!f)return null;
  const p=document.createElement('canvas');p.width=40;p.height=46;const g=p.getContext('2d');g.imageSmoothingEnabled=false;
  g.drawImage(f,12,2,40,46,0,0,40,46);return p.toDataURL();
}
const MT_FACE={};
// l'état en une ligne et sa pastille : ce qui attend (validation, panne, fils du Support), sinon au travail ou libre
function mtStatus(c){
  const st=(c._st||{}).st;
  if(c.metier==='support'&&supportOn()){const n=spTodo().length;if(n)return {txt:plural(n,'fil','fils')+' à traiter',b:String(n),col:'var(--err)'};}
  if(st==='gate'||st==='ask')return {txt:'t\'attend',b:'✋',col:'var(--warn)'};
  if(st==='error')return {txt:'en panne',b:'!',col:'var(--err)'};
  if(st==='work'||st==='srv'||st==='meet')return {txt:'au travail',b:'●',col:'var(--ok)'};
  return {txt:'libre',b:'',col:''};
}
function mtBarHtml(){
  return '<div class="mt-t" aria-hidden="true">AGENTS</div>'+mtAgents().map(c=>{const m=metierOf(c), s=mtStatus(c);
    const f=MT_FACE[c.key]||(MT_FACE[c.key]=mtFace(c)||'');
    return `<button type="button" class="mt-a" data-mt="${esc(c.key)}" title="${esc(m.lbl+' · '+c.name+' : '+s.txt)}">`+
      (f?`<img src="${f}" alt="">`:'<span class="mt-f"></span>')+(s.b?`<span class="mt-b" style="background:${s.col}">${esc(s.b)}</span>`:'')+
      `<span class="mt-x"><b>${m.ico} ${esc(m.lbl)}<span class="mt-fl">${ETAGES[m.fl].n}</span></b><small>${esc(s.txt)}</small></span></button>`;}).join('');
}
function mtBar(){
  let b=document.getElementById('mtbar');
  if(TV||!mtAgents().length){if(b)b.remove();return;}
  if(!b){b=document.createElement('div');b.id='mtbar';b.className='mtbar';b.setAttribute('role','toolbar');b.setAttribute('aria-label','Les agents des étages');
    const st=document.querySelector('.stage');if(!st)return;st.insertBefore(b,st.querySelector('.floorbar')||st.querySelector('.cv-wrap'));
    b.addEventListener('click',e=>{const a=e.target.closest('[data-mt]');if(a)mtOpen(byKey[a.dataset.mt]);});}
  const h=mtBarHtml();if(b.dataset.sig!==h)b.innerHTML=b.dataset.sig=h;
}
