import { getErrorMessage } from "../../shared/errors/getErrorMessage";
export type RestartPreparationOperations = {
  markQuitting: () => void;
  flushHistory: () => Promise<void>;
  shouldStopDaemon: () => boolean;
  stopDaemon: () => Promise<void>;
};
/** Marks quit intent and completes best-effort shutdown work before an update restart. */
export async function prepareForRestart(operations: RestartPreparationOperations): Promise<void> {
  operations.markQuitting();
  try {
    await operations.flushHistory();
  } catch (error: unknown) {
    console.warn("Failed to prune browser history during desktop shutdown", getErrorMessage(error));
  }
  if (!operations.shouldStopDaemon()) return;
  try {
    await operations.stopDaemon();
  } catch (error: unknown) {
    console.warn("Failed to stop daemon service during desktop shutdown", getErrorMessage(error));
  }
}
