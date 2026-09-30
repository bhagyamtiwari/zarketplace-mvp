-- An admin account is for running the shop, not trading in it. The admin
-- portal lets an operator browse every page a buyer or a vendor sees, and this
-- is what keeps that preview from ever becoming a sale or a submission: an
-- admin cannot place an order or send an item, whatever page they are on.
-- Test purchases and test items go through ordinary customer and vendor
-- accounts.
--
-- Only inserts are refused. Everything admins already own stays as it is, and
-- operators still edit any order or listing through the admin portal.
CREATE OR REPLACE FUNCTION public.refuse_admin_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_admin() THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = CASE TG_TABLE_NAME
        WHEN 'orders' THEN 'Admin accounts cannot place orders. Use a customer account to test buying.'
        ELSE 'Admin accounts cannot send items. Use a vendor account to test selling.'
      END;
  END IF;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.refuse_admin_account() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_refuse_admin ON public.orders;
CREATE TRIGGER orders_refuse_admin
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.refuse_admin_account();

DROP TRIGGER IF EXISTS listings_refuse_admin ON public.listings;
CREATE TRIGGER listings_refuse_admin
  BEFORE INSERT ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.refuse_admin_account();
