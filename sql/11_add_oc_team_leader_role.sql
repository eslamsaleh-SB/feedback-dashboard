-- v59: add OCTeamLeader enum value ONLY. Postgres refuses to use a new
-- enum value in the same transaction it was added — run this file first,
-- then run 11b_oc_team_leader_policies.sql in a separate query.
alter type user_role add value if not exists 'OCTeamLeader';
select 'OCTeamLeader value added — now run 11b in a new query' as status;
