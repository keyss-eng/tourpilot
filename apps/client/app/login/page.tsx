'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Brand } from '@/components/Brand';

const INPUT =
  'mt-1.5 w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!agreed) {
      setError('Please agree to the Privacy Policy and Terms & Conditions.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      router.replace('/overview');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-grid-fade px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Brand size="lg" />
        </div>
        <Card className="p-8 shadow-card">
          <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-muted">Sign in to manage your AI-powered product tours.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-sm font-medium">Work email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className={INPUT}
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Password</label>
                <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                  Forgot your password?
                </Link>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                className={INPUT}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="rounded border-border"
              />
              Sign me in for 30 days
            </label>

            <label className="flex items-start gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 rounded border-border"
              />
              <span>
                I have read and agree to the{' '}
                <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link> and{' '}
                <Link href="/terms" className="text-primary hover:underline">Terms &amp; Conditions</Link>.
              </span>
            </label>

            {error ? <p className="text-sm text-danger">{error}</p> : null}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-brand-600 py-2.5 font-semibold text-white transition-colors hover:bg-brand-700 active:scale-[0.99] disabled:opacity-60"
            >
              {busy ? 'Signing in…' : 'Sign in securely'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            New to aitour.keyss?{' '}
            <Link href="/signup" className="font-medium text-primary hover:underline">
              Create an account
            </Link>
          </p>
          <div className="mt-4 flex justify-center gap-4 text-xs text-muted">
            <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
            <span>·</span>
            <Link href="/terms" className="hover:underline">Terms &amp; Conditions</Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
