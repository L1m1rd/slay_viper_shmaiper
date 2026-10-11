import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('window.NOMINATIONS = [');
const end = html.indexOf('\n];', start) + 3;
if (start < 0 || end < 3) throw new Error('Nomination data not found');
const context = { window: {} };
vm.runInNewContext(html.slice(start, end), context, { timeout: 1000 });
const catalog = context.window.NOMINATIONS.map(n => ({
  id: n.id,
  multi: n.votingType === 'multi-vote',
  participants: n.participants.map(p => typeof p === 'string' ? p : p.name || p.title)
}));
if (catalog.some(n => n.participants.some(p => typeof p !== 'string'))) throw new Error('Invalid participant');
await writeFile(new URL('../firebase-catalog.json', import.meta.url), JSON.stringify(catalog, null, 2) + '\n');
console.log(`Prepared ${catalog.length} nominations`);
