// ---------- le 1er étage vu du RDC : fil, ⌘K, Qui fait quoi, chiffres du haut ----------
// L'atelier (68-atelier.js) ne se dessine qu'à l'étage ; le RDC en montre ce qu'il montre de ses propres agents : les
// moments de la chaîne dans le fil (events du dataset atelier, datés par les étapes des runs), ses tickets dans ⌘K, ses
// postes au travail et ses gates dans « Qui fait quoi », une tuile en haut de page. Tout mène à l'étage (atGoto).
const AT_GATE_TXT={gate_questions:'ce que j\'ai compris',gate_plan:'ton plan',gate_escalade:'escalade : la chaîne demande un humain',gate_pr:'relire la PR brouillon'};
// monter au 1er et ouvrir la fiche du ticket : son bureau, sinon son carton de l'entrepôt ou sa palette en panne
function atGoto(run){
  if(!atelierOn())return;
  if(!FLOOR)setFloor(1);
  const d=ATELIER||{};AT_PICK=null;ATSEL=null;
  if(atSlots().some(r=>r&&r.run===run))ATSEL=run;
  else if((d.queue||[]).some(x=>x.run===run))AT_PICK={kind:'queue',run};
  else if((d.pannes||[]).some(x=>x.run===run))AT_PICK={kind:'panne',run};
  SIDE_FOLDED=false;renderSide(true);
  const st=document.querySelector('.stage');if(st)st.scrollIntoView({behavior:SCROLL_BEHAVIOR,block:'start'});
}
const atBureau=run=>atSlots().findIndex(r=>r&&r.run===run)+1; // 0 : plus dans un bureau
// les moments de la chaîne : ceux du dataset ; la démo les tire de ses bureaux, de sa panne et de ses tickets sortis
function atEvents(){
  const d=ATELIER||{};
  if(Array.isArray(d.events))return d.events;
  return DEMO?atDemoEvents(d):[];
}
function atDemoEvents(d){
  const h=(iso,dh)=>new Date(ms(iso)+dh*36e5).toISOString(), at=x=>new Date(DAY0+x*36e5).toISOString(), out=[];
  for(const r of d.rooms||[]){const b={run:r.run,ticket:r.ticket,repo:r.repo,title:r.title};
    out.push({...b,t:r.since,k:'arrive'});
    if(r.gate)out.push({...b,t:h(r.since,.6),k:'gate',gate:r.gate});
    if(r.back)out.push({...b,t:h(r.since,.5),k:'gate',gate:'gate_plan'},{...b,t:h(r.since,1.4),k:'back'});}
  for(const p of d.pannes||[])out.push({run:p.run,ticket:p.ticket,repo:p.repo,title:p.title,t:h(p.since,-.8),k:'arrive'},{run:p.run,ticket:p.ticket,repo:p.repo,title:p.title,t:p.since,k:'panne',poste:p.poste});
  [['DM-7790','Fil d\'Ariane sur les pages vidéo',8.6],['DM-7801','Corriger le compteur de partages',9.9],['DM-7655','Lien canonique des pages AMP',10.6]]
    .slice(0,d.livres||0).forEach(([ticket,title,x],i)=>out.push({run:'demo-l'+i,ticket,repo:'dm/site',title,t:at(x),k:'sort'}));
  return out.sort((a,b)=>ms(a.t)-ms(b.t));
}
// ---------- fil de la journée (70-kpis-feed.js) ----------
function atFeedEvents(t){
  if(!atelierOn())return [];
  const out=[], live=atSlots();
  for(const e of atEvents()){const a=ms(e.t);if(!a||a<DAY0||a>t)continue;
    const b=atBureau(e.run), tk=`<b>${esc(e.ticket||'…')}</b>`, sub=[b?'bureau '+b:'',e.title?clip(e.title,60):''].filter(Boolean).map(esc).join(' · ');
    const r=live.find(x=>x&&x.run===e.run), q=r&&AT_POSTES.find(p=>(r.states||{})[p.k]==='bloq');
    const txt={arrive:`🎫 ${tk} arrive au 1er étage`,sort:`📦 ${tk} sort en PR <small>Bernard l'emporte</small>`,
      gate:`✋ ${tk} t'attend au 1er <small>« ${esc(AT_GATE_TXT[e.gate]||e.gate||'')} »</small>`,
      back:q?`🔒 ${esc(q.n)} bloque ${tk} : retour au code`:`🔒 Un contrôle bloque ${tk} : retour au code`,
      panne:`🧯 ${tk} : ${esc(atStepName(e.poste))} en panne`}[e.k];
    if(!txt)continue;
    out.push({t:a,at:e.run,ty:{arrive:'tickets',sort:'pr',gate:'toi'}[e.k]||'agents',team:e.k==='arrive'||e.k==='sort',
      txt:txt+(sub?` <small>${sub}</small>`:'')});
  }
  return out;
}
// « En ce moment » : un bureau dont la gate t'attend, depuis l'ouverture de la gate
function atFeedPins(t){
  if(!atelierOn())return [];
  const ev=atEvents();
  return atSlots().map((r,i)=>{if(!r||!r.gate)return null;
    const g=ev.filter(e=>e.run===r.run&&e.k==='gate'&&ms(e.t)<=t).pop(), a=g?ms(g.t):ms(r.since);if(!a||a>t)return null;
    return {t:a,at:r.run,txt:`✋ <b>${esc(r.ticket||'…')}</b> t'attend au 1er <small>« ${esc(AT_GATE_TXT[r.gate]||r.gate)} » · bureau ${i+1}</small> ${waitSince(a,t)}`};
  }).filter(Boolean);
}
// ---------- ⌘K (64-search.js) : bureaux (clé, titre, dépôt, poste en cours), entrepôt, pannes ----------
function atSearchRows(q){
  if(!atelierOn()||!ATELIER)return [];
  const out=[], row=(r,txt,hay)=>{if(srHit(q,[r.ticket,r.title,r.repo,hay].join(' ')))out.push({g:'1er étage',k:r.ticket||'…',txt,go:()=>atGoto(r.run)});};
  atSlots().forEach((r,i)=>{if(!r)return;const p=AT_POSTES.find(x=>x.k===r.poste), poste=r.gate?'✋ t\'attend':r.back?'🔒 retour au code':p?p.i+' '+p.n:'';
    const bloq=AT_POSTES.filter(x=>['bloq','err'].includes((r.states||{})[x.k])).map(x=>x.n).join(' '); // un poste trouve aussi les bureaux qu'il bloque
    row(r,`bureau ${i+1} · ${poste}${r.title?' · '+r.title:''}`,(p?p.n:'')+' '+poste+' '+bloq);});
  for(const x of ATELIER.queue||[])row(x,'entrepôt · attend un bureau libre','attente');
  for(const x of ATELIER.pannes||[])row(x,`🧯 en panne à ${atStepName(x.poste)}${x.title?' · '+x.title:''}`,'panne '+atStepName(x.poste));
  return out;
}
// ---------- Qui fait quoi (72-whoboard.js, 75-tv.js) : un poste au travail par bureau, ou la gate qui t'attend ----------
function atWhoRows(t){
  if(!atelierOn())return [];
  const ev=atEvents();
  return atSlots().map((r,i)=>{if(!r)return null;
    const p=AT_POSTES.find(x=>x.k===r.poste), g=r.gate&&ev.filter(e=>e.run===r.run&&e.k==='gate'&&ms(e.t)<=t).pop(), a=g?ms(g.t):ms(r.since);
    return {run:r.run,i,attn:!!r.gate,st:r.gate?'gate':r.back?'error':'work',ico:r.gate?'✋':r.back?'🔒':p?p.i:'🏭',
      name:r.gate?'T\'attend':r.back?'Retour au code':p?p.n:'Atelier',what:(r.ticket||'')+' '+(r.title||''),
      sub:r.gate?'« '+(AT_GATE_TXT[r.gate]||r.gate)+' »':r.note||r.lot||'',since:a&&a<=t?sinceTxt(t-a):''};
  }).filter(Boolean);
}
function atWhoHtml(t){
  const rows=atWhoRows(t);if(!rows.length)return '';
  return `<h3 class="who-sub">🏭 1er étage <span class="cnt">${rows.length}</span></h3><div class="who-grid">`+rows.map(x=>
    `<button class="wc${x.attn?' attn':''}" data-at-run="${esc(x.run)}" title="${esc([x.what,x.sub].filter(Boolean).join('\n'))}" style="--st:${ST_CSS[x.st]||'var(--idle)'};--tk:transparent">`+
    `<span class="wp ic" aria-hidden="true">${x.ico}</span><span class="wt"><span class="wn">${esc(x.name)}<span class="ws">bureau ${x.i+1}${x.since?' · '+esc(x.since):''}</span></span>`+
    `<span class="ww nt">${esc(x.what)}</span>${x.sub?`<span class="wsub">${esc(x.sub)}</span>`:''}</span></button>`).join('')+'</div>';
}
function atTvWhoHtml(t){
  const rows=atWhoRows(t);if(!rows.length)return '';
  return '<h2>1er étage</h2>'+rows.map(x=>`<div class="tw ag" style="--st:${ST_CSS[x.st]||'var(--idle)'}"><span class="wt"><span class="wn">${x.ico} ${esc(x.name)}<span class="ws">bureau ${x.i+1}${x.since?' · '+esc(x.since):''}</span></span>`+
    `<span class="ww nt">${esc(x.what)}</span>${x.sub?`<span class="wsub">${esc(x.sub)}</span>`:''}</span></div>`).join('');
}
// ---------- tuile du haut de page (70-kpis-feed.js) ----------
function atKpi(t){
  const d=ATELIER||{}, rooms=atRooms(), ev=atEvents();
  const out=Array.isArray(d.events)||DEMO?ev.filter(e=>e.k==='sort'&&ms(e.t)>=DAY0&&ms(e.t)<=t).length:atDelivered();
  return {rooms:rooms.length,wait:rooms.filter(r=>r.gate).length,out,queue:(d.queue||[]).length,pannes:(d.pannes||[]).length};
}
// une seule ligne sous le chiffre, comme « La prod aujourd'hui » : la tuile ne grandit pas le bandeau (le plan ne bouge pas) ;
// le texte entier au survol, la panne en bordure rouge
function atKpiHtml(a){
  const parts=[a.wait?`<span style="color:var(--warn)">✋ ${a.wait} ${a.wait>1?"t'attendent":"t'attend"}</span>`:'',a.pannes?`<span style="color:var(--err)">🧯 ${plural(a.pannes,'panne','pannes')}</span>`:'',
    `📦 ${a.out} ${a.out>1?'sortis':'sorti'} aujourd'hui`,a.queue?`⏳ ${a.queue} en file`:''].filter(Boolean);
  return `<section class="dash atelier click${a.pannes?' err':a.wait?' warn':''}" data-open="atelier" tabindex="0" role="button" title="${esc('Monter au 1er étage\n'+parts.map(p=>p.replace(/<[^>]+>/g,'')).join(' · '))}">`+
    `<h3>Le 1er étage</h3><div class="row"><div class="big">${a.rooms}<small>/4</small></div><div class="grow">${a.rooms>1?'bureaux occupés':'bureau occupé'}</div></div>`+
    `<div class="cap">${parts.join(' · ')}</div></section>`;
}
