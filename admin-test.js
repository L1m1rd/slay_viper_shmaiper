(() => {
  'use strict';
  const user = () => window.DB?.getCurrentUser();
  const allowed = () => user()?.role === 'admin' && user()?.status === 'approved';
  const key = () => 'slay-admin-test-v1:' + user().id;
  function read() {
    if (!allowed()) throw Error('Тестовый режим доступен администратору');
    try { return JSON.parse(localStorage.getItem(key()) || '{}'); } catch { return {}; }
  }
  function write(data) { localStorage.setItem(key(), JSON.stringify(data)); }
  function get(name, fallback) { return read()[name] ?? fallback; }
  function set(name, value) { const data = read(); data[name] = value; write(data); }
  const enabled = name => allowed() && get('mode:' + name, false);
  async function loadPlayoff() {
    if (!enabled('playoff')) throw Error('Тестовый режим выключен');
    let data = get('playoff', null);
    if (!data) {
      const response = await fetch('qualification-results.json?v=admin-test');
      if (!response.ok) throw Error('Не удалось загрузить состав пар');
      const results = await response.json();
      const pairs = results.ranked.slice(0,16);
      data = { state: { active_round:0, status:'open', version:1, champion:null }, matches:window.SlayPlayoffModel.initialMatches(pairs), ballots:{} };
      set('playoff', data);
    }
    const ballot = data.ballots[data.state.active_round] || {};
    const matches = data.matches.map(m => ({...m, counts:m.winner ? m.counts : m.round === data.state.active_round ? Object.fromEntries((m.entrants || []).map(id=>[id,ballot[m.slot]===id?1:0])) : {}}));
    return {state:data.state,matches,ballot};
  }
  async function savePlayoff(selected, version) {
    await loadPlayoff();
    const data=get('playoff',null);
    if(data.state.status!=='open'||data.state.version!==version||!window.SlayPlayoffModel.validBallot(selected,data.matches,data.state.active_round)) throw Error('Некорректный тестовый бюллетень');
    data.ballots[data.state.active_round]={...selected};set('playoff',data);
  }
  async function advance(action, version) {
    await loadPlayoff(); const data=get('playoff',null), state=data.state;
    if(state.version!==version)throw Error('Обнови тестовую сетку');
    if(action==='open') { if(state.status!=='waiting')throw Error('Раунд уже открыт');state.status='open'; }
    else {
      const ballot=data.ballots[state.active_round] || {};
      if(state.status!=='open'||!window.SlayPlayoffModel.validBallot(ballot,data.matches,state.active_round))throw Error('Выбери победителей всех матчей');
      const current=data.matches.filter(m=>m.round===state.active_round);
      for(const m of current){m.winner=ballot[m.slot];m.counts=Object.fromEntries(m.entrants.map(id=>[id,id===m.winner?1:0]));}
      if(state.active_round===3){state.status='complete';state.champion=current[0].winner;}
      else { for(const next of data.matches.filter(m=>m.round===state.active_round+1)) next.entrants=[current.find(m=>m.slot===next.slot*2).winner,current.find(m=>m.slot===next.slot*2+1).winner];state.active_round++;state.status='waiting'; }
    }
    state.version++;set('playoff',data);
  }
  function addControls(container, kind, reload) {
    if(!allowed())return;
    const box=document.createElement('div');box.className='qualification-notice';
    const text=document.createElement('span');text.textContent=enabled(kind)?'ТЕСТОВЫЙ РЕЖИМ · Выбор сохраняется в этом браузере и не учитывается в премии.':'Можно проверить голосование отдельно от настоящих результатов.';
    const toggle=document.createElement('button');toggle.type='button';toggle.textContent=enabled(kind)?'Выйти из теста':'Тестировать голосование';
    toggle.onclick=async()=>{set('mode:'+kind,!enabled(kind));await reload();};box.append(text,toggle);
    if(enabled(kind)){const reset=document.createElement('button');reset.type='button';reset.textContent='Сбросить тест';reset.onclick=async()=>{set(kind,null);await reload();};box.append(reset);}
    container.append(box);
  }
  window.SlayAdminTest={allowed,enabled,get,set,loadPlayoff,savePlayoff,advance,addControls};
})();

