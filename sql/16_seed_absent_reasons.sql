-- v59: Absent seed. Duration=60, Topic='General Topic', attendance=Absent, comment=reason.
begin;
with new_res as (
  insert into public.feedback_reservations
    (session_date, session_time, shift, mode, is_group, location, meet_link, duration_minutes, topic)
  select v.session_date, v.session_time, v.shift, 'Offline'::text, v.is_group, v.location, null, 60, 'General Topic'
  from (values
    ('2026-08-25'::date, '01:00:00'::time, 'Overnight', false, 'Hassan Ma''moun'),
    ('2026-08-25'::date, '18:00:00'::time, 'Night', true, 'Maadi'),
    ('2026-08-26'::date, '01:00:00'::time, 'Overnight', true, 'Hassan Ma''moun'),
    ('2026-08-27'::date, '03:00:00'::time, 'Overnight', true, 'Hassan Ma''moun'),
    ('2026-08-27'::date, '20:00:00'::time, 'Overnight', true, 'Hassan Ma''moun'),
    ('2026-08-29'::date, '01:00:00'::time, 'Overnight', true, 'Hassan Ma''moun'),
    ('2026-08-29'::date, '11:00:00'::time, 'Morning', false, 'Hassan Ma''moun'),
    ('2026-08-29'::date, '16:00:00'::time, 'Morning', false, 'Hassan Ma''moun'),
    ('2026-08-29'::date, '16:00:00'::time, 'Night', true, 'Hassan Ma''moun'),
    ('2026-08-29'::date, '15:00:00'::time, 'Overnight', false, 'Hassan Ma''moun')
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
    ('2026-08-25'::date, '01:00:00', 'Overnight', 'Hassan Ma''moun', 'Offline'),
    ('2026-08-25'::date, '18:00:00', 'Night', 'Maadi', 'Offline'),
    ('2026-08-26'::date, '01:00:00', 'Overnight', 'Hassan Ma''moun', 'Offline'),
    ('2026-08-27'::date, '03:00:00', 'Overnight', 'Hassan Ma''moun', 'Offline'),
    ('2026-08-27'::date, '20:00:00', 'Overnight', 'Hassan Ma''moun', 'Offline'),
    ('2026-08-29'::date, '01:00:00', 'Overnight', 'Hassan Ma''moun', 'Offline'),
    ('2026-08-29'::date, '11:00:00', 'Morning', 'Hassan Ma''moun', 'Offline'),
    ('2026-08-29'::date, '16:00:00', 'Morning', 'Hassan Ma''moun', 'Offline'),
    ('2026-08-29'::date, '16:00:00', 'Night', 'Hassan Ma''moun', 'Offline'),
    ('2026-08-29'::date, '15:00:00', 'Overnight', 'Hassan Ma''moun', 'Offline')
  )
),
payload(session_date, session_time, shift, location, hr_code, comment) as (
  values
    ('2026-08-25'::date, '01:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-1458', 'He arrived late 2:10 PM.'),
    ('2026-08-25'::date, '18:00:00'::time, 'Night', 'Maadi', 'A-2119', 'He goes to Hassan Ma''moun instead of Maadi.'),
    ('2026-08-25'::date, '18:00:00'::time, 'Night', 'Maadi', 'A-2123', 'He goes to Hassan Ma''moun instead of Maadi.'),
    ('2026-08-26'::date, '01:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-2315', 'Sick'),
    ('2026-08-26'::date, '01:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-2485', 'Sick'),
    ('2026-08-27'::date, '03:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-2096', 'Sick'),
    ('2026-08-27'::date, '03:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-2085', 'accident and won''t be able to attend because of his leg injury'),
    ('2026-08-27'::date, '20:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-2170', 'He couldn''t attend due to a personal circumstance.'),
    ('2026-08-27'::date, '20:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-2571', 'He couldn''t attend due to a personal circumstance.'),
    ('2026-08-29'::date, '01:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-2125', 'He couldn''t attend due to a personal circumstance.'),
    ('2026-08-29'::date, '01:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-1789', 'Sick'),
    ('2026-08-29'::date, '01:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-2567', 'Sick'),
    ('2026-08-29'::date, '11:00:00'::time, 'Morning', 'Hassan Ma''moun', 'A-2198', 'Sick'),
    ('2026-08-29'::date, '16:00:00'::time, 'Morning', 'Hassan Ma''moun', 'A-1845', 'He didn''t attend without any reason.'),
    ('2026-08-29'::date, '16:00:00'::time, 'Night', 'Hassan Ma''moun', 'A-2098', 'He arrived late.'),
    ('2026-08-29'::date, '16:00:00'::time, 'Night', 'Hassan Ma''moun', 'A-1656', 'He arrived late.'),
    ('2026-08-29'::date, '15:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-1681', 'He couldn''t attend due to a personal circumstance.')
),
joined as (
  select r.id as reservation_id, p.hr_code, p.comment
  from payload p join all_res r
    on r.session_date=p.session_date
   and coalesce(r.session_time::text,'')=p.session_time::text
   and coalesce(r.shift,'')=p.shift and coalesce(r.location,'')=p.location
)
insert into public.feedback_attendees (reservation_id, hr_code, attendance, comment)
select reservation_id, hr_code, 'Absent', comment from joined j
where not exists (select 1 from public.feedback_attendees fa
  where fa.reservation_id=j.reservation_id and fa.hr_code=j.hr_code)
