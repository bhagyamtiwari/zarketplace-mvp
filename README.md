<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# zarketplace MVP

Resale marketplace for pre-owned fashion. React + Vite frontend, Supabase backend, Razorpay payments.

## Quick start

```bash
npm install
cp docs/env.example.txt .env.local   # then fill in Supabase keys
npm run dev
```

## Docs

- **[`docs/SETUP.md`](docs/SETUP.md)** - full step-by-step setup, migrations, edge function deploys, smoke test
- **[`docs/AUTH.md`](docs/AUTH.md)** - email + password auth (with forgot-password reset), roles, RLS, admin promotion
- **[`docs/PAYMENTS.md`](docs/PAYMENTS.md)** - Razorpay payment + escrow payout flow, refunds, going-to-prod
- **[`docs/SHIPPING.md`](docs/SHIPPING.md)** - current shipping flow, Shiprocket upgrade plan
- **[`docs/CHANGES.md`](docs/CHANGES.md)** - file-by-file changelog of MVP changes

## Architecture in 30 seconds

- **Listings** with auto-generated SKUs (`ZV-CAT-NNNNNN`).
- **Checkout** opens Razorpay; the signature-verified webhook marks the order `paid` and claims the listing (`is_sold = true`). The `seller_payouts` row is created later, when the order is marked `delivered`.
- **Buyer** tracks orders at `/track-order` (email + order #).
- **Seller** manages listings, ships items, and updates tracking at `/seller-portal`.
- **Admin** at `/admin` (password-gated) approves listings, manages orders, releases payouts, sends email campaigns.
