// Progressive motion: content remains readable when JavaScript or animation is unavailable.
(() => {
  'use strict';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 768px)');
  if (!('IntersectionObserver' in window) || !Element.prototype.animate) return;

  const selector = '.section-heading, .category-card, .featured-card, .team-card, ' +
    '.history-title, .history-card, .participant-card, .current-choices, .vote-notice, ' +
    '.profile-header, .section-card, .admin-menu-card';
  const registered = new WeakSet();
  const running = new Set();
  let observer;
  let frame = 0;
  let position = 0;
  const hero = document.querySelector('.hero');
  const home = document.getElementById('page-home');
  const ticker = document.querySelector('.ticker');
  const track = document.createElement('div');
  track.className = 'ticker-track';
  while (ticker.firstChild) track.append(ticker.firstChild);
  ticker.append(track);

  function play(element, keyframes, options) {
    if (reducedMotion.matches) return;
    const animation = element.animate(keyframes, options);
    running.add(animation);
    const cleanup = () => running.delete(animation);
    animation.onfinish = cleanup;
    animation.oncancel = cleanup;
  }

  function reveal(entries) {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const element = entry.target;
      observer.unobserve(element);
      // Never conceal a control that already has keyboard focus.
      if (reducedMotion.matches || element.contains(document.activeElement)) continue;
      const siblings = [...element.parentElement.children];
      const delay = Math.min(siblings.indexOf(element) % (desktop.matches ? 3 : 2), 2) * 65;
      play(element, [
        { opacity: 0, translate: '0 26px' },
        { opacity: 1, translate: '0 0' }
      ], { duration: 640, delay, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
      const art = element.querySelector('.category-art');
      if (art) {
        const resting = getComputedStyle(art).transform;
        play(art, [
          { transform: 'translateY(15px) rotate(-12deg) scale(.88)' },
          { transform: resting === 'none' ? 'rotate(0deg)' : resting }
        ], { duration: 850, delay: delay + 50, easing: 'cubic-bezier(.16,1,.3,1)' });
      }
    }
  }

  function register(root) {
    if (reducedMotion.matches || !observer) return;
    const elements = root.matches?.(selector) ? [root] : [];
    elements.push(...root.querySelectorAll(selector));
    for (const element of elements) {
      if (registered.has(element)) continue;
      registered.add(element);
      observer.observe(element);
    }
  }

  function movePaper() {
    frame = 0;
    if (reducedMotion.matches || !desktop.matches || document.hidden) return;
    const visibleHome = !home.classList.contains('hidden');
    const target = visibleHome ? Math.min(window.scrollY, hero.offsetHeight + 100) : 0;
    position += (target - position) * .16;
    hero.style.setProperty('--paper-shift', `${(position * .045).toFixed(2)}px`);
    hero.style.setProperty('--year-shift', `${(position * .09).toFixed(2)}px`);
    track.style.translate = `${(-position * .065).toFixed(2)}px 0`;
    if (Math.abs(target - position) > .2) frame = requestAnimationFrame(movePaper);
  }

  function schedule() {
    if (!frame && !reducedMotion.matches && desktop.matches && !document.hidden) {
      frame = requestAnimationFrame(movePaper);
    }
  }

  function resetParallax() {
    cancelAnimationFrame(frame);
    frame = 0;
    position = 0;
    hero.style.removeProperty('--paper-shift');
    hero.style.removeProperty('--year-shift');
    track.style.removeProperty('translate');
  }

  function configure() {
    observer?.disconnect();
    running.forEach(animation => animation.cancel());
    resetParallax();
    if (reducedMotion.matches) return;
    observer = new IntersectionObserver(reveal, { threshold: .08 });
    // Re-observe on a live system-preference change, including previously registered nodes.
    document.querySelectorAll(selector).forEach(element => {
      registered.add(element);
      observer.observe(element);
    });
    schedule();
  }

  const mutations = new MutationObserver(records => {
    for (const record of records) {
      record.removedNodes.forEach(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        observer?.unobserve(node);
        node.querySelectorAll(selector).forEach(element => observer?.unobserve(element));
      });
      record.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) register(node);
      });
    }
    schedule();
  });
  document.querySelectorAll('[id^="page-"]').forEach(page => {
    mutations.observe(page, { childList: true, subtree: true });
  });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  reducedMotion.addEventListener('change', configure);
  desktop.addEventListener('change', () => { resetParallax(); schedule(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else schedule();
  });
  document.addEventListener('focusin', () => {
    running.forEach(animation => {
      if (animation.effect?.target?.contains(document.activeElement)) animation.finish();
    });
  });
  configure();
})();