on conflict do nothing;
update public.feedback_attendees fa
set attendance='Absent', comment=j.comment
from (
  select r.id as reservation_id, p.hr_code, p.comment
  from (values
    ('2026-08-25'::date, '01:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-1458', 'He arrived late 2:10 PM.'),
    ('2026-08-25'::date, '18:00:00'::time, 'Night', 'Maadi', 'A-2119', 'He goes to Hassan Ma''moun instead of Maadi.'),
    ('2026-08-25'::date, '18:00:00'::time, 'Night', 'Maadi', 'A-2123', 'He goes to Hassan Ma''moun instead of Maadi.'),
    ('2026-08-26'::date, '01:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-2315', 'Sick'),
    ('2026-08-26'::date, '01:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-2485', 'Sick'),
    ('2026-08-27'::date, '03:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-2096', 'Sick'),
    ('2026-08-27'::date, '03:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-2085', 'accident and won''t be able to attend because of his leg injury'),
    ('2026-08-27'::date, '20:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-2170', 'He couldn''t attend due to a personal circumstance.'),
    ('2026-08-27'::date, '20:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-2571', 'He couldn''t attend due to a personal circumstance.'),
    ('2026-08-29'::date, '01:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-2125', 'He couldn''t attend due to a personal circumstance.'),
    ('2026-08-29'::date, '01:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-1789', 'Sick'),
    ('2026-08-29'::date, '01:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-2567', 'Sick'),
    ('2026-08-29'::date, '11:00:00'::time, 'Morning', 'Hassan Ma''moun', 'A-2198', 'Sick'),
    ('2026-08-29'::date, '16:00:00'::time, 'Morning', 'Hassan Ma''moun', 'A-1845', 'He didn''t attend without any reason.'),
    ('2026-08-29'::date, '16:00:00'::time, 'Night', 'Hassan Ma''moun', 'A-2098', 'He arrived late.'),
    ('2026-08-29'::date, '16:00:00'::time, 'Night', 'Hassan Ma''moun', 'A-1656', 'He arrived late.'),
    ('2026-08-29'::date, '15:00:00'::time, 'Overnight', 'Hassan Ma''moun', 'A-1681', 'He couldn''t attend due to a personal circumstance.')
  ) as p(session_date, session_time, shift, location, hr_code, comment)
  join public.feedback_reservations r
    on r.session_date=p.session_date
   and coalesce(r.session_time::text,'')=p.session_time::text
   and coalesce(r.shift,'')=p.shift and coalesce(r.location,'')=p.location and r.mode='Offline'
) j
where fa.reservation_id=j.reservation_id and fa.hr_code=j.hr_code;
commit;
