// ---------- console Support (#62) : l'ordinateur du boss suit un canal Teams de demandes de support ----------
// Dataset support (cron « relevé du Support », support.py) : les fils des 7 derniers jours et leur état. Les runs du modèle
// d'investigation (variable message_id) et les gates en attente le précisent sans attendre le relevé suivant. L'écran du
// boss passe en alerte avec le nombre à traiter (nouveaux, à revoir, réponses à valider) ; l'infobulle au survol seulement ;
// un clic ouvre la console dans le panneau : un fil par carte, « Investiguer » (projet, puis commentaire dans la carte Kronn), la réponse
// proposée à valider (gate : valider, changements, refuser), la réponse postée. En mode TV : l'écran et l'agent, pas la console.
let SUPPORT=null;
function readSupport(src){try{const d=dsOf(src,'support');return d&&Array.isArray(d.threads)?d:null;}catch(e){return null;}}
// la console existe (alerte de l'écran du boss, agent Support), en mode TV compris ; elle ne s'ouvre pas en TV
const supportOn=()=>!!(CFG.support||SUPPORT);
const supportOpenable=()=>!TV&&supportOn();
const SP_TODO=new Set(['new','gate','failed','relaunched']);
// état d'un fil à l'heure de la page : la gate en attente et le dernier run du jour l'emportent sur le relevé
function spState(t){
  const g=t.run&&(GATES||[]).find(x=>x.run===t.run.run);
  if(g)return {k:'gate',g};
  const runs=((DATA&&DATA.runs)||[]).filter(r=>r.vars&&r.vars.message_id===t.id&&(!t.run||ms(r.start)>=ms(t.run.at)||r.run===t.run.run)&&ms(r.start)<=T);
  const r=runs.sort((a,b)=>ms(b.start)-ms(a.start))[0];
  if(r&&t.state!=='done'){
    if(r.status==='Running'||r.status==='Pending')return {k:'run',r};
    if(r.status==='WaitingApproval')return {k:'gate',r};
    if(r.status==='Failed')return {k:(r.steps||[]).some(s=>s.n==='gate')?'ignored':'failed',r};
  }
  return {k:t.state||'new'};
}
const spThreads=()=>((SUPPORT&&SUPPORT.threads)||[]).filter(t=>!t.at||ms(t.at)<=T);
const spTodo=()=>spThreads().filter(t=>SP_TODO.has(spState(t).k));
const spName=()=>(CFG.support&&CFG.support.name)||(SUPPORT&&SUPPORT.name)||'Support';
const spWho=n=>{n=String(n||'?');return n.includes(',')?n.split(',')[1].trim().split(' ')[0]:n.split(' ')[0];}; // « Nom, Prénom »
function spAgent(){const wf=((CFG.support||{}).wf||'').slice(0,8);return wf&&chars.find(c=>!c.person&&!c.visitor&&(c.wf||[]).includes(wf))||null;}
// l'agent Support (celui qui incarne le modèle) : en intervention tant qu'un fil attend (nouveau, à valider) ou qu'il
// travaille dessus ; sa bulle « 🚨 N à traiter » au repos, « 🧯 Feu éteint » dans les 3 min qui suivent une réponse postée
function supportHot(c){const s=c._st&&c._st.st;return c===spAgent()&&supportOn()&&(spTodo().length>0||s==='work'||s==='gate');}
function supportAgentState(c,s,t){
  if(!s||!supportOn()||c!==spAgent()||['work','gate','error'].includes(s.st))return s;
  const posted=spThreads().map(x=>x.mine&&ms(x.mine.at)).filter(a=>a&&a<=t&&t-a<3*60e3);
  const away=s.st==='off'||s.st==='absent', at=away?{st:'idle',zone:'desk'}:{}; // en alerte, il vient à son poste même sans run du jour
  if(posted.length)return {...s,...at,bubble:'🧯 Feu éteint',label:(away?'':s.label+' · ')+'Réponse postée en fil à '+hm(Math.max(...posted))};
  const n=spTodo().length; // comme l'écran du boss : nouveaux, à relancer, réponses à valider
  return n?{...s,...at,bubble:'🚨 '+n+' à traiter',label:(away?'':s.label+' · ')+plural(n,'fil','fils')+' du Support à traiter'}:s;
}
// l'écran du boss (bureau du boss, 40-furniture.js) : rouge qui clignote, « ! » et la pastille ; false = l'écran normal
function supportScreen(x,y,now){
  if(!supportOn())return false;
  const n=spTodo().length;if(!n)return false;
  const on=REDUCED_MOTION||Math.floor(now/600)%2;
  R(ctx,x,y,16,10,on?'#d1453b':'#a32f27');
  ctx.fillStyle='#fff';ctx.font='bold 9px ui-monospace,Menlo,monospace';ctx.textAlign='center';ctx.fillText('!',x+8,y+9);
  ctx.fillStyle='#d1453b';ctx.beginPath();ctx.arc(x+18,y-3,6.5,0,7);ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle='#fff';ctx.stroke();
  ctx.fillStyle='#fff';ctx.font='bold 9px sans-serif';ctx.fillText(n>9?'9+':String(n),x+18,y);ctx.textAlign='left';
  return true;
}
function supportRect(){const o=furnAt('boss_desk')||{dx:0,dy:0};return {x:21*TS-2+5+o.dx,y:9*TS-20-14+o.dy,w:28,h:16};}
function supportTip(){
  const l=spTodo().sort((a,b)=>ms(b.at)-ms(a.at)), last=l[0];
  return '💬 '+spName()+' : '+(l.length?l.length+' à traiter · dernier : '+spWho(last.from)+', '+spWhen(last.at):'rien à traiter')+' · clic : ouvrir';
}
const spWhen=a=>{const t=ms(a), d=parisDay(t);return d===parisDay(T)?hm(t):d===parisDay(T-864e5)?'hier '+hm(t):dtf('fr-FR',{weekday:'short',day:'numeric'}).format(new Date(t))+' '+hm(t);};
// réponse au format du fil : libellé de section en gras, une ligne vide entre les sections, puis la mention (comme support.py, html_of)
const spReply=s=>String(s||'').trim().split('\n').filter(x=>x.trim()).reduce((o,x)=>{const m=x.trim().match(/^(\W{1,4}\s*)([^:]{1,30}?)\s*:\s*(.*)$/);
  return o+(o?(m?'<br><br>':'<br>'):'')+(m?esc(m[1])+'<b>'+esc(m[2])+'</b> : '+esc(m[3]):esc(x));},'')+'<br><br>Généré de manière automatique 🤖';
