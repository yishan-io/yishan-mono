import { describe, expect, it } from "vitest";

import { workspaceBindingSchema } from "./workspaceBinding";

const binding = {
  workspaceId: "workspace-1",
  cwd: "/workspace",
  generation: 1,
  policy: { authorization: "daemon-authorized" },
};

describe("workspaceBindingSchema", () => {
  it("decodes a daemon-authorized workspace binding", () => {
    expect(workspaceBindingSchema.parse(binding)).toEqual(binding);
  });

  it("rejects invalid binding facts", () => {
    expect(() => workspaceBindingSchema.parse({ ...binding, generation: 0 })).toThrow();
    expect(() => workspaceBindingSchema.parse({ ...binding, policy: { authorization: "untrusted" } })).toThrow();
  });

  it("ignores additive protocol fields", () => {
    expect(workspaceBindingSchema.parse({ ...binding, futureField: true })).toEqual(binding);
  });
});
