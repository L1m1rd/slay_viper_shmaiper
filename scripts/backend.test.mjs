import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const adapter = await readFile(new URL('../firebase-app.js', import.meta.url), 'utf8');
const loader = await readFile(new URL('../backend-loader.js', import.meta.url), 'utf8');
test('backend loader selects only the configured provider and loads presentation after adapter', async () => {
  for (const provider of ['supabase', 'firebase']) {
    const loaded = [], messages = [];
    const context = {
      window: { SLAY_BACKEND: { provider, firebase: { apiKey: 'key', authDomain: 'domain', projectId: 'project', appId: 'app' } }, toast: text => messages.push(text) },
      document: { createElement: () => ({}), head: { appendChild: script => { loaded.push(script.src); queueMicrotask(script.onload); } } }, console
    };
    vm.runInNewContext(loader, context);
    await context.window.SLAY_BACKEND_READY;
    assert.deepEqual(loaded.slice(-4).map(path => path.split('?')[0]), ['design.js', 'motion.js', 'presentation-model.js', 'presentation.js']);
    assert.equal(loaded.at(-7).split('?')[0], provider + '-app.js');
    assert.deepEqual(loaded.slice(-6,-4).map(path=>path.split('?')[0]), ['qualification-store.js','qualification.js']);
    assert.equal(loaded.some(path => path.includes(provider === 'firebase' ? 'supabase' : 'firebase')), false);
    assert.equal(messages.length, 0);
  }
});
test('missing Firebase config stops initialization with a visible error', async () => {
  let requested = false, notified = false;
  const context = { window: { SLAY_BACKEND: { provider: 'firebase', firebase: {} }, toast: () => { notified = true; } }, document: { createElement: () => { requested = true; } }, console: { error() {} } };
  vm.runInNewContext(loader, context);
  await context.window.SLAY_BACKEND_READY;
  assert.equal(requested, false); assert.equal(notified, true);
});
function harness({ status = 'approved', verified = true, role = 'user', failWrite = false } = {}) {
  const records = new Map([
    ['profiles/alice', { id: 'alice', username: 'alice', display_name: 'Alice', role, status, created_at: '2026-01-01' }],
    ['votes/alice_cs2', { user_id: 'alice', nomination_id: 'cs2', choices: ['A', null, 'B'] }]
  ]);
  const writes = [], messages = [];
  const session = { uid: 'alice', emailVerified: verified, async reload() {}, async getIdToken() {} };
  const auth = { currentUser: session, onAuthStateChanged: callback => { queueMicrotask(() => callback(session)); return () => {}; }, onIdTokenChanged: callback => { queueMicrotask(() => callback(session)); return () => {}; } };
  const firestore = { collection(name) {
    const query = { filters: [], where(field, op, value) { this.filters.push([field, value]); return this; }, async get() {
      return { docs: [...records].filter(([path, value]) => path.startsWith(name + '/') && query.filters.every(([field, filter]) => value[field] === filter)).map(([path, value]) => ({ data: () => structuredClone(value) })) };
    }, doc(id) { const path = name + '/' + id; return {
      async get() { return { exists: records.has(path), data: () => structuredClone(records.get(path)) }; },
      async set(value) { writes.push({ path, value }); if (failWrite) throw new Error('network'); records.set(path, structuredClone(value)); }
    }; } }; return query;
  } };
  const elements = new Map();
  const document = { getElementById(id) { if (!elements.has(id)) elements.set(id, { classList: { toggle() {}, add() {}, remove() {} } }); return elements.get(id); } };
  const nominations = [{ id: 'cs2', participants: ['A', 'B', 'C'] }, { id: 'couple', votingType: 'multi-vote', participants: ['A+B','B+C','C+D'] }];
  const window = { firebase: { initializeApp: () => ({ auth: () => auth, firestore: () => firestore }), firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } }, SLAY_BACKEND: { firebase: {} }, NOMINATIONS: nominations, COUPLE_VOTES_LIMIT: 3,
    currentCategory: nominations[0], DB: {}, updateUI() {}, renderProfile() {}, renderVotePage() {}, openModal() {}, scrollTo() {}, getParticipantName: value => value, toast: value => messages.push(value) };
  vm.runInNewContext(adapter, { window, document, localStorage: { removeItem() {} }, console: { error() {} }, confirm: () => true, setTimeout });
  return { window, records, writes, messages };
}
test('changing rank atomically preserves other rank and removes duplicate selection', async () => {
  const h = harness();
  await h.window.setPlace(2, 'A');
  assert.equal(h.writes.length, 1);
  assert.deepEqual(Array.from(h.writes[0].value.choices), [null, 'A', 'B']);
  assert.equal(h.writes[0].path, 'votes/alice_cs2');
});
test('failed write preserves previously saved votes', async () => {
  const h = harness({ failWrite: true });
  await h.window.setPlace(2, 'C');
  assert.deepEqual(h.records.get('votes/alice_cs2').choices, ['A', null, 'B']);
});
test('pending, banned, admin and unverified sessions cannot submit votes', async () => {
  for (const options of [{ status: 'pending' }, { status: 'banned' }, { role: 'admin' }, { verified: false }]) {
    const h = harness(options); await h.window.setPlace(2, 'C'); assert.equal(h.writes.length, 0);
  }
});
