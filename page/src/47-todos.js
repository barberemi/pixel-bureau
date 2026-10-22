// ---------- Mes todos : le tableau en liège au mur du bureau du boss ----------
// Dataset todos (todos.py : cron live chaque minute, et le workflow « Le Bureau · todos » après un enregistrement) : les
// tâches Kronn du boss taguées bureau-todo, rangées en trois colonnes, todo (à faire), duck (le canard y réfléchit dans
// une discussion Kronn liée) et done (faites aujourd'hui ou hier). Le tableau (objects.todo du plan) montre un post-it par
// todo et une pastille : à faire, plus les todos où le canard t'attend (dataset gates, ducks.awaiting) ; un clic ouvre la
// fenêtre en colonnes. Un changement (ajout, glisser, ✓ Fait, 🦆 Au canard, ×) s'affiche tout de suite, en pointillé,
// gardé dans ce navigateur (bureau:todo-pend) jusqu'à « Enregistrer » : un seul code copié pour toute la liste, une seule
// carte Kronn, un seul run. Rien en mode TV : ce sont les todos du boss.
let TODOS=null, TD_PEND=[], TD_SENT=null, TD_SEQ=0;
const TD_MAX_TITLE=200, TD_COLS=['todo','duck','done'];
const TD_PRI={high:['Urgent','var(--err)','#e0614f'],normal:['Normal','var(--accent)','#f2d44e'],low:['Plus tard','var(--muted)','#cfd6e4']};
try{const p=JSON.parse(localStorage.getItem('bureau:todo-pend')||'[]');if(Array.isArray(p))TD_PEND=p.filter(o=>o&&typeof o.op==='string');}catch(e){TD_PEND=[];}
const tdKeep=()=>{try{localStorage.setItem('bureau:todo-pend',JSON.stringify(TD_PEND));}catch(e){}};
function readTodos(src){
  try{const d=dsOf(src,'todos');return d&&Array.isArray(d.todos)?{...d,todos:d.todos.filter(t=>t&&typeof t.id==='string'&&TD_COLS.includes(t.col))}:null;}catch(e){return null;}
}
const todoRect=()=>(LAYOUT.objects||{}).todo||null;
const todosOn=()=>!TV&&!!todoRect()&&(!!ACTIONS.todo||!!(TODOS&&TODOS.todos.length));
const tdDuck=t=>t.disc&&(DUCKS||[]).find(d=>d.id===t.disc);
// les todos affichées : le dataset, plus les changements pas encore enregistrés (pend : la carte en pointillé)
function todoView(){
  const rows=((TODOS&&TODOS.todos)||[]).map(t=>({...t}));
  for(const o of TD_PEND){
    if(o.op==='add'){rows.push({id:o.key,title:o.title,col:o.to||'todo',priority:o.priority||'normal',pend:true});continue;}
    const t=rows.find(r=>r.id===o.id);if(!t)continue;
    if(o.op==='delete')rows.splice(rows.indexOf(t),1);
    else{t.col=o.op==='duck'?'duck':o.to;t.pend=true;if(t.col==='done')t.updated=new Date(T).toISOString();}
  }
  return rows;
}
const tdIn=col=>todoView().filter(t=>t.col===col);
const tdWaiting=()=>tdIn('duck').filter(t=>{const d=tdDuck(t);return d&&d.awaiting;}).length;
// un changement de plus : les changements d'une même todo se fondent (dernier état ; ajout puis retrait : rien)
function tdChange(o){
  const add=TD_PEND.find(p=>p.op==='add'&&p.key===o.id);
  if(add){if(o.op==='delete')TD_PEND=TD_PEND.filter(p=>p!==add);else add.to=o.op==='duck'?'duck':o.to;}
  else{
    TD_PEND=TD_PEND.filter(p=>p.id!==o.id);
    const t=((TODOS&&TODOS.todos)||[]).find(r=>r.id===o.id);
    const same=t&&o.op!=='delete'&&(o.op==='duck'?t.col==='duck':t.col===o.to); // retour à l'état enregistré : plus rien à faire
    if(!same)TD_PEND.push(o);
  }
  tdKeep();tdRefresh();
}
function tdAdd(title,priority){
  title=String(title||'').trim().slice(0,TD_MAX_TITLE);if(!title)return;
  TD_PEND.push({op:'add',key:'tmp-'+Date.now().toString(36)+'-'+(TD_SEQ++),title,priority:priority||'normal',to:'todo',at:Date.now()});tdKeep();tdRefresh();
}
const tdN=n=>n?'✏️ '+plural(n,'changement pas encore enregistré','changements pas encore enregistrés'):'';
const TD_OK='<b style="color:var(--ok)">✓ Enregistré.</b> Le tableau suit dans quelques secondes.';
const todoCode=ops=>'TODO1:'+btoa(unescape(encodeURIComponent(JSON.stringify({at:Date.now(),ops}))));

