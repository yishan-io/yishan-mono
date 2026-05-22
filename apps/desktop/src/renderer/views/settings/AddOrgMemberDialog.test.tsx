// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addOrgMember } from "../../commands/orgCommands";
import { AddOrgMemberDialog } from "./AddOrgMemberDialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../commands/orgCommands", () => ({
  addOrgMember: vi.fn(),
}));
describe("AddOrgMemberDialog", () => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the dialog with email and role fields when open", () => {
    render(<AddOrgMemberDialog isOpen onClose={onClose} onSuccess={onSuccess} />);
    expect(screen.getByText("settings.members.addDialog.title")).toBeTruthy();
    // Label text rendered as <Typography> with component="label"
    expect(screen.getByText("settings.members.addDialog.emailLabel")).toBeTruthy();
    expect(screen.getByText("settings.members.addDialog.roleLabel")).toBeTruthy();
  });

  it("does not render dialog content when closed", () => {
    render(<AddOrgMemberDialog isOpen={false} onClose={onClose} onSuccess={onSuccess} />);
    expect(screen.queryByText("settings.members.addDialog.title")).toBeNull();
  });

  it("shows validation error when submitted with empty email", async () => {
    render(<AddOrgMemberDialog isOpen onClose={onClose} onSuccess={onSuccess} />);
    fireEvent.click(screen.getByText("settings.members.addDialog.submit"));
    await waitFor(() => {
      expect(screen.getByText("settings.members.addDialog.errorEmailEmpty")).toBeTruthy();
    });
    expect(addOrgMember).not.toHaveBeenCalled();
  });

  it("calls addOrgMember with trimmed email and role on submit", async () => {
    vi.mocked(addOrgMember).mockResolvedValue({ invited: false });
    render(<AddOrgMemberDialog isOpen onClose={onClose} onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText("settings.members.addDialog.emailLabel"), {
      target: { value: "  alice@example.com  " },
    });
    fireEvent.click(screen.getByText("settings.members.addDialog.submit"));

    await waitFor(() => {
      expect(addOrgMember).toHaveBeenCalledWith("alice@example.com", "member");
    });
    expect(onSuccess).toHaveBeenCalledWith(false);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onSuccess with invited=true when an invite was sent", async () => {
    vi.mocked(addOrgMember).mockResolvedValue({ invited: true });
    render(<AddOrgMemberDialog isOpen onClose={onClose} onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText("settings.members.addDialog.emailLabel"), {
      target: { value: "new@example.com" },
    });
    fireEvent.click(screen.getByText("settings.members.addDialog.submit"));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(true);
    });
  });

  it("shows error alert when addOrgMember rejects", async () => {
    vi.mocked(addOrgMember).mockRejectedValue(new Error("No user found with that email address"));
    render(<AddOrgMemberDialog isOpen onClose={onClose} onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText("settings.members.addDialog.emailLabel"), {
      target: { value: "ghost@example.com" },
    });
    fireEvent.click(screen.getByText("settings.members.addDialog.submit"));

    await waitFor(() => {
      expect(screen.getByText("No user found with that email address")).toBeTruthy();
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose without submitting when cancel is clicked", () => {
    render(<AddOrgMemberDialog isOpen onClose={onClose} onSuccess={onSuccess} />);
    fireEvent.click(screen.getByText("common.actions.cancel"));
    expect(onClose).toHaveBeenCalledOnce();
    expect(addOrgMember).not.toHaveBeenCalled();
  });
});
