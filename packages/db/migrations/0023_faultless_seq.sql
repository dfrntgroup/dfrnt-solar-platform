-- Faultless Solar (Gavin Wells) covers all of South East Queensland (Karl, 5 Nov 2026):
-- Brisbane, Logan, Redland 4000–4207 · Gold Coast and hinterland 4208–4287 · Ipswich, Somerset, Lockyer, Scenic Rim 4300–4347 ·
-- Moreton Bay, Sunshine Coast, Noosa, Gympie 4500–4581. Toowoomba (4350s) is not included.
do $$
declare seq int4range[] := array[int4range(4000, 4288), int4range(4300, 4348), int4range(4500, 4582)];
begin
  if exists (select 1 from installers where lower(email) = 'gavin@faultlesssolar.com.au' or business_name ilike 'faultless%') then
    update installers set postcode_ranges = seq where lower(email) = 'gavin@faultlesssolar.com.au' or business_name ilike 'faultless%';
  else
    insert into installers (business_name, contact_name, email, phone, postcode_ranges, active, is_test, scope, capacity)
    values ('Faultless Solar', 'Gavin Wells', 'gavin@faultlesssolar.com.au', '0411 167 316', seq, true, false,
      '{"version":1,"maxStoreys":2,"roofTypes":["tin","tile","kliplok"],"batteryLocations":["garage","outdoor_wall","other"],"switchboardOk":true,"maxCableRunM":10,"phases":[1,3]}',
      '{"jobsPerDay":2,"leadDays":3,"workingDays":[1,2,3,4,5],"blackouts":[]}');
  end if;
end $$;
