-- Conversion batch (C1–C8): three-step checkout progress, call-backs, revised designs, design-check switch, installer choice.
alter table quotes add column if not exists site_draft jsonb;              -- C1: home details saved at step 2, before the photos
alter table quotes add column if not exists checkout_at timestamptz;       -- C1/C5: last checkout step saved (drives follow-ups)
alter table quotes add column if not exists design_review boolean not null default false;  -- C8: went to an installer photo check
alter table quotes add column if not exists design_fee_status text;        -- C8: null | due | paid (only when the $99 switch is on)
alter table quotes add column if not exists revision jsonb;                -- C6: proposed design change awaiting the customer
alter table quotes add column if not exists chosen_installer_id uuid references installers(id);  -- C7

create table if not exists callbacks (                                     -- C5
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  quote_id uuid references quotes(id),
  name text not null,
  phone text not null,
  page text,
  note text,
  status text not null default 'new',                                      -- new | done
  done_at timestamptz,
  done_by text
);
alter table callbacks enable row level security;
create index if not exists callbacks_status on callbacks (status, created_at desc);

insert into settings (key, value) values ('design_check', '{"fee_on": false, "amount": 99}') on conflict (key) do nothing;
insert into settings (key, value) values ('trust', '{"founder_line": "Built by the team that grew InStyle Solar to 29,000+ installs.", "founder_video": "", "licence": "", "insurance": "", "accreditations": "", "callback_to": "hello@dfrntsolar.com.au"}') on conflict (key) do nothing;
