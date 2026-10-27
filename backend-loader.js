(() => {
  'use strict';
  function load(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Не удалось загрузить ' + src));
      document.head.appendChild(script);
    });
  }
  window.SLAY_BACKEND_READY = (async () => {
    const config = window.SLAY_BACKEND;
    if (config.provider === 'firebase') {
      if (['apiKey', 'authDomain', 'projectId', 'appId'].some(key => !config.firebase[key])) {
        throw new Error('Не заполнена конфигурация Firebase');
      }
      for (const part of ['app', 'auth', 'firestore']) {
        await load('https://www.gstatic.com/firebasejs/12.4.0/firebase-' + part + '-compat.js');
      }
      await load('firebase-app.js?v=20261014-presentation');
    } else if (config.provider === 'supabase') {
      await load('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
      await load('supabase-app.js?v=20261014-presentation');
    } else {
      throw new Error('Неизвестный провайдер базы');
    }
    await load('design.js');
    await load('motion.js');
    await load('presentation-model.js?v=20261027-winner-music-six');
    await load('presentation.js?v=20261027-winner-music-six');
  })().catch(error => {
    console.error('Backend initialization failed:', error);
    window.toast('Не удалось подключиться. Обнови страницу или попробуй позже.');
  });
})();
