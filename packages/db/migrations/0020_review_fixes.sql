-- Independent review fixes (3 Nov 2026).
alter table quotes add column if not exists status_before_cancel text;
-- One installation ledger row per job (bookDay could insert twice after booked → awaiting_date → booked).
create unique index if not exists pay_ledger_one_install_idx on pay_ledger (quote_id) where variation_id is null;
-- Indexes for queries the app actually runs.
create index if not exists payments_quote_idx on payments (quote_id);
create index if not exists variations_quote_idx on variations (quote_id);
create index if not exists quote_photos_quote_idx on quote_photos (quote_id);
create index if not exists reviews_installer_status_idx on reviews (installer_id, status);
create index if not exists quotes_updated_idx on quotes (updated_at desc);
create index if not exists quotes_crew_date_idx on quotes (crew_id, install_date) where install_date is not null;
-- Where swallowed failures now land (Ops → Today shows the last 7 days).
create table if not exists failures (
  id uuid primary key default gen_random_uuid(),
  where_ text not null,
  message text not null,
  context jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists failures_created_idx on failures (created_at desc);
-- Email retry: failed messages are retried by the timers up to 5 times.
alter table messages add column if not exists attempts int not null default 0;
alter table messages add column if not exists last_attempt_at timestamptz;
-- Cut-off reassignment no longer ping-pongs between the same two installers.
alter table quotes add column if not exists tried_installers uuid[] not null default '{}';
