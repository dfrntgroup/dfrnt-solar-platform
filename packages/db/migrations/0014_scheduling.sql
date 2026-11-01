-- Install scheduling (S1–S7): installer profiles, crews with Google calendars, live-day bookings, moves, offers, job messages, booking desk.
alter table installers add column if not exists profile jsonb;              -- InstallerProfile (brands, capabilities, durations, notice, days)

create table if not exists installer_crews (
  id uuid primary key default gen_random_uuid(),
  installer_id uuid not null references installers(id) on delete cascade,
  name text not null,
  source text not null default 'none',            -- none | google | test (test installers only)
  google_email text,
  refresh_token_enc text,                          -- AES-GCM, never shown
  busy_calendar_ids text[] not null default '{primary}',
  dfrnt_calendar_id text,
  status text not null default 'not_connected',    -- not_connected | connected | error
  last_error text,
  connected_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table installer_crews enable row level security;

create table if not exists crew_busy_cache (     -- Google free/busy, cached briefly (customers see live days at booking)
  crew_id uuid primary key references installer_crews(id) on delete cascade,
  fetched_at timestamptz not null,
  range_from date not null, range_to date not null,
  busy jsonb not null
);
alter table crew_busy_cache enable row level security;

create table if not exists crew_busy_test (      -- busy blocks for test installers' crews (stand-in for Google)
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references installer_crews(id) on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz not null, label text
);
alter table crew_busy_test enable row level security;

alter table quotes add column if not exists crew_id uuid references installer_crews(id);
alter table quotes add column if not exists job_days numeric(3,1);            -- crew-days; set from the profile, corrected at the photo check
alter table quotes add column if not exists install_part text;                -- am (half-day jobs) | full
alter table quotes add column if not exists booked_via text;                  -- customer | desk | installer_offer | earlier_offer
alter table quotes add column if not exists booked_at timestamptz;
alter table quotes add column if not exists decline_until timestamptz;        -- installer can say "can't do this day" until then
alter table quotes add column if not exists google_event_id text;
alter table quotes add column if not exists rebook boolean not null default false;  -- date released (rain, decline): customer picks again
alter table quotes add column if not exists access_notes text;
alter table quotes add column if not exists desk_called_at timestamptz;
alter table quotes add column if not exists desk_notes text;

create table if not exists date_offers (          -- installer-offered days (fallback) and "an earlier day opened" offers
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  kind text not null,                             -- installer | earlier
  dates date[] not null default '{}',
  crew_id uuid references installer_crews(id),
  status text not null default 'open',            -- requested | open | taken | expired | lost
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
alter table date_offers enable row level security;
create index if not exists date_offers_open on date_offers (status, quote_id);

create table if not exists date_moves (           -- every released day, for the scorecard
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  installer_id uuid references installers(id),
  from_date date, reason text not null,           -- declined | rain | sick | parts | customer | ops
  by_type text not null, created_at timestamptz not null default now()
);
alter table date_moves enable row level security;

create table if not exists job_messages (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  author text not null,                           -- customer | installer | ops
  author_name text,
  body text not null,
  created_at timestamptz not null default now()
);
alter table job_messages enable row level security;
create index if not exists job_messages_quote on job_messages (quote_id, created_at);

insert into settings (key, value) values ('booking_desk', '{"mode": "off"}') on conflict (key) do nothing;
insert into settings (key, value) values ('scheduling', '{"gear_lead_days": 3, "decline_hours": 24, "earlier_offer_hours": 12}') on conflict (key) do nothing;
