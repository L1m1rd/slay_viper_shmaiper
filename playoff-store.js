(() => {
 'use strict';
 const rpc=async(name,args)=>{const client=window.supabaseClient;if(!client)throw Error('Сохранение временно недоступно');const {data,error}=await client.rpc(name,args);if(error)throw error;return data;};
 window.PlayoffStore={
  load:()=>window.SlayAdminTest?.enabled('playoff')?window.SlayAdminTest.loadPlayoff():rpc('get_couple_playoff'),
  save:(selected,version)=>window.SlayAdminTest?.enabled('playoff')?window.SlayAdminTest.savePlayoff(selected,version):rpc('save_couple_playoff_ballot',{selected,expected_version:version}),
  open:version=>window.SlayAdminTest?.enabled('playoff')?window.SlayAdminTest.advance('open',version):rpc('open_couple_playoff_round',{expected_version:version}),
  finish:(version,ties)=>window.SlayAdminTest?.enabled('playoff')?window.SlayAdminTest.advance('finish',version):rpc('finish_couple_playoff_round',{expected_version:version,tie_choices:ties})
 };
})();
