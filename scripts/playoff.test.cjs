const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const M=require('../playoff-model.js'),results=require('../qualification-results.json'),photos=require('../playoff-photos.json');
test('sixteen seeded couples, original photographs, and mirrored 1-v-16 pairings',()=>{
 const pairs=M.seed(results,photos),matches=M.initialMatches(pairs);assert.equal(matches.length,15);
 const first=matches.filter(m=>m.round===0);assert.equal(new Set(first.flatMap(m=>m.entrants)).size,16);
 for(const p of pairs)assert(fs.existsSync(path.join(__dirname,'..',p.photo)));
 const halves=[first.slice(0,4).flatMap(m=>m.entrants),first.slice(4).flatMap(m=>m.entrants)];
 for(let i=0;i<16;i+=2)assert.notEqual(halves[0].includes(pairs[i].id),halves[0].includes(pairs[i+1].id));
 for(const m of first){const seeds=m.entrants.map(id=>pairs.find(p=>p.id===id).seed);assert.equal(seeds[0]+seeds[1],17);}
 assert.equal(first[0].entrants[0],pairs[0].id);assert.equal(first[7].entrants[0],pairs[1].id);
});
test('ballots require every match and reject a couple from another match',()=>{
 const matches=M.initialMatches(M.seed(results,photos));const ballot=Object.fromEntries(matches.filter(m=>m.round===0).map(m=>[m.slot,m.entrants[0]]));
 assert(M.validBallot(ballot,matches,0));assert(!M.validBallot({...ballot,0:'c99'},matches,0));
 assert(!M.validBallot({...ballot,0:ballot[1]},matches,0));delete ballot[7];assert(!M.validBallot(ballot,matches,0));
 assert(!M.validBallot({},matches,1));assert(!M.validBallot([],matches,0));
});
