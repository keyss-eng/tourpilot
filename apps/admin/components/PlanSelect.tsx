'use client';

import { useAdminPlans, useSetPlan } from '@/hooks/useAdmin';

// Inline plan dropdown — changes a project's tier immediately on select.
export function PlanSelect({ projectId, plan }: { projectId: string; plan: string }) {
  const plans = useAdminPlans();
  const setPlan = useSetPlan();

  return (
    <select
      value={plan}
      disabled={setPlan.isPending || plans.isLoading}
      onChange={(e) => setPlan.mutate({ projectId, plan: e.target.value })}
      className="rounded-lg border bg-bg px-2 py-1 text-xs capitalize outline-none focus:border-primary disabled:opacity-50"
    >
      {(plans.data ?? [{ name: plan } as { name: string }]).map((p) => (
        <option key={p.name} value={p.name} className="capitalize">
          {p.name}
        </option>
      ))}
    </select>
  );
}
