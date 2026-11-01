-- Pre-launch: send every message to hello@dfrntsolar.com.au only (Karl). Switch to live from Ops → Messages at launch.
update settings set value = '{"mode": "test", "test_to": "hello@dfrntsolar.com.au"}', updated_at = now(), updated_by = 'migration 0010'
  where key = 'email' and value->>'mode' = 'held' and updated_by is null;
