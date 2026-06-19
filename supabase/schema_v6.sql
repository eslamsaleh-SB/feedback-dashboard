-- =============================================================
-- VIDEO FEEDBACK DASHBOARD — v6 migration
-- Self-service signup linked to a collector by HR code.
--
-- Run this in: Supabase Dashboard > SQL Editor (after schema_v5.sql).
--
-- Behaviour:
--   * A new user signs up with their HR code.
--   * The signup trigger trims the code, ensures a collector row exists for
--     it, and links the new profile to that collector (role = Viewer).
--   * One account per HR code is enforced (unique index + trigger check).
--   * Once linked, Row Level Security (my_hr_code) shows the user only their
--     own match parts and mistakes.
-- =============================================================

-- ---------- 1. profiles get an HR code (one account per code) ----------
alter table public.profiles
  add column if not exists hr_code text;

-- Unique for non-null codes; multiple admins/uploaders without a code are OK.
create unique index if not exists profiles_hr_code_key
  on public.profiles (hr_code)
  where hr_code is not null;

-- ---------- 2. Availability check (callable before signup, anon) ----------
-- Returns true when the (trimmed) HR code is NOT yet tied to an account.
create or replace function public.hr_code_available(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.profiles
    where hr_code = nullif(trim(p_code), '')
  );
$$;

grant execute on function public.hr_code_available(text) to anon, authenticated;

-- ---------- 3. Signup trigger: link the new account by HR code ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_hr  text := nullif(trim(new.raw_user_meta_data->>'hr_code'), '');
  v_cid uuid;
begin
  -- Base profile (everyone starts as Viewer).
  insert into public.profiles (id, full_name, email, role)
  values (new.id, new.raw_user_meta_data->>'full_name', new.email, 'Viewer')
  on conflict (id) do update set email = excluded.email;

  if v_hr is not null then
    -- Reject a second account for an HR code that's already registered.
    if exists (
      select 1 from public.profiles where hr_code = v_hr and id <> new.id
    ) then
      raise exception 'HR code % is already registered to another account', v_hr
        using errcode = 'unique_violation';
    end if;

    -- Ensure a collector exists for this HR code (placeholder name = code).
    insert into public.collectors (hr_code, name)
    values (v_hr, v_hr)
    on conflict (hr_code) do nothing;

    select id into v_cid from public.collectors where hr_code = v_hr;

    -- Link the profile to that collector.
    update public.profiles
    set hr_code = v_hr, collector_id = v_cid
    where id = new.id;
  end if;

  return new;
end;
$$;

-- (Trigger on_auth_user_created already calls handle_new_user from earlier
--  migrations; recreating the function above is enough.)

-- =============================================================
-- 4. (Optional) Backfill: link EXISTING accounts whose email/name already
--    matches a known HR code. Skipped by default — do manually if needed.
-- =============================================================
