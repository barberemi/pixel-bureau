// ---------- fenêtre centrée pour les cartes d'action Kronn ----------
// Kronn ouvre sa carte dans l'ancêtre [data-kronn-action-slot-host] du bouton cliqué : au clic, on fait de cet
// ancêtre une fenêtre centrée (fond assombri). Quand Kronn retire son emplacement (× / Annuler), on referme.
// Tout bouton data-kronn-action placé dans un slot-host passé à kronnModal() en profite.
let KM_OPEN=null;
function kronnModal(host,btn,title){
  btn.addEventListener('click',()=>{ // après le pont Kronn (capture) : on ne bloque pas son clic
    if(KM_OPEN)return; KM_OPEN=host;
    const ph=document.createElement('div');
    ph.className='km-ph';
    ph.style.height=host.offsetHeight+'px';
    host.before(ph); // garde la place dans le panneau
    const bd=document.createElement('div');
    bd.className='km-backdrop';
    (host.closest('.side')||document.body).appendChild(bd);
    document.body.classList.add('km-on');
    // clic sur le fond : la page ne peut pas fermer la carte Kronn, mais Kronn la ferme quand on reclique son bouton ;
    // on relaie donc le vrai clic de l'utilisateur au bouton (l'activation utilisateur est encore valable)
    bd.title='Fermer';bd.addEventListener('click',()=>{if(had)btn.click();});
    host.classList.add('kmodal');
    if(title&&!host.querySelector('.km-title')){const t=document.createElement('div');t.className='km-title';t.textContent=title;host.prepend(t);}
    let had=false;
    const close=()=>{
      obs.disconnect();
      clearTimeout(t0);
      clearTimeout(gone);
      host.classList.remove('kmodal');
      bd.remove();
      document.body.classList.remove('km-on');
      ph.remove();
      const tt=host.querySelector('.km-title');
      if(tt)tt.remove();
      KM_OPEN=null;
      renderSide(!!EDIT);
    };
    // Kronn retire et recrée parfois son emplacement (redimensionnement) : on ne referme que s'il reste absent
    let gone=null;
    const obs=new MutationObserver(()=>{const slot=host.querySelector('[data-kronn-action-slot]');
      if(slot){had=true;clearTimeout(gone);gone=null;}
      else if(had&&!gone)gone=setTimeout(()=>{if(!host.querySelector('[data-kronn-action-slot]'))close();gone=null;},600);});
    obs.observe(host,{childList:true,subtree:true});
    // hors de Kronn (page ouverte seule), aucune carte ne vient : on referme
    const t0=setTimeout(()=>{
      if(!had){
        close();
        const n=document.createElement('div');
        n.className='note';
        n.textContent="La carte Kronn ne s'est pas ouverte : ouvre Le Bureau depuis Kronn.";
        host.appendChild(n);
      }
    },4000);
  });
}
// gates déjà décidées depuis ce navigateur (run|étape -> heure) : plus de bouton une fois la réponse donnée.
// Kronn refuse de toute façon une 2e décision (le run n'attend plus) ; ceci évite juste de la proposer.
let DECIDED={};try{DECIDED=JSON.parse(localStorage.getItem('bureau:decided')||'{}')||{};}catch(e){DECIDED={};}
for(const k in DECIDED)if(Date.now()-DECIDED[k]>864e5)delete DECIDED[k];
const saveDecided=()=>{try{localStorage.setItem('bureau:decided',JSON.stringify(DECIDED));}catch(e){}};
// validations des workflows sans personnage sur le plan (ex. « Le Bureau · plan ») : comptées dans la bulle ✋ du boss,
// leur carte de décision dans sa fiche
// mise en prod d'un run : son projet (nom court du dépôt) et son ticket, pour les libellés
const mepProject=r=>{const v=r.vars||{},p=String(v.project||'').split('/').pop();return [p,v.jira_ticket_key].filter(Boolean).join(' ')||clean(r.wf_name);};
// validations qu'attend un personnage : tous ses runs en attente (deux MEP de projets différents en même temps), pas
// seulement celui de son état ; un porteur de mail (gate sans run) compte pour une
function gateRunsOf(c){
  const s=c._st;if(!s)return [];
  const rs=(c.runs||[]).filter(r=>r.status==='WaitingApproval'&&r._s<=T&&T<r._ve);
  if(s.st==='gate'&&s.run&&!rs.includes(s.run))rs.unshift(s.run);
  return rs.length?rs:s.st==='gate'?[null]:[];
}
const gateTotal=()=>chars.reduce((a,c)=>a+gateRunsOf(c).length,0)+loneGates().length;
function loneGates(){return GATES.filter(g=>!postmanOwns(g)&&!chars.some(c=>c.wf&&c.wf.includes(String(g.wf).slice(0,8))));} // postmanOwns : 48-mail.js
// gate d'un workflow sans personnage : sa carte de décision seule dans le panneau
function renderLoneGate(side,run){
  const g=GATES.find(x=>x.run===run);
  if(!g){const n=document.createElement('div');n.className='note';n.textContent='Cette validation n\'attend plus (déjà décidée).';side.appendChild(n);return;}
  gateCard(side,{run:g.run,wf_name:g.wf_name,_s:ms(g.since)},null);
}
// carte de décision d'une gate : trois boutons directs (approuver, rejeter, changements, #45), chacun lié à sa ligne de
// gates.grows ; chacun ouvre la carte Kronn (workflow « Le Bureau · décision gate ») pour un commentaire et Lancer
function gateCard(parent,run,who){
  const g=GATES.find(x=>x.run===run.run);
  const box=document.createElement('div');box.className='gatecard';
  const since=g&&g.since?ms(g.since):run._s, mins=Math.max(0,Math.round((T-since)/60e3)); // à l'heure de la page (rejeu compris)
  box.innerHTML=`<div class="gt">✋ Validation demandée${who?' · '+esc(who):''}</div><div class="gw">${esc(clean(run.wf_name))}${g?' · étape <b>'+esc(g.gate)+'</b>':''}</div>`+
    (g&&g.message?`<div class="gm">${esc(g.message)}</div>`:'')+`<div class="gs">En attente depuis ${hm(since)}${mins?' ('+fmtDur(mins*60e3)+')':''}</div>`;
  const dk=g?g.run+'|'+g.gate:null;
  if(g&&DECIDED[dk]){
    const n=document.createElement('div');
    n.className='note';
    n.style.margin='8px 0 0';
    n.innerHTML='<b style="color:var(--ok)">✓ Réponse envoyée à '+hm(DECIDED[dk])+'.</b> L\'agent reprend d\'ici une minute sur le plan.';
    box.appendChild(n);
  }
  else if(g&&!ACTIONS.gate){
    const n=document.createElement('div');
    n.className='note';
    n.style.margin='6px 0 0';
    n.textContent='La décision se prend dans Kronn (workflow « décision gate » non installé).';
    box.appendChild(n);
  }
  else if(g){
    const st=document.createElement('div');
    st.className='note';
    st.style.margin='6px 0 0';
    st.textContent='Le bouton ouvre la carte Kronn : un commentaire si tu veux (obligatoire pour des changements), puis Lancer.';
    const row=document.createElement('div');row.className='gq';
    // un emplacement par bouton (comme les réponses aux questions) : la fenêtre centrée montre la décision choisie
    for(const [d,label,cls] of [['approve','✅ Approuver','on'],['reject','⛔ Rejeter',''],['request_changes','✏️ Changements…','']]){
      const w=document.createElement('div');w.className='qslot';w.setAttribute('data-kronn-action-slot-host','');
      const b=document.createElement('button');b.textContent=label;if(cls)b.className=cls;
      const qk=document.createElement('div');qk.className='qkm';qk.innerHTML=`<b>${esc(clean(run.wf_name))}${g.gate?' · étape '+esc(g.gate):''}</b><div>Ta décision : ${label}</div>`;
      w.append(b,qk);
      let clicked=false;
      b.addEventListener('click',()=>{clicked=true;});
      b.setAttribute('data-kronn-action','bureau-gate');
      const row_id=g.run+'|'+d; // ligne de gates.grows : Kronn y relit run_id et decision
      b.setAttribute('data-kronn-bindings',JSON.stringify({run_id:row_id,decision:row_id}));
      new MutationObserver(()=>{
        const v=b.getAttribute('data-kronn-action-state');
        if(v==='succeeded'){
          st.innerHTML='<b style="color:var(--ok)">✓ Décision appliquée.</b> L\'agent reprend d\'ici une minute sur le plan.';
          if(clicked&&!DECIDED[dk]){DECIDED[dk]=Date.now();saveDecided();}
        }else if(v==='failed')st.innerHTML='<b style="color:var(--err)">Décision refusée par Kronn</b> (gate déjà décidée ?). Détail dans la carte.';
      }).observe(b,{attributes:true,attributeFilter:['data-kronn-action-state']});
      kronnModal(w,b,'Décision de gate');row.appendChild(w);
    }
    box.append(row,st);}
  else{
    const n=document.createElement('div');
    n.className='note';
    n.style.margin='6px 0 0';
    n.textContent="La gate arrive sur la page d'ici une minute (cron live), le bouton apparaîtra alors.";
    box.appendChild(n);
  }
  parent.appendChild(box);
}
// questions de discussion déjà répondues depuis ce navigateur (id -> heure) : plus de boutons une fois la réponse partie
let ANSWERED={};try{ANSWERED=JSON.parse(localStorage.getItem('bureau:answered')||'{}')||{};}catch(e){ANSWERED={};}
for(const k in ANSWERED)if(Date.now()-ANSWERED[k]>864e5)delete ANSWERED[k];
const saveAnswered=()=>{try{localStorage.setItem('bureau:answered',JSON.stringify(ANSWERED));}catch(e){}};
// « depuis 10:42 (20 min) », « depuis hier 16:10 (19 h) », « depuis le 28/09 (3 j) » : à l'heure de la page (rejeu compris)
function qWaitTxt(s,t){
  const d=Math.max(0,t-s), dur=d<3600e3?Math.round(d/60e3)+' min':d<864e5?Math.floor(d/3600e3)+' h':Math.floor(d/864e5)+' j';
  const days=Math.round((parisMidnight(t)-parisMidnight(s))/864e5);
  const when=days<=0?hm(s):days===1?'hier '+hm(s):'le '+dtf('fr-FR',{day:'2-digit',month:'2-digit'}).format(new Date(s));
  return 'depuis '+when+(d>=60e3?' ('+dur+')':'');
}
// qui pose la question : le visiteur de la discussion, sinon le canard ou l'agent interrogé (discussions du Bureau)
function askerOf(q){const v=chars.find(c=>c.visitor&&c.disc&&c.disc.id===q.disc);
  return v?v.name:String(q.title||'').startsWith('🦆')?'🦆 Le canard':(q.agent||'Agent').replace('Code',' Code');}
