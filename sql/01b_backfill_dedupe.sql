-- v56c backfill (defensive) - only touches legacy columns that actually exist.
-- Handles any mix of team, title, full_name being present or absent.

do $$
declare
  has_team      boolean;
  has_title     boolean;
  has_fullname  boolean;
  sql_upd       text;
begin
  select exists(select 1 from information_schema.columns
                where table_schema='public' and table_name='users' and column_name='team')
    into has_team;
  select exists(select 1 from information_schema.columns
                where table_schema='public' and table_name='users' and column_name='title')
    into has_title;
  select exists(select 1 from information_schema.columns
                where table_schema='public' and table_name='users' and column_name='full_name')
    into has_fullname;

  sql_upd := 'update public.users set ';
  if has_team then
    sql_upd := sql_upd || ' squad = coalesce(nullif(trim(squad), ''''), team),';
  end if;
  if has_title then
    sql_upd := sql_upd || ' job_title = coalesce(nullif(trim(job_title), ''''), title),';
  end if;
  if has_fullname then
    sql_upd := sql_upd ||
      ' first_name = coalesce(nullif(trim(first_name), ''''), nullif(split_part(coalesce(full_name, ''''), '' '', 1), '''')),' ||
      ' last_name = coalesce(nullif(trim(last_name), ''''), nullif(trim(substr(coalesce(full_name, ''''), length(split_part(coalesce(full_name, ''''), '' '', 1)) + 2)), '''')),';
  end if;

  if sql_upd = 'update public.users set ' then
    raise notice 'No legacy columns (team / title / full_name) found. Nothing to backfill.';
  else
    -- strip trailing comma + space
    sql_upd := left(sql_upd, length(sql_upd) - 1);
    raise notice 'Running backfill: %', sql_upd;
    execute sql_upd;
  end if;

  if has_team      then execute 'alter table public.users drop column team      cascade'; end if;
  if has_title     then execute 'alter table public.users drop column title     cascade'; end if;
  if has_fullname  then execute 'alter table public.users drop column full_name cascade'; end if;
end$$;
