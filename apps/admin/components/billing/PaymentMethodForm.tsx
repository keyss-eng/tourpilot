'use client';

import { useState } from 'react';
import { Field, Button } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import type { PaymentMethod } from '@/hooks/usePaymentMethod';

function formatCard(v: string) {
  return v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
}
function formatExp(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

export function PaymentMethodForm({ onSave }: { onSave: (m: PaymentMethod) => void }) {
  const [tab, setTab] = useState<'card' | 'upi'>('card');
  const [card, setCard] = useState({ number: '', holder: '', exp: '', cvv: '' });
  const [vpa, setVpa] = useState('');
  const [error, setError] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (tab === 'card') {
      const digits = card.number.replace(/\D/g, '');
      if (digits.length < 15) return setError('Enter a valid card number');
      if (!card.holder.trim()) return setError('Enter the cardholder name');
      if (!/^\d{2}\/\d{2}$/.test(card.exp)) return setError('Expiry must be MM/YY');
      if (card.cvv.replace(/\D/g, '').length < 3) return setError('Enter a valid CVV');
      onSave({ type: 'card', last4: digits.slice(-4), holder: card.holder.trim(), exp: card.exp });
    } else {
      if (!/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(vpa)) return setError('Enter a valid UPI ID (name@bank)');
      onSave({ type: 'upi', vpa: vpa.trim() });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex gap-1 rounded-lg border border-border bg-bg p-1">
        {(['card', 'upi'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-sm capitalize transition-colors',
              tab === t ? 'bg-primary/15 text-text' : 'text-muted hover:text-text'
            )}
          >
            {t === 'card' ? 'Card' : 'UPI'}
          </button>
        ))}
      </div>

      {tab === 'card' ? (
        <>
          <Field
            label="Card number"
            inputMode="numeric"
            placeholder="4242 4242 4242 4242"
            value={card.number}
            onChange={(e) => setCard({ ...card, number: formatCard(e.target.value) })}
          />
          <Field
            label="Cardholder name"
            placeholder="Vishal Kumar"
            value={card.holder}
            onChange={(e) => setCard({ ...card, holder: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Expiry"
              placeholder="MM/YY"
              value={card.exp}
              onChange={(e) => setCard({ ...card, exp: formatExp(e.target.value) })}
            />
            <Field
              label="CVV"
              inputMode="numeric"
              placeholder="123"
              value={card.cvv}
              onChange={(e) => setCard({ ...card, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
            />
          </div>
        </>
      ) : (
        <Field
          label="UPI ID"
          placeholder="name@okhdfcbank"
          value={vpa}
          onChange={(e) => setVpa(e.target.value)}
        />
      )}

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <Button type="submit" className="w-full">
        Save payment method
      </Button>
      <p className="text-center text-xs text-muted">
        Demo only — details are stored locally, no real charge is made.
      </p>
    </form>
  );
}
