-- SLAY couple playoff. Additive migration; old votes/qualification remain intact.
begin;
create table if not exists public.couple_playoff_state (
 id boolean primary key default true check(id),
 active_round integer not null default 0 check(active_round between 0 and 3),
 status text not null default 'waiting' check(status in ('waiting','open','complete')),
 version integer not null default 1,
 champion text references public.couple_qualification_candidates(id)
);
create table if not exists public.couple_playoff_matches (
 round integer not null check(round between 0 and 3),
 slot integer not null check(slot>=0 and slot < (8 >> round)),
 entrants text[] check(entrants is null or cardinality(entrants)=2),
 winner text references public.couple_qualification_candidates(id),
 result_counts jsonb,
 primary key(round,slot),
 check(winner is null or (entrants is not null and winner=any(entrants)))
);
alter table public.couple_playoff_matches add column if not exists result_counts jsonb;
create table if not exists public.couple_playoff_ballots (
 user_id uuid not null references public.profiles(id) on delete cascade,
 round integer not null check(round between 0 and 3),
 choices jsonb not null check(jsonb_typeof(choices)='object'),
 updated_at timestamptz not null default now(),
 primary key(user_id,round)
);
insert into public.couple_playoff_state(id) values(true) on conflict do nothing;
insert into public.couple_playoff_matches(round,slot,entrants) values
 (0,0,array['c11','c17']),(0,1,array['c23','c01']),
 (0,2,array['c07','c13']),(0,3,array['c04','c19']),
 (0,4,array['c09','c02']),(0,5,array['c16','c20']),
 (0,6,array['c14','c21']),(0,7,array['c10','c22']) on conflict do nothing;
insert into public.couple_playoff_matches(round,slot)
 select r,s from generate_series(1,3) r cross join lateral generate_series(0,(8 >> r)-1) s on conflict do nothing;
alter table public.couple_playoff_state enable row level security;
alter table public.couple_playoff_matches enable row level security;
alter table public.couple_playoff_ballots enable row level security;
revoke all on public.couple_playoff_state,public.couple_playoff_matches,public.couple_playoff_ballots from anon,authenticated;
grant select on public.couple_playoff_state,public.couple_playoff_matches to anon,authenticated;
grant select on public.couple_playoff_ballots to authenticated;
drop policy if exists playoff_state_read on public.couple_playoff_state;
create policy playoff_state_read on public.couple_playoff_state for select to anon,authenticated using(true);
drop policy if exists playoff_matches_read on public.couple_playoff_matches;
create policy playoff_matches_read on public.couple_playoff_matches for select to anon,authenticated using(true);
drop policy if exists playoff_own_ballot on public.couple_playoff_ballots;
create policy playoff_own_ballot on public.couple_playoff_ballots for select to authenticated using(user_id=auth.uid());

create or replace function public.get_couple_playoff()
returns jsonb language plpgsql security definer set search_path='' as $$
declare state_row public.couple_playoff_state; result jsonb; is_admin boolean;
begin
 select * into state_row from public.couple_playoff_state where id;
 is_admin:=exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='approved');
 select jsonb_agg(jsonb_build_object('round',m.round,'slot',m.slot,'entrants',m.entrants,'winner',m.winner,
  'counts',case when m.winner is not null then coalesce(m.result_counts,'{}'::jsonb) when is_admin then coalesce((
   select jsonb_object_agg(x.choice,x.total) from (
    select b.choices->>m.slot::text choice,count(*) total from public.couple_playoff_ballots b
    join public.profiles p on p.id=b.user_id and p.role='user' and p.status='approved'
    where b.round=m.round group by b.choices->>m.slot::text
   ) x where x.choice is not null
  ),'{}'::jsonb) else '{}'::jsonb end) order by m.round,m.slot) into result from public.couple_playoff_matches m;
 return jsonb_build_object('state',to_jsonb(state_row),'matches',result,'ballot',coalesce((
  select choices from public.couple_playoff_ballots where user_id=auth.uid() and round=state_row.active_round
 ),'{}'::jsonb));
end;$$;

