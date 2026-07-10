import { describe, expect, it } from "vitest";

import {
  hasProjectFieldErrors,
  toCreateProjectInput,
  toUpdateProjectInput,
  validateCreateProjectForm,
  validateProjectDraft,
} from "./project-form";

const t = (key: string) => key;

describe("project-form", () => {
  it("validates create form with optional repo url", () => {
    expect(validateCreateProjectForm({ name: "", repoUrl: "bad-url" }, t)).toEqual({
      name: "validation.project.nameRequired",
      repoUrl: "validation.project.gitUrlInvalid",
    });
    expect(validateCreateProjectForm({ name: "Nile", repoUrl: "" }, t)).toEqual({
      name: undefined,
      repoUrl: undefined,
    });
  });

  it("validates editable project draft fields", () => {
    expect(
      validateProjectDraft(
        {
          color: "nope",
          contextEnabled: true,
          icon: "",
          name: "",
        },
        t,
      ),
    ).toEqual({
      color: "validation.project.colorInvalid",
      icon: "validation.project.iconRequired",
      name: "validation.project.nameRequired",
    });
  });

  it("maps create and update payloads from trimmed draft values", () => {
    expect(toCreateProjectInput({ name: " Nile ", repoUrl: " https://github.com/acme/nile " })).toEqual({
      name: "Nile",
      repoUrl: "https://github.com/acme/nile",
    });
    expect(
      toUpdateProjectInput({
        color: " #00FF00 ",
        contextEnabled: false,
        icon: " rocket ",
        name: " Nile ",
      }),
    ).toEqual({
      color: "#00FF00",
      contextEnabled: false,
      icon: "rocket",
      name: "Nile",
    });
  });

  it("detects whether field errors are present", () => {
    expect(hasProjectFieldErrors({})).toBe(false);
    expect(hasProjectFieldErrors({ name: "error" })).toBe(true);
  });
});