// ---------- sur le plan ----------
function tdPostit(x,y,c,tilt){R(ctx,x+1,y+1,9,8,'rgba(0,0,0,.18)');R(ctx,x,y+tilt,9,8,c);R(ctx,x,y+tilt,9,2,'rgba(0,0,0,.08)');R(ctx,x+2,y+4+tilt,5,1,'rgba(0,0,0,.35)');}
const TODO_BOARD={y:-1,draw:()=>{
  if(!todosOn())return;
  const {x,y,w,h}=todoRect(), cw=Math.floor((w-8)/3);
  R(ctx,x,y,w,h,'#6b4a2b');R(ctx,x+2,y+2,w-4,h-4,'#c89a63');                     // cadre, liège
  for(let i=0;i<40;i++)R(ctx,x+3+((i*37)%(w-6)),y+3+((i*53)%(h-6)),1,1,'#b0834f'); // grain
  TD_COLS.forEach((col,i)=>{
    const cx=x+4+i*cw;
    tdIn(col).slice(0,4).forEach((t,j)=>tdPostit(cx+1+(j%2)*(cw/2-1),y+4+Math.floor(j/2)*10,col==='done'?'#8fd18f':col==='duck'?'#f5c518':(TD_PRI[t.priority]||TD_PRI.normal)[2],j%2));
    if(col==='duck'){const dx=cx+cw/2-4,dy=y+h-11;R(ctx,dx+1,dy+2,6,4,'#f5c518');R(ctx,dx+4,dy,3,3,'#f5c518');R(ctx,dx+7,dy+1,2,1,'#f08a1c');R(ctx,dx+5,dy+1,1,1,'#1a1a1a');}
  });
  const n=tdIn('todo').length+tdWaiting();if(!n)return;
  ctx.font='bold 11px sans-serif';const s=String(n),bw=Math.max(13,ctx.measureText(s).width+8),bx=x+w-bw+4,by=y-8;
  R(ctx,bx,by,bw,13,'#e0902a');ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(s,bx+bw/2,by+7);ctx.textAlign='start';ctx.textBaseline='alphabetic';
}};
function todoTip(){
  const n=tdIn('todo').length, wt=tdWaiting(), dk=tdIn('duck').length;
  return 'Mes todos : '+(n?n+' à faire':'rien à faire')+(dk?' · '+dk+' avec le canard'+(wt?' ('+wt+' t\'attend)':''):'');
}

