-- Log of every email the dashboard sends (kept ~1 month, then auto-deleted).
create table if not exists public.email_log (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  to_email   text,
  cc         text,
  subject    text,
  status     text not null,          -- 'sent' | 'failed' | 'skipped'
  error      text,
  hr_code    text
);
create index if not exists email_log_created_idx on public.email_log (created_at desc);
-- Only the server (service role) reads/writes it; no client policies.
alter table public.email_log enable row level security;
