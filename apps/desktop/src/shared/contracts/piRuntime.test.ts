import { describe, expect, it } from "vitest";
import {
  parseAuthenticatePiProviderInput,
  parsePiAuthPromptClosedEventPayload,
  parsePiAuthPromptRequestEventPayload,
  parsePiAuthPromptResponseInput,
  parsePiProviderId,
} from "./piRuntime";

describe("Pi runtime IPC contract parsers", () => {
  it("parses valid provider operation inputs and trims identifiers", () => {
    expect(parseAuthenticatePiProviderInput({ providerId: " anthropic ", method: "oauth" })).toEqual({
      providerId: "anthropic",
      method: "oauth",
    });
    expect(parsePiProviderId(" openai ")).toBe("openai");
    expect(parsePiAuthPromptResponseInput({ requestId: " request-1 ", status: "submitted", value: " key " })).toEqual({
      requestId: "request-1",
      status: "submitted",
      value: " key ",
    });
  });

  it("rejects blank identifiers, unknown methods and malformed response discriminants", () => {
    expect(parseAuthenticatePiProviderInput({ providerId: " ", method: "oauth" })).toBeUndefined();
    expect(parseAuthenticatePiProviderInput({ providerId: "openai", method: "external" })).toBeUndefined();
    expect(parsePiProviderId(42)).toBeUndefined();
    expect(parsePiAuthPromptResponseInput({ requestId: "request-1", status: "submitted" })).toBeUndefined();
    expect(parsePiAuthPromptResponseInput({ requestId: "request-1", status: "ignored" })).toBeUndefined();
  });

  it("parses complete prompt events and rejects incomplete optional fields", () => {
    expect(
      parsePiAuthPromptRequestEventPayload({
        requestId: "request-select",
        prompt: {
          type: "select",
          message: "Choose",
          options: [{ id: "browser", label: "Browser", description: "Use this Mac" }],
        },
      }),
    ).toEqual({
      requestId: "request-select",
      prompt: {
        type: "select",
        message: "Choose",
        options: [{ id: "browser", label: "Browser", description: "Use this Mac" }],
      },
    });
    expect(
      parsePiAuthPromptRequestEventPayload({
        requestId: "request-empty",
        prompt: { type: "select", message: "Choose", options: [] },
      }),
    ).toBeUndefined();
    expect(
      parsePiAuthPromptRequestEventPayload({
        requestId: "request-placeholder",
        prompt: { type: "text", message: "Enter", placeholder: 42 },
      }),
    ).toBeUndefined();
    expect(
      parsePiAuthPromptRequestEventPayload({
        requestId: "request-description",
        prompt: { type: "select", message: "Choose", options: [{ id: "a", label: "A", description: 42 }] },
      }),
    ).toBeUndefined();
  });

  it("parses only non-empty prompt closed request IDs", () => {
    expect(parsePiAuthPromptClosedEventPayload({ requestId: " request-1 " })).toBe("request-1");
    expect(parsePiAuthPromptClosedEventPayload({ requestId: " " })).toBeUndefined();
  });
});
