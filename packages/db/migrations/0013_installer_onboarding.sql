-- Installer onboarding in one form: accreditation, insurance (with certificate), capacity, standard-job scope and Formbay ids.
alter table installer_applications add column if not exists saa_accreditation text;
alter table installer_applications add column if not exists insurance text;
alter table installer_applications add column if not exists insurance_expiry date;
alter table installer_applications add column if not exists insurance_doc text;
alter table installer_applications add column if not exists details jsonb;
alter table installers add column if not exists insurance text;
