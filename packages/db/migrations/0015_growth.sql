-- Growth batch: ad tracking, attribution, System Record documents, campaigns, add-ons, service plan, warranty, Xero, waitlist alerts.
alter table quotes add column if not exists attribution jsonb;            -- utm, gclid, fbclid, fbp, fbc, landing page (first touch)
alter table quotes add column if not exists heard_from text;
alter table quotes add column if not exists heard_note text;
alter table quotes add column if not exists serials jsonb;                -- as installed, from Formbay
alter table quotes add column if not exists commissioned_on date;
alter table quotes add column if not exists formbay_docs_at timestamptz;
alter table quotes add column if not exists warranty jsonb;               -- {brand: {registered_at, by, ref}}

create table if not exists conversion_events (                            -- G1: one row per event per platform, sent once
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  name text not null, platform text not null, value numeric(12,2),
  status text not null default 'pending', http int, response text,
  created_at timestamptz not null default now(), sent_at timestamptz,
  unique (quote_id, name, platform)
);
alter table conversion_events enable row level security;

create table if not exists record_moves (                                 -- R0: record passed to a new owner; old link points on
  old_token text primary key, quote_id uuid not null references quotes(id) on delete cascade, moved_at timestamptz not null default now()
);
alter table record_moves enable row level security;

create table if not exists job_documents (                                -- R0/R2: documents on the System Record
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  kind text not null,                                                     -- formbay_pack | coc | stc_form | warranty_card | service_report | other
  title text not null, path text not null, content_type text, source text not null default 'ops',
  created_at timestamptz not null default now()
);
alter table job_documents enable row level security;

create table if not exists product_docs (                                 -- R0: datasheets and manuals per product (SKU)
  id uuid primary key default gen_random_uuid(),
  sku text not null, kind text not null,                                  -- datasheet | manual | warranty
  title text not null, url text, path text,
  created_at timestamptz not null default now()
);
alter table product_docs enable row level security;

alter table tickets add column if not exists postcode text;               -- G4 waitlist postcode
alter table tickets add column if not exists notified_at timestamptz;
alter table quote_photos add column if not exists ticket_id uuid references tickets(id);

create table if not exists campaigns (                                    -- G5
  id uuid primary key default gen_random_uuid(),
  name text not null, audience text not null, subject text not null, body text not null,
  status text not null default 'draft', created_by text, created_at timestamptz not null default now(), sent_at timestamptz
);
alter table campaigns enable row level security;
create table if not exists campaign_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  quote_id uuid references quotes(id) on delete set null, ticket_id uuid references tickets(id) on delete set null,
  email text not null, sent_at timestamptz not null default now(), clicked_at timestamptz,
  unique (campaign_id, email)
);
alter table campaign_sends enable row level security;
create table if not exists marketing_optout (email text primary key, at timestamptz not null default now());
alter table marketing_optout enable row level security;

create table if not exists addons (                                       -- U1
  code text primary key, name text not null, description text not null default '',
  supplier_cost_ex numeric(10,2) not null default 0, installer_labour_ex numeric(10,2) not null default 0,
  extra_days numeric(3,1) not null default 0, active boolean not null default true, sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table addons enable row level security;
create table if not exists quote_addons (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  code text not null references addons(code), name text not null, qty int not null default 1,
  supplier_cost_ex numeric(10,2) not null, installer_labour_ex numeric(10,2) not null, extra_days numeric(3,1) not null default 0,
  status text not null default 'in_quote',                                -- in_quote | after_payment | removed
  variation_id uuid references variations(id), created_at timestamptz not null default now()
);
alter table quote_addons enable row level security;

create table if not exists memberships (                                  -- R1 service plan
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  status text not null default 'pending',                                 -- pending | active | lapsed | cancelled
  price numeric(10,2) not null, reference text not null,
  started_on date, renews_on date, last_visit_on date, created_at timestamptz not null default now()
);
alter table memberships enable row level security;

create table if not exists xero_sync (                                    -- B1
  id uuid primary key default gen_random_uuid(),
  kind text not null, ref_id text not null, xero_id text, status text not null default 'pending', error text,
  created_at timestamptz not null default now(), synced_at timestamptz,
  unique (kind, ref_id)
);
alter table xero_sync enable row level security;

insert into settings (key, value) values ('service_plan', '{"on": false, "price": 0, "includes": "Yearly health check, panel clean, firmware and settings check, written report on your record."}') on conflict (key) do nothing;
insert into settings (key, value) values ('xero', '{"codes": {"sales": "", "stc": "", "installer": "", "bank": ""}}') on conflict (key) do nothing;
