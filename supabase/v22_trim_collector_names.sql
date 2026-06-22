-- =============================================================
-- Task 8 – Trim collector names to first two words only
-- Run in: Supabase Dashboard > SQL Editor
-- =============================================================

-- Preview (optional — shows current vs new name):
-- SELECT id, name,
--        trim(
--          regexp_replace(name, '^(\S+\s+\S+).*$', '\1')
--        ) AS new_name
-- FROM public.collectors
-- WHERE name ~ '\S+\s+\S+\s+\S+';   -- only rows with 3+ words

-- Update: keep only the first two whitespace-separated words.
UPDATE public.collectors
SET name = trim(
      regexp_replace(
        trim(name),
        '^(\S+(?:\s+\S+)?).*$',
        '\1'
      )
    )
WHERE name ~ '\S+\s+\S+';   -- only rows that actually have more than one word

-- Verify:
-- SELECT id, name FROM public.collectors ORDER BY name;
