import type { Slot } from './taxonomy';

export type ProcState = 'queued' | 'running' | 'done' | 'failed';

export interface ItemImage {
  url: string;
  thumb: string;
  ref?: string | null;
  aspect: number;
  w?: number;
  h?: number;
  model?: string;
}

export interface WearMode {
  key: string;
  label: string;
  description: string;
  status: 'base' | 'suggested' | 'queued' | 'rendering' | 'ready' | 'failed' | 'confirmed';
  url?: string;
  thumb?: string;
  ref?: string;
  aspect?: number;
  error?: string;
}

export interface Item {
  id: string;
  owner: string;
  number: number;
  name: string | null;
  category: string | null;
  subtype: string | null;
  slot: Slot | null;
  brand: string | null;
  colour_name: string | null;
  colours: { name: string; hex: string; share: number }[];
  colour_family: string | null;
  hue: number | null;
  lightness: number | null;
  pattern: string | null;
  materials: string[];
  fabric_weight: string | null;
  size: string | null;
  size_system: string | null;
  fit: string | null;
  fit_notes: string | null;
  warmth: number | null;
  formality: number | null;
  seasons: string[];
  tags: string[];
  description: string | null;
  render_notes: string | null;
  wear_modes: WearMode[];
  photos: Partial<Record<'front' | 'back' | 'side' | 'label' | 'detail', string>>;
  images: Partial<Record<'front' | 'back' | 'side', ItemImage>>;
  cover_url: string | null;
  thumb_url: string | null;
  aspect: number | null;
  processing: {
    key?: string;
    state?: string;
    steps?: { analysis?: ProcState };
    views?: Partial<Record<'front' | 'back' | 'side', ProcState>>;
    last_error?: string;
    analysis?: unknown;
  };
  status: 'draft' | 'processing' | 'ready' | 'failed';
  laundry: 'clean' | 'worn' | 'wash' | 'drying' | 'storage' | 'packed';
  location: string | null;
  price: number | null;
  currency: string | null;
  acquired_on: string | null;
  care: string | null;
  notes: string | null;
  wear_count: number;
  last_worn_on: string | null;
  favourite: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface CanvasPiece {
  x: number; // 0..1 of canvas width (centre)
  y: number; // 0..1 of canvas height (centre)
  s: number; // scale multiplier
  r: number; // rotation in degrees
  z: number;
}

export interface Look {
  id: string;
  owner: string;
  name: string | null;
  notes: string | null;
  rationale: string | null;
  occasion: string | null;
  seasons: string[];
  source: 'manual' | 'mixer' | 'stylist' | 'shuffle' | 'complete' | 'pack';
  prompt: string | null;
  canvas: { pieces?: Record<string, CanvasPiece> };
  cover_render_id: string | null;
  favourite: boolean;
  worn_count: number;
  last_worn_on: string | null;
  created_at: string;
  updated_at: string;
  look_items?: LookItem[];
}

export interface LookItem {
  look_id: string;
  item_id: string;
  slot: string | null;
  wear_mode: string | null;
  ord: number;
  note: string | null;
}

export interface Render {
  id: string;
  look_id: string | null;
  items: { item_id: string; mode?: string; note?: string }[];
  scene: string | null;
  extra_prompt: string | null;
  model: string | null;
  status: 'queued' | 'running' | 'done' | 'failed';
  image_path: string | null;
  width: number | null;
  height: number | null;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface MissingPiece {
  title: string;
  slot: string;
  subtype?: string;
  colour?: string;
  why: string;
}

export interface LookCritique {
  verdict: 'sits well' | 'works' | 'clashes';
  headline: string;
  working: string[];
  issues: string[];
  swaps: { out_id: string; in_id: string; why: string }[];
}

export interface StylistLook {
  title: string;
  occasion?: string;
  why: string;
  styling?: string;
  items: { item_id: string; number: number; mode?: string; note?: string; slot?: string | null }[];
  missing: MissingPiece[];
}

export interface Message {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant';
  content: string | null;
  looks: StylistLook[];
  meta: { blocks?: ({ type: 'text'; text: string } | { type: 'look'; look: StylistLook })[] };
  created_at: string;
}

export interface Thread {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface WishlistItem {
  id: string;
  title: string;
  subtype: string | null;
  slot: string | null;
  description: string | null;
  colour: string | null;
  reason: string | null;
  pairs_with: string[];
  look: unknown;
  search_query: string | null;
  concept_url: string | null;
  priority: number;
  status: 'wanted' | 'bought' | 'dismissed';
  created_at: string;
}

export interface Trip {
  id: string;
  name: string | null;
  destination: string | null;
  start_on: string | null;
  end_on: string | null;
  brief: string | null;
  plan: {
    summary?: string;
    capsule?: { item_id: string; why: string }[];
    days?: { date?: string; label: string; look: StylistLook }[];
    extras?: string[];
    missing?: MissingPiece[];
    forecast?: { place: string; days: { date: string; min: number; max: number; rain: number }[] } | null;
  } | null;
  item_ids: string[];
  status: 'planning' | 'packed' | 'away' | 'done';
  created_at: string;
}

export interface Twin {
  face_front?: string;
  face_left?: string;
  face_right?: string;
  full_body?: string;
  base?: string;
  base_status?: 'running' | 'done' | 'failed';
  base_error?: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  build_notes: string | null;
  fit_preference: string | null;
  appearance_notes: string | null;
  twin: Twin;
  render_settings: { scene?: string; extra_prompt?: string; model?: string };
  style_seed: string | null;
  style_dna: StyleDna | null;
  style_dna_updated_at: string | null;
  preferences: { laundry_tracking?: boolean; location_tracking?: boolean; home_city?: string };
  onboarded: boolean;
}

export interface StyleDna {
  headline: string;
  palette: string[];
  silhouettes: string[];
  signatures: string[];
  formality: string;
  go_to: string[];
  under_used: string[];
  avoid: string[];
  next_moves: string[];
  evolution: string;
}

export interface TrendBrief {
  id: string;
  season: string | null;
  summary: string | null;
  content: {
    season?: string;
    headline?: string;
    summary?: string;
    themes?: { name: string; what: string; how: string; source?: string }[];
    colours?: string[];
    silhouettes?: string[];
    key_pieces?: string[];
    for_you?: string[];
    fading?: string[];
  };
  sources: { title: string; url: string }[];
  created_at: string;
}

export interface Pairings {
  headline: string;
  groups: { slot: Slot; picks: { item_id: string; why: string; score: number }[] }[];
  avoid: { item_id: string; why: string }[];
  missing: MissingPiece[];
  cached?: boolean;
}
