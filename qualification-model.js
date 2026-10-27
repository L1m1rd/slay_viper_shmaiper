(function(root) {
  'use strict';
  const limit = 16;
  const names = [
    'Матвей и Вика', 'Матвей и Соня', 'Матвей и Полина', 'Матвей и Карина', 'Матвей и Алина',
    'Семен и Надя', 'Арсений и Надя', 'Арсений и Арина', 'Тимур и Азалия',
    'Саша Шамбасов и Даша Таурин', 'Саша Шамбасов и Даша Дрочкова', 'Саша Шамбасов и Маша',
    'Данил и Маринка', 'Данил и Женя Данилина', 'Вова и Жена Вадима', 'Андрей и рука',
    'Шурик и серьёзка', 'Шурик и Стеша', 'Шурик и Кира Сорокина',
    'Саня Пеняев и Полина', 'Саня Пеняев и Вика', 'Саня Пеняев и Иванчикова'
  ];
  const candidates = names.map((name, i) => ({ id: 'c' + String(i + 1).padStart(2, '0'), name, position: i + 1 }));
  function validBallot(choices, catalog = candidates) {
    const allowed = new Set(catalog.map(c => c.id));
    return Array.isArray(choices) && choices.length === limit && new Set(choices).size === limit && choices.every(id => allowed.has(id));
  }
  function tally(catalog, ballots) {
    const counts = new Map(catalog.map(c => [c.id, 0]));
    const seen = new Set();
    for (const ballot of ballots) {
      if (!ballot.user_id || seen.has(ballot.user_id) || !validBallot(ballot.choices, catalog)) continue;
      seen.add(ballot.user_id);
      ballot.choices.forEach(id => counts.set(id, counts.get(id) + 1));
    }
    const ranked = catalog.map(c => ({ ...c, votes: counts.get(c.id) })).sort((a,b) => b.votes-a.votes || a.name.localeCompare(b.name,'ru'));
    return { voters: seen.size, ranked, cutoffTie: seen.size > 0 && ranked[15]?.votes === ranked[16]?.votes };
  }
  const api = { limit, candidates, validBallot, tally };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SlayQualificationModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
