-- Item codes become ZKT- like order numbers (they were ZV-). Existing codes
-- keep their digits; old /item/zv-... links still resolve (pageMeta reads a
-- zv- code as zkt-, and lookups try both forms).
CREATE OR REPLACE FUNCTION public.generate_sku()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE candidate text; attempts int := 0;
BEGIN
  IF NEW.sku IS NOT NULL AND NEW.sku <> '' THEN RETURN NEW; END IF;
  LOOP
    candidate := 'ZKT-' || lpad((floor(random() * 100000))::int::text, 5, '0');
    PERFORM 1 FROM public.listings WHERE sku = candidate;
    IF NOT FOUND THEN NEW.sku := candidate; RETURN NEW; END IF;
    attempts := attempts + 1;
    IF attempts > 20 THEN
      NEW.sku := 'ZKT-' || substr(gen_random_uuid()::text, 1, 8);
      RETURN NEW;
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_listing_sku(p_category text)
RETURNS text LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_prefix TEXT; v_sku TEXT; v_attempts INT := 0;
BEGIN
  v_prefix := CASE LOWER(COALESCE(p_category, ''))
    WHEN 'tops' THEN 'TOP' WHEN 'bottoms' THEN 'BTM' WHEN 'outerwear' THEN 'OUT'
    WHEN 'shoes' THEN 'SHO' WHEN 'accessories' THEN 'ACC' WHEN 'miscellaneous' THEN 'MSC'
    ELSE 'ITM' END;
  LOOP
    v_sku := 'ZKT-' || v_prefix || '-' || LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.listings WHERE sku = v_sku);
    v_attempts := v_attempts + 1;
    IF v_attempts > 50 THEN RAISE EXCEPTION 'Could not generate unique SKU after 50 attempts'; END IF;
  END LOOP;
  RETURN v_sku;
END;
$function$;

DO $$ BEGIN
  PERFORM set_config('zarketplace.internal', 'on', true);
  UPDATE public.listings SET sku = 'ZKT-' || substr(sku, 4) WHERE sku LIKE 'ZV-%';
  UPDATE public.orders SET listing_sku = 'ZKT-' || substr(listing_sku, 4) WHERE listing_sku LIKE 'ZV-%';
  PERFORM set_config('zarketplace.internal', 'off', true);
END $$;
