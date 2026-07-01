'use client';

import { useState } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { CopyBox } from '@/components/CopyBox';
import { QueryState } from '@/components/QueryState';
import { useMe } from '@/hooks/useDashboard';
import { cn } from '@/lib/cn';

const CDN = 'https://cdn.jsdelivr.net/npm/aitour-core@1.0.22/dist/index.global.js';

type Tab = 'html' | 'react' | 'wordpress';

const TABS: { id: Tab; label: string }[] = [
  { id: 'html', label: 'HTML / Script' },
  { id: 'react', label: 'React / Next.js' },
  { id: 'wordpress', label: 'WordPress / PHP' },
];

function htmlSnippet(apiKey: string) {
  return `<script src="${CDN}"></script>
<script>
  AITour.init({
    apiKey: "${apiKey}",
    userId: YOUR_USER_ID,            // your logged-in user's id
    contextKey: location.pathname,   // the current page
  });
</script>`;
}

function reactSnippet(apiKey: string) {
  return `// 1) Load the SDK once — e.g. in app/layout.tsx
import Script from "next/script";

<Script src="${CDN}" strategy="lazyOnload" />

// 2) Init with your logged-in user (client component)
"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function AITourInit({ userId }: { userId: string }) {
  const pathname = usePathname();
  useEffect(() => {
    const AITour = (window as any).AITour;
    if (!AITour || !userId) return;
    AITour.init({
      apiKey: "${apiKey}",
      userId,
      contextKey: pathname,
    });
  }, [pathname, userId]);
  return null;
}

// 3) Render it in your layout, passing the real user id:
//    <AITourInit userId={currentUser.id} />`;
}

function wordpressSnippet(apiKey: string) {
  return `<!-- Add to your theme's footer.php, before </body> -->
<script src="${CDN}"></script>
<script>
  AITour.init({
    apiKey: "${apiKey}",
    userId: "<?php echo get_current_user_id(); ?>",
    contextKey: location.pathname,
  });
</script>`;
}

const NOTES: Record<Tab, string> = {
  html: 'Paste before </body>. Replace YOUR_USER_ID with your logged-in user’s id (any unique value).',
  react: 'For SPAs with login. The component re-inits on route change and passes the real user id (accurate active-user billing).',
  wordpress: 'Paste into footer.php. get_current_user_id() returns 0 for guests — that’s fine for anonymous visitors.',
};

// Clear "what & where" steps per framework so clients know exactly where the code
// goes and what to replace.
const STEPS: Record<Tab, string[]> = {
  html: [
    'Copy the code below.',
    'Paste it just before the </body> tag in your HTML page.',
    'Replace YOUR_USER_ID with your logged-in user’s id (or any unique value for guests).',
  ],
  react: [
    'Add the <Script> tag to your root layout (e.g. app/layout.tsx).',
    'Create a file components/AITourInit.tsx and paste the component below.',
    'Render <AITourInit userId={currentUser.id} /> in your layout, passing your real user id.',
  ],
  wordpress: [
    'Open your active theme’s footer.php (Appearance → Theme File Editor).',
    'Paste the code below just before the </body> tag.',
    'Done — get_current_user_id() fills the user id automatically.',
  ],
};

export default function IntegrationPage() {
  const me = useMe();
  const [tab, setTab] = useState<Tab>('html');

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Integration</h1>
      <QueryState query={me}>
        {(d) => {
          const code =
            tab === 'html'
              ? htmlSnippet(d.project.apiKey)
              : tab === 'react'
                ? reactSnippet(d.project.apiKey)
                : wordpressSnippet(d.project.apiKey);

          return (
            <div className="space-y-6">
              <Card>
                <CardTitle>Your API key</CardTitle>
                <CopyBox value={d.project.apiKey} />
                <p className="mt-2 text-xs text-muted">
                  Public SDK key — safe to embed in your site. Scoped to origin:{' '}
                  <span className="font-mono">{d.project.allowedOrigins}</span>
                </p>
              </Card>

              <Card>
                <div className="mb-4 flex items-center justify-between gap-4">
                  <CardTitle>Install</CardTitle>
                  <div className="flex gap-1 rounded-lg border border-border bg-bg p-1">
                    {TABS.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={cn(
                          'rounded-md px-3 py-1.5 text-xs transition-colors',
                          tab === t.id ? 'bg-primary/15 text-text' : 'text-muted hover:text-text'
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <ol className="mb-4 space-y-2">
                  {STEPS[tab].map((step, i) => (
                    <li key={i} className="flex gap-2.5 text-sm">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-medium text-primary">
                        {i + 1}
                      </span>
                      <span className="text-muted">{step}</span>
                    </li>
                  ))}
                </ol>

                <CopyBox value={code} />
                <p className="mt-3 text-xs text-muted">{NOTES[tab]}</p>
              </Card>

              <Card>
                <CardTitle>Which one should I use?</CardTitle>
                <ul className="space-y-1.5 text-sm text-muted">
                  <li>
                    <span className="text-text">HTML / Script</span> — plain sites, landing pages,
                    no framework.
                  </li>
                  <li>
                    <span className="text-text">React / Next.js</span> — single-page apps with login
                    (Vue/Angular follow the same pattern).
                  </li>
                  <li>
                    <span className="text-text">WordPress / PHP</span> — server-rendered sites where
                    the user id is available in PHP.
                  </li>
                </ul>
              </Card>
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}
