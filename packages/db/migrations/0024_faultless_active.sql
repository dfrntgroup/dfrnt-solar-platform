-- Faultless Solar is live for real customers across SEQ (Karl, 5 Nov 2026: "Make active").
update installers set active = true, is_test = false where lower(email) = 'gavin@faultlesssolar.com.au' or business_name ilike 'faultless%';
