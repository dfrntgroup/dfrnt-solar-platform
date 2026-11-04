-- Range for launch, 4 Nov 2026: EV chargers as add-ons, offered by brand where the charger only suits one brand.
alter table addons add column if not exists requires_brand text;
insert into addons (code, name, description, supplier_cost_ex, installer_labour_ex, extra_days, active, sort, requires_brand) values
  ('EV-SOLAX-7', 'SolaX 7 kW EV charger, installed', 'Single-phase smart charger with its own circuit and RCBO. Charges from your solar first.', 565, 636.36, 0.5, true, 10, null),
  ('EV-SOLAX-22', 'SolaX 22 kW EV charger, installed', 'Works on single or three phase. Dedicated circuit, RCBO and up to 10 m cable run.', 680, 636.36, 0.5, true, 11, null),
  ('EV-SUNGROW-22', 'Sungrow 22 kW EV charger, installed', 'Pairs with your Sungrow inverter for solar-first charging. 7 m lead, dedicated circuit and RCBO.', 750, 636.36, 0.5, true, 12, 'Sungrow')
on conflict (code) do nothing;
