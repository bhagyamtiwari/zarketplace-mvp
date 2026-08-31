-- Two transactions, modelled as two transactions.
--
-- The point of this schema is that someone reading it sees a PURCHASE and a
-- SALE, not one facilitated payment with a split. Concretely:
--
--   acquisitions  - zarketplace BUYS an item from a vendor. Standalone.
--   sales         - zarketplace SELLS an item to a buyer. Standalone.
--   payouts       - references an acquisition. It has no column that can hold
--                   a sale, an order or a payment id, so no future join can
--                   reintroduce the link even by accident.
--
-- A payout is caused by an accepted acquisition. Nothing else. There is
-- deliberately no foreign key, trigger, view or check anywhere below that
-- makes a payout conditional on a buyer having paid.

-- ---------------------------------------------------------------------------
-- Config. Deadlines and thresholds are rows, not constants in code.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fulfillment_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Days a vendor has to get the item to a courier once it sells.
  ship_by_days int NOT NULL DEFAULT 5,
  -- Days a rejected item sits before it can be disposed of.
  abandonment_days int NOT NULL DEFAULT 60,
  -- Trust starts here, and listing is restricted below the floor.
  trust_score_start int NOT NULL DEFAULT 100,
  trust_score_floor int NOT NULL DEFAULT 40,
  -- What each kind of failure costs a vendor.
  trust_penalty_no_ship int NOT NULL DEFAULT 25,
  trust_penalty_condition_mismatch int NOT NULL DEFAULT 20,
  trust_penalty_authenticity int NOT NULL DEFAULT 60,
  trust_penalty_vendor_cancelled int NOT NULL DEFAULT 10,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.fulfillment_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.fulfillment_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fulfillment_config_admin ON public.fulfillment_config;
CREATE POLICY fulfillment_config_admin ON public.fulfillment_config
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- vendors. The people we buy from. Never visible to a buyer, anywhere.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vendors (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  phone text,

  -- Payout identity. Read by operators and by the vendor themselves.
  upi_vpa text,
  bank_account_name text,
  bank_account_number text,
  bank_ifsc text,
  pan text,

  pickup_address jsonb,

  -- Trust. Decremented by fulfillment failures; below the floor a vendor
  -- cannot list until an operator lifts it.
  trust_score int NOT NULL DEFAULT 100,
  listing_restricted boolean NOT NULL DEFAULT false,
  restricted_at timestamptz,
  restricted_reason text,

  banned boolean NOT NULL DEFAULT false,
  banned_at timestamptz,
  banned_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendors_trust_idx ON public.vendors (trust_score);
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

-- A vendor sees and edits their own row, but never their own trust score or
-- restriction flags - those are ours. Enforced by the trigger below, since
-- RLS cannot restrict individual columns.
DROP POLICY IF EXISTS vendors_self_select ON public.vendors;
CREATE POLICY vendors_self_select ON public.vendors FOR SELECT
  USING (id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS vendors_self_update ON public.vendors;
CREATE POLICY vendors_self_update ON public.vendors FOR UPDATE
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS vendors_self_insert ON public.vendors;
CREATE POLICY vendors_self_insert ON public.vendors FOR INSERT
  WITH CHECK (id = auth.uid() OR public.is_admin());

CREATE OR REPLACE FUNCTION public.protect_vendor_standing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN
    NEW.trust_score        := OLD.trust_score;
    NEW.listing_restricted := OLD.listing_restricted;
    NEW.restricted_at      := OLD.restricted_at;
    NEW.restricted_reason  := OLD.restricted_reason;
    NEW.banned             := OLD.banned;
    NEW.banned_at          := OLD.banned_at;
    NEW.banned_reason      := OLD.banned_reason;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS vendors_protect_standing ON public.vendors;
CREATE TRIGGER vendors_protect_standing BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.protect_vendor_standing();

-- Everyone who has already listed something is a vendor.
INSERT INTO public.vendors (id, email, full_name, phone, upi_vpa, pickup_address)
SELECT p.id, u.email, p.full_name, p.phone, p.default_upi_vpa, p.pickup_address
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
 WHERE EXISTS (SELECT 1 FROM public.listings l WHERE l.seller_id = p.id)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- acquisitions. zarketplace BUYING an item. This is a complete transaction on
-- its own: a counterparty, a price, an agreement, a date.
--
-- Renamed from listing_acquisitions so the table says what it is.
-- ---------------------------------------------------------------------------
DO $rename$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname='listing_acquisitions' AND relkind='r')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='acquisitions' AND relkind='r') THEN
    ALTER TABLE public.listing_acquisitions RENAME TO acquisitions;
  END IF;
