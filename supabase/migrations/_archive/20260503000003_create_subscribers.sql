-- Migration: Create subscribers table for promotional email campaigns
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  source TEXT DEFAULT 'website', -- website, checkout, manual
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscribers_email ON public.subscribers(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_subscribers_active ON public.subscribers(is_active);


-- Email campaigns log (admin tracks promotional sends)
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  recipient_count INT DEFAULT 0,
  sent_at TIMESTAMPTZ,
  sent_by TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sending','sent','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Email log for transactional emails (audit trail)
CREATE TABLE IF NOT EXISTS public.email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email TEXT NOT NULL,
  template TEXT NOT NULL, -- order_confirmation, seller_notification, tracking_update, etc
  subject TEXT,
  related_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','queued')),
  provider_id TEXT, -- ID returned by Resend / Postmark
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_log_to ON public.email_log(LOWER(to_email));
CREATE INDEX IF NOT EXISTS idx_email_log_template ON public.email_log(template);
