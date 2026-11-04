// Earlier versions of the file-based pricing data. A quote is always re-priced on the versions it was secured on,
// so when a file changes (new default module, new catalogue) the old version stays here, keyed by its version string.
import rules20261101 from "./data/archive/config-rules-2026-11-01.1.json";
import catalogue20261101 from "./data/archive/catalogue-2026-11-01.1.json";
import rules20261103 from "./data/archive/config-rules-2026-11-03.1.json";
import rules20261103b from "./data/archive/config-rules-2026-11-03.2.json";
import catalogue20261103b from "./data/archive/catalogue-2026-11-03.2.json";
import costs20261101 from "./data/archive/component-costs-2026-11-01.1.json";
import menu20261101 from "./data/archive/labour-menu-2026-11-01.1.json";
import catalogue20261103 from "./data/archive/catalogue-2026-11-03.1.json";
import catalogue20261104 from "./data/archive/catalogue-2026-11-04.1.json";
import type { ConfigRules } from "./config";
import type { Catalogue } from "./catalogue";
import type { ComponentCosts, LabourMenu } from "./pricing";

export const ARCHIVED_RULES: Record<string, ConfigRules> = { "2026-11-01.1": rules20261101 as unknown as ConfigRules, "2026-11-03.1": rules20261103 as unknown as ConfigRules, "2026-11-03.2": rules20261103b as unknown as ConfigRules };
export const ARCHIVED_CATALOGUES: Record<string, Catalogue> = { "2026-11-01.1": catalogue20261101 as unknown as Catalogue, "2026-11-03.1": catalogue20261103 as unknown as Catalogue, "2026-11-03.2": catalogue20261103b as unknown as Catalogue, "2026-11-04.1": catalogue20261104 as unknown as Catalogue };
export const ARCHIVED_COSTS: Record<string, ComponentCosts> = { "2026-11-01.1": costs20261101 as unknown as ComponentCosts };
export const ARCHIVED_MENUS: Record<string, LabourMenu> = { "2026-11-01.1": menu20261101 as unknown as LabourMenu };
