// The look currently being assembled — persists across screens and app restarts until saved or discarded.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CanvasPiece, Look } from '@/lib/types';

export interface DraftPiece {
  item_id: string;
  mode?: string | null;
  note?: string | null;
  pos?: CanvasPiece;
  addedAt: number;
}

export interface DraftState {
  lookId?: string;
  name?: string | null;
  occasion?: string | null;
  notes?: string | null;
  rationale?: string | null;
  prompt?: string | null;
  source: Look['source'];
  pieces: DraftPiece[];
  updatedAt: number;
  active: boolean;
  start: (p: { item_ids: string[]; modes?: Record<string, string | undefined>; notes?: Record<string, string | undefined>; name?: string | null; source?: Look['source']; rationale?: string | null; prompt?: string | null; occasion?: string | null }) => void;
  loadLook: (look: Look) => void;
  add: (item_id: string, mode?: string | null) => void;
  remove: (item_id: string) => void;
  replace: (oldId: string, newId: string) => void;
  setMode: (item_id: string, mode: string | null) => void;
  setPos: (item_id: string, pos: CanvasPiece) => void;
  setAllPos: (m: Record<string, CanvasPiece>) => void;
  setMeta: (m: Partial<Pick<DraftState, 'name' | 'occasion' | 'notes' | 'lookId'>>) => void;
  clear: () => void;
}

const empty = { lookId: undefined, name: null, occasion: null, notes: null, rationale: null, prompt: null, source: 'manual' as const, pieces: [], active: false };

export const useDraft = create<DraftState>()(
  persist(
    (set, get) => ({
      ...empty,
      updatedAt: 0,
      start: ({ item_ids, modes, notes, name, source, rationale, prompt, occasion }) =>
        set({
          ...empty,
          active: true,
          name: name ?? null,
          source: source ?? 'manual',
          rationale: rationale ?? null,
          prompt: prompt ?? null,
          occasion: occasion ?? null,
          pieces: item_ids.map((id, i) => ({ item_id: id, mode: modes?.[id] ?? null, note: notes?.[id] ?? null, addedAt: Date.now() + i })),
          updatedAt: Date.now(),
        }),
      loadLook: (look) =>
        set({
          ...empty,
          active: true,
          lookId: look.id,
          name: look.name,
          occasion: look.occasion,
          notes: look.notes,
          rationale: look.rationale,
          prompt: look.prompt,
          source: look.source,
          pieces: (look.look_items ?? []).sort((a, b) => a.ord - b.ord).map((li, i) => ({
            item_id: li.item_id, mode: li.wear_mode, note: li.note, pos: look.canvas?.pieces?.[li.item_id], addedAt: i,
          })),
          updatedAt: Date.now(),
        }),
      add: (item_id, mode) => {
        if (get().pieces.some((p) => p.item_id === item_id)) return;
        set((s) => ({ active: true, pieces: [...s.pieces, { item_id, mode: mode ?? null, addedAt: Date.now() }], updatedAt: Date.now() }));
      },
      remove: (item_id) => set((s) => ({ pieces: s.pieces.filter((p) => p.item_id !== item_id), updatedAt: Date.now() })),
      replace: (oldId, newId) =>
        set((s) => ({ pieces: s.pieces.map((p) => (p.item_id === oldId ? { item_id: newId, pos: p.pos, addedAt: Date.now() } : p)), updatedAt: Date.now() })),
      setMode: (item_id, mode) => set((s) => ({ pieces: s.pieces.map((p) => (p.item_id === item_id ? { ...p, mode } : p)), updatedAt: Date.now() })),
      setPos: (item_id, pos) => set((s) => ({ pieces: s.pieces.map((p) => (p.item_id === item_id ? { ...p, pos } : p)) })),
      setAllPos: (m) => set((s) => ({ pieces: s.pieces.map((p) => (m[p.item_id] ? { ...p, pos: m[p.item_id] } : p)) })),
      setMeta: (m) => set({ ...m, updatedAt: Date.now() }),
      clear: () => set({ ...empty, updatedAt: Date.now() }),
    }),
    { name: 'litfits.draft', storage: createJSONStorage(() => AsyncStorage), partialize: ({ start, loadLook, add, remove, replace, setMode, setPos, setAllPos, setMeta, clear, ...rest }) => rest },
  ),
);
