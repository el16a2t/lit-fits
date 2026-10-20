// Batch capture queue: photos are uploaded and processed in the background while you keep shooting.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { api } from '@/lib/api';
import { items } from '@/lib/data';
import { qk, queryClient } from '@/lib/queries';
import type { Item } from '@/lib/types';

export type CaptureKind = 'garment' | 'shoes' | 'accessory';
export type Shot = 'front' | 'back' | 'side' | 'label';

export interface QueueEntry {
  localId: string;
  kind: CaptureKind;
  photos: Partial<Record<Shot, string>>;
  hint?: { subtype?: string; brand?: string };
  status: 'pending' | 'uploading' | 'processing' | 'failed';
  itemId?: string;
  error?: string;
  createdAt: number;
}

interface CaptureState {
  queue: QueueEntry[];
  reviewIds: string[]; // items added in this session, waiting to be reviewed
  enqueue: (e: Omit<QueueEntry, 'status' | 'createdAt' | 'localId'>) => void;
  patch: (localId: string, p: Partial<QueueEntry>) => void;
  drop: (localId: string) => void;
  addReview: (id: string) => void;
  doneReview: (id: string) => void;
  clearReview: () => void;
}

export const useCapture = create<CaptureState>()(
  persist(
    (set) => ({
      queue: [],
      reviewIds: [],
      enqueue: (e) => set((s) => ({ queue: [...s.queue, { ...e, localId: Math.random().toString(36).slice(2), status: 'pending', createdAt: Date.now() }] })),
      patch: (localId, p) => set((s) => ({ queue: s.queue.map((q) => (q.localId === localId ? { ...q, ...p } : q)) })),
      drop: (localId) => set((s) => ({ queue: s.queue.filter((q) => q.localId !== localId) })),
      addReview: (id) => set((s) => ({ reviewIds: s.reviewIds.includes(id) ? s.reviewIds : [...s.reviewIds, id] })),
      doneReview: (id) => set((s) => ({ reviewIds: s.reviewIds.filter((x) => x !== id) })),
      clearReview: () => set({ reviewIds: [] }),
    }),
    { name: 'litfits.capture', storage: createJSONStorage(() => AsyncStorage), partialize: ({ queue, reviewIds }) => ({ queue, reviewIds }) },
  ),
);

/** Mount once (root layout). Works through the queue one piece at a time, resiliently. */
export function useCaptureWorker(enabled: boolean) {
  const busy = useRef(false);
  const queue = useCapture((s) => s.queue);
  useEffect(() => {
    if (!enabled || busy.current) return;
    const next = queue.find((q) => q.status === 'pending' || (q.status === 'uploading' && Date.now() - q.createdAt > 1000 * 60 * 3));
    if (!next) return;
    busy.current = true;
    const { patch, drop, addReview } = useCapture.getState();
    (async () => {
      try {
        patch(next.localId, { status: 'uploading', createdAt: Date.now() });
        let itemId = next.itemId;
        if (!itemId) {
          const created = await items.create({ status: 'processing', subtype: next.hint?.subtype ?? null, brand: next.hint?.brand ?? null } as Partial<Item>);
          itemId = created.id;
          patch(next.localId, { itemId });
          queryClient.setQueryData<Item[]>(qk.items, (prev) => (prev ? [created, ...prev.filter((i) => i.id !== created.id)] : [created]));
        }
        const paths = await items.uploadPhotos(itemId, next.photos);
        await items.update(itemId, { photos: paths } as Partial<Item>);
        await api.processItem(itemId, 'analyse');
        addReview(itemId);
        drop(next.localId);
      } catch (e: any) {
        patch(next.localId, { status: 'failed', error: e?.message ?? 'Upload failed' });
      } finally {
        busy.current = false;
        // nudge the effect to pick up the next entry
        useCapture.setState((s) => ({ queue: [...s.queue] }));
      }
    })();
  }, [enabled, queue]);
}
