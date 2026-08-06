-- v59 patch: extras sheet has no actor_role column; drop it.
alter table public.extras_events drop column if exists actor_role;
select 'extras_events.actor_role dropped' as status;
