// ---------- bulles : ticket(s) d'un collègue, ticket ou PR d'un agent ----------
const TYPE_ICO={Bug:'🐛',Story:'📗',Tâche:'🔧',Task:'🔧','Sous-tâche':'🔹','Sub-task':'🔹',Epic:'⚡'};
const CAT_TXT={doing:'en cours',review:'en review',test:'en test',todo:'à faire'};
const CAT_COLOR={doing:'#2e9e5b',review:'#4a7fe0',test:'#7a5cc8',todo:'#8a8478'};
const BUBBLE_ROT=4000; // une bulle à plusieurs tickets passe au suivant toutes les 4 s
const clip=(s,n)=>{s=clean(s).trim();return s.length>n?s.slice(0,n-1).trimEnd()+'…':s;};
const tkHead=(x,short)=>(TYPE_ICO[x.type]||'🎫')+' '+(short?String(x.key).replace(/^[A-Z][A-Z0-9]*-/,''):x.key); // compact : sans le préfixe projet
function tkAge(x,t){const u=x&&ms(x.updated);if(!u)return '';const d=Math.floor((t-u)/864e5);return d>=1?d+' j':'';}
function tkLines(x,t){
  const age=tkAge(x,t);
  return [{txt:tkHead(x)+' · '+(CAT_TXT[x.cat]||x.status||'')+(age?' · '+age:''),b:true,tone:CAT_COLOR[x.cat]},{txt:clip(x.summary,40)}];
}
// head : texte compact toujours affiché ; detail : lignes du survol / de la sélection ; tone : couleur de l'état du ticket
function bubbleFor(c,st,t,clock){
  const tk=st.tk||[];
  if(tk.length){
    const i=tk.length>1?(Math.floor(clock/BUBBLE_ROT)+keySeed(c.key))%tk.length:0, x=tk[i];
    return {
      head:tkHead(x,true)+(tk.length>1?' '+(i+1)+'/'+tk.length:''),
      tone:CAT_COLOR[x.cat]||null,
      detail:tk.slice(0,4).flatMap(y=>tkLines(y,t)).concat(tk.length>4?[{txt:'+ '+(tk.length-4)+' autre(s)'}]:[])
    };
  }
  const ref=st.ref;
  if(ref){
    const what=ref.key||'PR #'+ref.pr, short=ref.key?String(ref.key).replace(/^[A-Z][A-Z0-9]*-/,''):'#'+ref.pr, busy=['work','srv','meet'].includes(st.st);
    const detail=[{txt:'🤖 '+what+(ref.key&&ref.pr?' · PR #'+ref.pr:''),b:true,tone:ref.t?CAT_COLOR[ref.t.cat]:null}];
    if(ref.t||ref.title)detail.push({txt:clip(ref.t?ref.t.summary:ref.title,40)});
    if(st.step)detail.push({txt:clip('Étape '+st.step.n+(st.act?' · '+st.act.label:''),40)});
    return {
      head:busy?'🤖 '+short:st.bubble||'🤖 '+short,
      tone:busy&&ref.t?CAT_COLOR[ref.t.cat]:null,
      detail,
      cloud:busy,
      tool:busy?st.act||null:null
    };
  }
  if(!st.bubble)return null;
  // agent au travail : nuage = l'étape en cours, l'outil part dans sa propre bulle
  const think=!c.person&&!c.visitor&&['work','srv','meet'].includes(st.st);
  const head=think&&st.act?String(st.stepBubble||'...'):String(st.bubble);
  return {head:st.st==='work'&&!c.visitor?head.slice(0,18):head,tone:null,detail:null,cloud:think,tool:think?st.act||null:null};
}
// ---------- double bulle (d'après ThoughtBubble.ts / ToolBubble.ts de Munder Difflin) ----------
// nuage clair = ce que fait l'agent (étape, ticket) ; bulle sombre = l'outil en cours, en entier pendant TOOL_FULL
// après chaque changement d'outil, puis réduite à son icône tant que l'outil reste le dernier connu (< 5 min)
const TOOL_FULL=6000, TOOL_POP=150;
function toolPhase(c,a,now){
  if(!a){c._tool=null;return null;}
  if(!c._tool||c._tool.k!==a.label)c._tool={k:a.label,since:now};
  const age=now-c._tool.since;
  return {full:age<TOOL_FULL,pop:Math.min(1,age/TOOL_POP)};
}
function drawCloud(bx,by,w,h,tx,ty){
  ctx.fillStyle='rgba(0,0,0,.22)';ctx.beginPath();ctx.roundRect?ctx.roundRect(bx+1,by+2,w,h,6):ctx.rect(bx+1,by+2,w,h);ctx.fill();
  ctx.fillStyle='#fffdf5';ctx.strokeStyle='#1a1320';ctx.lineWidth=1;
  ctx.beginPath();ctx.roundRect?ctx.roundRect(bx+.5,by+.5,w,h,6):ctx.rect(bx+.5,by+.5,w,h);ctx.fill();ctx.stroke();
  // deux bouffées qui descendent vers la tête
  for(const [k,r] of [[.35,2.5],[.7,1.6]]){
    const px=bx+w/2+(tx-(bx+w/2))*k, py=by+h+(ty-(by+h))*k;
    ctx.beginPath();ctx.arc(Math.round(px)+.5,Math.round(py)+.5,r,0,7);ctx.fill();ctx.stroke();
  }
}
function drawToolBubble(a,ph,bx,by){
  const txt=ph.full?a.bubble:a.ico;
  const S=TV?TV_TXT:1;
  ctx.font=ph.full?'bold '+Math.round(9*S)+'px ui-monospace,Menlo,monospace':Math.round(11*S)+'px system-ui,sans-serif';
  const w=Math.ceil(ctx.measureText(txt).width)+(ph.full?10:6), h=Math.round((ph.full?14:15)*S), y=by-h-3+Math.round((1-ph.pop)*3);
  ctx.globalAlpha=ph.pop*.95;
  R(ctx,bx,y,w,h,'#1a1320');
  ctx.fillStyle='#fffdf5';ctx.textBaseline='middle';ctx.textAlign='center';ctx.fillText(txt,bx+w/2,y+h/2+1);
  ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.globalAlpha=1;
}
const isFocus=c=>(sel===c.key||hoverKey===c.key)&&!!((c._st||{}).tk||(c._st||{}).ref);
// bulle détaillée au-dessus du personnage (survol ou sélection), gardée dans le canvas
function drawDetail(c,now){
  const st=c._st||{}, bb=bubbleFor(c,st,T,now); if(!c.pos||!bb||!bb.detail)return;
  const x=Math.round(c.pos.x), y=Math.round(c.pos.y), lh=15, pad=7;
  const fontOf=l=>(l.b?'bold 12px':'11px')+' ui-sans-serif,system-ui,sans-serif';
  let w=0;for(const l of bb.detail){ctx.font=fontOf(l);w=Math.max(w,Math.ceil(ctx.measureText(l.txt).width));}
  w+=pad*2+4;const h=bb.detail.length*lh+pad;
  const bx=Math.max(4,Math.min(W-w-4,x-w/2)), by=Math.max(4,y-70-h-(sel===c.key?8:0));
  ctx.fillStyle='rgba(0,0,0,.3)';ctx.fillRect(bx+2,by+3,w,h);
  ctx.fillStyle='#fffdf8';ctx.fillRect(bx,by,w,h);
  ctx.fillRect(Math.max(bx+4,Math.min(bx+w-8,x-2)),by+h,4,3);
  ctx.textBaseline='middle';ctx.textAlign='left';
  bb.detail.forEach((l,i)=>{
    const ly=by+pad/2+i*lh;
    if(l.tone){ctx.fillStyle=l.tone;ctx.fillRect(bx,ly,3,l.b&&bb.detail[i+1]&&!bb.detail[i+1].b?lh*2:lh);}
    ctx.font=fontOf(l);ctx.fillStyle=l.b?'#25221d':'#5c564c';ctx.fillText(l.txt,bx+pad+2,ly+lh/2+.5);
  });
  ctx.textBaseline='alphabetic';
}