// ---------- la fenêtre en colonnes ----------
let TD_DRAG=null;
function openTodos(){
  if(!todosOn())return;
  const back=BP_BACK||document.activeElement;closeBossPages(false);BP_BACK=back;
  const bd=document.createElement('div');bd.className='bp-backdrop';bd.onclick=()=>closeBossPages();
  const box=document.createElement('div');box.className='bp-modal td-modal';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','Mes todos');
  box.innerHTML=`<div class="bp-head"><h2>📌 Mes todos</h2><button type="button" class="bp-x" aria-label="Fermer">×</button></div><div class="td-body"></div>`;
  BP_INERT=[...document.body.children].filter(e=>!e.inert&&e.tagName!=='SCRIPT');BP_INERT.forEach(e=>{e.inert=true;});
  document.body.append(bd,box);box.querySelector('.bp-x').onclick=()=>closeBossPages();
  tdRender(box);const f=box.querySelector('.td-add input');if(f)f.focus();
}
// la fenêtre suit les données (dataset todos, canard), sauf pendant un enregistrement (la carte Kronn reste en place)
function tdRefresh(){const box=document.querySelector('.td-modal');if(box&&!(TD_SENT&&box.querySelector('[data-kronn-action-slot]')))tdRender(box);}
function tdCard(t){
  const p=TD_PRI[t.priority]||TD_PRI.normal, d=tdDuck(t), m=[], ro=!ACTIONS.todo;
  if(t.col==='todo')m.push(`<span>${p[0]}</span>`);
  if(t.col==='duck'){
    m.push(t.pend?'<span>🦆 le canard s\'y met à l\'enregistrement</span>':d&&d.awaiting?'<span class="td-wait">🦆 t\'attend · réponds-lui</span>':'<span>🦆 y réfléchit'+(d&&d.created?' depuis '+esc(bpAge(Math.max(0,T-ms(d.created)))):'')+'</span>');
    if(t.disc)m.push(discLink(t.disc,'Ouvrir la discussion ↗'));
  }
  if(t.col==='done'&&t.updated&&!t.pend)m.push(`<span>✓ il y a ${esc(bpAge(Math.max(0,T-ms(t.updated))))}</span>`);
  if(t.pend)m.push('<span class="td-chip">à enregistrer</span>');
  const acts=ro?'':t.col==='todo'?'<button type="button" data-do="done">✓ Fait</button><button type="button" data-do="duck" title="Le canard ouvre une discussion Kronn sur cette todo">🦆 Au canard</button>':
    t.col==='duck'?'<button type="button" data-do="done">✓ Fait</button>':'<button type="button" data-do="todo">↩ À faire</button>';
  return `<div class="td-card${t.pend?' pend':''}" data-id="${esc(t.id)}" draggable="${ro?'false':'true'}" style="--c:${t.col==='done'?'var(--ok)':t.col==='duck'?'#f5c518':p[1]}">`+
    (ro?'':`<button type="button" class="td-del" data-do="delete" aria-label="Supprimer « ${esc(t.title)} »">×</button>`)+
    `<div class="td-t">${esc(t.title)}</div><div class="td-m">${m.join('')}</div>${acts?`<div class="td-act">${acts}</div>`:''}</div>`;
}
function tdRender(box){
  const body=box.querySelector('.td-body'), ro=!ACTIONS.todo;
  const was=body.querySelector('.td-add input'), typed=was?was.value:'', focused=was&&document.activeElement===was, pri=body.querySelector('.td-add select');
  const priv=pri?pri.value:'normal';
  const col=(c,title,hint,extra)=>{const l=tdIn(c);return `<section class="td-col" data-col="${c}"><h3>${title}<span class="cnt">${l.length}</span></h3><p class="td-hint">${hint}</p>`+
    (l.map(tdCard).join('')||'<p class="td-empty">Rien ici.</p>')+(extra||'')+'</section>';};
  const n=TD_PEND.length;
  body.innerHTML=`<div class="td-cols">`+
    col('todo','À faire',ro?'Les tâches Kronn taguées bureau-todo':'Glisse une carte pour changer de colonne',ro?'':
      `<form class="td-add"><input type="text" maxlength="${TD_MAX_TITLE}" placeholder="Nouvelle todo…" aria-label="Nouvelle todo"><select aria-label="Priorité"><option value="normal">Normal</option><option value="high">Urgent</option><option value="low">Plus tard</option></select><button type="submit" aria-label="Ajouter">＋</button></form>`)+
    col('duck','🦆 Avec le canard','Une discussion Kronn par todo ; il vient te voir quand il a besoin de toi')+
    col('done','Faites','Aujourd\'hui et hier ; les plus anciennes restent dans Kronn')+`</div>`+
    (ro?'<p class="hint">Lecture seule : le workflow « Le Bureau · todos » n\'est pas installé (python3 tools/install.py l\'ajoute).</p>':
     `<div class="td-save" data-kronn-action-slot-host${n||TD_SENT?'':' hidden'}><div class="td-save-row"><span class="td-n">${tdN(n)}</span>`+
     `<button type="button" class="on" data-kronn-action="bureau-todo"${n?'':' disabled'}>💾 Enregistrer</button></div><div class="hint"></div></div>`);
  if(ro)return;
  const form=body.querySelector('.td-add');
  {const inp=form.querySelector('input');inp.value=typed;form.querySelector('select').value=priv;if(focused)inp.focus();} // relevé de chaque minute : la saisie reste
  form.onsubmit=e=>{e.preventDefault();const inp=form.querySelector('input'),v=inp.value;inp.value='';tdAdd(v,form.querySelector('select').value);
    const nf=box.querySelector('.td-add input');if(nf){nf.value='';nf.focus();}};
  for(const c of body.querySelectorAll('.td-card')){
    const id=c.dataset.id;
    for(const b of c.querySelectorAll('[data-do]'))b.onclick=()=>{const a=b.dataset.do;tdChange(a==='delete'?{op:'delete',id}:a==='duck'?{op:'duck',id}:{op:'move',id,to:a});};
    c.ondragstart=e=>{TD_DRAG=id;e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',id);}catch(err){}c.classList.add('drag');};
    c.ondragend=()=>{TD_DRAG=null;c.classList.remove('drag');};
  }
  for(const s of body.querySelectorAll('.td-col')){
    s.ondragover=e=>{if(TD_DRAG){e.preventDefault();s.classList.add('over');}};
    s.ondragleave=()=>s.classList.remove('over');
    s.ondrop=e=>{e.preventDefault();s.classList.remove('over');const id=TD_DRAG,to=s.dataset.col;TD_DRAG=null;
      const t=todoView().find(r=>r.id===id);if(!t||t.col===to)return;
      tdChange(to==='duck'?{op:'duck',id}:{op:'move',id,to});};
  }
  tdSaveWire(box);
}
// « Enregistrer » : le code de tous les changements copié, la carte Kronn s'ouvre sous le bouton (même bloc slot-host)
function tdSaveWire(box){
  const host=box.querySelector('.td-save'), b=host&&host.querySelector('[data-kronn-action]'), hint=host&&host.querySelector('.hint');if(!b)return;
  if(TD_SENT&&TD_SENT.done)hint.innerHTML=TD_OK;
  b.onclick=()=>{if(box.querySelector('[data-kronn-action-slot]'))return; // second clic : Kronn referme sa carte
    TD_SENT={ops:TD_PEND.slice()};codeHint(hint,todoCode(TD_SENT.ops),'Code todos','rien à retoucher');};
  new MutationObserver(()=>{
    if(!TD_SENT)return;
    const st=b.getAttribute('data-kronn-action-state');
    if(st==='succeeded'&&!TD_SENT.done){TD_SENT.done=true;TD_PEND=TD_PEND.filter(o=>!TD_SENT.ops.includes(o));tdKeep();
      host.querySelector('.td-n').textContent=tdN(TD_PEND.length);hint.innerHTML=TD_OK;}
    else if(st==='failed')hint.innerHTML='<b style="color:var(--err)">Refusé :</b> le détail est dans la carte Kronn. Tes changements restent là, en pointillé.';
  }).observe(b,{attributes:true,attributeFilter:['data-kronn-action-state']});
}
// nouvelles données : un changement déjà fait dans Kronn sort de la liste en attente (un ajout : même titre, créée depuis) ; fin d'enregistrement
function todosArrived(d){
  TODOS=d;
  const rows=d.todos, n=TD_PEND.length;
  TD_PEND=TD_PEND.filter(o=>{ // déjà dans Kronn (enregistré, ou fait depuis Kronn) : plus en attente
    if(o.op==='add')return !rows.some(t=>t.title===o.title&&t.created&&ms(t.created)>=(o.at||0)-6e4); // créée après la demande
    const t=rows.find(r=>r.id===o.id);
    return o.op==='delete'?!!t:t&&(o.op==='duck'?t.col!=='duck':t.col!==o.to);});
  if(TD_PEND.length!==n)tdKeep();
  if(TD_SENT&&TD_SENT.done&&!document.querySelector('.td-modal [data-kronn-action-slot]'))TD_SENT=null;
  tdRefresh();
}
// démo (jeudi 1er octobre) : quelques todos dans les trois colonnes, une avec le canard qui t'attend
function todosDemo(){
  const at=h=>new Date(DAY0+h*36e5).toISOString(), t=(id,title,col,priority,h,disc)=>({id,title,col,priority,created:at(8),updated:at(h||9),disc});
  return {generated_at:at(10.9),demo:true,todos:[t('t1','Relire la spec du bon de commande avant 14h','todo','high'),t('t2','Répondre à Jan sur le budget du trimestre','todo','normal'),
    t('t3','Vérifier les crons de lundi après le changement d\'heure','todo','low'),t('t4','Préparer la réunion avec David','todo','normal'),
    t('t5','Pourquoi le relevé des ventes rate une heure sur deux ?','duck','high',9,'dd-demo-1'),t('t6','Commander du papier','done','normal',10.2),t('t7','Signer les notes de frais','done','low',9.4)]};
}
