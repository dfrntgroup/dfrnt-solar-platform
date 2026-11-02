-- 0018: AI agents — runtime, guardrails, control room, tests (spec 2 Nov 2026, G1–G5).
-- Agents propose by default. Each tool is off / propose / act per agent; locked rules live in code.

alter table agents add column if not exists description text;
alter table agents add column if not exists owner_name text;
alter table agents add column if not exists model text not null default 'claude-sonnet-5-5';
alter table agents add column if not exists instructions text not null default '';
alter table agents add column if not exists hours jsonb not null default '{"start": 7, "end": 21}';
alter table agents add column if not exists limits jsonb not null default '{"messages_per_customer_day": 3, "refund_max": 0, "discount_max": 0, "spend_per_day": 0}';
alter table agents add column if not exists alert_pct int not null default 80;
alter table agents add column if not exists budget_alerted_month text;

create table if not exists agent_permissions (
  agent_id text not null references agents(id) on delete cascade,
  tool text not null,
  mode text not null default 'propose' check (mode in ('off','propose','act')),
  updated_by text, updated_at timestamptz not null default now(),
  primary key (agent_id, tool)
);

create table if not exists agent_queue (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references agents(id) on delete cascade,
  trigger text not null,                 -- ticket.opened | job.message | ops.sweep | test
  ref text,                              -- ticket id, quote id …
  created_at timestamptz not null default now(),
  picked_at timestamptz, done_at timestamptz, note text
);
create index if not exists agent_queue_open on agent_queue (agent_id) where done_at is null;

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references agents(id) on delete cascade,
  trigger text not null, ref text,
  status text not null default 'running',     -- running | done | blocked | error | off | budget | test
  test boolean not null default false,
  input_tokens int not null default 0, output_tokens int not null default 0,
  cost_aud numeric(10,4) not null default 0,
  summary text, error text, trace jsonb not null default '[]',
  started_at timestamptz not null default now(), finished_at timestamptz
);
create index if not exists agent_runs_agent on agent_runs (agent_id, started_at desc);

create table if not exists agent_actions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references agent_runs(id) on delete cascade,
  agent_id text not null references agents(id) on delete cascade,
  tool text not null,
  outcome text not null,                  -- acted | proposed | blocked | approved | rejected | expired
  input jsonb not null default '{}',
  rationale text, reason text,            -- reason: why it was blocked or forced to propose
  approval_id uuid, recipient text,
  result jsonb, undo jsonb, undone_at timestamptz, edited boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists agent_actions_agent on agent_actions (agent_id, created_at desc);
create index if not exists agent_actions_recipient on agent_actions (recipient, created_at) where recipient is not null;

create table if not exists agent_test_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references agents(id) on delete cascade,
  reason text, passed int not null default 0, total int not null default 0,
  results jsonb not null default '[]', ran_at timestamptz not null default now()
);

alter table approvals add column if not exists agent_action_id uuid;
alter table approvals add column if not exists edited boolean not null default false;

-- Seeds: Support (Jeremy) and Ops (Mel), $300 a month each, propose-first.
update agents set description = 'Answers customers from their record, routes everything else', owner_name = 'Jeremy', monthly_spend_cap_aud = 300,
  instructions = 'Answer only from the customer''s record and our published pages. Plain, warm and short: three or four sentences. Use their first name. If you are not sure, say a person will reply today and route it to a person. Never guess a date, a price or a rebate amount. Never promise a refund, compensation or a change of price. Never say anything is our fault or the installer''s fault; say we are looking into it.'
  where id = 'support' and description is null;
update agents set description = 'Chases stuck jobs, missing photos and dates; drafts POs', owner_name = 'Mel', monthly_spend_cap_aud = 300,
  instructions = 'Each morning, look for jobs that are stuck and do the one most useful next thing for each: an internal note for the team, a short polite nudge to the customer or installer, or a purchase order draft. Do not nudge the same person twice in three days. Keep messages to two or three sentences and always say what we need and by when.'
  where id = 'ops' and description is null;

insert into agent_permissions (agent_id, tool, mode) values
  ('support', 'read_record', 'act'), ('support', 'route_to_person', 'act'),
  ('support', 'reply_to_customer', 'propose'), ('support', 'request_retake', 'propose'), ('support', 'book_call_back', 'propose'),
  ('ops', 'list_stuck_jobs', 'act'), ('ops', 'read_record', 'act'), ('ops', 'team_note', 'act'),
  ('ops', 'nudge_customer', 'propose'), ('ops', 'nudge_installer', 'propose'), ('ops', 'draft_purchase_orders', 'propose')
on conflict do nothing;
