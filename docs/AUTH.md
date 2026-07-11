# Authentication - zarketplace MVP

**Mode:** Email + password via Supabase Auth. No Google, no magic link.
**Roles:** every user is both a buyer AND a seller. Admin is a flag (`profiles.is_admin = true`).

Passwords must be **10+ characters with at least one letter and one digit**
(enforced client-side in `AuthModal.tsx`; Supabase enforces its own minimum too).

## How it works

1. Anyone visits the site. Browse + product pages are public.
2. To **sell**, **buy**, or open the **seller portal**, the user clicks **Sign In** in the navbar, which opens `AuthModal`.
3. The modal has two tabs:
   - **Sign in** - email + password (`signInWithPassword`).
   - **Sign up** - email + password + confirm password (`signUpWithPassword`).
4. A `profiles` row is auto-created on first sign-up (via the `trg_on_auth_user_created` trigger on `auth.users`).
5. Any pre-existing `listings`/`orders` rows created with the same email get linked to the new profile (via the `trg_link_existing_records` trigger on `profiles`). See [Backfill behaviour](#backfill-behaviour).

### Sign-up and email confirmation

Signup behaviour depends on Supabase's **Confirm email** project setting, and the
app adapts automatically via the `needsConfirmation` flag returned by
`signUpWithPassword` (`needsConfirmation = !data.session`):

- **Confirm email ON** - signup creates the account but returns no session. The
  user must click the verification link emailed to them before they can sign in.
  The modal shows that instruction.
- **Confirm email OFF** - signup returns a session and the user is logged in
  immediately; a verification link is still emailed for the badge.

The signup verification link redirects to `/auth/callback` (the `AuthCallback`
page), which establishes the session and sends the user home. `resendVerification`
re-sends that email if needed.

> **Custom confirmation email:** a branded HTML template lives at
> `supabase/templates/confirmation.html` and is wired into `supabase/config.toml`,
> but it only takes effect via `supabase config push` / locally. For production it
> must be pasted manually into **Supabase Dashboard → Authentication → Email
> Templates → Confirm signup** - a blind config push would also touch unrelated
> auth settings that show drift between local and prod. Not yet done; check before
> doing it.

### Forgot password

The reset flow (added after the original magic-link design, built from scratch):

1. In `AuthModal`, the user clicks **Forgot password?**, which switches to a
   minimal reset-request view and calls `sendPasswordReset(email)`.
2. That calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: <origin>/reset-password })`.
3. The emailed link lands the user on `/reset-password` (the `ResetPassword`
   page), where they set a new password via `updatePassword` (which calls
   `supabase.auth.updateUser({ password })`).

> **Production requirement (verify before trusting):** Supabase's redirect URL
> allow-list (**Dashboard → Authentication → URL Configuration**) must include
> `https://zarketplace.com/reset-password` (or a wildcard
> `https://zarketplace.com/**`), or the emailed reset link is rejected. This can't
> be set from the CLI. Send a real reset email in production and click through it
> to confirm the whole loop works.

## What requires sign-in?

| Action | Login required? |
|---|---|
| Browse / view product | No |
| Sell (list an item) | Yes |
| Checkout (Place Order) | Yes |
| Seller Portal | Yes |
| Admin panel | Yes + `is_admin = true` |
| My Orders | Yes |

## First-time admin setup

Sign up once with the email you want to be admin, then run this SQL:

```sql
UPDATE public.profiles SET is_admin = TRUE WHERE email = 'you@yourdomain.com';
```

Run it from Supabase Dashboard → **SQL Editor**, or via the MCP. Once you have one
admin, you can promote/demote anyone else from the **Admin → Users** tab.

The migration `20260503000007_fix_profiles_rls_recursion.sql` auto-promotes a
profile with email `contact@zarketplace.com` to admin **if and only if no admins
exist yet**. So if you sign up with that email first, you become admin
automatically.

## Supabase Dashboard checklist

1. Open the project's **Authentication → Providers** and confirm the **Email**
   provider is enabled (it is by default). Google / magic link are intentionally
   not used.
2. **Authentication → URL Configuration:**
   - **Local dev:** Site URL `http://localhost:3000`; add
     `http://localhost:3000/auth/callback` and
     `http://localhost:3000/reset-password` to the Redirect URLs allow-list.
   - **Prod:** add `https://zarketplace.com`, `https://zarketplace.com/auth/callback`,
     and `https://zarketplace.com/reset-password` (or the `https://zarketplace.com/**`
     wildcard).
3. **Email templates:** paste the branded Confirm-signup template (see the
   custom-confirmation note above) for production.
4. **Email delivery:** local dev uses Supabase's built-in mailer (check **Auth →
   Logs** if a link doesn't arrive). For production, configure SMTP under **Auth →
   SMTP Settings** (or use Supabase's hosted email for low volume).

## Profile fields exposed on `useAuth()`

```ts
const {
  user, profile, loading,
  signInWithPassword, signUpWithPassword, resendVerification,
  sendPasswordReset, updatePassword,
  signOut, refreshProfile,
} = useAuth();

profile = {
  id, email, full_name, phone, is_admin,
  default_address,            // jsonb { fullName, phone, address, city, pincode }
  seller_upi_vpa,
  seller_bank_account,
  seller_bank_ifsc,
  seller_bank_holder,
}
```

The Sell form pre-fills payout fields from `profile.*` and writes any new values
back. Checkout pre-fills the shipping address from `profile.default_address` and
saves the address used after a successful order.

## RLS policies

- `profiles_self_read`: a user can read their own row; admins can read all.
- `profiles_self_update`: a user can update their own row; admins can update any.
- The SECURITY DEFINER function `public.is_admin()` is used in policies to avoid recursion.
- `orders`, `listings`, and `seller_payouts` are RLS-enabled with ownership-scoped
  policies (buyer/seller/admin). Notably, only an admin (or a service-role caller)
  can set `orders.status = 'delivered'`, and a payout can only flip to `paid_out`
  after its review window closes - see the escrow migrations in
  `supabase/migrations/`.

## Backfill behaviour

When a user signs up:
- `listings` rows where `seller_email = profile.email` and `seller_id IS NULL` get `seller_id = profile.id`.
- `orders` rows where `buyer_email = profile.email` and `buyer_id IS NULL` get `buyer_id = profile.id`.
- `orders` rows where `seller_email = profile.email` and `seller_id IS NULL` get `seller_id = profile.id`.

This means anyone who listed or bought before auth was turned on keeps full access
to their old data on first sign-in.

## Sign-out

The user dropdown in the navbar has a Sign Out button. It calls
`supabase.auth.signOut()` and clears the local session.
