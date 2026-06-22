import { describe, expect, it } from "vitest";

import { createEmptyProjectCreateDraft, isProjectCreateSubmitDisabled } from "./project-create-sheet-domain";

describe("project-create-sheet-domain", () => {
  it("creates an empty draft", () => {
    expect(createEmptyProjectCreateDraft()).toEqual({
      name: "",
      repoUrl: "",
    });
  });

  it("disables submit when organization context is missing", () => {
    expect(
      isProjectCreateSubmitDisabled({
        createPending: false,
        formErrors: {},
        organizationId: null,
      }),
    ).toBe(true);
  });

  it("disables submit when validation has field errors", () => {
    expect(
      isProjectCreateSubmitDisabled({
        createPending: false,
        formErrors: { name: "required" },
        organizationId: "org-1",
      }),
    ).toBe(true);
  });

  it("disables submit while the mutation is pending", () => {
    expect(
      isProjectCreateSubmitDisabled({
        createPending: true,
        formErrors: {},
        organizationId: "org-1",
      }),
    ).toBe(true);
  });

  it("enables submit when context is present, fields are valid, and mutation is idle", () => {
    expect(
      isProjectCreateSubmitDisabled({
        createPending: false,
        formErrors: {},
        organizationId: "org-1",
      }),
    ).toBe(false);
  });
});
