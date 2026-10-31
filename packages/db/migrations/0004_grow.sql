-- Grow: referral and creator codes, payouts, Learn content.
create type code_kind as enum ('referral', 'creator');
create table codes (
  code text primary key,
  kind code_kind not null,
  owner_quote_id uuid references quotes(id),          -- referrer's own job (referral codes)
  creator_name text,
  creator_email text,
  discount_inc numeric(10,2) not null default 250,      -- off the friend's price, before GST
  reward numeric(10,2) not null default 250,            -- paid after the friend's install
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table codes enable row level security;

alter table quotes add column discount_code text references codes(code);

create type payout_status as enum ('accrued', 'eligible', 'paid', 'void');
create table payouts (
  id uuid primary key default gen_random_uuid(),
  code text not null references codes(code),
  quote_id uuid not null references quotes(id),
  amount numeric(10,2) not null,
  status payout_status not null default 'accrued',
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (code, quote_id)
);
alter table payouts enable row level security;

create type content_status as enum ('draft', 'published', 'archived');
create table content_items (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  summary text,
  body text not null default '',
  system_slug text,                                     -- live price module
  tags text[] not null default '{}',                    -- rule tags: a rule change flags tagged items
  status content_status not null default 'draft',
  author text,
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
alter table content_items enable row level security;

insert into content_items (slug, title, summary, body, system_slug, tags, status, author, published_at) values
('battery-rebate-2027', 'The battery rebate drops on 1 January 2027', 'What changes, what it costs you, and how to lock today''s rebate.',
'## What is changing
The Cheaper Home Batteries rebate is paid in certificates. On 1 January 2027 the number of certificates per kWh drops, and solar certificates drop too.

## What it means for a typical system
On a 10 kW solar + 15.3 kWh battery system in Brisbane, the rebate falls by about $1,070.

## How to keep today''s rebate
Secure your price before the change and book an install date on or before 31 December. Every date we offer you is inside that window.',
'solax-10kw-15kwh', '{rebate,battery}', 'published', 'DFRNT Solar', now());
