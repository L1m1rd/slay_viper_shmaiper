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
    await load('self-vote.js?v=20261109');
    await load('admin-test.js?v=auto20261108');
    const config = window.SLAY_BACKEND;
    if (config.provider === 'firebase') {
      if (['apiKey', 'authDomain', 'projectId', 'appId'].some(key => !config.firebase[key])) {
        throw new Error('Не заполнена конфигурация Firebase');
      }
      for (const part of ['app', 'auth', 'firestore']) {
        await load('https://www.gstatic.com/firebasejs/12.4.0/firebase-' + part + '-compat.js');
      }
      await load('firebase-app.js?v=playoff20261108');
    } else if (config.provider === 'supabase') {
      await load('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
      await load('supabase-app.js?v=selfvote20261109');
    } else {
      throw new Error('Неизвестный провайдер базы');
    }
    await load('qualification-store.js?v=admin-test20261108');
    await load('qualification.js?v=admin-test20261108');
    await load('design.js');
    await load('motion.js');
    await load('presentation-model.js?v=20261030-voices');
    await load('playoff-model.js?v=20261108');
    await load('couple-film.js?v=speed08-last20261108');
    await load('presentation.js?v=entrance-voice20261109');
    await load('playoff-store.js?v=admin-test20261108');
    await load('playoff.js?v=autosave20261108');
  })().catch(error => {
    console.error('Backend initialization failed:', error);
    window.toast('Не удалось подключиться. Обнови страницу или попробуй позже.');
  });
})();













