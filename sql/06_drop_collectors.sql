-- v56 P6 - Drop the collectors table.
-- Run LAST, after every FK has been dropped/repointed and every code path
-- has been switched to `users`. Cascade is intentional as a safety net.

drop table if exists public.collectors cascade;
