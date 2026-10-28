import { t } from './i18n.js';
import { getImage } from './assets.js';

const COLORS = ['#F2652B','#3B8EA5','#8E5CC9','#3C9D5D','#E0B23C','#D64A8A','#5B6B7F','#2BB3A3'];
const round = (ctx,x,y,w,h,r=5) => { ctx.beginPath(); ctx.roundRect(x,y,w,h,r); };
function rect(ctx,x,y,w,h,color,r=0) { ctx.fillStyle=color; if(r) { round(ctx,x,y,w,h,r);ctx.fill(); } else ctx.fillRect(x,y,w,h); }
function arrow(ctx,x,y,size,dir,color,width=2) {
  ctx.save();ctx.translate(x,y);ctx.rotate(dir*Math.PI/2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';
  ctx.beginPath();ctx.moveTo(0,size/2);ctx.lineTo(0,-size/2);ctx.moveTo(-size/3,-size/6);ctx.lineTo(0,-size/2);ctx.lineTo(size/3,-size/6);ctx.stroke();ctx.restore();
}
function imageTile(ctx,key,x,y,s) { const image=getImage(key); if (!image) return false; ctx.drawImage(image,x,y,s,s); return true; }
export function drawRobot(ctx,x,y,s,dir=0,color=COLORS[0],op='',alpha=1) {
  ctx.save();ctx.globalAlpha=alpha;ctx.translate(x,y);ctx.rotate(dir*Math.PI/2);
  const sprite=getImage(`robots/robot-${['N','E','S','O'][dir]}`);
  if (sprite) {ctx.rotate(-dir*Math.PI/2);ctx.drawImage(sprite,-s*.45,-s*.45,s*.9,s*.9);ctx.restore();return;}
  ctx.shadowColor='#1b1d2138';ctx.shadowBlur=s*.09;ctx.shadowOffsetY=s*.07;
  rect(ctx,-s*.28,-s*.32,s*.56,s*.67,color,s*.16);ctx.shadowColor='transparent';
  rect(ctx,-s*.36,-s*.19,s*.1,s*.33,'#282c32',s*.035);rect(ctx,s*.26,-s*.19,s*.1,s*.33,'#282c32',s*.035);
  rect(ctx,-s*.22,-s*.27,s*.44,s*.3,'#F7F6F2',s*.075);
  rect(ctx,-s*.18,-s*.23,s*.36,s*.2,'#23272E',s*.045);
  if(op) {ctx.fillStyle='#F7F6F2';ctx.font=`600 ${s*.115}px "JetBrains Mono",monospace`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(op,0,-s*.13);}
  else {rect(ctx,-s*.11,-s*.17,s*.065,s*.065,'#a1dbe0',s*.02);rect(ctx,s*.045,-s*.17,s*.065,s*.065,'#a1dbe0',s*.02);}
  rect(ctx,-s*.16,s*.12,s*.32,s*.05,'#ffffff50',s*.025);
  ctx.fillStyle='#F7F6F2';ctx.beginPath();ctx.arc(s*.16,s*.24,s*.025,0,Math.PI*2);ctx.fill();
  ctx.restore();
}
function drawPath(ctx,world,trace,s,ox,oy,color,active=false,robotId=world.robots[0]?.id) {
  if (!trace?.length) return;
  const start=(trace[0].before||world).robots.find(r=>r.id===robotId);if(!start)return;
  ctx.save();ctx.strokeStyle=color;ctx.lineWidth=active?3:2;ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash(active?[5,5]:[3,6]);
  const point=r=>[ox+(r.x+.5)*s,oy+(r.y+.5)*s];
  let previous=start;
  for(const frame of trace){
    const next=frame.world.robots.find(r=>r.id===robotId);if(!next)continue;
    // Respawns are discontinuities, rather than paths across walls.
    const fell=frame.events.some(e=>e.type==='fell'&&e.robotId===robotId);
    if(!fell){ctx.beginPath();ctx.moveTo(...point(previous));ctx.lineTo(...point(next));ctx.stroke();}
    else {const fall=frame.events.find(e=>e.type==='fell'&&e.robotId===robotId);const pos=fall.from||{x:previous.x,y:previous.y};const [fx,fy]=point(pos);ctx.setLineDash([]);ctx.strokeStyle='#D63A2F';ctx.beginPath();ctx.moveTo(fx-6,fy-6);ctx.lineTo(fx+6,fy+6);ctx.moveTo(fx+6,fy-6);ctx.lineTo(fx-6,fy+6);ctx.stroke();ctx.strokeStyle=color;ctx.setLineDash(active?[5,5]:[3,6]);}
    previous=next;
  }
  ctx.setLineDash([]);
  const occurrences=new Map();
  trace.forEach((frame,index)=>{
    const robot=frame.world.robots.find(r=>r.id===robotId);if(!robot)return;
    const key=`${robot.x},${robot.y}`,count=occurrences.get(key)||0;occurrences.set(key,count+1);
    let [x,y]=point(robot);x+=(count%3-1)*14;y+=active?-s*.25-Math.floor(count/3)*14:s*.24+Math.floor(count/3)*14;
    ctx.fillStyle=active?color:'#a6a7a2';ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=active?'#fff':'#fff';ctx.font='600 10px "JetBrains Mono",monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(index%6+1),x,y+.5);
    if(frame.events.some(e=>e.type==='turned'&&e.robotId===robotId)){ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,11,-Math.PI*.9,0);ctx.stroke();}
    if(frame.events.some(e=>e.type==='pushed'&&e.by===robotId)){ctx.fillStyle=color;ctx.fillRect(x+9,y+5,4,5);}
  });ctx.restore();
}
export function drawArena(canvas,world,options={}) {
  if(!canvas||!world)return;
  const box=canvas.getBoundingClientRect();
  const width=options.width||box.width||720,height=options.height||box.height||540;
  const dpr=options.dpr??Math.min(globalThis.devicePixelRatio||1,2);
  if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
  const margin=options.compact?12:27,s=Math.min((width-margin*2)/world.w,(height-margin*2)/world.h);
  const ox=(width-world.w*s)/2,oy=(height-world.h*s)/2;
  ctx.fillStyle=options.background||'#D5D4CD';ctx.fillRect(0,0,width,height);
  // Painted bay border and subtle coordinate labels keep the board legible.
  ctx.fillStyle='#b6b7ae';ctx.fillRect(ox-5,oy-5,world.w*s+10,world.h*s+10);
  for(let y=0;y<world.h;y++)for(let x=0;x<world.w;x++){
    const px=ox+x*s,py=oy+y*s,index=y*world.w+x,tile=world.tiles[index];
    if(!imageTile(ctx,`tiles/floor-${1+(x*3+y*7)%4}`,px,py,s)){
      rect(ctx,px,py,s,s,(x+y)%2?'#E6E4DD':'#EAE8E1');
      ctx.strokeStyle='#d5d3cb';ctx.lineWidth=1;ctx.strokeRect(px+.5,py+.5,s-1,s-1);
      rect(ctx,px+s*.12,py+s*.13,2,2,'#c9c7c0');rect(ctx,px+s*.85,py+s*.84,2,2,'#ceccc4');
    }
    if(tile===1&&!imageTile(ctx,'tiles/wall',px,py,s)){
      rect(ctx,px+3,py+6,s-6,s-6,'#8d9694',4);rect(ctx,px+3,py+3,s-6,s-8,'#b1b8b1',4);
      rect(ctx,px+6,py+6,s-12,s*.1,'#c9cec5',2);
      ctx.strokeStyle='#969f97';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px+10,py+s*.3);ctx.lineTo(px+s-10,py+s*.3);ctx.moveTo(px+10,py+s*.69);ctx.lineTo(px+s-10,py+s*.69);ctx.stroke();
      rect(ctx,px+7,py+s*.34,3,s*.25,'#858e86',1);rect(ctx,px+s-10,py+s*.34,3,s*.25,'#858e86',1);
    }
    if(tile===2&&!imageTile(ctx,'tiles/hole',px,py,s)){
      rect(ctx,px+3,py+3,s-6,s-6,'#34383c',4);rect(ctx,px+8,py+8,s-16,s-16,'#1B1D21',3);
      ctx.save();ctx.beginPath();ctx.rect(px+3,py+3,s-6,5);ctx.rect(px+3,py+s-8,s-6,5);ctx.clip();ctx.strokeStyle='#F2652B';ctx.lineWidth=5;
      for(let i=-s;i<s*2;i+=13){ctx.beginPath();ctx.moveTo(px+i,py);ctx.lineTo(px+i+s,py+s);ctx.stroke();}ctx.restore();
    }
    if(world.conveyors.has(index)){
      const dir=world.conveyors.get(index);ctx.save();ctx.translate(px+s/2,py+s/2);ctx.rotate(dir*Math.PI/2);
      if(!imageTile(ctx,'tiles/conveyor',-s/2,-s/2,s)){
        rect(ctx,-s*.44,-s*.47,s*.88,s*.94,'#c1d1ce',2);rect(ctx,-s*.42,-s*.46,s*.06,s*.92,'#567d83');rect(ctx,s*.36,-s*.46,s*.06,s*.92,'#567d83');
        for(let a=-2;a<=2;a++){ctx.strokeStyle='#8faeaf';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-s*.3,a*s*.2);ctx.lineTo(s*.3,a*s*.2);ctx.stroke();}
        arrow(ctx,0,0,s*.4,0,'#397d8c',3);
      }ctx.restore();
    }
  }
  if(world.exit){const{x,y}=world.exit,px=ox+x*s,py=oy+y*s;if(!imageTile(ctx,'tiles/exit',px,py,s)){
    rect(ctx,px+3,py+3,s-6,s-6,'#c8ded0',3);ctx.strokeStyle='#3C9D5D';ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.strokeRect(px+6,py+6,s-12,s-12);ctx.setLineDash([]);arrow(ctx,px+s*.5,py+s*.5,s*.42,1,'#33834e',3);
  }}
  for(const robot of world.robots){const hx=ox+robot.home.x*s,hy=oy+robot.home.y*s;ctx.strokeStyle='#F2652B66';ctx.lineWidth=1.5;ctx.setLineDash([3,4]);ctx.strokeRect(hx+s*.12,hy+s*.12,s*.76,s*.76);ctx.setLineDash([]);}
  for(const crate of world.crates){const px=ox+crate.x*s,py=oy+crate.y*s;if(!imageTile(ctx,'props/crate',px,py,s)){
    ctx.shadowColor='#0002';ctx.shadowBlur=3;ctx.shadowOffsetY=3;rect(ctx,px+s*.16,py+s*.16,s*.68,s*.7,'#507f8c',4);ctx.shadowColor='transparent';
    rect(ctx,px+s*.22,py+s*.2,s*.56,s*.08,'#739eaa',2);ctx.strokeStyle='#345f6c';ctx.lineWidth=3;ctx.strokeRect(px+s*.26,py+s*.34,s*.48,s*.34);
  }}
  for(const beacon of world.beacons){const px=ox+beacon.x*s,py=oy+beacon.y*s;if(!imageTile(ctx,'props/beacon',px,py,s)){
    ctx.fillStyle='#F2652B22';ctx.beginPath();ctx.arc(px+s*.5,py+s*.5,s*.36,0,Math.PI*2);ctx.fill();
    rect(ctx,px+s*.34,py+s*.34,s*.32,s*.32,'#F2652B',5);ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(px+s*.5,py+s*.5,s*.07,0,Math.PI*2);ctx.fill();
  }}
  drawPath(ctx,world,options.baseTrace,s,ox,oy,'#8f9594',false,options.robotId);
  drawPath(ctx,world,options.patchTrace,s,ox,oy,'#e45b25',true,options.robotId);
  for(let i=0;i<world.robots.length;i++){
    const robot=world.robots[i],old=options.from?.robots.find(r=>r.id===robot.id),p=options.progress??1;
    const teleport=old&&Math.abs(old.x-robot.x)+Math.abs(old.y-robot.y)>2;
    const x=old&&!teleport?old.x+(robot.x-old.x)*p:robot.x,y=old&&!teleport?old.y+(robot.y-old.y)*p:robot.y;
    let dir=robot.dir;if(old&&p<1){let delta=((robot.dir-old.dir+6)%4)-2;dir=old.dir+delta*p;}
    drawRobot(ctx,ox+(x+.5)*s,oy+(y+.5)*s,s,dir,COLORS[i%8],options.op||'');
  }
  if(!options.compact){ctx.font='500 10px "JetBrains Mono",monospace';ctx.fillStyle='#64716c';ctx.textAlign='center';ctx.textBaseline='middle';for(let x=0;x<world.w;x++)ctx.fillText(String.fromCharCode(65+x),ox+(x+.5)*s,oy-13);for(let y=0;y<world.h;y++)ctx.fillText(String(y+1).padStart(2,'0'),ox-14,oy+(y+.5)*s);}
}
export function describeArena(world){
  const r=world.robots[0];return t('arenaDescription',{w:world.w,h:world.h,x:r.x+1,y:r.y+1,dir:t(['north','east','south','west'][r.dir]),ex:(world.exit?.x??0)+1,ey:(world.exit?.y??0)+1,crates:world.crates.length,holes:[...world.tiles].filter(v=>v===2).length});
}
