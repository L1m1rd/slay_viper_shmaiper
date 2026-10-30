const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = require('../presentation-model.js');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const context = { window: {} };
vm.runInNewContext(html.match(/window\.NOMINATIONS\s*=\s*\[[\s\S]*?\n\];/)[0], context);
const nominations = JSON.parse(JSON.stringify(context.window.NOMINATIONS));
const rows = n => n.participants.map((p, i) => ({ name: model.nameOf(p), total: n.participants.length - i }));

test('a new result snapshot moves a new winner and retains all non-prize participants', () => {
  const n = nominations[0], first = rows(n), a = model.snapshot(n, first);
  assert.equal(a.podium[0].name, first[0].name);
  const changed = first.map(r => ({ ...r })); changed[8].total = 100;
  const b = model.snapshot(n, changed);
  assert.equal(b.podium[0].name, changed[8].name);
  assert.equal(a.podium[0].name, first[0].name, 'active reveal stays unchanged');
  assert.deepEqual(b.nonPrize.map(p => p.rank), [9, 8, 7, 6, 5, 4]);
  assert.equal(new Set([...b.nonPrize, ...b.podium].map(p => p.name)).size, 9);
});
test('every category, including long lists and two-person categories, uses only existing participants', () => {
  assert.equal(nominations.length, 16);
  for (const n of nominations) {
    const s = model.snapshot(n, rows(n));
    assert.equal(s.podium.length, Math.min(3, n.participants.length), n.id);
    assert.equal(s.nonPrize.length, Math.max(0, n.participants.length - 3), n.id);
    assert.equal(s.podium.length + s.nonPrize.length, n.participants.length);
  }
});
test('no votes does not invent winners, and unknown result names are ignored', () => {
  const n = nominations[0], s = model.snapshot(n, [{ name: 'Не в каталоге', total: 500 }]);
  assert.equal(s.hasVotes, false); assert.equal(s.podium.length, 0);
  assert.equal(s.nonPrize.length, n.participants.length);
});
test('unvoted participants stay in the row and are never awarded an empty podium place', () => {
  const n = nominations[0], s = model.snapshot(n, [{ name: n.participants[0].name, total: 3 }]);
  assert.equal(s.podium.length, 1);
  assert.equal(s.nonPrize.length, 8);
  assert(s.nonPrize.every(p => p.rank === null && p.total === 0));
});
test('score ties match backend Russian alphabetical ordering; rehearsal hides identities', () => {
  const n = nominations[0], s = model.snapshot(n, n.participants.map(p => ({ name: p.name, total: 10 })));
  assert.deepEqual(s.ranked.map(p => p.name), [...n.participants.map(p => p.name)].sort((a, b) => a.localeCompare(b, 'ru')));
  assert.equal(s.hasTies, true);
  const rehearsal = model.snapshot(n, rows(n), false);
  assert(rehearsal.ranked.every(p => p.photo === null && p.identity === null && !n.participants.some(q => q.name === p.name)));
});
test('real audio paths follow the ranked identity and absent recordings have no fake fallback', () => {
  const manifest = JSON.parse(fs.readFileSync(require('node:path').join(__dirname, '../audio/slay-2026/manifest.json')));
  const audio = model.audioMap(manifest, nominations);
  assert(audio.get('cs2').lead.includes('/MP3/'));
  assert(audio.get('cs2').names.get('Андрей Владыко').endsWith('.mp3'));
  assert.equal(audio.get('bodybuilder').lead, null);
  assert.equal(audio.get('situation').names.get('Семён порвал барабанную перепонку плавая в бассейне на новый год'), null);
  assert.equal(model.audioMap({ ...manifest, files: [{ id: '01_cs2', format: 'MP3', path: 'https://elsewhere.example/audio' }] }, nominations).get('cs2').lead, null);
});
test('TikTok movies follow the current ranked nominee and remain hidden in rehearsal', () => {
  const n = nominations.find(n => n.id === 'tiktok'), results = rows(n);
  results[6].total = 100;
  const s = model.snapshot(n, results);
  assert.equal(s.podium[0].video, n.participants[6].video);
  assert.equal(new Set([...s.podium, ...s.nonPrize].map(p => p.video)).size, 7);
  assert(model.snapshot(n, results, false).ranked.every(p => p.video === null));
  const unsafe = { ...n, participants: [{ title: 'External', video: 'https://example.org/x.mp4' }] };
  assert.equal(model.snapshot(unsafe, [{ name: 'External', total: 1 }]).podium[0].video, null);
  assert(model.snapshot(nominations[0], rows(nominations[0])).ranked.every(p => p.video === null));
});

test('situation catalog removes retired entries and binds five safe videos to current ranked nominees', () => {
  const n = nominations.find(n => n.id === 'situation');
  const names = n.participants.map(model.nameOf);
  assert.equal(names.length, 14);
  for (const removed of ['Андрей, Данил и Саша сняли тик токи', 'Арсена Ашотовича посадили', 'Человек Чекушка ходил по городу Ульяновску', 'Человек Чекушка на ДР шурика']) assert(!names.includes(removed));
  assert(names.includes('человек чекушка'));
  const media = model.snapshot(n, rows(n)).ranked.filter(p => p.video);
  assert.equal(media.length, 5);
  for (const p of media) {
    assert(fs.existsSync(require('node:path').join(__dirname, '..', p.video)));
    assert.equal(p.video, n.participants.find(q => model.nameOf(q) === p.name).video);
  }
  assert(model.snapshot(n, rows(n), false).ranked.every(p => p.video === null));
  const unsafe = { ...n, participants: [{ title: 'Invalid', video: 'videos/situation/../x.mp4' }] };
  assert.equal(model.snapshot(unsafe, []).ranked[0].video, null);
});

test('winner music follows the current person, with no fallback for others or rehearsal', () => {
  const n = nominations[0];
  for (const [name, file] of [['Андрей Владыко', 'andrey'], ['Даниил Постоев', 'daniil'], ['Семён Ефремов', 'semen'], ['Александр Пеняев', 'penyaev'], ['Арсений Юсупов', 'arseniy'], ['Александр Шамбасов', 'shambasov'], ['Шурик', 'shurik']]) {
    const results = rows(n).map(r => ({ ...r, total: r.name === name ? 100 : r.total }));
    const winner = model.snapshot(n, results).podium[0];
    assert.equal(model.winnerMusicFor(winner).split('?')[0], `audio/winner-music/${file}.m4a`);
    assert(fs.existsSync(require('node:path').join(__dirname, '..', model.winnerMusicFor(winner).split('?')[0])));
    assert.equal(model.winnerMusicFor(model.snapshot(n, results, false).podium[0]), null);
  }
  assert.equal(model.winnerMusicFor({ identity: 'Тимур Насретдинов' }), null);
  assert.equal(model.winnerMusicFor({ identity: 'Андрей Владыко и Даниил Постоев' }), null);
});
