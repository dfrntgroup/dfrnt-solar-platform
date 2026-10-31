-- Admin: versioned pricing data, support, credits, purchase orders, STC receivables, installer profile, analytics.

-- O3 / O12: every pricing input is a versioned document. The newest active version per kind is live; new quotes only.
create table config_versions (
  id bigserial primary key,
  kind text not null check (kind in ('costs', 'menu', 'rebates', 'margins', 'catalogue', 'rules')),
  data jsonb not null,
  note text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  active boolean not null default true
);
create index config_versions_kind on config_versions (kind, id desc) where active;
alter table config_versions enable row level security;

-- O15 support tickets (A9, F2, B6 call requests)
create type ticket_status as enum ('open', 'waiting', 'closed');
create table tickets (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references quotes(id),
  kind text not null default 'question',               -- question | callback | fault | complaint
  name text, email text, phone text,
  subject text not null,
  body text not null,
  status ticket_status not null default 'open',
  assigned_to uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table ticket_replies (
  id bigserial primary key,
  ticket_id uuid not null references tickets(id) on delete cascade,
  author text not null,
  body text not null,
  internal boolean not null default false,
  created_at timestamptz not null default now()
);
alter table tickets enable row level security;
alter table ticket_replies enable row level security;

-- O16 credits (report credit $100, goodwill)
create type credit_status as enum ('issued', 'applied', 'expired', 'void');
create table credits (
  code text primary key,
  amount_inc numeric(10,2) not null,
  reason text not null,
  email text,
  status credit_status not null default 'issued',
  applied_quote_id uuid references quotes(id),
  expires_on date not null,
  created_at timestamptz not null default now()
);
alter table credits enable row level security;
alter table quotes add column credit_code text references credits(code);

-- O14 refunds: recorded against payments (kind 'refund'); Stripe executes card refunds at go-live.
alter table payments add column refund_rule text;
alter table payments add column note text;

-- O19 purchase orders
create type po_status as enum ('draft', 'approved', 'sent', 'delivered', 'cancelled');
create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  number serial unique,
  quote_id uuid not null references quotes(id),
  supplier text not null,
  lines jsonb not null,                                -- [{sku, description, qty, unit_cost}]
  total_ex numeric(12,2) not null,
  status po_status not null default 'draft',
  eta date,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz
);
alter table purchase_orders enable row level security;

-- O20 STC receivables: expected at our fixed rate vs realised when Formbay sells
create type stc_status as enum ('expected', 'lodged', 'sold', 'paid', 'failed');
create table stc_receivables (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null unique references quotes(id),
  solar_stcs int not null,
  battery_stcs int not null,
  expected_value numeric(12,2) not null,
  realised_value numeric(12,2),
  status stc_status not null default 'expected',
  formbay_ref text,
  updated_at timestamptz not null default now()
);
alter table stc_receivables enable row level security;

-- I6 installer profile
alter table installers add column licence_no text, add column insurance_expiry date, add column saa_accreditation text, add column address text;
create table technicians (
  id uuid primary key default gen_random_uuid(),
  installer_id uuid not null references installers(id) on delete cascade,
  name text not null,
  saa_number text,
  formbay_id text,
  phone text,
  is_default boolean not null default false,
  active boolean not null default true
);
create table installer_documents (
  id uuid primary key default gen_random_uuid(),
  installer_id uuid not null references installers(id) on delete cascade,
  kind text not null,                                  -- licence | insurance | saa | abn | other
  path text not null,
  expires_on date,
  created_at timestamptz not null default now()
);
create table installer_applications (
  id uuid primary key default gen_random_uuid(),
  business_name text not null, abn text, contact_name text not null, email text not null, phone text,
  postcodes text, licence_no text, notes text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);
alter table technicians enable row level security;
alter table installer_documents enable row level security;
alter table installer_applications enable row level security;
alter table quotes add column technician_id uuid references technicians(id);

-- Analytics events (first-party, no cookies needed)
create table analytics_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  name text not null,
  path text,
  props jsonb not null default '{}',
  session text
);
create index analytics_name_at on analytics_events (name, at);
alter table analytics_events enable row level security;

-- Saved quotes sent to an email (B5) and reminder bookkeeping for the timers
alter table quotes add column reminders jsonb not null default '{}';
