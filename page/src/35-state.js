// ---------- state machine ----------
const KIND_ZONE={ApiCall:'srv',BatchApiCall:'srv',CollectApiData:'srv',PublishPageData:'srv',SubWorkflow:'meet',BatchQuickPrompt:'meet',Gate:'gate'};
function stepAt(r,t){
  if(!r.steps||!r.steps.length)return null;
  const realEnd=r._e||Date.now(), realDur=Math.max(1,realEnd-r._s), visEnd=r._ve===Infinity?realEnd:r._ve, visDur=visEnd-r._s;
  let cur=null;
  for(const s of r.steps){if(!s.at)continue;const vt=r._s+(ms(s.at)-r._s)/realDur*visDur;if(vt<=t)cur=s;}
  return cur||r.steps[0];
}
// ---------- §5 : outil en cours, collègue concerné, passage de dossier ----------
const TOOL_TXT={
  Read:['📖','lit'],
  Edit:['✏️','modifie'],
  MultiEdit:['✏️','modifie'],
  Write:['✏️','écrit'],
  Bash:['⌨️','lance'],
  Grep:['🔎','cherche'],
  Glob:['🔎','cherche'],
  WebFetch:['🌐','lit le web'],
  WebSearch:['🌐','cherche sur le web'],
  Task:['🤝','délègue'],
  TodoWrite:['🗒️','planifie']
};
function actText(a){
  if(!a)return null;
  const [ico,verb]=TOOL_TXT[a.t]||['🛠️',a.t];
  let x=String(a.x||'').trim();
  if(/^(Read|Edit|MultiEdit|Write)$/.test(a.t))x=x.split('/').pop();
  if(a.t==='Bash')x=x.split(/\s+/).slice(0,2).join(' ');
  return {ico,bubble:(ico+' '+(x||verb)).slice(0,22),label:ico+' '+verb+(x?' '+x:'')};
}
// le collègue que concerne un run : assigné du ticket (jira_ticket_key) ou auteur de la PR relue (current_task.author)
function runPartner(r){
  if(!r||!r.vars||!TEAM)return null;
  const key=r.vars.jira_ticket_key, gh=r.vars['current_task.author'];
  return chars.find(x=>x.person&&x.team&&x.seat&&((key&&(x.team.tickets||[]).some(t=>t.key===key))||(gh&&(x.team.gh||[]).some(g=>String(g).toLowerCase()===String(gh).toLowerCase()))))||null;
}
// ce que traite un run d'agent : ticket (jira_ticket_key) ou PR relue (current_task.number, pr), reliée à son ticket via les PR de l'équipe
// repo : dépôt de la PR quand le run le dit (revue multi-dépôts : current_task.repo) ; une PR d'un autre dépôt que
// github_repo n'est jamais confondue avec la PR de même numéro de l'équipe
function runRef(r){
  const v=(r&&r.vars)||{}, n=v['current_task.number']||v.pr||null, repo=v['current_task.repo']||v.repo||null;
  if(!v.jira_ticket_key&&!n)return null;
  const other=otherRepo(repo);
  const pr=n&&TEAM?[...TEAM.people.flatMap(p=>p.prs||[]),...(TEAM.other_prs||[])].find(p=>samePr(p,repo,n)):null;
  const key=v.jira_ticket_key||(pr&&pr.keys&&pr.keys[0])||null;
  const t=key&&TEAM?[...TEAM.people.flatMap(p=>p.tickets||[]),...(TEAM.unassigned||[])].find(x=>x.key===key):null;
  return {key,pr:n?String(n):null,repo:other?repo:null,t:t||null,title:pr?pr.title:null};
}
// un dépôt « owner/nom » autre que celui de l'équipe (github_repo) ; inconnu ou identique : false
const otherRepo=repo=>!!repo&&/^[\w.-]+\/[\w.-]+$/.test(repo)&&String(repo).toLowerCase()!==String(CFG.github_repo||'').toLowerCase();
// identité d'une PR (#56) : son dépôt et son numéro, jamais le numéro seul (front_api#16 n'est pas front_web#16).
// repo absent (ancien dataset) ou celui de l'équipe : le dépôt principal (github_repo).
const prRepo=x=>otherRepo(x&&x.repo)?x.repo:(CFG.github_repo||'');
const prId=x=>prRepo(x)+'#'+x.n; // « owner/dépôt#n » : fiche (openPr(id), volet du Kanban), liens data-pr, dataset actions (prs.find(id))
const prNum=x=>(otherRepo(x&&x.repo)?x.repo.split('/')[1]:'')+'#'+x.n; // affiché : « #2039 », « front_api#16 » ailleurs
const repoKey=repo=>otherRepo(repo)?String(repo).toLowerCase():'';
const samePr=(x,repo,n)=>!!x&&String(x.n)===String(n)&&repoKey(x.repo)===repoKey(repo);
// place debout côté allée, à côté d'un siège
// de passage : à sa place tant qu'il a un ticket ouvert dans le sprint (il ne se promène pas) ; ni daily ni cérémonies ;
// heures de bureau comme tout le monde ; plus aucun ticket ouvert : pas au bureau
function outsiderState(c,t){
  const s=stateAt0(c,t);
  if(!s||s.st==='off'||s.st==='absent'||s.st==='gone')return s;
  if(s.zone==='stage')return s; // sa mise en prod : il monte sur le plateau TV comme tout le monde (Yoda vient le féliciter)
  const open=((c.team&&c.team.tickets)||[]).filter(x=>x.cat!=='done'), doing=open.filter(x=>x.cat==='doing');
  if(!open.length)return {st:'off',human:true,label:'De passage, pas de ticket ouvert'};
  if(doing.length)return {st:'work',zone:'desk',human:true,label:'En cours : '+doing[0].key,bubble:doing[0].key,tk:doing};
  return {st:'idle',zone:'desk',human:true,label:'De passage · '+nTk(open.length)+' '+(CAT_TXT[open[0].cat]||open[0].status||''),bubble:open[0].key,tk:open};
}
function besideSeat(seat){
  const d=seatDir(seat[0],seat[1]);
  return d==='right'?[seat[0]-1,seat[1],'right']:d==='left'?[seat[0]+1,seat[1],'left']:[seat[0],seat[1]+1,'up'];
}
function stateAt(c,t){
  if(c.outsider)return outsiderState(c,t);
  let s0=stateAt0(c,t);
  if(!s0)return s0;
  // outil en cours de l'étape IA (données live, seulement si récentes)
  if(s0.step&&s0.step.act&&s0.run&&s0.run.status==='Running'&&t-ms(s0.step.act.at)<5*60e3){
    const a=actText(s0.step.act);
    s0={...s0,bubble:a.bubble,stepBubble:s0.bubble,label:s0.label+' · '+a.label,act:a};
  }
  if(!c.person&&s0.run){const ref=runRef(s0.run);if(ref)s0={...s0,ref};}
  // l'agent va travailler au bureau du collègue concerné pendant une étape IA
  if(!c.person&&s0.run&&s0.step&&s0.step.k==='Agent'&&['work','srv','meet'].includes(s0.st)){const pc=runPartner(s0.run);
    if(pc&&pc!==c){
      const v=besideSeat(pc.seat);
      s0={
        ...s0,
        zone:'visit',
        visit:v,
        label:s0.label+' · avec '+pc.name+(s0.run.vars.jira_ticket_key?' sur '+s0.run.vars.jira_ticket_key:' (sa PR)')
      };
    }
    }
  // passage de dossier : un run qui vient d'en lancer un autre (sous-run ou TriggerWorkflow) d'un autre agent
  if(!c.person&&!c.visitor&&['work','srv','meet','idle','coffee'].includes(s0.st)&&DATA){const mine=new Set(c.runs.map(r=>r.run));
    const kid=DATA.runs.find(r=>(mine.has(r.tby)||mine.has(r.parent))&&r._s<=t&&t-r._s<75e3);
    const kc=kid&&chars.find(x=>x!==c&&x.runs.some(r=>r.run===kid.run));
    if(kc&&kc.seat){
      const v=besideSeat(kc.seat);
      s0={
        ...s0,
        st:'work',
        zone:'visit',
        visit:v,
        label:'Apporte le dossier à '+kc.name+' ('+clean(kid.wf_name)+')',
        bubble:'📁'
      };
    }
    }
  if(!c.person&&!c.visitor)s0=supportAgentState(c,s0,t); // 48-support.js : l'agent Support, ses alertes (#62)
  // messages importants d'une discussion (visiteurs)
  if(c.visitor&&c.disc&&c.disc.imp>0&&!['gone','absent'].includes(s0.st))s0={
    ...s0,
    bubble:'❗',
    label:s0.label+' · '+c.disc.imp+' message'+(c.disc.imp>1?'s':'')+' important'+(c.disc.imp>1?'s':'')
  };
  const s1=s0;
  if(s1&&(s1.zone==='stage'||s0.zone==='stagesax')&&stageClosed(t)&&(s1.st==='mep'||s1.st==='party'))return {
    ...s1,
    label:'MEP un '+(parisHM(t).wd==='Fri'?'vendredi':'week-end')+' ! Plateau fermé : '+s1.label,
    bubble:'😱'
  };
  // en télétravail (36-absences.js) : à sa place, en transparence, avec le reste de sa journée (daily, cérémonies en visio)
  if(c.person&&!c.boss&&s1&&!['off','absent','gone'].includes(s1.st)&&presenceAt(c,t).tt)return {...s1,tt:true,label:'En télétravail · '+s1.label};
  return s1;
}
// ---------- invités de passage : au plus une visite par jour, heure et durée tirées au sort (fixes pour une date) ----------
// Réglages (roster, clé guests) : days « all » (sinon jours ouvrés), at « HH:MM » + jitter en minutes (sinon une heure
// tirée dans les heures de bureau), stay [min, max] en minutes, chance, tour (le tour des salles), shout (sa bulle).
const GUEST_STOP=3*60e3; // il change d'endroit toutes les 3 min
const GUEST_SPOTS={coffee:'Prend un café',cooler:'À la fontaine',copier:'À la photocopieuse',sofa:'Sur le canapé',ktable:'À la cafétéria',meet:'Passe la tête en salle de réunion'};
// tour des salles, dans l'ordre (une salle absente du plan se replie ailleurs, ZONE_FALLBACK)
const GUEST_TOUR=[['coffee','la cafétéria'],['srv','la salle serveurs'],['meet','la salle de réunion'],['stageout','le plateau TV'],
  ['gate','le bureau du boss'],['wc','les toilettes'],['copier','la photocopieuse'],['daily',"l'open space"]];
