-- Storage policies for order-attachments, where the self-ship parcel photo
-- lives.
--
-- WHY THIS EXISTS: no migration in this repo has ever defined a policy on
-- storage.objects for this bucket. Whatever governs it today was configured by
-- hand in the dashboard and is not reproducible or reviewable. That was
-- survivable while the parcel photo was optional, because a failed upload was
-- invisible. It is not survivable now: with self-ship the photo is required
-- before an order can be marked shipped, so a missing INSERT policy means a
-- seller physically cannot ship, and a missing SELECT policy means the photo
-- cannot be read back when a dispute turns on it.
--
-- These are permissive policies, so they OR with anything already configured.
-- Applying this can only widen access, never revoke it, and every clause here
-- is scoped to the participants of the specific order. If dashboard policies
-- already say the same thing, this is a redundant no-op that makes the rule
-- reviewable in git.
--
-- Path contract, set by SelfShipForm in SellerPortal.tsx and the admin viewer:
--   shipments/{order_number}/{uuid}.{ext}
-- so storage.foldername(name) = ['shipments', '{order_number}'].
--
-- !!! APPLY VIA THE SUPABASE DASHBOARD SQL EDITOR, AS ONE SCRIPT. !!!

begin;

-- Private bucket. Objects are read through short-lived signed URLs, never a
-- public path: a parcel photo carries a shipping label with the buyer's name
-- and address on it. Also capped and restricted to web image types, matching
-- the hardening applied to the other buckets in 20260712000003.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-attachments', 'order-attachments', false, 8388608,
        array['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 8388608,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

-- Helper: is the caller a party to the order this object belongs to?
-- SECURITY DEFINER because storage policies run as the caller, who has no
-- direct read on public.orders beyond their own rows anyway; this keeps the
-- check identical for buyer, seller and admin.
create or replace function public.is_order_participant(order_number_in text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
     WHERE o.order_number = order_number_in
       AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())
  ) OR public.is_admin();
$$;

revoke execute on function public.is_order_participant(text) from public;
revoke execute on function public.is_order_participant(text) from anon;
grant execute on function public.is_order_participant(text) to authenticated;

-- Upload: the seller (or buyer, who may be asked for evidence in a claim) may
-- write only under their own order's folder.
drop policy if exists order_attachments_participant_insert on storage.objects;
create policy order_attachments_participant_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'order-attachments'
    AND (storage.foldername(name))[1] = 'shipments'
    AND public.is_order_participant((storage.foldername(name))[2])
  );

-- Read: same set. This is what createSignedUrl needs in SellerPortal,
-- TrackOrder and the admin drawer.
drop policy if exists order_attachments_participant_read on storage.objects;
create policy order_attachments_participant_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'order-attachments'
    AND (storage.foldername(name))[1] = 'shipments'
    AND public.is_order_participant((storage.foldername(name))[2])
  );

-- No UPDATE or DELETE policy, deliberately. Evidence in a dispute must not be
-- editable or removable by the party it might count against.
-- orders_lock_self_ship_evidence already freezes the pointer on the order row;
-- this stops the object underneath it being swapped out. Admins act through
-- the service role, which bypasses RLS entirely.

commit;
