import { readFile } from "node:fs/promises";
import { getErrorMessage } from "../../shared/errors/getErrorMessage";
import { resolveDaemonLogFilePath } from "./daemonEndpoint";
import type { DaemonInfo } from "./daemonHealthCheck";
/** Renderer-facing daemon operations; DaemonManager remains the lifecycle owner. */
export class DaemonHost {
  private cachedQuitOnExit: boolean | null = null;
  constructor(
    private readonly daemon: { stop(): Promise<void>; ensureStarted(): Promise<void>; getInfo(): Promise<DaemonInfo> },
    private readonly getPreference: () => Promise<boolean>,
    private readonly setPreference: (value: boolean) => Promise<void>,
  ) {}
  async getInfo() {
    return await this.daemon.getInfo();
  }
  async restart() {
    try {
      await this.restartForAccountSwitch();
      return { success: true as const, daemonInfo: await this.daemon.getInfo() };
    } catch (error: unknown) {
      return { success: false as const, error: getErrorMessage(error) };
    }
  }
  async restartForAccountSwitch(): Promise<void> {
    try {
      await this.daemon.stop();
    } catch (error: unknown) {
      console.warn("Daemon stop during account switch:", getErrorMessage(error));
    }
    await this.daemon.ensureStarted();
  }
  async readLog() {
    try {
      return { ok: true as const, content: await readFile(resolveDaemonLogFilePath(), "utf8") };
    } catch (error: unknown) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
        return { ok: true as const, content: "" };
      return { ok: false as const, error: getErrorMessage(error) };
    }
  }
  async getQuitOnExit(): Promise<boolean> {
    try {
      if (this.cachedQuitOnExit === null) this.cachedQuitOnExit = await this.getPreference();
      return this.cachedQuitOnExit;
    } catch (error: unknown) {
      console.warn("Failed to read daemon quit-on-exit setting:", getErrorMessage(error));
      return false;
    }
  }
  async setQuitOnExit(value: boolean) {
    await this.setPreference(value);
    this.cachedQuitOnExit = value;
    return { ok: true as const };
  }
  setCachedQuitOnExit(value: boolean): void {
    this.cachedQuitOnExit = value;
  }
  shouldStopOnExit(): boolean {
    return this.cachedQuitOnExit ?? false;
  }
}
