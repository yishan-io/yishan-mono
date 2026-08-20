import { spawn } from "node:child_process";

/** Waits for one spawned process to exit and resolves with the exit code. */
export async function waitForProcessExit(processHandle: ReturnType<typeof spawn>): Promise<number | null> {
  return new Promise((resolve) => {
    processHandle.once("error", () => resolve(null));
    processHandle.once("close", (code) => resolve(typeof code === "number" ? code : null));
  });
}

/** Runs one process command and returns UTF-8 stdout on success, otherwise an empty string. */
export async function runCommandForStdout(command: string[]): Promise<string> {
  const [executable, ...args] = command;
  if (!executable) {
    return "";
  }

  try {
    const processResult = spawn(executable, args, {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let stdoutText = "";
    processResult.stdout?.setEncoding("utf8");
    processResult.stdout?.on("data", (chunk: string) => {
      stdoutText += chunk;
    });

    const exitCode = await waitForProcessExit(processResult);
    if (exitCode !== 0) {
      return "";
    }

    return stdoutText;
  } catch {
    return "";
  }
}

/** Runs one process command and resolves with the exit code or null when failed to launch. */
export async function runCommandForExitCode(command: string[]): Promise<number | null> {
  const [executable, ...args] = command;
  if (!executable) {
    return null;
  }

  try {
    const processResult = spawn(executable, args, { stdio: "ignore" });
    return await waitForProcessExit(processResult);
  } catch {
    return null;
  }
}
