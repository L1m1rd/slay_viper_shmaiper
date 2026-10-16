(function (root) {
  'use strict';
  const stages = { 3: '02-third', 2: '03-second', 1: '04-first' };
  function ranks(id) {
    if (['situation', 'tiktok', 'bodybuilder'].includes(id)) return [];
    return ['incel', '2008'].includes(id) ? [1] : [3, 2, 1];
  }
  function resolve(nomination, rank, rows, reveal) {
    const unknown = { name: 'Имя пока скрыто', photo: 'images/unknown-participant.png', known: false, tied: false };
    if (!reveal) return unknown;
    // The backend already applies the official score and alphabetical tie-break.
    const result = rows[rank - 1];
    if (!result || !(result.total > 0)) return { ...unknown, name: 'Пока нет результата' };
    const participant = nomination.participants.find(p => (typeof p === 'string' ? p : p.name || p.title) === result.name);
    if (!participant) return { ...unknown, name: 'Участник не найден в каталоге' };
    return {
      name: result.name,
      photo: participant.photo || unknown.photo,
      known: Boolean(participant.photo),
      tied: rows.some((row, index) => index !== rank - 1 && row.total === result.total),
      total: result.total
    };
  }
  const api = { ranks, resolve, background: (id, rank) => `images/presentation/${id}-${stages[rank]}.png` };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SlayPresentationModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
