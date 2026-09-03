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

4. **A working refusal looked like a broken feature for days.** Approval was
   refusing correctly: `require_accepted_acquisition` raised the right message,
   the client caught it, and `alert()` displayed it. Every link worked. It
   still read as "approval is broken" because a browser dialog with no
   context, no next step and no trace after you dismiss it carries none of the
   information it is displaying.
   *Surfaced is not the same as reported.*

5. **An orphan scan reported every file in the project as unused.** Twice. A
   shell variable never expanded inside single quotes, so the pattern matched
   nothing and every module looked unimported. It was caught only because
   `Footer.tsx` is obviously imported, and a third implementation was needed
   before the result was trustworthy: the second still flagged all 27 pages,
   because they are loaded through `React.lazy` and the pattern only looked
   for static imports.
   *A detector that flags everything is as broken as one that flags nothing.
   The tell is a result too clean, or too damning, to be true.*

The shape is the same every time: the test verified what we reasoned about
rather than what ships.

## The three ways a failure hides

Worth naming separately, because they need different defences and all three
produced findings here.

| | How it hides | What catches it |
|---|---|---|
| **Silence** | The operation fails and nothing says so. A 400 swallowed by a helper, a trigger reverting a write, an email template that was never registered. | Assert the outcome, not the call. Check the row, the endpoint, the rendered page. |
| **Vacuous green** | The check runs, finds nothing to check, and reports success. A skipped test, a blank page, an empty result set. | Make the check fail when it examined nothing. Print the size of what was checked. |
| **Implausible result** | The check runs and returns an answer nobody sanity-checks. Everything passes, or everything fails. | Before believing a result, find one item you already know the answer for and confirm the tool agrees. |
| **Surfaced without information** | The failure IS reported, in a form that carries none of the meaning. A browser `alert()`, a generic 500, a message with no next step. | State what happened and what to do next, in place, where the action was taken. |

The third is the one that cost the most time, because it does not look like a
missing signal. It looks like a working feature that does nothing.

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
