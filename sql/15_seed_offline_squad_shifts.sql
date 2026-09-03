-- Offline Squad Shifts seed (v2: location normalized to Hassan Ma'moun / Maadi / Mahmoud El-Badry).
begin;
with new_res as (
  insert into public.feedback_reservations
    (session_date, session_time, shift, mode, is_group, location, meet_link, duration_minutes, topic)
  select v.session_date, v.session_time, v.shift, 'Offline'::text, v.is_group, v.location, null, 60, 'General Session'
  from (values
    ('2026-08-25'::date, '01:00:00'::time, 'Overnight', true, 'Hassan Ma''moun'),
    ('2026-08-25'::date, '11:00:00'::time, 'Morning', true, 'Maadi'),
    ('2026-08-25'::date, '14:00:00'::time, 'Night', true, 'Maadi'),
    ('2026-08-25'::date, '14:00:00'::time, 'Morning', true, 'Maadi'),
    ('2026-08-25'::date, '18:00:00'::time, 'Morning', false, 'Maadi'),
    ('2026-08-25'::date, '18:00:00'::time, 'Night', true, 'Maadi'),
    ('2026-08-25'::date, '18:00:00'::time, 'Overnight', false, 'Maadi'),
    ('2026-08-26'::date, '01:00:00'::time, 'Overnight', true, 'Hassan Ma''moun'),
    ('2026-08-26'::date, '11:00:00'::time, 'Morning', true, 'Maadi'),
    ('2026-08-27'::date, '01:00:00'::time, 'Night', false, 'Hassan Ma''moun'),
    ('2026-08-27'::date, '01:00:00'::time, 'Overnight', true, 'Hassan Ma''moun'),
    ('2026-08-27'::date, '03:00:00'::time, 'Overnight', true, 'Hassan Ma''moun'),
    ('2026-08-27'::date, '20:00:00'::time, 'Overnight', true, 'Hassan Ma''moun'),
    ('2026-08-27'::date, '20:00:00'::time, 'Morning', false, 'Hassan Ma''moun'),
    ('2026-08-29'::date, '01:00:00'::time, 'Overnight', true, 'Hassan Ma''moun'),
    ('2026-08-29'::date, '11:00:00'::time, 'Morning', true, 'Hassan Ma''moun'),
    ('2026-08-29'::date, '16:00:00'::time, 'Morning', true, 'Hassan Ma''moun'),
    ('2026-08-29'::date, '16:00:00'::time, 'Night', true, 'Hassan Ma''moun'),
    ('2026-08-29'::date, '03:00:00'::time, 'Overnight', true, 'Hassan Ma''moun')
  ) as v(session_date, session_time, shift, is_group, location)
  where not exists (select 1 from public.feedback_reservations r
    where r.session_date=v.session_date
      and coalesce(r.session_time::text,'')=coalesce(v.session_time::text,'')
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
    ('2026-08-25'::date, '11:00:00', 'Morning', 'Maadi', 'Offline'),
    ('2026-08-25'::date, '14:00:00', 'Night', 'Maadi', 'Offline'),
    ('2026-08-25'::date, '14:00:00', 'Morning', 'Maadi', 'Offline'),
    ('2026-08-25'::date, '18:00:00', 'Morning', 'Maadi', 'Offline'),
    ('2026-08-25'::date, '18:00:00', 'Night', 'Maadi', 'Offline'),
    ('2026-08-25'::date, '18:00:00', 'Overnight', 'Maadi', 'Offline'),
    ('2026-08-26'::date, '01:00:00', 'Overnight', 'Hassan Ma''moun', 'Offline'),
    ('2026-08-26'::date, '11:00:00', 'Morning', 'Maadi', 'Offline'),
    ('2026-08-27'::date, '01:00:00', 'Night', 'Hassan Ma''moun', 'Offline'),
    ('2026-08-27'::date, '01:00:00', 'Overnight', 'Hassan Ma''moun', 'Offline'),
    ('2026-08-27'::date, '03:00:00', 'Overnight', 'Hassan Ma''moun', 'Offline'),
    ('2026-08-27'::date, '20:00:00', 'Overnight', 'Hassan Ma''moun', 'Offline'),
    ('2026-08-27'::date, '20:00:00', 'Morning', 'Hassan Ma''moun', 'Offline'),
    ('2026-08-29'::date, '01:00:00', 'Overnight', 'Hassan Ma''moun', 'Offline'),
    ('2026-08-29'::date, '11:00:00', 'Morning', 'Hassan Ma''moun', 'Offline'),
    ('2026-08-29'::date, '16:00:00', 'Morning', 'Hassan Ma''moun', 'Offline'),
    ('2026-08-29'::date, '16:00:00', 'Night', 'Hassan Ma''moun', 'Offline'),
    ('2026-08-29'::date, '03:00:00', 'Overnight', 'Hassan Ma''moun', 'Offline')
  )
),
payload as (
  select r.id as reservation_id, unnest(a.codes) as hr_code
  from all_res r
  join (values
    ('2026-08-25'::date, '01:00:00', 'Overnight', 'Hassan Ma''moun', array['A-1725','A-778','A-1846','A-1453','A-950','A-1266','A-1012','A-2073','A-1546','A-090','A-1443','A-073','A-1742','A-1557','A-1710']::text[]),
    ('2026-08-25'::date, '11:00:00', 'Morning', 'Maadi', array['A-1455','A-2082','A-2127','A-1820','A-2104','A-2283','A-2478','A-1352','A-2093','A-1720','A-2102','A-2075','A-1716','A-310','A-1749']::text[]),
    ('2026-08-25'::date, '14:00:00', 'Night', 'Maadi', array['A-564','A-165','A-1743']::text[]),
    ('2026-08-25'::date, '14:00:00', 'Morning', 'Maadi', array['A-562','A-1646']::text[]),
    ('2026-08-25'::date, '18:00:00', 'Morning', 'Maadi', array['A-997']::text[]),
    ('2026-08-25'::date, '18:00:00', 'Night', 'Maadi', array['A-1571','A-1623','A-1401','A-1678','A-1153','A-1169']::text[]),
    ('2026-08-25'::date, '18:00:00', 'Overnight', 'Maadi', array['A-1715']::text[]),
    ('2026-08-26'::date, '01:00:00', 'Overnight', 'Hassan Ma''moun', array['A-2262','A-2309','A-2483','A-2484','A-2486','A-2487','A-2488','A-794','A-2496','A-2497','A-2092']::text[]),
    ('2026-08-26'::date, '11:00:00', 'Morning', 'Maadi', array['A-1521','A-240','A-1840','A-1673','A-1154','A-1444','A-1307','A-1661','A-1816','A-1516','A-2182','A-770']::text[]),
    ('2026-08-27'::date, '01:00:00', 'Night', 'Hassan Ma''moun', array['A-1736']::text[]),
    ('2026-08-27'::date, '01:00:00', 'Overnight', 'Hassan Ma''moun', array['A-1629','A-1703','A-1778','A-1798','A-105','A-2083']::text[]),
    ('2026-08-27'::date, '03:00:00', 'Overnight', 'Hassan Ma''moun', array['A-1813','A-2090','A-703','A-1659','A-1669','A-1805','A-1630','A-1959','A-1961','A-1964','A-2459','A-2462','A-2498']::text[]),
    ('2026-08-27'::date, '20:00:00', 'Overnight', 'Hassan Ma''moun', array['A-2099','A-645','A-1365','A-2117','A-2562','A-2563','A-2565','A-2573','A-1814','A-1744']::text[]),
    ('2026-08-27'::date, '20:00:00', 'Morning', 'Hassan Ma''moun', array['A-2121']::text[]),
    ('2026-08-29'::date, '01:00:00', 'Overnight', 'Hassan Ma''moun', array['A-1738','A-1722','A-1849','A-1793','A-1777','A-1569','A-1657','A-2110','A-1718','A-2564','A-2566','A-2568','A-2569']::text[]),
    ('2026-08-29'::date, '11:00:00', 'Morning', 'Hassan Ma''moun', array['A-2244','A-2471','A-2479','A-2492','A-2532','A-2547','A-2548','A-1768','A-2280','A-2136','A-2068','A-2115','A-2072']::text[]),
    ('2026-08-29'::date, '16:00:00', 'Morning', 'Hassan Ma''moun', array['A-2101','A-1791','A-1635','A-1667','A-1618','A-1731','A-1802','A-2107','A-1338','A-1648']::text[]),
    ('2026-08-29'::date, '16:00:00', 'Night', 'Hassan Ma''moun', array['A-1719','A-1828','A-1727','A-1519','A-1651']::text[]),
    ('2026-08-29'::date, '03:00:00', 'Overnight', 'Hassan Ma''moun', array['A-1737','A-1620','A-1644','A-1666','A-2544','A-2545','A-2546','A-2538','A-2554','A-2556','A-2200','A-2445','A-1832','A-1812','A-1382']::text[])
  ) as a(session_date, session_time, shift, location, codes)
    on a.session_date=r.session_date
   and coalesce(r.session_time::text,'')=a.session_time
   and coalesce(r.shift,'')=a.shift and coalesce(r.location,'')=a.location
)
insert into public.feedback_attendees (reservation_id, hr_code, attendance)
select p.reservation_id, p.hr_code, 'Attended' from payload p
where not exists (select 1 from public.feedback_attendees fa
  where fa.reservation_id=p.reservation_id and fa.hr_code=p.hr_code);
commit;
