-- v59: add OCTeamLeader role — same as Viewer/Collector but scoped to team.
alter type user_role add value if not exists 'OCTeamLeader';

-- Viewer-scoped tables have policies keyed on p.hr_code = row.hr_code. Extend
-- them to also permit rows whose collector belongs to the OCTL's squad.
-- These are additive SELECT-only policies; existing Admin/Reviewer/Viewer
-- policies remain untouched.

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

select 'OCTeamLeader role added' as status;
