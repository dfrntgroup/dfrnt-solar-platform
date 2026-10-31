import { z } from "zod";

export const ConfigInputSchema = z.object({
  familyKey: z.string(),
  panelSku: z.string().default(""),
  panelCount: z.number().int().min(0).max(200),
  batteryModules: z.number().int().min(0).max(60),
  stacks: z.number().int().min(0).max(8).default(1),
  backup: z.enum(["none", "subboard", "whole_home"]).default("none"),
  phases: z.union([z.literal(1), z.literal(3), z.literal("unknown")]),
  postcode: z.string().regex(/^\d{4}$/),
  roofType: z.enum(["tin", "tile", "kliplok"]),
  storeys: z.number().int().min(1).max(4).default(1),
  tilt: z.boolean().default(false),
  batteryLocation: z.enum(["garage", "outdoor_wall", "other"]).default("other"),
  againstHabitableRoom: z.boolean().optional(),
  vehicleExposure: z.boolean().default(false),
  installDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  inverterSku: z.string().optional(),
  preferInverterSku: z.string().optional(),
  confirmations: z.array(z.string()).optional(),
  gridMeterChange: z.boolean().optional(),
  inverterMeterIntegration: z.boolean().optional(),
  priorBatteryClaim: z.boolean().optional(),
});

export const QuoteRequestSchema = z.object({
  config: ConfigInputSchema,
  discounts: z.object({ referral: z.number().min(0).optional(), reportCredit: z.number().min(0).optional(), bankTransferPct: z.number().min(0).max(0.05).optional() }).optional(),
  customerEmail: z.string().email().optional(),
  title: z.string().max(200).optional(),
  systemSlug: z.string().max(100).optional(),
});
export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;
