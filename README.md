<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Zarketplace MVP

Resale marketplace for pre-owned fashion. React + Vite frontend, Supabase backend, Cashfree payments.

## Quick start

```bash
npm install
cp docs/env.example.txt .env.local   # then fill in Supabase keys
npm run dev
```

## Docs

- **[`docs/SETUP.md`](docs/SETUP.md)** — full step-by-step setup, migrations, edge function deploys, smoke test
- **[`docs/AUTH.md`](docs/AUTH.md)** — email magic-link auth, roles, RLS, admin promotion
- **[`docs/CASHFREE.md`](docs/CASHFREE.md)** — payment + payout flow, refunds, marketplace upgrade paths
- **[`docs/SHIPPING.md`](docs/SHIPPING.md)** — current shipping flow, Shiprocket upgrade plan
- **[`docs/CHANGES.md`](docs/CHANGES.md)** — file-by-file changelog of MVP changes

## Architecture in 30 seconds

- **Listings** with auto-generated SKUs (`ZV-CAT-NNNNNN`).
- **Checkout** opens Cashfree (sandbox); webhook flips `is_sold = true` and creates a `seller_payouts` row.
- **Buyer** tracks orders at `/track-order` (email + order #).
- **Seller** manages listings, ships items, and updates tracking at `/seller-portal`.
- **Admin** at `/admin` (password-gated) approves listings, manages orders, releases payouts, sends email campaigns.
