(() => {
  'use strict';
  const W=3480,H=1820,CW=400,CH=300;
  const rounds=['1/8 ФИНАЛА','1/4 ФИНАЛА','ПОЛУФИНАЛ','ФИНАЛ'];
  const position=(r,s)=>r===0?{x:s<4?40:3040,y:130+(s%4)*420}:r===1?{x:s<2?540:2540,y:340+(s%2)*840}:r===2?{x:s===0?1040:2040,y:760}:{x:1540,y:760};
  const word=n=>n%10===1&&n%100!==11?'участник':n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?'участника':'участников';
  function create({host,pairs,snapshot,mode,onMessage,onEnd}) {
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const make=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls;if(text!==undefined)e.textContent=text;return e;};
    const root=make('section','couple-film'),world=make('div','couple-film-world');
    root.setAttribute('aria-label','Презентация плей-офф «Пара года»');
    const label=mode==='test'?'РЕПЕТИЦИЯ / ТЕСТОВЫЕ ГОЛОСА':mode==='silhouette'?'РЕПЕТИЦИЯ / УЧАСТНИКИ СКРЫТЫ':'РЕЗУЛЬТАТЫ ГОЛОСОВАНИЯ';
    const top=make('header','couple-film-top');top.append(make('span','','SLAY / 2026'),make('span','',label));
    const title=make('div','couple-film-intro');title.append(make('p','','ИЗ ДВУХ — ОДНА'),make('h1','','ПАРА ГОДА'),make('span','','ПУТЬ К ФИНАЛУ'));
    const footer=make('footer','couple-film-caption');const subtitle=make('span','','16 ПАР / ОДИН ПОБЕДИТЕЛЬ'),step=make('strong','','ОБЗОР СЕТКИ');footer.append(subtitle,step);
    const progress=make('div','couple-film-progress'),bar=make('span','');progress.append(bar);
    world.append(make('div','couple-film-watermark','ПАРА / 2026'));
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('width',W);svg.setAttribute('height',H);svg.classList.add('couple-film-lines');world.append(svg);
    const matches=snapshot.matches || [],cards=new Map(),counts=[];
    const pair=id=>pairs.find(p=>p.id===id);
    for(const m of matches){
      const xy=position(m.round,m.slot),card=make('article','couple-film-match');card.style.left=xy.x+'px';card.style.top=xy.y+'px';card.dataset.match=m.round+'-'+m.slot;
      card.append(make('h2','',rounds[m.round]+' / '+(m.slot+1)));
      for(let i=0;i<2;i++){
        const p=pair(m.entrants?.[i]),row=make('div','couple-film-pair');
        if(p){
          const image=make('img','');image.src=mode==='silhouette'?'images/unknown-participant.png':p.photo;image.alt=mode==='silhouette'?'Неизвестная пара':p.name;image.onerror=()=>{image.onerror=null;image.src='images/nominations/couple.svg';};
          const copy=make('div','couple-film-copy');copy.append(make('strong','',mode==='silhouette'?'НЕИЗВЕСТНАЯ ПАРА':p.name));
          const value=m.counts?.[p.id],known=mode!=='silhouette'&&Number.isInteger(value)&&value>=0;
          const number=make('span','couple-film-votes',known?'0':'—');copy.append(number);row.append(image,copy);
          const meter=make('div','couple-film-meter');row.append(meter);
          counts.push({number,meter,known,value:known?value:0,row,match:m,id:p.id});
          if(m.winner===p.id){row.dataset.winner='true';row.append(make('span','couple-film-winner-mark',m.round===3?'ПАРА ГОДА':'ПРОХОДИТ ДАЛЬШЕ'));}
        }else row.append(make('p','couple-film-waiting','Победитель предыдущего этапа'));
        card.append(row);
      }
      cards.set(m.round+'-'+m.slot,card);world.append(card);
      if(m.round<3){const dest=position(m.round+1,Math.floor(m.slot/2));const left=m.slot<4/2**m.round;const x=left?xy.x+CW:xy.x,dx=left?dest.x:dest.x+CW,y=xy.y+CH/2,dy=dest.y+CH/2;const line=document.createElementNS(ns,'path');line.setAttribute('d',`M${x},${y} H${(x+dx)/2} V${dy} H${dx}`);svg.append(line);}
    }
    const crown=make('div','couple-film-crown','★');crown.style.left='1540px';crown.style.top='560px';world.append(crown);
    root.append(world,title,top,footer,progress);host.replaceChildren(root);
    const overview={x:W/2,y:H/2,width:W,height:H};
    const shots=[{duration:4800,target:overview,label:'ОБЗОР СЕТКИ'}];
    for(const m of matches.filter(m=>m.entrants?.length===2).sort((a,b)=>a.round-b.round||a.slot-b.slot)){
      const xy=position(m.round,m.slot);
      shots.push({duration:5700,target:{x:xy.x+CW/2,y:xy.y+CH/2,width:650,height:490},match:m,label:rounds[m.round]+' / МАТЧ '+(m.slot+1)});
    }
    const champion=pair(snapshot.state?.champion);
    shots.push({duration:5500,target:champion?{x:1740,y:860,width:850,height:660}:overview,label:champion?'ПОБЕДИТЕЛЬ / ПАРА ГОДА':'ПРОДОЛЖЕНИЕ СЛЕДУЕТ',final:true});
    let cursor=0;shots.forEach(s=>{s.start=cursor;cursor+=s.duration;});const duration=cursor;
    let elapsed=0,origin=0,raf,stopped=false,paused=true,lastShot=-1;
    const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>x*x*(3-2*x);
    function renderAt(time){
      elapsed=Math.max(0,Math.min(time,duration));
      const index=Math.max(0,shots.findIndex(s=>elapsed<s.start+s.duration));const shot=elapsed===duration?shots[shots.length-1]:shots[index];const idx=shots.indexOf(shot);
      const previous=idx?shots[idx-1].target:overview,t=clamp((elapsed-shot.start)/(reduced?1:1700)),mix=ease(t);
      const w=root.clientWidth,h=root.clientHeight;
      const camera={};for(const key of ['x','y','width','height'])camera[key]=previous[key]+(shot.target[key]-previous[key])*mix;
      const scale=Math.min(w/camera.width,h/camera.height)*.89;
      world.style.transform=`translate3d(${w/2-camera.x*scale}px,${h/2-camera.y*scale}px,0) scale(${scale})`;
      title.style.opacity=String(1-clamp((elapsed-1700)/900));title.style.transform=`translateY(${-clamp(elapsed/2600)*18}px)`;world.style.opacity=String(clamp((elapsed-1600)/900));
      top.style.opacity=String(clamp((elapsed-1000)/1000));footer.style.opacity=String(clamp((elapsed-2400)/800));bar.style.transform=`scaleX(${elapsed/duration})`;
      root.classList.toggle('is-champion',Boolean(shot.final&&champion));crown.textContent=champion?'★':'SLAY';
      subtitle.textContent=shot.final?(champion?(mode==='silhouette'?'ПАРА ГОДА':champion.name):'ГОЛОСОВАНИЕ ПРОДОЛЖАЕТСЯ'):(shot.match?.winner?'РЕЗУЛЬТАТ МАТЧА ЗАФИКСИРОВАН':shot.match?'ТЕКУЩИЕ ГОЛОСА':'16 ПАР / ПУТЬ К ФИНАЛУ');
      step.textContent=shot.label;
      for(const [key,card]of cards)card.classList.toggle('is-focused',key===(shot.match?shot.match.round+'-'+shot.match.slot:shot.final&&champion?'3-0':''));
      for(const c of counts){const order=shots.find(s=>s.match===c.match);const reveal=order?clamp((elapsed-order.start-1700)/1550):0;const sum=Object.values(c.match.counts||{}).reduce((a,b)=>a+(Number.isFinite(b)?b:0),0);c.number.textContent=c.known?(reveal>0?Math.round(c.value*ease(reveal))+' '+word(Math.round(c.value*ease(reveal))):'Считаем голоса…'):'Голоса пока не раскрыты';c.meter.style.transform=`scaleX(${sum?c.value/sum*ease(reveal):0})`;c.row.classList.toggle('is-revealed',reveal>.9);}
      if(lastShot!==idx){lastShot=idx;onMessage?.(shot.label+(mode==='test'?' · тестовые голоса':''));}
    }
    function tick(now){if(stopped||paused)return;renderAt(now-origin);if(elapsed>=duration){paused=true;onEnd?.();return;}raf=requestAnimationFrame(tick);}
    function play(){if(stopped)return;paused=false;origin=performance.now()-elapsed;cancelAnimationFrame(raf);raf=requestAnimationFrame(tick);}
    function pause(){paused=!paused;if(paused)cancelAnimationFrame(raf);else play();return paused;}
    function next(){const s=shots.find(s=>s.start>elapsed+100);renderAt(s?s.start+(paused?1700:0):duration);origin=performance.now()-elapsed;if(elapsed>=duration){paused=true;onEnd?.();}}
    const observer=new ResizeObserver(()=>renderAt(elapsed));observer.observe(root);renderAt(0);
    return {play,pause,next,stop(){stopped=true;cancelAnimationFrame(raf);observer.disconnect();root.remove();},seek(time){renderAt(time);origin=performance.now()-elapsed;},get duration(){return duration;},get paused(){return paused;}};
  }
  window.SlayCoupleFilm={create,position};
})();

