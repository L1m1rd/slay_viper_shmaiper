(() => {
 'use strict';
 const rpc=async(name,args)=>{const client=window.supabaseClient;if(!client)throw Error('Сохранение временно недоступно');const {data,error}=await client.rpc(name,args);if(error)throw error;return data;};
 window.PlayoffStore={
  load:()=>rpc('get_couple_playoff'),
  save:(selected,version)=>rpc('save_couple_playoff_ballot',{selected,expected_version:version}),
  open:version=>rpc('open_couple_playoff_round',{expected_version:version}),
  finish:(version,ties)=>rpc('finish_couple_playoff_round',{expected_version:version,tie_choices:ties})
 };
})();
