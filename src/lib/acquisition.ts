// The vendor's side of an acquisition: the one rupee number they were offered,
// and where their item is.
//
// Everything internal to the spread - the expected resale, the cost
// components, the margin - is deliberately absent from this module. It is not
// filtered out here; it never arrives. The vendor reads public.vendor_offers,
// a view that does not carry those columns, and has no SELECT policy on the
// table underneath it. See migration 20260831000001.

import { supabase } from './supabase';
import { log } from './log';

const alog = log('acquisition');

export type OfferStatus =
  | 'pending_pricing'  // with us, waiting on a decision
  | 'offered'          // we made an offer, waiting on the vendor
  | 'accepted'         // agreed; the item can go live
  | 'declined'         // we said no, with reasons. Never final.
  | 'offer_rejected'   // the vendor turned our number down
  | 'expired';

export type IntakeStatus =
  | 'awaiting_pickup' | 'in_transit' | 'received'
  | 'accepted_into_inventory' | 'not_accepted' | 'paid';

/** Exactly the columns public.vendor_offers exposes. */
export interface VendorOffer {
  listing_id: string;
  asking_price: number;
  offer_amount: number | null;
  offer_status: OfferStatus;
  intake_status: IntakeStatus | null;
  /** Canned reasons we ticked when rejecting. Written to be read by the vendor. */
  review_reasons: string[] | null;
  /** Free text alongside the reasons. The exception, not the default. */
  review_note: string | null;
  reviewed_at: string | null;
  /** How many times this item has been round. 1 on first submission. */
  offer_round: number;
  not_accepted_reason: string | null;
  not_accepted_at: string | null;
  offered_at: string | null;
  offer_expires_at: string | null;
  accepted_at: string | null;
  paid_at: string | null;
}

const OFFER_COLUMNS =
  'listing_id, asking_price, offer_amount, offer_status, intake_status, ' +
  'review_note, review_reasons, reviewed_at, offer_round, ' +
  'not_accepted_reason, not_accepted_at, offered_at, offer_expires_at, accepted_at, paid_at';

export async function getVendorOffers(): Promise<VendorOffer[]> {
  const { data, error } = await supabase.from('vendor_offers').select(OFFER_COLUMNS);
  if (error) { alog.warn('vendor_offers read failed', error); return []; }
  return (data as unknown as VendorOffer[]) ?? [];
}

export async function getVendorOffer(listingId: string): Promise<VendorOffer | null> {
  const { data, error } = await supabase
    .from('vendor_offers').select(OFFER_COLUMNS).eq('listing_id', listingId).maybeSingle();
  if (error) { alog.warn('vendor_offer read failed', error); return null; }
  return (data as unknown as VendorOffer | null) ?? null;
}

// ---------------------------------------------------------------------------
// The agreement.
//
// The exact wording is stored alongside the acceptance, so a later revision of
// this text can never change what someone actually agreed to. Bump the version
// whenever a line below changes; never edit a line in place.
// ---------------------------------------------------------------------------
export const AGREEMENT_VERSION = '2026-08-31.1';

export interface AgreementClause { key: string; text: string }

export const AGREEMENT_CLAUSES: AgreementClause[] = [
  {
    key: 'genuine_and_accurate',
    text: 'I confirm this item is genuine and accurately described to the best of my knowledge.',
  },
  {
    key: 'return_shipping_payable',
    text: 'If zarketplace cannot accept this item on arrival (condition or authenticity mismatch), I can pay return shipping to have it sent back.',
  },
  {
    key: 'sixty_day_forfeit',
    text: 'If I do not claim a rejected item within 60 days, zarketplace may donate or dispose of it and I forfeit any claim to it.',
  },
];

/**
 * Accept the offer and sign the agreement. Both happen inside one database
 * function, in one transaction: there is no path that records an acceptance
 * without the agreement, or the other way round.
 */
export async function acceptOffer(listingId: string): Promise<{ offer_amount: number }> {
  const { data, error } = await supabase.rpc('accept_acquisition_offer', {
    p_listing_id: listingId,
    p_terms_version: AGREEMENT_VERSION,
    p_terms_text: AGREEMENT_CLAUSES,
    p_user_agent: typeof navigator === 'undefined' ? null : navigator.userAgent,
  });
  if (error) throw error;
  return data as { offer_amount: number };
}

/** The vendor turns our number down. The item stays theirs and can be reworked. */
export async function rejectOffer(listingId: string): Promise<void> {
  const { error } = await supabase.rpc('decline_acquisition_offer', { p_listing_id: listingId });
  if (error) throw error;
}