// texte d'un message (support.py l'a déjà tiré du HTML) : échappé, retours à la ligne, adresses https en liens
const spText=s=>esc(String(s||'').trim()).replace(/https:\/\/[^\s<>"']+/g,u=>`<a href="${u}" target="_blank" rel="noopener">${u.length>70?u.slice(0,69)+'…':u}</a>`).replace(/\n/g,'<br>');
const SP_TAG={new:['Nouveau','var(--err)'],failed:['À relancer','var(--err)'],run:['🔎 Investigation en cours','var(--info)'],gate:['✋ Réponse à valider','var(--warn)'],
  done:['✓ Répondu en fil','var(--ok)'],resolved:['✅ Traité','var(--ok)'],answered:['Pris en charge','var(--info)'],relaunched:['↩ Relancé','var(--err)'],
  ignored:['Ignoré','var(--idle)']};
// réactions du message principal, regroupées (« custom » : un emoji de l'organisation, dont le nom n'arrive pas)
const spReacts=l=>{const n={};for(const r of l||[]){const k=r==='custom'?'🙂+':r;n[k]=(n[k]||0)+1;}
  return Object.entries(n).map(([k,v])=>`<span class="sp-r">${esc(k)}${v>1?' '+v:''}</span>`).join('');};
const spTeams=t=>safeUrl(t.url)?`<a class="sp-l" href="${esc(t.url)}" target="_blank" rel="noopener">${t.state==='done'?'voir dans Teams':'Ouvrir dans Teams'} ↗</a>`:'';
function spCard(t){
  const s=spState(t), st=s.k, tag=SP_TAG[st]||SP_TAG.new, a=spAgent(), disc=t.run&&t.run.disc;
  const el=document.createElement('div');el.className='sp-card sp-'+st;el.dataset.id=t.id;
  let h=`<div class="sp-top"><b>${esc(spWho(t.from))}</b><span class="sp-t">${esc(spWhen(t.at))}</span><span class="sp-tag" style="background:${tag[1]}">${tag[0]}</span></div>`+
    (t.subject?`<div class="sp-subj">${esc(t.subject)}</div>`:'')+`<div class="sp-txt">${spText(t.text)}</div>`+
    ((t.reactions||[]).length?`<div class="sp-rs">${spReacts(t.reactions)}</div>`:'');
  const dl=disc?' · '+discLink(disc,'discussion Kronn ↗'):'';
  if(st==='run')h+=`<div class="sp-s">${esc(a?a.name+' (Support)':'L\'agent Support')} investigue depuis ${esc(hm(ms((s.r&&s.r.start)||t.run.at)))}${dl}</div>`;
  if(st==='failed')h+=`<div class="sp-s">L'investigation de ${esc(hm(ms((s.r&&s.r.start)||t.run.at)))} s'est arrêtée en route${dl} : relance-la.</div>`;
  if(st==='gate'){
    const txt=(t.run&&t.run.draft)||(s.g&&s.g.message?String(s.g.message).split('\n\n---\n')[0]:'');
    h+=`<div class="sp-rep sp-w"><b>Réponse proposée</b>${t.run&&t.run.version?` <small>(version ${t.run.version})</small>`:''}<br>${spReply(txt)}</div>`;
  }
  if(st==='done'&&t.mine)h+=`<div class="sp-rep sp-o">${spReply(t.mine.text)}</div><div class="sp-s">Posté en fil à ${esc(spWhen(t.mine.at))} · ${spTeams(t)}</div>`;
  else if(st==='done')h+=`<div class="sp-s">Tu as répondu dans Teams · ${spTeams(t)}</div>`;
  if(st==='answered')h+=`<div class="sp-s">Pris par ${esc(spWho(t.by))} : il a répondu dans le fil · ${spTeams(t)}</div>`;
  if(st==='relaunched')h+=`<div class="sp-s">${esc(spWho(t.from))} a relancé après la réponse de ${esc(spWho(t.by))} · ${spTeams(t)}</div>`;
  if(st==='resolved')h+=`<div class="sp-s">Marqué ✅ traité dans Teams · ${spTeams(t)}</div>`;
  if(st==='ignored')h+=`<div class="sp-s">Réponse refusée : rien n'a été posté${dl}. Tu peux relancer une investigation.</div>`;
  el.innerHTML=h;
  if(st==='new'||st==='failed'||st==='relaunched'||st==='ignored')spInvestigate(el,t); // ignoré : réponse refusée, on peut réessayer
  if(st==='gate')spGate(el,t,s.g,dl);
  return el;
}
// « 🔎 Investiguer » : le projet choisi ici, le commentaire dans la carte Kronn (workflow du modèle support)
function spInvestigate(el,t){
  const host=document.createElement('div');host.className='sp-host';host.setAttribute('data-kronn-action-slot-host','');
  const row=document.createElement('div');row.className='sp-act';host.appendChild(row);
  const pr=DUCK_PROJECTS||[]; // dataset gates (39-duck.js) : projets Kronn, « Sans projet » en tête
  if(ACTIONS.support&&pr.length){
    const sel=document.createElement('select');sel.className='sp-pj';sel.dataset.fid='sp-pj:'+t.id;sel.setAttribute('aria-label','Projet à investiguer'); // gardé au redessin du panneau
    for(const p of pr){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;sel.appendChild(o);}
    const b=document.createElement('button');b.className='on';b.textContent='🔎 Investiguer';b.setAttribute('data-kronn-action','bureau-support');
    const bind=()=>b.setAttribute('data-kronn-bindings',JSON.stringify({message_id:t.id,project_id:sel.value}));
    sel.onchange=sel.oninput=bind;bind();
    const n=document.createElement('div');n.className='sp-s';
    new MutationObserver(()=>{const v=b.getAttribute('data-kronn-action-state');
      if(v==='succeeded')n.innerHTML='<b style="color:var(--ok)">✓ Lancé.</b> '+esc((spAgent()||{name:'L\'agent Support'}).name)+' ouvre sa discussion et se met au travail.';
      else if(v==='failed')n.innerHTML='<b style="color:var(--err)">Lancement refusé.</b> Détail dans la carte.';
    }).observe(b,{attributes:true,attributeFilter:['data-kronn-action-state']});
    const tm=spTeams(t);if(tm)row.insertAdjacentHTML('beforeend',tm);
    row.prepend(sel,b);kronnModal(host,b,'Investiguer : '+(t.subject||spWho(t.from)));el.append(host,n);return;
  }else if(ACTIONS.support)el.insertAdjacentHTML('beforeend','<div class="sp-s">Les projets arrivent au prochain passage du cron live (1 min au plus).</div>');
  el.insertAdjacentHTML('beforeend',spTeams(t));
}
// réponse à valider : les trois décisions de la gate (workflow « décision gate », lignes de gates.grows)
function spGate(el,t,g,dl){
  const host=document.createElement('div');host.className='sp-host';host.setAttribute('data-kronn-action-slot-host','');
  const row=document.createElement('div');row.className='sp-act';host.appendChild(row);
  const dk=g&&g.run+'|'+g.gate;
  if(dk&&DECIDED[dk]){el.insertAdjacentHTML('beforeend',`<div class="sp-s"><b style="color:var(--ok)">✓ Réponse envoyée à ${hm(DECIDED[dk])}.</b>${dl}</div>`);return;}
  for(const [d,label,cls] of [['approve','✅ Valider et poster en fil','on'],['request_changes','✏️ Demander des changements',''],['reject','✖ Refuser','']]){
    const b=document.createElement('button');b.textContent=label;if(cls)b.className=cls;
    if(g&&ACTIONS.gate){b.setAttribute('data-kronn-action','bureau-gate');const id=g.run+'|'+d;b.setAttribute('data-kronn-bindings',JSON.stringify({run_id:id,decision:id}));
      new MutationObserver(()=>{if(b.getAttribute('data-kronn-action-state')==='succeeded'&&!DECIDED[dk]){DECIDED[dk]=Date.now();saveDecided();}})
        .observe(b,{attributes:true,attributeFilter:['data-kronn-action-state']});}
    else{b.disabled=true;b.title=g?'Workflow « décision gate » non installé : décide dans Kronn':'La gate arrive sur la page d\'ici une minute (cron live)';}
    row.appendChild(b);if(g&&ACTIONS.gate)kronnModal(host,b,label.replace(/^\S+\s/,'')+' : réponse à '+spWho(t.from));
  }
  el.appendChild(host);
  el.insertAdjacentHTML('beforeend',`<div class="sp-s">« Changements » renvoie ton commentaire à ${esc((spAgent()||{name:'l\'agent'}).name)} dans la même discussion${dl}.</div>`);
}
// Kronn ouvre sa carte dans un bloc ajouté à la fin de l'ancêtre [data-kronn-action-slot-host] du bouton : cet ancêtre
// enveloppe donc la rangée (bloc pleine largeur), jamais une rangée flex, sinon la carte se range en colonne à côté
function spHead(panel){
  const n=spTodo().length, S=SUPPORT||{};
  const polled=S.polled_at?'Relevé à '+spWhen(S.polled_at)+(S.days?' · '+S.days+' derniers jours':'')+(S.cost?' · '+String(S.cost).replace('.',',')+' $':''):'Pas encore relevé';
  return `<div class="bp-head sp-head"><h2>💬 ${esc(spName())}</h2><span class="sp-pill${n?' sp-hot':''}">${n?n+' à traiter':'rien à traiter'}</span>`+
    (panel?'':`<button type="button" class="bp-x" aria-label="Fermer">×</button>`)+'</div>'+
    `<div class="sp-bar"><span class="sp-s">${esc(polled)}${S.demo?' (démo)':''}</span></div>`+ // relever maintenant : « ↻ » du panneau Fraîcheur
    (S.error?`<p class="sp-err">Dernier relevé en échec : ${esc(S.error)}</p>`:'');
}
// la console : dans le panneau de droite, comme la boîte aux lettres (les cartes Kronn s'ouvrent en fenêtre, 55-actions.js)
function openSupport(){if(supportOpenable())select('support');}
function renderSupport(side){const box=document.createElement('div');box.className='sp-side';side.appendChild(box);spFill(box,true);}
function spFill(box,panel){
  box.innerHTML=spHead(panel);
  const l=spThreads().sort((a,b)=>ms(b.at)-ms(a.at));
  for(const t of l)box.appendChild(spCard(t));
  if(!l.length){const S=SUPPORT||{};box.insertAdjacentHTML('beforeend',`<div class="sp-empty"><div class="sp-e-ico">${S.polled_at?'🧯':'📡'}</div><b>${S.polled_at?'Rien à signaler':'Pas encore de relevé'}</b>`+
    `<span>${S.polled_at?'Aucun message sur '+esc(spName())+' ces '+(S.days||7)+' derniers jours.':'Le premier relevé arrive dans les 15 minutes, ou tout de suite avec « ↻ » sur sa ligne de Fraîcheur des données.'}</span></div>`);}
  box.insertAdjacentHTML('beforeend',`<p class="sp-note">« Investiguer » ouvre une discussion Kronn avec ${esc((spAgent()||{name:'l\'agent Support'}).name)} ; sa réponse revient ici à valider, puis part en fil sous ton nom.</p>`);
}
// fiche de l'agent Support : le nombre à traiter, les deux derniers fils, et la console (on y investigue : projet choisi
// dans la liste, commentaire dans la carte Kronn)
function spFiche(side){
  const l=spTodo().sort((a,b)=>ms(b.at)-ms(a.at)), box=document.createElement('div');box.className='relaunch sp-fiche';
  box.innerHTML=`<div class="rl-n">🚒 ${esc(spName())} · ${l.length?l.length+' à traiter':'rien à traiter'}</div>`+
    l.slice(0,2).map(t=>{const s=t.subject||String(t.text||'').split('\n')[0].slice(0,70);
      return `<div class="rl-s sp-t" title="${esc(s)}">${esc(spWho(t.from))}, ${esc(spWhen(t.at))} : ${esc(s)}</div>`;}).join('')+
    `<div class="rl-s">On investigue depuis la console (projet, puis commentaire).</div>`;
  const b=document.createElement('button');b.className='on';b.textContent='💬 Ouvrir la console Support';b.onclick=()=>openSupport();
  box.appendChild(b);side.appendChild(box);
}
// la console ouverte suit les données (le panneau ne se redessine pas pendant une carte Kronn ou une saisie)
function spRefresh(){if(sel==='support')renderSide();}
// mode TV, « EN DIRECT » (75-tv.js) : l'arrivée d'un message du jour, puis un rappel par heure d'attente tant que personne
// ne l'a pris (nouveau, relancé) ; jamais le texte, seulement le prénom et le sujet (ou le début du message)
function spTicker(){
  if(!supportOn())return [];
  const out=[], H=36e5;
  for(const t of spThreads()){
    const k=spState(t).k, at=ms(t.at); if(!at||!['new','relaunched'].includes(k))continue;
    const what=t.subject||String(t.text||'').split('\n')[0].slice(0,60), who=spWho(t.from);
    if(parisDay(at)===parisDay(T))out.push({t:at,tx:`🚒 Support : nouveau message de ${who}, « ${what} »`});
    const n=Math.floor((T-at)/H);
    if(n>=1)out.push({t:at+n*H,tx:`🚒 Support : le message de ${who} attend depuis ${n} h, « ${what} »`});
  }
  return out;
}
// démo (jeudi 1er octobre) : un fil par état, demandes fictives
function supportDemo(){
  const at=h=>new Date(DAY0+h*36e5).toISOString(), u='https://teams.example/demo';
  const t=(id,from,h,text,state,extra)=>({id,from,at:at(h),text,url:u,cut:false,replies:0,last_at:at(h),state,by:null,mine:null,run:null,...extra});
  return {generated_at:at(10.9),polled_at:at(10.9),name:'Support Scranton',ok:true,error:null,cost:0.005,days:7,demo:true,threads:[
    t('d1','Bernard, Andy',10.7,"Depuis hier 15h, les fiches produit du catalogue partenaire renvoient une 404. Celles d'avant 15h marchent toujours.",'new',{subject:'Catalogue partenaire : fiches produit en 404'}),
    t('d2','Beesly, Pam',10.33,"Sur la page des promotions, la vidéo jouée n'est pas la bonne alors que le lien est bien dans le CMS.",'run',{run:{run:'demo-r2',status:'Running',at:at(10.52),disc:null,version:0}}),
    t('d3','Philbin, Darryl',9.08,'Le flux RSS des commandes est vide depuis ce matin.','gate',{run:{run:'demo-r3',status:'WaitingApproval',at:at(9.2),disc:null,version:2,
      draft:"🔎 Cause : le cron du flux RSS a échoué à 8h (délai dépassé sur l'API des commandes).\n🛠️ Action : relancé à 9h20, le flux est de nouveau rempli.\n👀 Suivi : on surveille le passage de 10h."}}),
    t('d4','Lewis, Gabe',8.2,'404 sur la page « nouveautés » du site de Scranton.','done',{mine:{at:at(9.23),text:"🔎 Cause : la route des nouveautés manquait après la mise en prod 17.107.0.\n✅ Correctif : rétablie en 17.107.1, en prod à 9h05."}}),
    t('d5','Flax, Holly',-6.5,'Les exports CSV du stock sont-ils toujours envoyés le vendredi ?','answered',{by:'Halpert, Jim',replies:2,reactions:['👀']}),
    t('d6','Philbin, Darryl',-8,"L'imprimante du 2e étage n'apparaît plus dans la liste.",'resolved',{replies:3,reactions:['✅','👍','👍']})]};
}
