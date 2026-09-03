-- v59: apply swaps + moves. Clean — no comments, just Attended in the correct slot.

begin;

create or replace function public._fr_id(_d date, _t text, _sh text, _loc text)
returns uuid language sql stable as $$
  select id from public.feedback_reservations
   where session_date = _d and session_time = _t
     and shift = _sh and location = _loc and mode = 'Offline'
   limit 1;
$$;

-- Ensure target reservation for A-1518's actual attendance exists.
insert into public.feedback_reservations
  (session_date, session_time, shift, mode, is_group, location, meet_link, duration_minutes, topic)
select v.session_date, v.session_time, v.shift, 'Offline', v.is_group, v.location, null, 60, 'General Topic'
from (values
  ('2026-08-29'::date, '11:00:00', 'Morning', false, 'Maadi')
) as v(session_date, session_time, shift, is_group, location)
where not exists (
  select 1 from public.feedback_reservations r
   where r.session_date = v.session_date and r.session_time = v.session_time
     and r.shift = v.shift and r.location = v.location and r.mode = 'Offline'
);

-- A-1518: from (8/25 14:00 Morning Maadi) → (8/29 11:00 Morning Maadi), Attended.
delete from public.feedback_attendees
 where reservation_id = public._fr_id('2026-08-25','14:00:00','Morning','Maadi') and hr_code='A-1518';
insert into public.feedback_attendees (reservation_id, hr_code, attendance)
values (public._fr_id('2026-08-29','11:00:00','Morning','Maadi'), 'A-1518', 'Attended')
on conflict do nothing;
update public.feedback_attendees set attendance='Attended', comment=null
 where reservation_id = public._fr_id('2026-08-29','11:00:00','Morning','Maadi') and hr_code='A-1518';

-- A-1654: keep (8/25 11:00 Morning Maadi) as Attended.
insert into public.feedback_attendees (reservation_id, hr_code, attendance)
values (public._fr_id('2026-08-25','11:00:00','Morning','Maadi'), 'A-1654', 'Attended')
on conflict do nothing;
update public.feedback_attendees set attendance='Attended', comment=null
 where reservation_id = public._fr_id('2026-08-25','11:00:00','Morning','Maadi') and hr_code='A-1654';

-- Swap A-1452 ↔ A-1650
delete from public.feedback_attendees
 where reservation_id = public._fr_id('2026-08-27','20:00:00','Overnight','Hassan Ma''moun') and hr_code='A-1452';
insert into public.feedback_attendees (reservation_id, hr_code, attendance)
values (public._fr_id('2026-08-27','20:00:00','Overnight','Hassan Ma''moun'), 'A-1650', 'Attended')
on conflict do nothing;
update public.feedback_attendees set attendance='Attended', comment=null
 where reservation_id = public._fr_id('2026-08-27','20:00:00','Overnight','Hassan Ma''moun') and hr_code='A-1650';

delete from public.feedback_attendees
 where reservation_id = public._fr_id('2026-08-29','03:00:00','Overnight','Hassan Ma''moun') and hr_code='A-1650';
insert into public.feedback_attendees (reservation_id, hr_code, attendance)
values (public._fr_id('2026-08-29','03:00:00','Overnight','Hassan Ma''moun'), 'A-1452', 'Attended')
on conflict do nothing;
update public.feedback_attendees set attendance='Attended', comment=null
 where reservation_id = public._fr_id('2026-08-29','03:00:00','Overnight','Hassan Ma''moun') and hr_code='A-1452';

-- Swap A-2572 ↔ A-2570
delete from public.feedback_attendees
 where reservation_id = public._fr_id('2026-08-27','20:00:00','Overnight','Hassan Ma''moun') and hr_code='A-2572';
insert into public.feedback_attendees (reservation_id, hr_code, attendance)
values (public._fr_id('2026-08-27','20:00:00','Overnight','Hassan Ma''moun'), 'A-2570', 'Attended')
on conflict do nothing;
update public.feedback_attendees set attendance='Attended', comment=null
 where reservation_id = public._fr_id('2026-08-27','20:00:00','Overnight','Hassan Ma''moun') and hr_code='A-2570';

delete from public.feedback_attendees
 where reservation_id = public._fr_id('2026-08-29','01:00:00','Overnight','Hassan Ma''moun') and hr_code='A-2570';
insert into public.feedback_attendees (reservation_id, hr_code, attendance)
values (public._fr_id('2026-08-29','01:00:00','Overnight','Hassan Ma''moun'), 'A-2572', 'Attended')
on conflict do nothing;
update public.feedback_attendees set attendance='Attended', comment=null
 where reservation_id = public._fr_id('2026-08-29','01:00:00','Overnight','Hassan Ma''moun') and hr_code='A-2572';

drop function if exists public._fr_id(date, text, text, text);
commit;
