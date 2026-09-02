-- v59: per-session duration + free-text topic on feedback bookings.
alter table public.feedback_reservations
  add column if not exists duration_minutes integer,
  add column if not exists topic text;
select 'feedback_reservations.duration_minutes + topic added' as status;
