import { describe, expect, it } from "vitest";
import { PiRuntimeAuthenticationCoordinator } from "./piRuntimeAuthenticationCoordinator";

describe("PiRuntimeAuthenticationCoordinator", () => {
  it("aborts only the authentication owned by the matching renderer and provider", () => {
    const coordinator = new PiRuntimeAuthenticationCoordinator();
    const signal = coordinator.begin(7, "anthropic");

    expect(coordinator.cancel(8, "anthropic")).toBe(false);
    expect(coordinator.cancel(7, "openai-codex")).toBe(false);
    expect(signal.aborted).toBe(false);

    expect(coordinator.cancel(7, "anthropic")).toBe(true);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toEqual(new Error("Login cancelled."));
  });

  it("releases a finished authentication so a new one can begin", () => {
    const coordinator = new PiRuntimeAuthenticationCoordinator();
    coordinator.begin(7, "anthropic");

    expect(coordinator.finish(7, "anthropic")).toBe(true);
    expect(coordinator.cancel(7, "anthropic")).toBe(false);
    expect(() => coordinator.begin(8, "openai-codex")).not.toThrow();
  });
});
