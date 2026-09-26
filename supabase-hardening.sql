-- Additional server-side protections for SLAY voting.
-- Run once in Supabase SQL Editor after the base schema.

create unique index if not exists votes_one_place_per_user_nomination
on public.votes(user_id, nomination_id, place)
where place is not null;

create or replace function public.validate_vote_shape()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    existing_count integer;
begin
    if new.nomination_id not in (
        'cs2',
        'dota2',
        'style',
        'incel',
        'charisma',
        '2008',
        'alcoholic',
        'meme',
        'anecdote',
        'situation',
        'crush',
        'tiktok',
        'idiot',
        'couple',
        'slayking'
    ) then
        raise exception 'Unknown nomination';
    end if;

    if char_length(new.participant) < 1 or char_length(new.participant) > 500 then
        raise exception 'Invalid participant';
    end if;

    if new.nomination_id = 'couple' then
        if new.place is not null then
            raise exception 'Couple nomination does not use places';
        end if;

        select count(*)
        into existing_count
        from public.votes v
        where v.user_id = new.user_id
          and v.nomination_id = new.nomination_id
          and (tg_op = 'INSERT' or v.id <> new.id);

        if existing_count >= 3 then
            raise exception 'Maximum 3 votes for couple nomination';
        end if;
    else
        if new.place is null or new.place not between 1 and 3 then
            raise exception 'Placed nomination requires place 1, 2 or 3';
        end if;
    end if;

    return new;
end;
$$;

drop trigger if exists validate_vote_shape_trigger
on public.votes;

create trigger validate_vote_shape_trigger
before insert or update on public.votes
for each row
execute procedure public.validate_vote_shape();

revoke all on function public.validate_vote_shape() from public;
