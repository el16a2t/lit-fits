import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from './api';
import { items, latestBrief, looks, monthSpend, profile, renders, signedUrl, threads, trips, wishlist, type LookDraftInput } from './data';
import { DEMO, supabase } from './supabase';
import type { Item, Look, Profile, Render } from './types';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 30, gcTime: 1000 * 60 * 60 * 24 * 7, retry: 1, refetchOnWindowFocus: false },
  },
});

export const qk = {
  items: ['items'] as const,
  item: (id: string) => ['item', id] as const,
  usage: ['usage'] as const,
  looks: ['looks'] as const,
  look: (id: string) => ['look', id] as const,
  renders: (lookId: string) => ['renders', lookId] as const,
  render: (id: string) => ['render', id] as const,
  pairings: (id: string) => ['pairings', id] as const,
  wishlist: ['wishlist'] as const,
  threads: ['threads'] as const,
  messages: (id: string) => ['messages', id] as const,
  trips: ['trips'] as const,
  trip: (id: string) => ['trip', id] as const,
  profile: ['profile'] as const,
  brief: ['brief'] as const,
  spend: ['spend'] as const,
  signed: (p: string) => ['signed', p] as const,
};

export const useItems = () => useQuery({ queryKey: qk.items, queryFn: items.list });
export const useItemUsage = () => useQuery({ queryKey: qk.usage, queryFn: items.usage });

export function useItem(id: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.item(id ?? ''),
    queryFn: () => items.get(id!),
    enabled: !!id,
    initialData: () => qc.getQueryData<Item[]>(qk.items)?.find((i) => i.id === id),
    initialDataUpdatedAt: () => qc.getQueryState(qk.items)?.dataUpdatedAt,
  });
}

export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Item> }) => items.update(id, patch),
    onMutate: async ({ id, patch }) => {
      qc.setQueryData<Item[]>(qk.items, (prev) => prev?.map((i) => (i.id === id ? { ...i, ...patch } : i)));
      qc.setQueryData<Item>(qk.item(id), (prev) => (prev ? { ...prev, ...patch } : prev));
    },
    onSuccess: (it) => {
      qc.setQueryData<Item>(qk.item(it.id), it);
      qc.setQueryData<Item[]>(qk.items, (prev) => prev?.map((i) => (i.id === it.id ? it : i)));
    },
  });
}

export const useLooks = () => useQuery({ queryKey: qk.looks, queryFn: looks.list });

export function useLook(id: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.look(id ?? ''),
    queryFn: () => looks.get(id!),
    enabled: !!id,
    initialData: () => qc.getQueryData<Look[]>(qk.looks)?.find((l) => l.id === id),
  });
}

export function useSaveLook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: LookDraftInput) => looks.save(d),
    onSuccess: (look) => {
      qc.setQueryData(qk.look(look.id), look);
      qc.invalidateQueries({ queryKey: qk.looks });
      qc.invalidateQueries({ queryKey: qk.usage });
    },
  });
}

export const useRenders = (lookId: string | undefined) =>
  useQuery({ queryKey: qk.renders(lookId ?? ''), queryFn: () => renders.forLook(lookId!), enabled: !!lookId });

export const useRecentRenders = () => useQuery({ queryKey: ['renders', 'recent'], queryFn: renders.recent, staleTime: 1000 * 60 });

export const useRender = (id: string | undefined) =>
  useQuery({
    queryKey: qk.render(id ?? ''),
    queryFn: () => renders.get(id!),
    enabled: !!id,
    refetchInterval: (q) => {
      const s = (q.state.data as Render | undefined)?.status;
      return s === 'done' || s === 'failed' ? false : 4000;
    },
  });

export const useSignedUrl = (path: string | null | undefined) =>
  useQuery({ queryKey: qk.signed(path ?? ''), queryFn: () => signedUrl(path), enabled: !!path, staleTime: 1000 * 60 * 60 * 24 });

export const usePairings = (id: string | undefined) =>
  useQuery({ queryKey: qk.pairings(id ?? ''), queryFn: () => api.pairings(id!), enabled: !!id, staleTime: 1000 * 60 * 60, retry: 0 });

export const useWishlist = () => useQuery({ queryKey: qk.wishlist, queryFn: wishlist.list });
export const useThreads = () => useQuery({ queryKey: qk.threads, queryFn: threads.list });
export const useMessages = (id: string | undefined) =>
  useQuery({ queryKey: qk.messages(id ?? ''), queryFn: () => threads.messages(id!), enabled: !!id });
export const useTrips = () => useQuery({ queryKey: qk.trips, queryFn: trips.list });
export const useTrip = (id: string | undefined) => useQuery({ queryKey: qk.trip(id ?? ''), queryFn: () => trips.get(id!), enabled: !!id });
export const useProfile = () => useQuery({ queryKey: qk.profile, queryFn: profile.get });
export const useBrief = () => useQuery({ queryKey: qk.brief, queryFn: latestBrief });
export const useSpend = () => useQuery({ queryKey: qk.spend, queryFn: monthSpend });

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Profile>) => profile.update(patch),
    onMutate: (patch) => qc.setQueryData<Profile | null>(qk.profile, (p) => (p ? { ...p, ...patch } : p)),
    onSuccess: (p) => qc.setQueryData(qk.profile, p),
  });
}

/** Live updates: items being processed, renders finishing, profile twin builds. */
export function useRealtimeSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled || DEMO) return;
    const ch = supabase
      .channel('litfits-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, (p) => {
        const row = (p.new ?? p.old) as Item;
        if (!row?.id) return;
        if (p.eventType === 'DELETE') {
          queryClient.setQueryData<Item[]>(qk.items, (prev) => prev?.filter((i) => i.id !== row.id));
          return;
        }
        const next = p.new as Item;
        queryClient.setQueryData<Item>(qk.item(next.id), next);
        queryClient.setQueryData<Item[]>(qk.items, (prev) => {
          if (!prev) return prev;
          if (next.archived) return prev.filter((i) => i.id !== next.id);
          const exists = prev.some((i) => i.id === next.id);
          return exists ? prev.map((i) => (i.id === next.id ? next : i)) : [next, ...prev];
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'renders' }, (p) => {
        const r = p.new as Render;
        if (!r?.id) return;
        queryClient.setQueryData(qk.render(r.id), r);
        if (r.look_id) queryClient.invalidateQueries({ queryKey: qk.renders(r.look_id) });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (p) => {
        queryClient.setQueryData(qk.profile, p.new as Profile);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wishlist' }, () => {
        queryClient.invalidateQueries({ queryKey: qk.wishlist });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [enabled]);
}