// {s, e, r} : arrivée, départ (ms) et suite de tirages de la visite ; null = pas de visite ce jour-là
function guestVisit(c,t){
  if(SCENE_DEMO&&SCENE_DEMO.visit&&SCENE_DEMO.visit.c===c)return SCENE_DEMO.visit.v; // 46-gallery.js : sa visite, jouée maintenant
  if(c.days!=='all'&&RHYTHM.weekend.includes(parisHM(t).wd))return null;
  const r=rng(keySeed(c.key)*7919+daySeed(t));
  if(r()>=(c.chance==null?1:c.chance))return null;
  const [h0,h1]=RHYTHM.office_hours, [a,b]=c.stay||(c.tour?[16,16]:[20,40]), dur=a+r()*(b-a), d0=parisMidnight(t);
  const at=c.at&&String(c.at).split(':').map(Number);
  const m0=at?Math.max(0,at[0]*60+at[1]+(r()-.5)*2*(c.jitter||0))
    :(h0+1)*60+r()*Math.max(0,(h1-h0-2)*60-dur); // une heure de marge à l'ouverture et à la fermeture
  return {s:d0+m0*60e3,e:d0+(m0+dur)*60e3,r};
}
// l'auteur d'une MEP en cours, sur la scène du plateau TV : il la suit, puis la fête
function mepStageState(sg){
  const what=sg.m.tag+(sg.m.ticket?' ('+sg.m.ticket+')':'');
  return sg.phase==='done'?{st:'party',zone:'stage',human:true,label:'Fête la mise en prod '+what,bubble:'🎉'}
    :{st:'mep',zone:'stage',human:true,label:'Met en prod '+what+' : '+MEP_TXT[sg.phase],bubble:'🚀'};
}
// visiteur d'une MEP (30-data.js, mepVisitors) : là le temps de sa mise en prod et de la fête, sinon dehors
function mepVisitorState(c,t){
  const sg=stageAt(t);
  if(sg&&mepChar(sg.m)===c)return mepStageState(sg);
  const mine=mepsAt(t).filter(x=>mepChar(x.m)===c);
  return mine.length?{st:'gone',label:'Reparti après la mise en prod '+mine[mine.length-1].m.tag}:{st:'off',label:'Pas encore arrivé'};
}
// repart par la porte au lieu de disparaître sur place : reparti, ou invité encore sur le plan dont la raison d'être là a
// cessé (porteur dont le mail est lu, facteur dont la validation est décidée un jour sans tournée)
const walksOut=(c,s)=>s.st==='gone'||c.guest&&s.st==='off';
function guestState(c,t){
  {const ms_=messengerState(c,t);if(ms_)return ms_;} // 48-mail.js : un porteur qui remet un mail en personne
  if(c.on==='mep')return mepVisitorState(c,t);
  if(c.on==='reopen')return heraldState(c,t); // 37-scenes.js : le héraut des tickets réouverts
  if(c.on==='prod')return prodHeraldState(c,t); // 37-scenes.js : le héraut des mises en prod réussies
  if(c.on==='mail')return postmanState(c,t); // 48-mail.js : le facteur dépose le courrier
  if(c.on==='coffee')return coffeeState(c,t); // 49-coffee.js : la tournée de café
  if(c.on==='cleaning')return cleaningState(c,t); // 49-menage.js : le ménage du soir
  const v=guestVisit(c,t);
  if(!v||t<v.s)return {st:'off',label:"Pas passé aujourd'hui"};
  if(t>=v.e)return {st:'gone',label:'Passé de '+hm(v.s)+' à '+hm(v.e)};
  const k=Math.floor((t-v.s)/GUEST_STOP); let x=0, y=0;
  for(let i=0;i<=k;i++){x=v.r();y=v.r();} // arrêt n° k : le même à chaque calcul
  const since=' · arrivé à '+hm(v.s)+', repart vers '+hm(v.e), cols=deskColleagues(c);
  if(c.tour){const i=Math.min(GUEST_TOUR.length-1,Math.floor((t-v.s)/((v.e-v.s)/GUEST_TOUR.length))), [z,room]=GUEST_TOUR[i];
    return {st:'idle',zone:z,label:'Fait le tour : '+room+since,bubble:c.shout||'👋'};}
  if(x<.6&&cols.length){const pc=cols[Math.floor(y*cols.length)];
    return {st:'idle',zone:'visit',visit:besideSeat(pc.seat),label:'Passe voir '+pc.name+since,bubble:'👋'};}
  const z=Object.keys(GUEST_SPOTS)[Math.floor(y*Object.keys(GUEST_SPOTS).length)];
  return {st:'idle',zone:z,label:GUEST_SPOTS[z]+since};
}
// ---------- la journée du boss : priorités, routine tirée au sort (fixe pour une date) ----------
const parisMin=t=>{const p=parisHM(t);return p.h*60+p.m;};
const daySeed=t=>+dtf('en-CA',{}).format(new Date(t)).replace(/-/g,'');
// créneaux du jour en minutes depuis minuit (heure de Paris)
function bossPlan(t){
  const sd=daySeed(t), r=k=>hash(sd%100000,k);
  const coffee1=10*60+15+Math.floor(r(1)*30), coffee2=15*60+45+Math.floor(r(2)*30);
  return {coffee:[[coffee1,coffee1+10],[coffee2,coffee2+10]]};
}
const inSlot=(m,[a,b])=>m>=a&&m<b;
// collègues présents, assis à leur place (ceux qu'un invité de passage va saluer)
function deskColleagues(boss){return chars.filter(x=>x!==boss&&x.person&&x.seat&&x._st&&x._st.zone==='desk');}
function bossState(c,t){
  const n=k=>chars.filter(x=>x._st&&x._st.st===k).length, gates=gateTotal(), asks=n('ask')+new Set(loneQuestions(t).map(q=>q.disc)).size, pending=gates+asks;
  const waitTxt=[gates?gates+' validation'+(gates>1?'s':'')+' en attente':'',asks?asks+(asks>1?' discussions attendent':' discussion attend')+' ta réponse':''].filter(Boolean).join(' · ');
  const ret=o=>{c.atBoss=o.zone==='boss';return o;};
  const p=parisHM(t), m=p.h*60+p.m, wd=p.wd==='Sat'||p.wd==='Sun';
  const sax=c.sprite==='boss_sax'; // le saxophone n'existe que sur ce sprite
  // 1. daily et fête de MEP : il y reste, la bulle signale ce qui attend
  if(inDaily(t))return ret(sax?{st:'sax',zone:'daily',label:'Joue du saxophone au daily'+(pending?' · '+waitTxt:''),bubble:pending?'✋'+pending:'♪'}
    :{st:'daily',zone:'daily',label:'Au daily'+(pending?' · '+waitTxt:''),bubble:pending?'✋'+pending:null});
  {const sg=stageAt(t);if(sg&&sg.phase==='done')return ret(sax?{st:'sax',zone:'stagesax',label:'Fête la mise en prod '+sg.m.tag+' au saxophone',bubble:pending?'✋'+pending:'♪'}
    :{st:'party',zone:'stage',label:'Fête la mise en prod '+sg.m.tag,bubble:pending?'✋'+pending:'🎉'});}
  {const cr=ceremonyAt(t);if(cr){const o=ceremonyState(c,cr,waitTxt);if(pending)o.bubble='✋'+pending;return ret(o);}} // planning, rétro : il y est
  const plan=bossPlan(t);
  // 2. validations ou questions : retour au bureau, toutes affaires cessantes
  if(pending)return ret({st:'boss',zone:'boss',label:waitTxt,bubble:'✋'+pending});
  {const sc=teamScene(c,t);if(sc)return ret(sc);} // 37-scenes.js : le boss a aussi des tickets
  // 3. routine
  if(sax&&inSax(t))return ret({st:'sax',zone:'boss',label:'Joue du saxophone à son bureau',bubble:'♪'});
  {const sg=stageAt(t);if(sg)return ret({st:'idle',zone:'stageout',label:'Suit la MEP '+sg.m.tag+' devant le plateau TV',bubble:'📺'});}
  if(!wd&&plan.coffee.some(s=>inSlot(m,s)))return ret({st:'coffee',zone:'coffee',label:'Pause café',bubble:'☕'});
  // 4. sinon, à son bureau
  return ret({st:'boss',zone:'boss',label:'Au bureau du boss'});
}
const ALARM_FAILS=3, FROZEN_AFTER=3*60e3;
// travail Jira des 7 derniers jours d'une personne (dataset team.work, par compte Jira du roster) ; null si rien
function workOf(c){
  const w=c.jira_id&&TEAM&&TEAM.work&&TEAM.work[c.jira_id];
  return w&&(w.written.length||w.triaged.length||w.tested.length||w.reopened.length)?w:null;
}
const cnt50=n=>n>=50?'50+':String(n); // requêtes plafonnées à 50 résultats
const nTk=n=>n+' ticket'+(n>1?'s':'');
// « le plus ancien depuis 3 j » : le ticket de la liste arrivé le premier dans sa colonne ('' s'il date d'aujourd'hui)
function oldestAge(list,t){
  const o=list.reduce((a,x)=>!a||(tkSince(x)||Infinity)<(tkSince(a)||Infinity)?x:a,null), age=o?tkAge(o,t):'';
  return age?'le plus ancien depuis '+age:'';
}
// compteurs de la fiche (sous la ligne d'état) : [{n:'2', t:'écrits cette semaine'}, …]
function workFacts(w){
  if(!w)return [];
  const f=(l,one,many)=>l.length?[{n:cnt50(l.length),t:l.length>1?many:one}]:[];
  return [...f(w.written,'écrit cette semaine','écrits cette semaine'),...f(w.triaged,'trié cette semaine','triés cette semaine'),
    ...f(w.tested,'testé depuis le daily','testés depuis le daily'),...f(w.reopened,'réouvert depuis le daily','réouverts depuis le daily')];
}
// « 3 écrits · 15 triés cette semaine » ; testeur : « 5 testés depuis le dernier daily, dont 1 réouvert »
function workTxt(w){
  if(!w)return '';
  const week=[], out=[];
  if(w.written.length)week.push(cnt50(w.written.length)+' écrit'+(w.written.length>1?'s':''));
  if(w.triaged.length)week.push(cnt50(w.triaged.length)+' trié'+(w.triaged.length>1?'s':''));
  if(week.length)out.push(week.join(' · ')+' cette semaine');
  if(w.tested.length||w.reopened.length)out.push(cnt50(w.tested.length)+' testé'+(w.tested.length>1?'s':'')+' depuis le dernier daily'+
    (w.reopened.length?', dont '+cnt50(w.reopened.length)+' réouvert'+(w.reopened.length>1?'s':''):''));
  return out.join(' · ');
}

