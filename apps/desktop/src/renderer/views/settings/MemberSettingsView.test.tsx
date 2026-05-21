// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
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
    },
  },
}));

describe("MemberSettingsView", () => {
  beforeEach(() => {
    sessionStore.setState({
      currentUser: null,
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
});
