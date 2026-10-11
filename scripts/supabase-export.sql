-- Run in Supabase SQL Editor as the project owner during the write freeze.
-- Download the single JSON value and save it locally as
-- migration-private/supabase-export.json. Never commit it or paste it in chat.
begin transaction isolation level repeatable read read only;
select jsonb_build_object(
  'users', (select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'email', email, 'encrypted_password', encrypted_password,
    'email_confirmed_at', email_confirmed_at, 'created_at', created_at
  )), '[]'::jsonb) from auth.users),
  'profiles', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from public.profiles p),
  'votes', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from public.votes v)
) as export;
commit;
