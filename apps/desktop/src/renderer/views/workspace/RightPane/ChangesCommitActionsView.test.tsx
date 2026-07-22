// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChangesCommitActionsView } from "./ChangesCommitActionsView";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "files.git.commitPlaceholder": "Enter commit message",
        "files.git.commit": "Commit",
        "files.git.push": "Push",
        "files.git.publishBranch": "Publish Branch",
        "files.git.commitOptions": "Commit options",
        "files.git.amend": "Amend",
        "files.git.amendShortcut": "Cmd+Enter",
        "files.git.signoff": "Signoff",
      };

      return translations[key] ?? key;
    },
  }),
}));

afterEach(() => {
  cleanup();
});

describe("ChangesCommitActionsView", () => {
  it("updates draft and runs the primary action", () => {
    const onCommitMessageDraftChange = vi.fn();
    const onRunPrimaryGitAction = vi.fn();
    const onCommitWithOptions = vi.fn();

    render(
      <ChangesCommitActionsView
        commitMessageDraft=""
        primaryGitAction="commit"
        onCommitMessageDraftChange={onCommitMessageDraftChange}
        onRunPrimaryGitAction={onRunPrimaryGitAction}
        onCommitWithOptions={onCommitWithOptions}
      />,
    );

    const draftField = screen.getByLabelText("Enter commit message");
    fireEvent.change(draftField, { target: { value: "feat: keep history" } });
    expect(onCommitMessageDraftChange).toHaveBeenCalledWith("feat: keep history");

    const commitButton = screen.getByRole("button", { name: "Commit" });
    expect(commitButton.hasAttribute("disabled")).toBe(true);
  });

  it("keeps the multiline commit editor at the explicit medium size", () => {
    render(
      <ChangesCommitActionsView
        commitMessageDraft=""
        primaryGitAction="commit"
        onCommitMessageDraftChange={() => {}}
        onRunPrimaryGitAction={() => {}}
        onCommitWithOptions={() => {}}
      />,
    );

    expect(screen.getByLabelText("Enter commit message").classList).not.toContain("MuiInputBase-inputSizeSmall");
  });

  it("runs primary action when enabled and exposes commit options", () => {
    const onCommitMessageDraftChange = vi.fn();
    const onRunPrimaryGitAction = vi.fn();
    const onCommitWithOptions = vi.fn();

    render(
      <ChangesCommitActionsView
        commitMessageDraft="feat: ship"
        primaryGitAction="commit"
        onCommitMessageDraftChange={onCommitMessageDraftChange}
        onRunPrimaryGitAction={onRunPrimaryGitAction}
        onCommitWithOptions={onCommitWithOptions}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Commit" }));
    expect(onRunPrimaryGitAction).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Commit options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Amend Cmd+Enter" }));
    expect(onCommitWithOptions).toHaveBeenCalledWith({ amend: true });

    fireEvent.click(screen.getByRole("button", { name: "Commit options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Signoff" }));
    expect(onCommitWithOptions).toHaveBeenCalledWith({ signoff: true });
  });

  it("disables commit options for non-commit primary actions", () => {
    const onCommitMessageDraftChange = vi.fn();
    const onRunPrimaryGitAction = vi.fn();
    const onCommitWithOptions = vi.fn();

    render(
      <ChangesCommitActionsView
        commitMessageDraft=""
        primaryGitAction="push"
        onCommitMessageDraftChange={onCommitMessageDraftChange}
        onRunPrimaryGitAction={onRunPrimaryGitAction}
        onCommitWithOptions={onCommitWithOptions}
      />,
    );

    expect(screen.getByRole("button", { name: "Push" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Commit options" }).hasAttribute("disabled")).toBe(true);
  });
});
