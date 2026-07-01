# AITour / TourPilot — Monorepo

AI-powered product-tour platform. A lightweight SDK auto-generates and shows
guided product tours on any website; a backend API + dashboards manage clients,
tours, analytics and billing.

> npm SDK package: **`aitour-core`** · Live API: **https://aitour-api.vishalkumar-9ca.workers.dev**

---

## Structure

```
tourpilot/
├── apps/
│   ├── client/        # Client portal — Next.js  (port 3030)
│   └── admin/         # Super-admin portal — Next.js  (port 3040)
├── packages/
│   └── sdktoolkit/    # The embeddable SDK (published to npm as aitour-core)
├── services/
│   └── api/           # Backend — Cloudflare Worker (Hono + Drizzle + D1)
├── package.json       # workspace root
├── pnpm-workspace.yaml
└── turbo.json
```

---

## Prerequisites

- Node.js ≥ 18
- npm (workspaces) — or pnpm
- A Cloudflare account(for the backend: Workers + D1 + KV + AI)
- An AI key for the chosen provider (Gemini by default)

---

## 1. Install

From the repo root (installs all workspaces):

```bash
npm install
```

## 2. Backend secrets (local)

```bash
cd services/api
cp .dev.vars.example .dev.vars      # then fill in real values
```

Required secrets (see `.dev.vars.example`): `ADMIN_PASSWORD`, `ADMIN_SECRET`,
`AUTH_JWT_SECRET`, `CRAWLER_API_KEY`, and `GEMINI_API_KEY` (for the Gemini provider).

> Non-secret config (provider, admin email, rate limits, prices) is already in
> `services/api/wrangler.toml`.

## 3. Run (each in its own terminal)

```bash
# Backend (local Cloudflare Worker)
cd services/api && npx wrangler login   # first time only
npm run dev                             # http://127.0.0.1:8787

# Client portal
cd apps/client && npm run dev           # http://localhost:3030

# Admin portal
cd apps/admin && npm run dev            # http://localhost:3040
```

By default the portals talk to the **live deployed API**. To point them at a
local worker instead, set `AITOUR_API_BASE` (e.g. `http://127.0.0.1:8787/api/v1`).

## 4. Build the SDK

```bash
cd packages/sdktoolkit
npm run build           # outputs dist/ (cjs, esm, iife)
```

---

## Deploy

```bash
# Backend (needs Cloudflare access to the bound D1/KV in wrangler.toml)
cd services/api
npm run db:migrate:remote     # apply DB migrations (first deploy / new DB)
npx wrangler deploy

# Production secrets (one-time per secret)
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put ADMIN_SECRET
npx wrangler secret put AUTH_JWT_SECRET
npx wrangler secret put CRAWLER_API_KEY
npx wrangler secret put GEMINI_API_KEY
```

Publish the SDK to npm:

```bash
cd packages/sdktoolkit
npm version patch
npm publish --otp=<2FA-code>
```

---

## Notes

- Not committed (gitignored): `node_modules/`, `.next/`, `dist/`,
  `.wrangler/`, `.dev.vars` / `.env`. Each dev installs/builds these locally.
- The two portals use **separate session cookies** (`aitour_session` for client,
  `aitour_admin_session` for admin) so both can be logged in at once on localhost.
- A new Cloudflare account needs its own **D1 + KV** created, with the IDs updated
  in `services/api/wrangler.toml`.
