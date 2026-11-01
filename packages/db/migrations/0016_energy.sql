-- Real-usage sizing (Fiskil / Consumer Data Right). One link per connection; raw reads kept 30 days, derived summary kept.
create table if not exists energy_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  quote_id uuid references quotes(id) on delete set null,
  source text not null default 'estimate',                                -- estimate | record
  email text, name text, postcode text,
  phases smallint not null default 1, has_solar boolean not null default false,
  roof_max_kw numeric(5,2),
  fiskil_end_user_id text unique, consent_id text,
  status text not null default 'new',                                     -- new | consenting | waiting | ready | fallback | failed | disconnected
  path text,                                                              -- interval | totals | bill (S7: which sizing path was used)
  fail_reason text,
  nmi text, meter_type text, state text,
  profile jsonb, tariff jsonb, sizing jsonb,
  last_pull_at timestamptz, ready_at timestamptz, consent_until timestamptz,
  revoke_status text,                                                     -- null | revoked | manual (couldn't revoke via API: do it in the console)
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists energy_links_quote on energy_links(quote_id);
alter table energy_links enable row level security;

create table if not exists energy_raw (                                   -- S5: raw half-hour reads, deleted after 30 days
  link_id uuid primary key references energy_links(id) on delete cascade,
  days jsonb not null, pulled_at timestamptz not null default now(), purge_after timestamptz not null
);
alter table energy_raw enable row level security;

create table if not exists energy_monthly (                               -- S6: grid import by month, kept for before/after
  link_id uuid not null references energy_links(id) on delete cascade,
  ym text not null, import_kwh numeric(10,1) not null, export_kwh numeric(10,1) not null default 0,
  primary key (link_id, ym)
);
alter table energy_monthly enable row level security;

create table if not exists energy_webhooks (                              -- idempotency for Fiskil events
  message_id text primary key, event text, end_user_id text, received_at timestamptz not null default now()
);
alter table energy_webhooks enable row level security;

alter table quotes add column if not exists energy_link_id uuid references energy_links(id) on delete set null;
alter table quotes add column if not exists energy_alert jsonb;            -- S6: {ym, expected, actual, raised_at}
