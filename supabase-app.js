(() => {
  'use strict';

  const SUPABASE_URL = 'https://mcnhjrssxrxautjecpxo.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cQ5fx-c53btHP9BdrRNBbw_Mxp4DFuU';
  const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

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
    const result = await supabaseClient
      .from('votes')
      .select('nomination_id, participant, place')
      .eq('user_id', userId);

    if (result.error) {
      throw result.error;
    }

    return rowsToVotes(result.data);
  }

  async function refreshCurrentUser() {
    const authResult = await supabaseClient.auth.getUser();

    if (authResult.error || !authResult.data.user) {
      state.currentUser = null;
      window.updateUI();
      return null;
    }

    const profileResult = await supabaseClient
      .from('profiles')
      .select('id, username, display_name, role, status, created_at')
      .eq('id', authResult.data.user.id)
      .single();

    if (profileResult.error) {
      console.error('Profile load failed:', profileResult.error);
      state.currentUser = null;
      window.updateUI();
      return null;
    }

    let votes = {};

    try {
      votes = await loadVotesForUser(profileResult.data.id);
    } catch (error) {
      console.error('Vote load failed:', error);
    }

    state.currentUser = toAppUser(profileResult.data, votes);
    window.updateUI();
    return state.currentUser;
  }

  function friendlyAuthError(error, fallback) {
    const message = String(error && error.message ? error.message : '').toLowerCase();

    if (message.includes('invalid login credentials')) {
      return '❌ Неверный email или пароль';
    }

    if (message.includes('email not confirmed')) {
      return '📨 Сначала подтверди email по ссылке из письма';
    }

    if (message.includes('user already registered')) {
      return '❌ Аккаунт с таким email уже существует';
    }

    if (message.includes('database error saving new user')) {
      return '❌ Такой логин уже занят или содержит недопустимые символы';
    }

    if (message.includes('password')) {
      return '❌ Пароль не соответствует требованиям';
    }

    if (message.includes('email')) {
      return '❌ Проверь правильность email';
    }

    console.error(error);
    return fallback;
  }

  async function register() {
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim().toLowerCase();
    const username = document.getElementById('reg-username').value.trim().toLowerCase();
    const password = document.getElementById('reg-password').value;

    if (!name || !email || !username || !password) {
      window.toast('Заполни все поля!');
      return;
    }

    if (name.length > 50) {
      window.toast('Имя — максимум 50 символов');
      return;
    }

    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      window.toast('Логин: 3–30 символов, только a-z, 0-9 и _');
      return;
    }

    if (password.length < 6) {
      window.toast('Пароль минимум 6 символов');
      return;
    }

    const result = await supabaseClient.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          username: username,
          display_name: name
        }
      }
    });

    if (result.error) {
      window.toast(friendlyAuthError(result.error, '❌ Не удалось создать аккаунт'));
      return;
    }

    if (
      result.data.user &&
      Array.isArray(result.data.user.identities) &&
      result.data.user.identities.length === 0
    ) {
      window.toast('❌ Аккаунт с таким email уже существует');
      return;
    }

    window.closeModal();

    if (!result.data.session) {
      window.toast('📨 Аккаунт создан. Подтверди email по ссылке из письма.');
      window.showPage('home');
      return;
    }

    await refreshCurrentUser();
    await window.showPage('profile');
    window.toast('✅ Аккаунт создан! Ожидай подтверждения администратором ⏳');
  }

  async function login() {
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
      window.toast('Введи email и пароль');
      return;
    }

    const result = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (result.error) {
      window.toast(friendlyAuthError(result.error, '❌ Не удалось войти'));
      return;
    }

    const user = await refreshCurrentUser();

    if (!user) {
      window.toast('❌ Профиль пользователя не найден');
      await supabaseClient.auth.signOut();
      return;
    }

    window.closeModal();

    if (user.status === 'pending') {
      window.toast('⏳ Твой аккаунт ожидает подтверждения администратором');
      await window.showPage('profile');
      return;
    }

    if (user.status === 'banned') {
      window.toast('🚫 Твой аккаунт заблокирован');
      await window.showPage('profile');
      return;
    }

    window.toast('✅ С возвращением, ' + user.name + '!');
  }

  async function logout() {
    const result = await supabaseClient.auth.signOut();

    if (result.error) {
      console.error(result.error);
      window.toast('❌ Не удалось выйти');
      return;
    }

    state.currentUser = null;
    state.adminUsers = [];
    state.adminVotes = [];
    window.updateUI();
    await window.showPage('home');
    window.toast('👋 До встречи!');
  }

  async function ensureFreshVotingUser() {
    const user = await refreshCurrentUser();

    if (!user) {
      window.openModal('login');
      window.toast('Сначала войди в аккаунт');
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

    const deleteResult = await supabaseClient
      .from('votes')
      .delete()
      .eq('user_id', user.id)
      .eq('nomination_id', nominationId);

    if (deleteResult.error) {
      throw deleteResult.error;
    }

    if (rows.length > 0) {
      const insertResult = await supabaseClient
        .from('votes')
        .insert(rows);

      if (insertResult.error) {
        throw insertResult.error;
      }
    }

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

    const result = await supabaseClient
      .from('profiles')
      .update({ display_name: newName })
      .eq('id', user.id);

    if (result.error) {
      console.error(result.error);
      window.toast('❌ Ошибка при сохранении');
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

  async function renderAdmin() {
    const user = getCurrentUser();

    if (!user || user.role !== 'admin') {
      return;
    }

    const results = await Promise.all([
      supabaseClient
        .from('profiles')
        .select('id, username, display_name, role, status, created_at')
        .order('created_at', { ascending: true }),
      supabaseClient
        .from('votes')
        .select('user_id, nomination_id, participant, place, created_at')
    ]);

    const profilesResult = results[0];
    const votesResult = results[1];

    if (profilesResult.error || votesResult.error) {
      console.error(profilesResult.error || votesResult.error);
      window.toast('❌ Не удалось загрузить данные админ-панели');
      return;
    }

    state.adminUsers = profilesResult.data || [];
    state.adminVotes = votesResult.data || [];

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

    if (!user || user.role !== 'admin') {
      window.toast('Доступ запрещён');
      return;
    }

    const result = await supabaseClient
      .from('profiles')
      .update({ status: 'approved' })
      .eq('username', username)
      .neq('role', 'admin');

    if (result.error) {
      console.error(result.error);
      window.toast('❌ Не удалось изменить статус');
      return;
    }

    await renderAdmin();
    window.toast('✅ Пользователь одобрен');
  }

  async function banUser(username) {
    const user = getCurrentUser();

    if (!user || user.role !== 'admin') {
      window.toast('Доступ запрещён');
      return;
    }

    if (!confirm('Забанить этого пользователя?')) {
      return;
    }

    const result = await supabaseClient
      .from('profiles')
      .update({ status: 'banned' })
      .eq('username', username)
      .neq('role', 'admin');

    if (result.error) {
      console.error(result.error);
      window.toast('❌ Не удалось заблокировать пользователя');
      return;
    }

    await renderAdmin();
    window.toast('🚫 Пользователь забанен');
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
  }

  async function showPage(page) {
    if (page === 'profile' || page === 'admin') {
      await refreshCurrentUser();
    }

    const user = getCurrentUser();

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
      await renderAdmin();
    }

    if (page === 'categories') {
      window.renderCategories();
    }

    window.scrollTo(0, 0);
  }

  async function openCategory(categoryId) {
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
      '<span>' + window.currentCategory.title + '</span>';
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
  window.approveUser = approveUser;
  window.banUser = banUser;
  window.updateUI = updateUI;
  window.showPage = showPage;
  window.openCategory = openCategory;
  window.supabaseClient = supabaseClient;

  async function initialize() {
    cleanupLegacyStorage();

    try {
      await refreshCurrentUser();
    } catch (error) {
      console.error('Supabase initialization failed:', error);
      state.currentUser = null;
      updateUI();
    }

    supabaseClient.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        state.currentUser = null;
        state.adminUsers = [];
        state.adminVotes = [];
        updateUI();
        return;
      }

      if (
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED'
      ) {
        setTimeout(() => {
          refreshCurrentUser().catch((error) => {
            console.error('Auth refresh failed:', error);
          });
        }, 0);
      }
    });
  }

  initialize();
})();
