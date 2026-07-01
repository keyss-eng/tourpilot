'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { QueryState } from '@/components/QueryState';
import { usePlans, useMe, type PublicPlan } from '@/hooks/useDashboard';
import { usePaymentMethod } from '@/hooks/usePaymentMethod';
import { money, num } from '@/lib/format';
import { cn } from '@/lib/cn';

type Cycle = 'monthly' | 'yearly';

function limitText(v: number | null): string {
  return v === null ? 'Unlimited' : num(v);
}

export default function PlansPage() {
  const plans = usePlans();
  const me = useMe();
  const currentPlan = me.data?.project.plan;

  const [cycle, setCycle] = useState<Cycle>('monthly');
  const [selected, setSelected] = useState<PublicPlan | null>(null);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Plans & pricing</h1>
          <p className="mt-0.5 text-sm text-muted">Choose a plan that fits your usage. Upgrade or cancel anytime.</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-surface border border-border p-1">
          {(['monthly', 'yearly'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCycle(c)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm capitalize transition-colors',
                cycle === c
                  ? 'bg-brand-700 text-white font-semibold shadow-sm'
                  : 'text-brand-700 dark:text-brand-300 hover:text-brand-800 dark:hover:text-white'
              )}
            >
              {c}
              {c === 'yearly' ? <span className="ml-1 text-xs text-green-400">−2 mo free</span> : null}
            </button>
          ))}
        </div>
      </div>

      <QueryState query={plans}>
        {(rows) => {
          const SUPPORT_TIERS: Record<string, string> = {
            free: 'Community support',
            starter: 'Email support',
            growth: 'Priority support',
            pro: 'Dedicated success manager',
          };

          return (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {rows.map((p) => {
                  const isCurrent = p.name === currentPlan;
                  const isGrowth = p.name === 'growth';
                  const price = cycle === 'monthly' ? p.price : p.priceYearly;
                  const buttonText = isCurrent
                    ? 'Your plan'
                    : `Upgrade to ${p.name.charAt(0).toUpperCase() + p.name.slice(1)}`;

                  return (
                    <Card
                      key={p.name}
                      className={cn(
                        'flex flex-col relative',
                        isGrowth && 'border-primary ring-1 ring-primary shadow-[0_0_20px_rgba(59,130,246,0.15)]'
                      )}
                    >
                      {isCurrent && (
                        <span className="absolute -top-2.5 left-4 rounded-full bg-brand-950 border border-brand-800/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white dark:bg-brand-600">
                          Current
                        </span>
                      )}
                      {!isCurrent && isGrowth && (
                        <span className="absolute -top-2.5 left-4 rounded-full bg-black px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white dark:bg-white dark:text-black">
                          Most popular
                        </span>
                      )}

                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-semibold capitalize">{p.name}</h3>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {p.name === 'free'
                          ? 'For testing & small projects'
                          : p.name === 'starter'
                            ? 'For growing teams'
                            : p.name === 'growth'
                              ? 'For scaling products'
                              : 'For enterprises'}
                      </p>

                      <div className="mt-3 text-2xl font-semibold">
                        {money(price)}
                        <span className="text-sm font-normal text-muted">
                          {' '}
                          /{cycle === 'monthly' ? 'mo' : 'yr'}
                        </span>
                      </div>
                      {cycle === 'yearly' && p.price > 0 ? (
                        <p className="mt-0.5 text-xs text-success">2 months free</p>
                      ) : null}

                      <ul className="mt-4 flex-1 space-y-2 text-sm text-muted">
                        <li className="flex items-center gap-2">
                          <span className="text-success">✓</span>
                          <span>
                            <span className="text-text">
                              {limitText(p.monthlyLimit)}
                            </span>{' '}
                            active users
                          </span>
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="text-success">✓</span>
                          <span>
                            <span className="text-text">
                              {limitText(p.maxToursGenerated)}
                            </span>{' '}
                            tours generated{p.maxToursGenerated !== null && ' / mo'}
                          </span>
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="text-success">✓</span>
                          <span>
                            <span className="text-text">
                              {limitText(p.maxToursShown)}
                            </span>{' '}
                            tour views{p.maxToursShown !== null && ' / mo'}
                          </span>
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="text-success">✓</span>
                          <span>{SUPPORT_TIERS[p.name] || 'Support'}</span>
                        </li>
                      </ul>

                      <button
                        disabled={isCurrent}
                        onClick={() => setSelected(p)}
                        className={cn(
                          'mt-5 w-full rounded-lg font-semibold py-2.5 transition border text-center text-sm',
                          isCurrent
                            ? 'cursor-default border-border bg-transparent text-muted shadow-none'
                            : p.name === 'pro'
                              ? 'bg-brand-700 border-brand-700 text-white hover:bg-brand-800 dark:bg-white dark:border-white dark:text-brand-950 dark:hover:bg-slate-100'
                              : 'bg-brand-700 border-brand-700 text-white hover:bg-brand-800 dark:bg-brand-700/30 dark:border-brand-600/30 dark:text-brand-200 dark:hover:bg-brand-700/50'
                        )}
                      >
                        {buttonText}
                      </button>
                    </Card>
                  );
                })}
              </div>
              <p className="mt-8 text-center text-xs text-muted">
                All paid plans are billed automatically on the 1st of each month. Prices exclude applicable taxes.
              </p>
            </>
          );
        }}
      </QueryState>

      <UpgradeModal
        plan={selected}
        cycle={cycle}
        currentPlan={currentPlan}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function UpgradeModal({
  plan,
  cycle,
  currentPlan,
  onClose,
}: {
  plan: PublicPlan | null;
  cycle: Cycle;
  currentPlan?: string;
  onClose: () => void;
}) {
  const pm = usePaymentMethod();
  const [done, setDone] = useState(false);
  const hasMethod = pm.method !== null;

  if (!plan) return null;

  const price = cycle === 'monthly' ? plan.price : plan.priceYearly;
  const per = cycle === 'monthly' ? '/mo' : '/yr';
  const close = () => {
    setDone(false);
    onClose();
  };

  return (
    <Modal open={!!plan} onClose={close} title={done ? 'Request submitted' : `Switch to ${plan.name}`}>
      {done ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success/15 text-2xl text-success">
            ✓
          </div>
          <p className="text-sm">
            Your request to move to the <span className="font-medium capitalize">{plan.name}</span>{' '}
            ({cycle}) plan has been submitted. We'll activate it shortly.
          </p>
          <button
            onClick={close}
            className="w-full rounded-lg border border-border px-4 py-2 text-sm hover:bg-white/5"
          >
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface-2 p-4 space-y-2 text-sm">
            <Row label="Plan" value={<span className="capitalize">{plan.name}</span>} />
            <Row label="Billing" value={<span className="capitalize">{cycle}</span>} />
            <Row label="Price" value={`${money(price)} ${per}`} />
            <Row label="Active users" value={limitText(plan.monthlyLimit)} />
            <Row label="Tours generated" value={limitText(plan.maxToursGenerated)} />
            <Row label="Tour views / mo" value={limitText(plan.maxToursShown)} />
            {currentPlan ? (
              <p className="pt-1 text-xs text-muted">
                You're currently on the <span className="capitalize">{currentPlan}</span> plan.
              </p>
            ) : null}
          </div>

          {hasMethod ? (
            <button
              onClick={() => setDone(true)}
              className="w-full rounded-lg bg-brand-700 hover:bg-brand-800 text-white font-semibold py-2.5 transition"
            >
              Confirm — {money(price)} {per}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                <span>⚠</span>
                <span>Add a payment method to switch plans.</span>
              </div>
              <Link
                href="/billing"
                onClick={close}
                className="block w-full rounded-lg bg-brand-700 hover:bg-brand-800 text-white font-semibold py-2.5 text-center transition"
              >
                Add payment method
              </Link>
            </div>
          )}

          <p className="text-center text-xs text-muted">
            Demo flow — no charge is made and the plan changes once payments are live.
          </p>
        </div>
      )}
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
