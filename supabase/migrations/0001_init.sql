-- Lit Fits — core schema
-- Single-owner app: the first account created becomes the owner and sign-ups close.

create extension if not exists vector with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pg_cron;

-- ───────────────────────────── owner lock ─────────────────────────────
create table public.app_owner (
  id boolean primary key default true check (id),
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_owner enable row level security;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_owner where user_id = auth.uid())
$$;

create or replace function public.block_extra_signups() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.app_owner) then
    raise exception 'Lit Fits is a single-user app. Sign-ups are closed.';
  end if;
  return new;
end $$;

create trigger block_extra_signups before insert on auth.users
  for each row execute function public.block_extra_signups();

-- ───────────────────────────── helpers ─────────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

-- ───────────────────────────── profile ─────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  height_cm numeric,
  weight_kg numeric,
  build_notes text,
  fit_preference text,
  appearance_notes text,
  twin jsonb not null default '{}'::jsonb,
  render_settings jsonb not null default '{}'::jsonb,
  style_seed text,
  style_dna jsonb,
  style_dna_updated_at timestamptz,
  preferences jsonb not null default '{}'::jsonb,
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ───────────────────────────── items ─────────────────────────────
create table public.items (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  number int,
  name text,
  category text,
  subtype text,
  slot text check (slot in ('head','outer','mid','base','bottom','feet','accessory','onepiece')),
  brand text,
  colour_name text,
  colours jsonb not null default '[]'::jsonb,
  colour_family text,
  hue numeric,
  lightness numeric,
  pattern text,
  materials text[] not null default '{}',
  fabric_weight text,
  size text,
  size_system text,
  fit text,
  fit_notes text,
  warmth smallint check (warmth between 1 and 5),
  formality smallint check (formality between 1 and 5),
  seasons text[] not null default '{}',
  tags text[] not null default '{}',
  description text,
  render_notes text,
  wear_modes jsonb not null default '[]'::jsonb,
  photos jsonb not null default '{}'::jsonb,
  images jsonb not null default '{}'::jsonb,
  cover_url text,
  thumb_url text,
  aspect numeric,
  processing jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','processing','ready','failed')),
  laundry text not null default 'clean' check (laundry in ('clean','worn','wash','drying','storage','packed')),
  location text,
  price numeric,
  currency text default 'GBP',
  acquired_on date,
  care text,
  notes text,
  wear_count int not null default 0,
  last_worn_on date,
  favourite boolean not null default false,
  archived boolean not null default false,
  embedding extensions.vector(768),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_owner_idx on public.items(owner) where not archived;
create index items_slot_idx on public.items(owner, slot);
create index items_embedding_idx on public.items using hnsw (embedding extensions.vector_cosine_ops);

create or replace function public.items_assign_number() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.number is null then
    select coalesce(max(number), 0) + 1 into new.number from public.items where owner = new.owner;
  end if;
  return new;
end $$;
create trigger items_number before insert on public.items
  for each row execute function public.items_assign_number();
create trigger items_touch before update on public.items
  for each row execute function public.touch_updated_at();

-- ───────────────────────────── looks ─────────────────────────────
create table public.looks (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  name text,
  notes text,
  rationale text,
  occasion text,
  seasons text[] not null default '{}',
  source text not null default 'manual' check (source in ('manual','mixer','stylist','shuffle','complete','pack')),
  prompt text,
  canvas jsonb not null default '{}'::jsonb,
  cover_render_id uuid,
  favourite boolean not null default false,
  worn_count int not null default 0,
  last_worn_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index looks_owner_idx on public.looks(owner, updated_at desc);
create trigger looks_touch before update on public.looks
  for each row execute function public.touch_updated_at();

create table public.look_items (
  look_id uuid not null references public.looks on delete cascade,
  item_id uuid not null references public.items on delete cascade,
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  slot text,
  wear_mode text,
  ord int not null default 0,
  note text,
  primary key (look_id, item_id)
);
create index look_items_item_idx on public.look_items(item_id);

-- ───────────────────────────── renders ─────────────────────────────
create table public.renders (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  look_id uuid references public.looks on delete set null,
  items jsonb not null default '[]'::jsonb,
  scene text,
  extra_prompt text,
  model text,
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  image_path text,
  width int,
  height int,
  error text,
  duration_ms int,
  created_at timestamptz not null default now()
);
create index renders_look_idx on public.renders(look_id, created_at desc);
alter table public.looks add constraint looks_cover_render_fk
  foreign key (cover_render_id) references public.renders(id) on delete set null;

-- ───────────────────────────── wishlist ─────────────────────────────
create table public.wishlist (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  subtype text,
  slot text,
  description text,
  colour text,
  reason text,
  pairs_with uuid[] not null default '{}',
  look jsonb,
  search_query text,
  concept_url text,
  priority smallint not null default 2,
  status text not null default 'wanted' check (status in ('wanted','bought','dismissed')),
  created_at timestamptz not null default now()
);

-- ───────────────────────────── stylist ─────────────────────────────
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  title text,
  kind text not null default 'stylist',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger threads_touch before update on public.threads
  for each row execute function public.touch_updated_at();

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads on delete cascade,
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text,
  looks jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index messages_thread_idx on public.messages(thread_id, created_at);

-- ───────────────────────────── learning signals ─────────────────────────────
create table public.signals (
  id bigint generated always as identity primary key,
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null,
  look_id uuid,
  item_ids uuid[] not null default '{}',
  value numeric,
  text text,
  created_at timestamptz not null default now()
);

create table public.wear_log (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  worn_on date not null default current_date,
  look_id uuid references public.looks on delete set null,
  item_ids uuid[] not null default '{}',
  note text,
  created_at timestamptz not null default now()
);

-- ───────────────────────────── trips (packing mode) ─────────────────────────────
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  name text,
  destination text,
  start_on date,
  end_on date,
  brief text,
  weather jsonb,
  plan jsonb,
  item_ids uuid[] not null default '{}',
  status text not null default 'planning' check (status in ('planning','packed','away','done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trips_touch before update on public.trips
  for each row execute function public.touch_updated_at();

-- ───────────────────────────── knowledge ─────────────────────────────
create table public.trend_briefs (
  id uuid primary key default gen_random_uuid(),
  season text,
  summary text,
  content jsonb not null default '{}'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.pairings (
  item_id uuid primary key references public.items on delete cascade,
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  result jsonb not null,
  wardrobe_size int,
  created_at timestamptz not null default now()
);

create table public.usage (
  id bigint generated always as identity primary key,
  owner uuid,
  fn text,
  model text,
  input_tokens int default 0,
  output_tokens int default 0,
  images int default 0,
  est_cost_usd numeric default 0,
  created_at timestamptz not null default now()
);

-- ───────────────────────────── RLS ─────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['profiles','items','looks','look_items','renders','wishlist','threads','messages','signals','wear_log','trips','pairings','usage']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy "own profile" on public.profiles for all to authenticated
  using (id = auth.uid() and public.is_owner()) with check (id = auth.uid() and public.is_owner());

do $$
declare t text;
begin
  foreach t in array array['items','looks','look_items','renders','wishlist','threads','messages','signals','wear_log','trips','pairings','usage']
  loop
    execute format(
      'create policy "owner only" on public.%I for all to authenticated using (owner = auth.uid() and public.is_owner()) with check (owner = auth.uid() and public.is_owner())', t);
  end loop;
end $$;

alter table public.trend_briefs enable row level security;
create policy "owner reads briefs" on public.trend_briefs for select to authenticated using (public.is_owner());

-- ───────────────────────────── storage ─────────────────────────────
-- pieces: public CDN bucket for garment cut-outs (unguessable UUID paths, not sensitive)
-- private: raw photos, twin reference photos, renders (signed URLs only)
insert into storage.buckets (id, name, public, file_size_limit)
values ('pieces', 'pieces', true, 20971520), ('private', 'private', false, 31457280)
on conflict (id) do nothing;

create policy "owner rw private" on storage.objects for all to authenticated
  using (bucket_id = 'private' and (storage.foldername(name))[1] = auth.uid()::text and public.is_owner())
  with check (bucket_id = 'private' and (storage.foldername(name))[1] = auth.uid()::text and public.is_owner());

create policy "owner rw pieces" on storage.objects for all to authenticated
  using (bucket_id = 'pieces' and (storage.foldername(name))[1] = auth.uid()::text and public.is_owner())
  with check (bucket_id = 'pieces' and (storage.foldername(name))[1] = auth.uid()::text and public.is_owner());

-- ───────────────────────────── realtime ─────────────────────────────
alter publication supabase_realtime add table public.items, public.renders, public.looks, public.wishlist, public.profiles;

-- ───────────────────────────── search helpers ─────────────────────────────
create or replace function public.match_items(query_embedding extensions.vector(768), match_count int default 24)
returns table (id uuid, similarity float)
language sql stable set search_path = '' as $$
  select i.id, 1 - (i.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.items i
  where i.owner = auth.uid() and not i.archived and i.embedding is not null
  order by i.embedding operator(extensions.<=>) query_embedding
  limit match_count
$$;

-- Item usage: how many saved looks each item appears in (for "rediscover" + shuffle bias)
create or replace view public.item_usage with (security_invoker = true) as
  select i.id as item_id, count(li.look_id)::int as look_count
  from public.items i left join public.look_items li on li.item_id = i.id
  group by i.id;
