import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { prepareMigration } from './migration-data.mjs';

const args = process.argv.slice(2);
const value = flag => args[args.indexOf(flag) + 1];
const inputPath = args.includes('--input') ? value('--input') : 'migration-private/supabase-export.json';
const catalog = JSON.parse(await readFile(new URL('../firebase-catalog.json', import.meta.url), 'utf8'));
const input = JSON.parse(await readFile(inputPath, 'utf8'));
const plan = prepareMigration(input, catalog);
console.log('Migration validated:', plan.counts);
if (!args.includes('--apply')) {
  console.log('Dry run: no network requests or writes. Add --apply --project YOUR_PROJECT_ID to import.');
  process.exit(0);
}
const projectId = args.includes('--project') ? value('--project') : '';
if (!/^[a-z][a-z0-9-]{4,29}$/.test(projectId) || projectId.startsWith('demo-')) throw new Error('Explicit real --project required');
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error('Set GOOGLE_APPLICATION_CREDENTIALS to the private service-account file');
if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Unset emulator environment variables before a real import');
const { initializeApp, applicationDefault } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
const app = initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore(app), auth = getAuth(app);
const existingUsers = new Map();
let pageToken;
do {
  const page = await auth.listUsers(1000, pageToken);
  page.users.forEach(user => existingUsers.set(user.uid, user));
  pageToken = page.pageToken;
} while (pageToken);
// Refuse unrelated destination data and changed records. Re-running a partial
// migration is safe only while both source and destination remain frozen.
const sourceUsers = new Map(plan.users.map(user => [user.id, user]));
for (const user of existingUsers.values()) {
  const source = sourceUsers.get(user.uid);
  if (!source || user.email?.toLowerCase() !== source.email || user.emailVerified !== Boolean(source.email_confirmed_at)) throw new Error('Destination Auth differs from source; use a new project or resolve manually');
}
const expected = new Map(plan.documents.map(doc => [doc.path, doc.data]));
for (const collection of ['nominations', 'profiles', 'usernames', 'votes']) {
  const snapshot = await db.collection(collection).get();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    delete data.updated_at;
    if (!isDeepStrictEqual(data, expected.get(doc.ref.path))) throw new Error('Destination document differs: ' + doc.ref.path);
  }
}
const missing = plan.users.filter(user => !existingUsers.has(user.id));
for (let start = 0; start < missing.length; start += 1000) {
  const batch = missing.slice(start, start + 1000);
  const result = await auth.importUsers(batch.map(user => ({
    uid: user.id, email: user.email, emailVerified: Boolean(user.email_confirmed_at),
    passwordHash: Buffer.from(user.encrypted_password),
    metadata: { creationTime: new Date(user.created_at).toUTCString() }
  })), { hash: { algorithm: 'BCRYPT' } });
  if (result.failureCount) {
    console.error('Auth import failed at batch indexes:', result.errors.map(error => error.index));
    throw new Error('Stopped before Firestore writes. Resolve Auth errors, then rerun with the same frozen export.');
  }
}
for (const document of plan.documents) {
  await db.runTransaction(async transaction => {
    const ref = db.doc(document.path);
    const existing = await transaction.get(ref);
    if (existing.exists) {
      const data = existing.data();
      delete data.updated_at;
      if (!isDeepStrictEqual(data, document.data)) throw new Error('Destination changed: ' + document.path);
      return;
    }
    const data = { ...document.data };
    if (document.path.startsWith('votes/')) data.updated_at = FieldValue.serverTimestamp();
    transaction.create(ref, data);
  });
}
console.log('Import finished. Verify counts, login and admin access before switching backend-config.js.');
