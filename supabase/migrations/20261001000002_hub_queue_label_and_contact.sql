-- The hub's queue gains what an operator needs to send a label on WhatsApp
-- (seller copy promises the label "by email or WhatsApp", and until WhatsApp
-- sending is automated it goes by hand): the label link, the vendor's phone
-- and name. It also says whether the item is Instant Ship, which is already
-- on our shelf and must never have an inbound leg booked.
--
-- Columns are added at the end so CREATE OR REPLACE keeps every existing one.
-- Still security_invoker: an operator sees every row, anyone else only what
-- RLS already lets them see.
CREATE OR REPLACE VIEW public.hub_queue WITH (security_invoker = true) AS
 SELECT l.id AS listing_id,
    l.title,
    l.brand,
    l.sku,
    l.image_url,
    l.condition,
    l.has_flaws,
    l.flaws_description,
    l.description,
    l.lifecycle_state,
    l.lifecycle_updated_at,
    a.offer_amount,
    a.intake_status,
    a.hub_notes,
    a.ship_by_deadline,
    a.ship_by_deadline IS NOT NULL AND a.ship_by_deadline < now() AS ship_by_overdue,
    s.awb,
    s.courier,
    s.status AS inbound_status,
    s.picked_up_at,
    p.id AS payout_id,
    p.status AS payout_status,
    p.amount AS payout_amount,
    s.label_url,
    COALESCE(NULLIF(btrim(l.pickup_address ->> 'phone'), ''), vp.phone) AS vendor_phone,
    COALESCE(NULLIF(btrim(l.pickup_address ->> 'fullName'), ''), vp.full_name) AS vendor_name,
    l.is_verified
   FROM listings l
     JOIN acquisitions a ON a.listing_id = l.id
     LEFT JOIN shipments s ON s.listing_id = l.id AND s.leg = 'INBOUND'::text
     LEFT JOIN payouts p ON p.acquisition_id = l.id
     LEFT JOIN profiles vp ON vp.id = a.vendor_id
  WHERE l.lifecycle_state = ANY (ARRAY['SOLD'::text, 'LABEL_ISSUED'::text, 'PICKED_UP'::text, 'IN_TRANSIT_INBOUND'::text, 'RECEIVED_AT_HUB'::text, 'ACCEPTED'::text, 'PAYOUT_SENT'::text, 'REPACKED'::text, 'SHIPPED_OUTBOUND'::text]);
