// Earlier versions of the file-based pricing data. A quote is always re-priced on the versions it was secured on,
// so when a file changes (new default module, new catalogue) the old version stays here, keyed by its version string.
import rules20261101 from "./data/archive/config-rules-2026-11-01.1.json";
import catalogue20261101 from "./data/archive/catalogue-2026-11-01.1.json";
import type { ConfigRules } from "./config";
import type { Catalogue } from "./catalogue";

export const ARCHIVED_RULES: Record<string, ConfigRules> = { "2026-11-01.1": rules20261101 as unknown as ConfigRules };
export const ARCHIVED_CATALOGUES: Record<string, Catalogue> = { "2026-11-01.1": catalogue20261101 as unknown as Catalogue };
