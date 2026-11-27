// ---------- le Nazgûl, messager de l'Œil : il part de la tour, apporte un parchemin sur ton bureau, puis y retourne ----------
// Il ne fait le travail de personne : il porte ce que l'Œil a vu. Ses livraisons, datées par les données (rejouables) :
// - le rapport du matin, NAZ_REPORT avant le daily : ce qui est arrivé depuis la veille à 18 h (relectures demandées,
//   retours sur tes PR), s'il y a du neuf ;
// - dans la journée, chaque nouveauté pour toi : une PR dont on te demande la relecture (ouverte dans la journée : GitHub ne
//   date pas la demande), un nouveau retour sur une de tes PR (changements demandés, fil d'un relecteur).
// Une scène de NAZ_MS (fxEvents, 43-fx.js) ; rien sans la tour (objects.oeil), avec « réduire les animations », ni pour un
// brouillon. Données : OEIL (69-oeil.js).
const NAZ_MS=9e3, NAZ_REPORT=10*60e3;
// les nouveautés pour toi, datées : {at, k, txt}
function nazNews(){
  if(!OEIL)return [];
  const out=[];
  for(const p of OEIL.asked||[])if(!p.draft&&p.since)
    out.push({at:ms(p.since),k:'a:'+p.id,txt:'👀 '+oePrName(p)+' : relecture demandée'+(p.author?' par '+p.author:'')});
  for(const p of OEIL.mine||[])if(!p.draft&&p.last&&p.last.at&&(p.review==='changes'||p.threads>0))
    out.push({at:ms(p.last.at),k:'f:'+p.id+':'+p.last.at,txt:'🛠 '+oePrName(p)+' : '+(p.last.k==='changes'?'changements demandés':'un fil')+' · '+p.last.who});
  return out.sort((a,b)=>a.at-b.at);
}
// le rapport du matin du jour de t : NAZ_REPORT avant le daily, avec ce qui est arrivé depuis la veille à 18 h
function nazReport(t){
  const [h,m]=String(RHYTHM.daily||'09:40').split(':').map(Number), d=parisMidnight(t), at=d+((h||9)*60+(m||0))*60e3-NAZ_REPORT;
  const news=nazNews().filter(x=>x.at>d-6*36e5&&x.at<=at);
  return news.length?{at,news}:null;
}
// les livraisons du jour de t : le rapport, puis chaque nouveauté arrivée après lui
function nazDeliveries(t){
  if(!OEIR)return [];
  const r=nazReport(t), from=r?r.at:parisMidnight(t)+6*36e5, out=[];
  if(r)out.push({at:r.at,id:'naz:rapport:'+r.at,txt:'📜 Le rapport de l\'Œil : '+plural(r.news.length,'nouveauté','nouveautés')+' depuis hier soir'});
  for(const x of nazNews())if(x.at>from&&parisMidnight(x.at)===parisMidnight(t))out.push({at:x.at,id:'naz:'+x.k,txt:'📜 '+x.txt});
  return out;
}
function nazFxEvents(recent){return REDUCED_MOTION?[]:nazDeliveries(T).filter(x=>recent(x.at)).map(x=>({...x,kind:'nazgul',ms:NAZ_MS}));}
// la monture ailée et son cavalier : la planche générée (sprites/common/nazgul/nazgul-vol.png, decoupe.py vol), des cases
// carrées tournées vers la droite : plané, battement d'ailes (haut, milieu, bas, bas), le parchemin seul ; l'œil de la
// monture en NAZ_EYE de chaque case, posé où le dessin d'avant avait le sien. flap : la phase du battement, null en plané
const NAZ_EYE=[70,37], NAZ_FLAP=[1,2,3,4,3,2];
function nazFigure(x,y,dir,flap,scroll){
  const img=IMG['nazgul_vol'];if(!ready(img))return;
  const s=img.height, f=flap==null?0:NAZ_FLAP[Math.floor(flap*NAZ_FLAP.length)%NAZ_FLAP.length], ox=39-NAZ_EYE[0], oy=-15-NAZ_EYE[1];
  ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(dir,1);
  if(scroll)ctx.drawImage(img,5*s,0,s,s,ox,oy,s,s); // sous la figure : les griffes le tiennent
  ctx.drawImage(img,f*s,0,s,s,ox,oy,s,s);
  ctx.restore();
}
// la scène : de l'œil au bureau du boss (piqué), le parchemin posé, puis retour à la tour ; la bulle pendant la livraison
function nazDraw(e,now){
  const a=oeEyePos(); if(!a)return;
  const b=oeBoss(), desk={x:b.x+16,y:b.y-30}, p=Math.min(1,(now-e.t0)/e.ms), ease=u=>u<.5?2*u*u:1-Math.pow(-2*u+2,2)/2;
  let x,y,dir,scroll,glide=false;
  if(p<.35){const u=ease(p/.35);x=a.x+(desk.x-a.x)*u;y=a.y+(desk.y-a.y)*u-Math.sin(u*Math.PI)*40;dir=desk.x<a.x?-1:1;scroll=true;glide=u>.5&&u<.85;} // le piqué, ailes repliées
  else if(p<.6){x=desk.x;y=desk.y+Math.sin(now/120)*2;dir=desk.x<a.x?-1:1;scroll=p<.45;}
  else{const u=ease((p-.6)/.4);x=desk.x+(a.x-desk.x)*u;y=desk.y+(a.y-desk.y)*u-Math.sin(u*Math.PI)*40;dir=a.x<desk.x?-1:1;scroll=false;}
  if(p>=.45){ctx.fillStyle='#efe2c0';ctx.fillRect(b.x+10,b.y+4,12,8);ctx.fillStyle='#8a1010';ctx.fillRect(b.x+15,b.y+7,3,3);} // le parchemin sur le bureau
  ctx.fillStyle='rgba(0,0,0,.18)';ctx.beginPath();ctx.ellipse(x,Math.max(y+50,b.y+14),18,5,0,0,7);ctx.fill();
  nazFigure(x,y,dir,glide?null:now/600,scroll);
  if(p>.35&&p<.85)fxBubble(desk.x,desk.y-30,e.txt,'#7a1a1a');
}
