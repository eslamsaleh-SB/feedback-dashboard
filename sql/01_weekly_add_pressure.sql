-- v59: add `pressure` column to weekly_quality_scores.
--
-- Monthly Module Score CSV reports these modules per collector:
--   base, players, formation_tactical, location, impact, extras, pressure, squad
-- The weekly table was missing pressure, so the Weekly Quality Scores view
-- had no place to show it.

alter table public.weekly_quality_scores
  add column if not exists pressure numeric;
