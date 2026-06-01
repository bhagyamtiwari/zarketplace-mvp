-- Buyer note: optional free-text comment / request for the seller, captured at
-- the payment-confirmation step of checkout. Visible to admins and surfaced to
-- the seller in the "new sale" email. Never required.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_note text;
