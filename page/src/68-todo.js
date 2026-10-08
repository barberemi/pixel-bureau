// ---------- « À traiter » : tout ce qui demande une action, au même endroit, chacun avec son bouton ----------
// rouge = cassé (agent en panne, MEP échouée), ambre = t'attend (validation, question, PR à relire ou à corriger),
// bleu = bloqué dans l'équipe (ticket immobile en review / test, PR sans review)
const TODO_SHOWN=6, BLOCKED_DAYS=2, PR_STALE_H=24;
const SEV_ORDER={err:0,warn:1,info:2};
let TODO_ALL=false, TODO_SIG='';
// réglage d'installation ui.todo : « open » (défaut), « folded » (replié au chargement) ou « hidden » (jamais affiché, et rien ne le remplace).
// Replier en cliquant le titre ne dure que le temps de la visite : la sandbox des pages ne mémorise rien.
const TODO_MODE=((CFG.ui||{}).todo)||'open';
if(!('todo' in COLLAPSED))COLLAPSED.todo=TODO_MODE==='folded';
// login GitHub du boss : config d'installation, sinon le premier login rapproché de ses PR
function bossLogin(){
  if(CFG.github_login)return String(CFG.github_login).toLowerCase();
  const b=chars.find(c=>c.boss), g=b&&b.team&&b.team.gh&&b.team.gh[0];
  return g?String(g).toLowerCase():null;
}
const ageTxt=d=>d<36e5?Math.max(1,Math.round(d/6e4))+' min':d<864e5?Math.round(d/36e5)+' h':Math.floor(d/864e5)+' j';
const ext=(href,label)=>({href,label});
// PR ouvertes de l'équipe (sans les brouillons), avec leur auteur
function teamPrs(){
  if(!TEAM)return [];
  return [...TEAM.people.flatMap(p=>(p.prs||[]).map(x=>({...x,who:p.name}))),...(TEAM.other_prs||[]).map(x=>({...x,who:x.author}))].filter(x=>!x.draft);
}
// tickets en review ou en test sans mouvement depuis BLOCKED_DAYS jours, les plus anciens d'abord
function blockedTickets(t){
  if(!TEAM)return [];
  return [...TEAM.people.flatMap(p=>(p.tickets||[]).map(x=>({...x,who:p.name}))),...(TEAM.unassigned||[])]
    .filter(x=>(x.cat==='review'||x.cat==='test')&&tkSince(x)&&t-tkSince(x)>BLOCKED_DAYS*864e5)
    .sort((a,b)=>tkSince(a)-tkSince(b));
}
// PR qui attendent une review depuis plus de PR_STALE_H heures, les plus anciennes d'abord
function stalePrs(t){
  return teamPrs().filter(x=>x.review==='pending'&&prSince(x)&&t-prSince(x)>PR_STALE_H*36e5).sort((a,b)=>prSince(a)-prSince(b));
}
function todoItems(t){
  const out=[], of=k=>chars.filter(c=>c._st&&c._st.st===k);
  // 1. agents en panne (l'alarme d'abord)
  for(const c of of('error').filter(c=>!c.person).sort((a,b)=>(b._st.alarm||0)-(a._st.alarm||0))){
    const s=c._st;
    out.push({sev:'err',ico:s.alarm?'🚨':'🔧',key:'err:'+c.key,
      txt:`<b>${esc(c.name)}</b> en panne`+(s.alarm?` · ${s.alarm} échecs d'affilée`:'')+(s.step?` <small>sur ${esc(s.step.n)}</small>`:''),
      age:s.run&&s.run._e?t-s.run._e:null,act:{label:'Voir',open:c.key}});
  }
  // 2. MEP échouée aujourd'hui
  if(TEAM)for(const x of mepsAt(t).filter(x=>x.phase==='failed')){
    const run=x.m.prod&&x.m.prod.conclusion&&x.m.prod.conclusion!=='success'?x.m.prod:x.m.staging;
    out.push({sev:'err',ico:'✗',key:'mep:'+x.m.tag,txt:`Mise en prod <b>${esc(x.m.tag)}</b> échouée`+(run===x.m.prod?' en prod':' sur staging')+(x.m.ticket?` <small>${esc(x.m.ticket)}</small>`:''),
      age:run&&run.end?t-ms(run.end):null,act:run&&run.url?ext(run.url,'Voir le run'):{label:'Voir',open:'tv'}});
  }
  // 3. validations
  for(const c of of('gate')){
    const g=GATES.find(x=>c.wf&&c.wf.includes(String(x.wf).slice(0,8)));
    out.push({sev:'warn',ico:'✋',key:'gate:'+c.key,txt:`<b>${esc(c.name)}</b> attend ta validation`+(g&&g.gate?` <small>${esc(g.gate)}</small>`:''),
      age:g&&g.since?t-ms(g.since):null,act:{label:'Décider',open:c.key}});
  }
  // gates sans personnage sur le plan : workflows du Bureau (ex. « Le Bureau · plan » qui propose un nouveau plan)
  for(const g of GATES.filter(g=>!chars.some(c=>c.wf&&c.wf.includes(String(g.wf).slice(0,8)))))
    out.push({sev:'warn',ico:'✋',key:'gate:'+g.run,txt:`<b>${esc(clean(g.wf_name))}</b> attend ta validation`+(g.gate?` <small>${esc(g.gate)}</small>`:''),
      age:g.since?t-ms(g.since):null,act:{label:'Décider',open:'gate:'+g.run}});
  // 4. questions des discussions
  for(const c of of('ask'))out.push({sev:'warn',ico:'❓',key:'ask:'+c.key,
    txt:`<b>${esc(c.name)}</b> attend ta réponse <small>${esc(clip(c.disc.title,60))}</small>`,
    age:c.disc.end?t-ms(c.disc.end):null,act:ext(`${kronnTab()}#discussion-${encodeURIComponent(c.disc.id)}`,'Répondre')});
  // 4 bis. le canard attend ta réponse (ses discussions ne sont pas des visiteurs : elles n'arrivent pas par of('ask'))
  for(const d of DUCKS.filter(d=>d.awaiting))out.push({sev:'warn',ico:'🦆',key:'duck:'+d.id,
    txt:`<b>Le canard</b> attend ta réponse <small>${esc(clip(String(d.title||'').replace(/^🦆\s*/,''),60))}</small>`,
    age:d.updated?t-ms(d.updated):null,act:ext(`${kronnTab()}#discussion-${encodeURIComponent(d.id)}`,'Répondre')});
  if(TEAM){
    const me=bossLogin(), b=chars.find(c=>c.boss), mine=(b&&b.team&&b.team.prs)||[];
    const all=teamPrs();
    const first=n=>String(n||'').split(' ')[0];
    // 5. PR qui attendent ta review
    if(me)for(const x of all.filter(x=>(x.req||[]).some(l=>String(l).toLowerCase()===me)))
      out.push({sev:'warn',ico:'👀',key:'rev:'+x.n,txt:`PR <b>#${x.n}</b> de ${esc(first(x.who))} attend ta review <small>${esc(clip(x.title,60))}</small>`,
        age:prSince(x)?t-prSince(x):null,act:ext(x.url,'Relire')});
    // 6. tes PR à corriger
    for(const x of mine.filter(x=>!x.draft&&x.review==='changes'))
      out.push({sev:'warn',ico:'✏️',key:'fix:'+x.n,txt:`Ta PR <b>#${x.n}</b> : changements demandés <small>${esc(clip(x.title,60))}</small>`,
        age:x.updated?t-ms(x.updated):null,act:ext(x.url,'Corriger')});
    // 7. tickets immobiles en review ou en test
    const tk=blockedTickets(t);
    for(const x of tk)out.push({sev:'info',ico:'⏳',key:'tk:'+x.key,
      txt:`<b>${esc(x.key)}</b> ${esc(CAT_TXT[x.cat]||x.cat)} sans bouger`+(x.who?` · ${esc(first(x.who))}`:'')+` <small>${esc(clip(x.summary,55))}</small>`,
      age:t-tkSince(x),act:ext(JIRA_BROWSE+encodeURIComponent(x.key),'Ouvrir')});
    // 8. PR de l'équipe sans review depuis plus de 24 h (une seule ligne)
    const stale=stalePrs(t).filter(x=>!(me&&(x.req||[]).some(l=>String(l).toLowerCase()===me)));
    if(stale.length){
      const old=Math.max(...stale.map(x=>t-prSince(x)));
      out.push({sev:'info',ico:'🕰',key:'stale',txt:`${plural(stale.length,'PR attend','PR attendent')} une review depuis plus de 24 h <small>${stale.slice(0,4).map(x=>'#'+x.n).join(', ')}${stale.length>4?'…':''}</small>`,
        age:old,act:CFG.github_repo?ext(`https://github.com/${CFG.github_repo}/pulls?q=is%3Apr+is%3Aopen+review%3Arequired`,'Voir'):null});
    }
  }
  return out.sort((a,b)=>SEV_ORDER[a.sev]-SEV_ORDER[b.sev]);
}
function renderTodo(){
  const box=document.getElementById('todo'); if(!box||!DATA)return;
  const items=todoItems(T), shown=TODO_ALL?items:items.slice(0,TODO_SHOWN);
  const btn=a=>!a?'':a.href?`<a class="tbtn" href="${esc(a.href)}" target="_blank" rel="noopener">${esc(a.label)} ↗</a>`:`<button class="tbtn" data-open="${esc(a.open)}">${esc(a.label)} ›</button>`;
  if(TODO_MODE==='hidden'){box.hidden=true;return;}
  const fold=!!COLLAPSED.todo, nErr=items.filter(x=>x.sev==='err').length, nWarn=items.filter(x=>x.sev==='warn').length;
  const head=`<h2 class="grp" data-todo-toggle role="button" tabindex="0" aria-expanded="${!fold}"><span class="chev">${fold?'▸':'▾'}</span>À traiter <span class="cnt${nErr?' hot':''}">${items.length}</span>`+
    (fold?`<span class="tsum">${[nErr?plural(nErr,'cassé','cassés'):'',nWarn?nWarn+' pour toi':''].filter(Boolean).join(' · ')}</span>`:'')+'</h2>';
  const html=!items.length?`<div class="todo-calm">✓ Rien à traiter</div>`:fold?head:
    head+'<ul>'+shown.map(x=>
      `<li class="t-${x.sev}"><span class="ti">${x.ico}</span><span class="tt">${x.txt}</span>${x.age!=null?`<span class="ta">${ageTxt(x.age)}</span>`:'<span class="ta"></span>'}${btn(x.act)}</li>`).join('')+'</ul>'+
    (items.length>TODO_SHOWN?`<button class="tmore" data-todo-more>${TODO_ALL?'Moins':'+ '+(items.length-TODO_SHOWN)+' autre'+(items.length-TODO_SHOWN>1?'s':'')}</button>`:'');
  box.classList.toggle('empty',!items.length);
  if(html===TODO_SIG)return;
  TODO_SIG=html;box.innerHTML=html;
}
document.getElementById('todo').addEventListener('click',e=>{
  if(e.target.closest('[data-todo-more]')){TODO_ALL=!TODO_ALL;renderTodo();return;}
  if(e.target.closest('[data-todo-toggle]')){COLLAPSED.todo=!COLLAPSED.todo;renderTodo();return;}
  const b=e.target.closest('[data-open]');if(b)select(b.dataset.open);
});
document.getElementById('todo').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.closest('[data-todo-toggle]')){e.preventDefault();e.target.click();}});
