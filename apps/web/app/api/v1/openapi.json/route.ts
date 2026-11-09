// The OpenAPI document is generated from the operations registry (lib/operations.ts), so every operation an agent or API client
// can call is listed with its real input schema and tier, and job states are an enum (9 Nov 2026).
import { zodToJsonSchema } from "zod-to-json-schema";
import { JOB_EFFECTS, JOB_LABELS, JOB_TIERS, QUOTE, STATES } from "@dfrnt/engine";
import { json } from "@/lib/api";
import { OPERATIONS } from "@/lib/operations";

const headers = [
  { name: "Idempotency-Key", in: "header", schema: { type: "string" } },
  { name: "X-Rationale", in: "header", schema: { type: "string" } },
  { name: "dry_run", in: "query", schema: { type: "boolean" } },
];

function doc() {
  const JobState = { type: "string", enum: [...STATES], description: Object.entries(JOB_LABELS).map(([s, l]) => `${s}: ${l}`).join("; ") };
  const NextMove = { type: "object", properties: { to: { $ref: "#/components/schemas/JobState" }, label: { type: "string" }, via: { type: ["string", "null"], description: "The operation that owns this move, or null when jobs.advance may take it" }, tier: { type: "string", enum: ["A", "P", "H"] } } };
  const paths: Record<string, unknown> = {
    "/health": { get: { operationId: "health.get", "x-tier": "R", summary: "Engine and database versions", responses: { "200": { description: "OK" } } } },
    "/quotes": { post: { operationId: "quotes.create", "x-tier": "A", summary: OPERATIONS["quotes.create"]!.description, parameters: headers,
      requestBody: { required: true, content: { "application/json": { schema: zodToJsonSchema(OPERATIONS["quotes.create"]!.input, { target: "jsonSchema7", $refStrategy: "none" }) } } },
      responses: { "201": { description: "Created" }, "200": { description: "Replayed (same Idempotency-Key)" }, "400": { description: "Invalid" } } } },
    "/quotes/{token}": { get: { operationId: "quotes.get", "x-tier": "R", summary: "Read a saved quote by its record token: state, label and the allowed next moves", parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
      responses: { "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { status: { $ref: "#/components/schemas/JobState" }, status_label: { type: "string" }, next: { type: "array", items: { $ref: "#/components/schemas/NextMove" } } } } } } }, "404": { description: "Not found" } } } },
    "/mcp": { post: { operationId: "mcp", "x-tier": "R", summary: "MCP (streamable HTTP, JSON): tools/list and tools/call over the operations below. Tier P calls from an agent become proposals for a person.", responses: { "200": { description: "JSON-RPC" } } } },
  };
  const operations = Object.fromEntries(Object.entries(OPERATIONS).map(([name, op]) => [name, {
    tier: op.tier, description: op.description, input: zodToJsonSchema(op.input, { target: "jsonSchema7", $refStrategy: "none" }),
    ...(name === "jobs.advance" ? { note: "Only moves with via = null in next[] can be taken here; the others are refused with the operation to use." } : {}),
  }]));
  const edges = QUOTE.edges.map((e) => ({ from: e.from, to: e.to, via: e.effects.find((x) => !x.endsWith("!")) ?? null, tier: e.tier }));
  return {
    openapi: "3.1.0",
    info: { title: "DFRNT Solar API", version: "0.2.0", description: "Every action is an API operation first. Writes accept Idempotency-Key, X-Rationale and ?dry_run=true; every write is audited and evented. Job state changes all go through one guarded transition: see x-job-machine." },
    servers: [{ url: "/api/v1" }],
    components: { securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "Agent or staff API key. Omit for public customer calls." } }, schemas: { JobState, NextMove } },
    paths,
    "x-operations": operations,
    "x-job-machine": { states: STATES, labels: JOB_LABELS, edges, effects: JOB_EFFECTS, tiers: JOB_TIERS },
  };
}

export const GET = () => json(doc());
