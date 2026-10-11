export function prepareMigration(input, catalog) {
  if (!input || !['users', 'profiles', 'votes'].every(key => Array.isArray(input[key]))) throw new Error('Expected users, profiles and votes arrays');
  const users = new Map(), emails = new Set(), profiles = new Map(), handles = new Set();
  const nominations = new Map(catalog.map(n => [n.id, n]));
  const documents = catalog.map(n => ({ path: `nominations/${n.id}`, data: n }));
  for (const user of input.users) {
    if (typeof user.id !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(user.id) || users.has(user.id)) throw new Error('Invalid or duplicate user ID');
    const email = String(user.email || '').trim().toLowerCase();
    if (!email.includes('@') || emails.has(email)) throw new Error('Invalid or duplicate email');
    if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(user.encrypted_password || '')) throw new Error('Missing or unsupported password hash; export bcrypt hashes from auth.users');
    if (!Number.isFinite(new Date(user.created_at).getTime())) throw new Error('Invalid Auth creation timestamp');
    if (user.email_confirmed_at != null && !Number.isFinite(new Date(user.email_confirmed_at).getTime())) throw new Error('Invalid email confirmation timestamp');
    users.set(user.id, { ...user, email });
    emails.add(email);
  }
  for (const p of input.profiles) {
    if (!users.has(p.id) || profiles.has(p.id)) throw new Error('Profile has missing or duplicate Auth user');
    if (!/^[a-z0-9_]{3,30}$/.test(p.username) || handles.has(p.username)) throw new Error('Invalid or duplicate username');
    if (typeof p.display_name !== 'string' || !p.display_name.trim() || p.display_name.length > 50) throw new Error('Invalid display name');
    if (!['admin', 'user'].includes(p.role) || !['approved', 'pending', 'banned'].includes(p.status)) throw new Error('Invalid profile role/status');
    const created = new Date(p.created_at);
    if (!Number.isFinite(created.getTime())) throw new Error('Invalid profile timestamp');
    const profile = { id: p.id, username: p.username, display_name: p.display_name, role: p.role, status: p.status, created_at: created.toISOString() };
    profiles.set(p.id, profile);
    handles.add(p.username);
    documents.push({ path: `profiles/${p.id}`, data: profile }, { path: `usernames/${p.username}`, data: { uid: p.id } });
  }
  if (users.size !== profiles.size) throw new Error('Auth user has no profile; resolve incomplete registrations before migrating');
  const votes = new Map();
  for (const row of input.votes) {
    const n = nominations.get(row.nomination_id);
    if (!profiles.has(row.user_id) || !n || !n.participants.includes(row.participant)) throw new Error('Vote has an unknown user, nomination or participant');
    if (n.multi ? row.place != null : !Number.isInteger(row.place) || row.place < 1 || row.place > 3) throw new Error('Invalid vote place');
    const key = `${row.user_id}_${row.nomination_id}`;
    if (!votes.has(key)) votes.set(key, { user_id: row.user_id, nomination_id: row.nomination_id, choices: [null, null, null] });
    const vote = votes.get(key);
    if (vote.choices.includes(row.participant)) throw new Error('Duplicate participant in vote');
    const position = n.multi ? vote.choices.indexOf(null) : row.place - 1;
    if (position < 0 || vote.choices[position] != null) throw new Error('Too many votes or duplicate place');
    vote.choices[position] = row.participant;
  }
  for (const [id, data] of votes) documents.push({ path: `votes/${id}`, data });
  return { users: [...users.values()], documents, counts: { users: users.size, profiles: profiles.size, voteRows: input.votes.length, voteDocuments: votes.size, nominations: catalog.length } };
}
