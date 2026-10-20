-- Internal plumbing. Secrets themselves live in Vault (internal_secret, lab_key, owner_email) and are never committed.

create or replace function public.get_config(k text) returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = k limit 1
$$;
revoke execute on function public.get_config(text) from public, anon, authenticated;
grant execute on function public.get_config(text) to service_role;

-- Fire-and-forget invocation of the edge function from Postgres (fan-out + cron), authenticated by the internal secret.
create or replace function public.call_fn(fn text, body jsonb default '{}'::jsonb, timeout_ms int default 150000) returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://xnfozdpgszotyeaeqeqy.supabase.co/functions/v1/' || fn,
    body := body,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhuZm96ZHBnc3pvdHllYWVxZXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0Mzk4ODUsImV4cCI6MjEwODAxNTg4NX0.WvXJpPjuCPUWnYuFzsWN-tmIsC04_u0kQ_MEX3a2uC8',
      'x-internal-secret', public.get_config('internal_secret')),
    timeout_milliseconds := timeout_ms)
$$;
revoke execute on function public.call_fn(text, jsonb, int) from public, anon, authenticated;

-- Only the configured owner email can ever create the (single) account.
create or replace function public.block_extra_signups() returns trigger
language plpgsql security definer set search_path = '' as $$
declare allowed text;
begin
  if exists (select 1 from public.app_owner) then
    raise exception 'Lit Fits is a single-user app. Sign-ups are closed.';
  end if;
  select decrypted_secret into allowed from vault.decrypted_secrets where name = 'owner_email' limit 1;
  if allowed is not null and lower(trim(allowed)) <> lower(trim(coalesce(new.email, ''))) then
    raise exception 'This Lit Fits is reserved for its owner.';
  end if;
  return new;
end $$;

-- Weekly trend brief (Monday 06:00 UTC) and nightly style-DNA refresh.
select cron.schedule('trend-brief-weekly', '0 6 * * 1', $$ select public.call_fn('api/style/trends', '{}'::jsonb, 300000) $$);
select cron.schedule('style-dna-nightly', '30 3 * * *', $$
  select public.call_fn('api/style/dna', '{}'::jsonb, 300000)
  where exists (select 1 from public.app_owner)
    and exists (select 1 from public.signals where created_at > now() - interval '1 day')
$$);
