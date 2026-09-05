import {
  CapabilityClient,
  type CapabilityIdentity,
  type CapabilityRequest,
  type CapabilityTransport,
} from "@yishan-io/dsh-daemon-bridge";
import { z } from "zod";

const memorySearchInputSchema = z.object({
  query: z.string(),
  projectId: z.string().optional(),
  scope: z.enum(["project", "global"]).optional(),
  limit: z.number().int().nonnegative().max(100).optional(),
});
const memorySearchResultSchema = z.object({
  path: z.string(),
  snippet: z.string(),
  score: z.number(),
  source: z.string().optional(),
  taskId: z.string().optional(),
  taskTitle: z.string().optional(),
  documentType: z.string().optional(),
});
const memoryReadInputSchema = z.object({ projectRoot: z.string().optional(), path: z.string() });
const memoryReadResultSchema = z.object({ path: z.string(), content: z.string() });
const memorySectionSchema = z.enum(["locked_decisions", "durable_discoveries"]);
const memoryStoreInputSchema = z.object({
  projectRoot: z.string().optional(),
  section: memorySectionSchema,
  entry: z.string(),
  date: z.string(),
});
const memoryStoreResultSchema = z.object({ path: z.string(), section: memorySectionSchema });
const memoryReconcileResultSchema = z.object({
  inserted: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  deleted: z.number().int().nonnegative(),
});

export type MemorySearchInput = z.infer<typeof memorySearchInputSchema>;
export type MemorySearchResult = z.infer<typeof memorySearchResultSchema>;
export type MemoryReadInput = z.infer<typeof memoryReadInputSchema>;
export type MemoryReadResult = z.infer<typeof memoryReadResultSchema>;
export type MemoryStoreInput = z.infer<typeof memoryStoreInputSchema>;
export type MemoryStoreResult = z.infer<typeof memoryStoreResultSchema>;
export type MemoryReconcileResult = z.infer<typeof memoryReconcileResultSchema>;

type MemoryCapabilityOperation = "memory.search" | "memory.read" | "memory.store" | "memory.reconcile";
type MemoryCapabilityInput = MemorySearchInput | MemoryReadInput | MemoryStoreInput | Record<string, never>;
export type MemoryCapabilityRequest = CapabilityRequest<MemoryCapabilityOperation, MemoryCapabilityInput>;

/** Sends durable-memory operations through the base daemon capability client. */
export class MemoryClient {
  private readonly client: CapabilityClient<MemoryCapabilityOperation, MemoryCapabilityInput>;

  constructor(
    transport: CapabilityTransport<MemoryCapabilityRequest>,
    identity: CapabilityIdentity,
    signal: AbortSignal,
  ) {
    this.client = new CapabilityClient(transport, identity, signal, "memory");
  }

  async search(input: MemorySearchInput): Promise<MemorySearchResult[]> {
    return z
      .array(memorySearchResultSchema)
      .parse(await this.client.request("memory.search", memorySearchInputSchema.parse(input)));
  }

  async read(input: MemoryReadInput): Promise<MemoryReadResult> {
    return memoryReadResultSchema.parse(await this.client.request("memory.read", memoryReadInputSchema.parse(input)));
  }

  async store(input: MemoryStoreInput): Promise<MemoryStoreResult> {
    return memoryStoreResultSchema.parse(
      await this.client.request("memory.store", memoryStoreInputSchema.parse(input)),
    );
  }

  async reconcile(): Promise<MemoryReconcileResult> {
    return memoryReconcileResultSchema.parse(await this.client.request("memory.reconcile", {}));
  }
}
