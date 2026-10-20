-- Atomic helpers used by parallel edge-function workers (one worker per generated image).

create or replace function public.item_proc_set(p_id uuid, p_group text, p_key text, p_value text, p_error text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  proc jsonb;
  views jsonb;
  done boolean;
  any_ok boolean;
begin
  update public.items
     set processing = jsonb_set(
           coalesce(processing, '{}'::jsonb) || jsonb_build_object(p_group, coalesce(processing -> p_group, '{}'::jsonb)),
           array[p_group, p_key], to_jsonb(p_value), true)
           || case when p_error is not null then jsonb_build_object('last_error', p_error) else '{}'::jsonb end
   where id = p_id
   returning processing into proc;

  views := coalesce(proc -> 'views', '{}'::jsonb);
  select coalesce(bool_and(value #>> '{}' in ('done','failed')), false),
         coalesce(bool_or(value #>> '{}' = 'done'), false)
    into done, any_ok
    from jsonb_each(views);

  if (proc #>> '{steps,analysis}') in ('done','failed') and done then
    update public.items set status = case when any_ok then 'ready' else 'failed' end where id = p_id;
  end if;
  return proc;
end $$;

create or replace function public.item_set_image(p_id uuid, p_view text, p_value jsonb, p_cover boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.items
     set images = coalesce(images, '{}'::jsonb) || jsonb_build_object(p_view, p_value),
         cover_url = case when p_cover then p_value ->> 'url' else cover_url end,
         thumb_url = case when p_cover then p_value ->> 'thumb' else thumb_url end,
         aspect = case when p_cover then (p_value ->> 'aspect')::numeric else aspect end
   where id = p_id;
end $$;

create or replace function public.item_set_mode(p_id uuid, p_key text, p_patch jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.items i
     set wear_modes = coalesce((
       select jsonb_agg(case when m ->> 'key' = p_key then m || p_patch else m end order by ord)
         from jsonb_array_elements(i.wear_modes) with ordinality as t(m, ord)), '[]'::jsonb)
   where i.id = p_id;
end $$;

revoke execute on function public.item_proc_set(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.item_set_image(uuid, text, jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.item_set_mode(uuid, text, jsonb) from public, anon, authenticated;

-- Lab staging for the pre-launch image bake-off (service role only)
create table if not exists public.lab_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  status text not null default 'queued',
  error text,
  ms int,
  created_at timestamptz not null default now()
);
alter table public.lab_runs enable row level security;
