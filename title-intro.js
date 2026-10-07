// DEAD AIR title intro: a broadcast test card (SMPTE-style colour bars) that glitches, tears, drops to static and
// resolves into the title. Self-contained: it owns one full-screen <canvas id="intro-card"> and removes it when done.
//
//   0.00-1.05  colour bars (1 kHz tone once audio is allowed)
//   1.05-1.40  tear / roll / channel flashes (tone stutters)
//   1.40-1.75  static
//   1.75-2.70  title card resolves, then the canvas fades out over the real DOM title
//
// Audio can only start after a user gesture, so visuals run immediately and the sound is scheduled from the
// current intro time when the first click / key arrives. A second gesture (or Esc / Space / Enter) skips.
// prefers-reduced-motion skips the intro entirely.

import {INTRO_TOTAL,introPhaseAt} from './music-core.js';
import {armMusicOnGesture} from './music.js';

const BARS=['#c0c0c0','#c0c000','#00c0c0','#00c000','#c000c0','#c00000','#0000c0'];
const MID=['#0000c0','#131313','#c000c0','#131313','#00c0c0','#131313','#c0c0c0'];

function drawBars(g,W,H,t){
  const top=H*.67,mid=H*.08,bw=W/7;
  BARS.forEach((c,i)=>{g.fillStyle=c;g.fillRect(i*bw,0,bw+1,top);});
  MID.forEach((c,i)=>{g.fillStyle=c;g.fillRect(i*bw,top,bw+1,mid);});
  const y=top+mid,h=H-y,w5=bw*5/4*1.0;
  ['#00214c','#ffffff','#32006a','#131313'].forEach((c,i)=>{g.fillStyle=c;g.fillRect(i*bw*1.25,y,bw*1.25+1,h);});
  ['#090909','#131313','#1d1d1d'].forEach((c,i)=>{g.fillStyle=c;g.fillRect(bw*5+i*bw*2/3,y,bw*2/3+1,h);});
  g.fillStyle='#131313';g.fillRect(bw*5+bw*2,y,W,h);
  void w5;
  // station ID plate
  const pw=Math.min(W*.46,520),ph=Math.min(H*.2,120),px=(W-pw)/2,py=H*.34-ph/2;
  g.fillStyle='rgba(0,0,0,.88)';g.fillRect(px,py,pw,ph);
  g.strokeStyle='#e8e3d6';g.lineWidth=2;g.strokeRect(px+4,py+4,pw-8,ph-8);
  g.fillStyle='#f1ecdd';g.textAlign='center';g.textBaseline='middle';
  g.font=`700 ${Math.round(ph*.34)}px 'DM Mono','DejaVu Sans Mono',monospace`;g.fillText('DEAD AIR · STATION 0',W/2,py+ph*.36);
  g.font=`500 ${Math.round(ph*.17)}px 'DM Mono','DejaVu Sans Mono',monospace`;
  g.fillStyle=Math.floor(t*3)%2?'#ff5367':'#f1ecdd';g.fillText(Math.floor(t*3)%2?'NO CARRIER':'SIGNAL TEST 1 kHz',W/2,py+ph*.72);
}

function scan(g,W,H,a=.1){g.fillStyle=`rgba(0,0,0,${a})`;for(let y=0;y<H;y+=3)g.fillRect(0,y,W,1);}

