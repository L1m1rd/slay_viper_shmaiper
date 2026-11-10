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
  let winnerMusic, coupleFilm, coupleIntro=false;
  let narrationContext, narrationGain;
  const musicVolume = .7, musicUnderNarration = .09;
  let entranceIndex=-1;
  const entranceFacts=new Map([
  [
    "Матвей Чернышов",
    {
      "lines": [
        "Действующий Человек-мем года",
        "Интрижек много, серьёзка одна",
        "В этом году наконец-то подрался"
      ],
      "audio": "audio/entrance-2026/matvey.mp3"
    }
  ],
  [
    "Андрей Владыко",
    {
      "lines": [
        "Действующий Dota 2 игрок года",
        "Гриндит дома целыми днями",
        "Траву трогать не собирается"
      ],
      "audio": "audio/entrance-2026/andrey.mp3"
    }
  ],
  [
    "Александр Шамбасов",
    {
      "lines": [
        "Действующий SLAY KING",
        "Луксмаксинг и тачки",
        "Топ-1 керри своей комнаты"
      ],
      "audio": "audio/entrance-2026/shambasov.mp3"
    }
  ],
  [
    "Тимур Насретдинов",
    {
      "lines": [
        "Действующий CS2 игрок года",
        "Бан на FACEIT до января",
        "КМС по Азалии"
      ],
      "audio": "audio/entrance-2026/timur.mp3"
    }
  ],
  [
    "Даниил Постоев",
    {
      "lines": [
        "Действующий Алкаш года",
        "Вайбкодер",
        "Нищий темщик"
      ],
      "audio": "audio/entrance-2026/daniil.mp3"
    }
  ],
  [
    "Шурик",
    {
      "lines": [
        "В скваде с 2026 года",
        "Каждый день новая серьёзка",
        "Будущий врач · пьёт только вино"
      ],
      "audio": "audio/entrance-2026/shurik.mp3"
    }
  ],
  [
    "Арсений Юсупов",
    {
      "lines": [
        "Действующий Стиль года",
        "Мажор, три завода",
        "Претендент на «Пару года»"
      ],
      "audio": "audio/entrance-2026/arseniy.mp3"
    }
  ],
  [
    "Семён Ефремов",
    {
      "lines": [
        "КМС по жиму",
        "Лучшая тройка в Dota 2",
        "Ебаный 2008-й"
      ],
      "audio": "audio/entrance-2026/semen.mp3"
    }
  ],
  [
    "Александр Пеняев",
    {
      "lines": [
        "Без пяти лет лейтенант",
        "КМС по пиву"
      ],
      "audio": "audio/entrance-2026/penyaev.mp3"
    }
  ]
]);
  const entranceParticipants=nominations.find(n=>n.id==='cs2')?.participants||[];
  const entranceRoster=[...entranceFacts.keys()].map(name=>entranceParticipants.find(p=>model.nameOf(p)===name)).filter(Boolean);
  const coupleTestOption = new Option('Тестовый плей-офф', 'playoff-test'); source.add(coupleTestOption);
  const animations = new Set(), dialog = document.createElement('dialog');
  dialog.className = 'award-dialog'; dialog.setAttribute('aria-label', 'Церемония SLAY AWARD');
  dialog.innerHTML = `<div class="award-stage-host"></div><div class="award-toolbar"><span class="award-position" role="status" aria-live="polite"></span><button type="button" data-action="sound">Звук включён</button><button type="button" data-action="resume" hidden>Включить озвучку</button><button type="button" data-action="music" hidden>Включить музыку</button><button type="button" data-action="skip">К участникам →</button><button type="button" data-action="replay">Повторить с новыми итогами</button><button type="button" data-action="film-pause" hidden>Пауза</button><button type="button" data-action="next-nomination">Следующая номинация →</button><button type="button" data-action="fullscreen">На весь экран</button><button type="button" data-action="close">Закрыть ×</button></div>`;
  document.body.append(dialog);
  const presentationOrder = nominations.filter(n => n.id !== 'couple');
  const situationIndex = presentationOrder.findIndex(n => n.id === 'situation');
  const memeIndex = presentationOrder.findIndex(n => n.id === 'meme');
  if (situationIndex >= 0 && memeIndex >= 0) [presentationOrder[situationIndex], presentationOrder[memeIndex]] = [presentationOrder[memeIndex], presentationOrder[situationIndex]];
  const coupleNomination = nominations.find(n => n.id === 'couple');
  if(coupleNomination)presentationOrder.push(coupleNomination);
  presentationOrder.forEach(n => category.add(new Option(model.titleOf(n), n.id)));
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
  function celebrateWinner() {
    const stage = dialog.querySelector('.phase-podium');
    if (!stage || reduceMotion.matches || stage.querySelector('.award-celebration')) return;
    const layer = el('div', 'award-celebration'); layer.setAttribute('aria-hidden', 'true');
    const effects = [], colors = ['#edc52b', '#ffdf73', '#f5efdd', '#b68a26'];
    stage.append(layer);
    const launch = (node, frames, options) => {
      layer.append(node);
      const effect = animate(node, frames, options);
      if (effect) effects.push(effect.finished.catch(() => {}));
    };
    // Fixed particle pool repeats until the stage is closed or replayed.
    for (let i = 0; i < 40; i++) {
      const spark = el('i', 'award-firework-spark'), angle = (i % 20) * Math.PI / 10;
      const radius = 10 + (i * 7 % 6), x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
      spark.style.left = i < 20 ? '18%' : '82%'; spark.style.top = i < 20 ? '34%' : '29%';
      spark.style.background = colors[i % colors.length];
      const tilt = angle * 180 / Math.PI + 90;
      launch(spark, [
        { opacity: 0, transform: `translate(0,0) rotate(${tilt}deg) scale(.4)` },
        { opacity: 1, transform: `translate(${x * .55}cqw,${y * .55}cqw) rotate(${tilt}deg) scale(1)`, offset: .22 },
        { opacity: 0, transform: `translate(${x}cqw,${y + 5}cqw) rotate(${tilt}deg) scale(.3)` }
      ], { duration: 2200 + i % 4 * 180, delay: i < 20 ? 0 : 420, easing: 'cubic-bezier(.15,.55,.4,1)', iterations: Infinity });
    }
    for (let i = 0; i < 64; i++) {
      const piece = el('i', 'award-confetti');
      piece.style.left = `${i * 37 % 100}%`; piece.style.background = colors[i % colors.length];
      piece.style.width = `${.28 + i % 3 * .1}cqw`; piece.style.height = `${.5 + i % 4 * .13}cqw`;
      const drift = (i * 13 % 19) - 9, spin = (i % 2 ? 1 : -1) * (360 + i % 5 * 180);
      launch(piece, [
        { opacity: 0, transform: 'translate(0,-2cqw) rotate(0deg)' },
        { opacity: .95, transform: `translate(${drift * .25}cqw,8cqw) rotate(${spin * .2}deg)`, offset: .18 },
        { opacity: .85, transform: `translate(${drift * .7}cqw,43cqw) rotate(${spin * .75}deg)`, offset: .76 },
        { opacity: 0, transform: `translate(${drift}cqw,62cqw) rotate(${spin}deg)` }
      ], { duration: 4800 + i % 7 * 230, delay: i % 11 * 95, easing: 'linear', iterations: Infinity });
    }
    Promise.all(effects).then(() => layer.remove());
  }
  function stopWinnerMusic() {
    action('music').hidden = true;
    if (!winnerMusic) return;
    winnerMusic.onended = winnerMusic.onerror = winnerMusic.onplaying = null;
    winnerMusic.pause(); winnerMusic.removeAttribute('src'); winnerMusic.load(); winnerMusic = null;
  }
  function playWinnerMusic(person, id, nominationId) {
    stopWinnerMusic();
    const url = model.winnerMusicFor(person, nominationId);
    if (!url || id !== run) return;
    const track = new Audio(); winnerMusic = track;
    track.loop = false; track.preload = 'auto'; track.muted = muted;
    updateMusicVolume();
    track.onplaying = track.onended = track.onerror = () => { if (winnerMusic === track) action('music').hidden = true; };
    track.src = url;
    track.play().catch(error => {
      if (id === run && winnerMusic === track && error.name === 'NotAllowedError') action('music').hidden = false;
    });
  }
  function updateMusicVolume() {
    if (winnerMusic) winnerMusic.volume = audioFinish ? musicUnderNarration : musicVolume;
  }
  function enableNarrationGain() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!narrationContext) {
      narrationContext = new AudioContext();
      narrationGain = narrationContext.createGain();
      narrationGain.gain.value = 1.6;
      const compressor = narrationContext.createDynamicsCompressor();
      compressor.threshold.value = -9;
      compressor.knee.value = 8;
      compressor.ratio.value = 6;
      narrationGain.connect(compressor).connect(narrationContext.destination);
    }
    if (narrationContext.state === 'suspended') narrationContext.resume().catch(() => {});
  }
  function introSpeaking(active) {
    dialog.querySelector('.phase-intro')?.classList.toggle('is-narrating', active && phase === 'intro');
  }
  function stopAudio() {
    introSpeaking(false);
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
    if (!['tiktok', 'situation'].includes(activeNomination.id) || !person.video || person.hidden) return;
    if (id !== run || phase !== expectedPhase) return;
    stopAudio(); stopVideo();
    const stage = dialog.querySelector('.award-live-stage'), overlay = el('section', 'award-live-video-scene');
    const categoryTitle = model.titleOf(activeNomination);
    overlay.setAttribute('aria-label', 'Видео номинации ' + categoryTitle);
    const video = el('video', 'award-live-video');
    video.autoplay = true; video.playsInline = true; video.controls = true;
    video.preload = 'auto'; video.muted = muted;
    video.setAttribute('aria-label', 'Ролик номинанта');
    overlay.append(el('p', 'award-live-video-label', categoryTitle.toUpperCase() + ' / СМОТРИМ РОЛИК'), video);
    stage.append(overlay); movie = video;
    const previousSkip = { text: action('skip').textContent, disabled: action('skip').disabled };
    action('skip').textContent = 'Пропустить ролик →'; action('skip').disabled = false;
    message(categoryTitle + ' · смотрим ролик');
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
      let input;
      if (narrationContext?.state === 'running' && audio instanceof HTMLMediaElement && new URL(url, document.baseURI).origin === location.origin) {
        input = narrationContext.createMediaElementSource(audio);
        input.connect(narrationGain);
      }
      let settled = false, started = false;
      const finish = result => {
        if (settled) return; settled = true; clearTimeout(audioTimeout);
        audio.onended = audio.onerror = audio.onwaiting = audio.onplaying = audio.ontimeupdate = null;
        audio.pause();
        input?.disconnect();
        if (audioFinish === finish) audioFinish = null;
        updateMusicVolume();
        action('resume').hidden = true; resolve(result);
      };
      audioFinish = finish;
      updateMusicVolume();
      const stalled = () => {
        clearTimeout(audioTimeout);
        audioTimeout = setTimeout(() => finish('unavailable'), started ? 20000 : (sync.startTimeout ?? 20000));
      };
      audio.onended = () => finish('ended'); audio.onerror = () => finish('unavailable');
      audio.onwaiting = () => { if (started) sync.onPause?.(); stalled(); };
      audio.onplaying = () => {
        if (settled || id !== run) return;
        clearTimeout(audioTimeout); action('resume').hidden = true;
        if (!started) { started = true; sync.onStart?.(); }
        sync.onResume?.();
      };
      // Advance before the measured trailing silence in published clips.
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
    if(category.value==='couple'){status.textContent=source.value==='playoff-test'?'Репетиция с тестовой сеткой администратора. Тестовые голоса не относятся к премии.':source.value==='votes'?'Пролёт по текущей сетке плей-офф. Числа — количество участников, проголосовавших за пару в каждом матче.':'Репетиция пролёта с неизвестными парами. Голоса не раскрываются.';return;}
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
  function entranceStage(index, text) {
    const stage=el('section','entrance-stage'+(index<0?' is-title':''));
    const head=el('div','entrance-header');head.append(el('span','','SLAY AWARD / 2026'),el('span','','ЦЕРЕМОНИЯ ОТКРЫТИЯ'));
    const main=el('div','entrance-main'),copy=el('div','entrance-copy');
    const kicker=el('p','entrance-kicker',index<0?'СВОИ НАГРАЖДАЮТ СВОИХ':'ВЫХОД УЧАСТНИКА'),title=el('h1','',text),facts=el('ul','entrance-facts');
    copy.append(kicker,title,facts);main.append(copy);
    let portraitFrame;
    if(index>=0){
      portraitFrame=el('div','entrance-portrait');
      const image=el('img','');image.src=entranceRoster[index].photo;image.alt='';portraitFrame.append(image,el('span','',String(index+1).padStart(2,'0')));main.append(portraitFrame);
    }
    const foot=el('div','entrance-footer');foot.append(el('span','','ВАЙПЕР ШМАЙПЕР'),el('strong','',index<0?'ПРЕДСТАВЛЕНИЕ СОСТАВА':String(index+1).padStart(2,'0')+' / '+entranceRoster.length));
    stage.append(head,main,foot);dialog.querySelector('.award-stage-host').replaceChildren(stage);
    return {main,kicker,title,facts,portraitFrame};
  }
  async function showEntrance(index){
    const id=++run;
    clearTimeout(phaseTimer);phaseFinish?.();phaseFinish=null;stopAudio();stopWinnerMusic();cancelAnimations();
    entranceIndex=index;
    if(index>=entranceRoster.length){
      phase='entrance-done';entranceStage(-1,'Все участники представлены');action('skip').disabled=true;message('Вступление завершено');return;
    }
    const entrant=entranceRoster[index],name=model.nameOf(entrant),person={identity:name,hidden:false};
    const track=model.winnerMusicFor(person);
    const {main,kicker,title,facts,portraitFrame}=entranceStage(index,'На выход');
    message('Выход '+(index+1)+' из '+entranceRoster.length);
    if(track)playWinnerMusic(person,id);
    animate(main,[{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:550});
    await pauseFor(track ? 2100 : 650);
    if(id!==run||phase!=='entrance'||!sectionOpen())return;
    kicker.textContent='ЗНАКОМЬТЕСЬ';title.textContent=name;portraitFrame.classList.add('is-revealed');
    animate(title,[{opacity:0,transform:'translateY(16px)'},{opacity:1,transform:'translateY(0)'}],{duration:750});
    message(name);
    const profile=entranceFacts.get(name);
    if(profile?.lines)profile.lines.forEach(line=>facts.append(el('li','',line)));
    await playAudio(audios.get('cs2')?.names.get(name), id, { trimEnd: 1.2, startTimeout: 4000 });
    if(id!==run||phase!=='entrance'||!sectionOpen())return;
    if(profile?.audio)await playAudio(profile.audio,id);
    if(id!==run||phase!=='entrance'||!sectionOpen())return;
    await pauseFor(850);
    if(id===run&&phase==='entrance'&&sectionOpen())showEntrance(index+1);
  }
  async function startEntrance(){
    if(!sectionOpen()||!entranceRoster.length)return;
    enableNarrationGain();
    if(dialog.open)close();
    const id=++run;entranceIndex=-1;phase='entrance';
    originalFocus=document.activeElement;previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
    entranceStage(-1,'Участники премии');
    action('sound').hidden=false;action('skip').disabled=false;action('skip').textContent='Следующий участник →';
    action('replay').textContent='Повторить вступление';action('next-nomination').disabled=false;action('next-nomination').textContent='К номинациям →';
    dialog.showModal();action('close').focus({preventScroll:true});message('Церемония открытия');
    await pauseFor(1800);if(id===run&&phase==='entrance'&&sectionOpen())showEntrance(0);
  }
  function renderCards() {
    cards.replaceChildren();
    const opener=el('button','entrance-launch');opener.type='button';opener.disabled=!audioLoaded||!entranceRoster.length;opener.onclick=startEntrance;
    const openerArt=el('img','');openerArt.src='images/nominations/slayking.svg';openerArt.alt='';
    opener.append(openerArt,el('strong','','Вступление · Представление участников'),el('span','','Музыка выхода → имя → факты. Девять участников, перед номинациями.'));cards.append(opener);
    const n = nominations.find(n => n.id === category.value);
    coupleTestOption.hidden = n.id !== 'couple';
    if(n.id !== 'couple' && source.value === 'playoff-test')source.value='votes';
    const card = el('button', 'presentation-sequence-card'); card.type = 'button';
    const image = el('img', ''); image.src = `images/nominations/${n.id}.svg`; image.alt = '';
    card.append(image, el('strong', '', 'Запустить церемонию'), el('span', '', n.id === 'couple' ? 'Пролёт по сетке → голоса за пары → финал' : n.id === 'tiktok' ? 'Подводка → ролики и участники → пьедестал' : 'Подводка → непризовые места → пьедестал'));
    card.disabled = n.id !== 'couple' && !audioLoaded; card.onclick = start;
    cards.append(card, el('p', 'presentation-audio-note', n.id === 'couple' ? 'Пролёт камеры по сетке, число голосов в каждом матче и финальное раскрытие победителя. Пауза и переход к следующему матчу — в панели показа.' : !audioLoaded ? 'Загружаю список озвучек…' : audios.get(n.id)?.lead ? 'Озвучка подключена. Места и имена подставляются автоматически.' : 'Подводка пока не озвучена. Церемония начнётся с названия номинации, затем покажет результаты.'));
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
    const title = el('h1', 'award-live-title'); title.setAttribute('aria-label', model.titleOf(n));
    let letter = 0;
    model.titleOf(n).split(/(\s+)/).forEach(part => {
      if (/^\s+$/.test(part)) { title.append(document.createTextNode(part)); return; }
      const word = el('span', 'award-live-word'); word.setAttribute('aria-hidden', 'true');
      for (const char of part) {
        const glyph = el('span', 'award-live-glyph', char);
        glyph.style.setProperty('--letter-delay', `${letter++ * 75}ms`); word.append(glyph);
      }
      title.append(word);
    });
    intro.append(el('p', 'award-live-eyebrow', 'НОМИНАЦИЯ ' + String(nominations.indexOf(n) + 1).padStart(2, '0')), title, el('p', 'award-live-tagline', 'СВОИ НАГРАЖДАЮТ СВОИХ'));
    if (['bodybuilder', 'slayking', 'fatness'].includes(n.id)) {
      intro.classList.add('award-intro-' + n.id);
      const accent = el('div', 'award-live-accent'); accent.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 3; i++) { const ring = el('span', ''); ring.style.setProperty('--ring', i); accent.append(ring); }
      intro.append(accent);
    }
    const art = el('img', 'award-live-art'); art.src = `images/nominations/${n.id}.svg`; art.alt = ''; intro.append(art);
    stage.append(header, intro, el('section', 'award-live-row-scene'), el('section', 'award-live-podium-scene'));
    const footer = el('div', 'award-live-footer');
    footer.append(el('span', '', '01 / НОМИНАЦИЯ'), el('span', '', '02 / УЧАСТНИКИ'), el('span', '', '03 / ПЬЕДЕСТАЛ'));
    stage.append(footer); dialog.querySelector('.award-stage-host').replaceChildren(stage); return stage;
  }
  function close() {
    action('replay').textContent='Повторить с новыми итогами';action('next-nomination').textContent='Следующая номинация →';
    coupleIntro=false;coupleFilm?.stop(); coupleFilm=null; action('film-pause').hidden=true;action('sound').hidden=false;
    stopWinnerMusic();
    run++; clearTimeout(phaseTimer); phaseFinish?.(); phaseFinish = null; stopAudio(); stopVideo(); cancelAnimations(); isOpening = false; phase = 'closed';
    if (dialog.open) dialog.close();
    dialog.querySelector('.award-stage-host').replaceChildren();
    if (previousOverflow !== null) { document.body.style.overflow = previousOverflow; previousOverflow = null; }
    if (document.fullscreenElement === dialog) document.exitFullscreen().catch(() => {});
    originalFocus?.focus();
  }
  async function loadCoupleFilm() {
    const [results,photos]=await Promise.all(['qualification-results.json?v=film20261108','playoff-photos.json?v=20261108'].map(async url=>{const r=await fetch(url);if(!r.ok)throw Error('Не удалось загрузить состав пар');return r.json();}));
    const pairs=window.SlayPlayoffModel.seed(results,photos);
    let snapshot,mode=source.value==='playoff-test'?'test':source.value==='votes'?'votes':'silhouette';
    if(mode==='silhouette')snapshot={state:{status:'waiting'},matches:window.SlayPlayoffModel.initialMatches(pairs)};
    else if(mode==='test'){
      snapshot=window.SlayAdminTest?.allowed()?window.SlayAdminTest.get('playoff',null):null;
      if(!snapshot)throw Error('Сначала пройди хотя бы один раунд в тестовом плей-офф, затем запусти презентацию.');
      snapshot=JSON.parse(JSON.stringify(snapshot));
      for(const m of snapshot.matches)if(!m.winner&&m.round===snapshot.state.active_round){const ballot=snapshot.ballots?.[m.round]||{};m.counts=Object.fromEntries((m.entrants||[]).map(id=>[id,ballot[m.slot]===id?1:0]));}
    } else {
      const result=await window.supabaseClient.rpc('get_couple_playoff');
      if(result.error)throw Error('Результаты плей-офф пока недоступны. Для репетиции выбери «Тестовый плей-офф» или «Неизвестный участник».');
      snapshot=result.data;
    }
    if(!snapshot?.state||snapshot.matches?.length!==15)throw Error('Не удалось получить полную сетку плей-офф.');
    return {pairs,snapshot,mode};
  }
  async function start() {
    if (!isAdmin() || !sectionOpen() || isOpening) return;
    enableNarrationGain();
    const n = nominations.find(n => n.id === category.value);
    if (dialog.open) close();
    isOpening = true; const id = ++run;
    status.textContent = 'Загружаю актуальные итоги…';
    try {
      const coupleData=n.id==='couple'?await loadCoupleFilm():null;
      if (n.id!=='couple' && source.value === 'votes' && !await updateResults()) { status.textContent = 'Не удалось загрузить свежие итоги. Проверь соединение и повтори запуск.'; return; }
      if (id !== run || !sectionOpen()) return;
      activeNomination = n; activeSnapshot = null; phase = 'intro';
      originalFocus = document.activeElement; previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
      makeStage(n); action('next-nomination').disabled = category.selectedIndex >= category.options.length - 1; dialog.showModal(); action('close').focus({ preventScroll: true });
      action('skip').disabled = false; action('skip').textContent = 'К участникам →'; message(model.titleOf(n));
      if(coupleData){
        coupleIntro=true;action('sound').hidden=false;action('skip').textContent='Пропустить объявление →';message('Объявление номинации «Пара года»');
        const coupleLead=audios.get('couple')?.lead || 'audio/slay-2026/MP3/14_%D0%9F%D0%B0%D1%80%D0%B0%20%D0%B3%D0%BE%D0%B4%D0%B0/00_%D0%9F%D0%BE%D0%B4%D0%B2%D0%BE%D0%B4%D0%BA%D0%B0.mp3';
        await playAudio(coupleLead,id,{trimEnd:3,onResume:()=>introSpeaking(true),onPause:()=>introSpeaking(false)});
        if(id!==run||!dialog.open||!sectionOpen())return;
        coupleIntro=false;introSpeaking(false);
        phase='couple-film';action('sound').hidden=true;action('film-pause').hidden=false;action('film-pause').textContent='Пауза';action('skip').textContent='Следующий матч →';
        const onChampion = name => {
          const person = { identity: name, hidden: false };
          if (id !== run || !model.winnerMusicFor(person, 'couple')) return;
          action('sound').hidden = false;
          playWinnerMusic(person, id, 'couple');
        };
        coupleFilm=window.SlayCoupleFilm.create({host:dialog.querySelector('.award-stage-host'),...coupleData,onMessage:message,onChampion,onEnd:()=>{if(id===run){action('skip').disabled=true;action('film-pause').hidden=true;message(coupleData.mode==='test'?'Репетиция завершена · тестовые голоса':'Показ завершён');}}});
        coupleFilm.play();return;
      }
      const lead = audios.get(n.id)?.lead;
      if (lead) {
        const result = await playAudio(lead, id, { trimEnd: 3, onResume: () => introSpeaking(true), onPause: () => introSpeaking(false) });
        if (id !== run || phase !== 'intro') return;
        introSpeaking(false);
        if (result === 'unavailable') message('Озвучка недоступна — продолжаем показ');
      } else { message('Озвучка подводки пока отсутствует'); introSpeaking(true); await new Promise(resolve => { phaseFinish = resolve; phaseTimer = setTimeout(() => { phaseFinish = null; resolve(); }, 3500); }); }
      if (id === run && phase === 'intro') await revealRow(id);
    } catch(error) { if(id===run){close();status.textContent=error.message||'Не удалось запустить презентацию.';} }
    finally { if (id === run) isOpening = false; }
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
      const card = el('article', 'award-live-contender');
      card.style.opacity = '0'; card.setAttribute('aria-hidden', 'true');
      card.append(el('span', 'award-live-place', snapshot.hasRanking && person.rank !== null ? String(person.rank).padStart(2, '0') : '—'), portrait(person, activeNomination), el('strong', '', person.name), el('small', '', person.hidden ? 'ВАЙПЕР ШМАЙПЕР' : person.total === 0 ? 'Пока без голосов' : `${person.total} ${snapshot.unit}${person.tied ? ' · равенство' : ''}`)); row.append(card);
    });
    viewport.append(row); scene.append(viewport);
    message(snapshot.hasRanking ? rankedRow ? 'Непризовые места · от последнего к четвёртому' : 'Непризовые участники · включая тех, кто пока без голосов' : 'Голосов пока нет · победители не определены');
    action('skip').textContent = 'К пьедесталу →'; action('skip').disabled = false;
    announceRow(id, people, row, viewport);
  }
  function pauseFor(ms) {
    return new Promise(resolve => { phaseFinish = resolve; phaseTimer = setTimeout(() => { phaseFinish = null; resolve(); }, ms); });
  }
  async function announceRow(id, people, row, viewport) {
    let pan = 0;
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
      let entrance;
      const highlight = () => {
        if (card.classList.contains('is-announced')) return;
        card.style.opacity = '1'; card.setAttribute('aria-hidden', 'false'); card.title = person.name;
        card.classList.add('is-announced', 'is-speaking'); message('Сейчас: ' + person.name);
        entrance = animate(card, [{ opacity: 0, transform: 'translateY(55px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 1900 });
      };
      const url = person.identity && audios.get(activeNomination.id)?.names.get(person.identity);
      const result = await playAudio(url, id, {
        onStart: highlight,
        onPause: () => { card.classList.add('is-voice-paused'); if (entrance?.playState === 'running') entrance.pause(); },
        onResume: () => { card.classList.remove('is-voice-paused'); if (entrance?.playState === 'paused') entrance.play(); }
      });
      if (id !== run || phase !== 'row') return;
      if (result === 'unavailable') { highlight(); if (entrance?.playState === 'paused') entrance.play(); await pauseFor(2400); }
      if (entrance?.playState === 'paused') entrance.play();
      card.classList.remove('is-speaking', 'is-voice-paused');
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
        if (card.classList.contains('is-announced')) return;
        card.style.opacity = '1'; card.setAttribute('aria-hidden', 'false'); card.classList.add('is-announced', 'is-speaking');
        message(person.rank + ' место · ' + person.name);
        entrance = animate(card, [{ opacity: 0, transform: 'translateY(90px) scale(.97)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { duration: 2400 });
        if (person.rank === 1) { celebrateWinner(); playWinnerMusic(person, id, activeNomination.id); }
      };
      const url = person.identity && audios.get(activeNomination.id)?.names.get(person.identity);
      const result = await playAudio(url, id, {
        onStart: reveal,
        onPause: () => { card.classList.add('is-voice-paused'); if (entrance?.playState === 'running') entrance.pause(); },
        onResume: () => { card.classList.remove('is-voice-paused'); if (entrance?.playState === 'paused') entrance.play(); }
      });
      if (id !== run || phase !== 'podium') return;
      if (result === 'unavailable') { if (!card.classList.contains('is-announced')) reveal(); if (entrance?.playState === 'paused') entrance.play(); await pauseFor(2400); }
      if (entrance?.playState === 'paused') entrance.play();
      card.classList.remove('is-speaking', 'is-voice-paused');
    }
  }
  dialog.addEventListener('click', async event => {
    const name = event.target.closest('[data-action]')?.dataset.action;
    if (name === 'close') close();
    if (phase.startsWith('entrance')) {
      if(name==='replay'){startEntrance();return;}
      if(name==='next-nomination'){close();return;}
      if(name==='skip'){if(phase==='entrance')showEntrance(entranceIndex+1);return;}
    }
    if (name === 'replay') { close(); start(); }
    if (name === 'next-nomination' && category.selectedIndex < category.options.length - 1) { close(); category.selectedIndex++; renderCards(); start(); }
    if (name === 'film-pause' && coupleFilm) action('film-pause').textContent=coupleFilm.pause()?'Продолжить':'Пауза';
    if (name === 'skip') { if(coupleIntro)audioFinish?.('skipped');else if(coupleFilm)coupleFilm.next(); else if (movie) videoFinish?.('skipped'); else if (phase === 'intro') revealRow(run); else if (phase === 'row') showPodium(run); }
    if (name === 'sound') { muted = !muted; if (sound) sound.muted = muted; if (movie) movie.muted = muted; if (winnerMusic) winnerMusic.muted = muted; action('sound').textContent = muted ? 'Звук выключен' : 'Звук включён'; }
    if (name === 'music' && winnerMusic) { try { await winnerMusic.play(); } catch { message('Музыка не запускается. Показ продолжается.'); } }
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







