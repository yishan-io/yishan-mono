import { describe, expect, it } from "vitest";

import { readWebSocketTextMessage } from "./websocketMessage";

describe("websocketMessage", () => {
  it("returns plain string payloads", async () => {
    await expect(readWebSocketTextMessage("hello")).resolves.toBe("hello");
  });

  it("decodes array buffer payloads", async () => {
    const payload = new TextEncoder().encode("buffer");
    await expect(readWebSocketTextMessage(payload.buffer)).resolves.toBe("buffer");
    await expect(readWebSocketTextMessage(payload)).resolves.toBe("buffer");
  });

  it("reads blob-like payloads", async () => {
    await expect(
      readWebSocketTextMessage({
        text: async () => "blob-text",
      }),
    ).resolves.toBe("blob-text");
  });

  it("returns null for unsupported payloads", async () => {
    await expect(readWebSocketTextMessage({ nope: true })).resolves.toBeNull();
  });
});
