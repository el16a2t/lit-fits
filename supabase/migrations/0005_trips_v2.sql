-- Trips v2: a trip is a temporary wardrobe with a lifecycle (plan → curate → pack → away → home), not a one-off list.
alter table public.trips
  add column if not exists settings jsonb not null default '{}'::jsonb,      -- luggage, laundry, activities
  add column if not exists excluded_ids uuid[] not null default '{}',        -- pieces you took out: never suggested again
  add column if not exists pinned_ids uuid[] not null default '{}',          -- pieces you added: always kept
  add column if not exists checklist jsonb not null default '[]'::jsonb,     -- non-wardrobe things: [{id,label,source}]
  add column if not exists packed jsonb not null default '{}'::jsonb,        -- {item_id | checklist id: true}
  add column if not exists worn jsonb not null default '{}'::jsonb,          -- {item_id: times worn on the trip}
  add column if not exists wrap jsonb;                                       -- home wrap-up (what earned its place)

comment on column public.trips.item_ids is 'The capsule: pieces travelling. Source of truth for away-mode scoping.';
