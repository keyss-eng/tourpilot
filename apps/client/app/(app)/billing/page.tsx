'use client';

import { useState } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { QueryState } from '@/components/QueryState';
import { PaymentMethodForm } from '@/components/billing/PaymentMethodForm';
import { usePaymentMethod } from '@/hooks/usePaymentMethod';
import { useMauBill } from '@/hooks/useDashboard';
import { money, num } from '@/lib/format';
import { cn } from '@/lib/cn';

const thisMonth = new Date().toISOString().slice(0, 7);

function monthLabel(ym: string): string {
  if (!ym) return '';
  const parts = ym.split('-');
  if (parts.length < 2) return '';
  const [y, m] = parts.map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

export default function BillingPage() {
  const [month, setMonth] = useState(thisMonth);
  const mau = useMauBill(month);
  const pm = usePaymentMethod();
  const [showPm, setShowPm] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const hasMethod = pm.method !== null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
        <input
          type="month"
          value={month}
          max={thisMonth}
          onChange={(e) => setMonth(e.target.value || thisMonth)}
          className="rounded-lg border border-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-primary"
        />
      </div>

      <QueryState query={mau}>
        {(b) => (
          <>
            {/* Amount due hero + pay action (payments coming soon) */}
            <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted">
                  Amount due · {monthLabel(b.month)}
                </div>
                <div className="mt-1 text-4xl font-semibold tracking-tight">{money(b.amountDue)}</div>
                <div className="mt-1 text-sm text-muted">
                  {num(b.mau)} active {b.mau === 1 ? 'user' : 'users'} · {b.plan} plan
                </div>
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <button
                  onClick={() => setShowPay(true)}
                  disabled={!hasMethod || b.amountDue === 0}
                  title={hasMethod ? '' : 'Add a payment method first'}
                  className={cn(
                    'rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors',
                    hasMethod && b.amountDue > 0
                      ? 'hover:bg-brand-700 active:scale-[0.99]'
                      : 'cursor-not-allowed opacity-50'
                  )}
                >
                  Pay now
                </button>
                {hasMethod ? (
                  <Badge tone="success">Charged to your saved card</Badge>
                ) : (
                  <Badge tone="soon">Add a payment method to pay</Badge>
                )}
              </div>
            </Card>

            {/* Auto-charge schedule info */}
            <Card className="flex items-start gap-3">
              <span className="mt-0.5 text-muted">ⓘ</span>
              <p className="text-sm text-muted">
                <strong className="text-foreground">Auto-charge schedule.</strong> Once you add a payment method, your card will be charged automatically on the <strong className="text-foreground">1st of every month</strong> for the previous month's usage. A receipt is emailed within 24 hours of each charge. Cancel or change your plan anytime before the cycle ends.
              </p>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Breakdown */}
              <Card>
                <CardTitle>Current plan</CardTitle>
                <dl className="space-y-2 text-sm">
                  <Row label="Plan" value={<span className="capitalize">{b.plan}</span>} />
                  <Row label="Plan limit" value={b.planLimit === null ? 'Unlimited' : `${num(b.planLimit)} users`} />
                  <Row label="Active users" value={num(b.mau)} />
                  <Row label="Base fee" value={money(b.baseFee)} />
                  <Row label="Usage overage" value={money(b.overage)} />
                  <div className="mt-2 border-t border-border pt-2">
                    <Row label="Total due" value={money(b.amountDue)} strong />
                  </div>
                </dl>
              </Card>

              {/* Payment method — add/remove via a local form (no backend yet) */}
              <Card>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-medium text-muted">Payment method</h3>
                  {hasMethod ? <Badge tone="success">Active</Badge> : <Badge tone="soon">Not set</Badge>}
                </div>

                {hasMethod && pm.method ? (
                  <>
                    {/* Saved method shown as a real card face (mockup style). */}
                    <div className="rounded-xl border border-white/10 bg-gradient-to-br from-brand-600 to-brand-900 p-5 text-white shadow-card">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold uppercase tracking-wider opacity-80">
                          {pm.method.type === 'card' ? 'Card' : 'UPI'}
                        </div>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-90" aria-hidden>
                          <rect x="2" y="5" width="20" height="14" rx="2" />
                          <path d="M2 10h20" />
                        </svg>
                      </div>
                      {pm.method.type === 'card' ? (
                        <>
                          <div className="mt-6 font-mono text-lg tracking-widest">•••• •••• •••• {pm.method.last4}</div>
                          <div className="mt-4 flex items-center justify-between text-xs opacity-90">
                            <div>
                              <div className="opacity-70">Cardholder</div>
                              <div className="font-medium">{pm.method.holder}</div>
                            </div>
                            <div className="text-right">
                              <div className="opacity-70">Expires</div>
                              <div className="font-medium">{pm.method.exp}</div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="mt-6 font-mono text-lg tracking-widest">{pm.method.vpa}</div>
                          <div className="mt-4 text-xs opacity-70">UPI ID · auto-pay enabled</div>
                        </>
                      )}
                    </div>

                    <div className="mt-4 rounded-lg border border-primary/20 bg-primary/10 p-3 text-sm text-text">
                      Your saved {pm.method.type === 'card' ? `card ending in ${pm.method.last4}` : 'UPI'} will be charged
                      automatically on the <span className="font-semibold">1st of each month</span> for that month&apos;s usage.
                    </div>

                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => setShowPm(true)}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-2"
                      >
                        {pm.method.type === 'card' ? 'Update card' : 'Update UPI'}
                      </button>
                      <button
                        onClick={pm.remove}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10"
                      >
                        Remove
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center rounded-xl border border-dashed border-border py-8 text-center">
                    <div className="mb-2 grid h-10 w-10 place-items-center rounded-lg bg-surface-2 text-xl">💳</div>
                    <p className="text-sm">No payment method on file</p>
                    <p className="mt-1 max-w-[20rem] text-xs text-muted">
                      Add a credit card or UPI to enable automatic monthly billing. You won't be charged until your usage exceeds the {b.plan} plan limit.
                    </p>
                    <button
                      onClick={() => setShowPm(true)}
                      className="mt-4 rounded-lg border border-brand-600/50 dark:border-primary/50 px-4 py-2 text-sm text-brand-600 dark:text-primary hover:bg-brand-600/10 dark:hover:bg-primary/10 transition-colors"
                    >
                      Add payment method
                    </button>
                    <p className="mt-3 text-xs text-muted">
                      Card will be charged on the 1st of each month for prior usage.
                    </p>
                  </div>
                )}
              </Card>
            </div>

            {/* Invoice history */}
            <Card className="p-0">
              <div className="flex items-center justify-between px-5 py-4">
                <h3 className="text-sm font-medium">Invoices</h3>
                <Badge tone="muted">{monthLabel(b.month)}</Badge>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-border text-left text-muted">
                    <th className="px-5 py-2.5 font-medium">Period</th>
                    <th className="px-5 py-2.5 font-medium">Active users</th>
                    <th className="px-5 py-2.5 text-right font-medium">Amount</th>
                    <th className="px-5 py-2.5 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-5 py-3">{monthLabel(b.month)}</td>
                    <td className="px-5 py-3">{num(b.mau)}</td>
                    <td className="px-5 py-3 text-right">{money(b.amountDue)}</td>
                    <td className="px-5 py-3 text-right">
                      {b.amountDue === 0 ? <Badge tone="success">No charge</Badge> : <Badge tone="warning">Due</Badge>}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="px-5 py-3 text-xs text-muted">
                Past invoices will appear here once monthly billing is live.
              </p>
            </Card>

            <PayModal
              open={showPay}
              onClose={() => setShowPay(false)}
              amount={b.amountDue}
              method={pm.method}
            />
          </>
        )}
      </QueryState>

      <Modal open={showPm} onClose={() => setShowPm(false)} title="Add payment method">
        <PaymentMethodForm
          onSave={(m) => {
            pm.save(m);
            setShowPm(false);
          }}
        />
      </Modal>
    </div>
  );
}