export function startTitleIntro({reduced=false}={}){
  if(typeof document==='undefined'||reduced)return null;
  const canvas=document.createElement('canvas');canvas.id='intro-card';canvas.setAttribute('aria-hidden','true');
  const scale=Math.min(1,1280/Math.max(1,innerWidth)),W=Math.max(2,Math.round(innerWidth*scale)),H=Math.max(2,Math.round(innerHeight*scale));
  canvas.width=W;canvas.height=H;document.body.appendChild(canvas);
  const g=canvas.getContext('2d'),src=document.createElement('canvas');src.width=W;src.height=H;const sg=src.getContext('2d');
  const nz=document.createElement('canvas');nz.width=192;nz.height=108;const ng=nz.getContext('2d'),img=ng.createImageData(192,108);
  const start=performance.now();let clock=0,last=start,raf=0,done=false,gestures=0,audioAt=null,audioCtx=null;

  const finish=()=>{
    if(done)return;done=true;cancelAnimationFrame(raf);
    for(const n of ['pointerdown','keydown','touchstart'])window.removeEventListener(n,onGesture,true);
    canvas.remove();document.dispatchEvent(new CustomEvent('deadair:intro-done'));
  };
  const noise=a=>{
    const d=img.data;
    for(let i=0;i<d.length;i+=4){const v=Math.random()*255|0;d[i]=d[i+1]=d[i+2]=v;d[i+3]=255;}
    ng.putImageData(img,0,0);g.globalAlpha=a;g.imageSmoothingEnabled=false;g.drawImage(nz,0,0,W,H);g.globalAlpha=1;
  };
  // Where the real DOM title sits, so the canvas title hands off to it seamlessly (falls back to centred)
  let slot=null;
  const findSlot=()=>{
    const h1=document.querySelector('.title-card h1');
    if(h1){
      const r=h1.getBoundingClientRect(),cs=getComputedStyle(h1),size=parseFloat(cs.fontSize)||0;
      if(r.width>10&&size>10)return {x:r.left*scale,y:r.top*scale,size:size*scale,line:(parseFloat(cs.lineHeight)||size*.74)*scale,align:'left'};
    }
    const big=Math.round(Math.min(H*.34,W*.2));
    return {x:W/2,y:H*.4-big*.41,size:big,line:big*.82,align:'center'};
  };
  const title=(p,jit)=>{
    slot=slot||findSlot();
    const {x,y,size,line,align}=slot,cy=i=>y+line*(i+.5)+size*.04;
    g.textAlign=align;g.textBaseline='middle';g.font=`900 ${Math.round(size)}px 'Barlow Condensed','Arial Narrow','Liberation Sans Narrow',sans-serif`;
    const split=(1-p)*34*(jit?1:.4)*scale;
    g.globalCompositeOperation='lighter';
    g.fillStyle='rgba(0,255,255,.8)';g.fillText('DEAD',x-split,cy(0));g.fillText('AIR',x-split,cy(1));
    g.fillStyle='rgba(255,40,70,.9)';g.fillText('DEAD',x+split,cy(0));g.fillText('AIR',x+split,cy(1));
    g.globalCompositeOperation='source-over';
    g.globalAlpha=Math.min(1,p*1.4);g.fillStyle='#f1ecdd';g.fillText('DEAD',x,cy(0));g.fillStyle='#ff5367';g.fillText('AIR',x,cy(1));g.globalAlpha=1;
  };

  const frame=now=>{
    if(done)return;
    // frame-accumulated clock: a long main-thread stall (module loading) must not eat the intro
    clock+=Math.min(.05,Math.max(0,(now-last)/1000));last=now;const t=clock,phase=introPhaseAt(t);canvas.dataset.t=t.toFixed(2);
    if(t>=INTRO_TOTAL){finish();return;}
    g.globalAlpha=1;g.globalCompositeOperation='source-over';
    if(phase==='bars'){
      drawBars(g,W,H,t);scan(g,W,H,.12);
      if(audioAt===null){g.fillStyle='rgba(0,0,0,.7)';g.fillRect(0,H-26*scale-8,W,26*scale+8);g.fillStyle='#f1ecdd';g.textAlign='center';g.textBaseline='middle';g.font=`500 ${Math.max(10,Math.round(12*Math.max(.8,scale)))}px 'DM Mono','DejaVu Sans Mono',monospace`;g.fillText('CLICK OR PRESS A KEY FOR SOUND · ESC TO SKIP',W/2,H-(26*scale+8)/2);}
    }else if(phase==='glitch'){
      drawBars(sg,W,H,t);g.fillStyle='#000';g.fillRect(0,0,W,H);
      const k=(t-1.05)/.35,roll=Math.sin(t*90)*H*.04*k;
      let y=0;
      while(y<H){
        const h=Math.max(4,Math.round(H*(.02+Math.random()*.1))),dx=Math.random()<.55+k*.3?(Math.random()-.5)*W*.35*(.3+k):0;
        g.drawImage(src,0,y,W,Math.min(h,H-y),dx,y+roll,W,Math.min(h,H-y));y+=h;
      }
      if(Math.random()<.35){g.globalCompositeOperation='difference';g.fillStyle='#fff';g.globalAlpha=.55;g.fillRect(0,Math.random()*H,W,H*(.05+Math.random()*.2));g.globalAlpha=1;g.globalCompositeOperation='source-over';}
      noise(.1+k*.35);scan(g,W,H,.15);
    }else if(phase==='static'){
      g.fillStyle='#000';g.fillRect(0,0,W,H);noise(.9);
      if(Math.random()<.5){g.fillStyle='rgba(255,255,255,.55)';g.fillRect(0,Math.random()*H,W,2+Math.random()*5);}
      scan(g,W,H,.18);
    }else{
      const p=Math.min(1,(t-1.75)/.55),fade=Math.max(0,Math.min(1,(t-(INTRO_TOTAL-.4))/.4));
      g.fillStyle='#07060b';g.fillRect(0,0,W,H);
      if(p<1)noise(.5*(1-p));
      title(p,p<.6);
      if(p<.5&&Math.random()<.5){g.drawImage(canvas,0,H*Math.random()*.6,W,H*.08,(Math.random()-.5)*W*.08,H*Math.random()*.6,W,H*.08);}
      scan(g,W,H,.1);
      canvas.style.opacity=String(1-fade);
    }
    raf=requestAnimationFrame(frame);
  };

  function playAudio(offset){
    // Schedules the intro soundtrack from `offset` seconds into the timeline on the shared context.
    import('./audio.js').then(({getAudioRuntime})=>{
      const rt=getAudioRuntime(false);if(!rt)return;
      const ctx=rt.context,now=ctx.currentTime+.02,at=s=>now+Math.max(0,s-offset),out=ctx.createGain();out.gain.value=.5;out.connect(rt.master);
      const env=(a,b,v)=>{const e=ctx.createGain();e.gain.setValueAtTime(0,at(a));e.gain.linearRampToValueAtTime(v,at(a)+.006);e.gain.setValueAtTime(v,Math.max(at(a)+.007,at(b)-.006));e.gain.linearRampToValueAtTime(0,at(b));e.connect(out);return e;};
      if(offset<1.05){const o=ctx.createOscillator();o.frequency.value=1000;o.connect(env(0,1.05,.16));o.start(at(0));o.stop(at(1.05)+.05);}
      if(offset<1.4){ // stuttering tone while the picture tears
        for(let s=1.05;s<1.4;s+=.05){const o=ctx.createOscillator();o.frequency.value=s%.1<.05?1000:620+Math.random()*900;o.connect(env(s,s+.03,.1));o.start(at(s));o.stop(at(s+.04));}
      }
      if(offset<1.75){
        const n=ctx.createBufferSource(),b=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
        n.buffer=b;n.loop=true;const f=ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=2600;f.Q.value=.4;n.connect(f);f.connect(env(Math.max(1.4,offset),1.75,.22));n.start(at(1.4));n.stop(at(1.75)+.05);
      }
      if(offset<INTRO_TOTAL){ // the title drone swells in after a beat of silence
        const a=Math.max(1.83,offset),g2=ctx.createGain();g2.gain.setValueAtTime(0,at(a));g2.gain.linearRampToValueAtTime(.22,at(a)+.5);g2.gain.exponentialRampToValueAtTime(.0001,at(a)+2.6);g2.connect(out);
        const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.setValueAtTime(260,at(a));lp.frequency.linearRampToValueAtTime(900,at(a)+.6);lp.connect(g2);
        for(const [hz,type,c] of [[55,'sawtooth',-8],[55,'sawtooth',9],[110.3,'square',0],[27.5,'sine',0]]){const o=ctx.createOscillator();o.type=type;o.frequency.value=hz;o.detune.value=c;o.connect(lp);o.start(at(a));o.stop(at(a)+2.8);}
      }
    }).catch(()=>{});
  }

  function onGesture(ev){
    gestures++;
    if(ev.type==='keydown'&&['Escape',' ','Enter'].includes(ev.key)){finish();return;}
    if(gestures>=2&&audioAt!==null){finish();return;}
    if(audioAt===null){
      audioAt=clock;
      import('./audio.js').then(({unlockAudio})=>unlockAudio()).then(ok=>{if(ok&&!done)playAudio(clock);}).catch(()=>{});
    }
  }
  for(const n of ['pointerdown','keydown','touchstart'])window.addEventListener(n,onGesture,{capture:true});
  raf=requestAnimationFrame(frame);
  return {skip:finish,canvas};
}

if(typeof window!=='undefined'&&typeof document!=='undefined'&&!window.__deadairNoIntro){
  armMusicOnGesture(); // listen from the very first frame, before the heavy game modules finish loading
  const reduced=!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // automated browsers (Playwright etc.) skip it so screenshot scripts are not blocked; ?intro forces it, ?nointro suppresses it
  const forced=/[?&]intro\b/.test(location.search),skip=/[?&]nointro\b/.test(location.search)||(navigator.webdriver&&!forced);
  if(!skip)startTitleIntro({reduced});
}
