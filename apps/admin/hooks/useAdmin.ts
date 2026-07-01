'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bff } from '@/lib/api';
import type { PageRow, ActivityEvent } from '@/types/api';

export interface AdminProject {
  id: string;
  name: string;
  email: string | null;
  plan: string;
  blocked: boolean;
  allowedOrigins: string;
  createdAt: string;
  mau: number;
  revenue: number;            // money from client (USD cents)
  tokensUsed: number;         // AI tokens consumed
  tokenCostMicroUsd: number;  // our AI spend (micro-USD)
  tokenCostCents: number;
  profit: number;             // cents
  toursGenerated: number;
  toursShown: number;
}

export interface AdminTotals {
  clients: number;
  revenue: number;
  tokensUsed: number;
  tokenCostCents: number;
  profit: number;
  toursGenerated: number;
  toursShown: number;
}

export interface AdminProjectDetail extends AdminProject {
  pagesWithTours: number;
  providerCostMicroUsd: number;
  bill: { month: string; mau: number; plan: string; planLimit: number | null; baseFee: number; overage: number; amountDue: number };
}

export interface PlanRow {
  name: string;
  monthlyLimit: number | null;
  price: number;
  overagePerMau: number;
}

export interface AdminProjectsResponse {
  range: { from: string; to: string };
  totals: AdminTotals;
  projects: AdminProject[];
}

export function useAdminProjects(from?: string, to?: string) {
  const qs = from && to ? `?from=${from}&to=${to}` : '';
  return useQuery({
    queryKey: ['admin', 'projects', from ?? '30d', to ?? 'now'],
    queryFn: () => bff<AdminProjectsResponse>(`/admin/admin/projects${qs}`),
  });
}

export interface EconPoint {
  date: string;
  costCents: number;
  tokens: number;
  tours: number;
  shown: number;
}

export function useEconomicsSeries(from: string, to: string) {
  return useQuery({
    queryKey: ['admin', 'econ-series', from, to],
    queryFn: () => bff<{ series: EconPoint[] }>(`/admin/admin/economics-series?from=${from}&to=${to}`).then((r) => r.series),
  });
}

export function useSetBlocked() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { projectId: string; blocked: boolean }) =>
      bff('/admin/admin/block', { method: 'POST', body: JSON.stringify(vars) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'projects'] }),
  });
}

export function useAdminProject(id: string) {
  return useQuery({
    queryKey: ['admin', 'project', id],
    queryFn: () => bff<AdminProjectDetail>(`/admin/admin/projects/${id}`),
    enabled: !!id,
  });
}

export function useAdminProjectPages(id: string) {
  return useQuery({
    queryKey: ['admin', 'project', id, 'pages'],
    queryFn: () => bff<{ pages: PageRow[] }>(`/admin/admin/projects/${id}/pages`).then((r) => r.pages),
    enabled: !!id,
  });
}

export function useAdminProjectEvents(id: string) {
  return useQuery({
    queryKey: ['admin', 'project', id, 'events'],
    queryFn: () => bff<{ events: ActivityEvent[] }>(`/admin/admin/projects/${id}/events?limit=30`).then((r) => r.events),
    enabled: !!id,
  });
}

export function useAdminPlans() {
  return useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: () => bff<{ plans: PlanRow[] }>('/admin/admin/plans').then((r) => r.plans),
  });
}

export function useSetPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { projectId: string; plan: string }) =>
      bff('/admin/admin/plan', { method: 'POST', body: JSON.stringify(vars) }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['admin', 'projects'] });
      qc.invalidateQueries({ queryKey: ['admin', 'project', vars.projectId] });
    },
  });
}
