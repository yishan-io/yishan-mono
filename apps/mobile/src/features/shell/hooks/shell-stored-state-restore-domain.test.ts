import { describe, expect, it } from "vitest";

import { shouldStartShellStoredStateRestore } from "./shell-stored-state-restore-domain";

describe("shell-stored-state-restore-domain", () => {
  it("starts restore only before the shell session has been restored", () => {
    expect(
      shouldStartShellStoredStateRestore({
        hasActiveRestorePromise: false,
        hasRestoredStoredState: false,
      }),
    ).toBe(true);

    expect(
      shouldStartShellStoredStateRestore({
        hasActiveRestorePromise: false,
        hasRestoredStoredState: true,
      }),
    ).toBe(false);
  });

  it("does not start a second restore while one is already in flight", () => {
    expect(
      shouldStartShellStoredStateRestore({
        hasActiveRestorePromise: true,
        hasRestoredStoredState: false,
      }),
    ).toBe(false);
  });
});
