'use client';

import { useEffect, useState } from 'react';

// Demo-only payment method, persisted in localStorage. No backend yet — this is
// the UI shell; real Razorpay/UPI wiring replaces the storage layer later.
export type PaymentMethod =
  | { type: 'card'; last4: string; holder: string; exp: string }
  | { type: 'upi'; vpa: string };

const KEY = 'aitour_payment_method';

export function usePaymentMethod() {
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setMethod(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  function save(m: PaymentMethod) {
    setMethod(m);
    localStorage.setItem(KEY, JSON.stringify(m));
  }

  function remove() {
    setMethod(null);
    localStorage.removeItem(KEY);
  }

  return { method, ready, save, remove };
}
