// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DSHLocalPluginsSettingsView } from "./DSHLocalPluginsSettingsView";

const daemon = vi.hoisted(() => ({ list: vi.fn(), register: vi.fn(), remove: vi.fn() }));
vi.mock("../../daemon/daemonAgentProcedures", () => ({
  listDSHLocalPlugins: daemon.list,
  registerDSHLocalPlugin: daemon.register,
  removeDSHLocalPlugin: daemon.remove,
}));

describe("DSHLocalPluginsSettingsView", () => {
  it("does not expose arbitrary local paths when Developer Mode is unavailable", async () => {
    daemon.list.mockRejectedValue(new Error("DSH Developer Mode is required"));
    render(<DSHLocalPluginsSettingsView />);
    await waitFor(() => expect(daemon.list).toHaveBeenCalled());
    expect(screen.queryByLabelText("Local bundle path")).toBeNull();
  });

  it("requires an explicit warning confirmation before registering a local bundle", async () => {
    daemon.list.mockResolvedValue({ bundles: [] });
    daemon.register.mockResolvedValue(undefined);
    render(<DSHLocalPluginsSettingsView />);
    await screen.findByLabelText("Local bundle path");
    fireEvent.change(screen.getByLabelText("Local bundle ID"), { target: { value: "example" } });
    fireEvent.change(screen.getByLabelText("Local bundle path"), { target: { value: "/tmp/example" } });
    fireEvent.click(screen.getByRole("button", { name: "Register local bundle" }));
    expect(daemon.register).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "I understand, register" }));
    await waitFor(() => expect(daemon.register).toHaveBeenCalledWith({ id: "example", path: "/tmp/example" }));
  });
});
