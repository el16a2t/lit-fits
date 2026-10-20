-- Remote breadcrumbs from the app (no secrets, no photos), so real-device issues can be diagnosed.
-- Written only by the edge function (service role); no client policies. Trimmed after 30 days.
create table if not exists public.client_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  device jsonb not null default '{}'::jsonb,
  events jsonb not null default '[]'::jsonb
);
alter table public.client_logs enable row level security;
create index if not exists client_logs_created_at on public.client_logs (created_at desc);

select cron.schedule('client-logs-trim', '15 4 * * *', $$ delete from public.client_logs where created_at < now() - interval '30 days' $$);