END $rename$;

-- The deployed site still queries the old name. This keeps it working across
-- the rename rather than taking production down for the length of a deploy.
--
-- security_invoker = true is the important part: the view runs as the CALLER,
-- so the row-level policies on acquisitions still apply through it. A default
-- view would run as owner and hand every vendor the expected resale and the
-- whole spread, which is the one thing this schema exists to prevent.
--
-- Drop it once nothing references listing_acquisitions.
DO $compat$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname='acquisitions' AND relkind='r')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='listing_acquisitions') THEN
    EXECUTE 'CREATE VIEW public.listing_acquisitions WITH (security_invoker = true) AS SELECT * FROM public.acquisitions';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.listing_acquisitions TO authenticated';
  END IF;
END $compat$;

ALTER TABLE public.acquisitions
  -- Hub notes: what we saw when the item arrived. Operator-only.
  ADD COLUMN IF NOT EXISTS hub_notes text,
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_into_inventory_at timestamptz,
  -- The ship-by RULE is fixed when the vendor accepts, so it can never be
  -- invented after the fact. The deadline itself is that many days from the
  -- moment the item sells, because a vendor cannot post an item nobody has
  -- bought yet.
  ADD COLUMN IF NOT EXISTS ship_by_days int,
  ADD COLUMN IF NOT EXISTS ship_by_deadline timestamptz;

CREATE INDEX IF NOT EXISTS acquisitions_ship_by_idx ON public.acquisitions (ship_by_deadline)
  WHERE ship_by_deadline IS NOT NULL;

-- Snapshot the deadline rule at the moment of acceptance.
CREATE OR REPLACE FUNCTION public.snapshot_ship_by_rule()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.offer_status = 'accepted' AND OLD.offer_status IS DISTINCT FROM 'accepted' THEN
    NEW.ship_by_days := (SELECT ship_by_days FROM public.fulfillment_config WHERE id = 1);
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS acquisitions_snapshot_ship_by ON public.acquisitions;
CREATE TRIGGER acquisitions_snapshot_ship_by BEFORE UPDATE ON public.acquisitions
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_ship_by_rule();

-- ---------------------------------------------------------------------------
-- payouts. What we owe a vendor for an item we bought.
--
-- Read the columns: there is a vendor, an acquisition, and an amount. There is
-- no order id, no sale id, no payment id and no buyer. That absence is the
-- design. A payout is caused by an accepted acquisition, and the schema gives
-- nobody a column to make it conditional on a buyer's money.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acquisition_id uuid NOT NULL UNIQUE REFERENCES public.acquisitions(listing_id) ON DELETE RESTRICT,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,

  amount numeric NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'due'
    CHECK (status IN ('due','sent','failed')),

  method text CHECK (method IS NULL OR method IN ('upi','bank_transfer')),
  reference text,
  failure_reason text,

  due_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payouts_vendor_idx ON public.payouts (vendor_id);
CREATE INDEX IF NOT EXISTS payouts_status_idx ON public.payouts (status);

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payouts_vendor_select ON public.payouts;
CREATE POLICY payouts_vendor_select ON public.payouts FOR SELECT
  USING (vendor_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS payouts_admin_write ON public.payouts;
CREATE POLICY payouts_admin_write ON public.payouts FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- A payout becomes due when we accept an item into inventory. The trigger
-- reads the acquisition and nothing else - it has no access to, and no
-- interest in, whether a buyer has paid.
CREATE OR REPLACE FUNCTION public.raise_payout_on_acceptance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.intake_status = 'accepted_into_inventory'
     AND OLD.intake_status IS DISTINCT FROM 'accepted_into_inventory' THEN
    INSERT INTO public.payouts (acquisition_id, vendor_id, amount)
    VALUES (NEW.listing_id, NEW.vendor_id, COALESCE(NEW.offer_amount, 0))
    ON CONFLICT (acquisition_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS acquisitions_raise_payout ON public.acquisitions;
CREATE TRIGGER acquisitions_raise_payout AFTER UPDATE ON public.acquisitions
  FOR EACH ROW EXECUTE FUNCTION public.raise_payout_on_acceptance();

-- ---------------------------------------------------------------------------
-- shipments. Two legs, one table. An item travels twice and the buyer only
-- ever sees the second journey.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  leg text NOT NULL CHECK (leg IN ('INBOUND','OUTBOUND')),

  courier text,
  awb text,
  label_url text,
  shiprocket_order_id text,
  shiprocket_shipment_id text,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','label_issued','picked_up','in_transit','delivered','failed','returned')),

  -- The pickup scan is what NO_SHIP keys off. Its absence by the deadline is
  -- the signal, so it is a column rather than something inferred from status.
  picked_up_at timestamptz,
  delivered_at timestamptz,
  last_status_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, leg)
);

