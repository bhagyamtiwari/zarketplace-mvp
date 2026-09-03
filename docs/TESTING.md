# Testing notes

## The standing rule: no test is trusted until it has failed

**A new assertion does not count as working until you have shown it failing on
the exact bug it was written for.** Write the test, then deliberately
reintroduce the defect, then watch it go red. Only then put it in CI.

This is not a style preference. Three separate green runs in this repo have
hidden real defects:

1. **The role-context tests passed because they ran as `service_role`.**
   `listings_enforce_status` raises, which broke `vendor_cancel_item` (runs as
   the vendor) and `sweep_no_ship` (runs as nobody). The MCP connection is
   `service_role` and bypasses the policies, so every path looked fine.
   *Test every path from the role that fires it in production.*

2. **The vendor half of the isolation probe printed SKIPPED for weeks.** It
   needs `TEST_VENDOR_EMAIL` / `TEST_VENDOR_PASSWORD`, and without them it
   returned early. The suite was green and reported success while covering
   only the anonymous role, which is half of what it was built for.
   *A skipped assertion must be loud. Green must not be reachable by doing
   nothing.*

3. **The contrast check passed against a build that rendered nothing.** The app
   throws `supabaseUrl is required` without its env vars, so every page was
   blank, and a check with no elements to measure finds no failures. It was
   only caught by reintroducing the bug it was written for and seeing it stay
   green. It now fails any page yielding under 20 text nodes and prints the
   count it checked.
   *An assertion that examined nothing is a failure, not a pass.*

The shape is the same every time: the test verified what we reasoned about
rather than what ships.

## Corollaries

- **Assert the inverse too.** A leak probe that only checks "the forbidden
  column is absent" passes when the endpoint returns nothing at all. Also
  assert the endpoint still serves what it is supposed to.
- **Say when you skipped.** Never return early and silently.
- **Print the size of what you checked.** A count in the success line is what
  makes a vacuous pass visible.
- **Measure the artefact, not the source.** Contrast, layout and leaks are
  properties of the rendered page or the live endpoint. `.body-longform` was
  correct read on its own and only failed against the ground it landed on.

## The suites

| File | What it asserts | Needs |
|---|---|---|
| `tests/isolation.test.ts` | No live endpoint serves vendor identity, location, asking price, spread, or buyer identity | `TEST_VENDOR_EMAIL`, `TEST_VENDOR_PASSWORD` for the vendor role |
| `tests/contrast.test.mjs` | Nothing user-facing renders below WCAG AA, at 375 and 1440 | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` at build time |
| `tests/intra-state.test.ts` | Pincode to GST state resolution | - |
| `supabase/functions/dispatch-vendor-emails/templates.test.ts` | No vendor email leaks the resale price or the spread, on a poisoned payload | - |
| `supabase/functions/send-email/templates/buyer.test.ts` | No buyer email names a vendor | - |
| `supabase/functions/shiprocket-book-leg/payload.test.ts` | No outbound payload carries a vendor address | - |