// instant du dernier relevé du direct quand il n'est plus rafraîchi (plus de 3 min), sinon null ; jamais en démo
// tous les workflows de ce personnage sont désactivés (liste publiée par le cron « journée »)
function wfDisabled(c){
  const d=(DATA&&DATA.disabled)||[]; if(!d.length||!c.wf||!c.wf.length)return false;
  return c.wf.every(p=>d.some(id=>String(id).startsWith(p)));
}
function frozenSince(){
  if(!LIVE_DATA)return null;
  const g=ms((LIVE&&LIVE.generated_at)||(DATA&&DATA.generated_at));
  return g&&Date.now()-g>FROZEN_AFTER?g:null;
}
// échecs consécutifs des derniers runs terminés à t (premier niveau : les sous-runs sont comptés dans leur parent)
function failStreak(c,t){
  const ids=new Set(c.runs.map(r=>r.run)), done=c.runs.filter(r=>!(r.parent&&ids.has(r.parent))&&r._s<=t&&t>=r._ve);
  let n=0;for(let i=done.length-1;i>=0&&(done[i].status==='Failed'||done[i].status==='Cancelled');i--)n++;
  return n;
}
// santé sur 7 jours (fiche de paie) : « 136 échecs sur 160 runs en 7 j (85 %) »
function weekHealth(c){
  const p=typeof payFor==='function'?payFor(c):null; if(!p||!p.week.runs)return null;
  return p.week.fail+' échecs sur '+p.week.runs+' runs en 7 j ('+Math.round(p.week.fail/p.week.runs*100)+' %)';
}
function stateAt0(c,t){
  if(c.guest)return guestState(c,t);
  if(c.person&&!c.boss){
    const h=+dtf('en-GB',{hour:'numeric',hour12:false}).format(new Date(t));
    {const pr=presenceAt(c,t);if(pr.abs&&!RHYTHM.weekend.includes(parisHM(t).wd))return {st:'off',abs:pr.abs,label:ABS_LABEL[pr.abs]};} // 36-absences.js : planning de l'équipe
    {const ho=holoEvening(c,t);if(ho)return ho;} // 38-passions.js : le soir en hologramme (avant le week-end : vendredi soir jusqu'au samedi 3 h)
    if(RHYTHM.weekend.includes(parisHM(t).wd))return {st:'off',label:'En week-end'}; // seul le boss vient le week-end
    if(h<RHYTHM.office_hours[0]||h>=RHYTHM.office_hours[1])return {st:'off',label:'Rentré chez soi'};
    if(inDaily(t))return {st:'daily',zone:'daily',human:true,label:'Daily en cafétéria',bubble:c.roleKind==='sm'?'Daily':null};
    const sg=stageAt(t);
    if(sg&&mepChar(sg.m)===c)return mepStageState(sg);
    {const cr=ceremonyAt(t);if(cr)return ceremonyState(c,cr);} // 37-scenes.js : planning, rétro en salle de réunion
    {const sc=teamScene(c,t);if(sc)return sc;} // 37-scenes.js : sprint, ticket livré, validé, réouvert
    {const pm=passionMoment(c,t);if(pm)return pm;} // 38-passions.js : volant, panier, sac de frappe
    const open=c.team?c.team.tickets.filter(x=>x.cat!=='done'):[], W=workOf(c), wk=workTxt(W);
    if(c.roleKind==='sm'){
      const mn=+dtf('en-GB',{minute:'numeric'}).format(new Date(t));
      const atBoard=mn<20;
      const end=TEAM&&TEAM.sprint&&TEAM.sprint.end?ms(TEAM.sprint.end):null;
      const j=end?daysLeft(end,t):null;
      return {
        st:'work',
        zone:atBoard?'kanban':'desk',
        human:true,
        label:(atBoard?'Au mur Kanban : ':'')+'Facilite le sprint '+((TEAM&&TEAM.sprint&&TEAM.sprint.name)||'')+(j!=null?' : J-'+j:'')+(wk?' · '+wk:''),
        head:'Facilite le sprint '+((TEAM&&TEAM.sprint&&TEAM.sprint.name)||''),
        sub:[j!=null?'J-'+j:'',atBoard?'au mur Kanban':'',wk].filter(Boolean).join(' · '),
        facts:workFacts(W),
        bubble:j!=null?'J-'+j:'sprint'
      };
    }
    if(c.roleKind==='qa'){ // la QA recette les tickets de toute l'équipe, pas les siens
      const tt=TEAM?[...TEAM.people.flatMap(p=>p.tickets||[]),...(TEAM.unassigned||[])].filter(x=>x.cat==='test'):[];
      if(tt.length)return {
        st:'work',
        zone:'desk',
        human:true,
        label:'Teste '+nTk(tt.length)+' : '+tt.map(x=>x.key).join(', ')+(wk?' · '+wk:''),
        head:'Teste '+nTk(tt.length),
        sub:[oldestAge(tt,t),wk].filter(Boolean).join(' · '),
        facts:workFacts(W),
        chips:tt,
        bubble:tt[0].key,
        tk:tt
      };
      if(wk)return {st:'idle',zone:'desk',human:true,label:'Rien à tester pour le moment · '+wk,head:'Rien à tester pour le moment',sub:wk,facts:workFacts(W),bubble:'🔍 '+cnt50(W.tested.length+W.reopened.length)};
      return {st:'idle',zone:'wander',human:true,label:'Rien à tester pour le moment'};
    }
    if(c.roleKind==='po'){ // la PO écrit et trie le backlog : ses tickets assignés sont rares
      if(open.length||wk)return {
        st:'work',
        zone:'desk',
        human:true,
        label:[open.length?nTk(open.length)+' à faire ou à assigner':'',wk].filter(Boolean).join(' · '),
        head:open.length?nTk(open.length)+' à faire ou à assigner':'Écrit et trie le backlog',
        sub:wk,
        facts:workFacts(W),
        bubble:wk?'✍ '+cnt50(W.written.length)+' · 🗂 '+cnt50(W.triaged.length):open.length+' à faire'
      };
      return {st:'idle',zone:'wander',human:true,label:'Backlog du sprint vide'};
    }
    if(!c.team){ // ni ticket assigné ni rôle suivi : on le dit, sans le faire passer pour inactif
      if(wk)return {st:'work',zone:'desk',human:true,label:wk,head:'À son bureau',sub:wk,facts:workFacts(W),bubble:'✍ '+cnt50(W.written.length)};
      return {st:'idle',zone:'desk',human:true,label:TEAM?"À son bureau · pas d'activité Jira cette semaine":'À son bureau · pas encore de données Jira',
        head:'À son bureau',sub:TEAM?"pas d'activité Jira cette semaine":'pas encore de données Jira'};
    }
    const doing=open.filter(x=>x.cat==='doing');
    const rv=open.filter(x=>x.cat==='review'||x.cat==='test');
    if(doing.length)return {st:'work',zone:'desk',human:true,label:'En cours : '+doing.map(x=>x.key).join(', '),pill:doing.length>1?'En cours sur '+nTk(doing.length):'En cours : '+doing[0].key,bubble:doing[0].key,tk:[...doing,...rv]};
    return rv.length?{st:'idle',zone:'wander',human:true,label:nTk(rv.length)+' en review ou en test',bubble:rv[0].key,tk:rv}:{st:'idle',zone:'wander',human:true,label:'Disponible'};
  }
  if(c.boss)return bossState(c,t);
  if(c.visitor){
    const d=c.disc, s0=c.runs[0]._s, e0=ms(d.end), nearNow=REND-t<15*60e3;
    if(t<s0)return {st:'absent',label:'Pas encore arrivé'};
    // question encore en attente (cron live) et déjà posée à cette heure : il t'attend au bureau du boss
    const qs=discQuestions(d.id,t);
    if(qs.length)return {st:'ask',zone:'gate',label:'Attend ta réponse ('+qs.length+' question'+(qs.length>1?'s':'')+')',bubble:'?',qs};
    const fz=frozenSince(), stale=fz&&t>fz+60e3; // direct figé : « l'agent travaille » n'est plus sûr
    if(d.awaiting&&nearNow&&!stale)return {st:'meet',zone:'meet',label:"En réunion : l'agent travaille",bubble:'...'};
    if(t<=Math.max(e0,s0+VIS_MIN))return {st:'meet',zone:'meet',label:'En discussion',bubble:'...'};
    if(d.pending>0&&nearNow)return {st:'ask',zone:'gate',label:'Attend ta réponse ('+d.pending+' question'+(d.pending>1?'s':'')+')',bubble:'?'};
    if(t-e0<15*60e3)return {st:'coffee',zone:'coffee',label:'Discussion terminée, pause café',bubble:'☕'};
    if(t-e0<18*60e3)return {st:'idle',zone:'leave',label:'Repart'};
    return {st:'gone',label:'Reparti à '+hm(e0)};
  }
  {const ar=arrivalAt(c,t);if(ar)return ar;} // 31-agents.js : agent ajouté depuis la page, le jour de son arrivée
  const runs=c.runs.filter(r=>r._s<=t);
  if(!runs.length)return c.runs.length?{st:'absent',label:'Pas encore arrivé'}:{st:'off',label:"Absent aujourd'hui"};
  const active=runs.filter(r=>t<r._ve);
  if(active.length){
    // une validation qui attend passe avant un run plus récent (deux MEP de projets différents en même temps)
    const r=active.filter(x=>x.status==='WaitingApproval').pop()||active[active.length-1];
    const meps=CFG.mep_workflow?active.filter(x=>(x.wf||'').startsWith(CFG.mep_workflow)):[];
    const also=meps.length>1?' · pilote '+meps.length+' MEP : '+meps.map(mepProject).join(', '):'';
    if(c.visitor)return {st:'work',zone:c.multi?'meet':'desk',label:'En discussion',bubble:'...',run:r};
    if(r.status==='WaitingApproval')return {st:'gate',zone:'gate',label:'Attend ta validation'+also,bubble:'✋',run:r};
    // direct plus rafraîchi (cron arrêté la nuit, Kronn ou Mac éteint) : un run « en cours » n'est plus crédible
    const fz=frozenSince();
    if(fz&&t>fz+60e3&&r.status!=='Pending'){
      const s=stepAt(r,fz);
      return {st:'frozen',zone:'desk',label:'Données figées depuis '+hm(fz)+' : était sur '+(s?s.n:clean(r.wf_name)),bubble:'⏸',run:r,step:s};
    }
    if(CFG.mep_workflow&&(r.wf||'').startsWith(CFG.mep_workflow)){
      const s=stepAt(r,t);
      return {
        st:'mep',
        zone:'stage',
        label:meps.length>1?'Pilote '+meps.length+' MEP : '+meps.map(mepProject).join(', ')+(s?' · '+mepProject(r)+' : '+s.n:''):'Pilote la MEP '+((r.vars&&r.vars.jira_ticket_key)||'')+(s?' : '+s.n:''),
        bubble:'🚀',
        run:r,
        step:s
      };
    }
    const s=stepAt(r,t);
    const z=(s&&KIND_ZONE[s.k])||'desk';
    const failedNow=s&&s.s==='Failed'&&r.status==='Failed'&&s===r.steps[r.steps.length-1];
    const label=(z==='srv'?'Salle serveurs : ':z==='meet'?'En réunion : ':'Travaille sur ')+(s?s.n:'le run');
    if(failedNow)return {st:'error',zone:'wc',label:'En panne : enfermé aux toilettes ('+s.n+')',bubble:'!',run:r,step:s};
    // 32-familles.js : un agent de page met sa page à jour en salle de réunion, devant l'écran mural
    if(z!=='meet'&&famKind(c)==='page')return {st:'work',zone:'meet',label:"Met sa page à jour devant l'écran"+(s?' : '+s.n:''),bubble:s?s.n:'...',run:r,step:s};
    return {st:z==='desk'?'work':z,zone:z==='desk'?'desk':z,label,bubble:s?s.n:'...',run:r,step:s};
  }
  const last=runs[runs.length-1];
  const since=t-last._ve;
  if(c.visitor)return since<3*60e3?{st:'idle',zone:'leave',label:'Repart'}:{st:'gone',label:'Parti'};
  // workflow désactivé dans Kronn : c'est voulu, ses échecs passés ne sont plus une panne à traiter
  if(wfDisabled(c))return {st:'off',label:'Workflow désactivé dans Kronn'+(last.status==='Failed'?' (dernier run en échec)':'')};
  const bad=last.status==='Failed'||last.status==='Cancelled';
  // alarme : ALARM_FAILS échecs d'affilée (runs de premier niveau) = en panne jusqu'au prochain succès, plus seulement 40 min
  const streak=failStreak(c,t);
  if(streak>=ALARM_FAILS){
    const fs=(last.steps||[]).find(s=>s.s==='Failed'), w=weekHealth(c);
    return {
      st:'error',
      zone:'wc',
      alarm:streak,
      label:'Alarme : '+streak+' échecs d\'affilée'+(fs?' (dernier sur '+fs.n+')':'')+(w?' · '+w:'')+' · en panne jusqu\'au prochain succès',
      bubble:'🚨 '+streak,
      run:last,
      step:fs
    };
  }
  if(bad&&since<40*60e3){
    const fs=(last.steps||[]).find(s=>s.s==='Failed');
    return {
      st:'error',
      zone:'wc',
      label:'En panne'+(fs?' sur '+fs.n:'')+' : enfermé aux toilettes',
      bubble:'!',
      run:last,
      step:fs
    };
  }
  if(!bad&&since<12*60e3)return {st:'coffee',zone:'coffee',label:'Pause café bien méritée',bubble:'☕',run:last};
  return {st:'idle',zone:'wander',label:'Disponible',run:last};
}
// questions en attente d'une discussion, posées avant t (dataset gates, 90-boot.js)
const discQuestions=(id,t)=>QUESTIONS.filter(q=>q.disc===id&&(ms(q.since)||0)<=t);
// questions sans visiteur sur le plan (discussions du Bureau : canard, « interroger ») : comptées chez le boss, comme loneGates()
const loneQuestions=t=>QUESTIONS.filter(q=>(ms(q.since)||0)<=t&&!chars.some(c=>c.visitor&&c.disc&&c.disc.id===q.disc));
// questions qui attendent ta réponse à t : celles des visiteurs (au moins une par visiteur en attente) et les autres
const askCount=t=>chars.reduce((a,x)=>a+(x._st&&x._st.st==='ask'?((x._st.qs||[]).length||1):0),0)+loneQuestions(t).length;
// couleurs des états des personnages, une seule table : soit un jeton du thème (ok, info, warn, err, idle), soit une couleur
// fixe. Le canvas veut une vraie couleur : un jeton y prend sa valeur de ST_TOKEN, figée ; le HTML (panneau, « Qui fait quoi »,
// TV, légende) garde var(--jeton) pour suivre le thème. Les deux vues ne diffèrent donc que par ce suivi du thème.
const ST_TOKEN={ok:'#2e9e5b',info:'#4a7fe0',warn:'#e0a020',err:'#d1453b',idle:'#9a9284'};
const ST_PALETTE={
  sax:'#c9a227',
  daily:'#2e9e9b',
  ask:'#d97757',
  mep:MEP_COLOR,
  party:'warn',
  work:'ok',
  srv:'info',
  meet:'info',
  gate:'warn',
  error:'err',
  coffee:'idle',
  idle:'idle',
  boss:'#8a8478',
  frozen:'#7d8fa3',
  reopen:'#d97757',
  deliver:MEP_COLOR,
  thumbs:'ok',
  cheer:'ok',
  pizza:'warn',
  kickoff:'#2e9e9b',
  planning:'#2e9e9b',
  retro:'#c25a9e',
  // pas d'anneau sur le plan (absent, parti) : rien dans ST_COLOR, pastille vide en HTML
  absent:'transparent',
  gone:'transparent'
};
const ST_COLOR=Object.fromEntries(Object.entries(ST_PALETTE).filter(([,v])=>v!=='transparent').map(([k,v])=>[k,ST_TOKEN[v]||v]));
const ST_CSS=Object.fromEntries(Object.entries(ST_PALETTE).map(([k,v])=>[k,ST_TOKEN[v]?'var(--'+v+')':v]));
// pastilles de la légende du gabarit (office_template.html) : data-st = un état de ST_CSS, data-cat = un statut de TCAT ;
// data-fam = une famille d'agents d'AFAM (32-familles.js) ; une pastille en anneau (.ring) prend la couleur en bordure
function paintLegend(root){
  for(const i of root.querySelectorAll('[data-st],[data-cat],[data-fam]')){
    const col=i.dataset.st?ST_CSS[i.dataset.st]:i.dataset.fam?AFAM[i.dataset.fam].c:TCAT[i.dataset.cat].c;
    if(i.classList.contains('ring'))i.style.borderColor=col;else i.style.background=col;
  }
}

