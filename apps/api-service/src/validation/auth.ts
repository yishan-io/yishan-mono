import { nonEmptyStringSchema } from "@/validation/common";
import { z } from "zod";

export const oauthStartQuerySchema = z.object({
  mode: z.enum(["token", "cli"]).optional(),
  redirect_uri: z.string().optional(),
  state: z.string().optional(),
});

export const refreshTokenBodySchema = z.object({
  refreshToken: nonEmptyStringSchema,
});

export const revokeTokenBodySchema = z.object({
  refreshToken: nonEmptyStringSchema,
});

export type OAuthStartQueryInput = z.infer<typeof oauthStartQuerySchema>;
export type RefreshTokenBodyInput = z.infer<typeof refreshTokenBodySchema>;
export type RevokeTokenBodyInput = z.infer<typeof revokeTokenBodySchema>;
