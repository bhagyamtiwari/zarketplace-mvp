# Role-context audit

Three bugs in three sessions had the same shape: code that worked when tested,
because it was tested from a privileged connection, and would have failed or
silently done nothing in production where the caller is a vendor, an operator,
or nobody at all.

| Bug | Guard | How it failed |
| --- | --- | --- |
| Trust penalties never applied | `protect_vendor_standing` | Silently reverted the write. A trust system where every penalty is undone looks exactly like one where nobody has misbehaved. |
| Vendor cancel and NO_SHIP sweep | `listings_enforce_status` | Raised "Only admins can change listing status". Would have failed on first real use. |
| Vendor offer email | `send-email` template allowlist | Returned 400, and `sendEmail` swallowed it. Dead since deploy. |

The common cause: **a guard that asks "is the caller an admin?" cannot tell the
difference between an untrusted caller and our own code running on someone's
behalf.** `SECURITY DEFINER` changes what the code *may* do, not what
`auth.uid()` and `auth.role()` *report*.

## The escape

Our own `SECURITY DEFINER` functions set a transaction-local flag around writes
they own:

```sql
PERFORM set_config('zarketplace.internal', 'on', true);   -- dies with the txn
...
PERFORM set_config('zarketplace.internal', 'off', true);
```

Guards admit it alongside `is_admin()`. A client cannot use it: the only
functions that read it are the ones that write it, and a direct `UPDATE` from a
vendor session never sets it. Verified — a vendor still cannot change a listing
status by hand.

## Guarded triggers

| Trigger | Table | Escape | Exempts service_role | Fails how |
| --- | --- | --- | --- | --- |
| `listings_enforce_status` | listings | yes | yes | raises |
| `protect_vendor_standing` | vendors | yes | no | **silent** |
| `listings_lock_immutable` | listings | no | no | raises |
| `orders_enforce_transitions` | orders | no | yes | raises |
| `orders_lock_claim_open` | orders | no | no | raises |
| `orders_lock_package_snapshot` | orders | no | yes | raises |
| `orders_snapshot_from_listing` | orders | no | yes | raises |
| `prevent_admin_self_escalation` | profiles | no | yes | raises |
| `profiles_lock_payout_identity` | profiles | no | yes | raises |

The five without an escape are safe **today** because nothing of ours writes
those columns from an unprivileged context. They are listed because that is a
property of current callers, not of the guards, and it can change.

`protect_vendor_standing` is the only one that fails silently. Prefer raising.

## Functions, and who reaches them

Verified by executing each from the role that calls it in production.

**Vendor session** (`authenticated`, `is_admin()` false) — all confirmed working:
`accept_acquisition_offer`, `decline_acquisition_offer`, `resubmit_listing`,
`request_item_return`, `vendor_cancel_item`

**Operator only** — all confirmed *blocked* from a vendor session:
`make_acquisition_offer`, `reject_listing`, `hub_receive_item`,
`hub_accept_item`, `hub_reject_item`, `hub_advance`, `close_out_rejected_item`

**Null-role cron** (`auth.role()` null) — all confirmed working:
`sweep_no_ship`, `sweep_ship_by_reminders`, `sweep_abandonment_reminders`,
`dispatch_vendor_emails`

**Triggers, inherit the writer's context:**
`record_fulfillment_failure` (has escape — writes listings and vendors),
`raise_payout_on_acceptance`, `start_ship_by_clock`, `snapshot_ship_by_rule`,
`enqueue_vendor_notification`

## Rules

1. Test from the role that calls it in production. `service_role` proves
   nothing: it is exempted by most guards and bypasses RLS.
2. When adding a guard, decide whether our own code writes that column from an
   unprivileged path. If it might, add the escape now.
3. Prefer raising to silently reverting.
4. Test setup is subject to RLS too. A fixture built under a null role can
   silently insert nothing and make a real test look like a pass — that
   happened while writing these tests.
5. Never swallow a delivery failure. The vendor outbox records failures as rows
   with an error and a retry count for exactly this reason.
