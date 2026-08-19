/**
 * Returns a Promise that resolves after the given number of milliseconds.
 * Shared across renderer command files and rpc helpers.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
