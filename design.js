// Editorial presentation only. Authentication and vote persistence stay in supabase-app.js.
(() => {
  'use strict';
  const people = new Map();
  window.NOMINATIONS.forEach(n => n.participants.forEach(p => {
    if (p && p.name && p.photo) people.set(p.name, p.photo);
  }));
  const team = document.getElementById('team-grid');
  people.forEach((photo, name) => {
    const card = document.createElement('article');
    card.className = 'team-card';
    const frame = document.createElement('div');
    frame.className = 'team-image';
    const img = document.createElement('img');
    img.src = photo; img.alt = name; img.loading = 'lazy'; img.width = 1024; img.height = 1536;
    frame.append(img);
    const heading = document.createElement('h3');
    heading.textContent = name;
    const label = document.createElement('small');
    label.textContent = 'Участник / 2026';
    card.append(frame, heading, label); team.append(card);
  });
  window.showTeam = async () => {
    await window.showPage('home');
    document.getElementById('team').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
  };

  const renderVote = window.renderVotePage;
  window.renderVotePage = function() {
    renderVote();
    document.querySelector('.vote-notice')?.remove();
    const user = window.DB.getCurrentUser();
    if (user?.status === 'approved' || user?.role === 'admin') return;
    const notice = document.createElement('div');
    notice.className = 'vote-notice';
    const message = document.createElement('span');
    message.textContent = !user ? 'Выбирай своих. Войди в аккаунт, чтобы сохранить голос.' : user.status === 'pending' ? 'Твой аккаунт ожидает подтверждения. После одобрения ты сможешь голосовать.' : 'Голосование недоступно: аккаунт заблокирован.';
    notice.append(message);
    if (!user) {
      const button = document.createElement('button');
      button.textContent = 'Войти ↗';
      button.onclick = () => window.openModal('login');
      notice.append(button);
    }
    document.querySelector('.current-choices').before(notice);
  };

  let returnFocus;
  const open = window.openModal;
  const close = window.closeModal;
  window.openModal = type => {
    if (!document.querySelector('.modal-overlay.active')) returnFocus = document.activeElement;
    open(type);
    document.getElementById('modal-' + type).querySelector('input, button')?.focus();
  };
  window.closeModal = () => { close(); returnFocus?.focus(); };
  document.querySelectorAll('.modal').forEach(modal => {
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
    const heading = modal.querySelector('h2');
    heading.id = modal.parentElement.id + '-heading';
    modal.setAttribute('aria-labelledby', heading.id);
    modal.querySelector('.modal-close').setAttribute('aria-label', 'Закрыть');
  });
  document.querySelectorAll('.form-group').forEach(group => {
    const input = group.querySelector('input');
    if (input) group.querySelector('label')?.setAttribute('for', input.id);
  });
  document.querySelectorAll('.switch-form a').forEach(link => {
    link.setAttribute('role', 'button'); link.tabIndex = 0;
    link.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); link.click(); }
    });
  });
  document.addEventListener('keydown', e => {
    const modal = document.querySelector('.modal-overlay.active');
    if (!modal) return;
    if (e.key === 'Escape') { window.closeModal(); return; }
    if (e.key !== 'Tab') return;
    const focusable = [...modal.querySelectorAll('button, input, a[tabindex]')].filter(el => !el.disabled);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
})();
