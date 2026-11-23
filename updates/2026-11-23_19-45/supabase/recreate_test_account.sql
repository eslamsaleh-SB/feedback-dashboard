-- =============================================================
-- Re-create the test login  eslamsalaharqam@gmail.com  in team "Test Squad".
-- Run in: Supabase Dashboard > SQL Editor ("Run query" if it warns about auth rows).
--
-- EDIT THE ONE ROW BELOW if needed: (hr_code, name, team, title, email)
--   hr_code A-B001 is taken from supabase/DIAGNOSE_v11.sql (same email) - confirm it.
-- Password after running:  Feedback123   (same as the other accounts)
-- Safe to re-run: skips an email / HR code that already has an account.
-- =============================================================

set search_path = public, extensions;
create extension if not exists pgcrypto;

alter table public.collectors add column if not exists team  text;
alter table public.collectors add column if not exists title text;
alter table public.profiles   add column if not exists team  text;
alter table public.profiles   add column if not exists title text;

drop table if exists _import;
create temp table _import (hr_code text, name text, team text, title text, email text);
insert into _import (hr_code, name, team, title, email) values
('A-B001','Eslam Salah','Test Squad','DC','eslamsalaharqam@gmail.com');

-- Rows that still need an account
drop table if exists _new;
create temp table _new as
select gen_random_uuid() as id, i.hr_code, i.name, i.team, i.title, lower(i.email) as email
from _import i
where not exists (select 1 from auth.users u where lower(u.email) = lower(i.email))
  and not exists (select 1 from public.profiles p
                  where public.norm_hr(p.hr_code) = public.norm_hr(i.hr_code));

-- Auth user (the handle_new_user() trigger creates the profile + collector link)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, reauthentication_token, phone_change, phone_change_token,
  email_change_confirm_status, is_sso_user, is_anonymous
)
select
  '00000000-0000-0000-0000-000000000000', n.id, 'authenticated', 'authenticated', n.email,
  crypt('Feedback123', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('hr_code', n.hr_code, 'full_name', n.name,
                     'team', n.team, 'title', n.title, 'email_verified', true),
  '', '', '', '',
  '', '', '', '',
  0, false, false
from _new n;

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), n.id, n.id::text,
  jsonb_build_object('sub', n.id::text, 'email', n.email),
  'email', now(), now(), now()
from _new n;

-- Directory + profile: name / team / title
update public.collectors c set name = i.name, team = i.team, title = i.title
from _import i
where public.norm_hr(c.hr_code) = public.norm_hr(i.hr_code);

update public.profiles p set team = i.team, title = i.title,
       full_name = coalesce(nullif(p.full_name, ''), i.name)
from _import i
where lower(p.email) = lower(i.email);

-- Verify (expect 1 row with team = Test Squad)
select pr.email, pr.role, pr.team, pr.hr_code, c.name as collector_name, c.team as collector_team
from public.profiles pr
left join public.collectors c on c.id = pr.collector_id
where lower(pr.email) = 'eslamsalaharqam@gmail.com';
