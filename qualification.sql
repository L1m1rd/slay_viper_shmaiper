-- Stage 1: separate, atomic 16-of-22 ballots. Existing votes are preserved.
begin;
create table if not exists public.award_stage (
  id boolean primary key default true check (id),
  phase text not null default 'qualification' check (phase in ('qualification','main'))
);
insert into public.award_stage(id, phase) values (true,'qualification') on conflict (id) do nothing;
create table if not exists public.couple_qualification_candidates (
  id text primary key, name text not null unique, position integer not null unique
);
insert into public.couple_qualification_candidates(id,name,position) values
('c01','Матвей и Вика',1),('c02','Матвей и Соня',2),('c03','Матвей и Полина',3),
('c04','Матвей и Карина',4),('c05','Матвей и Алина',5),('c06','Семен и Надя',6),
('c07','Арсений и Надя',7),('c08','Арсений и Арина',8),('c09','Тимур и Азалия',9),
('c10','Саша Шамбасов и Даша Таурин',10),('c11','Саша Шамбасов и Даша Дрочкова',11),
('c12','Саша Шамбасов и Маша',12),('c13','Данил и Маринка',13),('c14','Данил и Женя Данилина',14),
('c15','Вова и Жена Вадима',15),('c16','Андрей и рука',16),('c17','Шурик и серьёзка',17),
('c18','Шурик и Стеша',18),('c19','Шурик и Кира Сорокина',19),('c20','Саня Пеняев и Полина',20),
('c21','Саня Пеняев и Вика',21),('c22','Саша Шамбасов и Иванчикова',22)
on conflict (id) do nothing;
create table if not exists public.couple_qualification_ballots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  choices text[] not null check (cardinality(choices) = 16),
  updated_at timestamptz not null default now()
);
alter table public.award_stage enable row level security;
alter table public.couple_qualification_candidates enable row level security;
alter table public.couple_qualification_ballots enable row level security;
revoke all on public.award_stage, public.couple_qualification_candidates, public.couple_qualification_ballots from anon, authenticated;
grant select on public.award_stage, public.couple_qualification_candidates to anon, authenticated;
grant select on public.couple_qualification_ballots to authenticated;
create policy qualification_stage_read on public.award_stage for select to anon,authenticated using (true);
create policy qualification_candidates_read on public.couple_qualification_candidates for select to anon,authenticated using (true);
create policy qualification_ballots_read on public.couple_qualification_ballots for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create or replace function public.save_couple_qualification_ballot(selected text[])
returns void language plpgsql security definer set search_path = '' as $$
declare voter uuid := auth.uid(); active_phase text;
begin
  if voter is null or not exists (select 1 from public.profiles where id=voter and role='user' and status='approved') then
    raise exception 'Approved voter required' using errcode='42501';
  end if;
  select phase into active_phase from public.award_stage where id=true for share;
  if active_phase is distinct from 'qualification' then raise exception 'Qualification is closed'; end if;
  if selected is null or cardinality(selected) <> 16
    or (select count(distinct item) from unnest(selected) item) <> 16
    or exists (select 1 from unnest(selected) item where item is null or not exists (select 1 from public.couple_qualification_candidates c where c.id=item)) then
    raise exception 'Select exactly 16 different catalog candidates';
  end if;
  insert into public.couple_qualification_ballots(user_id,choices,updated_at) values (voter,selected,now())
    on conflict(user_id) do update set choices=excluded.choices, updated_at=excluded.updated_at;
end;
$$;
revoke all on function public.save_couple_qualification_ballot(text[]) from public, anon;
grant execute on function public.save_couple_qualification_ballot(text[]) to authenticated;

create or replace function public.enforce_award_voting_stage()
returns trigger language plpgsql security definer set search_path = '' as $$
declare active_phase text;
begin
  select phase into active_phase from public.award_stage where id=true for share;
  if active_phase is distinct from 'main' then
    raise exception 'Main voting has not opened. Use the couple qualification ballot.' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.enforce_award_voting_stage() from public;
create trigger enforce_award_voting_stage before insert or update or delete on public.votes
  for each row execute function public.enforce_award_voting_stage();
notify pgrst, 'reload schema';
commit;
