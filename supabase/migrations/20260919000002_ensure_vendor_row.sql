-- vendors was backfilled once, when it was created, with everyone who had
-- listed by then. Nothing has created a vendor row since. Every submission
-- inserts an acquisition, whose item_submitted notification references
-- vendors(id), so anyone who first listed after 2026-08-31 had their whole
-- submission rolled back on a foreign key error.
--
-- A vendor is someone we have been offered an item by, so the row is created
-- at exactly that moment: before the acquisition insert, ahead of any trigger
-- that notifies them.
CREATE OR REPLACE FUNCTION public.ensure_vendor_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.vendors (id, email, full_name, phone, upi_vpa, pickup_address)
  SELECT u.id, u.email, p.full_name, p.phone, p.default_upi_vpa, p.pickup_address
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
   WHERE u.id = NEW.vendor_id
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_vendor_row() FROM PUBLIC;

DROP TRIGGER IF EXISTS acquisitions_ensure_vendor ON public.acquisitions;
CREATE TRIGGER acquisitions_ensure_vendor
  BEFORE INSERT ON public.acquisitions
  FOR EACH ROW EXECUTE FUNCTION public.ensure_vendor_row();

-- Anyone who has listed since the original backfill.
INSERT INTO public.vendors (id, email, full_name, phone, upi_vpa, pickup_address)
SELECT p.id, u.email, p.full_name, p.phone, p.default_upi_vpa, p.pickup_address
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
 WHERE EXISTS (SELECT 1 FROM public.listings l WHERE l.seller_id = p.id)
    OR EXISTS (SELECT 1 FROM public.acquisitions a WHERE a.vendor_id = p.id)
ON CONFLICT (id) DO NOTHING;
