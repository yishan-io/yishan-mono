import { describe, expect, it } from "vitest";
describe("probe", () => {
  it("project-index", async () => { await import("@renderer/domains/project"); expect(1).toBe(1); });
  it("browser-index", async () => { await import("@renderer/domains/browser"); expect(1).toBe(1); });
  it("whiteboardCommands", async () => { await import("@renderer/domains/files/commands/whiteboardCommands"); expect(1).toBe(1); });
});
