import { describe, expect, it, vi } from "vitest";
import { PiRuntimeAuthenticationCoordinator } from "./piRuntimeAuthenticationCoordinator";

function createAuthenticationTarget(id: number) {
  let destroyedListener: (() => void) | undefined;
  const target = {
    id,
    once: vi.fn((_event: "destroyed", listener: () => void) => {
      destroyedListener = listener;
    }),
    removeListener: vi.fn((_event: "destroyed", listener: () => void) => {
      if (destroyedListener === listener) {
        destroyedListener = undefined;
      }
    }),
  };
  return {
    target,
    destroy: () => destroyedListener?.(),
  };
}

describe("PiRuntimeAuthenticationCoordinator", () => {
  it("aborts only the authentication owned by the matching renderer and provider", () => {
    const coordinator = new PiRuntimeAuthenticationCoordinator();
    const { target } = createAuthenticationTarget(7);
    const signal = coordinator.begin(target, "anthropic");

    expect(coordinator.cancel(8, "anthropic")).toBe(false);
    expect(coordinator.cancel(7, "openai-codex")).toBe(false);
    expect(signal.aborted).toBe(false);

    expect(coordinator.cancel(7, "anthropic")).toBe(true);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toMatchObject({ code: "cancelled", message: "Login cancelled." });
  });

  it("releases a finished authentication so a new one can begin", () => {
    const coordinator = new PiRuntimeAuthenticationCoordinator();
    const first = createAuthenticationTarget(7);
    const second = createAuthenticationTarget(8);
    const signal = coordinator.begin(first.target, "anthropic");

    expect(coordinator.finish(7, "anthropic")).toBe(true);
    expect(signal.aborted).toBe(true);
    expect(first.target.removeListener).toHaveBeenCalledOnce();
    expect(coordinator.cancel(7, "anthropic")).toBe(false);
    expect(() => coordinator.begin(second.target, "openai-codex")).not.toThrow();
  });

  it("aborts and releases authentication when its renderer is destroyed", () => {
    const coordinator = new PiRuntimeAuthenticationCoordinator();
    const first = createAuthenticationTarget(7);
    const replacement = createAuthenticationTarget(8);
    const signal = coordinator.begin(first.target, "anthropic");

    first.destroy();

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toMatchObject({ code: "cancelled", message: "Login cancelled." });
    expect(() => coordinator.begin(replacement.target, "openai-codex")).not.toThrow();
  });
});
