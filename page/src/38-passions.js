// ---------- passions de l'équipe (roster, clé passion) ----------
// Moments sur le plan, une fois par jour ouvré à une heure tirée au sort (la même pour tous) : badminton (le volant
// traverse la pièce), basket (1 min de tirs au panier), boxe (sac de frappe). soir_holo : vient travailler le soir en
// semi-hologramme jusqu'à 3 h du matin, avec son robot IA. Cartes de fiche : Smash Bros, top 3 dramas, carte GitFut (dataset gitfut).
const PASSION_MOMENTS={
  badminton:{min:2,label:'Badminton : frappe un volant à travers la pièce',bubble:'🏸'},
  basket:{min:1,label:'Une minute de tirs au panier',bubble:'🏀'},
  boxe:{min:2,label:'Gants de boxe : quelques séries au sac de frappe',bubble:'🥊'}
};
const PASSION_WINDOW=[10*60+30,17*60]; // minutes de Paris : jamais au daily (9h40) ni en fin de journée
const HOLO_END=3; // le soir en hologramme : de la fin des heures de bureau à 3 h du matin
const passionOf=c=>c&&c.passion&&typeof c.passion==='object'?c.passion:null;
// créneau du jour {s, e} (ms) ou null : week-end, pas de moment, ou personne sans place
function passionSlot(c,t){
  const p=passionOf(c), m=p&&PASSION_MOMENTS[p.moment];
  if(!m||!c.seat||RHYTHM.weekend.includes(parisHM(t).wd))return null;
  const r=rng(keySeed(c.key)*31+daySeed(t)), d0=parisMidnight(t);
  const s=d0+Math.round(PASSION_WINDOW[0]+r()*(PASSION_WINDOW[1]-PASSION_WINDOW[0]))*60e3;
  return {s,e:s+m.min*60e3};
}
// état d'un moment (stateAt0, après les scènes d'équipe) : debout dans l'allée à côté de sa place
function passionMoment(c,t){
  const sl=passionSlot(c,t); if(!sl||t<sl.s||t>=sl.e)return null;
  const k=passionOf(c).moment, m=PASSION_MOMENTS[k];
  return {st:'passion',passion:k,since:sl.s,zone:'visit',visit:besideSeat(c.seat),human:true,label:m.label,bubble:m.bubble};
}
// le soir (jours ouvrés) : au bureau en semi-hologramme ; null sinon
function holoEvening(c,t){
  const p=passionOf(c); if(!p||p.moment!=='soir_holo'||!c.seat)return null;
  const ph=parisHM(t), late=ph.h<HOLO_END; if(!late&&ph.h<RHYTHM.office_hours[1])return null;
  const wd=late?parisHM(t-(ph.h+1)*3600e3).wd:ph.wd; // après minuit : la soirée de la veille (vendredi soir jusqu'au samedi 3 h)
  if(RHYTHM.weekend.includes(wd))return null;
  return {st:'work',zone:'desk',human:true,holo:true,label:'Travaille le soir, en hologramme avec son robot IA'};
}
// ---------- dessin (après le sprite, 41-people.js) ----------
const pDisc=(x,y,r,col)=>{ctx.fillStyle=col;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill();};
function drawPassion(c,x,y,now){
  const s=c._st||{};
  if(s.holo){drawHoloOverlay(x,y,now);drawRobot(x+(c.dir==='left'?-22:18),y-34+Math.round(Math.sin(now/500)*2),now);return;}
  if(s.st!=='passion'||c.moving)return;
  const away=c.dir==='right'?-1:c.dir==='left'?1:0, el=T-s.since; // dos à son bureau : vers l'allée
  if(s.passion==='badminton'){
    R(ctx,x+6,y-30,2,8,'#c0392b');ctx.strokeStyle='#e8e8e8';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x+8,y-36,3,5,.4,0,7);ctx.stroke();
    const k=(now%2400)/2400, dist=12*TS*(away||1), sx=x+8+dist*k, sy=y-40-Math.sin(k*Math.PI)*5*TS; // le volant traverse la pièce et revient
    pDisc(sx,sy+2,1.5,'#d1453b');ctx.fillStyle='#fbfbf6';ctx.beginPath();ctx.moveTo(sx-2,sy+1);ctx.lineTo(sx+2,sy+1);ctx.lineTo(sx+4,sy-5);ctx.lineTo(sx-4,sy-5);ctx.fill();
  }else if(s.passion==='basket'){
    const hx=x+(away||1)*3*TS, hy=y-30;
    R(ctx,hx-1,hy+4,2,26,'#7a7f8c');R(ctx,hx-5,hy+28,10,2,'#4a4e58');R(ctx,hx-8,hy-8,16,11,'#fbfbf6');R(ctx,hx-3,hy-5,6,5,'#d1453b');R(ctx,hx-2,hy-4,4,3,'#fbfbf6');
    R(ctx,hx-(away||1)*9-5,hy+3,10,2,'#e8701a');
    const k=(now%1500)/1500, bx=x+((hx-(away||1)*9)-x)*k, by=y-36-Math.sin(k*Math.PI)*2.2*TS+(k*6);
    pDisc(bx,by,3,'#e8701a');R(ctx,bx-3,by,6,1,'#5a2a0a');
    const shots=Math.floor(el/6000)+1, made=Math.round(shots*.7);
    ctx.font='bold 9px ui-monospace,Menlo,monospace';ctx.textAlign='center';ctx.fillStyle='#ffd27a';
    if(k>.85)ctx.fillText('SWISH!',hx,hy-12);
    ctx.fillStyle='#fffdf8';ctx.fillText(made+'/'+shots,x,y+14);ctx.textAlign='left';
  }else if(s.passion==='boxe'){
    const bx=x+(away||-1)*20, hit=Math.floor(now/400)%2;
    R(ctx,bx,y-50,1,12,'#7a7f8c');R(ctx,bx-5,y-38+(hit?1:0),11,24,'#8a2a22');R(ctx,bx-5,y-38,11,3,'#a8382e');R(ctx,bx-4,y-17,9,3,'#5a1a14');
    const fx=x+(away||-1)*(hit?10:5);
    R(ctx,fx-3,y-26,6,5,'#d1453b');R(ctx,x-(away||-1)*4-3,y-24,6,5,'#d1453b');
    if(hit){ctx.font='bold 9px system-ui';ctx.fillStyle='#ffd27a';ctx.textAlign='center';ctx.fillText('POW!',bx,y-44);ctx.textAlign='left';}
  }
}
// semi-hologramme : le personnage reste reconnaissable, reflet bleu et lignes de balayage qui défilent
function drawHoloOverlay(x,y,now){
  ctx.save();ctx.shadowColor='#5fd4ff';ctx.shadowBlur=10;ctx.fillStyle='rgba(95,212,255,.10)';ctx.fillRect(x-12,y-50,24,50);ctx.shadowBlur=0;
  const off=Math.floor(now/150)%4;ctx.fillStyle='rgba(120,220,255,.22)';for(let k=0;k<12;k++)ctx.fillRect(x-12,y-50+k*4+off,24,1);ctx.restore();
}
function drawRobot(x,y,now){
  ctx.save();ctx.globalAlpha=.9;ctx.shadowColor='#5fd4ff';ctx.shadowBlur=6;
  R(ctx,x+3,y-3,1,3,'#7fe4ff');R(ctx,x+2,y-4,3,1,'#bff3ff');R(ctx,x,y,8,6,'#3fb8e8');R(ctx,x+1,y+1,6,4,'#1d6f9a');
  const blink=Math.floor(now/2200)%9===0;R(ctx,x+2,y+2,1,blink?1:2,'#d8fbff');R(ctx,x+5,y+2,1,blink?1:2,'#d8fbff');
  R(ctx,x+1,y+7,6,5,'#3fb8e8');R(ctx,x-1,y+8,2,3,'#3fb8e8');R(ctx,x+7,y+8,2,3,'#3fb8e8');
  ctx.shadowBlur=0;ctx.globalAlpha=.3;pDisc(x+4,y+16,3,'#5fd4ff');ctx.restore();
}
// ---------- cartes de fiche ----------
let GITFUT={}, POSTERS={};
function readPosters(src){try{let d=src&&src.datasets&&src.datasets.gitfut;if(d&&d.current!==undefined)d=d.current;if(typeof d==='string')d=JSON.parse(d);return d&&d.posters&&typeof d.posters==='object'?d.posters:null;}catch(e){return null;}}
function readGitfut(src){
  try{if(!src||!src.datasets)return null;let d=src.datasets.gitfut;if(d&&d.current!==undefined)d=d.current;if(typeof d==='string')d=JSON.parse(d);
    return d&&d.cards&&typeof d.cards==='object'?d.cards:null;}catch(e){return null;}
}
const GF_IMG_OK=/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/, GF_CUT={};
// la carte sans le fond de l'image gitfut : remplissage depuis les coins des pixels bleu nuit, rendus transparents
function gitfutCutout(src,done){
  if(GF_CUT[src])return done(GF_CUT[src]);
  const im=new Image();
  im.onload=()=>{try{
    const w=im.naturalWidth,h=im.naturalHeight,cv2=document.createElement('canvas');cv2.width=w;cv2.height=h;const g=cv2.getContext('2d');g.drawImage(im,0,0);
    const d=g.getImageData(0,0,w,h),a=d.data,seen=new Uint8Array(w*h),st=[0,w-1,(h-1)*w,h*w-1];
    const bg=i=>a[i*4]<70&&a[i*4+1]<70&&a[i*4+2]<110&&a[i*4+2]>=a[i*4]; // bleu nuit (fond gitfut), jamais l'or de la carte
    while(st.length){const i=st.pop();if(seen[i]||!bg(i))continue;seen[i]=1;a[i*4+3]=0;const x=i%w;
      if(x>0)st.push(i-1);if(x<w-1)st.push(i+1);if(i>=w)st.push(i-w);if(i<w*(h-1))st.push(i+w);}
    g.putImageData(d,0,0);GF_CUT[src]=cv2.toDataURL('image/png');done(GF_CUT[src]);
  }catch(e){done(src);}};
  im.onerror=()=>done(src);im.src=src;
}
function passionCards(side,c){
  const p=passionOf(c)||{}, gf=GITFUT[c.key];
  if(gf&&gf.img&&GF_IMG_OK.test(gf.img)){
    const sec=foldSection(side,'gitfut','⚽ Sa carte GitFut',null,true), a=document.createElement('a');
    a.className='gitfut';a.href='https://gitfut.com/'+encodeURIComponent(gf.login||'');a.target='_blank';a.rel='noopener';a.title=gf.desc||'GitFut';
    const img=document.createElement('img');img.alt=gf.desc||'Carte GitFut';a.append(img);sec.append(a);
    gitfutCutout(gf.img,u=>{img.src=u;});
  }
  if(p.smash){
    const s=p.smash, sec=foldSection(side,'smash','🎮 Smash Bros Ultimate',null,true);
    const chips=smashChips(s);
    sec.insertAdjacentHTML('beforeend',`<div class="pcard smash"><div class="pc-ball" aria-hidden="true"></div><div class="pc-main"><b>${esc(s.pseudo||'Pseudo à venir')}</b>`+
      `<small>${s.main?'Main : '+esc(s.main):'Perso principal à venir'}</small>${chips?`<div class="pc-chips">${chips}</div>`:''}`+
      `${/^https:\/\//.test(s.url||'')?`<a href="${esc(s.url)}" target="_blank" rel="noopener">Voir son profil ↗</a>`:''}</div></div>`);
  }
  if(p.dramas)top3Card(side,'dramas','📺 Top 3 dramas','les dramas de '+c.name,p.dramas);
  if(p.top3)top3Card(side,'top3','🎬 Top 3 · '+(p.top3.title||'ses préférés'),p.top3.title||'ses préférés',p.top3);
}
// carte « TOP 3 » façon Netflix : grands chiffres détourés, trois affiches ; top = 3 titres, now = en cours (facultatif)
function top3Card(side,id,section,what,cfg){
  const top=(cfg.top||[]).slice(0,3), sec=foldSection(side,id,section,null,true);
  const grads=[['#8a2a5a','#1a1030'],['#2a5a8a','#101830'],['#5a8a2a','#102010']];
  sec.insertAdjacentHTML('beforeend',`<div class="pcard drama"><div class="pc-top"><span>TOP 3</span> · ${esc(what)}</div><div class="pc-posters">`+
    [0,1,2].map(i=>{const im=POSTERS[(cfg.wiki||[])[i]], img=im&&GF_IMG_OK.test(im)?`<img src="${im}" alt="">`:''; // affiche (dataset gitfut, posters)
      return `<div class="pc-poster"><i>${i+1}</i><div style="background:linear-gradient(160deg,${grads[i][0]},${grads[i][1]})">${img}<b>${esc(top[i]||'À venir')}</b></div></div>`;}).join('')+
    `</div>${cfg.now?`<small>En ce moment : ${esc(cfg.now)}</small>`:''}</div>`);
}

// pastilles de la carte Smash : rank (texte, ou liste : mondial, Europe, France…, la première en avant), puis le dernier tournoi
function smashChips(s){
  const ranks=(Array.isArray(s.rank)?s.rank:[s.rank]).filter(r=>typeof r==='string'&&r);
  return [...ranks.map((r,i)=>`<span${i?'':' class="pc-hot"'}>${esc(r)}</span>`),s.tournament&&`<span>${esc(s.tournament)}</span>`].filter(Boolean).join('');
}
