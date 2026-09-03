-- v59 seed: swap/absentee-swap rows from image → Attended with reason comment.
-- Ensures the reservation exists, then upserts each attendee (Attended + comment).
begin;
with new_res as (
  insert into public.feedback_reservations
    (session_date, session_time, shift, mode, is_group, location, meet_link, duration_minutes, topic)
  select v.session_date, v.session_time, v.shift, 'Offline'::text, v.is_group, v.location, null, 60, 'General Topic'
  from (values
    ('2026-08-25'::date, '14:00:00'::time, 'Morning', false, 'Maadi'),
    ('2026-08-25'::date, '11:00:00'::time, 'Morning', false, 'Maadi'),
    ('2026-08-27'::date, '20:00:00'::time, 'Overnight', true, 'Hassan Ma''moun'),
    ('2026-08-29'::date, '01:00:00'::time, 'Overnight', false, 'Hassan Ma''moun'),
    ('2026-08-29'::date, '03:00:00'::time, 'Overnight', false, 'Hassan Ma''moun')
  ) as v(session_date, session_time, shift, is_group, location)
  where not exists (select 1 from public.feedback_reservations r
    where r.session_date=v.session_date
      and coalesce(r.session_time::text,'')=v.session_time::text
      and coalesce(r.shift,'')=v.shift and coalesce(r.location,'')=v.location and r.mode='Offline')
  returning id, session_date, session_time, shift, location
),
all_res as (
  select id, session_date, session_time, shift, location from new_res
  union all
  select r.id, r.session_date, r.session_time, r.shift, r.location
  from public.feedback_reservations r
  where (r.session_date, coalesce(r.session_time::text,''), coalesce(r.shift,''), coalesce(r.location,''), r.mode) in (
    ('2026-08-25'::date, '14:00:00', 'Morning', 'Maadi', 'Offline'),
    ('2026-08-25'::date, '11:00:00', 'Morning', 'Maadi', 'Offline'),
    ('2026-08-27'::date, '20:00:00', 'Overnight', 'Hassan Ma''moun', 'Offline'),
    ('2026-08-29'::date, '01:00:00', 'Overnight', 'Hassan Ma''moun', 'Offline'),
    ('2026-08-29'::date, '03:00:00', 'Overnight', 'Hassan Ma''moun', 'Offline')
  )
),
payload(session_date, session_time, shift, location, hr_code, comment) as ( values
    ('2026-08-25'::date, '14:00:00'::time, 'Morning', 'Maadi', 'A-1518', 'حضر الساعة 11 يوم السبت 29'),
    ('2026-08-25'::date, '11:00:00'::time, 'Morning', 'Maadi', 'A-1654', 'حضر يوم الثلاث 25/8/2026'),
    ('2026-08-27'::date, '20:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-1452', 'Mostafa Saed Abas A-1650'),
    ('2026-08-27'::date, '20:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-2572', 'هيحضر مكانه AM 1:00:00 يوم 8/29/2026'),
    ('2026-08-29'::date, '01:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-2570', 'هيحضر مكانه PM 8:00 يوم 8/27/2026'),
    ('2026-08-29'::date, '03:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-1650', 'A-1452  Ahmed Mahmoud Damrani')
),
joined as (
  select r.id as reservation_id, p.hr_code, p.comment
  from payload p join all_res r
    on r.session_date=p.session_date
   and coalesce(r.session_time::text,'')=p.session_time::text
   and coalesce(r.shift,'')=p.shift and coalesce(r.location,'')=p.location
)
insert into public.feedback_attendees (reservation_id, hr_code, attendance, comment)
select reservation_id, hr_code, 'Attended', comment from joined
on conflict do nothing;
-- Also flip pre-existing attendee rows on the same (reservation, hr_code) to Attended + reason.
update public.feedback_attendees fa set attendance='Attended', comment=j.comment
from (
  select r.id as reservation_id, p.hr_code, p.comment from (values
    ('2026-08-25'::date, '14:00:00'::time, 'Morning', 'Maadi', 'A-1518', 'حضر الساعة 11 يوم السبت 29'),
    ('2026-08-25'::date, '11:00:00'::time, 'Morning', 'Maadi', 'A-1654', 'حضر يوم الثلاث 25/8/2026'),
    ('2026-08-27'::date, '20:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-1452', 'Mostafa Saed Abas A-1650'),
    ('2026-08-27'::date, '20:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-2572', 'هيحضر مكانه AM 1:00:00 يوم 8/29/2026'),
    ('2026-08-29'::date, '01:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-2570', 'هيحضر مكانه PM 8:00 يوم 8/27/2026'),
    ('2026-08-29'::date, '03:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-1650', 'A-1452  Ahmed Mahmoud Damrani')
  ) as p(session_date, session_time, shift, location, hr_code, comment)
  join public.feedback_reservations r
    on r.session_date=p.session_date
   and coalesce(r.session_time::text,'')=p.session_time::text
   and coalesce(r.shift,'')=p.shift and coalesce(r.location,'')=p.location and r.mode='Offline'
) j where fa.reservation_id=j.reservation_id and fa.hr_code=j.hr_code;
commit;
