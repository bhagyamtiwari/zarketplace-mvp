# zarketplace - Deployment & Setup

> The full, current setup and deployment guide lives in
> **[`docs/SETUP.md`](docs/SETUP.md)** - fresh clone to working deployment,
> including migrations, edge-function deploys, secrets, and a smoke test. This
> page is a short pointer so nothing is duplicated (and can drift) here.

## The short version

1. **Install & configure.** `npm install`, then copy `docs/env.example.txt` to
   `.env.local` and fill in your Supabase keys (`VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`). See [`docs/SETUP.md`](docs/SETUP.md) §1-2.
2. **Database.** Do **not** hand-write the schema. Apply the migrations in
   `supabase/migrations/` in order - via the Supabase MCP or the SQL Editor.
   They define the real schema (profiles, listings, orders, seller_payouts,
   pricing config, escrow/delivery states, RLS). See [`docs/SETUP.md`](docs/SETUP.md) §3.
3. **Edge functions & secrets.** Deploy the functions in `supabase/functions/`
   and set their secrets (Razorpay keys, Resend key, etc.). See
   [`docs/SETUP.md`](docs/SETUP.md) §4-5.
4. **Auth.** Configure the email provider and redirect URLs (including
   `/auth/callback` and `/reset-password`). See [`docs/AUTH.md`](docs/AUTH.md).
5. **Run / build.** `npm run dev` for local, `npm run build` for production.

## Hosting

The app is a Vite + React SPA deployed to **Vercel** (production is `main`).
Set the same `VITE_*` environment variables in the Vercel project settings.

## Reference docs

- [`docs/SETUP.md`](docs/SETUP.md) - full setup & operations
- [`docs/AUTH.md`](docs/AUTH.md) - email + password auth, roles, RLS
- [`docs/SHIPPING.md`](docs/SHIPPING.md) - shipping model + Shiprocket plan
- [`docs/REALIGNMENT_PLAN.md`](docs/REALIGNMENT_PLAN.md) - locked business model
- [`BrandKit.md`](BrandKit.md) - visual/voice source of truth
