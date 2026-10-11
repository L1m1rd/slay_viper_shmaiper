import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareMigration } from './migration-data.mjs';
const catalog = [{ id: 'cs2', participants: ['A', 'B'], multi: false }, { id: 'couple', participants: ['A+B', 'C+D', 'E+F'], multi: true }];
function source() {
  return {
    users: [{ id: 'user-1', email: 'Test@example.com', encrypted_password: '$2b$10$' + 'a'.repeat(53), created_at: '2026-01-01', email_confirmed_at: '2026-01-02' }],
    profiles: [{ id: 'user-1', username: 'test', display_name: 'Тест', role: 'user', status: 'approved', created_at: '2026-01-01' }],
    votes: [{ user_id: 'user-1', nomination_id: 'cs2', participant: 'A', place: 2 }, { user_id: 'user-1', nomination_id: 'couple', participant: 'A+B', place: null }]
  };
}
test('migration preserves UID, status, rank gaps and multi votes', () => {
  const plan = prepareMigration(source(), catalog);
  assert.equal(plan.users[0].id, 'user-1');
  assert.equal(plan.users[0].email, 'test@example.com');
  assert.equal(plan.documents.find(d => d.path === 'profiles/user-1').data.status, 'approved');
  assert.deepEqual(plan.documents.find(d => d.path === 'votes/user-1_cs2').data.choices, [null, 'A', null]);
  assert.deepEqual(plan.documents.find(d => d.path === 'votes/user-1_couple').data.choices, ['A+B', null, null]);
});
test('reject missing passwords rather than silently reset accounts', () => {
  const input = source(); input.users[0].encrypted_password = '';
  assert.throws(() => prepareMigration(input, catalog), /password hash/);
});
test('reject collisions and incomplete profiles before writes', () => {
  const input = source(); input.users.push({ ...input.users[0], id: 'user-2' });
  assert.throws(() => prepareMigration(input, catalog), /duplicate email/);
  input.users.pop(); input.profiles = [];
  assert.throws(() => prepareMigration(input, catalog), /no profile/);
});
test('reject invalid participants, repeated ranks and duplicate votes', () => {
  const input = source(); input.votes[0].participant = 'Unknown';
  assert.throws(() => prepareMigration(input, catalog), /unknown/);
  input.votes[0].participant = 'A'; input.votes.push({ ...input.votes[0], participant: 'B' });
  assert.throws(() => prepareMigration(input, catalog), /duplicate place/);
  input.votes.pop(); input.votes.push({ ...input.votes[0] });
  assert.throws(() => prepareMigration(input, catalog), /Duplicate participant/);
});
test('preserve admin and banned profiles', () => {
  const input = source(); input.profiles[0].role = 'admin'; input.profiles[0].status = 'banned';
  const profile = prepareMigration(input, catalog).documents.find(d => d.path === 'profiles/user-1').data;
  assert.equal(profile.role, 'admin'); assert.equal(profile.status, 'banned');
});