create or replace function public.save_couple_playoff_ballot(selected jsonb,expected_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare state_row public.couple_playoff_state; match_row public.couple_playoff_matches; voter uuid:=auth.uid();
begin
 if voter is null or not exists(select 1 from public.profiles where id=voter and role='user' and status='approved') then
  raise exception 'Only approved participants may vote' using errcode='42501';
 end if;
 select * into state_row from public.couple_playoff_state where id for share;
 if expected_version is null or state_row.status<>'open' or state_row.version<>expected_version then raise exception 'Round changed or closed'; end if;
 if selected is null or jsonb_typeof(selected)<>'object' then raise exception 'Invalid ballot';end if;
 if (select count(*) from jsonb_object_keys(selected))<>(8 >> state_row.active_round) then raise exception 'Select one couple in each match';end if;
 for match_row in select * from public.couple_playoff_matches where round=state_row.active_round loop
  if match_row.entrants is null or selected->>match_row.slot::text is null or not ((selected->>match_row.slot::text)=any(match_row.entrants)) then
   raise exception 'Unknown or missing match choice';
  end if;
 end loop;
 insert into public.couple_playoff_ballots(user_id,round,choices) values(voter,state_row.active_round,selected)
 on conflict(user_id,round) do update set choices=excluded.choices,updated_at=now();
end;$$;

create or replace function public.open_couple_playoff_round(expected_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare state_row public.couple_playoff_state;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='approved') then raise exception 'Admin only' using errcode='42501';end if;
 select * into state_row from public.couple_playoff_state where id for update;
 if expected_version is null or state_row.status<>'waiting' or state_row.version<>expected_version then raise exception 'Round changed';end if;
 if exists(select 1 from public.couple_playoff_matches where round=state_row.active_round and entrants is null) then raise exception 'Unresolved previous round';end if;
 update public.couple_playoff_state set status='open',version=version+1 where id;
end;$$;

create or replace function public.finish_couple_playoff_round(expected_version integer,tie_choices jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare state_row public.couple_playoff_state; m public.couple_playoff_matches; a bigint; b bigint; chosen text; prior text;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='approved') then raise exception 'Admin only' using errcode='42501';end if;
 select * into state_row from public.couple_playoff_state where id for update;
 if expected_version is null or state_row.status<>'open' or state_row.version<>expected_version then raise exception 'Round changed';end if;
 if tie_choices is null or jsonb_typeof(tie_choices)<>'object' then raise exception 'Invalid tie choices';end if;
 for m in select * from public.couple_playoff_matches where round=state_row.active_round order by slot loop
  select count(*) filter(where x.choice=m.entrants[1]), count(*) filter(where x.choice=m.entrants[2]) into a,b
  from (select ballots.choices->>m.slot::text choice from public.couple_playoff_ballots ballots
   join public.profiles p on p.id=ballots.user_id and p.role='user' and p.status='approved' where ballots.round=m.round) x;
  if a+b=0 then raise exception 'No votes in match %',m.slot+1;end if;
  if a=b then
   chosen:=tie_choices->>m.slot::text;
   if chosen is null or not(chosen=any(m.entrants)) then raise exception 'Resolve tie in match %',m.slot+1;end if;
  elsif a>b then chosen:=m.entrants[1];else chosen:=m.entrants[2];end if;
  update public.couple_playoff_matches set winner=chosen,result_counts=jsonb_build_object(m.entrants[1],a,m.entrants[2],b) where round=m.round and slot=m.slot;
  if state_row.active_round<3 then
   if m.slot%2=0 then prior:=chosen;
   else update public.couple_playoff_matches set entrants=array[prior,chosen] where round=m.round+1 and slot=m.slot/2;end if;
  end if;
 end loop;
 if state_row.active_round=3 then update public.couple_playoff_state set status='complete',champion=chosen,version=version+1 where id;
 else update public.couple_playoff_state set active_round=active_round+1,status='waiting',version=version+1 where id;end if;
end;$$;
revoke all on function public.get_couple_playoff() from public;
grant execute on function public.get_couple_playoff() to anon,authenticated;
revoke all on function public.save_couple_playoff_ballot(jsonb,integer),public.open_couple_playoff_round(integer),public.finish_couple_playoff_round(integer,jsonb) from public,anon;
grant execute on function public.save_couple_playoff_ballot(jsonb,integer),public.open_couple_playoff_round(integer),public.finish_couple_playoff_round(integer,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
