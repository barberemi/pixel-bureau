// ---------- bandeau « Qui fait quoi » : une carte par collègue présent et par agent actif ----------
const WHO_ACTIVE=['work','srv','meet','gate','error','mep','ask','party','daily','planning','retro'];
const WHO_ATTN=['gate','ask','error'];
const PORTRAIT_URL={};
function portraitUrl(c){
  if(PORTRAIT_URL[c.key])return PORTRAIT_URL[c.key];
  if(!ready(spriteOf(c)))return '';
  try{return PORTRAIT_URL[c.key]=portrait(c,28).toDataURL();}catch(e){return '';}
}
const sinceTxt=d=>d<60e3?"à l'instant":hmin(Math.round(d/60e3));
// ce que montre la carte : what = sujet (ticket, PR, workflow, discussion, sur 2 lignes), sub = détail (étape, outil, état
// du ticket, sur 1 ligne), tip = infobulle (le tout, avec la liste complète des tickets)
const tkWhat=x=>tkHead(x)+' '+clip(tkComp(x.summary).title,90);
const tkTip=list=>list.map(x=>x.key+' '+tkComp(x.summary).title).join('\n');
const moreTk=n=>n>1?' · +'+(n-1)+' autre'+(n>2?'s':''):'';
function whoLine(c,st,t,pub){
  if(c.boss)return bossLine(c,st,pub);
  if(st.abs)return {what:st.label,sub:''};
  if(st.head)return {what:st.head,sub:st.sub||'',tone:st.chips&&st.chips.length?CAT_COLOR[st.chips[0].cat]:null,tip:st.chips?tkTip(st.chips):''}; // rôles (testeur, PO, facilitatrice) : titre court, détail en gris
  if(st.tk&&st.tk.length){
    const x=st.tk[0], age=tkAge(x,t);
    return {
      what:tkWhat(x),
      sub:(CAT_TXT[x.cat]||x.status||'')+(age?' depuis '+age:'')+moreTk(st.tk.length),
      tone:CAT_COLOR[x.cat],
      tip:st.tk.length>1?tkTip(st.tk):''
    };
  }
  if(c.visitor&&c.disc)return {what:'💬 '+clip(c.disc.title,60),sub:st.label};
  if(st.ref){
    const r=st.ref, what='🤖 '+(r.key||'PR #'+r.pr)+(r.key&&r.pr?' · PR #'+r.pr:'')+' '+clip(r.t?r.t.summary:r.title||'',50);
    return {what,sub:clip((st.step?'Étape '+st.step.n:st.label)+(st.act?' · '+st.act.label:''),80),tone:r.t?CAT_COLOR[r.t.cat]:null};
  }
  if(st.run)return {what:'⚙ '+clip(st.run.wf_name,60),sub:clip((st.step?'Étape '+st.step.n:st.label)+(st.act?' · '+st.act.label:''),80)};
  return {what:st.label||'',sub:''};
}
// le boss : son ticket en cours, puis ce qui l'attend (validations, questions) et ses discussions Kronn en cours
function bossLine(c,st,pub){ // pub : écran partagé (TV), sans ce qui n'attend que le boss
  const open=((c.team&&c.team.tickets)||[]).filter(x=>x.cat!=='done');
  const tk=[...open.filter(x=>x.cat==='doing'),...open.filter(x=>x.cat==='review'||x.cat==='test')];
  const n=k=>chars.filter(x=>x._st&&x._st.st===k).length, gates=n('gate')+loneGates().length, asks=n('ask');
  const talks=chars.filter(x=>x.visitor&&x._st&&x._st.st==='meet').length;
  const pl=(k,a,b)=>k+' '+(k>1?b:a);
  const extra=[
    gates?'✋ '+pl(gates,'validation à faire','validations à faire'):'',
    asks?'❓ '+pl(asks,'question en attente','questions en attente'):'',
    talks?'💬 '+pl(talks,'discussion Kronn en cours','discussions Kronn en cours'):''
  ].filter(Boolean).filter(x=>!pub||x.startsWith('💬'));
  if(!tk.length)return {what:extra[0]||st.label||'Au bureau',sub:extra.slice(1).join(' · ')};
  const x=tk[0];
  return {
    what:tkWhat(x),
    sub:[...extra,(CAT_TXT[x.cat]||'')+moreTk(tk.length)].join(' · '),
    tone:CAT_COLOR[x.cat],
    tip:tk.length>1?tkTip(tk):''
  };
}
function whoCards(t,teamOnly){
  const list=chars.filter(c=>!c.guest&&c._st&&(!teamOnly||c.person)&&(c.person&&c._st.abs&&c._st.abs!=='ferie'||c.present!==false&&(c.boss||c.person?!['off','absent','gone'].includes(c._st.st):WHO_ACTIVE.includes(c._st.st))));
  const score=c=>c.boss?-1e9:c._st.abs?1e9+rank(c):(WHO_ATTN.includes(c._st.st)?0:c.person?1:2)*1000+rank(c); // les absents en dernier (36-absences.js)
  return list.sort((a,b)=>score(a)-score(b)).map(c=>{
    const st=c._st, l=whoLine(c,st,t,teamOnly), run=st.run;
    return {
      c,st,
      attn:WHO_ATTN.includes(st.st),
      since:!c.person&&run&&run._s<=t?sinceTxt(t-run._s):'',
      ...l
    };
  });
}
let WHO_SIG='';
function renderWho(){
  const box=document.getElementById('who'); if(!box||!DATA)return;
  const cards=whoCards(T);
  const attn=cards.filter(x=>x.attn).length;
  const head=`<h2 class="grp" data-who-toggle role="button" tabindex="0" aria-expanded="${!COLLAPSED.who}"><span class="chev">${COLLAPSED.who?'▸':'▾'}</span>Qui fait quoi <span class="cnt">${cards.length}</span>${attn?`<span class="cnt attn">${attn} pour toi</span>`:''}</h2>`;
  const body=COLLAPSED.who?'':'<div class="who-grid">'+cards.map(x=>{
    const img=portraitUrl(x.c);
    const tip=[x.what,x.sub,x.tip].filter(Boolean).join('\n');
    return `<button class="wc${x.attn?' attn':''}${x.st.abs?' abs':''}${sel===x.c.key?' on':''}" data-who="${esc(x.c.key)}" title="${esc(tip)}" style="--st:${ST_CSS[x.st.st]||'var(--idle)'};--tk:${x.tone||'transparent'}">`+
      `<span class="wp">${img?`<img src="${img}" alt="">`:''}</span>`+
      `<span class="wt"><span class="wn">${esc(agentTag(x.c)+x.c.name)}<span class="ws">${esc(shortSt(x.st))}${x.since?' · '+esc(x.since):''}</span></span>`+
      `<span class="ww${x.tone?'':' nt'}">${esc(x.what)}</span>${x.sub?`<span class="wsub">${esc(x.sub)}</span>`:''}</span></button>`;
  }).join('')+'</div>';
  const html=head+body;
  if(html===WHO_SIG)return;
  WHO_SIG=html;box.innerHTML=html;
}
{
  const box=document.getElementById('who');
  if(box){
    box.addEventListener('click',e=>{
      if(e.target.closest('[data-who-toggle]')){COLLAPSED.who=!COLLAPSED.who;try{localStorage.setItem('bureau:collapsed',JSON.stringify(COLLAPSED));}catch(err){}renderWho();return;}
      const b=e.target.closest('[data-who]');if(b)select(b.dataset.who);
    });
    box.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.closest('[data-who-toggle]')){e.preventDefault();e.target.click();}});
    box.addEventListener('mouseover',e=>{const b=e.target.closest('[data-who]');if(b)hoverKey=b.dataset.who;});
    box.addEventListener('mouseleave',()=>{hoverKey=null;});
  }
}
