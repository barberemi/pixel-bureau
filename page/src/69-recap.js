// ---------- récap de la journée : ce qui s'est passé depuis minuit, en une carte ----------
// La page tourne dans une sandbox sans même origine : elle ne peut rien mémoriser (localStorage bloqué), donc pas de
// « depuis ton dernier passage ». À la place : la carte s'ouvre d'elle-même quand on ouvre la page le matin (avant
// RECAP_AUTO_H h, heure de Paris), et le bouton « ☀ Récap » de l'en-tête la rouvre à tout moment.
const RECAP_AUTO_H=12;
let RECAP_OPEN=null, RECAP_SIG=''; // null : pas encore décidé (attend les premières données)
function recapData(t){
  const since=DAY0, after=x=>x&&x>=since&&x<=t;
  const fails={};
  for(const c of chars){if(c.person||c.visitor)continue;
    for(const r of (c.top||c.runs))if(r.status==='Failed'&&after(r._e))fails[c.name]=(fails[c.name]||0)+1;}
  const alarms=chars.filter(c=>c._st&&c._st.alarm).map(c=>c.name);
  const meps=TEAM?(TEAM.meps||[]).filter(m=>m.prod&&after(ms(m.prod.end))):[];
  const merged=TEAM?(TEAM.merged_today||[]).filter(m=>after(ms(m.mergedAt))):[];
  const evs=TEAM?(TEAM.events||[]).filter(e=>after(ms(e.t))):[];
  return {
    since,
    fails:Object.entries(fails).sort((a,b)=>b[1]-a[1]),
    alarms,
    mepOk:meps.filter(m=>m.prod.conclusion==='success'),
    mepKo:meps.filter(m=>m.prod.conclusion!=='success'),
    merged,
    created:evs.filter(e=>e.kind==='new'),
    deployed:evs.filter(e=>e.kind==='move'&&e.cat==='done'),
    approved:evs.filter(e=>e.kind==='review'&&e.state==='approved'),
    todo:todoItems(t).filter(x=>x.sev!=='info').length
  };
}
function renderRecap(){
  const box=document.getElementById('recap'); if(!box||!DATA)return;
  if(RECAP_OPEN===null){if(!LIVE_DATA&&!DEMO)return;RECAP_OPEN=parisHM(Date.now()).h<RECAP_AUTO_H;}
  if(!RECAP_OPEN){if(RECAP_SIG){RECAP_SIG='';box.innerHTML='';box.hidden=true;}return;}
  const d=recapData(T), li=[];
  const names=(l,n)=>esc(l.slice(0,n).join(', '))+(l.length>n?'…':'');
  if(d.fails.length)li.push(`<li class="r-err">✗ <b>${plural(d.fails.reduce((a,x)=>a+x[1],0),'échec','échecs')} d'agents</b> <small>${esc(d.fails.slice(0,4).map(([n,k])=>n+' ×'+k).join(', '))}</small>${d.alarms.length?` · 🚨 alarme : ${names(d.alarms,3)}`:''}</li>`);
  if(d.mepOk.length||d.mepKo.length)li.push(`<li class="${d.mepKo.length?'r-err':'r-ok'}">🚀 <b>${plural(d.mepOk.length,'mise en prod','mises en prod')}</b>${d.mepKo.length?` · ${plural(d.mepKo.length,'échouée','échouées')}`:''} <small>${esc([...d.mepOk,...d.mepKo].map(m=>m.tag+(m.ticket?' '+m.ticket:'')).join(', '))}</small></li>`);
  if(d.merged.length)li.push(`<li>⇡ <b>${plural(d.merged.length,'PR mergée','PR mergées')}</b> <small>${esc(d.merged.slice(0,5).map(m=>'#'+m.n).join(', '))}${d.merged.length>5?'…':''}</small></li>`);
  if(d.deployed.length)li.push(`<li class="r-ok">✓ <b>${plural(d.deployed.length,'ticket déployé','tickets déployés')}</b> <small>${esc(d.deployed.slice(0,5).map(e=>e.key).join(', '))}</small></li>`);
  if(d.created.length)li.push(`<li>＋ <b>${plural(d.created.length,'nouveau ticket','nouveaux tickets')}</b> <small>${esc(d.created.slice(0,5).map(e=>e.key).join(', '))}</small></li>`);
  if(d.approved.length)li.push(`<li>👍 <b>${plural(d.approved.length,'review approuvée','reviews approuvées')}</b></li>`);
  if(!li.length)li.push(`<li class="r-ok">Rien de notable.</li>`);
  const title=parisMidnight(Date.now())>d.since?'☀ Ta journée d\'hier':'☀ Ta journée depuis minuit'; // données encore d'hier (avant le premier cron du matin)
  const html=`<div class="rh"><h2>${title}</h2><button class="rclose" data-recap-close aria-label="Fermer le récap">Fermer</button></div><ul>${li.join('')}</ul>`+
    (d.todo?`<div class="rfoot">${plural(d.todo,'chose t\'attend','choses t\'attendent')} dans « À traiter » ci-dessous.</div>`:'');
  box.hidden=false;
  if(html===RECAP_SIG)return;
  RECAP_SIG=html;box.innerHTML=html;
}
document.getElementById('recap').addEventListener('click',e=>{if(e.target.closest('[data-recap-close]')){RECAP_OPEN=false;renderRecap();}});
document.getElementById('recapbtn').addEventListener('click',()=>{RECAP_OPEN=!RECAP_OPEN;renderRecap();});
