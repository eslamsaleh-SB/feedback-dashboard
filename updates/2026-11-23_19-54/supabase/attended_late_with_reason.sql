-- Every late attendance per collector (date + reason if written).
-- Run in Supabase > SQL Editor, then click "Download CSV" on the result.
select
  upper(trim(fa.hr_code))                                         as hr_code,
  nullif(trim(concat_ws(' ', u.first_name, u.last_name)), '')     as collector_name,
  u.squad,
  fr.session_date,
  fr.session_time,
  fr.shift,
  fr.mode,
  fa.attendance,
  nullif(trim(fa.comment), '')                                    as reason
from public.feedback_attendees fa
join public.feedback_reservations fr on fr.id = fa.reservation_id
left join public.users u on upper(trim(u.hr_code)) = upper(trim(fa.hr_code))
where fa.attendance = 'Attended Late'
order by upper(trim(fa.hr_code)), fr.session_date, fr.session_time;
