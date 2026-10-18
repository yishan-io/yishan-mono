import { describe, expect, it, vi } from "vitest";
import { PreferencesClient } from "./preferencesClient";

describe("generic preferences transport", () => {
  it("distinguishes missing and null and returns the authoritative initialization winner", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ found: false })
      .mockResolvedValueOnce({ found: true, value: null })
      .mockResolvedValueOnce({ found: true, value: { winner: true } });
    const client = new PreferencesClient(invoke);
    await expect(client.get("org", "key")).resolves.toEqual({ found: false });
    await expect(client.get("org", "key")).resolves.toEqual({ found: true, value: null });
    await expect(client.set("org", "key", null, true)).resolves.toEqual({ found: true, value: { winner: true } });
    expect(invoke.mock.calls).toEqual([
      ["preferences.get", { scope: "org", key: "key" }],
      ["preferences.get", { scope: "org", key: "key" }],
      ["preferences.set", { scope: "org", key: "key", value: null, initializeOnly: true }],
    ]);
  });
  it.each([
    null,
    {},
    { found: 1 },
    { found: false, value: null },
    { found: true },
    { found: true, value: undefined },
    { found: true, value: Number.NaN },
  ])("rejects malformed transport responses %j", async (payload) => {
    const client = new PreferencesClient(vi.fn().mockResolvedValue(payload));
    await expect(client.get("org", "key")).rejects.toThrow(TypeError);
  });
  it("rejects missing write acknowledgements", async () => {
    const client = new PreferencesClient(vi.fn().mockResolvedValue({ found: false }));
    await expect(client.set("org", "key", {})).rejects.toThrow(TypeError);
  });
  it("validates syntax, JSON and byte limits before I/O", async () => {
    const invoke = vi.fn().mockResolvedValue({ found: true, value: null });
    const client = new PreferencesClient(invoke);
    for (const [scope, key] of [
      ["", "key"],
      ["x".repeat(1025), "key"],
      ["org", "x".repeat(257)],
    ] as const) {
      await expect(client.get(scope, key)).rejects.toThrow(TypeError);
    }
    for (const payload of [
      undefined,
      { omitted: undefined },
      Number.POSITIVE_INFINITY,
      new Date(),
      "é".repeat(524288),
    ]) {
      await expect(client.set("org", "key", payload)).rejects.toThrow(TypeError);
    }
    expect(invoke).not.toHaveBeenCalled();
    await client.set("o".repeat(1024), "k".repeat(256), null);
    expect(invoke).toHaveBeenCalledOnce();
  });
});
