import { readFile } from 'node:fs/promises';
import test, { before, after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, where, serverTimestamp, writeBatch } from 'firebase/firestore';
let env;
const profile = (id, role = 'user', status = 'approved') => ({ id, username: id, display_name: id, role, status, created_at: '2026-01-01T00:00:00.000Z' });
const db = (uid, verified = true) => env.authenticatedContext(uid, { email_verified: verified }).firestore();
const vote = (uid, choices = ['A', null, null]) => ({ user_id: uid, nomination_id: 'cs2', choices, updated_at: serverTimestamp() });
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-slay-award', firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') } });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const database = context.firestore();
    for (const [id, role, status] of [['alice','user','approved'], ['bobby','user','approved'], ['pending','user','pending'], ['banned','user','banned'], ['admin','admin','approved']]) {
      await setDoc(doc(database, 'profiles', id), profile(id, role, status));
      await setDoc(doc(database, 'usernames', id), { uid: id });
    }
    await setDoc(doc(database, 'nominations/cs2'), { participants: ['A', 'B', 'C'], multi: false });
    await setDoc(doc(database, 'nominations/couple'), { participants: ['A', 'B', 'C', 'D'], multi: true });
    await setDoc(doc(database, 'votes/alice_cs2'), vote('alice'));
  });
});
test('approved verified voter can replace their nomination atomically', async () => {
  await assertSucceeds(setDoc(doc(db('alice'), 'votes/alice_cs2'), vote('alice', ['C', null, 'A'])));
});
test('guest, pending, banned, admin and unverified cannot vote', async () => {
  for (const uid of ['pending', 'banned', 'admin']) await assertFails(setDoc(doc(db(uid), `votes/${uid}_cs2`), vote(uid)));
  await assertFails(setDoc(doc(db('alice', false), 'votes/alice_cs2'), vote('alice')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'votes/alice_cs2')));
});
test('cannot read or write another user votes; admin can read results', async () => {
  await assertFails(getDoc(doc(db('bobby'), 'votes/alice_cs2')));
  await assertFails(setDoc(doc(db('bobby'), 'votes/alice_cs2'), vote('alice')));
  await assertFails(getDocs(collection(db('alice'), 'votes')));
  await assertSucceeds(getDocs(query(collection(db('alice'), 'votes'), where('user_id', '==', 'alice'))));
  await assertSucceeds(getDocs(collection(db('admin'), 'votes')));
});
test('reject duplicate, forged, over-limit and unknown nomination votes', async () => {
  for (const choices of [['A','A',null], ['Fake',null,null], ['A','B','C','D']]) {
    await assertFails(setDoc(doc(db('alice'), 'votes/alice_cs2'), vote('alice', choices)));
  }
  await assertFails(setDoc(doc(db('alice'), 'votes/extra_cs2'), vote('alice')));
  await assertFails(setDoc(doc(db('alice'), 'votes/alice_fake'), { ...vote('alice'), nomination_id: 'fake' }));
  await assertSucceeds(setDoc(doc(db('alice'), 'votes/alice_couple'), { ...vote('alice', ['A','B','C']), nomination_id: 'couple' }));
  await assertFails(setDoc(doc(db('alice'), 'votes/alice_couple'), { ...vote('alice', ['A','B','C','D']), nomination_id: 'couple' }));
});
test('cannot self-approve or gain admin; admin can approve users only', async () => {
  await assertFails(updateDoc(doc(db('pending'), 'profiles/pending'), { status: 'approved' }));
  await assertFails(updateDoc(doc(db('alice'), 'profiles/alice'), { role: 'admin' }));
  await assertSucceeds(updateDoc(doc(db('alice'), 'profiles/alice'), { display_name: 'Новое имя' }));
  await assertSucceeds(updateDoc(doc(db('admin'), 'profiles/pending'), { status: 'approved' }));
  await assertFails(updateDoc(doc(db('admin'), 'profiles/admin'), { status: 'banned' }));
});
test('registration atomically reserves unique username and creates pending profile', async () => {
  const database = db('newuser', false), batch = writeBatch(database);
  batch.set(doc(database, 'profiles/newuser'), profile('newuser', 'user', 'pending'));
  batch.set(doc(database, 'usernames/newuser'), { uid: 'newuser' });
  await assertSucceeds(batch.commit());
  const otherDatabase = db('otheruser'), collision = writeBatch(otherDatabase);
  collision.set(doc(otherDatabase, 'profiles/otheruser'), { ...profile('otheruser','user','pending'), username: 'alice' });
  collision.set(doc(otherDatabase, 'usernames/alice'), { uid: 'otheruser' });
  await assertFails(collision.commit());
  await assertFails(setDoc(doc(db('eviluser'), 'profiles/eviluser'), profile('eviluser','admin','approved')));
});
test('legacy administrator can edit name, but new registrations retain 30-char limit', async () => {
  const legacyHandle = 'user_22a630fe1367408c9cf38a04fd261277';
  await env.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), 'profiles/admin'), { username: legacyHandle });
  });
  await assertSucceeds(updateDoc(doc(db('admin'), 'profiles/admin'), { display_name: 'Администратор' }));
  const database = db('newlonguser'), batch = writeBatch(database);
  batch.set(doc(database, 'profiles/newlonguser'), { ...profile('newlonguser', 'user', 'pending'), username: legacyHandle });
  batch.set(doc(database, 'usernames', legacyHandle), { uid: 'newlonguser' });
  await assertFails(batch.commit());
});
