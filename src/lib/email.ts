// Thin wrapper around the `send-email` Supabase edge function.
// Failures are swallowed and logged; transactional emails should never block
// the primary user flow (checkout, marking shipped, etc.).

import { supabase } from './supabase';
import { log } from './log';

const elog = log('admin');

export type EmailTemplate =
  | 'order_confirmation_buyer'
  | 'order_notification_seller'
  | 'tracking_update_buyer'
  | 'custom';

interface SendEmailArgs {
  template: EmailTemplate;
  order_id?: string;
  to?: string;
  extra?: Record<string, unknown>;
}

export async function sendEmail(args: SendEmailArgs): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('send-email', { body: args });
    if (error) {
      elog.warn('sendEmail invoke error', { template: args.template, error: error.message });
      return { ok: false, error: error.message };
    }
    if (data && (data as { ok?: boolean }).ok === false) {
      elog.warn('sendEmail returned not-ok', { template: args.template, data });
      return { ok: false, error: 'provider error' };
    }
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    elog.warn('sendEmail threw', { template: args.template, msg });
    return { ok: false, error: msg };
  }
}
