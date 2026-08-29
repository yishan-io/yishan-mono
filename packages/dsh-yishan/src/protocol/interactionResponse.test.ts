import { describe, expect, it } from "vitest";

import { parseInteractionResponse } from "./interactionResponse";

describe("parseInteractionResponse", () => {
  it("accepts a correlated selection", () => {
    expect(parseInteractionResponse({ id: "interaction-1", outcome: "accepted", value: "option-1" })).toEqual({
      id: "interaction-1",
      outcome: "accepted",
      value: "option-1",
    });
  });

  it("fails closed when denial carries an injected value", () => {
    expect(() => parseInteractionResponse({ id: "interaction-1", outcome: "denied", value: "allow" })).toThrow(
      "cannot carry a value",
    );
  });

  it("rejects unknown fields", () => {
    expect(() =>
      parseInteractionResponse({ id: "interaction-1", outcome: "accepted", value: null, durable: true }),
    ).toThrow("unsupported fields");
  });
});
