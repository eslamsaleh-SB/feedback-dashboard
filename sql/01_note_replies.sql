-- =============================================================================
-- v42 - STEP 1: add reply columns to session_notes
-- =============================================================================
-- Admins can now reply to a collector's note. Storing the reply on the note
-- itself (one note = one reply) keeps the table flat and the My Reports / Admin
-- Reports UIs simple. When a reply is saved the note is auto-marked Complete.

alter table public.session_notes
  add column if not exists reply_text  text,
  add column if not exists replied_at  timestamptz,
  add column if not exists replied_by  uuid references auth.users(id);

-- (No RLS changes needed - the existing sn_select policy already lets the
-- collector see their own note rows, including the new reply columns.)
