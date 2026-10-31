export const BRANDS: Record<string, { name: string; line: string }> = {
  solax: { name: "SolaX", line: "Our core range. X1-VAST hybrid inverters with stackable T-BAT HS51 batteries, expandable later." },
  sungrow: { name: "Sungrow", line: "The world's second-largest inverter maker. SH-RS hybrids with SBH modular batteries." },
  goodwe: { name: "GoodWe", line: "Our value range. The ESA all-in-one: inverter and Lynx D batteries in one column." },
};
/** Every brand pair, alphabetical, as URL slugs like goodwe-vs-solax. */
export const PAIRS = Object.keys(BRANDS).sort().flatMap((a, i, all) => all.slice(i + 1).map((b) => `${a}-vs-${b}`));
