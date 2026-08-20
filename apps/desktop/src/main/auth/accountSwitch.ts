import { getErrorMessage } from "../../shared/errors/getErrorMessage";
import { login } from "./cliAuth";
/** Performs CLI login and restarts the daemon after a completed account switch. */
export async function loginAndRestartDaemon(restartDaemon: () => Promise<void>) {
  const authResult = await login();
  if (authResult.authenticated && !authResult.skipped) {
    try {
      await restartDaemon();
    } catch (error: unknown) {
      console.warn("Daemon restart after login failed:", getErrorMessage(error));
    }
  }
  return authResult;
}
