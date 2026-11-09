-- Account links are set privately in Supabase; do not commit the production roster.
begin;
create table if not exists public.award_nominee_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  nominee_name text not null unique check (btrim(nominee_name) <> '')
);
alter table public.award_nominee_accounts enable row level security;
revoke all on public.award_nominee_accounts from public, anon, authenticated;
grant select on public.award_nominee_accounts to authenticated;
drop policy if exists award_nominee_account_read on public.award_nominee_accounts;
create policy award_nominee_account_read on public.award_nominee_accounts for select to authenticated
  using (user_id=auth.uid() or public.is_admin());

create or replace function public.enforce_award_no_self_vote()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.nomination_id in ('cs2','dota2','style','incel','charisma','2008','alcoholic','meme','crush','idiot','bodybuilder','fatness','slayking')
    and exists (select 1 from public.award_nominee_accounts a where a.user_id=new.user_id
      and replace(lower(regexp_replace(btrim(a.nominee_name),'[[:space:]]+',' ','g')),'ё','е')
        = replace(lower(regexp_replace(btrim(new.participant),'[[:space:]]+',' ','g')),'ё','е')) then
    raise exception 'AWARD_SELF_VOTE_FORBIDDEN' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_award_no_self_vote() from public, anon, authenticated;
drop trigger if exists enforce_award_no_self_vote on public.votes;
create trigger enforce_award_no_self_vote before insert or update on public.votes
  for each row execute function public.enforce_award_no_self_vote();
notify pgrst, 'reload schema';
commit;

