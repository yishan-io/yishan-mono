import { describe, expect, it } from "vitest";
import { formatTurnDuration } from "./turnDuration";
describe("duration", () => {
  it.each([
    [0, "0ms"],
    [999, "999ms"],
    [1000, "1s"],
    [60000, "1m"],
    [65000, "1m 5s"],
    [3900000, "1h5m"],
  ])("formats %s", (ms, text) => expect(formatTurnDuration(Number(ms))).toBe(text));
});
