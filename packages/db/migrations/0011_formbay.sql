-- Formbay link per job, Formbay team ids, CEC model strings per SKU, and the auto-create switch (off by default).
alter table quotes add column if not exists formbay_formid text;
alter table quotes add column if not exists formbay_bstc_id text;
alter table quotes add column if not exists formbay_status text;
alter table quotes add column if not exists formbay_complete boolean;
alter table quotes add column if not exists formbay_synced_at timestamptz;
alter table quotes add column if not exists formbay_sent_payload jsonb;
alter table installers add column if not exists formbay_installer_id text;
insert into settings (key, value) values ('formbay', '{"auto_create": false}') on conflict (key) do nothing;
