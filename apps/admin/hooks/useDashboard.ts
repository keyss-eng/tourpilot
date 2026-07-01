'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bff } from '@/lib/api';
import type { Overview, PageRow, MauBill, ActivityEvent, Timeseries, TimeRange } from '@/types/api';

export interface Me {
  account: { id: string; email: string; role: string };
  project: { id: string; name: string; apiKey: string; allowedOrigins: string; plan: string };
}

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => bff<Me>('/auth/me') });
}

export function useOverview() {
  return useQuery({ queryKey: ['overview'], queryFn: () => bff<Overview>('/aitour/admin/overview') });
}

export function useTimeseries(range: TimeRange) {
  return useQuery({
    queryKey: ['timeseries', range],
    queryFn: () => bff<Timeseries>(`/aitour/admin/timeseries?range=${range}`),
  });
}

export function usePages(range: TimeRange = 'day') {
  return useQuery({
    queryKey: ['pages', range],
    queryFn: () => bff<{ pages: PageRow[] }>(`/aitour/admin/pages?range=${range}`).then((r) => r.pages),
  });
}

export function useMauBill(month?: string) {
  return useQuery({
    queryKey: ['mau', month ?? 'current'],
    queryFn: () => bff<MauBill>(`/aitour/billing/mau${month ? `?month=${month}` : ''}`),
  });
}

export interface PublicPlan {
  name: string;
  monthlyLimit: number | null;       // max active users
  maxToursGenerated: number | null;
  maxToursShown: number | null;
  price: number;                     // monthly, USD cents
  priceYearly: number;               // yearly, USD cents
  overagePerMau: number;
}

export function usePlans() {
  return useQuery({
    queryKey: ['plans'],
    queryFn: () => bff<{ plans: PublicPlan[] }>('/plans').then((r) => r.plans),
  });
}

export interface TourSettings {
  config: Record<string, boolean>;
  categories: { id: string; label: string; hint: string }[];
  defaults: Record<string, boolean>;
}

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => bff<TourSettings>('/aitour/admin/settings') });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: Record<string, boolean>) =>
      bff('/aitour/admin/settings', { method: 'POST', body: JSON.stringify({ config }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
}

export function useEvents(limit = 30) {
  return useQuery({
    queryKey: ['events', limit],
    queryFn: () => bff<{ events: ActivityEvent[] }>(`/aitour/admin/events?limit=${limit}`).then((r) => r.events),
  });
}
