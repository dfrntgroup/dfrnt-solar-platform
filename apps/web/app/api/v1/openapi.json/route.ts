import { json } from "@/lib/api";

const doc = {
  openapi: "3.1.0",
  info: { title: "DFRNT Solar API", version: "0.1.0", description: "Every action is an API operation first. Writes accept Idempotency-Key, X-Rationale and ?dry_run=true; every write is audited and evented." },
  servers: [{ url: "/api/v1" }],
  components: { securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "Agent or staff API key. Omit for public customer calls." } } },
  paths: {
    "/health": { get: { operationId: "health.get", "x-tier": "R", summary: "Engine and database versions", responses: { "200": { description: "OK" } } } },
    "/quotes": {
      post: {
        operationId: "quotes.create", "x-tier": "A", summary: "Price a configuration and save it with a 14-day / window-end lock",
        parameters: [
          { name: "Idempotency-Key", in: "header", schema: { type: "string" } },
          { name: "X-Rationale", in: "header", schema: { type: "string" } },
          { name: "dry_run", in: "query", schema: { type: "boolean" } },
        ],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["config"], properties: {
          config: { type: "object", description: "Engine ConfigInput: familyKey, panelSku, panelCount, batteryModules, stacks, backup, phases, postcode, roofType, …" },
          discounts: { type: "object", properties: { referral: { type: "number" }, reportCredit: { type: "number" }, bankTransferPct: { type: "number" } } },
          customerEmail: { type: "string", format: "email" },
        } } } } },
        responses: { "201": { description: "Created" }, "200": { description: "Replayed (same Idempotency-Key)" }, "400": { description: "Invalid" } },
      },
    },
    "/quotes/{token}": { get: { operationId: "quotes.get", "x-tier": "R", summary: "Read a saved quote by its record token", parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" }, "404": { description: "Not found" } } } },
  },
};

export const GET = () => json(doc);
