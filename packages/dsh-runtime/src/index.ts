import { RuntimeHost } from "./host";

const runtime = await RuntimeHost.create();

let closeTask: Promise<void> | undefined;
const closeAndExit = (exitCode: number): void => {
  closeTask ??= runtime.close().then(
    () => process.exit(exitCode),
    (error: unknown) => {
      process.stderr.write(`failed to shut down DSH runtime: ${String(error)}\n`);
      process.exit(1);
    },
  );
};
process.stdin.once("end", () => closeAndExit(0));
process.once("SIGTERM", () => closeAndExit(0));
process.once("SIGINT", () => closeAndExit(130));
