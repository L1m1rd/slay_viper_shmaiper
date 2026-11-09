(() => {
  'use strict';
  const personal = new Set(['cs2','dota2','style','incel','charisma','2008','alcoholic','meme','crush','idiot','bodybuilder','fatness','slayking']);
  const normalized = name => typeof name === 'string' ? name.trim().replace(/\s+/g,' ').toLowerCase().replaceAll('ё','е') : '';
  function blocked(nomination, participant, nomineeName) {
    const own = normalized(nomineeName);
    return personal.has(nomination) && Boolean(own) && own === normalized(participant);
  }
  window.SlaySelfVote = { isPersonal: nomination => personal.has(nomination), blocked };
})();

