// Every admin action routes through writeAudit so there is a durable record of
// who changed what, when, and why. Failures are logged and swallowed - an audit
// write must never block the operational action it describes. Reads/writes are
// gated to admins by RLS (see migration admin_ops_console_foundation).
import { supabase } from './supabase';
import { log } from './log';

const alog = log('admin');

export interface AuditEntry {
  id: string;
  admin_email: string | null;
  entity: string;
  entity_id: string | null;
  action: string;
  old_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
}

interface WriteAuditArgs {
  entity: 'order' | 'listing' | 'payout' | 'user' | 'settings';
  entity_id?: string | null;
  action: string;
  old_state?: Record<string, unknown> | null;
  new_state?: Record<string, unknown> | null;
  reason?: string | null;
}

export async function writeAudit(args: WriteAuditArgs): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    await supabase.from('admin_audit_log').insert({
      admin_id: auth.user?.id ?? null,
      admin_email: auth.user?.email ?? null,
      entity: args.entity,
      entity_id: args.entity_id ?? null,
      action: args.action,
      old_state: args.old_state ?? null,
      new_state: args.new_state ?? null,
      reason: args.reason ?? null,
    });
  } catch (err) {
    alog.warn('writeAudit failed', { action: args.action, err });
  }
}
