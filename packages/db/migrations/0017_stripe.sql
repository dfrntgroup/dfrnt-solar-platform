-- 0017: Stripe payments (PayTo, card, Apple/Google Pay), webhook events, finance link-out.
-- payments.provider_ref holds the Stripe PaymentIntent id (or the Refund id for refund rows).

alter table payments add column if not exists fee numeric(12,2);
alter table payments add column if not exists provider_status text;
create index if not exists payments_provider_ref on payments (provider_ref);

create table if not exists stripe_events (
  id text primary key,
  type text not null,
  object_id text,
  received_at timestamptz not null default now(),
  handled_at timestamptz,
  error text
);
alter table stripe_events enable row level security;
