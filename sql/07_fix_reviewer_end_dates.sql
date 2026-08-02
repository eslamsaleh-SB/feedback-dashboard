-- v59: repair rows where end_date < start_date (v59.0 same-day-close bug).
-- Clamp end_date up to start_date so the row represents a 1-day assignment.

update public.collector_reviewer_assignments
   set end_date = start_date
 where end_date is not null
   and end_date < start_date;

-- Prevent it happening again.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'cra_end_after_start'
  ) then
    alter table public.collector_reviewer_assignments
      add constraint cra_end_after_start
      check (end_date is null or end_date >= start_date);
  end if;
end$$;

select 'reviewer end dates repaired' as status;
