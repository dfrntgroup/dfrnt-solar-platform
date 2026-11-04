-- Pricing mode, 4 Nov 2026: installer confirms every job at launch; data to earn instant pricing later.
alter table quotes add column if not exists priced_by text;                      -- instant | installer | ops
alter table quotes add column if not exists price_changed boolean;               -- installer/ops added or changed lines when pricing
alter table quotes add column if not exists scope_result jsonb;                  -- { in_scope, reasons[], pattern } from the standard-scope check at submit
alter table quotes add column if not exists pricing_requested_at timestamptz;    -- when the job last landed with an installer to price
-- Retake (P4): a photo the installer couldn't read is superseded, never deleted; the customer re-uploads that kind only.
alter table quote_photos add column if not exists superseded_at timestamptz;
alter table quote_photos add column if not exists retake_reason text;
create index if not exists quotes_pricing_queue on quotes (status, pricing_requested_at) where status = 'pricing_installer';
