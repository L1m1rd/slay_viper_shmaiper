(() => {
 'use strict';
 const M=window.SlayPlayoffModel,api=window.PlayoffStore,page=document.getElementById('page-playoff');
 let pairs=[],matches=[],state={active_round:0,status:'waiting',version:0,champion:null},draft={},saved={};
 let ready=false,busy=false,loading=false,account='',epoch=0,error='',schemaMissing=false,confirmFinish=false;
 let ties={},hydratedAccount='',observer;
 const user=()=>window.DB.getCurrentUser(),isAdmin=()=>user()?.role==='admin'&&user()?.status==='approved';
 const canVote=()=>ready&&!busy&&state.status==='open'&&user()?.role==='user'&&user()?.status==='approved';
 const current=()=>matches.filter(m=>m.round===state.active_round);
 const changed=()=>JSON.stringify(Object.entries(draft).sort())!==JSON.stringify(Object.entries(saved).sort());
 const pair=id=>pairs.find(p=>p.id===id);
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,fn,cls)=>{const b=node('button',text,cls);b.type='button';b.onclick=fn;return b;};
 function sync() {
  const key=user()?`${user().id}:${user().role}:${user().status}`:'guest';
  if(key!==account){account=key;epoch++;draft={};saved={};ties={};ready=false;error='';confirmFinish=false;if(pairs.length){render();refresh();}}
 }
 async function refresh() {
  if(loading||busy)return;
  loading=true;const token=epoch,key=account;
  try {
   const data=await api.load();
   if(token!==epoch||key!==account)return;
   if(!data?.state||!Array.isArray(data.matches)||data.matches.length!==15)throw Error('Некорректная сетка');
   const reset=state.version!==data.state.version||hydratedAccount!==key||!changed();
   state=data.state;matches=data.matches;
   if(reset){saved={...data.ballot};draft={...saved};ties={};confirmFinish=false;hydratedAccount=key;}
   ready=true;error='';schemaMissing=false;
  } catch(e) {
   if(token!==epoch)return;
   ready=false;schemaMissing=['PGRST202','PGRST205','42883','42P01'].includes(e.code);
   error=schemaMissing?'Голосование готовится. Состав пар и сетка уже определены.':'Не удалось обновить голосование. Проверь подключение и нажми «Обновить».';
  } finally {
   loading=false;
   if(token===epoch)render();else if(pairs.length)refresh();
  }
 }
 function entry(id,match,compact=false) {
  const p=pair(id);if(!p)return node('div','Ожидаем победителя','playoff-pending');
  const selected=match.round===state.active_round&&draft[match.slot]===id;
  const winner=match.winner===id;
  const row=node('div',undefined,`playoff-entry${selected?' is-selected':''}${winner?' is-winner':''}${compact?' is-compact':''}`);
  row.append(node('span',`#${p.seed}`,'playoff-seed'));
  const img=document.createElement('img');img.src=p.photo;img.alt=p.name;img.width=144;img.height=96;img.loading='lazy';row.append(img);
  const content=node('span',undefined,'playoff-entry-copy');content.append(node('strong',p.name));
  if(selected)content.append(node('small',changed()?'Твой выбор':'Выбор сохранён'));
  if(winner)content.append(node('small','Проходит дальше'));
  if(match.counts&&Object.keys(match.counts).length)content.append(node('small',`${match.counts[id]||0} голосов`));
  row.append(content);
  if(match.round===state.active_round&&state.status==='open'){
   const input=document.createElement('input');input.type='radio';input.name=`playoff-${match.round}-${match.slot}`;input.value=id;
   input.checked=selected;input.disabled=!canVote();input.setAttribute('aria-label',`Выбрать: ${p.name}`);
   input.onchange=()=>{if(canVote()){draft[match.slot]=id;error='';confirmFinish=false;render();document.querySelector(`input[name="${input.name}"][value="${id}"]`)?.focus();}};
   const label=node('label',undefined,'playoff-radio');label.append(input,node('span',selected?'✓':'','playoff-check'));row.append(label);
   row.onclick=e=>{if(!e.target.closest('input,label')&&canVote()){input.checked=true;input.onchange();}};
  } else if(winner)row.append(node('span','✓','playoff-winner-check'));
  return row;
 }
 function matchCard(round,slot) {
  const m=matches.find(x=>x.round===round&&x.slot===slot);
  const card=node('section',undefined,`playoff-match playoff-round-${round}`);card.dataset.match=`${round}-${slot}`;
  card.setAttribute('aria-label',M.slotLabel(round,slot));
  card.append(node('h3',M.slotLabel(round,slot),'playoff-match-label'));
  if(m?.entrants)for(const id of m.entrants)card.append(entry(id,m,round!==0));
  else for(let i=0;i<2;i++)card.append(node('div',`Победитель ${round===1?'матча':M.rounds[round-1]} ${slot*2+i+1}`,'playoff-pending'));
  return card;
 }
 function wing(side) {
  const wrap=node('div',undefined,`playoff-wing playoff-wing-${side}`),offset=side==='left'?0:4;
  const outer=node('div',undefined,'playoff-column playoff-outer');
  for(let s=offset;s<offset+4;s++)outer.append(matchCard(0,s));
  const quarters=node('div',undefined,'playoff-column playoff-quarters');
  for(let s=offset/2;s<offset/2+2;s++)quarters.append(matchCard(1,s));
  const semi=node('div',undefined,'playoff-column playoff-semi');semi.append(matchCard(2,side==='left'?0:1));
  wrap.append(outer,quarters,semi);return wrap;
 }
 function trophy(){
  const el=node('div',undefined,'playoff-trophy');
  el.innerHTML='<svg viewBox="0 0 96 110" role="img" aria-label="Кубок"><path d="M26 12H70V43C70 61 60 71 48 71S26 61 26 43Z"/><path d="M26 20H12V32C12 49 25 53 31 53M70 20H84V32C84 49 71 53 65 53" fill="none" stroke="currentColor" stroke-width="7"/><path d="M43 69H53V88H43ZM29 89H67V98H29ZM22 99H74V107H22Z"/></svg>';
  return el;
 }
 function adminPanel() {
  const panel=node('section',undefined,'playoff-admin');panel.append(node('h2','Управление раундом'));
  if(schemaMissing){panel.append(node('p','Для сохранения бюллетеней необходимо применить playoff.sql в проекте Supabase. До подключения базы сетка доступна для просмотра.'));return panel;}
  if(!ready){panel.append(node('p','Дождись подключения к базе.'));return panel;}
  if(state.status==='complete'){panel.append(node('p','Турнир завершён. Победитель определён.'));return panel;}
  if(state.status==='waiting'){
   panel.append(node('p',`Следующий раунд: ${M.rounds[state.active_round]}. Голосование ещё не открыто.`));
   const b=button(`Открыть ${M.rounds[state.active_round]}`,()=>adminAction('open'),'playoff-primary');b.disabled=busy;panel.append(b);return panel;
  }
  const deadlocks=current().filter(m=>m.entrants&&(m.counts?.[m.entrants[0]]||0)>0&&(m.counts?.[m.entrants[0]]||0)===(m.counts?.[m.entrants[1]]||0));
  const noVotes=current().some(m=>!m.entrants?.some(id=>(m.counts?.[id]||0)>0));
  panel.append(node('p','Победители определяются по голосам одобренных участников. При равенстве выбери победителя вручную. После подведения итогов бюллетени раунда закрываются.'));
  for(const m of deadlocks){const label=node('label',`${M.slotLabel(m.round,m.slot)} — равенство голосов`,'playoff-tie');const select=document.createElement('select');select.append(new Option('Выбери победителя',''));for(const id of m.entrants)select.append(new Option(pair(id).name,id));select.value=ties[m.slot]||'';select.onchange=()=>{ties[m.slot]=select.value;confirmFinish=false;render();};label.append(select);panel.append(label);}
  if(noVotes)panel.append(node('p','Для завершения нужны голоса в каждом матче.'));
  if(confirmFinish){panel.append(node('strong',`Завершить ${M.rounds[state.active_round]} и зафиксировать победителей?`));panel.append(button('Подтвердить итоги',()=>adminAction('finish'),'playoff-primary'),button('Отмена',()=>{confirmFinish=false;render();},'playoff-secondary'));}
  else {const b=button('Подвести итоги раунда',()=>{confirmFinish=true;render();},'playoff-primary');b.disabled=busy||noVotes||deadlocks.some(m=>!m.entrants.includes(ties[m.slot]));panel.append(b);}
  return panel;
 }
 async function adminAction(action){
  if(!isAdmin()||busy||!ready)return;const token=epoch;let failure='';busy=true;error='';render();
  try{await(action==='open'?api.open(state.version):api.finish(state.version,ties));confirmFinish=false;}
  catch{failure='Не удалось изменить раунд. Обнови сетку: статус или результаты могли измениться.';}
  finally{busy=false;await refresh();if(token===epoch&&failure){error=failure;render();}}
 }
 async function saveBallot(){
  if(!canVote()||!M.validBallot(draft,matches,state.active_round))return;
  const token=epoch,choices={...draft};busy=true;error='';render();
  try{await api.save(choices,state.version);if(token===epoch){saved=choices;window.toast('Выбор сохранён');}}
  catch{if(token===epoch)error='Не удалось сохранить. Твой выбор остался на экране. Обнови статус раунда и повтори отправку.';}
  finally{busy=false;if(token===epoch)render();else await refresh();}
 }
 function render(){
  if(!pairs.length)return;
  observer?.disconnect();page.replaceChildren();
  const header=node('section',undefined,'playoff-heading'),titles=node('div');
  titles.append(node('span','SLAY AWARD / ПЛЕЙ-ОФФ','eyebrow'),node('h1','Пара года'),node('p','Выбери одну пару в каждом противостоянии. Победители встретятся в финале.'));
  const selected=Object.keys(draft).length,total=8/2**state.active_round;
  const progress=node('div',undefined,'playoff-progress');progress.append(node('strong',state.status==='complete'?'Турнир завершён':`Выбрано ${selected} из ${total}`),button(loading?'Обновляю…':'Обновить',refresh,'playoff-refresh'));
  header.append(titles,progress);page.append(header);
  const steps=node('ol',undefined,'playoff-steps');M.rounds.forEach((r,i)=>{const li=node('li',r,i===state.active_round?'is-current':i<state.active_round?'is-finished':'');if(i===state.active_round)li.setAttribute('aria-current','step');steps.append(li);});page.append(steps);
  const notice=node('div',undefined,'playoff-notice');notice.setAttribute('role',error&&!schemaMissing?'alert':'status');
  let message=error||(!ready?'Подключаю голосование…':state.status==='complete'?`Победитель — ${pair(state.champion)?.name||'пара года'}!`:state.status==='waiting'?`${M.rounds[state.active_round]}: голосование ещё не открыто.`:isAdmin()?'Просмотр администратора. Итоги и переходы между раундами — ниже.':!user()?'Войди в аккаунт, чтобы сохранить выбор.':user().status!=='approved'?'Для голосования нужен одобренный аккаунт.':changed()?'Выбор изменён. Подтверди его кнопкой «Сохранить выбор».':'Можно изменить сохранённый выбор, пока раунд открыт.');
  notice.append(node('span',message));if(!user())notice.append(button('Войти ↗',()=>window.openModal('login'),'playoff-secondary'));page.append(notice);
  const scroll=node('div',undefined,'playoff-scroll');scroll.tabIndex=0;scroll.setAttribute('aria-label','Сетка турнира. На узком экране доступна горизонтальная прокрутка.');
  const bracket=node('div',undefined,'playoff-bracket');bracket.append(wing('left'));
  const center=node('div',undefined,'playoff-center');center.append(trophy(),node('h2','Финал'),matchCard(3,0),node('p',state.champion?`Пара года: ${pair(state.champion)?.name}`:'Кто станет парой года?'));bracket.append(center,wing('right'));scroll.append(bracket);page.append(scroll);
  page.append(node('p','На телефоне листай сетку в стороны. Номер на карточке — место по итогам отбора.','playoff-hint'));
  const footer=node('div',undefined,'playoff-savebar');footer.append(node('span',state.status==='open'?(changed()?'Изменения ещё не сохранены':'Твой сохранённый выбор учитывается в этом раунде'):'Результаты предыдущих раундов сохраняются в сетке.'));
  const save=button(busy?'Сохраняю…':!changed()&&selected===total?'Выбор сохранён':'Сохранить выбор',saveBallot,'playoff-primary');save.disabled=!canVote()||!changed()||!M.validBallot(draft,matches,state.active_round);footer.append(save);page.append(footer);
  if(isAdmin())page.append(adminPanel());
  const draw=()=>drawConnectors(bracket);observer=new ResizeObserver(draw);observer.observe(bracket);requestAnimationFrame(draw);
 }
 function drawConnectors(bracket){
  bracket.querySelector('.playoff-lines')?.remove();
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),base=bracket.getBoundingClientRect();
  svg.setAttribute('class','playoff-lines');svg.setAttribute('width',base.width);svg.setAttribute('height',base.height);svg.setAttribute('aria-hidden','true');
  for(let round=0;round<3;round++)for(let slot=0;slot<8/2**round;slot++){
   const a=bracket.querySelector(`[data-match="${round}-${slot}"]`)?.getBoundingClientRect(),b=bracket.querySelector(`[data-match="${round+1}-${Math.floor(slot/2)}"]`)?.getBoundingClientRect();if(!a||!b)continue;
   const left=slot<4/2**round,sx=(left?a.right:a.left)-base.left,dx=(left?b.left:b.right)-base.left,sy=(a.top+a.bottom)/2-base.top,dy=(b.top+b.bottom)/2-base.top,mid=(sx+dx)/2;
   const path=document.createElementNS(ns,'path');path.setAttribute('d',`M${sx},${sy} H${mid} V${dy} H${dx}`);svg.append(path);
  }
  bracket.prepend(svg);
 }
 async function open(){
  sync();await window.showPage('playoff');render();await refresh();
 }
 function getResults(){
  if(state.status!=='complete')return[];const final=matches.find(m=>m.round===3&&m.slot===0);if(!final?.winner)return[];
  return [final.winner,...final.entrants.filter(id=>id!==final.winner)].map(id=>({name:pair(id)?.name,total:final.counts?.[id]||0,votes:final.counts?.[id]||0,1:0,2:0,3:0}));
 }
 const oldResults=window.getNominationResults;window.getNominationResults=id=>id==='couple'?getResults():oldResults(id);
 window.SlayPlayoff={open,sync,refresh,getResults};
 const oldUpdate=window.updateUI;window.updateUI=function(){oldUpdate();sync();};
 const oldProfile=window.renderProfile;window.renderProfile=function(){oldProfile();const target=document.getElementById('my-votes-list');if(!target||!user())return;const p=node('p',`Пара года — ${M.rounds[state.active_round]}`);p.append(button('Открыть мою сетку',open,'playoff-secondary'));target.append(p);};
 const oldCategory=window.openCategory;window.openCategory=id=>id==='couple'?open():oldCategory(id);
 Promise.all([fetch('qualification-results.json?v=playoff20261108').then(r=>{if(!r.ok)throw Error();return r.json();}),fetch('playoff-photos.json?v=20261108').then(r=>{if(!r.ok)throw Error();return r.json();})])
  .then(([results,photos])=>{pairs=M.seed(results,photos);matches=M.initialMatches(pairs);sync();render();return refresh();})
  .catch(()=>{page.replaceChildren(node('p','Не удалось загрузить пары. Обнови страницу.'));});
 setInterval(()=>{if(!document.hidden&&!page.classList.contains('hidden')&&!busy)refresh();},30000);
})();
