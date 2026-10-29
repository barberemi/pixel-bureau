// ---------- « ↻ Rafraîchir » une page de l'écran mural (fenêtre Mes pages Kronn) ----------
// bosspages.pages[].feeds (pages_snapshot.py) : les workflows qui publient dans la page, un parent à la place d'un
// sous-workflow. Le bouton de la carte ouvre un écran (comme × et 📽) : une ligne par workflow, son coût (0 token, ou
// tokens par run de la fiche de paie pour un agent IA), son dernier run, et « ↻ Relancer » (bureau-relaunch, relaunch.py)
// s'il est dans la liste des relançables (dataset gates). L'état du jour vient des runs (office et live).
const RF_ACTIVE=RUN_ACTIVE;
const rfFeeds=p=>(p&&Array.isArray(p.feeds)?p.feeds:[]).filter(f=>f&&typeof f.wf==='string');
const rfRuns=wf=>chars.flatMap(c=>c.runs.filter(r=>r.wf===wf&&r._s<=T));
const rfCan=f=>!!ACTIONS.relaunch&&RELAUNCH.some(w=>w.wf===f.wf);
// en cours, sinon le dernier run fini aujourd'hui (tous les workflows de la page)
function rfState(p){
  const rs=rfFeeds(p).flatMap(f=>rfRuns(f.wf));
  const run=rs.filter(r=>RF_ACTIVE.includes(r.status)).sort((a,b)=>a._s-b._s)[0];
  if(run)return {k:'run',txt:'⏳ Rafraîchissement en cours depuis '+hm(run._s)};
  const end=rs.filter(r=>r._e&&r._e<=T).sort((a,b)=>b._e-a._e)[0];
  if(!end)return null;
  return end.status==='Success'?{k:'ok',txt:'✓ Rafraîchie à '+hm(end._e)}:{k:'ko',txt:'✗ Échec à '+hm(end._e)};
}
// pied de carte : le bouton, grisé quand tous ses workflows relançables tournent déjà, puis l'état du jour
function rfFoot(p){
  const fs=rfFeeds(p);if(!fs.length||!ACTIONS.relaunch)return '';
  const can=fs.filter(rfCan), busy=can.length&&can.every(f=>rfRuns(f.wf).some(r=>RF_ACTIVE.includes(r.status))), st=rfState(p);
  return `<button type="button" class="rf-btn" data-id="${esc(p.id)}"${busy?' disabled':''}>↻ Rafraîchir</button>`+(st?`<div class="rf-st ${st.k}">${esc(st.txt)}</div>`:'');
}
const rfTok=n=>n>=1e6?(n/1e6).toFixed(1).replace('.',',')+' M':n>=1e3?Math.round(n/1e3)+' k':String(Math.round(n));
// coût d'un workflow : 0 token sans agent IA ; sinon les tokens par run des 7 derniers jours (fiche de paie), s'ils sont connus
function rfCost(f){
  if(!f.ai)return '<span class="rf-cost">0 token</span>';
  const rows=PAYROLL?(PAYROLL.agents||[]).filter(a=>String(a.wf)===f.wf):[], w=rows.reduce((o,a)=>({tok:o.tok+a.week.tok,runs:o.runs+a.week.runs}),{tok:0,runs:0});
  if(!w.runs)return '<span class="rf-cost ai">🤖 IA · coût par run pas encore connu</span>';
  const t=w.tok/w.runs, d=usd(t);
  return `<span class="rf-cost ai">🤖 IA · ~${rfTok(t)} tokens par run</span>moyenne des 7 derniers jours${d!=null?' · '+fmtUsd(d):''}`;
}
function rfLast(f){
  const rs=rfRuns(f.wf), run=rs.find(r=>RF_ACTIVE.includes(r.status));
  if(run)return '⏳ En cours depuis '+hm(run._s);
  const r=rs.filter(x=>x._e&&x._e<=T).sort((a,b)=>b._e-a._e)[0], st=r?r.status:f.last&&f.last.status, at=r?r._e:f.last&&ms(f.last.at);
  if(!at)return 'Pas encore de run';
  const mark=st==='Success'?'✓':st==='Failed'?'✗':'·', day=parisDay(at)===parisDay(T);
  return `Dernier run : ${mark} ${day?hm(at)+(T>at?' (il y a '+fmtDur(T-at)+')':''):'le '+dtf('fr-FR',{day:'2-digit',month:'2-digit'}).format(new Date(at))}${st==='Failed'?' (échec)':''}`;
}
let RF_B=null; // bouton « Relancer » dont la carte Kronn est ouverte sous l'écran
function rfRow(f){
  const busy=rfRuns(f.wf).some(r=>RF_ACTIVE.includes(r.status)), can=rfCan(f);
  const how=(f.trigger==='cron'?'automatique (cron)':'manuel')+(f.via?` · lance « ${esc(f.via)} »`:'');
  const btn=busy?'<button type="button" disabled>⏳ En cours</button>':can?`<button type="button" class="on rf-go" data-wf="${esc(f.wf)}">↻ Relancer</button>`:'';
  return `<div class="rf-row"><b>${esc(f.name)}</b><small>${rfCost(f)}${f.ai?' · ':' '}${how}</small><small>${esc(rfLast(f))}${!busy&&!can?' · demande une saisie : à lancer depuis Kronn':''}</small>${btn}</div>`;
}
function rfOpen(box,id){
  if(box.classList.contains('bp-on'))return;
  const p=bpPageOf(id), fs=rfFeeds(p), conf=box.querySelector('.bp-confirm');if(!conf||!fs.length)return;
  box.classList.add('bp-on');conf.hidden=false;
  const n=fs.length, ai=fs.some(f=>f.ai);
  conf.innerHTML=`<div class="bp-what">${bpImg(p,'Pas encore d\'aperçu')}<div><span class="bp-tag refresh">↻ Rafraîchir la page</span><b>${esc(p.title||'')}</b>`+
    `<small>${n>1?n+' workflows remplissent cette page. Chaque bouton ouvre la carte Kronn et relance un workflow.':'1 workflow remplit cette page. Le bouton ouvre la carte Kronn et le relance.'}</small></div>`+
    `<button type="button" class="bp-back">↩ Annuler</button></div><div class="rf-list">${fs.map(rfRow).join('')}</div>`+
    `<div class="hint">${ai?'Un agent IA consomme des tokens à chaque relance. ':''}Un workflow qui tourne déjà ne se relance pas. La miniature suit au prochain passage de la fiche de paie (chaque heure).</div>`;
  const h=conf.querySelector('.hint');
  for(const b of conf.querySelectorAll('.rf-go')){
    b.setAttribute('data-kronn-action','bureau-relaunch');b.setAttribute('data-kronn-bindings',JSON.stringify({wf_id:b.dataset.wf,params:b.dataset.wf}));
    b.addEventListener('click',()=>{RF_B=b;});
    new MutationObserver(()=>{
      const v=b.getAttribute('data-kronn-action-state'), f=fs.find(x=>x.wf===b.dataset.wf);
      if(v==='succeeded'){h.innerHTML=`<b style="color:var(--ok)">✓ Relancé.</b> « ${esc(f.name)} » tourne : la page se met à jour à la fin du run.`;conf.querySelector('.bp-back').textContent='↩ Retour à mes pages';}
      else if(v==='failed')h.innerHTML='<b style="color:var(--err)">Relance refusée</b> (déjà en cours ?). Détail dans la carte.';
    }).observe(b,{attributes:true,attributeFilter:['data-kronn-action-state']});
  }
  conf.querySelector('.bp-back').onclick=()=>rfBack(box);box.scrollTop=0;
}
// retour à la grille : la carte Kronn encore ouverte est refermée (second clic sur son bouton), comme bpBack
function rfBack(box){
  if(RF_B&&box.querySelector('[data-kronn-action-slot]'))RF_B.click();
  RF_B=null;BP_SENT=null;bpBack(box);
}
