-- Email sending: an ops-controlled mode (held | test | live) and delivery results per message.
create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table settings enable row level security;
insert into settings (key, value) values ('email', '{"mode": "held", "test_to": "karl@kgbcap.com.au"}') on conflict (key) do nothing;
alter table messages add column if not exists sent_to text;
alter table messages add column if not exists provider_id text;
alter table messages add column if not exists error text;
