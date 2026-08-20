import { type ChildProcess, spawn } from "node:child_process";
import { resolveCliInvocation } from "./daemonCliInvocation";
import { resolveCliProfileName } from "./daemonEndpoint";

const relayUrl = "http://127.0.0.1:8788";
const stopTimeoutMs = 5_000;
const forceKillWaitMs = 1_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

/** Owns the foreground daemon child used only in desktop development mode. */
export class DaemonDevProcess {
  private child: ChildProcess | null = null;

  /** Starts a healthy foreground daemon, recycling an unhealthy owned child. */
  async start(waitForHealthy: () => Promise<void>, stopProfileDaemon: () => Promise<void>): Promise<void> {
    if (this.child && !this.child.killed && this.child.exitCode === null && this.child.signalCode === null) {
      try {
        await waitForHealthy();
        return;
      } catch {
        await this.stop();
      }
    }

    await stopProfileDaemon();
    const invocation = resolveCliInvocation();
    const child = spawn(
      invocation.executablePath,
      [...invocation.prefixArgs, "daemon", "run", "--relay-url", relayUrl, "--profile", resolveCliProfileName()],
      { stdio: "ignore", env: process.env, cwd: invocation.cwd },
    );
    this.child = child;
    child.once("exit", () => {
      if (this.child === child) this.child = null;
    });
    const exitBeforeHealthy = new Promise<never>((_, reject) => {
      child.once("error", reject);
      child.once("exit", (exitCode, signal) => {
        const status = typeof exitCode === "number" ? `code ${exitCode}` : `signal ${signal ?? "unknown"}`;
        reject(new Error(`dev daemon exited before becoming healthy (${status})`));
      });
    });
    await Promise.race([waitForHealthy(), exitBeforeHealthy]);
  }

  /** Stops the foreground daemon child, waiting before a replacement can start. */
  async stop(): Promise<boolean> {
    const child = this.child;
    this.child = null;
    if (!child) return false;
    if (child.killed || child.exitCode !== null || child.signalCode !== null) return true;

    const waitForExit = new Promise<void>((resolveExit) => {
      child.once("exit", resolveExit);
    });
    const termSignal: NodeJS.Signals | undefined = process.platform === "win32" ? undefined : "SIGTERM";
    child.kill(termSignal);
    const didExitAfterTerminate = await Promise.race([
      waitForExit.then(() => true),
      delay(stopTimeoutMs).then(() => false),
    ]);
    if (didExitAfterTerminate) return true;

    const killSignal: NodeJS.Signals | undefined = process.platform === "win32" ? undefined : "SIGKILL";
    child.kill(killSignal);
    await Promise.race([waitForExit, delay(forceKillWaitMs)]);
    return true;
  }
}
