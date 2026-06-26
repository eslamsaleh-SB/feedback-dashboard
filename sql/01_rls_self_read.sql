-- =============================================================================
-- STEP 1 — RUN BEFORE DEPLOYING THE CODE CHANGES
-- =============================================================================
-- Let collectors read THEIR OWN feedback rows on the canonical tables.
-- (Previously they only read feedback_meetings; we are retiring that table.)
--
-- These policies are ADDITIVE: existing admin/uploader/etc. RLS policies still
-- apply unchanged.

-- feedback_attendees: a collector can see their own attendee rows.
drop policy if exists fa_select_self on public.feedback_attendees;
create policy fa_select_self on public.feedback_attendees
  for select using (
    public.current_role() in
      ('Admin','Uploader','Supervisor','QualityLeader','TeamLeader')
    or hr_code = public.my_hr_code()
  );

-- feedback_reservations: a collector can see a reservation iff they're listed
-- as an attendee on it.
drop policy if exists fr_select_self on public.feedback_reservations;
create policy fr_select_self on public.feedback_reservations
  for select using (
    public.current_role() in
      ('Admin','Uploader','Supervisor','QualityLeader','TeamLeader')
    or exists (
      select 1 from public.feedback_attendees a
      where a.reservation_id = feedback_reservations.id
        and a.hr_code = public.my_hr_code()
    )
  );
