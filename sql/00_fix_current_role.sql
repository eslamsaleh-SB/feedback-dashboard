-- v56c hotfix - current_role() still queries public.profiles which was renamed
-- to public.users. Every write on users (or any table with an RLS that calls
-- current_role) fails with 42P01 until this is applied.
--
-- Run this FIRST, before anything else in v56.

create or replace function public.current_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

-- Also patch the sibling helpers if they still reference profiles.
create or replace function public.is_reviewer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid()
      and role in ('Admin'::user_role, 'Uploader'::user_role, 'Supervisor'::user_role)
  );
$$;

create or replace function public.my_hr_code()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select hr_code from public.users where id = auth.uid();
$$;
