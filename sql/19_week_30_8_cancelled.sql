-- v59: Week 30-8 → cancelled sessions.
-- location assumed = Hassan Ma'moun (file has no Building column).
-- duration=60, topic='General Topic', attendance='Cancelled', comment=reason.
begin;
with new_res as (
  insert into public.feedback_reservations
    (session_date, session_time, shift, mode, is_group, location, meet_link, duration_minutes, topic)
  select v.session_date, v.session_time, v.shift, 'Offline', v.is_group, 'Hassan Ma''moun', null, 60, 'General Topic'
  from (values
    ('2026-09-05'::date, '00:00:00', 'Overnight', true),
    ('2026-09-01'::date, '00:00:00', 'Overnight', true),
    ('2026-09-03'::date, '00:00:00', 'Overnight', true),
    ('2026-09-01'::date, '02:00:00', 'Overnight', true),
    ('2026-09-04'::date, '02:00:00', 'Overnight', false),
    ('2026-09-03'::date, '02:00:00', 'Overnight', true),
    ('2026-09-01'::date, '11:00:00', 'Morning', true),
    ('2026-08-31'::date, '11:00:00', 'Morning', false),
    ('2026-09-02'::date, '11:00:00', 'Morning', false),
    ('2026-09-01'::date, '17:00:00', 'Morning', false),
    ('2026-09-01'::date, '17:00:00', 'Night', true),
    ('2026-09-02'::date, '17:00:00', 'Morning', true),
    ('2026-09-05'::date, '22:00:00', 'Overnight', true)
  ) as v(session_date, session_time, shift, is_group)
  where not exists (select 1 from public.feedback_reservations r
    where r.session_date=v.session_date
      and coalesce(r.session_time,'')=v.session_time
      and coalesce(r.shift,'')=v.shift and coalesce(r.location,'')='Hassan Ma''moun' and r.mode='Offline')
  returning id, session_date, session_time, shift, location
),
all_res as (
  select id, session_date, session_time, shift, location from new_res
  union all
  select r.id, r.session_date, r.session_time, r.shift, r.location
  from public.feedback_reservations r
  where (r.session_date, coalesce(r.session_time,''), coalesce(r.shift,''), coalesce(r.location,''), r.mode) in (
    ('2026-09-05'::date, '00:00:00', 'Overnight', 'Hassan Ma''moun', 'Offline'),
    ('2026-09-01'::date, '00:00:00', 'Overnight', 'Hassan Ma''moun', 'Offline'),
    ('2026-09-03'::date, '00:00:00', 'Overnight', 'Hassan Ma''moun', 'Offline'),
    ('2026-09-01'::date, '02:00:00', 'Overnight', 'Hassan Ma''moun', 'Offline'),
    ('2026-09-04'::date, '02:00:00', 'Overnight', 'Hassan Ma''moun', 'Offline'),
    ('2026-09-03'::date, '02:00:00', 'Overnight', 'Hassan Ma''moun', 'Offline'),
    ('2026-09-01'::date, '11:00:00', 'Morning', 'Hassan Ma''moun', 'Offline'),
    ('2026-08-31'::date, '11:00:00', 'Morning', 'Hassan Ma''moun', 'Offline'),
    ('2026-09-02'::date, '11:00:00', 'Morning', 'Hassan Ma''moun', 'Offline'),
    ('2026-09-01'::date, '17:00:00', 'Morning', 'Hassan Ma''moun', 'Offline'),
    ('2026-09-01'::date, '17:00:00', 'Night', 'Hassan Ma''moun', 'Offline'),
    ('2026-09-02'::date, '17:00:00', 'Morning', 'Hassan Ma''moun', 'Offline'),
    ('2026-09-05'::date, '22:00:00', 'Overnight', 'Hassan Ma''moun', 'Offline')
  )
),
payload(session_date, session_time, shift, hr_code) as ( values
    ('2026-09-05'::date, '00:00:00', 'Overnight', 'A-2170'),
    ('2026-09-05'::date, '00:00:00', 'Overnight', 'A-2483'),
    ('2026-09-05'::date, '00:00:00', 'Overnight', 'A-2486'),
    ('2026-09-01'::date, '00:00:00', 'Overnight', 'A-778'),
    ('2026-09-01'::date, '00:00:00', 'Overnight', 'A-2464'),
    ('2026-09-01'::date, '00:00:00', 'Overnight', 'A-2495'),
    ('2026-09-03'::date, '00:00:00', 'Overnight', 'A-2278'),
    ('2026-09-03'::date, '00:00:00', 'Overnight', 'A-2214'),
    ('2026-09-01'::date, '02:00:00', 'Overnight', 'A-2073'),
    ('2026-09-01'::date, '02:00:00', 'Overnight', 'A-090'),
    ('2026-09-01'::date, '02:00:00', 'Overnight', 'A-1562'),
    ('2026-09-01'::date, '02:00:00', 'Overnight', 'A-1954'),
    ('2026-09-04'::date, '02:00:00', 'Overnight', 'A-1710'),
    ('2026-09-03'::date, '02:00:00', 'Overnight', 'A-2254'),
    ('2026-09-03'::date, '02:00:00', 'Overnight', 'A-2090'),
    ('2026-09-03'::date, '02:00:00', 'Overnight', 'A-2273'),
    ('2026-09-01'::date, '11:00:00', 'Morning', 'A-2468'),
    ('2026-09-01'::date, '11:00:00', 'Morning', 'A-2493'),
    ('2026-09-01'::date, '11:00:00', 'Morning', 'A-2175'),
    ('2026-09-01'::date, '11:00:00', 'Morning', 'A-2251'),
    ('2026-09-01'::date, '11:00:00', 'Morning', 'A-562'),
    ('2026-09-01'::date, '11:00:00', 'Morning', 'A-2478'),
    ('2026-09-01'::date, '11:00:00', 'Morning', 'A-2082'),
    ('2026-08-31'::date, '11:00:00', 'Morning', 'A-2091'),
    ('2026-09-02'::date, '11:00:00', 'Morning', 'A-2291'),
    ('2026-09-01'::date, '17:00:00', 'Morning', 'A-2473'),
    ('2026-09-01'::date, '17:00:00', 'Night', 'A-2491'),
    ('2026-09-01'::date, '17:00:00', 'Night', 'A-2176'),
    ('2026-09-02'::date, '17:00:00', 'Morning', 'A-2280'),
    ('2026-09-02'::date, '17:00:00', 'Morning', 'A-2471'),
    ('2026-09-02'::date, '17:00:00', 'Morning', 'A-2492'),
    ('2026-09-02'::date, '17:00:00', 'Morning', 'A-2177'),
    ('2026-09-05'::date, '22:00:00', 'Overnight', 'A-2487'),
    ('2026-09-05'::date, '22:00:00', 'Overnight', 'A-2484'),
    ('2026-09-05'::date, '22:00:00', 'Overnight', 'A-2546'),
    ('2026-09-05'::date, '22:00:00', 'Overnight', 'A-2485'),
    ('2026-09-05'::date, '22:00:00', 'Overnight', 'A-2545')
),
joined as (
  select r.id as reservation_id, p.hr_code from payload p join all_res r
    on r.session_date=p.session_date and coalesce(r.session_time,'')=p.session_time
   and coalesce(r.shift,'')=p.shift
)
insert into public.feedback_attendees (reservation_id, hr_code, attendance, comment)
select reservation_id, hr_code, 'Cancelled', 'Mismatch between the collector''s attendance days and the session days.' from joined
on conflict do nothing;
-- Flip any pre-existing (reservation, hr_code) to Cancelled + reason.
update public.feedback_attendees fa
set attendance='Cancelled', comment='Mismatch between the collector''s attendance days and the session days.'
from (
  select r.id as reservation_id, p.hr_code from (values
    ('2026-09-05'::date, '00:00:00', 'Overnight', 'A-2170'),
    ('2026-09-05'::date, '00:00:00', 'Overnight', 'A-2483'),
    ('2026-09-05'::date, '00:00:00', 'Overnight', 'A-2486'),
    ('2026-09-01'::date, '00:00:00', 'Overnight', 'A-778'),
    ('2026-09-01'::date, '00:00:00', 'Overnight', 'A-2464'),
    ('2026-09-01'::date, '00:00:00', 'Overnight', 'A-2495'),
    ('2026-09-03'::date, '00:00:00', 'Overnight', 'A-2278'),
    ('2026-09-03'::date, '00:00:00', 'Overnight', 'A-2214'),
    ('2026-09-01'::date, '02:00:00', 'Overnight', 'A-2073'),
    ('2026-09-01'::date, '02:00:00', 'Overnight', 'A-090'),
    ('2026-09-01'::date, '02:00:00', 'Overnight', 'A-1562'),
    ('2026-09-01'::date, '02:00:00', 'Overnight', 'A-1954'),
    ('2026-09-04'::date, '02:00:00', 'Overnight', 'A-1710'),
    ('2026-09-03'::date, '02:00:00', 'Overnight', 'A-2254'),
    ('2026-09-03'::date, '02:00:00', 'Overnight', 'A-2090'),
    ('2026-09-03'::date, '02:00:00', 'Overnight', 'A-2273'),
    ('2026-09-01'::date, '11:00:00', 'Morning', 'A-2468'),
    ('2026-09-01'::date, '11:00:00', 'Morning', 'A-2493'),
    ('2026-09-01'::date, '11:00:00', 'Morning', 'A-2175'),
    ('2026-09-01'::date, '11:00:00', 'Morning', 'A-2251'),
    ('2026-09-01'::date, '11:00:00', 'Morning', 'A-562'),
    ('2026-09-01'::date, '11:00:00', 'Morning', 'A-2478'),
    ('2026-09-01'::date, '11:00:00', 'Morning', 'A-2082'),
    ('2026-08-31'::date, '11:00:00', 'Morning', 'A-2091'),
    ('2026-09-02'::date, '11:00:00', 'Morning', 'A-2291'),
    ('2026-09-01'::date, '17:00:00', 'Morning', 'A-2473'),
    ('2026-09-01'::date, '17:00:00', 'Night', 'A-2491'),
    ('2026-09-01'::date, '17:00:00', 'Night', 'A-2176'),
    ('2026-09-02'::date, '17:00:00', 'Morning', 'A-2280'),
    ('2026-09-02'::date, '17:00:00', 'Morning', 'A-2471'),
    ('2026-09-02'::date, '17:00:00', 'Morning', 'A-2492'),
    ('2026-09-02'::date, '17:00:00', 'Morning', 'A-2177'),
    ('2026-09-05'::date, '22:00:00', 'Overnight', 'A-2487'),
    ('2026-09-05'::date, '22:00:00', 'Overnight', 'A-2484'),
    ('2026-09-05'::date, '22:00:00', 'Overnight', 'A-2546'),
    ('2026-09-05'::date, '22:00:00', 'Overnight', 'A-2485'),
    ('2026-09-05'::date, '22:00:00', 'Overnight', 'A-2545')
  ) as p(session_date, session_time, shift, hr_code)
  join public.feedback_reservations r
    on r.session_date=p.session_date and coalesce(r.session_time,'')=p.session_time
   and coalesce(r.shift,'')=p.shift and coalesce(r.location,'')='Hassan Ma''moun' and r.mode='Offline'
) j where fa.reservation_id=j.reservation_id and fa.hr_code=j.hr_code;
commit;
