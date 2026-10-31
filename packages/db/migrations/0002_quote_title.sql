-- Customer-facing name of what was quoted (catalogue title, or the configurator's summary).
alter table quotes add column title text;
alter table quotes add column system_slug text;
