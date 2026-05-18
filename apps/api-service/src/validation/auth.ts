import { nonEmptyStringSchema } from "@/validation/common";
import { z } from "zod";

export const refreshTokenBodySchema = z.object({
  refreshToken: nonEmptyStringSchema,
});

export const revokeTokenBodySchema = z.object({
  refreshToken: nonEmptyStringSchema,
});

export type RefreshTokenBodyInput = z.infer<typeof refreshTokenBodySchema>;
export type RevokeTokenBodyInput = z.infer<typeof revokeTokenBodySchema>;
