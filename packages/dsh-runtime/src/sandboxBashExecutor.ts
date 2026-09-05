import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

import { SandboxBashExecutor } from "@deepseek-ai/dsh-bash-sandbox";
import type { ShellExecSpec, ShellProcess, ShellRunResult } from "@deepseek-ai/dsh-shell";

/** Error code returned when Bash is asked to start outside its sandbox workspace. */
export const SANDBOX_WORKDIR_OUTSIDE_WORKSPACE = "SANDBOX_WORKDIR_OUTSIDE_WORKSPACE";

/** Rejects Bash work directories that escape the resolved sandbox workspace. */
export class SandboxWorkdirError extends Error {
  /** Stable machine-readable error code for the runtime boundary violation. */
  readonly code = SANDBOX_WORKDIR_OUTSIDE_WORKSPACE;

  constructor(workdir: string, workspaceRoot: string) {
    super(`sandbox workdir ${JSON.stringify(workdir)} is outside workspace ${JSON.stringify(workspaceRoot)}`);
    this.name = "SandboxWorkdirError";
  }
}

/**
 * Sandbox Bash executor that verifies the spawn directory before it selects a backend.
 *
 * This protects canonical path containment and symlink escapes. It assumes the resolved
 * workspace path is trusted: Node/DSH cannot atomically pin cwd if a malicious local actor
 * replaces that directory after validation. A native fd-pinned launcher is deferred.
 */
export class YishanSandboxBashExecutor extends SandboxBashExecutor {
  /** Runs a command only after its working directory is verified against the resolved policy workspace. */
  override run(spec: ShellExecSpec): Promise<ShellRunResult> {
    return super.run(this.resolveVerifiedSandboxSpec(this.resolveSandboxPolicy(spec)));
  }

  /** Starts a background command only after its working directory is verified against the resolved policy workspace. */
  override start(spec: ShellExecSpec): ShellProcess {
    return super.start(this.resolveVerifiedSandboxSpec(this.resolveSandboxPolicy(spec)));
  }

  /** Adds the deployment policy when a lower-level caller bypasses request resolution. */
  private resolveSandboxPolicy(
    spec: ShellExecSpec,
  ): ShellExecSpec & { sandboxPolicy: NonNullable<ShellExecSpec["sandboxPolicy"]> } {
    return { ...spec, sandboxPolicy: spec.sandboxPolicy ?? this.ctx.sandboxPolicy.resolve() };
  }

  /** Resolves symlinks before containment validation and passes only canonical paths to the executor. */
  private resolveVerifiedSandboxSpec(
    spec: ShellExecSpec & { sandboxPolicy: NonNullable<ShellExecSpec["sandboxPolicy"]> },
  ): ShellExecSpec & { sandboxPolicy: NonNullable<ShellExecSpec["sandboxPolicy"]> } {
    const workspaceRoot = realpathSync.native(resolve(spec.sandboxPolicy.workspaceRoot));
    const workdir = realpathSync.native(resolve(spec.workdir));
    const pathFromWorkspace = relative(workspaceRoot, workdir);
    const isWithinWorkspace =
      pathFromWorkspace === "" ||
      (!pathFromWorkspace.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) &&
        pathFromWorkspace !== ".." &&
        !isAbsolute(pathFromWorkspace));
    if (!isWithinWorkspace) throw new SandboxWorkdirError(workdir, workspaceRoot);
    return { ...spec, workdir, sandboxPolicy: { ...spec.sandboxPolicy, workspaceRoot } };
  }
}
