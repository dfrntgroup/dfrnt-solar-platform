-- Operations: the full job lifecycle on the quote record, installers, capacity, variations, payments, messages, pay ledger.

alter type quote_status add value if not exists 'gear_ordered';
alter type quote_status add value if not exists 'delivered';
alter type quote_status add value if not exists 'on_site';
alter type quote_status add value if not exists 'variation_pending';
alter type quote_status add value if not exists 'installed';
alter type quote_status add value if not exists 'lodged';
alter type quote_status add value if not exists 'settled';
alter type quote_status add value if not exists 'complete';
alter type quote_status add value if not exists 'lapsed';
alter type quote_status add value if not exists 'declined';

create table installers (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  abn text,
  contact_name text not null,
  email text not null unique,
  phone text,
  auth_user_id uuid unique,
  postcode_ranges int4range[] not null default '{}',
  active boolean not null default false,             -- approve blocked until licence, insurance, ABN present (I6)
  is_test boolean not null default false,
  scope jsonb not null,                              -- StandardScope (I8), versioned
  capacity jsonb not null,                           -- jobsPerDay, leadDays, workingDays, blackouts
  created_at timestamptz not null default now()
);
alter table installers enable row level security;

alter table quotes
  add column site jsonb,                             -- SiteAnswers (C1/C2)
  add column installer_id uuid references installers(id),
  add column scope_version int,
  add column pricing_reasons text[],                 -- why it went to the installer (C3 exception)
  add column snapshot jsonb,                         -- frozen priced snapshot (v2) used by D1, invoice and pay
  add column priced_at timestamptz,
  add column signed_at timestamptz,
  add column signed_name text,
  add column payment_method text,
  add column payment_reference text,
  add column paid_at timestamptz,
  add column install_date date,
  add column slot_hold_until timestamptz,
  add column customer_name text,
  add column customer_phone text,
  add column cancelled_at timestamptz,
  add column cancel_reason text;
create index quotes_install_date on quotes (installer_id, install_date);

create table quote_photos (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  kind text not null,                                -- switchboard | meter | roof | battery_location | other
  path text not null,                                -- storage path (bucket 'site-photos')
  content_type text,
  bytes int,
  created_at timestamptz not null default now()
);
alter table quote_photos enable row level security;

create type variation_status as enum ('proposed', 'approved', 'declined', 'paid', 'cancelled');
create table variations (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  code text not null,
  description text not null,
  installer_cost_ex numeric(12,2) not null,
  sell_ex numeric(12,2) not null,
  gst numeric(12,2) not null,
  sell_inc numeric(12,2) not null,
  status variation_status not null default 'proposed',
  raised_by text not null,
  photos text[] not null default '{}',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
alter table variations enable row level security;

create type payment_kind as enum ('system', 'variation', 'refund', 'report');
create type payment_status as enum ('pending', 'received', 'review', 'failed', 'refunded');
create table payments (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references quotes(id),
  variation_id uuid references variations(id),
  kind payment_kind not null,
  method text not null,                              -- bank | card (Stripe, off until go-live)
  amount numeric(12,2) not null,
  reference text not null,
  status payment_status not null default 'pending',
  provider_ref text,
  created_at timestamptz not null default now(),
  received_at timestamptz
);
alter table payments enable row level security;

create type message_status as enum ('queued', 'sent', 'failed', 'held');
create table messages (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references quotes(id),
  template text not null,                            -- M1–M14
  channel text not null,                             -- email | sms
  recipient text not null,
  subject text,
  body text not null,
  status message_status not null default 'held',     -- held until Resend/Twilio are switched on
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table messages enable row level security;

create type ledger_status as enum ('accrued', 'eligible', 'approved', 'paid');
create table pay_ledger (
  id uuid primary key default gen_random_uuid(),
  installer_id uuid not null references installers(id),
  quote_id uuid not null references quotes(id),
  variation_id uuid references variations(id),
  description text not null,
  amount_ex numeric(12,2) not null,
  status ledger_status not null default 'accrued',
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table pay_ledger enable row level security;

-- Test installer for all testing (build book ch. 6). Inactive for real customers; marked is_test.
insert into installers (business_name, contact_name, email, phone, postcode_ranges, active, is_test, scope, capacity) values
  ('Test Installer Pty Ltd', 'Test Installer', 'installer+test@dfrntsolar.com.au', '0400 000 000',
   array[int4range(4000, 4300), int4range(4500, 4600)], true, true,
   '{"version":1,"maxStoreys":2,"roofTypes":["tin","tile","kliplok"],"batteryLocations":["garage","outdoor_wall","other"],"switchboardOk":true,"maxCableRunM":10,"phases":[1,3]}',
   '{"jobsPerDay":2,"leadDays":3,"workingDays":[1,2,3,4,5],"blackouts":[]}');
