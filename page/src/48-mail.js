// ---------- courrier (#30) : dataset mails, une boîte aux lettres par compte, fiche « Courrier » ----------
// Le cron « Le Bureau · courrier » (mail_snapshot.py) publie, par compte de mail.accounts, ses mails non lus utiles
// (expéditeur, objet, heure ; jamais le contenu), ses ignorés regroupés et ses expéditeurs inconnus. Les boîtes sont
// dehors, à droite du bureau du boss (ou à la case « mailbox » du plan) ; « ? » tant qu'aucune règle n'est posée.
let MAILS=null;
function readMails(src){
  try{
    if(!src||!src.datasets)return null;
    let d=src.datasets.mails;
    if(d&&d.current!==undefined)d=d.current;
    if(typeof d==='string')d=JSON.parse(d);
    return d&&Array.isArray(d.accounts)?d:null;
  }catch(e){return null;}
}
const MAIL_ICON={'mac-mail':'💼',imap:'🏠'};
const mailAccounts=()=>(MAILS&&MAILS.accounts||[]);
// badge d'un compte : nombre de mails utiles, « ? » sans règles (le nombre ne veut rien dire), « ! » compte en erreur
function mailBadge(a){return !a.ok?'!':MAILS.sorted?String(mailCount(a)):'?';}
// mails utiles déjà arrivés à l'instant affiché (rejeu) ; liste tronquée par le cron : le nombre du dataset
function mailCount(a){const u=a.useful||[];return u.length<(a.useful_n||0)?a.useful_n||0:u.filter(m=>!m.at||ms(m.at)<=T).length;}
// case de la première boîte : « mailbox » du plan, sinon la case de sol la plus proche à droite du bureau du boss, avec
// la place pour toutes les boîtes côte à côte, hors de son bureau (parquet, vitres, murs), des portes et du paillasson
function mailboxTile(){
  if(Array.isArray(LAYOUT.mailbox))return LAYOUT.mailbox;
  const d=LAYOUT.boss.desk[LAYOUT.boss.desk.length-1], n=Math.max(1,mailAccounts().length);
  const kind=(x,y)=>LAYOUT.legend[(LAYOUT.tiles[y]||'')[x]];
  const door=(x,y)=>(LAYOUT.doors||[]).some(([a,b])=>a===x&&(b===y||b===y-1));
  const free=(x,y)=>{for(let i=0;i<n;i++){const k=kind(x+i,y);if(!k||['wall','glass','wood','wc','mat','server'].includes(k)||door(x+i,y))return false;}return true;};
  for(const rows of [[d[1]+1,d[1]],[d[1]+2,d[1]+3]]) // les rangées du bureau d'abord, vers la droite ; puis en dessous
    for(let dist=1;dist<COLS;dist++)for(const y of rows)if(y>0&&y<ROWS-1&&free(d[0]+dist,y))return [d[0]+dist,y];
  return [d[0]+1,d[1]+1];
}
let MAIL_HITS=[];
function drawMailbox(bx,by,a){
  const col=a.color||'#1f3f8f', badge=mailBadge(a), up=a.ok&&mailCount(a)>0;
  R(ctx,bx+9,by+14,4,18,'#4a4a52');                                 // pied
  R(ctx,bx,by,22,16,col);R(ctx,bx+1,by+1,20,3,'rgba(255,255,255,.28)'); // caisson, reflet
  R(ctx,bx+4,by+7,14,2,'#0c1a3d');                                  // fente
  R(ctx,bx+22,by+2,2,9,'#6b6b6b');                                  // mât
  if(up)R(ctx,bx+24,by+2,6,4,'#d8342c');else R(ctx,bx+16,by+11,6,3,'#d8342c'); // drapeau levé : du courrier
  ctx.font='bold 11px sans-serif';const w=ctx.measureText(badge).width+8, bg=!a.ok?'#7a7f8a':badge==='?'?'#6b6f7a':up?'#d8342c':'#4a8a5a';
  R(ctx,bx+11-w/2,by-16,w,13,bg);R(ctx,bx+10,by-3,2,2,bg);
  ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(badge,bx+11,by-9);ctx.textAlign='start';ctx.textBaseline='alphabetic';
}
// les boîtes, côte à côte, triées en profondeur avec les meubles (FURN, 40-furniture.js)
const MAILBOXES={get y(){const t=mailboxTile();return (t[1]+1)*TS-2;},draw:()=>{
  MAIL_HITS=[];
  const acc=mailAccounts(); if(!acc.length)return;
  const [tx,ty]=mailboxTile();
  acc.forEach((a,i)=>{const bx=tx*TS+5+i*34, by=(ty+1)*TS-34;drawMailbox(bx,by,a);MAIL_HITS.push({x:bx-4,y:by-18,w:34,h:52,id:a.id});});
}};
function mailAt(mx,my){const h=MAIL_HITS.find(o=>mx>=o.x&&mx<=o.x+o.w&&my>=o.y&&my<=o.y+o.h);return h?h.id:null;}
function mailTip(id){
  const a=mailAccounts().find(x=>x.id===id); if(!a)return '';
  return 'Courrier · '+a.label+' : '+(!a.ok?'lecture en échec':!MAILS.sorted?a.unread+' non lus, pas encore triés':plural(a.useful_n||0,'mail utile','mails utiles')+' sur '+a.unread+' non lus');
}
// ---------- le facteur (invité commun on: « mail ») : il dépose le courrier aux boîtes, puis repart ----------
// Un passage à l'arrivée d'un mail utile, au plus un toutes les 30 min (les mails arrivés entre-temps attendent le
// suivant), aux heures du bureau (arrivés la nuit : au premier passage du matin). Tout se déduit de l'heure d'arrivée
// des mails : le rejeu le rejoue à l'identique.
const POST_EVERY=30*60e3, POST_STAY=2*60e3;
function postVisits(){
  const [h0,h1]=RHYTHM.office_hours||[8,20], visits=[];
  const arr=mailAccounts().filter(a=>a.ok).flatMap(a=>(a.useful||[]).map(m=>ms(m.at))).filter(Boolean).sort((x,y)=>x-y);
  for(const t of arr){
    const p=parisHM(t), m=p.h+p.m/60;
    if(m>=h1)continue; // le soir : rien ce jour-là (le cron reprend le lendemain)
    const at=m<h0?parisMidnight(t)+h0*36e5:t, last=visits[visits.length-1];
    if(last&&at<=last.s){last.n++;continue;}
    visits.push({s:last?Math.max(at,last.s+POST_EVERY):at,n:1});
  }
  return visits;
}
// à côté de la dernière boîte, tourné vers elles
function postSpot(){const [x,y]=mailboxTile();return [x+Math.max(1,mailAccounts().length),y,'left'];}
// règles du courrier en attente de validation (workflow « Le Bureau · règles du courrier ») : le facteur reste devant le
// bureau du boss tant que le gate n'est pas décidé
const RULES_WF='Le Bureau · règles du courrier';
// la gate des règles appartient au facteur, quel que soit l'ordre de calcul des états (sinon le boss la compte un instant
// en plus, comme une validation orpheline)
const postmanOwns=g=>g.wf_name===RULES_WF&&!!byKey.g_facteur&&mailAccounts().length>0;
function postmanState(c,t){
  if(!mailAccounts().length)return {st:'off',label:'Pas de courrier branché'};
  if(SCENE_DEMO&&SCENE_DEMO.flag==='post'&&t>=SCENE_DEMO.s&&t<SCENE_DEMO.s+POST_STAY) // 46-gallery.js : sa tournée jouée maintenant
    return {st:'idle',zone:'visit',visit:postSpot(),label:'Dépose 1 lettre dans les boîtes aux lettres',bubble:'📬 1'};
  const g=(GATES||[]).find(x=>x.wf_name===RULES_WF&&(!x.since||ms(x.since)<=t));
  if(g){c.wf=[String(g.wf).slice(0,8)]; // sa gate est la sienne (pas une validation orpheline) : sa carte dans sa fiche, comptée une fois chez le boss
    return {st:'gate',zone:'gate',run:{run:g.run,wf_name:g.wf_name,_s:ms(g.since)},label:'Te propose des règles pour trier ton courrier : attend ta validation',bubble:'✋ 📮 On trie ton courrier ?'};}
  const vs=postVisits().filter(v=>parisDay(v.s)===parisDay(t)), cur=vs.find(v=>t>=v.s&&t<v.s+POST_STAY), past=vs.filter(v=>v.s+POST_STAY<=t);
  if(cur)return {st:'idle',zone:'visit',visit:postSpot(),label:'Dépose '+plural(cur.n,'lettre','lettres')+' dans les boîtes aux lettres',bubble:'📬 '+cur.n};
  return past.length?{st:'gone',label:'Passé à '+hm(past[past.length-1].s)}:{st:'off',label:"Pas encore passé aujourd'hui"};
}
// ---------- porteurs (mail.messengers) : un invité remet en personne les mails d'une règle, jusqu'à leur lecture ----------
// Le cron sort ces mails du tri (carried, hors du compteur). L'invité de la règle (carrier = sa clé) vient devant le bureau
// du boss à leur arrivée (ou au créneau de la règle : {received: 'fri', deliver: 'mon 09:00'}) et y reste tant qu'ils
// ne sont pas lus dans la messagerie (ils disparaissent du dataset au relevé suivant, et l'invité repart).
const WD=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function carryStart(m){
  const t=ms(m.at); if(!t)return 0;
  const w=m.when;
  if(w&&typeof w==='object'&&w.received&&w.deliver&&parisHM(t).wd===w.received){
    const [dd,hh]=String(w.deliver).split(' '), [h,mi]=(hh||'09:00').split(':').map(Number), d=WD.findIndex(x=>x.toLowerCase()===String(dd).toLowerCase().slice(0,3));
    let day=parisMidnight(t)+864e5;
    for(let i=0;i<7&&d>=0&&parisHM(day+12*36e5).wd!==WD[d];i++)day+=864e5;
    return day+(h*60+(mi||0))*60e3;
  }
  const [h0]=RHYTHM.office_hours||[8,20], p=parisHM(t);
  return p.h<h0?parisMidnight(t)+h0*36e5:t;
}
function carriedFor(c,t){return carriedMails(t,c.key);}
function messengerState(c,t){
  const l=carriedFor(c,t); if(!l.length)return null;
  return {st:'gate',zone:'gate',label:'Te remet '+plural(l.length,'mail','mails')+' en personne ('+l[0].rule+') : attend que tu les lises',
    bubble:'✋ '+l[0].bubble+(l.length>1?' · '+l.length:'')};
}
// ---------- fiche « Courrier » : un compte par section (celui de la boîte cliquée en premier) ----------
function mailWhen(iso){
  if(!iso)return '';
  const t=ms(iso), d=parisDay(t);
  return d===parisDay(T)?hm(t):d===parisDay(T-864e5)?'hier '+hm(t):dtf('fr-FR',{weekday:'long',day:'numeric',month:'short'}).format(new Date(t))+' '+hm(t);
}
function mailRow(m,a){
  const href=safeMailUrl(m.open);
  return `<div class="ml-row" style="--c:${esc(a.color||'var(--accent)')}"><div class="ml-top"><b>${esc(m.name||m.addr||'?')}</b><span class="ml-t">${esc(mailWhen(m.at))}</span></div>`+
    `<div class="ml-s">${esc(m.subject||'(sans objet)')}</div><div class="ml-tags"><span class="ml-tag">${m.direct?'à toi':'en copie'}</span>`+
    (m.flagged?'<span class="ml-tag">🚩 suivi</span>':'')+(href?`<a class="ml-open" href="${esc(href)}" target="_blank" rel="noopener">Ouvrir ↗</a>`:'')+`</div></div>`;
}
// mails remis en personne (avec leur compte) déjà arrivés à t, d'un porteur (clé) ou de tous
function carriedMails(t,carrier){return mailAccounts().filter(a=>a.ok).flatMap(a=>(a.carried||[]).map(m=>({...m,acc:a}))).filter(m=>(!carrier||m.carrier===carrier)&&carryStart(m)<=t);}
// carte d'un mail remis en personne : fiche Courrier, fiche du porteur et fiche du boss ; il se lit dans la messagerie (« Ouvrir ↗ »)
function handHtml(m){
  const href=safeMailUrl(m.open);
  return `<div class="ml-hand" style="--c:${esc(m.acc.color||'var(--accent)')}"><div class="ml-top"><b>${esc(m.bubble)} · remis en personne · ${esc(m.acc.label)}</b><span class="ml-t">${esc(mailWhen(m.at))}</span></div>`+
    `<div class="ml-s">${esc(m.subject||'(sans objet)')}${m.name?' · '+esc(m.name):''}</div><div class="ml-tags"><span class="ml-tag ml-wait">attend ta lecture</span>`+
    (href?`<a class="ml-open" href="${esc(href)}" target="_blank" rel="noopener">Ouvrir ↗</a>`:'')+`</div></div>`;
}
function handCards(side,list){
  if(!list.length)return;
  const box=document.createElement('div');box.className='mailbox';box.innerHTML=list.map(handHtml).join('');side.appendChild(box);
}
// liens d'un mail : l'appli Mail (message:) ou le webmail en https ; rien d'autre
function safeMailUrl(u){return typeof u==='string'&&/^message:\/\//.test(u)?u:safeUrl(u);}
function renderMail(side,first){
  const h=document.createElement('h2');h.textContent='📬 Courrier';side.appendChild(h);
  const acc=mailAccounts().slice().sort((x,y)=>(x.id===first?-1:y.id===first?1:0));
  const box=document.createElement('div');box.className='mailbox';
  if(!acc.length){box.innerHTML='<p class="sub">Pas de compte : le courrier se branche à l\'installation.</p>';side.appendChild(box);return;}
  const n=acc.reduce((s,a)=>s+(a.ok?a.useful_n||0:0),0);
  let html=`<p class="sub">${MAILS.sorted?plural(n,'mail utile','mails utiles'):'Pas encore trié : le facteur viendra proposer tes règles'} · relevé à ${hm(ms(MAILS.generated_at))}${MAILS.demo?' (démo)':''}</p>`;
  html+=carriedMails(Infinity).map(handHtml).join(''); // remis en personne : en tête
  for(const a of acc){
    html+=`<section class="ml-acc" style="--c:${esc(a.color||'var(--accent)')}"><div class="ml-head"><b>${MAIL_ICON[a.provider]||'📬'} ${esc(a.label)}${a.ok?' · '+(MAILS.sorted?a.useful_n:'?'):''}</b>`+
      `<small>${a.provider==='imap'?'IMAP':'appli Mail'} · ${a.unread||0} non lus</small></div>`;
    if(!a.ok)html+=`<p class="ml-err">Lecture en échec : ${esc(a.error||'erreur inconnue')}</p>`;
    else if(a.show==='count')html+=`<p class="ml-hid">${plural(a.useful_n||0,'mail utile','mails utiles')}. Expéditeurs et objets masqués sur la page (compte en « nombre seul »).</p>`;
    else{
      html+=(a.useful||[]).map(m=>mailRow(m,a)).join('')||'<p class="sub">Rien d\'utile en attente.</p>';
      if((a.useful_n||0)>(a.useful||[]).length)html+=`<p class="sub">et ${a.useful_n-(a.useful||[]).length} de plus</p>`;
      if((a.ignored||[]).length)html+=`<p class="ml-ign">Ignorés : ${a.ignored.map(([k,v])=>esc(k)+' '+v).join(' · ')}</p>`;
    }
    html+='</section>';
  }
  html+=`<p class="sub">Jamais le contenu des mails, jamais sur l'écran mural.</p>`;
  box.innerHTML=html;side.appendChild(box);
  if(ACTIONS.mail_rules){ // le facteur repasse proposer des règles (workflow « règles du courrier »)
    const host=document.createElement('div');host.className='relaunch';host.setAttribute('data-kronn-action-slot-host','');
    host.innerHTML='<div class="rl-n">Règles du tri</div><div class="rl-s">Le facteur relit tes expéditeurs des 30 derniers jours et te propose quoi garder ou ignorer ; tu valides.</div>';
    const b=document.createElement('button');b.textContent='📮 Revoir mes règles';b.setAttribute('data-kronn-action','bureau-mailrules');
    host.appendChild(b);side.appendChild(host);kronnModal(host,b,'Règles du courrier');
  }
}
// démo (jeudi 1er octobre) : un compte de l'appli Mail et un Gmail par IMAP, mails fictifs
function mailDemo(){
  const at=h=>new Date(DAY0+h*36e5).toISOString();
  const m=(id,name,subject,h,direct=true)=>({id,name,addr:name.toLowerCase().replace(/\W+/g,'.')+'@exemple.example',subject,at:at(h),direct,flagged:false,open:null});
  return {generated_at:at(10.7),sorted:true,demo:true,accounts:[
    {id:'pro',label:'Pro',color:'#1f3f8f',show:'list',provider:'mac-mail',ok:true,unread:23,useful_n:3,ignored_n:20,unknown:2,
     useful:[m('d1','Jan Levinson','Budget du trimestre : il me faut tes chiffres avant vendredi',10.7),m('d2','David Wallace','Ma visite de jeudi : on cale 30 min ?',9.25),
       m('d3','Karen Filippelli','Recette DM-7089 : deux retours sur le panier',-5.7,false)],
     ignored:[['Jira',9],['GitHub',6],['Staples',3],['Google Agenda',2]]},
    {id:'perso',label:'Perso',color:'#2e7d4f',show:'list',provider:'imap',ok:true,unread:14,useful_n:2,ignored_n:12,unknown:1,
     useful:[m('d4','Banque Exemple',"Votre relevé d'octobre est disponible",8.05),m('d5','Marie','Ce week-end, on fait quoi ?',-2.3)],
     ignored:[['Amazon',5],['LinkedIn',4],['Deezer',3]]}]};
}
