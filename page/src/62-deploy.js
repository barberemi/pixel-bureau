// ---------- « 🚀 Déployer la branche » d'une PR, hors prod (modèle deploy) ----------
// Sous « Sur la PR », une ligne par env du réglage deploy de son dépôt (CFG.deploy_envs) : ce qui l'occupe (LIVE.envs,
// relu chaque minute par le cron live), puis un bouton qui lance le modèle sur la ligne actions.deploys « dépôt#n|env ».
// Env pris par la branche de quelqu'un d'autre : « ⇄ Remplacer… », et la fenêtre de la carte Kronn le dit avant Lancer.
// Juste après un lancement, « ⏳ demandé » jusqu'à ce que le run GitHub arrive (DP_ASKED, ce navigateur, 15 min au plus).
const DP_ASK_MS=15*60e3;
let DP_ASKED={};try{DP_ASKED=JSON.parse(localStorage.getItem('bureau:deploy')||'{}')||{};}catch(e){DP_ASKED={};}
for(const k in DP_ASKED)if(!(Date.now()-DP_ASKED[k]<DP_ASK_MS))delete DP_ASKED[k];
const dpSave=()=>{try{localStorage.setItem('bureau:deploy',JSON.stringify(DP_ASKED));}catch(e){}};
// [{repo, env}] où déployer la branche de cette PR ; [] hors réglage, sans le modèle ou PR mergée
function dpEnvs(p){
  if(!ACTIONS.deploy||!p||p.merged||!p.head)return [];
  const r=Object.keys(CFG.deploy_envs||{}).find(k=>String(k).toLowerCase()===String(prRepo(p)).toLowerCase());
  return r?CFG.deploy_envs[r].map(env=>({repo:r,env})):[];
}
// état d'un env vu de cette PR : o (occupant), mine (la branche de cette PR), asked (lancé d'ici, run pas encore vu),
// run (déploiement en cours), ko (dernier run en échec), who (son personnage), other (quelqu'un d'autre l'occupe)
function dpState(p,repo,env){
  const k=repo+'|'+env, o=((LIVE&&LIVE.envs)||{})[k]||null, a=DP_ASKED[k];
  const asked=a&&Date.now()-a<DP_ASK_MS&&!(o&&ms(o.start)>=a-60e3)?a:null;
  const who=o&&o.by?byChar(o.by):null, boss=chars.find(c=>c.boss);
  const mine=!!o&&!o.tag&&o.ref===p.head;
  return {k,o,asked,mine,who,run:!!o&&o.status!=='completed',ko:!!o&&o.status==='completed'&&o.conclusion!=='success',
    other:!!o&&!mine&&!(who&&who===boss)};
}
// écart arrondi à l'unité qui parle : 40 s, 4 min, 2 h, 3 j
const dpSpan=d=>d<60e3?Math.max(0,Math.round(d/1e3))+' s':d<36e5?Math.round(d/60e3)+' min':d<864e5?Math.floor(d/36e5)+' h':Math.floor(d/864e5)+' j';
const dpAgo=t=>dpSpan(Math.max(0,T-ms(t)));
const dpWho=s=>s.who?s.who.name:s.o.by||'quelqu\'un';
const dpRef=s=>s.mine?'ta branche':s.o.ref||'?';
// ce qui occupe l'env, en une ligne
function dpOcc(s){
  const run=s.o&&s.o.url?` · <a href="${esc(s.o.url)}" target="_blank" rel="noopener">run ↗</a>`:'';
  if(s.asked)return `<em>⏳ demandé</em> · lancé il y a ${esc(dpSpan(Math.max(0,Date.now()-s.asked)))}`;
  if(!s.o)return '<em>libre</em> · aucun déploiement récent';
  if(s.run)return `<em>⏳ ${esc(dpRef(s))} arrive</em> · lancé il y a ${esc(dpAgo(s.o.start))}`+(s.mine?'':' · '+esc(dpWho(s)))+run;
  if(s.ko)return `<em>❌ échec</em> · ${esc(dpRef(s))} · lancé il y a ${esc(dpAgo(s.o.start))}`+run;
  return `<em>${s.mine?'✅ ta branche':esc(s.o.tag?s.o.ref+' (version)':s.o.ref)}</em> · ${esc(dpWho(s))} · il y a ${esc(dpAgo(s.o.end||s.o.start))}`+run;
}
// libellé du bouton, ou null quand il est grisé (déploiement de cette branche déjà en route)
function dpLabel(s){
  if(s.asked||s.run&&s.mine)return null;
  if(s.mine)return s.ko?'↻ Relancer':'↻ Redéployer';
  return s.other?'⇄ Remplacer…':'🚀 Déployer';
}
function deployBlock(box,p){
  const envs=dpEnvs(p);if(!envs.length)return;
  const rows=new Set(((ACTS&&ACTS.deploys)||[]).map(d=>d.id));
  const host=document.createElement('div');host.className='relaunch la dp';host.setAttribute('data-kronn-action-slot-host','');
  host.innerHTML='<div class="la-av" aria-hidden="true">🚀</div>';
  const t=document.createElement('div');t.className='la-t';
  t.innerHTML=`<div class="la-n"><b>Déployer la branche</b></div><div class="rl-s">Construit <code class="dp-br">${esc(p.head)}</code> et la pousse sur un env partagé. Qui l'occupe en ce moment :</div>`;
  const list=document.createElement('div');list.className='dp-envs';
  for(const {repo,env} of envs){
    const s=dpState(p,repo,env), E=env.toUpperCase(), id=prId(p)+'|'+env, label=dpLabel(s);
    const row=document.createElement('div');row.className='dp-env'+(s.run||s.asked?' run':s.ko?' ko':'');
    row.innerHTML=`<b class="dp-n">${esc(E)}</b><div class="dp-o"></div>`;
    const o=row.querySelector('.dp-o');if(s.who&&!s.asked)o.appendChild(portrait(s.who,20));
    o.insertAdjacentHTML('beforeend',`<span>${dpOcc(s)}</span>`);
    const b=document.createElement('button');b.type='button';
    if(!label||!rows.has(id)){
      b.disabled=true;b.textContent=label||'↻ Redéployer';
      b.title=label?'PR pas encore relevée par le cron équipe : le bouton arrive au prochain relevé':'Déploiement en cours';
    }else{
      b.textContent=label;b.setAttribute('data-kronn-action','bureau-deploy');
      b.setAttribute('data-kronn-bindings',JSON.stringify(bindsFor('bureau-deploy',{id})));
      new MutationObserver(()=>{if(b.getAttribute('data-kronn-action-state')==='succeeded'){DP_ASKED[s.k]=Date.now();dpSave();}})
        .observe(b,{attributes:true,attributeFilter:['data-kronn-action-state']});
      const warn=s.other?`⚠ ${E} porte ${s.o.tag?'la version '+s.o.ref:s.o.ref} de ${dpWho(s)} (il y a ${dpAgo(s.o.start)}) : en la remplaçant, son test s'arrête. Préviens-le s'il teste encore.`
        :'Hors prod seulement : le workflow refuse tout env ou dépôt hors réglage, et tout workflow de prod.';
      kronnModal(host,b,(s.other?'Remplacer ':'Déployer sur ')+E,{ico:'🚀',tag:label.replace(/…$/,''),name:p.head+' sur '+E,small:warn});
    }
    row.appendChild(b);list.appendChild(row);
  }
  t.appendChild(list);
  t.insertAdjacentHTML('beforeend','<div class="dp-safe">🔒 Hors prod seulement : jamais la prod.</div>');
  host.appendChild(t);box.appendChild(host);
}
