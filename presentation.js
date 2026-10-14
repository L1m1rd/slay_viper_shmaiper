(() => {
  'use strict';
  const model = window.SlayPresentationModel;
  const category = document.getElementById('presentation-category');
  const source = document.getElementById('presentation-source');
  const scenes = document.getElementById('presentation-scenes');
  const status = document.getElementById('presentation-status');
  const refresh = document.getElementById('presentation-refresh');
  const nominations = window.NOMINATIONS.filter(n => model.ranks(n.id).length);
  const captions = { 3: 'СИЛЬНЫЙ СЕЗОН. ЗАСЛУЖЕННОЕ МЕСТО.', 2: 'ЕЩЁ ВЫШЕ. ЕЩЁ БЛИЖЕ К ВЕРШИНЕ.', 1: 'ЭТО ТВОЙ МОМЕНТ.' };
  const title = n => n.title.replace(/^[^\p{L}\p{N}]+/u, '').toUpperCase();
  const isAdmin = () => window.DB.getCurrentUser()?.role === 'admin';
  let activeRank = 3;
  let originFocus;
  let refreshFailed = false;
  let previousOverflow = '';
  let sceneRequest = 0;
  let hasOpenScene = false;
  nominations.forEach(n => category.add(new Option(title(n), n.id)));
  const dialog = document.createElement('dialog');
  dialog.className = 'award-dialog';
  dialog.setAttribute('aria-label', 'Презентация победителей');
  dialog.innerHTML = `<div class="award-stage-host"></div><div class="award-toolbar"><button type="button" data-action="previous">← Назад</button><span class="award-position"></span><button type="button" data-action="next">Далее →</button><button type="button" data-action="replay">Повторить</button><button type="button" data-action="fullscreen">На весь экран</button><button type="button" data-action="close">Закрыть ×</button></div>`;
  document.body.append(dialog);
  function notice() {
    if (refreshFailed) { status.textContent = 'Не удалось обновить итоги. Повтори загрузку перед показом результатов.'; return; }
    if (source.value !== 'votes') { status.textContent = 'Репетиция: все места показаны с неизвестным участником.'; return; }
    status.textContent = window.SLAY_RESULTS_UPDATED_AT
      ? 'Итоги загружены в ' + new Date(window.SLAY_RESULTS_UPDATED_AT).toLocaleTimeString('ru-RU') + '. Имена и фото подставляются автоматически при открытии сцены. При равных баллах порядок совпадает с разделом «Итоги» — по алфавиту.'
      : 'Сначала нажми «Обновить итоги», чтобы загрузить результаты голосования.';
  }
  function renderCards() {
    scenes.replaceChildren();
    const n = nominations.find(n => n.id === category.value);
    for (const rank of model.ranks(n.id)) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'presentation-scene-card';
      const img = document.createElement('img');
      img.src = model.background(n.id, rank); img.alt = ''; img.loading = 'lazy';
      const label = document.createElement('span'); label.textContent = rank === 1 ? '1 место · Победитель ↗' : rank + ' место ↗';
      button.append(img, label); button.onclick = () => open(rank); scenes.append(button);
    }
    notice();
  }
  function close() {
    sceneRequest++;
    if (dialog.open) dialog.close();
    cleanup();
  }
  function cleanup() {
    if (!hasOpenScene) return;
    hasOpenScene = false;
    sceneRequest++;
    dialog.querySelector('.award-stage-host').replaceChildren();
    document.body.style.overflow = previousOverflow;
    if (document.fullscreenElement === dialog) document.exitFullscreen().catch(() => {});
    originFocus?.focus();
  }
  dialog.addEventListener('close', () => { if (!dialog.open) cleanup(); });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  async function open(rank) {
    if (!isAdmin()) { close(); return; }
    const n = nominations.find(n => n.id === category.value);
    if (!model.ranks(n.id).includes(rank)) return;
    if (source.value === 'votes' && (!window.SLAY_RESULTS_UPDATED_AT || refreshFailed)) { notice(); return; }
    const result = model.resolve(n, rank, window.getNominationResults(n.id), source.value === 'votes');
    const request = ++sceneRequest;
    const preload = new Image();
    preload.src = model.background(n.id, rank);
    status.textContent = 'Загружаю сцену…';
    try { await preload.decode(); }
    catch { if (request === sceneRequest) status.textContent = 'Не удалось загрузить фон. Проверь соединение и открой сцену ещё раз.'; return; }
    if (request !== sceneRequest || !isAdmin() || document.getElementById('page-admin').classList.contains('hidden') || document.getElementById('admin-section-presentation').classList.contains('hidden')) return;
    notice();
    activeRank = rank;
    if (!dialog.open) {
      originFocus = document.activeElement;
      previousOverflow = document.body.style.overflow;
      dialog.showModal(); hasOpenScene = true; document.body.style.overflow = 'hidden';
    }
    const stage = document.createElement('div');
    stage.className = `award-stage award-rank-${rank}`;
    const bg = document.createElement('img');
    bg.className = 'award-background'; bg.src = model.background(n.id, rank); bg.alt = `${title(n)} — ${rank} место`;
    const portrait = document.createElement('div'); portrait.className = 'award-portrait';
    const img = document.createElement('img'); img.src = result.photo; img.alt = result.known ? result.name : 'Неизвестный участник';
    img.onerror = () => { img.onerror = null; img.src = 'images/unknown-participant.png'; img.alt = 'Фото пока недоступно'; };
    portrait.append(img);
    const subtitle = document.createElement('div'); subtitle.className = 'award-subtitle'; subtitle.textContent = captions[rank];
    const nameplate = document.createElement('div'); nameplate.className = 'award-name';
    const name = document.createElement('strong'); name.textContent = result.name;
    const detail = document.createElement('span'); detail.textContent = source.value === 'votes' && result.total
      ? `${result.total} ${n.votingType === 'multi-vote' ? 'голосов' : 'баллов'}${result.tied ? ' · равенство баллов' : ''}`
      : 'SLAY AWARD / 2026';
    nameplate.append(name, detail);
    const particles = document.createElement('div'); particles.className = 'award-particles'; particles.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < (rank === 1 ? 20 : 7); i++) {
      const p = document.createElement('i'); p.style.setProperty('--i', i); p.style.left = `${(i * 37 + 7) % 100}%`; particles.append(p);
    }
    stage.append(bg, portrait, subtitle, particles, nameplate);
    dialog.querySelector('.award-stage-host').replaceChildren(stage);
    const ranks = model.ranks(n.id), index = ranks.indexOf(rank);
    dialog.querySelector('.award-position').textContent = `${rank} место / ${title(n)}`;
    dialog.querySelector('[data-action="previous"]').disabled = index === 0;
    dialog.querySelector('[data-action="next"]').disabled = index === ranks.length - 1;
    dialog.querySelector('[data-action="close"]').focus({ preventScroll: true });
  }
  dialog.addEventListener('click', async e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    const ranks = model.ranks(category.value), index = ranks.indexOf(activeRank);
    if (action === 'close') close();
    if (action === 'next' && index < ranks.length - 1) open(ranks[index + 1]);
    if (action === 'previous' && index > 0) open(ranks[index - 1]);
    if (action === 'replay') open(activeRank);
    if (action === 'fullscreen') {
      try { if (document.fullscreenElement) await document.exitFullscreen(); else await dialog.requestFullscreen(); }
      catch { window.toast('Полноэкранный режим недоступен в этом браузере'); }
    }
  });
  dialog.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault(); dialog.querySelector(`[data-action="${e.key === 'ArrowRight' ? 'next' : 'previous'}"]`).click();
    }
  });
  refresh.onclick = async () => {
    if (!isAdmin()) return;
    const before = window.SLAY_RESULTS_UPDATED_AT;
    refresh.disabled = true; status.textContent = 'Загружаю итоги…';
    try { await window.renderAdmin(); refreshFailed = !window.SLAY_RESULTS_UPDATED_AT || window.SLAY_RESULTS_UPDATED_AT === before; }
    catch { refreshFailed = true; }
    finally { refresh.disabled = false; notice(); }
  };
  category.onchange = () => { sceneRequest++; renderCards(); };
  source.onchange = () => { sceneRequest++; notice(); };
  window.addEventListener('slay:results-updated', () => { refreshFailed = false; notice(); });
  // Close and discard animation nodes when the administrator leaves the section.
  new MutationObserver(() => {
    if (dialog.open && (!isAdmin() || document.getElementById('admin-section-presentation').classList.contains('hidden') || document.getElementById('page-admin').classList.contains('hidden'))) close();
  }).observe(document.getElementById('page-admin'), { attributes: true, subtree: true, attributeFilter: ['class'] });
  renderCards();
})();
