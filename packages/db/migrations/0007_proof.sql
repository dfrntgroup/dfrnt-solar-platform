-- A21 reviews (real customers only, after install) and A22 real installs (customer consent + ops picks photos).
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null unique references quotes(id) on delete cascade,
  installer_id uuid references installers(id),
  rating int not null check (rating between 1 and 5),
  body text not null,
  first_name text,
  suburb text,
  status text not null default 'pending' check (status in ('pending', 'published', 'hidden')),
  reply text,
  created_at timestamptz not null default now(),
  published_at timestamptz
);
alter table reviews enable row level security;
alter table quotes add column if not exists showcase_consent boolean not null default false;
alter table quote_photos add column if not exists public boolean not null default false;
