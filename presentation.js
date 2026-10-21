(() => {
  'use strict';
  const model = window.SlayPresentationModel;
  const category = document.getElementById('presentation-category'), source = document.getElementById('presentation-source');
  const cards = document.getElementById('presentation-scenes'), status = document.getElementById('presentation-status');
  const refresh = document.getElementById('presentation-refresh'), nominations = window.NOMINATIONS;
  const isAdmin = () => window.DB.getCurrentUser()?.role === 'admin';
  const sectionOpen = () => isAdmin() && !document.getElementById('page-admin').classList.contains('hidden') && !document.getElementById('admin-section-presentation').classList.contains('hidden');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let audios = new Map(), audioLoaded = false, refreshPromise, run = 0, phase = 'closed';
  let activeNomination, activeSnapshot, originalFocus, previousOverflow = null, muted = false;
  let audioFinish, phaseTimer, phaseFinish, audioTimeout, sound, isOpening = false;
  let movie, videoFinish, videoTimeout;
  const animations = new Set(), dialog = document.createElement('dialog');
  dialog.className = 'award-dialog'; dialog.setAttribute('aria-label', 'Церемония SLAY AWARD');
  dialog.innerHTML = `<div class="award-stage-host"></div><div class="award-toolbar"><span class="award-position" role="status" aria-live="polite"></span><button type="button" data-action="sound">Звук включён</button><button type="button" data-action="resume" hidden>Включить озвучку</button><button type="button" data-action="skip">К участникам →</button><button type="button" data-action="replay">Повторить с новыми итогами</button><button type="button" data-action="fullscreen">На весь экран</button><button type="button" data-action="close">Закрыть ×</button></div>`;
  document.body.append(dialog);
  nominations.forEach(n => category.add(new Option(model.titleOf(n), n.id)));
  const action = name => dialog.querySelector(`[data-action="${name}"]`);
  const message = text => { dialog.querySelector('.award-position').textContent = text; };
  function el(tag, className, text) {
    const node = document.createElement(tag); node.className = className;
    if (text !== undefined) node.textContent = text; return node;
  }
  function animate(node, frames, options) {
    if (reduceMotion.matches) return;
    const animation = node.animate(frames, { fill: 'both', easing: 'cubic-bezier(.22,1,.36,1)', ...options });
    animations.add(animation);
    animation.finished.catch(() => {}).finally(() => animations.delete(animation));
    return animation;
  }
  function cancelAnimations() { animations.forEach(a => a.cancel()); animations.clear(); }
  function stopAudio() {
    clearTimeout(audioTimeout);
    if (sound) { sound.pause(); sound.removeAttribute('src'); sound.load(); sound = null; }
    action('resume').hidden = true;
    const finish = audioFinish; audioFinish = null; finish?.('cancelled');
  }
  function stopVideo() {
    clearTimeout(videoTimeout);
    const finish = videoFinish; videoFinish = null; finish?.('cancelled');
    if (movie) { movie.pause(); movie.removeAttribute('src'); movie.load(); movie = null; }
    action('resume').hidden = true; action('resume').textContent = 'Включить озвучку';
  }
  async function showNomineeVideo(person, id, expectedPhase) {
    if (activeNomination.id !== 'tiktok' || !person.video || person.hidden) return;
    if (id !== run || phase !== expectedPhase) return;
    stopAudio(); stopVideo();
    const stage = dialog.querySelector('.award-live-stage'), overlay = el('section', 'award-live-video-scene');
    overlay.setAttribute('aria-label', 'Видео номинации Тикток года');
    const video = el('video', 'award-live-video');
    video.autoplay = true; video.playsInline = true; video.controls = true;
    video.preload = 'auto'; video.muted = muted;
    video.setAttribute('aria-label', 'Ролик номинанта');
    overlay.append(el('p', 'award-live-video-label', 'ТИКТОК ГОДА / СМОТРИМ РОЛИК'), video);
    stage.append(overlay); movie = video;
    const previousSkip = { text: action('skip').textContent, disabled: action('skip').disabled };
    action('skip').textContent = 'Пропустить ролик →'; action('skip').disabled = false;
    message('Тикток года · смотрим ролик');
    animate(overlay, [{ opacity: 0 }, { opacity: 1 }], { duration: 650, fill: 'none' });
    await new Promise(resolve => {
      let settled = false;
      const finish = result => {
        if (settled) return; settled = true; clearTimeout(videoTimeout);
        video.onended = video.onerror = video.onwaiting = video.onstalled = video.onplaying = null;
        video.pause(); if (videoFinish === finish) videoFinish = null;
        action('resume').hidden = true; resolve(result);
      };
      videoFinish = finish;
      const stalled = () => { clearTimeout(videoTimeout); videoTimeout = setTimeout(() => { message('Ролик недоступен · продолжаем объявление'); finish('unavailable'); }, 20000); };
      video.onended = () => finish('ended');
      video.onerror = () => { message('Ролик не загрузился · продолжаем объявление'); finish('unavailable'); };
      video.onwaiting = video.onstalled = stalled;
      video.onplaying = () => { if (id === run && !settled) { clearTimeout(videoTimeout); action('resume').hidden = true; } };
      video.src = person.video.split('/').map(encodeURIComponent).join('/'); stalled();
      video.play().catch(error => {
        if (settled || id !== run) return;
        if (error.name === 'NotAllowedError') {
          clearTimeout(videoTimeout); action('resume').textContent = 'Воспроизвести видео'; action('resume').hidden = false;
          message('Нажми «Воспроизвести видео», чтобы продолжить');
        } else finish('unavailable');
      });
    });
    if (id !== run || phase !== expectedPhase) return;
    animate(overlay, [{ opacity: 1 }, { opacity: 0 }], { duration: 450 });
    await pauseFor(reduceMotion.matches ? 0 : 450);
    if (id !== run || phase !== expectedPhase) return;
    if (movie === video) stopVideo();
    overlay.remove(); action('skip').textContent = previousSkip.text; action('skip').disabled = previousSkip.disabled;
  }
  function playAudio(url, id, sync = {}) {
    stopAudio();
    if (!url || id !== run) return Promise.resolve('unavailable');
    return new Promise(resolve => {
      const audio = new Audio(); sound = audio; audio.muted = muted; audio.preload = 'auto';
      let settled = false, started = false;
      const finish = result => {
        if (settled) return; settled = true; clearTimeout(audioTimeout);
        audio.onended = audio.onerror = audio.onwaiting = audio.onplaying = audio.ontimeupdate = null;
        audio.pause();
        if (audioFinish === finish) audioFinish = null;
        action('resume').hidden = true; resolve(result);
      };
      audioFinish = finish;
      const stalled = () => { clearTimeout(audioTimeout); audioTimeout = setTimeout(() => finish('unavailable'), 20000); };
      audio.onended = () => finish('ended'); audio.onerror = () => finish('unavailable');
      audio.onwaiting = () => { if (started) sync.onPause?.(); stalled(); };
      audio.onplaying = () => {
        if (settled || id !== run) return;
        clearTimeout(audioTimeout); action('resume').hidden = true;
        if (!started) { started = true; sync.onStart?.(); }
        sync.onResume?.();
      };
      // Published lead-ins include three seconds of editing silence. Advance at speech end.
      audio.ontimeupdate = () => {
        if (started && sync.trimEnd > 0 && Number.isFinite(audio.duration) && audio.duration > sync.trimEnd && audio.currentTime >= audio.duration - sync.trimEnd) finish('ended');
      };
      audio.src = url; stalled();
      audio.play().catch(error => {
        if (settled || id !== run) return;
        if (error.name === 'NotAllowedError') { clearTimeout(audioTimeout); action('resume').hidden = false; message('Нажми «Включить озвучку», чтобы начать'); }
        else finish('unavailable');
      });
    });
  }
  function notice() {
    if (source.value !== 'votes') { status.textContent = 'Репетиция с силуэтами. Для реальных имён выбери «По голосованию».'; return; }
    status.textContent = window.SLAY_RESULTS_UPDATED_AT
      ? 'Актуальные итоги · ' + new Date(window.SLAY_RESULTS_UPDATED_AT).toLocaleTimeString('ru-RU') + '. Каждый запуск и переход к местам обновляют данные. Во время раскрытия порядок не меняется.'
      : 'Для показа автоматически загрузятся текущие итоги. Если связь с сервером недоступна, результаты не раскрываются.';
  }
  async function updateResults() {
    if (!isAdmin()) return false;
    if (!refreshPromise) {
      refresh.disabled = true;
      refreshPromise = Promise.resolve().then(() => window.renderAdmin()).then(() => Boolean(window.SLAY_RESULTS_UPDATED_AT)).catch(() => false).finally(() => { refreshPromise = null; refresh.disabled = false; notice(); });
    }
    return refreshPromise;
  }
  function renderCards() {
    cards.replaceChildren();
    const n = nominations.find(n => n.id === category.value);
    const card = el('button', 'presentation-sequence-card'); card.type = 'button';
    const image = el('img', ''); image.src = `images/nominations/${n.id}.svg`; image.alt = '';
    card.append(image, el('strong', '', 'Запустить церемонию'), el('span', '', n.id === 'tiktok' ? 'Подводка → ролики и участники → пьедестал' : 'Подводка → непризовые места → пьедестал'));
    card.disabled = !audioLoaded; card.onclick = start;
    cards.append(card, el('p', 'presentation-audio-note', !audioLoaded ? 'Загружаю список озвучек…' : audios.get(n.id)?.lead ? 'Озвучка подключена. Места и имена подставляются автоматически.' : 'Подводка пока не озвучена. Церемония начнётся с названия номинации, затем покажет результаты.'));
    notice();
  }
  function portrait(person, nomination) {
    const wrap = el('div', 'award-live-portrait'), image = el('img', '');
    image.alt = person.hidden ? 'Участник скрыт' : person.name;
    image.onload = () => image.classList.add('is-ready');
    image.src = person.photo || (person.hidden ? 'images/unknown-participant.png' : `images/nominations/${nomination.id}.svg`);
    if (!person.photo) image.classList.add('award-symbol');
    image.onerror = () => { image.onerror = null; image.src = `images/nominations/${nomination.id}.svg`; image.classList.add('award-symbol'); };
    wrap.append(image); return wrap;
  }
  function makeStage(n) {
    const stage = el('div', 'award-live-stage phase-intro'), header = el('div', 'award-live-header');
    header.append(el('span', 'award-live-brand', 'SLAY / 2026'), el('span', '', 'ВАЙПЕР ШМАЙПЕР'));
    const intro = el('section', 'award-live-intro');
    intro.append(el('p', 'award-live-eyebrow', 'НОМИНАЦИЯ ' + String(nominations.indexOf(n) + 1).padStart(2, '0')), el('h1', 'award-live-title', model.titleOf(n)), el('p', 'award-live-tagline', 'СВОИ НАГРАЖДАЮТ СВОИХ'));
    const art = el('img', 'award-live-art'); art.src = `images/nominations/${n.id}.svg`; art.alt = ''; intro.append(art);
    stage.append(header, intro, el('section', 'award-live-row-scene'), el('section', 'award-live-podium-scene'));
    const footer = el('div', 'award-live-footer');
    footer.append(el('span', '', '01 / НОМИНАЦИЯ'), el('span', '', '02 / УЧАСТНИКИ'), el('span', '', '03 / ПЬЕДЕСТАЛ'));
    stage.append(footer); dialog.querySelector('.award-stage-host').replaceChildren(stage); return stage;
  }
  function close() {
    run++; clearTimeout(phaseTimer); phaseFinish?.(); phaseFinish = null; stopAudio(); stopVideo(); cancelAnimations(); isOpening = false; phase = 'closed';
    if (dialog.open) dialog.close();
    dialog.querySelector('.award-stage-host').replaceChildren();
    if (previousOverflow !== null) { document.body.style.overflow = previousOverflow; previousOverflow = null; }
    if (document.fullscreenElement === dialog) document.exitFullscreen().catch(() => {});
    originalFocus?.focus();
  }
  async function start() {
    if (!isAdmin() || !sectionOpen() || isOpening) return;
    const n = nominations.find(n => n.id === category.value);
    if (dialog.open) close();
    isOpening = true; const id = ++run;
    status.textContent = 'Загружаю актуальные итоги…';
    try {
      if (source.value === 'votes' && !await updateResults()) { status.textContent = 'Не удалось загрузить свежие итоги. Проверь соединение и повтори запуск.'; return; }
      if (id !== run || !sectionOpen()) return;
      activeNomination = n; activeSnapshot = null; phase = 'intro';
      originalFocus = document.activeElement; previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
      makeStage(n); dialog.showModal(); action('close').focus({ preventScroll: true });
      action('skip').disabled = false; action('skip').textContent = 'К участникам →'; message(model.titleOf(n));
      const lead = audios.get(n.id)?.lead;
      if (lead) {
        const result = await playAudio(lead, id, { trimEnd: 3 });
        if (id !== run || phase !== 'intro') return;
        if (result === 'unavailable') message('Озвучка недоступна — продолжаем показ');
      } else { message('Озвучка подводки пока отсутствует'); await new Promise(resolve => { phaseFinish = resolve; phaseTimer = setTimeout(() => { phaseFinish = null; resolve(); }, 3500); }); }
      if (id === run && phase === 'intro') await revealRow(id);
    } finally { if (id === run) isOpening = false; }
  }
  async function revealRow(id) {
    if (id !== run || !dialog.open || !['intro', 'loading'].includes(phase)) return;
    phase = 'loading'; clearTimeout(phaseTimer); phaseFinish?.(); phaseFinish = null; stopAudio(); action('skip').disabled = true; message('Проверяю итоги перед раскрытием…');
    if (source.value === 'votes' && !await updateResults()) {
      if (id === run) { phase = 'intro'; message('Не удалось обновить итоги. Нажми «К участникам», чтобы повторить.'); action('skip').disabled = false; } return;
    }
    if (id !== run || !dialog.open || !sectionOpen()) return;
    activeSnapshot = model.snapshot(activeNomination, window.getNominationResults(activeNomination.id), source.value === 'votes');
    const stage = dialog.querySelector('.award-live-stage'), scene = stage.querySelector('.award-live-row-scene'); scene.replaceChildren();
    const snapshot = activeSnapshot, people = snapshot.nonPrize;
    if (!people.length) { showPodium(id); return; }
    phase = 'row'; stage.className = 'award-live-stage phase-row';
    const rankedRow = snapshot.hasRanking && people.every(p => p.rank !== null);
    scene.append(el('p', 'award-live-eyebrow', rankedRow ? `МЕСТА ${people[0].rank} — ${people[people.length - 1].rank}` : snapshot.hasRanking ? 'НЕПРИЗОВЫЕ УЧАСТНИКИ' : 'УЧАСТНИКИ НОМИНАЦИИ'), el('h2', 'award-live-scene-title', snapshot.title));
    const viewport = el('div', 'award-live-row-viewport'), row = el('div', 'award-live-row'); row.style.setProperty('--people', Math.min(6, people.length));
    people.forEach(person => {
      const card = el('article', 'award-live-contender'); card.title = person.name;
      card.append(el('span', 'award-live-place', snapshot.hasRanking && person.rank !== null ? String(person.rank).padStart(2, '0') : '—'), portrait(person, activeNomination), el('strong', '', person.name), el('small', '', person.hidden ? 'ВАЙПЕР ШМАЙПЕР' : person.total === 0 ? 'Пока без голосов' : `${person.total} ${snapshot.unit}${person.tied ? ' · равенство' : ''}`)); row.append(card);
    });
    viewport.append(row); scene.append(viewport);
    row.style.opacity = '0';
    message(snapshot.hasRanking ? rankedRow ? 'Непризовые места · от последнего к четвёртому' : 'Непризовые участники · включая тех, кто пока без голосов' : 'Голосов пока нет · победители не определены');
    action('skip').textContent = 'К пьедесталу →'; action('skip').disabled = false;
    announceRow(id, people, row, viewport);
  }
  function pauseFor(ms) {
    return new Promise(resolve => { phaseFinish = resolve; phaseTimer = setTimeout(() => { phaseFinish = null; resolve(); }, ms); });
  }
  async function announceRow(id, people, row, viewport) {
    let entered = false, pan = 0;
    const enter = () => {
      if (entered) return; entered = true; row.style.opacity = '1';
      animate(row, [{ opacity: 0, transform: 'translateY(55px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 1900 });
    };
    for (const [index, person] of people.entries()) {
      if (id !== run || phase !== 'row') return;
      const card = row.children[index];
      if (card.offsetLeft < pan || card.offsetLeft + card.offsetWidth > pan + viewport.clientWidth + 1) {
        pan = Math.max(0, Math.min(card.offsetLeft - viewport.clientWidth * .1, row.scrollWidth - viewport.clientWidth));
        row.style.translate = `-${pan}px 0px`;
        if (!reduceMotion.matches) await pauseFor(1100);
      }
      if (id !== run || phase !== 'row') return;
      await showNomineeVideo(person, id, 'row');
      if (id !== run || phase !== 'row') return;
      const highlight = () => { enter(); card.classList.add('is-speaking'); message('Сейчас: ' + person.name); };
      const url = person.identity && audios.get(activeNomination.id)?.names.get(person.identity);
      const result = await playAudio(url, id, { onStart: highlight });
      if (id !== run || phase !== 'row') return;
      if (result === 'unavailable') { highlight(); await pauseFor(2400); }
      card.classList.remove('is-speaking');
    }
    if (id === run && phase === 'row') showPodium(id);
  }
  function showPodium(id) {
    if (id !== run || !dialog.open || !activeSnapshot) return;
    phase = 'podium'; clearTimeout(phaseTimer); phaseFinish?.(); phaseFinish = null; stopAudio(); stopVideo();
    const stage = dialog.querySelector('.award-live-stage'); stage.className = 'award-live-stage phase-podium';
    const scene = stage.querySelector('.award-live-podium-scene'); scene.replaceChildren(); const snapshot = activeSnapshot;
    scene.append(el('p', 'award-live-eyebrow', snapshot.hasRanking ? 'ЛУЧШИЕ В ЭТОМ ГОДУ' : 'ИТОГИ ЕЩЁ ВПЕРЕДИ'), el('h2', 'award-live-scene-title', snapshot.title));
    action('skip').disabled = true;
    if (!snapshot.podium.length) { scene.append(el('p', 'award-live-empty', 'Голосов пока нет. Победители появятся автоматически после голосования.')); message('Нет результатов · повторный запуск обновит данные'); return; }
    const podium = el('div', 'award-live-podium'), entrants = new Map(); if (snapshot.podium.length < 3) podium.classList.add('award-live-small-podium');
    [2, 1, 3].forEach(rank => {
      const person = snapshot.podium.find(p => p.rank === rank); if (!person) return;
      const card = el('article', `award-live-winner award-live-rank-${rank}`), base = el('div', 'award-live-pedestal');
      base.append(el('span', 'award-live-medal', String(rank)), el('strong', '', person.name), el('small', '', person.hidden ? 'ВАЙПЕР ШМАЙПЕР' : `${person.total} ${snapshot.unit}${person.tied ? ' · равенство' : ''}`));
      card.append(portrait(person, activeNomination), base); podium.append(card);
      card.style.opacity = '0'; card.setAttribute('aria-hidden', 'true'); entrants.set(rank, card);
    });
    scene.append(podium);
    if (snapshot.hasTies) scene.append(el('p', 'award-live-tie-note', 'При равенстве баллов порядок — по алфавиту, как в итогах голосования.'));
    message('Пьедестал · ' + snapshot.title); announcePodium(id, entrants);
  }
  async function announcePodium(id, entrants) {
    for (const person of [...activeSnapshot.podium].reverse()) {
      if (id !== run || phase !== 'podium') return;
      await showNomineeVideo(person, id, 'podium');
      if (id !== run || phase !== 'podium') return;
      const card = entrants.get(person.rank);
      let entrance;
      const reveal = () => {
        card.style.opacity = '1'; card.setAttribute('aria-hidden', 'false'); card.classList.add('is-announced');
        message(person.rank + ' место · ' + person.name);
        entrance = animate(card, [{ opacity: 0, transform: 'translateY(90px) scale(.97)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { duration: 2400 });
      };
      const url = person.identity && audios.get(activeNomination.id)?.names.get(person.identity);
      const result = await playAudio(url, id, {
        onStart: reveal,
        onPause: () => { if (entrance?.playState === 'running') entrance.pause(); },
        onResume: () => { if (entrance?.playState === 'paused') entrance.play(); }
      });
      if (id !== run || phase !== 'podium') return;
      if (result === 'unavailable') { if (!card.classList.contains('is-announced')) reveal(); if (entrance?.playState === 'paused') entrance.play(); await pauseFor(2400); }
      if (entrance?.playState === 'paused') entrance.play();
    }
  }
  dialog.addEventListener('click', async event => {
    const name = event.target.closest('[data-action]')?.dataset.action;
    if (name === 'close') close();
    if (name === 'replay') { close(); start(); }
    if (name === 'skip') { if (movie) videoFinish?.('skipped'); else if (phase === 'intro') revealRow(run); else if (phase === 'row') showPodium(run); }
    if (name === 'sound') { muted = !muted; if (sound) sound.muted = muted; if (movie) movie.muted = muted; action('sound').textContent = muted ? 'Звук выключен' : 'Звук включён'; }
    if (name === 'resume' && (movie || sound)) { try { await (movie || sound).play(); } catch { message(movie ? 'Видео не запускается. Можно пропустить ролик.' : 'Озвучка не запускается. Можно перейти к участникам.'); } }
    if (name === 'fullscreen') { try { if (document.fullscreenElement) await document.exitFullscreen(); else await dialog.requestFullscreen(); } catch { message('Полноэкранный режим недоступен'); } }
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('close', () => { if (!dialog.open && phase !== 'closed') close(); });
  category.onchange = () => { if (dialog.open || isOpening) close(); renderCards(); };
  source.onchange = () => { if (dialog.open || isOpening) close(); notice(); };
  refresh.onclick = async () => { status.textContent = 'Загружаю актуальные итоги…'; if (!await updateResults()) status.textContent = 'Итоги не обновились. Проверь соединение и повтори.'; };
  window.addEventListener('slay:results-updated', notice);
  new MutationObserver(() => { if ((dialog.open || isOpening) && !sectionOpen()) close(); }).observe(document.getElementById('page-admin'), { attributes: true, subtree: true, attributeFilter: ['class'] });
  setInterval(() => { if (sectionOpen() && !document.hidden && source.value === 'votes' && !isOpening && phase !== 'loading') updateResults(); }, 30000);
  async function loadAudio() {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('audio/slay-2026/manifest.json', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Audio manifest unavailable'); audios = model.audioMap(await response.json(), nominations);
    } catch { audios = new Map(); }
    finally { clearTimeout(timer); audioLoaded = true; renderCards(); }
  }
  renderCards(); loadAudio();
})();