// carte d'une question de discussion : un bouton par option (question simple) ou par option pour tout le formulaire,
// réponse libre, refus ; chaque bouton ouvre la carte Kronn (workflow « Le Bureau · réponse à une question »)
function questionCard(parent,q,who){
  const box=document.createElement('div');box.className='gatecard qcard'; // chaque bouton a son propre emplacement (btn ci-dessous)
  const since=ms(q.since)||T, form=q.items&&q.items.length>0;
  box.innerHTML=`<div class="gt">❓ Question${who?' · '+esc(who):''}</div><div class="gw">${esc(clean(q.title).replace(/\s+/g,' ').slice(0,90))}</div>`+
    `<div class="gm"><b>${esc(q.question)}</b></div>`+(q.context?`<div class="gs">${esc(q.context)}</div>`:'')+
    (form?`<ul class="qitems">${q.items.slice(0,8).map(i=>`<li>${esc(i.label)}</li>`).join('')}${q.items.length>8||q.more_items?`<li class="k">et ${q.items.length-8>0?q.items.length-8:'d\'autres'} de plus</li>`:''}</ul>`:'')+
    `<div class="gs">En attente ${qWaitTxt(since,T)}</div>`;
  const note=(html,mt)=>{const n=document.createElement('div');n.className='note';n.style.margin=(mt||6)+'px 0 0';n.innerHTML=html;box.appendChild(n);return n;};
  const link=discLink(q.disc,'Ouvrir la discussion');
  if(ANSWERED[q.id]){note('<b style="color:var(--ok)">✓ Réponse envoyée à '+hm(ANSWERED[q.id])+'.</b> L\'agent reprend la discussion. '+link,8);parent.appendChild(box);return;}
  if(!ACTIONS.answer){note('La réponse se donne dans Kronn (workflow « réponse à une question » non installé). '+link);parent.appendChild(box);return;}
  const opts=document.createElement('div');opts.className='qopts';
  const st=document.createElement('div');st.className='note';st.style.margin='6px 0 0';
  // un emplacement par bouton : la fenêtre centrée ne montre que l'option choisie et la carte Kronn juste dessous
  // (un emplacement commun mettait toute la carte en fenêtre, et recliquer l'option refermait la carte Kronn)
  const btn=(label,pick,cls,title)=>{
    const w=document.createElement('div');w.className='qslot';w.setAttribute('data-kronn-action-slot-host','');
    const b=document.createElement('button');b.innerHTML=label;if(cls)b.className=cls;
    const qk=document.createElement('div');qk.className='qkm';qk.innerHTML=`<b>${esc(q.question)}</b><div>Ta réponse : ${label}</div>`; // visible dans la fenêtre seulement
    w.append(b,qk);
    let clicked=false;b.addEventListener('click',()=>{clicked=true;});
    b.setAttribute('data-kronn-action','bureau-answer');
    b.setAttribute('data-kronn-bindings',JSON.stringify({choice:q.id+'|'+pick})); // ligne de gates.qrows, relue par Kronn
    new MutationObserver(()=>{
      const v=b.getAttribute('data-kronn-action-state');
      if(v==='succeeded'){st.innerHTML='<b style="color:var(--ok)">✓ Réponse envoyée.</b> L\'agent reprend la discussion.';if(clicked&&!ANSWERED[q.id]){ANSWERED[q.id]=Date.now();saveAnswered();}}
      else if(v==='failed')st.innerHTML='<b style="color:var(--err)">Réponse refusée par Kronn</b> (déjà répondue ?). Détail dans la carte.';
    }).observe(b,{attributes:true,attributeFilter:['data-kronn-action-state']});
    kronnModal(w,b,title);return w;};
  for(const o of q.options||[]){
    const rec=(q.rec||[]).includes(o.id), lbl=(form?'Tout : ':'')+(rec?'★ ':'')+esc(o.label)+(o.desc?` <span class="qd">· ${esc(o.desc)}</span>`:'');
    opts.appendChild(btn(lbl,(form?'all:':'')+o.id,rec?'on':'',form?'Même réponse pour tout le formulaire':'Réponse à la question'));}
  const row=document.createElement('div');row.className='qrow';
  if(!form)row.appendChild(btn('✏️ Autre réponse…','_text','','Réponse libre'));
  row.appendChild(btn('⛔ Refuser…','_decline','','Refuser la question'));
  opts.appendChild(row);box.appendChild(opts);
  st.innerHTML=(form?'Une réponse différente selon les items : dans Kronn. ':'Le bouton ouvre la carte Kronn : commentaire facultatif, puis Lancer. ')+link;
  box.appendChild(st);
  parent.appendChild(box);
}
// ---------- fiche de paie ----------
// tokens réels (runs de premier niveau) ; coût ESTIMÉ au tarif moyen que Kronn mesure sur les discussions
function payFor(c){
  if(!PAYROLL||!c||!c.wf||!c.wf.length)return null;
  const rows=PAYROLL.agents.filter(a=>c.wf.includes(String(a.wf).slice(0,8)));if(!rows.length)return null;
  const z=()=>({tok:0,runs:0,fail:0}), add=(o,k)=>rows.forEach(a=>{o.tok+=a[k].tok;o.runs+=a[k].runs;o.fail+=a[k].fail;});
  const today=z(),week=z();add(today,'today');add(week,'week');
  return {today,week,days:[0,1,2,3,4,5,6].map(i=>rows.reduce((s,a)=>s+(a.days[i]||0),0)),names:rows.map(a=>a.name)};
}
const usd=t=>PAYROLL&&PAYROLL.rate_usd_per_mtok?t*PAYROLL.rate_usd_per_mtok/1e6:null;
const fmtUsd=v=>v==null?'':v<0.01&&v>0?'< 0,01 $':'≈ '+v.toFixed(v<10?2:0).replace('.',',')+' $';
const DOW=['D','L','M','M','J','V','S'];
function sparkDays(days){
  const mx=Math.max(1,...days), labels=(PAYROLL.days||[]).map(d=>DOW[new Date(d+'T12:00:00').getDay()]);
  return `<span class="spark" title="Tokens par jour, du plus ancien à aujourd'hui">${days.map((v,i)=>`<i style="height:${v?Math.max(2,Math.round(v/mx*22)):1}px" title="${labels[i]||''} : ${fmtTok(v)} tokens"></i>`).join('')}</span>`;
}
// relancer un workflow depuis la fiche de son agent (page action « bureau-relaunch »)
// interroger un agent sur ses runs (page action « bureau-ask » : Quick Prompt en lecture seule, ~quelques k tokens)
function askBlock(side,c){
  if(!ACTIONS.ask)return;
  if(!c.wf||!c.wf.length)return;
  const list=ASKABLE.filter(w=>c.wf.includes(String(w.wf).slice(0,8)));if(!list.length)return;
  const box=foldSection(side,'ask','💬 Lui poser une question',null,true);
  for(const w of list){
    const host=document.createElement('div');host.className='relaunch';host.setAttribute('data-kronn-action-slot-host','');
    host.innerHTML=`<div class="rl-n">${esc(clean(w.name))}</div><div class="rl-s">Un agent IA lit ses runs et te répond (lecture seule, quelques centimes)</div>`;
    const b=document.createElement('button');
    b.textContent='💬 Demander';
    b.setAttribute('data-kronn-action','bureau-ask');
    b.setAttribute('data-kronn-bindings',JSON.stringify({wf_id:w.wf}));
    host.appendChild(b);kronnModal(host,b,'Poser une question à '+c.name);box.appendChild(host);
  }
}
// bouton « ↻ » d'un workflow relançable (ligne de gates.workflows) : page action « bureau-relaunch », sans rien à saisir
// (params lié à la colonne vide de la ligne, comme wf_id) ; « En cours… » tant qu'un run de ce workflow tourne
function relaunchBtn(host,w,c,label,note){
  const busy=c.runs.some(r=>String(r.wf).startsWith(String(w.wf).slice(0,8))&&['Running','Pending','WaitingApproval'].includes(r.status)&&r._s<=T);
  const b=document.createElement('button');b.textContent=busy?'En cours…':label;b.disabled=busy;
  if(busy){host.appendChild(b);return;}
  b.setAttribute('data-kronn-action','bureau-relaunch');b.setAttribute('data-kronn-bindings',JSON.stringify({wf_id:w.wf,params:w.wf}));
  const n=document.createElement('div');n.className='note';n.style.margin='6px 0 0';n.textContent=note;
  new MutationObserver(()=>{
    const v=b.getAttribute('data-kronn-action-state');
    if(v==='succeeded')n.innerHTML='<b style="color:var(--ok)">✓ Relancé.</b> L\'agent se met au travail d\'ici une minute sur le plan.';else if(v==='failed')n.innerHTML='<b style="color:var(--err)">Relance refusée</b> (déjà en cours ?). Détail dans la carte.';
  }).observe(b,{attributes:true,attributeFilter:['data-kronn-action-state']});
  host.append(b,n);kronnModal(host,b,'Relancer un workflow');
}
const lastRun=(c,w)=>c.top&&c.top.filter(r=>String(r.wf).startsWith(String(w.wf).slice(0,8))&&r._s<=T).slice(-1)[0];
// agent cron : « ⏰ Son programme », un bloc par cron (programme en clair, anneau jusqu'au prochain passage, dernier run)
// et « ↻ Passer maintenant » s'il est relançable ; ses crons ne reviennent pas dans « Relancer »
function programmeBlock(side,c){
  const list=cronsOf(c);if(!list.length)return;
  const box=foldSection(side,'programme','⏰ Son programme',null,true);
  for(const x of list){
    const nx=cronNext(x.schedule,T), pv=cronPrev(x.schedule,T), last=lastRun(c,x);
    const frac=nx&&pv?(T-pv)/(nx-pv):0;
    const host=document.createElement('div');host.className='relaunch rl-cron';host.setAttribute('data-kronn-action-slot-host','');
    host.innerHTML=`<div class="rl-n">${esc(clean(x.name))}</div><div class="cronbox"><span class="ring">${freshRing(frac,28)}</span><div><b>${esc(cronText(x.schedule,T))}</b><small>`+
      (nx!=null?'Prochain passage '+whenTxt(nx,T,1)+' ('+inTxt(nx-T)+')':'Pas de passage cette semaine')+(last?' · dernier à '+hhm(last._s)+' : '+esc((STATUS_TXT[last.status]||last.status).toLowerCase()):'')+'</small></div></div>';
    const w=ACTIONS.relaunch&&!TV&&RELAUNCH.find(r=>r.wf===x.wf&&!r.bureau);
    if(w)relaunchBtn(host,w,c,'↻ Passer maintenant','Rien à remplir : un passage en plus, tout de suite. Son programme ne change pas.');
    box.appendChild(host);
  }
}
function relaunchBlock(side,c){
  if(!ACTIONS.relaunch)return;
  if(!c.wf||!c.wf.length)return;
  const crons=cronsOf(c).map(x=>x.wf);
  const list=RELAUNCH.filter(w=>c.wf.includes(String(w.wf).slice(0,8))&&!crons.includes(w.wf));if(!list.length)return;
  const box=foldSection(side,'relance','Relancer',list.length,true);
  for(const w of list){
    const host=document.createElement('div');host.className='relaunch';host.setAttribute('data-kronn-action-slot-host','');
    const last=lastRun(c,w);
    host.innerHTML=`<div class="rl-n">${esc(clean(w.name))}</div><div class="rl-s">${w.trigger==='cron'?'Cron':'Manuel'}${last?' · dernier run '+hm(last._s)+' : '+esc(STATUS_TXT[last.status]||last.status):' · pas encore lancé aujourd’hui'}</div>`;
    relaunchBtn(host,w,c,'↻ Relancer','Lance tout de suite un nouveau run de ce workflow, en plus de ses passages prévus.');
    box.appendChild(host);
  }
}
// lancer un workflow d'agent qui demande une saisie (« ▶ Lancer… », #64) : liste launchable du dataset gates, un seul
// bloc kronn-action (bureau-launch). Un champ par variable dans la fiche (#67) ; le bouton copie la ligne déjà remplie
// « nom=valeur ; … », à coller telle quelle dans le champ Paramètres de la carte (relaunch.py revérifie chaque nom).
// Tout agent l'a, ceux ajoutés depuis une baie compris, sans republier la page.
// launchLine : valeurs saisies -> {line, errs:{nom:raison}, missing:[libellés]} ; le « ; » sépare les paramètres
// (relaunch.py) : refusé dans une valeur ; les retours à la ligne deviennent des espaces
function launchLine(vars,vals){
  const parts=[],errs={},missing=[];
  for(const v of vars){
    const x=String(vals[v.name]||'').replace(/\s*\n\s*/g,' ').trim();
    if(!x||x==='…'||x==='...'){if(v.required)missing.push(v.label||v.name);continue;}
    if(x.includes(';'))errs[v.name]='Le « ; » sépare les paramètres : remplace-le par une virgule.';
    else if(v.pattern){let ok=true;try{ok=new RegExp('^(?:'+v.pattern+')$').test(x);}catch(e){}if(!ok)errs[v.name]='Format attendu'+(v.placeholder?' : '+v.placeholder:'')+'.';}
    parts.push(v.name+'='+x);
  }
  return {line:parts.join(' ; '),errs,missing};
}
function runBlock(side,c){
  if(c===spAgent()&&supportOpenable())spFiche(side); // 48-support.js : l'agent Support investigue depuis la console (#62)
  if(!ACTIONS.relaunch||!c.wf||!c.wf.length)return;
  const sw=((CFG.support||{}).wf||'').slice(0,8); // son modèle demande un message et un projet : jamais un « Lancer » à remplir à la main
  const list=LAUNCHABLE.filter(w=>c.wf.includes(String(w.wf).slice(0,8))&&!(sw&&String(w.wf).slice(0,8)===sw));if(!list.length)return;
  const box=foldSection(side,'run','▶ Lancer',list.length,true);
  for(const w of list){
    const vars=(w.vars||[]).filter(v=>v&&v.name),vals={},tips={};
    const host=document.createElement('div');host.className='relaunch rl-form';host.setAttribute('data-kronn-action-slot-host','');
    host.innerHTML=`<div class="rl-n">${esc(clean(w.name))}</div><div class="rl-s">${esc(c.name)} se met au travail dès que le run démarre</div>`;
    const form=document.createElement('div');form.className='na-form rl-f';
    const b=document.createElement('button');b.textContent='▶ Lancer…';
    const why=document.createElement('div');why.className='note rl-why';
    const sync=()=>{const r=launchLine(vars,vals);
      for(const v of vars){tips[v.name].textContent=r.errs[v.name]||'';}
      b.disabled=!!(r.missing.length||Object.keys(r.errs).length);
      why.textContent=r.missing.length?'À remplir : '+r.missing.join(', '):'';return r;};
    for(const v of vars){
      const l=document.createElement('label');l.innerHTML=esc(v.label||v.name)+(v.required?' <b class="req">*</b>':'');
      let f;
      if(v.options){f=document.createElement('select');f.innerHTML=(v.required&&v.default?'':'<option value=""></option>')+v.options.map(o=>`<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');f.value=v.default||'';}
      else{f=document.createElement(v.multiline?'textarea':'input');if(!v.multiline)f.type='text';f.maxLength=4000;f.placeholder=v.placeholder||'';if(v.multiline)f.rows=2;}
      f.dataset.fid='run:'+w.wf+':'+v.name;vals[v.name]=f.value;
      f.oninput=f.onchange=()=>{vals[v.name]=f.value;sync();};
      const t=document.createElement('small');t.className='rl-err';t.setAttribute('aria-live','polite');tips[v.name]=t;
      l.append(f,t);form.appendChild(l);
    }
    b.setAttribute('data-kronn-action','bureau-launch');b.setAttribute('data-kronn-bindings',JSON.stringify({wf_id:w.wf}));
    const hint=document.createElement('div');
    b.onclick=()=>{hint.className='hint';codeHint(hint,sync().line,'Paramètres','rien à retoucher','Paramètres copiés ✓');};
    new MutationObserver(()=>{
      const v=b.getAttribute('data-kronn-action-state');
      if(v==='succeeded')hint.innerHTML='<b style="color:var(--ok)">✓ Lancé.</b> '+esc(c.name)+' se met au travail d\'ici une minute.';else if(v==='failed')hint.innerHTML='<b style="color:var(--err)">Refusé :</b> voir la carte.';
    }).observe(b,{attributes:true,attributeFilter:['data-kronn-action-state']});
    sync();host.append(form,b,why,hint);kronnModal(host,b,'Lancer '+clean(w.name));box.appendChild(host);
  }
}
// carte « Sa musique » : la sandbox interdit tout son externe et les iframes, d'où un lien vers la page du morceau
function musicCard(side,c){
  const m=MUSIC[c.key];if(!m)return;
  // design compact : notre pochette à gauche ; à droite, le lecteur Suno compact posé par Kronn (data-kronn-embed,
  // Kronn avec les embeds hôte) par-dessus le bloc texte, qui reste visible sinon (lien vers Suno)
  const sec=foldSection(side,'music','♪ Son écoute',null); // pliée par défaut ; repliée en cours de lecture, la musique continue
  const d=document.createElement('div');d.className='music';
  // contrat Kronn : l'URL complète du lecteur ; Kronn ne l'affiche que si suno.com est dans ses sites autorisés
  const embed=m.suno_id?` data-kronn-embed="https://suno.com/embed/${encodeURIComponent(m.suno_id)}"`:'';
  d.innerHTML=`${m.cover?`<img src="${m.cover}" alt="">`:''}<div class="mt${embed?' mt-embed':''}"${embed}><div class="mn">${esc(m.title)}</div><div class="mb">${esc(m.style||'')}${m.duration?' · '+esc(m.duration):''}</div>
    <a class="mplay" ${hrefOf(m.url)} target="_blank" rel="noopener">▶ Écouter sur Suno</a></div>`;
  sec.appendChild(d);
}
function payBlock(side,c){
  const p=payFor(c);if(!p)return;
  const box=foldSection(side,'paie','Fiche de paie · 7 jours',null,true);
  const fr=p.week.runs?Math.round(p.week.fail/p.week.runs*100):0;
  box.innerHTML=`<div class="paygrid"><div><b>${fmtTok(p.today.tok)}</b><span>tokens aujourd'hui</span></div><div><b>${fmtTok(p.week.tok)}</b><span>tokens 7 jours</span></div><div><b>${fmtUsd(usd(p.week.tok))||'0 $'}</b><span>coût estimé 7 j</span></div><div><b style="color:${fr>=30?'var(--err)':'inherit'}">${p.week.fail}/${p.week.runs}</b><span>échecs / runs (${fr} %)</span></div></div>
    <div class="payspark">${sparkDays(p.days)}<span class="note" style="margin:0">${p.week.tok?'':'Workflow sans IA : 0 token, '}${p.week.runs} runs sur 7 jours</span></div>`;
}
function renderPaie(side){
  const h=document.createElement('h2');h.textContent='Fiche de paie · 7 derniers jours';side.appendChild(h);
  if(!PAYROLL){
    const e=document.createElement('div');
    e.className='empty';
    e.textContent="Pas encore de données (cron « Le Bureau · fiche de paie », toutes les heures).";
    side.appendChild(e);
    return;
  }
  const rows=chars.filter(c=>!c.person&&!c.visitor).map(c=>({c,p:payFor(c)})).filter(x=>x.p).sort((a,b)=>b.p.week.tok-a.p.week.tok||b.p.week.fail-a.p.week.fail);
  const T7=rows.reduce((s,x)=>s+x.p.week.tok,0), R7=rows.reduce((s,x)=>s+x.p.week.runs,0), F7=rows.reduce((s,x)=>s+x.p.week.fail,0), TD=rows.reduce((s,x)=>s+x.p.today.tok,0);
  const sum=document.createElement('div');
  sum.className='paygrid';
  sum.innerHTML=`<div><b>${fmtTok(TD)}</b><span>tokens aujourd'hui</span></div><div><b>${fmtTok(T7)}</b><span>tokens 7 jours</span></div><div><b>${fmtUsd(usd(T7))||'?'}</b><span>coût estimé 7 j</span></div><div><b>${F7}/${R7}</b><span>échecs / runs</span></div>`;
  side.appendChild(sum);
  const n=document.createElement('div');n.className='note';n.style.margin='6px 0 10px';
  n.textContent=PAYROLL.rate_usd_per_mtok?`Coût estimé à ${String(PAYROLL.rate_usd_per_mtok).replace('.',',')} $ par million de tokens : tarif moyen mesuré par Kronn sur tes discussions (${PAYROLL.rate_source}). Kronn ne mesure pas le coût des workflows eux-mêmes. Mis à jour à ${hm(ms(PAYROLL.generated_at))}.`:'Coût non estimable (aucun coût mesuré par Kronn).';
  side.appendChild(n);
  const ul=document.createElement('div');ul.className='roster';
  for(const {c,p} of rows){
    const b=document.createElement('button');
    b.className='who fam-wf payrow';
    b.onclick=()=>select(c.key);
    b.appendChild(portrait(c,36));
    const t=document.createElement('div');t.className='t';const fr=p.week.runs?Math.round(p.week.fail/p.week.runs*100):0;
    t.innerHTML=`<div class="n">${esc(c.name)}</div><div class="r">${p.week.runs} runs · <span style="color:${fr>=30?'var(--err)':'inherit'}">${p.week.fail} échecs</span> · auj. ${fmtTok(p.today.tok)}</div>`;
    b.appendChild(t);
    const v=document.createElement('div');
    v.className='s payv';
    v.innerHTML=`<b>${fmtTok(p.week.tok)}</b><small>${p.week.tok?fmtUsd(usd(p.week.tok)):'0 $'}</small>${sparkDays(p.days)}`;
    b.appendChild(v);
    ul.appendChild(b);
    }
  side.appendChild(ul);
}
