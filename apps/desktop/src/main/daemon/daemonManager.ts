import { getErrorMessage } from "../../shared/errors/getErrorMessage";
import { isDevMode } from "../runtime/environment";
import {
  type CliCommandResult,
  type CliCommandRunner,
  buildDaemonStartArgs,
  buildDaemonStopArgs,
  runCliCommand,
} from "./daemonCliInvocation";
import { DaemonDevProcess } from "./daemonDevProcess";
import {
  DAEMON_PRECHECK_HEALTH_RETRY_COUNT,
  DAEMON_PRECHECK_HEALTH_RETRY_DELAY_MS,
  DEV_DAEMON_HEALTH_RETRY_COUNT,
  type DaemonInfo,
  fetchDaemonInfo,
  waitForDaemonHealthy,
} from "./daemonHealthCheck";
type Logger = Pick<Console, "warn">;
type Options = {
  run?: CliCommandRunner;
  logger?: Logger;
  fetch?: typeof fetch;
  devProcess?: DaemonDevProcess;
  preferCli?: boolean;
};
function delay(ms: number) {
  return new Promise<void>((resolveDelay) => setTimeout(resolveDelay, ms));
}
function formatFailure(action: "start" | "stop", result: CliCommandResult) {
  const details = [result.stderr, result.stdout].join("\n").trim();
  return details
    ? `Failed to ${action} daemon: ${details}`
    : `Failed to ${action} daemon: CLI command exited with code ${result.exitCode}`;
}
/** Coordinates daemon lifecycle policy; endpoint, health, CLI and dev child details remain separate. */
export class DaemonManager {
  private readonly run: CliCommandRunner;
  private readonly logger: Logger;
  private readonly fetchFn: typeof fetch;
  private readonly devProcess: DaemonDevProcess;
  private readonly preferCli: boolean;
  private startInFlight: Promise<void> | null = null;
  constructor(options: Options = {}) {
    this.run = options.run ?? runCliCommand;
    this.logger = options.logger ?? console;
    this.fetchFn = options.fetch ?? fetch;
    this.devProcess = options.devProcess ?? new DaemonDevProcess();
    this.preferCli = options.preferCli ?? Boolean(options.run);
  }
  private async wait(options?: { retryCount?: number; retryDelayMs?: number }) {
    await waitForDaemonHealthy(this.fetchFn, delay, options);
  }
  private async stopProfileDaemon(): Promise<void> {
    const result = await this.run(buildDaemonStopArgs());
    if (result.error) {
      this.logger.warn(`Failed to stop daemon: ${result.error}`);
      return;
    }
    if (result.exitCode !== 0 && result.exitCode !== 6) this.logger.warn(formatFailure("stop", result));
  }
  async ensureStarted(): Promise<void> {
    if (this.startInFlight) return await this.startInFlight;
    const task = this.start();
    this.startInFlight = task;
    try {
      await task;
    } finally {
      if (this.startInFlight === task) this.startInFlight = null;
    }
  }
  private async start(): Promise<void> {
    if (isDevMode() && !this.preferCli) {
      await this.devProcess.start(
        () => this.wait({ retryCount: DEV_DAEMON_HEALTH_RETRY_COUNT }),
        () => this.stopProfileDaemon(),
      );
      return;
    }
    try {
      await this.wait({
        retryCount: DAEMON_PRECHECK_HEALTH_RETRY_COUNT,
        retryDelayMs: DAEMON_PRECHECK_HEALTH_RETRY_DELAY_MS,
      });
      return;
    } catch {}
    const result = await this.run(buildDaemonStartArgs());
    if (result.error) throw new Error(`Failed to start daemon: ${result.error}`);
    if (result.exitCode !== 0) throw new Error(formatFailure("start", result));
    try {
      await this.wait();
    } catch (error: unknown) {
      throw new Error(`Daemon did not become healthy after start: ${getErrorMessage(error)}`);
    }
  }
  async stop(): Promise<void> {
    if (isDevMode() && (await this.devProcess.stop())) return;
    await this.stopProfileDaemon();
  }
  async getInfo(): Promise<DaemonInfo> {
    try {
      return await fetchDaemonInfo(this.fetchFn);
    } catch {
      await this.ensureStarted();
    }
    try {
      return await fetchDaemonInfo(this.fetchFn);
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.warn(`Failed to load daemon info after recovery: ${message}`);
      throw new Error(`Failed to load daemon info: ${message}`);
    }
  }
}
