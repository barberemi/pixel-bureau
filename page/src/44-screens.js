// ---------- écrans des postes (d'après DeskScreen.ts de Munder Difflin) ----------
// work : l'occupant travaille assis, du code défile et le curseur clignote ; idle : assis sans travailler, écran de veille ;
// sleep : présent mais parti de sa place, voyant de veille ; crash : en panne, l'écran clignote en rouge ; off : absent.
function screenState(o){
  if(!o||!o.present||!o._st)return 'off';
  const st=o._st.st;
  if(st==='error')return 'crash';
  const seated=!o.moving&&(o.boss?o.atBoss:o._st.zone==='desk');
  if(!seated)return 'sleep';
  return st==='work'||st==='boss'?'work':'idle';
}
const SCREEN_INK=['#7fd1ff','#a6e3a1','#f9e2af','#cba6f7','#e6e6e6'];
function drawScreen(x,y,w,h,mode,now,seed){
  if(mode==='off'){R(ctx,x,y,w,h,'#1b1d24');return;}
  if(mode==='sleep'){R(ctx,x,y,w,h,'#161a26');if(Math.floor(now/1000+seed)%2)R(ctx,x+w-1,y+h-1,1,1,'#e0a020');return;}
  if(mode==='crash'){
    const on=Math.floor(now/400+seed)%2;
    R(ctx,x,y,w,h,on?'#c0392b':'#5a1010');
    if(on&&h>=8){const cx=x+Math.floor(w/2);R(ctx,cx,y+2,1,h-6,'#ffffff');R(ctx,cx,y+h-3,1,1,'#ffffff');}
    return;
  }
  if(mode==='idle'){
    R(ctx,x,y,w,h,'#1d3550');
    const k=now/2600+seed, px=x+Math.round((Math.sin(k*1.7)+1)/2*(w-2)), py=y+Math.round((Math.cos(k)+1)/2*(h-2));
    R(ctx,px,py,2,2,'#7fd1ff');
    return;
  }
  // work : lignes de code qui défilent vers le haut, curseur sur la dernière ligne
  R(ctx,x-2,y-2,w+4,h+4,'rgba(120,190,255,.16)');
  R(ctx,x,y,w,h,'#12304a');
  const rows=Math.floor((h-1)/2), off=Math.floor(now/260+seed*7);
  for(let i=0;i<rows;i++){
    const n=i+off, ind=hash(n,seed+1)<.3?1:0, len=Math.max(1,Math.floor(hash(n,seed)*(w-1-ind)));
    if(i===rows-1){if(Math.floor(now/450)%2)R(ctx,x+1+ind,y+1+i*2,Math.min(2,w-2),1,'#ffffff');continue;}
    R(ctx,x+ind+(w>8?1:0),y+1+i*2,len,1,SCREEN_INK[Math.floor(hash(n,seed+2)*SCREEN_INK.length)]);
  }
}