// zones facultatives d'un plan : où aller quand le plan n'en a pas (plateau TV, canapé, fontaine...)
const ZONE_FALLBACK={stage:'stageout',stageout:'coffee',stagesax:'stageout',daily:'meet',sofa:'coffee',ktable:'coffee',cooler:'coffee',copier:'coffee',kanban:'gate',sax:'boss',gate:'boss'};
function pickSpot(c,zone,taken){
  if(zone==='desk'&&c.seat){const s=c.seat;return {key:'desk',x:s[0],y:s[1],dir:seatDir(s[0],s[1])};}
  if(zone==='desk')zone='daily'; // plus un siège de libre : debout dans l'open space
  if(zone==='boss'){const s=SPOTS.boss[0];return {key:'desk',x:s[0],y:s[1],dir:s[2]};}
  if(zone==='leave')return {key:'exit',x:EXIT[0],y:EXIT[1],dir:'right'};
  if(zone==='visit'&&c._st&&c._st.visit){ // deux visiteurs au même endroit (livraisons au testeur…) : le second se décale
    const v=c._st.visit, k='visit:'+v[0]+','+v[1];
    if(!taken.has(k)&&!taken.has('@'+v[0]+','+v[1]))return {key:k,x:v[0],y:v[1],dir:v[2]};
    let n=1; while(taken.has(k+'~'+n))n++;
    return {key:k+'~'+n,x:v[0],y:v[1],dir:v[2],ofs:n};
  }
  if((zone==='stage'||zone==='stagesax')&&stageClosed(T))zone='stageout'; // plateau fermé : on attend devant le ruban
  while(!(SPOTS[zone]||[]).length&&ZONE_FALLBACK[zone])zone=ZONE_FALLBACK[zone]; // zone absente du plan : on se replie
  const list=SPOTS[zone]; if(!list||!list.length)return null;
  // une place est libre si ni elle ni sa case ne sont prises : des zones se partagent des cases (table de la cafétéria =
  // places du daily, sax = une place du mur Kanban), réservées par case dans tick (claimSpot)
  const free=i=>!taken.has(zone+':'+i)&&!taken.has('@'+list[i][0]+','+list[i][1]);
  if(c.spotKey&&c.spotKey.startsWith(zone+':')&&!c.spotKey.includes('~')){
    const i=+c.spotKey.split(':')[1];
    if(list[i]&&free(i)){const s=list[i];return {key:c.spotKey,x:s[0],y:s[1],dir:s[2]};}
  }
  for(let i=0;i<list.length;i++)if(free(i)){const s=list[i];return {key:zone+':'+i,x:s[0],y:s[1],dir:s[2]};}
  // zone pleine (gates de plusieurs agents…) : les surnuméraires se répartissent sur toutes les places, chacun décalé de
  // quelques pixels (jamais deux sprites l'un sur l'autre)
  for(let n=0;;n++){
    const i=n%list.length, lvl=1+Math.floor(n/list.length), k=zone+':'+i+'~'+lvl;
    if(!taken.has(k)){const s=list[i];return {key:k,x:s[0],y:s[1],dir:s[2],ofs:lvl};}
  }
}
// réserve une place pour ce passage : sa clé et, posée sans décalage, sa case (bureau compris : une case de zone peut
// tomber sur un siège)
function claimSpot(taken,spot){
  if(spot.key!=='desk'&&spot.key!=='exit')taken.add(spot.key);
  if(spot.key!=='exit'&&!spot.ofs)taken.add('@'+spot.x+','+spot.y);
}
const OFS_X=[0,12,-12,22,-22,6,-6,17,-17];
// position en pixels d'une place : centre de la case, décalé pour les places en surnombre
function spotPos(s){const p=tileCenter(s.x,s.y);if(s.ofs){p.x+=OFS_X[s.ofs%OFS_X.length];p.y+=s.ofs%2?2:-1;}return p;}
// flânerie : tirages à graine fixe (personnage + jour), la même suite de pauses à chaque chargement et dans les tests
function rng(seed){let a=seed>>>0;return ()=>{a=a+0x6D2B79F5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
function wanderZone(c,real){
  if(!c.idlePlan||real>c.idlePlan.until){
    if(!c.rand||c.randDay!==DAY0){c.rand=rng(keySeed(c.key)*7919+daySeed(DAY0||T));c.randDay=DAY0;}
    const r=c.rand();
    const d=c.person?.75:.5;const z=r<d?'desk':r<d+(1-d)*.3?'coffee':r<d+(1-d)*.6?'sofa':r<d+(1-d)*.8?'ktable':r<d+(1-d)*.9?'cooler':'copier';
    c.idlePlan={zone:z,until:real+12e3+c.rand()*25e3};
  }
  return c.idlePlan.zone;
}
function tick(real){
  // deux passes : l'état du boss et des invités dépend de celui des autres (validations en attente, collègues à leur bureau)
  for(const c of chars)if(!c.boss&&!c.guest)c._st=stateAt(c,T);
  for(const c of chars)if(c.boss||c.guest)c._st=stateAt(c,T);
  const taken=new Set();
  const order=chars.slice().sort((a,b)=>(a.spotKey?0:1)-(b.spotKey?0:1));
  for(const c of order){
    const s=c._st;
    if(s.st==='absent'||s.st==='gone'||s.st==='off'){
      if(c.present&&!needTeleport&&walksOut(c,s)&&c.tile&&!(c.tile[0]===EXIT[0]&&c.tile[1]===EXIT[1])){goTo(c,{key:'exit',x:EXIT[0],y:EXIT[1],dir:'right'});continue;}
      c.present=false;c.pos=null;c.spotKey=null;continue;
    }
    let zone=s.zone; if(zone==='wander')zone=wanderZone(c,real); else c.idlePlan=null;
    const spot=pickSpot(c,zone,taken); if(!spot)continue;
    claimSpot(taken,spot);
    c.pose=s.st==='sax'?'type':(s.st==='gate'||s.st==='party'||s.st==='cheer'||s.st==='passion'&&s.passion!=='boxe')?'hands':(s.st==='work'&&zone==='desk')?'type':'idle';
    if(!c.present||needTeleport||!c.pos){
      c.present=true;
      // placé d'un coup seulement au chargement / saut dans le temps ; un nouvel arrivant entre par la porte et marche
      if(needTeleport||s.arrive&&REDUCED_MOTION){place(c,spot);}
      else if(s.arrive&&rackFoot()){const f=rackFoot();c.pos=tileCenter(f[0],f[1]);c.tile=f;c.popAt=performance.now();goTo(c,spot);} // 66-newagent.js : sort de la baie
      else{c.pos=tileCenter(EXIT[0],EXIT[1]);c.tile=[EXIT[0],EXIT[1]];goTo(c,spot);}
      c.arrivedOnce=true; continue;
    }
    goTo(c,spot);
  }
  needTeleport=false;
}
const tileCenter=(x,y)=>({x:x*TS+16,y:y*TS+28});
function place(c,spot){
  c.pos=spotPos(spot);
  c.tile=[spot.x,spot.y];
  c.path=[];
  c.moving=false;
  c.dir=spot.dir;
  c.spotKey=spot.key;
  c.target=spot;
}
function goTo(c,spot){
  if(c.target&&c.target.x===spot.x&&c.target.y===spot.y){
    if((c.target.ofs||0)!==(spot.ofs||0)&&!c.path.length)c.path=[[spot.x,spot.y]]; // même case, autre décalage : quelques pas
    c.target.dir=spot.dir;c.target.ofs=spot.ofs;c.spotKey=spot.key;if(!c.moving)c.dir=spot.dir;return;}
  c.target=spot; c.spotKey=spot.key;
  const from=c.path.length?c.path[0]:c.tile;
  c.path=(c.path.length?[c.path[0]]:[]).concat(findPath(from[0],from[1],spot.x,spot.y));
}
// en lecture accélérée, on marche plus vite (×1 à ×10 : pas de changement, ×60 : 2 fois, ×480 : 8 fois) : sinon un trajet
// de 12 s réelles dure 1 h 30 de journée à ×480 (Gandalf qui traîne vers la porte longtemps après sa scène)
const walkBoost=()=>typeof mode!=='undefined'&&mode==='play'?Math.min(8,Math.max(1,SPEED/30)):1;
function step(c,dt){
  if(!c.pos)return;
  if(!c.path.length){c.moving=false;if(c.target)c.dir=c.target.dir;
    if(c.target&&c.target.key==='exit'&&c._st&&(walksOut(c,c._st)||c._st.zone==='leave')){c.present=false;c.pos=null;}
    return;}
  const [tx,ty]=c.path[0], last=c.path.length===1&&c.target&&c.target.x===tx&&c.target.y===ty;
  const g=last?spotPos(c.target):tileCenter(tx,ty);
  const dx=g.x-c.pos.x, dy=g.y-c.pos.y, d=Math.hypot(dx,dy), v=95*dt*walkBoost();
  c.moving=true;
  if(Math.abs(dx)>Math.abs(dy))c.dir=dx>0?'right':'left';else if(d>0.1)c.dir=dy>0?'down':'up';
  if(d<=v){c.pos=g;c.tile=[tx,ty];c.path.shift();}else{c.pos.x+=dx/d*v;c.pos.y+=dy/d*v;}
}

