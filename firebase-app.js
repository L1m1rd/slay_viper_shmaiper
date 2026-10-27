(() => {
  'use strict';

  const app = window.firebase.initializeApp(window.SLAY_BACKEND.firebase);
  const auth = app.auth();
  const firestore = app.firestore();
  auth.languageCode = 'ru';
  const authReady = new Promise(resolve => {
    const stop = auth.onAuthStateChanged(() => { stop(); resolve(); });
  });

  function voteRows(snapshot) {
    return snapshot.docs.flatMap(doc => {
      const vote = doc.data();
      return vote.choices.flatMap((participant, index) => participant == null ? [] : [{
        user_id: vote.user_id, nomination_id: vote.nomination_id,
        participant, place: vote.nomination_id === 'couple' ? null : index + 1
      }]);
    });
  }

  const state = {
    currentUser: null,
    adminUsers: [],
    adminVotes: []
  };

  function cleanupLegacyStorage() {
    localStorage.removeItem('slay_users_db');
    localStorage.removeItem('slay_current_user');
  }

  function getCurrentUser() {
    return state.currentUser;
  }

  function toAppUser(profile, votes) {
    return {
      id: profile.id,
      name: profile.display_name,
      username: profile.username,
      role: profile.role,
      status: profile.status,
      votes: votes || {},
      registered: profile.created_at
    };
  }

  function rowsToVotes(rows) {
    const votes = {};

    (rows || []).forEach((row) => {
      const nomination = window.NOMINATIONS.find((n) => n.id === row.nomination_id);
      const isMultiVote = nomination && nomination.votingType === 'multi-vote';

      if (isMultiVote) {
        if (!Array.isArray(votes[row.nomination_id])) {
          votes[row.nomination_id] = [];
        }

        if (!votes[row.nomination_id].includes(row.participant)) {
          votes[row.nomination_id].push(row.participant);
        }

        return;
      }

      if (!votes[row.nomination_id]) {
        votes[row.nomination_id] = { 1: null, 2: null, 3: null };
      }

      if (row.place >= 1 && row.place <= 3) {
        votes[row.nomination_id][row.place] = row.participant;
      }
    });

    return votes;
  }

  async function loadVotesForUser(userId) {
    const snapshot = await firestore.collection('votes').where('user_id', '==', userId).get({ source: 'server' });
    return rowsToVotes(voteRows(snapshot));
  }

  async function refreshCurrentUser() {
    await authReady;
    const session = auth.currentUser;
    if (!session) {
      state.currentUser = null;
      window.updateUI();
      return null;
    }
    const profile = await firestore.collection('profiles').doc(session.uid).get({ source: 'server' });
    if (!profile.exists) {
      state.currentUser = null;
      window.updateUI();
      return null;
    }
    const votes = await loadVotesForUser(session.uid);
    // Do not apply a response for a session that has been signed out/replaced.
    if (!auth.currentUser || auth.currentUser.uid !== session.uid) return null;
    state.currentUser = toAppUser(profile.data(), votes);
    window.updateUI();
    return state.currentUser;
  }

  function friendlyAuthError(error, fallback) {
    const messages = {
      'auth/invalid-credential': 'Неверный email или пароль',
      'auth/invalid-login-credentials': 'Неверный email или пароль',
      'auth/wrong-password': 'Неверный email или пароль',
      'auth/user-not-found': 'Неверный email или пароль',
      'auth/email-already-in-use': 'Аккаунт с таким email уже существует',
      'auth/invalid-email': 'Проверь правильность email',
      'auth/weak-password': 'Пароль минимум 6 символов',
      'auth/too-many-requests': 'Слишком много попыток. Попробуй позже',
      'auth/network-request-failed': 'Проверь подключение к интернету',
      'username-taken': 'Такой логин уже занят',
      'permission-denied': 'Нет доступа к этой операции'
    };
    return messages[error.code] || fallback;
  }

  async function register() {
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim().toLowerCase();
    const username = document.getElementById('reg-username').value.trim().toLowerCase();
    const password = document.getElementById('reg-password').value;
    if (!name || !email || !username || !password) return window.toast('Заполни все поля!');
    if (name.length > 50) return window.toast('Имя — максимум 50 символов');
    if (!/^[a-z0-9_]{3,30}$/.test(username)) return window.toast('Логин: 3–30 символов, только a-z, 0-9 и _');
    if (password.length < 6) return window.toast('Пароль минимум 6 символов');
    let account;
    let createdHere = false;
    let committed = false;
    try {
      try {
        account = (await auth.createUserWithEmailAndPassword(email, password)).user;
        createdHere = true;
      } catch (error) {
        if (error.code !== 'auth/email-already-in-use') throw error;
        // Recover an interrupted registration, without altering an existing profile.
        account = (await auth.signInWithEmailAndPassword(email, password)).user;
        if ((await firestore.collection('profiles').doc(account.uid).get({ source: 'server' })).exists) {
          throw Object.assign(new Error(), { code: 'auth/email-already-in-use' });
        }
      }
      await firestore.runTransaction(async transaction => {
        const handle = firestore.collection('usernames').doc(username);
        if ((await transaction.get(handle)).exists) throw Object.assign(new Error(), { code: 'username-taken' });
        transaction.set(handle, { uid: account.uid });
        transaction.set(firestore.collection('profiles').doc(account.uid), {
          id: account.uid, username, display_name: name, role: 'user', status: 'pending', created_at: new Date().toISOString()
        });
      });
      committed = true;
      window.closeModal();
      await refreshCurrentUser();
      await window.showPage('profile');
      try {
        await account.sendEmailVerification();
        window.toast('Аккаунт создан. Подтверди email из письма и дождись одобрения администратором.');
      } catch (error) {
        window.toast('Аккаунт создан. Письмо не отправлено — повтори отправку в профиле.');
      }
    } catch (error) {
      // Delete only the newly created Auth account, never an existing account.
      // A network error may arrive after a successful commit. Keep the account
      // in that case: registration can be resumed with the same email/password.
      if (account && createdHere && !committed && ['username-taken', 'permission-denied'].includes(error.code)) {
        try { await account.delete(); } catch (cleanupError) { console.error('Account cleanup failed', cleanupError.code); }
      }
      window.toast(friendlyAuthError(error, 'Не удалось создать аккаунт. Попробуй позже.'));
    }
  }

  async function login() {
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;
    if (!email || !password) return window.toast('Введи email и пароль');
    try {
      await auth.signInWithEmailAndPassword(email, password);
      const user = await refreshCurrentUser();
      if (!user) {
        await auth.signOut();
        return window.toast('Профиль не найден. Обратись к администратору.');
      }
      window.closeModal();
      if (user.status !== 'approved' || !auth.currentUser.emailVerified) {
        await window.showPage('profile');
        return window.toast(user.status === 'banned' ? 'Твой аккаунт заблокирован' :
          !auth.currentUser.emailVerified ? 'Подтверди email по ссылке из письма' : 'Аккаунт ожидает одобрения администратором');
      }
      window.toast('С возвращением, ' + user.name + '!');
    } catch (error) {
      window.toast(friendlyAuthError(error, 'Не удалось войти. Попробуй позже.'));
    }
  }

  async function logout() {
    try {
      await auth.signOut();
      state.currentUser = null;
      state.adminUsers = [];
      state.adminVotes = [];
      window.updateUI();
      await window.showPage('home');
      window.toast('До встречи!');
    } catch (error) { window.toast('Не удалось выйти. Попробуй ещё раз.'); }
  }

  async function ensureFreshVotingUser() {
    if (window.SlayQualification && !window.SlayQualification.mainVotingAllowed()) {
      window.toast('Сейчас открыт только отбор пар. Основное голосование начнётся позже.');
      return null;
    }
    if (auth.currentUser) {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
    }
    const user = await refreshCurrentUser();

    if (!user) {
      window.openModal('login');
      window.toast('Сначала войди в аккаунт');
      return null;
    }

    if (!auth.currentUser.emailVerified) {
      window.toast('Сначала подтверди email по ссылке из письма');
      return null;
    }

    if (user.role === 'admin') {
      window.toast('Администраторы не участвуют в голосовании');
      return null;
    }

    if (user.status !== 'approved') {
      window.toast(
        user.status === 'banned'
          ? 'Твой аккаунт заблокирован'
          : 'Твой аккаунт должен быть одобрен админом'
      );
      return null;
    }

    return user;
  }

  async function replaceNominationVotes(user, nominationId, voteValue) {
    const nomination = window.NOMINATIONS.find((n) => n.id === nominationId);

    if (!nomination) {
      throw new Error('Номинация не найдена');
    }

    const isMultiVote = nomination.votingType === 'multi-vote';
    const rows = [];

    if (isMultiVote) {
      const values = Array.isArray(voteValue)
        ? voteValue.slice(0, window.COUPLE_VOTES_LIMIT)
        : [];

      values.forEach((participant) => {
        rows.push({
          user_id: user.id,
          nomination_id: nominationId,
          participant: window.getParticipantName(participant),
          place: null
        });
      });
    } else {
      [1, 2, 3].forEach((place) => {
        if (voteValue && voteValue[place]) {
          rows.push({
            user_id: user.id,
            nomination_id: nominationId,
            participant: window.getParticipantName(voteValue[place]),
            place: place
          });
        }
      });
    }

    const choices = [null, null, null];
    rows.forEach((row, index) => { choices[isMultiVote ? index : row.place - 1] = row.participant; });
    // One document per user/nomination: replace all three choices atomically.
    await firestore.collection('votes').doc(user.id + '_' + nominationId).set({
      user_id: user.id, nomination_id: nominationId, choices,
      updated_at: window.firebase.firestore.FieldValue.serverTimestamp()
    });

    if (isMultiVote) {
      user.votes[nominationId] = rows.map((row) => row.participant);
    } else {
      user.votes[nominationId] = { 1: null, 2: null, 3: null };
      rows.forEach((row) => {
        user.votes[nominationId][row.place] = row.participant;
      });
    }

    state.currentUser = user;
  }

  async function toggleVoteForCouple(participantName) {
    const user = await ensureFreshVotingUser();

    if (!user || !window.currentCategory) {
      return;
    }

    if (!user.votes) {
      user.votes = {};
    }

    const votes = Array.isArray(user.votes[window.currentCategory.id])
      ? user.votes[window.currentCategory.id].slice()
      : [];

    const normalizedName = window.getParticipantName(participantName);
    const index = votes.indexOf(normalizedName);

    if (index !== -1) {
      votes.splice(index, 1);
    } else {
      if (votes.length >= window.COUPLE_VOTES_LIMIT) {
        window.toast('❌ Можно отдать максимум ' + window.COUPLE_VOTES_LIMIT + ' голоса');
        return;
      }

      votes.push(normalizedName);
    }

    try {
      await replaceNominationVotes(user, window.currentCategory.id, votes);
      window.toast(index !== -1 ? '✅ Голос убран' : '✅ Голос отдан');
      window.renderVotePage();
      window.renderProfile();
    } catch (error) {
      console.error(error);
      window.toast('❌ Не удалось сохранить голос');
      await refreshCurrentUser();
      window.renderVotePage();
    }
  }

  async function setPlace(place, participantName) {
    const user = await ensureFreshVotingUser();

    if (!user || !window.currentCategory) {
      return;
    }

    if (!user.votes) {
      user.votes = {};
    }

    const existing = user.votes[window.currentCategory.id];
    const vote = {
      1: existing && existing[1] ? existing[1] : null,
      2: existing && existing[2] ? existing[2] : null,
      3: existing && existing[3] ? existing[3] : null
    };

    const normalizedName = window.getParticipantName(participantName);

    if (vote[place] === normalizedName) {
      vote[place] = null;
    } else {
      [1, 2, 3].forEach((p) => {
        if (vote[p] === normalizedName) {
          vote[p] = null;
        }
      });

      vote[place] = normalizedName;
    }

    try {
      await replaceNominationVotes(user, window.currentCategory.id, vote);
      window.renderVotePage();
      window.renderProfile();
      window.toast('✅ Голос сохранён');
    } catch (error) {
      console.error(error);
      window.toast('❌ Не удалось сохранить голос');
      await refreshCurrentUser();
      window.renderVotePage();
    }
  }

  async function resetVotes() {
    const user = await ensureFreshVotingUser();

    if (!user || !window.currentCategory) {
      return;
    }

    if (!confirm('Сбросить все голоса в этой номинации?')) {
      return;
    }

    const isMultiVote = window.currentCategory.votingType === 'multi-vote';

    try {
      await replaceNominationVotes(
        user,
        window.currentCategory.id,
        isMultiVote ? [] : { 1: null, 2: null, 3: null }
      );

      window.renderVotePage();
      window.renderProfile();
      window.toast('🔄 Голоса сброшены');
    } catch (error) {
      console.error(error);
      window.toast('❌ Не удалось сбросить голоса');
    }
  }

  function getNominationResults(nomId) {
    const nomination = window.NOMINATIONS.find((n) => n.id === nomId);
    const isMultiVote = nomination && nomination.votingType === 'multi-vote';

    const approvedUserIds = new Set(
      state.adminUsers
        .filter((u) => u.role !== 'admin' && u.status === 'approved')
        .map((u) => u.id)
    );

    const rows = state.adminVotes.filter(
      (row) => row.nomination_id === nomId && approvedUserIds.has(row.user_id)
    );

    if (isMultiVote) {
      const voteCount = {};

      rows.forEach((row) => {
        voteCount[row.participant] = (voteCount[row.participant] || 0) + 1;
      });

      return Object.entries(voteCount)
        .map(([name, count]) => ({
          name: name,
          total: count,
          votes: count
        }))
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ru'));
    }

    const scores = {};

    rows.forEach((row) => {
      if (!row.place || row.place < 1 || row.place > 3) {
        return;
      }

      if (!scores[row.participant]) {
        scores[row.participant] = {
          1: 0,
          2: 0,
          3: 0,
          total: 0
        };
      }

      scores[row.participant][row.place] += 1;
      scores[row.participant].total += 4 - row.place;
    });

    return Object.entries(scores)
      .map(([name, score]) => Object.assign({ name: name }, score))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ru'));
  }

  async function updateProfile() {
    const user = getCurrentUser();

    if (!user) {
      return;
    }

    const newName = document.getElementById('prof-display-name').value.trim();

    if (!newName) {
      window.toast('Имя не может быть пустым');
      return;
    }

    if (newName.length > 50) {
      window.toast('Имя — максимум 50 символов');
      return;
    }

    try {
      await firestore.collection('profiles').doc(user.id).update({ display_name: newName });
    } catch (error) {
      window.toast('Ошибка при сохранении профиля');
      return;
    }

    user.name = newName;
    state.currentUser = user;
    window.renderProfile();
    window.updateUI();
    window.toast('✅ Профиль обновлён!');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function openAdminSection(section) {
    const menu = document.getElementById('admin-menu');
    const users = document.getElementById('admin-section-users');
    const results = document.getElementById('admin-section-results');
    const presentation = document.getElementById('admin-section-presentation');

    if (!menu || !users || !results || !presentation) return;

    menu.classList.add('hidden');
    users.classList.add('hidden');
    results.classList.add('hidden');
    presentation.classList.add('hidden');

    if (section === 'users') users.classList.remove('hidden');
    else if (section === 'results') results.classList.remove('hidden');
    else if (section === 'presentation') presentation.classList.remove('hidden');
    else menu.classList.remove('hidden');

    window.scrollTo(0, 0);
  }

  async function renderAdmin() {
    const user = getCurrentUser();

    if (!user || user.role !== 'admin') {
      return;
    }

    try {
      window.SLAY_RESULTS_UPDATED_AT = 0;
      const [profiles, votes] = await Promise.all([
        firestore.collection('profiles').orderBy('created_at').get({ source: 'server' }),
        firestore.collection('votes').get({ source: 'server' })
      ]);
      state.adminUsers = profiles.docs.map(doc => doc.data());
      state.adminVotes = voteRows(votes);
    } catch (error) {
      window.toast('Не удалось загрузить админ-панель');
      return;
    }

    const users = state.adminUsers.filter((u) => u.role !== 'admin');

    document.getElementById('adm-users').textContent = users.length;
    document.getElementById('adm-approved').textContent =
      users.filter((u) => u.status === 'approved').length;
    document.getElementById('adm-pending').textContent =
      users.filter((u) => u.status === 'pending').length;
    document.getElementById('adm-banned').textContent =
      users.filter((u) => u.status === 'banned').length;

    const approvedIds = new Set(
      users.filter((u) => u.status === 'approved').map((u) => u.id)
    );

    const resultsHtml = window.NOMINATIONS.map((nom) => {
      const nominationResults = getNominationResults(nom.id);
      const isMultiVote = nom.votingType === 'multi-vote';

      const totalVoters = new Set(
        state.adminVotes
          .filter(
            (v) =>
              v.nomination_id === nom.id &&
              approvedIds.has(v.user_id)
          )
          .map((v) => v.user_id)
      );

      const rows = nominationResults
        .slice(0, 10)
        .map((r, i) => {
          const rank = i + 1;
          const medal =
            rank === 1
              ? '🥇'
              : rank === 2
                ? '🥈'
                : rank === 3
                  ? '🥉'
                  : '#' + rank;

          if (isMultiVote) {
            return (
              '<div class="result-row">' +
                '<div class="result-rank">' + medal + '</div>' +
                '<div class="result-name">' + escapeHtml(r.name) + '</div>' +
                '<div class="result-stats"><span>💕 ' +
                  r.votes +
                  ' ' +
                  (r.votes === 1 ? 'голос' : r.votes < 5 ? 'голоса' : 'голосов') +
                '</span></div>' +
                '<div class="result-score">' + r.total + '</div>' +
              '</div>'
            );
          }

          return (
            '<div class="result-row">' +
              '<div class="result-rank">' + medal + '</div>' +
              '<div class="result-name">' + escapeHtml(r.name) + '</div>' +
              '<div class="result-stats">' +
                '<span>🥇 ' + r[1] + '</span>' +
                '<span>🥈 ' + r[2] + '</span>' +
                '<span>🥉 ' + r[3] + '</span>' +
              '</div>' +
              '<div class="result-score">' + r.total + ' б.</div>' +
            '</div>'
          );
        })
        .join('');

      return (
        '<div class="result-nom">' +
          '<h4>' +
            (nom.icon || '🏆') +
            ' ' +
            nom.title +
            ' <span style="color:var(--text-dim); font-size:13px; font-weight:400;">' +
              '(проголосовало: ' +
              totalVoters.size +
              ')' +
            '</span>' +
          '</h4>' +
          (rows ||
            '<div style="color:var(--text-dim); padding:10px;">Пока нет голосов</div>') +
        '</div>'
      );
    }).join('');

    document.getElementById('admin-results').innerHTML = resultsHtml;
    window.SLAY_RESULTS_UPDATED_AT = Date.now();
    window.dispatchEvent(new Event('slay:results-updated'));

    const tbody = document.getElementById('admin-users');

    tbody.innerHTML =
      users
        .map((u) => {
          let statusBadge = '';

          if (u.status === 'approved') {
            statusBadge =
              '<span class="badge badge-approved">✅ Одобрен</span>';
          } else if (u.status === 'pending') {
            statusBadge =
              '<span class="badge badge-pending">⏳ Ожидает</span>';
          } else {
            statusBadge =
              '<span class="badge badge-banned">🚫 Забанен</span>';
          }

          let actions = '';

          if (u.status === 'pending') {
            actions =
              '<button class="action-btn btn-approve" onclick="approveUser(\'' +
              u.username +
              '\')">Одобрить</button>';
          } else if (u.status === 'approved') {
            actions =
              '<button class="action-btn btn-ban" onclick="banUser(\'' +
              u.username +
              '\')">Забанить</button>';
          } else {
            actions =
              '<button class="action-btn btn-approve" onclick="approveUser(\'' +
              u.username +
              '\')">Разбанить</button>';
          }

          return (
            '<tr>' +
              '<td><strong>' + escapeHtml(u.display_name) + '</strong></td>' +
              '<td>' + escapeHtml(u.username) + '</td>' +
              '<td><span class="badge badge-user">user</span></td>' +
              '<td>' + statusBadge + '</td>' +
              '<td>' + actions + '</td>' +
            '</tr>'
          );
        })
        .join('') ||
      '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-dim);">Нет пользователей</td></tr>';
  }

  async function approveUser(username) {
    const user = getCurrentUser();
    if (!user || user.role !== 'admin') return window.toast('Доступ запрещён');
    
    const target = state.adminUsers.find(profile => profile.username === username && profile.role !== 'admin');
    if (!target) return window.toast('Пользователь не найден');
    try {
      await firestore.collection('profiles').doc(target.id).update({ status: 'approved' });
      await renderAdmin();
      window.toast('Пользователь одобрен');
    } catch (error) { window.toast('Не удалось изменить статус'); }
  }

  async function banUser(username) {
    const user = getCurrentUser();
    if (!user || user.role !== 'admin') return window.toast('Доступ запрещён');
    if (!confirm("Заблокировать пользователя?")) return;
    const target = state.adminUsers.find(profile => profile.username === username && profile.role !== 'admin');
    if (!target) return window.toast('Пользователь не найден');
    try {
      await firestore.collection('profiles').doc(target.id).update({ status: 'banned' });
      await renderAdmin();
      window.toast('Пользователь заблокирован');
    } catch (error) { window.toast('Не удалось изменить статус'); }
  }

  function updateUI() {
    const user = getCurrentUser();

    document.getElementById('loginBtn').classList.toggle('hidden', !!user);
    document.getElementById('logoutBtn').classList.toggle('hidden', !user);
    document.getElementById('profileBtn').classList.toggle('hidden', !user);

    const adminBtn = document.getElementById('adminBtn');

    if (user && user.role === 'admin') {
      adminBtn.classList.remove('hidden');
    } else {
      adminBtn.classList.add('hidden');
    }
    window.SlayQualification?.sync();
  }

  async function showPage(page) {
    if (window.SlayQualification?.interceptPage(page)) return;
    if (page === 'profile' || page === 'admin') {
      await refreshCurrentUser();
    }

    const user = getCurrentUser();
    if (window.SlayQualification?.interceptPage(page)) return;

    if (page === 'profile' && !user) {
      window.openModal('login');
      window.toast('Сначала войди в аккаунт');
      return;
    }

    if (page === 'admin' && (!user || user.role !== 'admin')) {
      window.toast('Доступ запрещён');
      page = 'home';
    }

    ['home', 'categories', 'vote', 'profile', 'admin'].forEach((p) => {
      document.getElementById('page-' + p).classList.add('hidden');
    });

    document.getElementById('page-' + page).classList.remove('hidden');

    if (page === 'profile') {
      window.renderProfile();
    }

    if (page === 'admin') {
      openAdminSection('menu');
      await renderAdmin();
    }

    if (page === 'categories') {
      window.renderCategories();
    }

    window.scrollTo(0, 0);
  }

  async function openCategory(categoryId) {
    if (window.SlayQualification?.restricted()) { window.showPage('qualification'); return; }
    if (getCurrentUser()) {
      await refreshCurrentUser();
    }

    window.currentCategory = window.NOMINATIONS.find(
      (n) => n.id === categoryId
    );

    if (!window.currentCategory) {
      return;
    }

    document.getElementById('vote-title').innerHTML =
      '<span>' + window.nominationTitle(window.currentCategory) + '</span>';
    document.getElementById('vote-desc').textContent =
      window.currentCategory.desc;

    window.renderVotePage();
    await showPage('vote');
  }

  // Keep existing render functions, but route all reads through in-memory state.
  window.DB.getCurrentUser = getCurrentUser;
  window.DB.getUsers = () => state.adminUsers.map((profile) => {
    return toAppUser(profile, rowsToVotes(
      state.adminVotes.filter((vote) => vote.user_id === profile.id)
    ));
  });

  window.DB.getUserByUsername = (username) => {
    return window.DB.getUsers().find(
      (u) => u.username === String(username).toLowerCase()
    );
  };

  window.DB.saveUsers = () => false;
  window.DB.addUser = () => false;
  window.DB.updateUser = () => false;
  window.DB.setCurrentUser = () => {};

  window.register = register;
  window.login = login;
  window.logout = logout;
  window.toggleVoteForCouple = toggleVoteForCouple;
  window.setPlace = setPlace;
  window.resetVotes = resetVotes;
  window.getNominationResults = getNominationResults;
  window.updateProfile = updateProfile;
  window.renderAdmin = renderAdmin;
  window.openAdminSection = openAdminSection;
  window.approveUser = approveUser;
  window.banUser = banUser;
  window.updateUI = updateUI;
  window.showPage = showPage;
  window.openCategory = openCategory;
  let actionPending = false;
  for (const name of ['register', 'login', 'logout', 'toggleVoteForCouple', 'setPlace', 'resetVotes', 'updateProfile', 'approveUser', 'banUser']) {
    const action = window[name];
    window[name] = async (...args) => {
      if (actionPending) return;
      actionPending = true;
      try { return await action(...args); }
      catch (error) { window.toast(friendlyAuthError(error, 'Не удалось выполнить действие. Попробуй ещё раз.')); }
      finally { actionPending = false; }
    };
  }
  window.firebaseApp = app;
  const originalRenderProfile = window.renderProfile;
  window.renderProfile = function () {
    originalRenderProfile();
    const container = document.getElementById('page-profile');
    const old = document.getElementById('email-verification');
    if (old) old.remove();
    if (!auth.currentUser || auth.currentUser.emailVerified) return;
    const notice = document.createElement('div');
    notice.id = 'email-verification';
    notice.className = 'vote-notice';
    notice.textContent = 'Для голосования подтверди email. ';
    const button = document.createElement('button');
    button.className = 'btn btn-primary';
    button.textContent = 'Отправить письмо ещё раз';
    button.onclick = async () => {
      button.disabled = true;
      try { await auth.currentUser.sendEmailVerification(); window.toast('Письмо отправлено'); }
      catch (error) { window.toast(friendlyAuthError(error, 'Не удалось отправить письмо')); }
      finally { button.disabled = false; }
    };
    notice.appendChild(button);
    container.prepend(notice);
  };

  async function initialize() {
    cleanupLegacyStorage();
    await authReady;
    auth.onIdTokenChanged(session => {
      if (!session) {
        state.currentUser = null;
        state.adminUsers = [];
        state.adminVotes = [];
        updateUI();
        return;
      }
      refreshCurrentUser().catch(error => {
        console.error('Firebase initialization failed:', error.code);
        state.currentUser = null;
        updateUI();
      });
    });
  }
  window.SLAY_AUTH_READY = initialize();
})();
