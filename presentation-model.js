(function (root) {
  'use strict';
  const nameOf = p => typeof p === 'string' ? p : p.name || p.title;
  const titleOf = n => n.title.replace(/^[^\p{L}\p{N}]+/u, '').trim();
  const winnerTracks = new Map([
    ['Андрей Владыко', 'audio/winner-music/andrey.m4a'],
    ['Даниил Постоев', 'audio/winner-music/daniil.m4a?v=20261029'],
    ['Семён Ефремов', 'audio/winner-music/semen.m4a'],
    ['Александр Пеняев', 'audio/winner-music/penyaev.m4a'],
    ['Арсений Юсупов', 'audio/winner-music/arseniy.m4a'],
    ['Александр Шамбасов', 'audio/winner-music/shambasov.m4a'],
    ['Шурик', 'audio/winner-music/shurik.m4a']
  ]);
  const winnerMusicFor = person => person && !person.hidden ? winnerTracks.get(person.identity) || null : null;
  function snapshot(nomination, rows, reveal = true) {
    const scores = new Map((rows || []).map(row => [row.name, Number(row.total) || 0]));
    const seen = new Set();
    const ranked = nomination.participants.filter(p => {
      const name = nameOf(p); if (seen.has(name)) return false;
      seen.add(name); return true;
    }).map(p => ({ name: nameOf(p), photo: p.photo || null,
      video: ['tiktok', 'situation'].includes(nomination.id) && typeof p.video === 'string' && p.video.startsWith('videos/' + nomination.id + '/') && !p.video.includes('..') && !p.video.includes('\\') && p.video.endsWith('.mp4') ? p.video : null,
      total: Math.max(0, scores.get(nameOf(p)) || 0) }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ru'));
    const hasVotes = ranked.some(p => p.total > 0);
    const people = ranked.map((p, i) => ({ ...p, rank: reveal && p.total === 0 ? null : i + 1,
      tied: ranked.some((q, j) => i !== j && q.total === p.total),
      name: reveal ? p.name : 'Участник ' + (i + 1), photo: reveal ? p.photo : null, video: reveal ? p.video : null,
      identity: reveal ? p.name : null, hidden: !reveal }));
    const hasRanking = !reveal || hasVotes;
    return { title: titleOf(nomination), hasVotes, hasRanking, ranked: people,
      nonPrize: hasRanking ? people.filter(p => p.rank === null || p.rank > 3).reverse() : people,
      podium: hasRanking ? people.filter(p => p.rank !== null && p.rank <= 3) : [],
      hasTies: reveal && hasVotes && people.some(p => p.total > 0 && p.tied),
      unit: nomination.votingType === 'multi-vote' ? 'голосов' : 'баллов' };
  }
  function audioMap(manifest, nominations) {
    const files = new Map((manifest.files || []).filter(f => f.format === 'MP3').map(f => [f.id, f.path]));
    const url = id => {
      const path = files.get(id);
      return typeof path === 'string' && path.startsWith('MP3/') && !path.includes('..') && !path.includes('\\')
        ? 'audio/slay-2026/' + path.split('/').map(encodeURIComponent).join('/') : null;
    };
    return new Map(nominations.map((n, index) => {
      const category = (manifest.categories || []).find(c => c.id === n.id);
      return [n.id, { lead: url(String(index + 1).padStart(2, '0') + '_' + n.id),
        names: new Map((category?.nominees || []).map(p => [p.text, url('n_' + p.utterance_id)])) }];
    }));
  }
  const api = { snapshot, audioMap, nameOf, titleOf, winnerMusicFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SlayPresentationModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
