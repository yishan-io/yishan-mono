// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import { removeOrgMember } from "../../commands/orgCommands";
import { sessionStore } from "../../store/sessionStore";
import { MemberSettingsView } from "./MemberSettingsView";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../api/client", () => ({
  api: {
    org: {
      listMembers: vi.fn(),
      addMember: vi.fn(),
      leave: vi.fn(),
    },
  },
}));

vi.mock("../../commands/orgCommands", () => ({
  addOrgMember: vi.fn(),
  removeOrgMember: vi.fn(),
  leaveOrg: vi.fn(),
}));

describe("MemberSettingsView", () => {
  beforeEach(() => {
    sessionStore.setState({
      currentUser: {
        id: "user-1",
        email: "admin@example.com",
        name: "Admin User",
        avatarUrl: null,
      },
      organizations: [{ id: "org-1", name: "Org 1" }],
      selectedOrganizationId: "org-1",
      loaded: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders members with role and identity details", async () => {
    vi.mocked(api.org.listMembers).mockResolvedValue([
      {
        userId: "user-1",
        role: "admin",
        email: "admin@example.com",
        name: "Admin User",
        avatarUrl: null,
      },
    ]);

    render(<MemberSettingsView />);

    await waitFor(() => {
      expect(screen.getByText("Admin User")).toBeTruthy();
    });

    expect(screen.getByText("admin")).toBeTruthy();
    expect(screen.getByText("admin@example.com")).toBeTruthy();
    expect(screen.getByText("user-1")).toBeTruthy();
  });

  it("renders empty state when there are no members", async () => {
    vi.mocked(api.org.listMembers).mockResolvedValue([]);

    render(<MemberSettingsView />);

    await waitFor(() => {
      expect(screen.getByText("settings.members.empty")).toBeTruthy();
    });
  });

  it("renders error alert when request fails", async () => {
    vi.mocked(api.org.listMembers).mockRejectedValue(new Error("failed"));

    render(<MemberSettingsView />);

    await waitFor(() => {
      expect(screen.getByText("settings.members.loadError")).toBeTruthy();
    });
  });

  it("reloads members when selected organization changes", async () => {
    vi.mocked(api.org.listMembers)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          userId: "user-2",
          role: "member",
          email: "member@example.com",
          name: "Member User",
          avatarUrl: null,
        },
      ]);

    const { rerender } = render(<MemberSettingsView />);

    await waitFor(() => {
      expect(api.org.listMembers).toHaveBeenCalledWith("org-1");
    });

    sessionStore.setState({
      organizations: [
        { id: "org-1", name: "Org 1" },
        { id: "org-2", name: "Org 2" },
      ],
      selectedOrganizationId: "org-2",
    });
    rerender(<MemberSettingsView />);

    await waitFor(() => {
      expect(api.org.listMembers).toHaveBeenCalledWith("org-2");
    });
    expect(screen.getByText("Member User")).toBeTruthy();
  });

  it("renders the Add member button", async () => {
    vi.mocked(api.org.listMembers).mockResolvedValue([]);
    render(<MemberSettingsView />);
    await waitFor(() => expect(screen.getByText("settings.members.empty")).toBeTruthy());
    expect(screen.getByText("settings.members.addMember")).toBeTruthy();
  });

  it("opens the add-member dialog when the Add member button is clicked", async () => {
    vi.mocked(api.org.listMembers).mockResolvedValue([]);
    render(<MemberSettingsView />);
    await waitFor(() => expect(screen.getByText("settings.members.empty")).toBeTruthy());

    fireEvent.click(screen.getByText("settings.members.addMember"));

    expect(screen.getByText("settings.members.addDialog.title")).toBeTruthy();
  });

  it("removes a member after confirm", async () => {
    vi.mocked(api.org.listMembers).mockResolvedValue([
      {
        userId: "user-1",
        role: "admin",
        email: "admin@example.com",
        name: "Admin User",
        avatarUrl: null,
      },
      {
        userId: "user-2",
        role: "member",
        email: "member@example.com",
        name: "Member User",
        avatarUrl: null,
      },
    ]);
    vi.mocked(removeOrgMember).mockResolvedValue();

    render(<MemberSettingsView />);

    await waitFor(() => {
      expect(screen.getByText("Member User")).toBeTruthy();
    });

    fireEvent.click(screen.getAllByLabelText("settings.members.removeAriaLabel")[1]!);
    fireEvent.click(screen.getByText("settings.members.removeDialog.confirm"));

    await waitFor(() => {
      expect(removeOrgMember).toHaveBeenCalledWith("user-2");
    });
    expect(screen.queryByText("Member User")).toBeNull();
  });

  it("hides remove button for owner member", async () => {
    vi.mocked(api.org.listMembers).mockResolvedValue([
      {
        userId: "user-1",
        role: "admin",
        email: "admin@example.com",
        name: "Admin User",
        avatarUrl: null,
      },
      {
        userId: "owner-1",
        role: "owner",
        email: "owner@example.com",
        name: "Owner User",
        avatarUrl: null,
      },
    ]);

    render(<MemberSettingsView />);

    await waitFor(() => {
      expect(screen.getByText("Owner User")).toBeTruthy();
    });

    // Only one remove button should be present (for the admin row, not the owner row).
    const removeButtons = screen.getAllByLabelText("settings.members.removeAriaLabel");
    expect(removeButtons).toHaveLength(1);
  });
});
