import { z } from "zod";

/** Stable identity sent from DSH to the daemon for workspace binding. */
export type WorkspaceBindingRequest = {
  sessionId: string;
  workspaceId: string;
};

/** Validated daemon response for one workspace binding. */
export const workspaceBindingSchema = z.object({
  workspaceId: z.string().min(1),
  cwd: z.string().min(1),
  generation: z.number().int().positive(),
  policy: z.object({ authorization: z.literal("daemon-authorized") }),
});

/** Daemon-authorized workspace facts decoded at the bridge boundary. */
export type WorkspaceBinding = z.infer<typeof workspaceBindingSchema>;

/** Daemon transport used to resolve one DSH session to a workspace. */
export interface WorkspaceBindingResolver {
  resolveWorkspaceBinding(request: WorkspaceBindingRequest): Promise<unknown>;
}
