(() => {
  'use strict';
  const client = window.supabaseClient;
  const checked = result => { if (result.error) throw result.error; return result.data; };
  window.QualificationStore = {
    async setup() {
      if (!client) throw new Error('Отбор требует подключения Supabase');
      const [stage, catalog] = await Promise.all([
        client.from('award_stage').select('phase').eq('id',true).single(),
        client.from('couple_qualification_candidates').select('id,name,position').order('position')
      ]);
      return { phase: window.SlayAdminTest?.enabled('qualification') ? 'qualification' : checked(stage).phase, candidates: checked(catalog) };
    },
    async ballot() {
      const user = window.DB.getCurrentUser();
      if (!user) return [];
      if (window.SlayAdminTest?.allowed()) return window.SlayAdminTest.get('qualification',[]);
      const row = checked(await client.from('couple_qualification_ballots').select('choices').eq('user_id',user.id).maybeSingle());
      return row?.choices || [];
    },
    async save(choices) {
      if(window.SlayAdminTest?.enabled('qualification')) { if(!window.SlayQualificationModel.validBallot(choices))throw Error('Выбери 16 пар');window.SlayAdminTest.set('qualification',choices);return; }
      checked(await client.rpc('save_couple_qualification_ballot', { selected: choices }));
    },
    async results() {
      if (window.DB.getCurrentUser()?.role !== 'admin') throw new Error('Доступ запрещён');
      const [profiles, ballots] = await Promise.all([
        client.from('profiles').select('id,role,status'),
        client.from('couple_qualification_ballots').select('user_id,choices')
      ]);
      const approved = new Set(checked(profiles).filter(p => p.role === 'user' && p.status === 'approved').map(p => p.id));
      return checked(ballots).filter(b => approved.has(b.user_id));
    }
  };
})();
