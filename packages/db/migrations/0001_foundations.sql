-- B0 foundations. Every write is attributable (actor + rationale + input), idempotent, and evented.
-- Row-level security is on everywhere; the server uses the service connection. Staff/customer policies arrive with their screens.

create extension if not exists pgcrypto;

-- ---------- people and agents ----------
create type staff_role as enum ('owner', 'ops', 'advice', 'content', 'installs');

create table staff (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,               -- supabase auth.users.id once invited
  name text not null,
  email text not null unique,
  roles staff_role[] not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create type perm_tier as enum ('R', 'A', 'P', 'H');

create table agents (
  id text primary key,                    -- e.g. 'adviser', 'checkout', 'ops'
  name text not null,
  owner_staff_id uuid references staff(id),
  max_tier perm_tier not null default 'R',
  monthly_spend_cap_aud numeric(10,2) not null default 0,
  enabled boolean not null default false, -- kill switch (O23)
  created_at timestamptz not null default now()
);

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  agent_id text references agents(id),
  staff_id uuid references staff(id),
  label text not null,
  key_hash text not null unique,          -- sha256 of the key; the key itself is shown once and never stored
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check ((agent_id is null) <> (staff_id is null))
);

-- ---------- audit, events, approvals ----------
create type actor_type as enum ('staff', 'agent', 'customer', 'installer', 'system');

create table audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_type actor_type not null,
  actor_id text not null,
  action text not null,                   -- API operation id, e.g. 'quotes.create'
  entity text,
  entity_id text,
  rationale text,
  input jsonb,
  result jsonb,
  dry_run boolean not null default false,
  idempotency_key text,
  unique (actor_type, actor_id, idempotency_key)
);
create index audit_log_entity on audit_log (entity, entity_id);

create table events (
  id bigserial primary key,
  at timestamptz not null default now(),
  type text not null,                     -- e.g. 'quote.created'
  entity text not null,
  entity_id text not null,
  payload jsonb not null default '{}',
  audit_id bigint references audit_log(id)
);
create index events_type_at on events (type, at);

create type approval_status as enum ('pending', 'approved', 'rejected', 'expired');

create table approvals (                  -- O22: tier-P proposals wait here for a human
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  proposer_type actor_type not null,
  proposer_id text not null,
  action text not null,
  payload jsonb not null,
  rationale text not null,
  diff jsonb,
  status approval_status not null default 'pending',
  decided_by uuid references staff(id),
  decided_at timestamptz,
  decision_note text,
  check (status = 'pending' or decided_by is not null)
);
create index approvals_pending on approvals (status, created_at) where status = 'pending';

-- ---------- quotes ----------
create type quote_status as enum ('saved', 'secured', 'pricing_instant', 'pricing_installer', 'tech_review', 'priced',
  'signed', 'payment_pending', 'payment_review', 'awaiting_date', 'booked', 'cancelled', 'expired');

create table quotes (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(gen_random_bytes(18), 'hex'),  -- customer record link
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status quote_status not null default 'saved',
  input jsonb not null,
  result jsonb not null,                  -- full engine output: config, rebate, window, stack
  versions jsonb not null,                -- rules / costs / menu / rebate versions used
  amount_payable numeric(12,2) not null,
  price_inc_gst numeric(12,2) not null,
  stcs integer not null,
  lock_until date not null,
  checkout_allowed boolean not null,
  customer_email text,
  postcode text not null,
  created_by_type actor_type not null,
  created_by_id text not null
);
create index quotes_status on quotes (status, created_at);

-- ---------- RLS: deny by default ----------
alter table staff enable row level security;
alter table agents enable row level security;
alter table api_keys enable row level security;
alter table audit_log enable row level security;
alter table events enable row level security;
alter table approvals enable row level security;
alter table quotes enable row level security;
alter table _migrations enable row level security;

-- ---------- seed: staff (no logins yet; invites go out from the app) and agents (all off) ----------
insert into staff (name, email, roles) values
  ('Karl Brown', 'karl@kgbcap.com.au', '{owner}');

insert into agents (id, name, max_tier, monthly_spend_cap_aud) values
  ('adviser',  'AI adviser',  'A', 0),
  ('checkout', 'Checkout',    'P', 0),
  ('ops',      'Ops',         'P', 0),
  ('pricing',  'Pricing',     'P', 0),
  ('finance',  'Finance',     'P', 0),
  ('content',  'Content',     'P', 0),
  ('creators', 'Creator ops', 'P', 0),
  ('support',  'Support',     'P', 0);
update agents set owner_staff_id = (select id from staff where email = 'karl@kgbcap.com.au');