/**
 * Send an item back for another look, after improving it or after turning a
 * number down. An item we declined outright cannot come back this way.
 */
export async function resubmitListing(listingId: string): Promise<void> {
  const { error } = await supabase.rpc('resubmit_listing', { p_listing_id: listingId });
  if (error) throw error;
}

/** True when the vendor can rework this item and send it back. */
export function canResubmit(offer: VendorOffer | null | undefined): boolean {
  return offer?.offer_status === 'declined'
    || offer?.offer_status === 'offer_rejected'
    || offer?.offer_status === 'expired';
}

// ---------------------------------------------------------------------------
// What a vendor sees on their dashboard.
//
// Derived, never stored: a second status column would be a second source of
// truth to keep in step. Nothing here reads an order, a buyer or a resale
// price, so there is no buyer-side state that could leak through by accident.
// ---------------------------------------------------------------------------
export type VendorStatus =
  | 'awaiting_offer' | 'offer_ready' | 'declined' | 'offer_rejected' | 'offer_expired'
  | 'live' | 'sold' | 'awaiting_pickup' | 'in_transit'
  | 'received' | 'paid' | 'not_accepted';

export interface VendorStatusView {
  key: VendorStatus;
  label: string;
  detail: string;
  /** Vendor has something to do. Drives ordering and the portal's action dot. */
  needsAction: boolean;
}

const STATUS_COPY: Record<VendorStatus, { label: string; detail: string; needsAction: boolean }> = {
  awaiting_offer:  { label: 'With us',           detail: 'We will come back to you within 24 hours.', needsAction: false },
  offer_ready:     { label: 'Offer ready',       detail: 'Review what we will pay and accept it to go live.', needsAction: true },
  declined:        { label: 'Needs a change',    detail: 'Fix what we have asked for and send it back to us.', needsAction: true },
  offer_rejected:  { label: 'Offer turned down', detail: 'You can improve this item and send it back to us.', needsAction: true },
  offer_expired:   { label: 'Offer expired',     detail: 'Send it back to us and we will look again.', needsAction: true },
  live:            { label: 'Live',           detail: 'Listed and available to buy.', needsAction: false },
  sold:            { label: 'Sold',           detail: 'Bought. We will send you a prepaid label to post it to us.', needsAction: false },
  awaiting_pickup: { label: 'Awaiting pickup', detail: 'Pack it and hand it to the courier within 72 hours.', needsAction: true },
  in_transit:      { label: 'In transit',     detail: 'On its way to us.', needsAction: false },
  received:        { label: 'Received',       detail: 'With us and being checked.', needsAction: false },
  paid:            { label: 'Paid',           detail: 'Your payout has been sent.', needsAction: false },
  not_accepted:    { label: 'Not accepted',   detail: 'This item did not match its listing. Get in touch about returning it.', needsAction: true },
};

/**
 * @param listingStatus  listings.status - 'pending' | 'approved' | 'rejected'
 * @param isSold         listings.is_sold
 * @param offer          the vendor's own row from public.vendor_offers
 */
export function vendorStatus(
  listingStatus: string,
  isSold: boolean,
  offer: VendorOffer | null | undefined,
): VendorStatusView {
  // Where the physical item is outranks everything else: once an item is
  // moving, that is the only thing the vendor is actually waiting on.
  const intake = offer?.intake_status;
  if (intake) {
    const key: VendorStatus =
      intake === 'paid' ? 'paid'
      : intake === 'not_accepted' ? 'not_accepted'
      : intake === 'accepted_into_inventory' || intake === 'received' ? 'received'
      : intake === 'in_transit' ? 'in_transit'
      : 'awaiting_pickup';
    return { key, ...STATUS_COPY[key] };
  }

  // Then the offer, which is what gates going live at all.
  switch (offer?.offer_status) {
    case undefined:
    case 'pending_pricing': return { key: 'awaiting_offer', ...STATUS_COPY.awaiting_offer };
    case 'offered':         return { key: 'offer_ready', ...STATUS_COPY.offer_ready };
    case 'declined':        return { key: 'declined', ...STATUS_COPY.declined };
    case 'offer_rejected':  return { key: 'offer_rejected', ...STATUS_COPY.offer_rejected };
    case 'expired':         return { key: 'offer_expired', ...STATUS_COPY.offer_expired };
  }

  // Accepted, so it is on the shelf: sold, or waiting to be.
  if (isSold) return { key: 'sold', ...STATUS_COPY.sold };
  if (listingStatus === 'approved') return { key: 'live', ...STATUS_COPY.live };
  return { key: 'awaiting_offer', ...STATUS_COPY.awaiting_offer };
}
