-- The exact agreement and privacy wording each customer signed, and the tax invoice number once paid.
alter table quotes add column if not exists agreement_version text;
alter table quotes add column if not exists invoice_number text unique;
create sequence if not exists invoice_seq start 1001;
