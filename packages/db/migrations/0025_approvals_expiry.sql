-- 9 Nov 2026: a proposal can expire by the clock (system), not only by a person. The check used to demand decided_by for
-- every non-pending row, which made the daily expiry in timers.ts fail. Expired rows carry no decider.
alter table approvals drop constraint if exists approvals_check;
alter table approvals add constraint approvals_check check (status = 'pending' or status = 'expired' or decided_by is not null);