function PayModal({
  open,
  onClose,
  amount,
  method,
}: {
  open: boolean;
  onClose: () => void;
  amount: number;
  method: ReturnType<typeof usePaymentMethod>['method'];
}) {
  const [paid, setPaid] = useState(false);
  const close = () => {
    setPaid(false);
    onClose();
  };
  const where =
    method?.type === 'card'
      ? `card •••• ${method.last4}`
      : method?.type === 'upi'
        ? method.vpa
        : 'your saved method';

  return (
    <Modal open={open} onClose={close} title={paid ? 'Payment successful' : 'Confirm payment'}>
      {paid ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success/15 text-2xl text-success">
            ✓
          </div>
          <p className="text-sm">
            {money(amount)} charged to your {where}.
          </p>
          <button onClick={close} className="w-full rounded-lg border border-border px-4 py-2 text-sm hover:bg-white/5">
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface-2 p-4 text-center">
            <div className="text-xs uppercase tracking-wide text-muted">You'll be charged</div>
            <div className="mt-1 text-3xl font-semibold">{money(amount)}</div>
            <div className="mt-1 text-sm text-muted">to your {where}</div>
          </div>
          <button
            onClick={() => setPaid(true)}
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Pay {money(amount)}
          </button>
          <p className="text-center text-xs text-muted">
            Demo — no real charge is made. Live payments (Razorpay) coming soon.
          </p>
        </div>
      )}
    </Modal>
  );
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={strong ? 'font-semibold' : ''}>{value}</dd>
    </div>
  );
}
