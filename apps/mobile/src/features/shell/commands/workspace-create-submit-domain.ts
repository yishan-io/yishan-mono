import type { Workspace } from "@/features/workspaces/workspaces.types";

export type WaitForCreatedWorkspaceInput = {
  delayMs?: number;
  loadWorkspaces: () => Promise<Workspace[]>;
  maxAttempts?: number;
  workspaceId: string;
};

function delay(ms: number) {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function waitForCreatedWorkspace(input: WaitForCreatedWorkspaceInput): Promise<Workspace> {
  const maxAttempts = input.maxAttempts ?? 5;
  const delayMs = input.delayMs ?? 3_000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const workspaces = await input.loadWorkspaces();
    const createdWorkspace = workspaces.find((workspace) => workspace.id === input.workspaceId);
    if (createdWorkspace) {
      return createdWorkspace;
    }

    if (attempt < maxAttempts - 1) {
      await delay(delayMs);
    }
  }

  throw new Error("Workspace was created, but mobile could not refresh it yet.");
}
