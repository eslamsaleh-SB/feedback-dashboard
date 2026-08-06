-- v59: Additive SELECT policies for OCTeamLeader on base_events + extras_events.
-- Run this AFTER 11_add_oc_team_leader_role.sql has been committed in its
-- own query (Postgres 55P04 otherwise).

drop policy if exists be_octl_team on public.base_events;
create policy be_octl_team on public.base_events for select using (
  exists (
    select 1
    from public.users me
    join public.users c on c.hr_code = public.base_events.hr_code
    where me.id = auth.uid()
      and me.role = 'OCTeamLeader'::user_role
      and me.squad is not null
      and c.squad = me.squad
  )
);

drop policy if exists ee_octl_team on public.extras_events;
create policy ee_octl_team on public.extras_events for select using (
  exists (
    select 1
    from public.users me
    join public.users c on c.hr_code = public.extras_events.hr_code
    where me.id = auth.uid()
      and me.role = 'OCTeamLeader'::user_role
      and me.squad is not null
      and c.squad = me.squad
  )
);

select 'OCTeamLeader policies applied' as status;
