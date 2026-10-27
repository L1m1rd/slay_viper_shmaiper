(() => {
  'use strict';
  const model = window.SlayQualificationModel, store = window.QualificationStore;
  const page = document.getElementById('page-qualification'), grid = document.getElementById('qualification-grid');
  const save = document.getElementById('qualification-save'), count = document.getElementById('qualification-count');
  const status = document.getElementById('qualification-status'), notice = document.getElementById('qualification-notice');
  const adminResults = document.getElementById('qualification-results');
  const panelResults = document.getElementById('admin-qualification-results');
  let phase = 'qualification', catalog = model.candidates, ready = false, ballotReady = false, busy = false;
  let draft = new Set(), saved = new Set(), sessionKey, generation = 0, setupPromise, resultsBusy = false;
  let ballotPromise, ballotToken;
  const user = () => window.DB.getCurrentUser();
  const admin = () => user()?.role === 'admin';
  const restricted = () => phase !== 'main' && !admin();
  const editable = () => ready && ballotReady && phase === 'qualification' && user()?.role === 'user' && user()?.status === 'approved';
  const same = () => draft.size === saved.size && [...draft].every(id => saved.has(id));
  function node(tag, text, className) {
    const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n;
  }
  function buildGrid() {
    grid.replaceChildren();
    catalog.forEach((c,i) => {
      const label = node('label', undefined, 'qualification-pair');
      const input = document.createElement('input'); input.type = 'checkbox'; input.value = c.id;
      input.setAttribute('aria-label', c.name);
      label.append(input, node('span',String(i+1).padStart(2,'0'),'qualification-number'),node('span',c.name,'qualification-name'));
      input.onchange = () => {
        if (!editable() || busy) { controls(); return; }
        if (input.checked && draft.size < model.limit) draft.add(c.id); else draft.delete(c.id);
        status.textContent = 'Выбор изменён. Сохрани 16 пар, чтобы голос учли.'; controls();
      };
      grid.append(label);
    });
    document.getElementById('qualification-total').textContent = catalog.length;
  }
  function controls() {
    count.textContent = `${draft.size} / ${model.limit}`;
    const changed = !same();
    save.disabled = busy || !editable() || draft.size !== model.limit || !changed;
    save.textContent = busy ? 'Сохраняю…' : saved.size === model.limit && !changed ? 'Выбор сохранён' : 'Сохранить 16 пар';
    grid.querySelectorAll('input').forEach(input => {
      input.checked = draft.has(input.value);
      input.disabled = busy || !editable() || (!input.checked && draft.size >= model.limit);
      input.closest('label').classList.toggle('is-selected',input.checked);
    });
    notice.replaceChildren();
    if (!user()) {
      notice.append(node('span','Войди в аккаунт, чтобы выбрать и сохранить 16 пар.'));
      const login = node('button','Войти ↗'); login.type='button'; login.onclick=()=>window.openModal('login'); notice.append(login);
    } else if (admin()) notice.textContent = 'Просмотр администратора. Голосуют только одобренные участники. Остальные номинации доступны ниже.';
    else if (user().status !== 'approved') notice.textContent = user().status === 'banned' ? 'Аккаунт заблокирован. Голосование недоступно.' : 'Аккаунт ожидает одобрения администратора. После одобрения можно будет голосовать.';
    else if (phase !== 'qualification') notice.textContent = 'Отбор завершён. Начался основной этап голосования.';
    else notice.textContent = 'Отметь ровно 16 пар. До конца отбора сохранённый выбор можно изменить.';
    document.getElementById('qualification-admin').hidden = !admin();
  }
  function display(scroll = true) {
    ['home','categories','vote','profile','admin'].forEach(id=>document.getElementById('page-'+id).classList.add('hidden'));
    page.classList.remove('hidden');
    if (admin()) { window.renderCategories(); document.getElementById('page-categories').classList.remove('hidden'); }
    if (scroll) window.scrollTo(0,0);
  }
  function interceptPage(target) {
    if (target === 'qualification' || (restricted() && target !== 'profile')) { display(); return true; }
    page.classList.add('hidden'); return false;
  }
  function loadBallot(token) {
    if (ballotPromise && ballotToken === token) return ballotPromise;
    ballotToken = token;
    const pending = (async () => {
    ballotReady = false; controls();
    try {
      const choices = await store.ballot();
      if (token !== generation) return;
      saved = new Set(choices.filter(id=>catalog.some(c=>c.id===id))); draft = new Set(saved); ballotReady = true;
      status.textContent = saved.size === model.limit ? 'Твой выбор сохранён. Можно изменить его до окончания отбора.' : 'Выбрано 0 пар. Для отправки отметь 16.';
    } catch { if (token === generation) status.textContent = 'Не удалось загрузить сохранённый выбор. Нажми «Обновить», чтобы повторить.'; }
    if (token === generation) controls();
    })();
    ballotPromise = pending;
    pending.finally(() => { if (ballotPromise === pending) ballotPromise = null; });
    return pending;
  }
  async function results() {
    if (!admin() || !ready || resultsBusy) return;
    resultsBusy = true; const token = generation;
    const refresh = [document.getElementById('qualification-results-refresh'),document.getElementById('admin-qualification-refresh')];
    refresh.forEach(button=>button.disabled=true);
    try {
      const tally = model.tally(catalog, await store.results());
      if (!admin() || token !== generation) return;
      adminResults.replaceChildren(node('p',`Проголосовало: ${tally.voters}. Каждый бюллетень содержит 16 пар.`));
      if (!tally.voters) adminResults.append(node('p','Голосов пока нет. Топ-16 ещё не определён.'));
      const list = node('ol',undefined,'qualification-ranking');
      tally.ranked.forEach((c,i) => {
        const row = node('li'); row.append(node('span',c.name),node('strong',String(c.votes)));
        if(i===15 && tally.voters) row.classList.add('qualification-cutoff'); list.append(row);
      });
      const explanation = !tally.voters ? 'Все пары показаны с нулём голосов. Прошедшие пары ещё не определены.' : tally.cutoffTie ? 'На границе 16-го места равенство голосов. Список предварительный; порядок при равенстве — по алфавиту.' : 'Черта после 16-го места — текущая граница прохода. Это предварительные итоги.';
      adminResults.append(list,node('p',explanation));
      panelResults.replaceChildren(node('p',`Проголосовало: ${tally.voters}. Пар в отборе: ${tally.ranked.length}.`));
      const table=node('table',undefined,'admin-table qualification-results-table'),head=node('thead'),headRow=node('tr'),body=node('tbody');
      ['Место','Пара','Голоса'].forEach(label=>{const th=node('th',label);th.scope='col';headRow.append(th);});head.append(headRow);
      tally.ranked.forEach((c,i)=>{
        const row=node('tr');row.dataset.candidateId=c.id;
        row.append(node('td',tally.voters?String(i+1):'—'),node('td',c.name),node('td',String(c.votes),'qualification-votes'));
        if(i===15 && tally.voters)row.classList.add('qualification-cutoff');body.append(row);
      });
      table.append(head,body);panelResults.append(table,node('p',explanation));
    } catch { if (admin() && token===generation) { adminResults.textContent='Не удалось загрузить итоги. Повтори обновление.'; panelResults.textContent=adminResults.textContent; } }
    finally { resultsBusy = false; refresh.forEach(button=>button.disabled=false); }
  }
  function sync() {
    document.body.classList.toggle('qualification-restricted', restricted());
    const votes = document.getElementById('my-votes-list')?.closest('.section-card'); if(votes) votes.hidden=restricted();
    document.querySelectorAll('[data-main-nav]').forEach(n=>n.hidden=restricted());
    document.getElementById('qualification-nav').hidden=phase==='main';
    const key = user() ? `${user().id}:${user().role}:${user().status}` : 'guest';
    if (key !== sessionKey) {
      sessionKey=key; generation++; busy=false; draft=new Set(); saved=new Set(); adminResults.replaceChildren(); panelResults.replaceChildren();
      if (ready) { loadBallot(generation); if(admin())results(); }
    }
    controls();
    if (restricted() && !document.getElementById('page-profile').classList.contains('hidden')) return;
    if (restricted() || !page.classList.contains('hidden')) display(false);
  }
  async function setup() {
    if(setupPromise)return setupPromise;
    setupPromise=(async()=>{
      try {
        const data=await store.setup();
        if (!['qualification','main'].includes(data.phase) || data.candidates.length !== model.candidates.length || new Set(data.candidates.map(c=>c.id)).size!==data.candidates.length) throw new Error('Invalid catalog');
        const changed=phase!==data.phase; phase=data.phase; catalog=data.candidates; ready=true;
        if(!grid.children.length || !ballotReady)buildGrid();
        sync();
        if (!ballotReady) await loadBallot(generation);
        if(admin())await results();
        if(changed && phase==='main' && !page.classList.contains('hidden')) { page.classList.add('hidden'); window.showPage('categories'); }
      } catch { ready=false; status.textContent='Не удалось подключить отбор. Обнови подключение, чтобы загрузить и сохранить свой выбор.'; controls(); }
      finally { setupPromise=null; }
    })();
    return setupPromise;
  }
  save.onclick=async()=>{
    if (!editable() || busy || !model.validBallot([...draft],catalog))return;
    const token=generation, choices=[...draft]; busy=true; controls();
    try {
      await store.save(choices);
      if(token!==generation)return;
      saved=new Set(choices); status.textContent='Сохранено! Твои 16 пар участвуют в отборе.';
    } catch { if(token===generation)status.textContent='Не удалось сохранить выбор. Он остался на экране — повтори отправку. Проверь, что аккаунт одобрен, а отбор ещё открыт.'; }
    finally { if(token===generation){busy=false;controls();} }
  };
  document.getElementById('qualification-refresh').onclick=async()=>{await setup(); if(ready)await loadBallot(generation);};
  document.getElementById('qualification-results-refresh').onclick=results;
  document.getElementById('admin-qualification-refresh').onclick=results;
  const easter=window.openEasterEgg; window.openEasterEgg=()=>{if(!restricted())easter();};
  window.SlayQualification={sync, interceptPage, restricted, mainVotingAllowed:()=>phase==='main', refreshResults:()=>ready?results():setup()};
  buildGrid(); sync();
  Promise.resolve(window.SLAY_AUTH_READY).then(()=>{sync();return setup();});
  setInterval(()=>{if(!document.hidden&&!busy)setup();},30000);
})();
