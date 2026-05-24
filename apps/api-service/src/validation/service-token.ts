import { nonEmptyStringSchema } from "@/validation/common";
import { z } from "zod";

export const createServiceTokenBodySchema = z.object({
  name: nonEmptyStringSchema,
  expiresInDays: z.number().int().positive().optional(),
});

export const serviceTokenParamsSchema = z.object({
  tokenId: nonEmptyStringSchema,
});

export type CreateServiceTokenBodyInput = z.infer<typeof createServiceTokenBodySchema>;
export type ServiceTokenParamsInput = z.infer<typeof serviceTokenParamsSchema>;
