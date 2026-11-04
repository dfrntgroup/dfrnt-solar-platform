export const BRANDS: Record<string, { name: string; line: string }> = {
  solax: { name: "SolaX", line: "Our core range: best price per kWh of the three, Australian support office, battery grows 5.1 kWh at a time. X1-VAST hybrid inverters with stackable T-BAT HS51 batteries, expandable later." },
  sungrow: { name: "Sungrow", line: "Australia's most installed residential inverter (SunWiz Awards 2026, No.1 residential inverter manufacturer) and the inverter installers voted to put on their own homes (SolarQuotes Installer's Choice 2026). SH-RS hybrid inverters with SBH modular batteries." },
  goodwe: { name: "GoodWe", line: "Our value range: biggest battery for the money. The ESA all-in-one puts the inverter and Lynx D batteries in one column; modules are 8.85 kWh, so sizes jump in bigger steps." },
};
/** Every brand pair, alphabetical, as URL slugs like goodwe-vs-solax. */
export const PAIRS = Object.keys(BRANDS).sort().flatMap((a, i, all) => all.slice(i + 1).map((b) => `${a}-vs-${b}`));
