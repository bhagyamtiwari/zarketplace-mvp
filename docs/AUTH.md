# Authentication — Zarketplace MVP

**Mode:** Email magic link via Supabase Auth.
**Roles:** every user is both a buyer AND a seller. Admin is a flag (`profiles.is_admin = true`).

## How it works

1. Anyone visits the site. Browse + product pages are public.
2. To **sell**, **buy**, or open the **seller portal**, the user clicks **Sign In** in the navbar.
3. They enter their email; Supabase sends a one-time magic link.
4. Clicking the link lands them on `/auth/callback`, which establishes the session and redirects them home.
5. A `profiles` row is auto-created on first sign-in (via the `trg_on_auth_user_created` trigger on `auth.users`).
6. Any pre-existing `listings`/`orders` rows that were created with the same email get linked to the new profile (via the `trg_link_existing_records` trigger on `profiles`).

## What requires sign-in?

| Action | Login required? |
|---|---|
| Browse / view product | No |
| Sell (list an item) | Yes |
| Checkout (Place Order) | Yes |
| Seller Portal | Yes |
| Admin panel | Yes + `is_admin = true` |
| Track Order (lookup by # + email) | No (still works as guest) |
| My Orders list (auto-show on Track Order) | Yes |

## First-time admin setup

Sign in once with the email you want to be admin, then run this SQL:

```sql
UPDATE public.profiles SET is_admin = TRUE WHERE email = 'you@yourdomain.com';
```

You can do this from Supabase Dashboard → **SQL Editor**, or via the MCP. Once you have one admin, you can promote/demote anyone else from the **Admin → Users** tab.

The migration `20260503000007_fix_profiles_rls_recursion.sql` will auto-promote a profile with email `contact@zarketplace.com` to admin **if and only if no admins exist yet**. So if you sign up with that email first, you become admin automatically.

## Supabase Dashboard checklist

1. Open https://supabase.com/dashboard/project/wfaxtxprngyrxsmahxxa/auth/providers
2. Confirm **Email** provider is enabled (it is by default).
3. **For local dev**: under Auth settings, set **Site URL** to `http://localhost:3000` and add `http://localhost:3000/auth/callback` to the **Redirect URLs** allow-list.
4. **For prod**: also add your prod domain (e.g. `https://zarketplace.com` and `https://zarketplace.com/auth/callback`).

For free local dev: Supabase ships with a built-in mailer that sends magic links. Check **Auth → Logs** if you can't find the email.

For production: configure SMTP in **Auth → SMTP Settings** (or use Supabase's hosted email — works for low volume).

## Profile fields exposed on `useAuth()`

```ts
const { user, profile, signIn, signOut, refreshProfile } = useAuth();

profile = {
  id, email, full_name, phone, is_admin,
  default_address,            // jsonb { fullName, phone, address, city, pincode }
  seller_upi_vpa,
  seller_bank_account,
  seller_bank_ifsc,
  seller_bank_holder,
}
```

The Sell form pre-fills payout fields from `profile.*` and writes any new values back. The Checkout pre-fills shipping address from `profile.default_address` and saves the address used after a successful order.

## RLS policies

- `profiles_self_read`: a user can read their own row; admins can read all.
- `profiles_self_update`: a user can update their own row; admins can update any.
- The SECURITY DEFINER function `public.is_admin()` is used in policies to avoid recursion.
- Other tables (`orders`, `listings`, `seller_payouts`, etc.) currently keep the permissive MVP policies. Tighten them once you decide whether to enforce ownership at the SQL level.

## Backfill behaviour

When a user signs up:
- `listings` rows where `seller_email = profile.email` and `seller_id IS NULL` get `seller_id = profile.id`.
- `orders` rows where `buyer_email = profile.email` and `buyer_id IS NULL` get `buyer_id = profile.id`.
- `orders` rows where `seller_email = profile.email` and `seller_id IS NULL` get `seller_id = profile.id`.

This means anyone who listed or bought before you turned on auth keeps full access to their old data on first sign-in.

## Sign-out

The user dropdown in the navbar has a Sign Out button. It calls `supabase.auth.signOut()` and clears the local session.