CREATE INDEX IF NOT EXISTS shipments_awb_idx ON public.shipments (awb);
CREATE INDEX IF NOT EXISTS shipments_leg_status_idx ON public.shipments (leg, status);

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

-- A vendor may see the INBOUND leg of their own item - that is the leg they
-- are being asked to hand over. They may never see the OUTBOUND leg: it moves
-- to a buyer, and the buyer's existence is not theirs to know.
DROP POLICY IF EXISTS shipments_vendor_inbound_select ON public.shipments;
CREATE POLICY shipments_vendor_inbound_select ON public.shipments FOR SELECT
  USING (
    public.is_admin()
    OR (leg = 'INBOUND' AND EXISTS (
          SELECT 1 FROM public.acquisitions a
           WHERE a.listing_id = shipments.listing_id AND a.vendor_id = auth.uid()))
  );
DROP POLICY IF EXISTS shipments_admin_write ON public.shipments;
CREATE POLICY shipments_admin_write ON public.shipments FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- fulfillment_failures. One system, reason codes, not five separate flows.
--
-- Every reason produces the same buyer-facing outcome: a full refund and one
-- sentence that never mentions that anyone but zarketplace was involved.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fulfillment_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  -- The sale that has to be refunded, when the item had already sold. Null
  -- when the item failed before any buyer was involved.
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,

  reason text NOT NULL CHECK (reason IN (
    'NO_SHIP',              -- never dispatched by the deadline
    'VENDOR_CANCELLED',     -- vendor pulled out in-app, with a reason
    'CONDITION_MISMATCH',   -- refused at the hub
    'AUTHENTICITY_CONCERN', -- refused at the hub
    'LOST_IN_TRANSIT'
  )),
  -- Free text from the vendor on VENDOR_CANCELLED, or from an operator on a
  -- hub rejection. Never shown to a buyer.
  detail text,

  -- What the buyer is told. One sentence, identical for every reason, and it
  -- never implies a third party. Stored so it cannot drift per-case.
  buyer_message text NOT NULL DEFAULT
    'This item is no longer available - you have been refunded in full.',

  refund_status text NOT NULL DEFAULT 'pending'
    CHECK (refund_status IN ('not_applicable','pending','refunded','failed')),
  refunded_at timestamptz,

  -- Rejected-item handling. The abandonment clock starts when we tell the
  -- vendor, not when the item arrived.
  return_offered_at timestamptz,
  return_shipping_paid_by text CHECK (return_shipping_paid_by IS NULL OR return_shipping_paid_by IN ('vendor','zarketplace')),
  abandonment_deadline timestamptz,
  disposed_at timestamptz,
  disposal_method text CHECK (disposal_method IS NULL OR disposal_method IN ('donated','disposed','returned')),

  trust_penalty_applied int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS fulfillment_failures_listing_idx ON public.fulfillment_failures (listing_id);
CREATE INDEX IF NOT EXISTS fulfillment_failures_vendor_idx ON public.fulfillment_failures (vendor_id);
CREATE INDEX IF NOT EXISTS fulfillment_failures_reason_idx ON public.fulfillment_failures (reason);
CREATE INDEX IF NOT EXISTS fulfillment_failures_abandonment_idx ON public.fulfillment_failures (abandonment_deadline)
  WHERE disposed_at IS NULL;

ALTER TABLE public.fulfillment_failures ENABLE ROW LEVEL SECURITY;

-- A vendor sees failures on their own items, because two of the reason codes
-- require them to act. A buyer never queries this table at all: what they are
-- told comes from their own order, which carries only the one sentence.
DROP POLICY IF EXISTS fulfillment_failures_vendor_select ON public.fulfillment_failures;
CREATE POLICY fulfillment_failures_vendor_select ON public.fulfillment_failures FOR SELECT
  USING (vendor_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS fulfillment_failures_admin_write ON public.fulfillment_failures;
CREATE POLICY fulfillment_failures_admin_write ON public.fulfillment_failures FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
