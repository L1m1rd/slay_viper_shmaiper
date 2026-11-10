(() => {
  'use strict';
  const W=3480,H=1820,CW=400,CH=300,RATE=.8;
  const rounds=['1/8 ФИНАЛА','1/4 ФИНАЛА','ПОЛУФИНАЛ','ФИНАЛ'];
  const position=(r,s)=>r===0?{x:s<4?40:3040,y:130+(s%4)*420}:r===1?{x:s<2?540:2540,y:340+(s%2)*840}:r===2?{x:s===0?1040:2040,y:760}:{x:1540,y:760};
  const word=n=>n%10===1&&n%100!==11?'голос':n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?'голоса':'голосов';
  function create({host,pairs,snapshot,mode,onMessage,onChampion,onEnd}) {
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
    const matches=snapshot.matches || [],cards=new Map(),counts=[],rows=[],connections=new Map(),flights=new Map();
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
        if(m.round>0){const waiting=make('span','couple-film-slot-waiting','Победитель предыдущего этапа');row.append(waiting);}
        rows.push({row,match:m,index:i});card.append(row);
      }
      cards.set(m.round+'-'+m.slot,card);world.append(card);
      if(m.round<3){const dest=position(m.round+1,Math.floor(m.slot/2));const left=m.slot<4/2**m.round;const x=left?xy.x+CW:xy.x,dx=left?dest.x:dest.x+CW,y=xy.y+CH/2,dy=dest.y+CH/2;const line=document.createElementNS(ns,'path');line.setAttribute('d',`M${x},${y} H${(x+dx)/2} V${dy} H${dx}`);svg.append(line);connections.set(m.round+'-'+m.slot,line);}
    }
    const crown=make('div','couple-film-crown','★');crown.style.left='1540px';crown.style.top='560px';world.append(crown);
    root.append(world,title,top,footer,progress);host.replaceChildren(root);
    const focus=m=>{const p=position(m.round,m.slot);return{x:p.x+CW/2,y:p.y+CH/2,width:650,height:490};};
    const ordered=matches.filter(m=>m.entrants?.length===2).sort((a,b)=>a.round-b.round||a.slot-b.slot);
    const initial=ordered.length?focus(ordered[0]):{x:240,y:280,width:650,height:490};
    const shots=[{duration:3000,target:initial,endTarget:initial,label:'ПУТЬ К ФИНАЛУ',intro:true}];
    for(const m of ordered){
      const target=focus(m),destination=m.winner&&m.round<3?matches.find(n=>n.round===m.round+1&&n.slot===Math.floor(m.slot/2)):null;
      const shot={duration:destination?7300:5700,target,endTarget:destination?focus(destination):target,match:m,destination,label:rounds[m.round]+' / МАТЧ '+(m.slot+1)};
      shots.push(shot);
      if(destination){
        const ghost=make('div','couple-film-flight'),p=pair(m.winner),winnerIndex=m.entrants.indexOf(m.winner);
        if(p){const img=make('img','');img.src=mode==='silhouette'?'images/unknown-participant.png':p.photo;img.alt='';ghost.append(img,make('strong','',mode==='silhouette'?'НЕИЗВЕСТНАЯ ПАРА':p.name),make('span','','В СЛЕДУЮЩИЙ ЭТАП'));}
        world.append(ghost);const from=position(m.round,m.slot),to=position(destination.round,destination.slot);
        flights.set(m.round+'-'+m.slot,{ghost,shot,from:{x:from.x,y:from.y+38+winnerIndex*129},to:{x:to.x,y:to.y+38+(m.slot%2)*129}});
      }
    }
    const champion=pair(snapshot.state?.champion),last=shots[shots.length-1];
    const finale=champion?{x:1740,y:840,width:850,height:660}:last.endTarget;
    shots.push({duration:5500,target:finale,endTarget:finale,label:champion?'ПОБЕДИТЕЛЬ / ПАРА ГОДА':'ПРОДОЛЖЕНИЕ СЛЕДУЕТ',final:true});
    let cursor=0;shots.forEach(s=>{s.start=cursor;cursor+=s.duration;});const duration=cursor;
    let elapsed=0,origin=0,raf,stopped=false,paused=true,lastShot=-1;
    const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>x*x*(3-2*x);
    function renderAt(time){
      elapsed=Math.max(0,Math.min(time,duration));
      const index=Math.max(0,shots.findIndex(s=>elapsed<s.start+s.duration));const shot=elapsed===duration?shots[shots.length-1]:shots[index];const idx=shots.indexOf(shot);
      const previous=idx?shots[idx-1].endTarget:initial,t=clamp((elapsed-shot.start)/(reduced?1:1700)),mix=ease(t);
      const local=elapsed-shot.start,flightProgress=shot.destination?clamp((local-4000)/(reduced?1:2200)):0;
      const w=root.clientWidth,h=root.clientHeight;
      const camera={};for(const key of ['x','y','width','height']){camera[key]=previous[key]+(shot.target[key]-previous[key])*mix;if(shot.destination)camera[key]+=(shot.endTarget[key]-shot.target[key])*ease(flightProgress);}
      const scale=Math.min(w/camera.width,h/camera.height)*.89;
      world.style.transform=`translate3d(${w/2-camera.x*scale}px,${h/2-camera.y*scale}px,0) scale(${scale})`;
      title.style.opacity=String(1-clamp((elapsed-1700)/900));title.style.transform=`translateY(${-clamp(elapsed/2600)*18}px)`;world.style.opacity=String(clamp((elapsed-1600)/900));
      top.style.opacity=String(clamp((elapsed-1000)/1000));footer.style.opacity=String(clamp((elapsed-2400)/800));bar.style.transform=`scaleX(${elapsed/duration})`;
      root.classList.toggle('is-champion',Boolean(shot.final&&champion));crown.textContent=champion?'★':'SLAY';
      subtitle.textContent=shot.final?(champion?(mode==='silhouette'?'ПАРА ГОДА':champion.name):'ГОЛОСОВАНИЕ ПРОДОЛЖАЕТСЯ'):(shot.match?.winner?'РЕЗУЛЬТАТ МАТЧА ЗАФИКСИРОВАН':shot.match?'ТЕКУЩИЕ ГОЛОСА':'16 ПАР / ПУТЬ К ФИНАЛУ');
      step.textContent=shot.destination&&flightProgress>0&&flightProgress<1?'ПОБЕДИТЕЛЬ ПРОХОДИТ ДАЛЬШЕ':shot.label;
      const started=m=>{const order=shots.find(s=>s.match===m);return Boolean(order&&elapsed>=order.start);};
      const arrived=(m,i)=>{
        if(m.round===0)return started(m)||(shot.intro&&m===ordered[0]);
        const feeder=matches.find(f=>f.round===m.round-1&&f.slot===m.slot*2+i),flight=feeder?flights.get(feeder.round+'-'+feeder.slot):null;
        return Boolean(feeder?.winner&&flight&&elapsed>=flight.shot.start+(reduced?4001:6200));
      };
      for(const entry of rows)entry.row.classList.toggle('is-arrived',arrived(entry.match,entry.index));
      for(const [key,card]of cards){
        const m=matches.find(m=>m.round+'-'+m.slot===key);
        const incoming=matches.some(f=>f.round===m.round-1&&Math.floor(f.slot/2)===m.slot&&flights.has(f.round+'-'+f.slot)&&elapsed>=flights.get(f.round+'-'+f.slot).shot.start+4000);
        const visible=started(m)||incoming||(shot.intro&&m===ordered[0]);
        card.style.visibility=visible?'visible':'hidden';card.setAttribute('aria-hidden',String(!visible));
        card.classList.toggle('is-focused',key===(shot.destination&&flightProgress>.85?shot.destination.round+'-'+shot.destination.slot:shot.match?shot.match.round+'-'+shot.match.slot:shot.final&&champion?'3-0':''));
      }
      for(const [key,line]of connections){
        const f=flights.get(key),p=f?clamp((elapsed-f.shot.start-4000)/(reduced?1:2200)):0;
        const length=line.getTotalLength();line.style.strokeDasharray=String(length);line.style.strokeDashoffset=String(length*(1-p));line.style.opacity=p>0?'1':'0';
      }
      for(const f of flights.values()){
        const p=clamp((elapsed-f.shot.start-4000)/(reduced?1:2200)),e=ease(p);
        f.ghost.hidden=!(p>0&&p<1);f.ghost.style.transform=`translate3d(${f.from.x+(f.to.x-f.from.x)*e}px,${f.from.y+(f.to.y-f.from.y)*e}px,0) scale(${1+Math.sin(Math.PI*p)*.055})`;
      }
      for(const c of counts){const order=shots.find(s=>s.match===c.match);const reveal=order?clamp((elapsed-order.start-1700)/1550):0;const sum=Object.values(c.match.counts||{}).reduce((a,b)=>a+(Number.isFinite(b)?b:0),0);c.number.textContent=c.known?(reveal>0?Math.round(c.value*ease(reveal))+' '+word(Math.round(c.value*ease(reveal))):'Считаем голоса…'):'Голоса пока не раскрыты';c.meter.style.transform=`scaleX(${sum?c.value/sum*ease(reveal):0})`;c.row.classList.toggle('is-revealed',reveal>.9);}
      if (lastShot !== idx) {
        lastShot = idx;
        onMessage?.(shot.label + (mode === 'test' ? ' · тестовые голоса' : ''));
        if (shot.final && champion && mode !== 'silhouette') onChampion?.(champion.name);
      }
    }
    function tick(now){if(stopped||paused)return;renderAt((now-origin)*RATE);if(elapsed>=duration){paused=true;onEnd?.();return;}raf=requestAnimationFrame(tick);}
    function play(){if(stopped)return;paused=false;origin=performance.now()-elapsed/RATE;cancelAnimationFrame(raf);raf=requestAnimationFrame(tick);}
    function pause(){paused=!paused;if(paused)cancelAnimationFrame(raf);else play();return paused;}
    function next(){const s=shots.find(s=>s.start>elapsed+100);renderAt(s?s.start+(paused?1700:0):duration);origin=performance.now()-elapsed/RATE;if(elapsed>=duration){paused=true;onEnd?.();}}
    const observer=new ResizeObserver(()=>renderAt(elapsed));observer.observe(root);renderAt(0);
    return {play,pause,next,stop(){stopped=true;cancelAnimationFrame(raf);observer.disconnect();root.remove();},seek(time){renderAt(time);origin=performance.now()-elapsed/RATE;},get duration(){return duration;},get paused(){return paused;}};
  }
  window.SlayCoupleFilm={create,position};
})();





