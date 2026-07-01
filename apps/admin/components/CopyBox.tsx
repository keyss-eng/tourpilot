'use client';

import { useState } from 'react';

export function CopyBox({ label, value, mono = true }: { label?: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      {label ? <div className="mb-1.5 text-sm text-muted">{label}</div> : null}
      <div className="flex items-start gap-2">
        <pre
          className={`flex-1 overflow-x-auto rounded-lg border bg-bg px-3 py-2 text-xs ${mono ? 'font-mono' : ''}`}
        >
          {value}
        </pre>
        <button
          onClick={copy}
          className="shrink-0 rounded-lg border px-3 py-2 text-xs text-muted hover:text-text"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
