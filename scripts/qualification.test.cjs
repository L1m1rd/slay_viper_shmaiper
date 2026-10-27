const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const model = require('../qualification-model.js');
test('qualification catalog contains exactly the 22 agreed pairs, distinct from the main nomination', () => {
  assert.equal(model.candidates.length,22);
  assert.equal(new Set(model.candidates.map(c=>c.name)).size,22);
  assert(model.candidates.some(c=>c.name==='Саня Пеняев и Иванчикова'));
  assert(model.candidates.some(c=>c.name==='Шурик и Стеша'));
  assert(model.candidates.some(c=>c.name==='Саша Шамбасов и Даша Таурин'));
  assert(!model.candidates.some(c=>c.name==='Егор и Соня'));
});
test('only exactly 16 distinct catalog choices form a ballot', () => {
  const valid=model.candidates.slice(0,16).map(c=>c.id);
  assert(model.validBallot(valid));
  for(const invalid of [valid.slice(1),[...valid,'c17'],[...valid.slice(0,15),'c01'],[...valid.slice(0,15),'other'],null])assert(!model.validBallot(invalid));
});
test('tally counts each eligible voter once and ignores incomplete or duplicate ballots', () => {
  const ids=model.candidates.slice(0,16).map(c=>c.id);
  const totals=model.tally(model.candidates,[{user_id:'a',choices:ids},{user_id:'a',choices:ids},{user_id:'b',choices:ids.slice(1)},{user_id:'c',choices:ids}]);
  assert.equal(totals.voters,2);
  assert.equal(totals.ranked.length,22);
  assert.equal(totals.ranked.filter(c=>c.votes===2).length,16);
  assert.equal(totals.cutoffTie,false);
  const empty=model.tally(model.candidates,[]);assert.equal(empty.voters,0);assert.equal(empty.cutoffTie,false);
});
test('SQL seed and browser catalog agree exactly', () => {
  const sql=fs.readFileSync(require('node:path').join(__dirname,'../qualification.sql'),'utf8');
  for(const c of model.candidates)assert(sql.includes(`('${c.id}','${c.name}',${c.position})`));
});
