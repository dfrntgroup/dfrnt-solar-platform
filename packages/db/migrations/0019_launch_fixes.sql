-- 0019: launch audit fixes. Rebate article figure matched to the calculator (about $1,100 on 10 kW + 15.3 kWh).
update content_items set body = replace(body, 'the rebate falls by about $1,070', 'the rebate falls by about $1,100') where body like '%about $1,070%';
