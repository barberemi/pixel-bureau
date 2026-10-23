// ---------- UI ----------
let sel=null;
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
// liens sortants venus des données (#6) : seul https passe (ni javascript:, ni data:, ni http) ; sinon null
const safeUrl=u=>typeof u==='string'&&/^https:\/\//i.test(u)?u:null;
// attribut href d'un lien sortant, échappé ; schéma refusé : pas de href, le lien reste affiché mais inactif
const hrefOf=u=>{const s=safeUrl(u);return s?`href="${esc(s)}"`:'';};
// Entrée ou Espace sur un élément role="button" qui n'est pas un vrai bouton (tuile, ligne du fil, titre de la loupe) :
// le même clic qu'à la souris ; les liens et boutons qu'il contient gardent leur comportement
function keyClick(e){
  const t=e.target;
  if((e.key!=='Enter'&&e.key!==' ')||!t||!t.getAttribute||t.getAttribute('role')!=='button'||t.tagName==='BUTTON')return false;
  e.preventDefault();t.click();return true;
}
const STATUS_TXT={
  Success:'Réussi',
  Failed:'Échec',
  Running:'En cours',
  WaitingApproval:'Attend validation',
  Pending:'En attente',
  Cancelled:'Annulé',
  Skipped:'Ignoré'
};
const STATUS_COL={
  Success:'var(--ok)',
  Failed:'var(--err)',
  Running:'var(--info)',
  WaitingApproval:'var(--warn)',
  Pending:'var(--idle)',
  Cancelled:'var(--idle)',
  Skipped:'var(--idle)'
};
function portrait(c,size){
  const p=document.createElement('canvas');p.width=40;p.height=40;const x=p.getContext('2d');x.imageSmoothingEnabled=false;
  const img=spriteOf(c);if(ready(img)){const tall=c.sprite==='boss_sax'; // le saxophoniste est plus grand : tête vers y=2 au lieu de ~13
    const ox=2*64+12+(tall?5:0),oy=4*64+(tall?0:8);
    if(famOf(c)==='wf')x.drawImage(holoFrame(img,2*64,4*64,0,false),12,8,40,40,0,0,40,40);else x.drawImage(img,ox,oy,40,40,0,0,40,40);}
  p.style.width=size+'px';p.style.height=size+'px';return p;
}
// panneau replié en une bande étroite : le plan prend la place (bouton en haut du panneau ; un clic sur le plan le rouvre)
let SIDE_FOLDED=false;
function sideFoldButton(side){
  const b=document.createElement('button');b.className='sidefold-btn';b.dataset.fid='fold';
  b.textContent=SIDE_FOLDED?'⟨':'Replier ⟩';b.title=SIDE_FOLDED?'Rouvrir le panneau':'Replier le panneau : le plan prend la place';
  b.setAttribute('aria-expanded',String(!SIDE_FOLDED));
  b.onclick=()=>{SIDE_FOLDED=!SIDE_FOLDED;renderSide(true);};
  side.appendChild(b);
}
// et ce qui est saisi dans ses champs (data-fid : « ▶ Lancer… », Renommer) : la saisie survit au redessin suivant (#67)
function keepFields(side){const k={};for(const e of side.querySelectorAll('input[data-fid],textarea[data-fid],select[data-fid]'))k[e.dataset.fid]=e.value;return k;}
function restoreFields(side,k){for(const e of side.querySelectorAll('[data-fid]'))if(e.dataset.fid in k&&e.value!==k[e.dataset.fid]){e.value=k[e.dataset.fid];if(e.oninput)e.oninput();}}
function refocus(side,fid){const e=fid&&[...side.querySelectorAll('[data-fid]')].find(x=>x.dataset.fid===fid);if(e)e.focus();}
let COLLAPSED={};try{COLLAPSED=JSON.parse(localStorage.getItem('bureau:collapsed')||'{}')||{};}catch(e){COLLAPSED={};}
// appui en cours dans le panneau ou le panneau Fraîcheur (33-freshness.js) : pas de redessin automatique. Refait entre
// l'appui et le relâchement, il remplace le bouton, le « click » part alors à côté et la carte Kronn ne s'ouvre pas.
// Plafond de 10 s si le relâchement se perd (souris lâchée hors de la page), puis 400 ms après lui, le temps que le clic arrive.
let PRESS_HOLD=0;
function pressHold(down,now){if(down)PRESS_HOLD=now+1e4;else if(PRESS_HOLD>now)PRESS_HOLD=now+400;}
addEventListener('pointerdown',e=>{if(e.target&&e.target.closest&&e.target.closest('#side,#freshpop'))pressHold(true,performance.now());},true);
for(const ev of ['pointerup','pointercancel'])addEventListener(ev,()=>pressHold(false,performance.now()),true);
function renderSide(force){
  if(EDIT&&!force)return; // l'éditeur d'avatar ne se redessine pas tout seul (saisie en cours)
  if(!force&&performance.now()<PRESS_HOLD)return; // clic en cours dans le panneau
  if(!force&&(KM_OPEN||document.querySelector('#side [data-kronn-action-slot]')))return; // carte Kronn ouverte (fenêtre centrée)
  if(!force&&document.activeElement&&/^(SELECT|INPUT|TEXTAREA)$/.test(document.activeElement.tagName)&&document.activeElement.closest('#side'))return; // menu ouvert ou saisie en cours
  const side=document.getElementById('side'); if(!DATA)return;
  // le panneau se redessine chaque seconde : on garde l'élément qui a le focus clavier (data-fid)
  const fid=side.contains(document.activeElement)&&document.activeElement.dataset?document.activeElement.dataset.fid:null;
  const kept=keepFields(side);
  side.innerHTML='';
  const folded=SIDE_FOLDED&&innerWidth>980; // sous 980 px le panneau passe sous le plan : jamais replié
  if(innerWidth>980)sideFoldButton(side);
  document.body.classList.toggle('sidefold',folded);
  if(!folded)drawSide(side);
  restoreFields(side,kept);
  refocus(side,fid);
}
// ligne d'état d'une fiche : une pastille d'une ligne (pill, sinon head, sinon label ; le libellé complet au survol), puis
// les compteurs de la semaine (facts) et les tickets concernés (chips : clé, clic = fiche du ticket)
function statusHtml(st){
  const txt=st.pill||st.head||st.label||'';
  let h=`<div class="status" title="${esc(st.label||'')}"><span class="dot" style="background:${ST_CSS[st.st]||'var(--idle)'}"></span><span class="stt">${esc(txt)}</span></div>`;
  if(st.facts&&st.facts.length)h+=`<div class="st-facts">${st.facts.map(f=>`<span><b>${esc(f.n)}</b> ${esc(f.t)}</span>`).join('')}</div>`;
  if(st.chips&&st.chips.length)h+=`<div class="st-chips">${st.chips.map(x=>`<a href="#" data-tk="${esc(x.key)}" title="${esc(tkComp(x.summary).title)}">${esc(x.key)}</a>`).join('')}</div>`;
  return h;
}
// le panneau ne se redessine pas quand un groupe dépliable y est ouvert (90-boot.js) : la ligne d'état, elle, suit l'heure
function refreshStatus(){
  const box=document.querySelector('#side .stbox'), c=box&&byKey[box.dataset.key]; if(!c)return;
  const h=statusHtml(c._st||stateAt(c,T)); if(box.dataset.sig!==h)box.innerHTML=box.dataset.sig=h;
}
// historique du panneau : « ← » ramène à la vue d'avant (une personne, un ticket, la Fiche de paie…), Échap aussi.
// Le Kanban et le calendrier s'ouvrent en fenêtre (WIN_VIEWS) : quand on en sort par un ticket ou un nom, ils entrent dans
// l'historique, et « ← » les rouvre par-dessus la vue d'où on les avait ouverts.
let SEL_BACK=[];
const WIN_VIEWS={kanban:keep=>openKanban(keep||undefined),calendar:()=>openCalendar()}; // keep : retour, la fenêtre telle qu'on l'a quittée
function backLabel(k){
  if(k==null)return "Toute l'équipe";
  if(byKey[k])return byKey[k].name;
  const s=String(k);
  if(s.startsWith('mail:'))return 'Courrier';
  if(s.startsWith('gate:'))return 'Validation';
  return {kanban:'Mur Kanban',calendar:'Calendrier',tv:'Mises en prod',emp:'Employé du sprint',planning:'Planning des crons',paie:'Fiche de paie',duck:'Le canard',support:'Support'}[s]||"Toute l'équipe";
}
function goBack(){
  const k=SEL_BACK.length?SEL_BACK.pop():null;
  if(WIN_VIEWS[k]){select(SEL_BACK.length?SEL_BACK.pop():null,true);WIN_VIEWS[k](true);return;}
  select(k,true);
}
// depuis une fenêtre large : elle se ferme, la fiche s'ouvre dans le panneau, et la fenêtre entre dans l'historique
function winGo(k){
  const w=WIN_OPEN;
  if(!w)return select(k);
  closeBossPages(false);SEL_BACK.push(sel,w);select(k,true);
}
function backButton(side){
  const b=document.createElement('button');b.className='back';
  b.innerHTML='← '+esc(backLabel(SEL_BACK.length?SEL_BACK[SEL_BACK.length-1]:null))+'<kbd aria-hidden="true">Échap</kbd>';
  b.title='Revenir (Échap)';b.onclick=goBack;side.appendChild(b);return b;
}
// Échap revient en arrière dans le panneau (ou referme l'éditeur d'avatar) ; pas pendant une fenêtre, une carte Kronn, la
// loupe, le mode TV ou une saisie. En capture : on regarde avant que la fenêtre ou la loupe ne se referment sur la même touche.
addEventListener('keydown',e=>{
  if(e.key!=='Escape'||TV||(sel==null&&!EDIT))return;
  if(document.querySelector('.bp-modal')||KM_OPEN||(typeof LOUPE!=='undefined'&&LOUPE.cur))return;
  const a=document.activeElement;if(a&&/^(SELECT|INPUT|TEXTAREA)$/.test(a.tagName))return;
  if(EDIT){closeEditor();renderSide(true);return;}
  goBack();
},true);
function drawSide(side){
  if(sel==='tv'||sel==='emp'||sel==='planning'||sel==='paie'||sel==='duck'||sel==='support'||String(sel).startsWith('gate:')||String(sel).startsWith('mail:')){
    backButton(side);
    if(String(sel).startsWith('gate:')){renderLoneGate(side,sel.slice(5));return;}
    if(String(sel).startsWith('mail:')){renderMail(side,sel.slice(5));return;} // 48-mail.js
    if(sel==='support'){renderSupport(side);return;} // 48-support.js
    ({tv:renderTv,emp:renderEmp,planning:renderPlanning,paie:renderPaie,duck:renderDuck})[sel](side);
    return;
  }
  if(!sel||!byKey[sel]){
    { // un seul contrôle : la famille choisie est mise en avant sur le plan, avec ses noms ; « Tous » = noms au survol
      const fb=document.createElement('div');
      fb.className='namesbar stack';
      fb.innerHTML='<span>Sur le plan</span>';
      const seg=document.createElement('div');
      seg.className='seg';
      seg.setAttribute('role','group');
      seg.setAttribute('aria-label','Famille mise en avant sur le plan');
      for(const [v,t,tip] of [[null,'Tous','Tout le monde, noms au survol'],['team','Équipe',"L'équipe en avant, avec les noms"],['wf','⚙ Agents','Les agents en avant, avec les noms'],['vis','💬 Visiteurs','Les visiteurs en avant, avec les noms']]){
        const b=document.createElement('button');
        b.textContent=t;
        b.title=tip;
        b.className=(FILTER===v?'on ':'')+(v?'famb fam-'+v:'');
        b.setAttribute('aria-pressed',String(FILTER===v));
        b.onclick=()=>{FILTER=v;if(!TV)NAMES=v?'all':'hover';renderSide();};
        seg.appendChild(b);
      }
      fb.appendChild(seg);side.appendChild(fb);}
    const groups=[["L'équipe",chars.filter(c=>c.person),'team'],['Les agents',chars.filter(c=>!c.person&&!c.visitor),'wf'],['Les visiteurs du jour',chars.filter(c=>c.visitor&&!c.guest),'vis'],
      ['Et aussi',chars.filter(c=>c.guest&&c.present),'misc']].filter(g=>!FILTER||g[2]===FILTER); // misc : invités du moment + le canard, vue « Tous » seulement
    for(const [title,list,fk] of groups){
    if(!list.length&&fk!=='misc')continue;
    const n=list.length+(fk==='misc'?1:0); // le canard est toujours là
    const closed=!!COLLAPSED[title];
    const h=document.createElement('h2');
    h.className='grp';
    h.setAttribute('role','button');
    h.tabIndex=0;
    h.setAttribute('aria-expanded',String(!closed));h.dataset.fid='grp:'+title;
    h.innerHTML=`<span class="chev">${closed?'▸':'▾'}</span><span class="famdot fam-${fk}"></span>${esc(title)} <span class="cnt">${n}</span>`;
    const toggle=()=>{COLLAPSED[title]=!closed;try{localStorage.setItem('bureau:collapsed',JSON.stringify(COLLAPSED));}catch(e){}renderSide();};
    h.onclick=toggle;h.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}};
    h.style.marginTop=title==="L'équipe"?'0':'14px';if(closed){side.appendChild(h);continue;}
    side.appendChild(h);
    if(title==='Les visiteurs du jour'){
      const n=document.createElement('div');
      n.style.cssText='color:var(--muted);font-size:12px;margin:-4px 0 6px';
      n.textContent='Tes discussions Kronn du jour';
      side.appendChild(n);
    }
    const box=document.createElement('div');box.className='roster';
    const sorted=list.slice().sort((a,b)=>rank(a)-rank(b));
    for(const c of sorted){
      const st=c._st||stateAt(c,T);
      const b=document.createElement('button');
      b.className='who fam-'+famOf(c);b.dataset.fid='who:'+c.key;
      b.onclick=()=>select(c.key);
      b.onmouseenter=b.onfocus=()=>{hoverKey=c.key;}; // au clavier aussi : la personne ressort sur le plan
      b.onmouseleave=b.onblur=()=>{if(hoverKey===c.key)hoverKey=null;};
      b.onkeydown=e=>{ // flèches : personne suivante ou précédente de la liste
        if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;
        const all=[...side.querySelectorAll('button.who')], i=all.indexOf(b), n=all[i+(e.key==='ArrowDown'?1:-1)];
        if(n){e.preventDefault();n.focus();}
      };
      b.appendChild(portrait(c,36));
      const t=document.createElement('div');t.className='t';
      const best=bestEmployee()[0];const trophy=best&&best.pts&&empChar(best)===c?' 🏆':'';
      t.innerHTML=`<div class="n">${esc(agentTag(c)+c.name)}${trophy}${c.apprentice?' <span class="appr" title="Apprenti">🎓 apprenti</span>':''}</div><div class="r">${esc(c.role)}</div>`;
      b.appendChild(t);
      const s=document.createElement('div');
      s.className='s';
      const nx=famOf(c)==='wf'&&cronTag(c); // agent cron au repos : son prochain passage sous son état
      s.innerHTML=`<span class="dot" style="background:${ST_CSS[st.st]||'var(--idle)'}"></span>${esc(shortSt(st))}${nx?`<small class="nx">${esc(nx)}</small>`:''}`;
      b.appendChild(s);box.appendChild(b);
    }
    if(fk==='misc')box.appendChild(duckRow());
    side.appendChild(box);}
    return;
  }
  const c=byKey[sel], st=c._st||stateAt(c,T);
  if(EDIT&&EDIT.k===c.key){renderEditor(side,c);return;}
  backButton(side);
  const f=document.createElement('div');f.className='face';f.appendChild(portrait(c,64));
  const ft=document.createElement('div');
  ft.innerHTML=`<div class="n">${esc(agentTag(c)+c.name)}${c.apprentice?' <span class="appr">🎓 apprenti</span>':''}</div><div class="r">${esc(c.role)}${c.name!==c.baseName?' · '+esc(c.baseName):''}</div>`;
  f.appendChild(ft);
  side.appendChild(f);
  if(!c.visitor){
    const eb=document.createElement('button');
    eb.className='edit-btn';
    eb.textContent=canLook(c)?'✎ Personnaliser':'✎ Renommer';
    eb.onclick=()=>openEditor(c);
    side.appendChild(eb);
    if(localOnly(c.key)){
      const n=document.createElement('div');
      n.className='note';
      n.textContent="Retouche visible seulement dans ton navigateur (pas encore enregistrée pour l'équipe).";
      side.appendChild(n);
    }
    }
  const s=document.createElement('div');
  s.className='stbox';s.dataset.key=c.key;
  s.innerHTML=s.dataset.sig=statusHtml(st);
  side.appendChild(s);
  if(st.step&&st.step.err){
    const e=document.createElement('div');
    e.className='steps';
    e.innerHTML=`<div class="e" style="margin-left:0">${esc(st.step.err)}</div>`;
    side.appendChild(e);
  }
  if(c.boss){const pr=presenceAt(c,T); // le boss reste à son bureau sur le plan : son absence ne se lit qu'ici et au calendrier
    if(pr.abs||pr.tt){const n=document.createElement('p');n.className='note';n.textContent='📅 Selon le planning : '+(pr.abs?ABS_LABEL[pr.abs].toLowerCase():'en télétravail')+'.';side.appendChild(n);}
  }
  if(c.boss&&todosOn()){const b=document.createElement('button');b.type='button';b.className='td-open'; // 47-todos.js : le tableau en liège, au clavier aussi
    const n=tdIn('todo').length;b.textContent='📌 Mes todos'+(n?' · '+n+' à faire':'');b.onclick=openTodos;side.appendChild(b);}
  if(c.boss){const p=document.createElement('p');p.style.color='var(--muted)';const gates=chars.filter(x=>gateRunsOf(x).length), lone=loneGates();
    const qs=QUESTIONS.filter(q=>(ms(q.since)||0)<=T);
    if(!gates.length&&!lone.length&&!qs.length){p.textContent="Personne n'attend ta validation. Le bureau tourne tout seul.";side.appendChild(p);}
    for(const x of gates)for(const r of gateRunsOf(x)){if(r)gateCard(side,r,x.name);else handCards(side,carriedFor(x,T));} // porteurs : les mails qu'ils remettent (48-mail.js)
    for(const g of lone)gateCard(side,{run:g.run,wf_name:g.wf_name,_s:ms(g.since)},null); // workflows sans personnage (« Le Bureau · plan »)
    for(const q of qs)questionCard(side,q,askerOf(q)); // questions des discussions (visiteurs, canard, « interroger »)
    const imp=chars.filter(x=>x.visitor&&x.disc&&x.disc.imp>0);
    if(imp.length){
      const box=foldSection(side,'alire','❗ À lire',imp.length,true);
      const ul=document.createElement('ul');
      ul.className='steps';
      ul.style.marginLeft='0';
      for(const v of imp){
        const li=document.createElement('li');
        li.innerHTML=`<span class="dot" style="background:var(--err)"></span><span>${esc(clean(v.disc.title).replace(/\s+/g,' ').slice(0,70))}</span><span class="k">${v.disc.imp} important${v.disc.imp>1?'s':''} · ${discLink(v.disc.id,'ouvrir')}</span>`;
        ul.appendChild(li);
      }
      box.appendChild(ul);}}
  if(st.st==='gate'&&st.run){for(const r of gateRunsOf(c))if(r)gateCard(side,r,null);} // toutes ses validations (deux MEP en même temps)
  else if(st.st==='gate'&&c.guest)handCards(side,carriedFor(c,T)); // porteur : les mails qu'il remet
  if(c.visitor&&c.disc)for(const q of discQuestions(c.disc.id,T))questionCard(side,q,null);
  musicCard(side,c);
  passionCards(side,c); // 38-passions.js : Smash, dramas, GitFut
  if(c.person){renderPerson(side,c);return;}
  if(c.guest)return; // invité de passage : son état suffit
  if(c.visitor){renderVisitor(side,c);return;}
  const done=(c.top||c.runs).filter(r=>r._s<=T);
  const ok=done.filter(r=>r.status==='Success').length, ko=done.filter(r=>r.status==='Failed').length;
  const tok=(c.top||c.runs).filter(r=>r._s<=T).reduce((a,r)=>a+(r.tok||0),0), dur=done.reduce((a,r)=>a+((r._e||T)-r._s),0);
  const stats=document.createElement('div');stats.className='stats';
  stats.innerHTML=`<div><b>${done.length}</b><span>runs</span></div><div><b style="color:var(--ok)">${ok}</b><span>réussis</span></div><div><b style="color:${ko?'var(--err)':'inherit'}">${ko}</b><span>échecs</span></div><div><b>${fmtTok(tok)}</b><span>tokens</span></div>`;
  side.appendChild(stats);
  programmeBlock(side,c);
  runBlock(side,c);
  askBlock(side,c);
  relaunchBlock(side,c);
  addedAgentBlock(side,c); // 66-newagent.js : agent ajouté depuis une baie
  payBlock(side,c);
  const wfs=[...new Set(c.runs.map(r=>clean(r.wf_name)))];
  if(wfs.length){
    const p=document.createElement('div');
    p.style.cssText='color:var(--muted);font-size:12px;margin-bottom:8px';
    p.textContent=(c.visitor?'Discussion : ':'Workflows : ')+wfs.join(' / ')+(dur?' · '+fmtDur(dur)+' de travail':'');
    side.appendChild(p);
  }
  const top=(c.top||c.runs).slice().reverse();
  const jb=foldSection(side,'day','Sa journée',top.length);
  if(!top.length){const e=document.createElement('div');e.className='empty';e.textContent="Rien aujourd'hui.";jb.appendChild(e);}
  for(const r of top){
    const d=memoDetails(document.createElement('details'),'run:'+r.run,false);if(r._s>T)d.className='future';
    const kids=(c.kids&&c.kids[r.run])||[];
    d.innerHTML=`<summary><span class="dot" style="background:${STATUS_COL[r.status]||'var(--idle)'}"></span><span class="tm">${hm(r._s)}</span><span class="wn">${esc(STATUS_TXT[r.status]||r.status)}${kids.length?' · '+kids.length+' sous-run'+(kids.length>1?'s':''):''}${r.msgs?' · '+r.msgs+' messages':''}</span><span class="du">${esc(fmtDur((r._e||Date.now())-r._s))}${r.tok?' · '+fmtTok(r.tok)+' tok':''}</span></summary>`;
    const ul=document.createElement('ul');ul.className='steps';
    {const src=r.tby||r.parent, oc=src&&chars.find(x=>x!==c&&x.runs.some(z=>z.run===src));
     if(oc){
       const li=document.createElement('li');
       li.innerHTML=`<span class="dot" style="background:${MEP_COLOR}"></span><span>📁 Lancé par ${esc(oc.name)}</span>`;
       ul.appendChild(li);
     }
     }
    for(const s of (r.steps||[])){
      const li=document.createElement('li');
      li.innerHTML=`<span class="dot" style="background:${STATUS_COL[s.s]||'var(--idle)'}"></span><span>${esc(s.n)}</span><span class="k">${esc(s.k||'')}${s.md?' · '+esc(s.md):''}${s.ms?' · '+fmtDur(s.ms):''}${s.tok?' · '+fmtTok(s.tok)+' tok':''}</span>`;
      ul.appendChild(li);
      if(s.err){const e=document.createElement('li');e.className='e';e.textContent=s.err;ul.appendChild(e);}
    }
    for(const k of kids){
      const li=document.createElement('li');
      li.innerHTML=`<span class="dot" style="background:${STATUS_COL[k.status]||'var(--idle)'}"></span><span>Sous-run ${hm(k._s)}</span><span class="k">${esc(fmtDur((k._e||Date.now())-k._s))}${k.tok?' · '+fmtTok(k.tok)+' tok':''}</span>`;
      ul.appendChild(li);
    }
    const linked=[r.run,...kids.map(k=>k.run)].flatMap(id=>DISC_BY_RUN[id]||[]);
    for(const v of linked){
      const li=document.createElement('li');
      li.innerHTML=`<span class="dot" style="background:#d97757"></span><span>Discussion : ${esc(clean(v.disc.title).replace(/\s+/g,' ').slice(0,60))}</span>`;
      const a=document.createElement('span');
      a.innerHTML=discLink(v.disc.id,'ouvrir');
      li.appendChild(a);
      ul.appendChild(li);
    }
    d.appendChild(ul);jb.appendChild(d);
  }
}
