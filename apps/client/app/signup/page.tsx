'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Field, Button } from '@/components/ui/Field';
import { Brand } from '@/components/Brand';

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ projectName: '', email: '', password: '', allowedOrigins: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, allowedOrigins: form.allowedOrigins.trim() || '*' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Signup failed');
      router.replace('/overview');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-grid-fade px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Brand size="lg" />
        </div>
        <Card>
        <h1 className="mb-1 text-lg font-semibold">Create your account</h1>
        <p className="mb-6 text-sm text-muted">Start adding AI tours to your product</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Project name" value={form.projectName} onChange={set('projectName')} required />
          <Field label="Email" type="email" value={form.email} onChange={set('email')} required />
          <Field label="Password (min 8 chars)" type="password" value={form.password} onChange={set('password')} required />
          <Field
            label="Allowed origin (optional)"
            placeholder="https://yourapp.com"
            value={form.allowedOrigins}
            onChange={set('allowedOrigins')}
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Creating…' : 'Create account'}
          </Button>
        </form>
        <p className="mt-4 text-sm text-muted">
          Already have an account?{' '}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
        </Card>
      </div>
    </div>
  );
}
