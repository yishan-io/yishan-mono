import { z } from "zod";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PACKAGE_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

/** Returns whether a path is a normalized, package-relative POSIX path. */
export function isSafeRelativePath(value: string): boolean {
  return (
    value.length > 0 &&
    !value.includes("\\") &&
    !value.startsWith("/") &&
    !value.split("/").some((part) => part === "" || part === "." || part === "..")
  );
}

export type PluginConfig = null | boolean | number | string | PluginConfig[] | { [key: string]: PluginConfig };

const staticStringSchema = z
  .string()
  .refine(
    (value) =>
      !value.includes("{{") &&
      !value.includes("}}") &&
      !value.includes("=>") &&
      !/(^|[^\w$])function([^\w$]|$)/.test(value),
  );
const jsonValueSchema: z.ZodType<PluginConfig> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    staticStringSchema,
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

/** One data-only Cordis entry included directly in a plugin manifest. */
export const pluginEntrySchema = z
  .object({
    id: z.string().regex(ID_PATTERN),
    entrypoint: z.string().refine(isSafeRelativePath),
    config: jsonValueSchema.optional().default({}),
    disabled: z.boolean().optional().default(false),
    inject: z
      .union([z.array(z.string().min(1)), z.record(z.string().min(1), jsonValueSchema)])
      .optional()
      .default([]),
  })
  .strict();

const signedPluginSchema = z
  .object({
    name: z.string().regex(PACKAGE_PATTERN),
    version: z.string().min(1),
    enabled: z.boolean(),
    treeSha256: z.string().regex(SHA256_PATTERN),
    entries: z.array(pluginEntrySchema),
  })
  .strict();

/** Signed daemon snapshot parsed by the runtime. */
export const signedPluginSnapshotSchema = z
  .object({
    version: z.literal(1),
    plugins: z.array(signedPluginSchema),
  })
  .strict();

const localBundleSchema = z
  .object({
    id: z.string().regex(ID_PATTERN),
    root: z.string().min(1),
    treeSha256: z.string().regex(SHA256_PATTERN),
    entries: z.array(pluginEntrySchema),
  })
  .strict();

/** Unsigned developer-only manifest using the same entry contract. */
export const localPluginManifestSchema = z
  .object({
    version: z.literal(1),
    bundles: z.array(localBundleSchema),
  })
  .strict();

export type PluginManifestEntry = z.infer<typeof pluginEntrySchema>;
export type SignedPluginSnapshot = z.infer<typeof signedPluginSnapshotSchema>;
export type LocalPluginManifest = z.infer<typeof localPluginManifestSchema>;
