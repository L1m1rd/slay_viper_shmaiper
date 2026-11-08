(function(root) {
  'use strict';
  const firstRound = [[1,16],[8,9],[4,13],[5,12],[3,14],[6,11],[7,10],[2,15]];
  const rounds = ['1/8 финала','1/4 финала','Полуфинал','Финал'];
  function seed(results, photos) {
    const pairs = results.ranked.slice(0,16).map((p,i) => ({...p, seed:i+1, photo:photos[p.id]}));
    if (pairs.length !== 16 || new Set(pairs.map(p=>p.id)).size !== 16 || pairs.some(p=>!p.photo)) throw Error('Неполный состав плей-офф');
    return pairs;
  }
  function initialMatches(pairs) {
    const matches = [];
    for(let round=0;round<4;round++) for(let slot=0;slot<8/2**round;slot++) {
      matches.push({round,slot,entrants:round===0?firstRound[slot].map(n=>pairs[n-1].id):null,winner:null,counts:{}});
    }
    return matches;
  }
  function validBallot(choices, matches, round) {
    const current=matches.filter(m=>m.round===round);
    return choices && typeof choices==='object' && !Array.isArray(choices) && current.length===8/2**round &&
      Object.keys(choices).length===current.length && current.every(m=>m.entrants?.length===2&&m.entrants.includes(choices[m.slot]));
  }
  function slotLabel(round, slot) { return round===0?`Матч ${slot+1}`:`${rounds[round]} · ${slot+1}`; }
  const api={firstRound,rounds,seed,initialMatches,validBallot,slotLabel};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SlayPlayoffModel=api;
})(typeof window!=='undefined'?window:globalThis);
