// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderCredentialDialog } from "./ProviderCredentialDialog";

afterEach(cleanup);

describe("ProviderCredentialDialog", () => {
  it("presents DSH ambient-provider guidance without invoking credential storage", () => {
    const onSave = vi.fn();
    render(
      <ProviderCredentialDialog
        open
        mode="add"
        providers={[
          {
            id: "amazon-bedrock",
            displayName: "Amazon Bedrock",
            authMode: "ambient",
            setupGuidance: "Uses system or cloud credentials configured on this computer.",
          },
        ]}
        onClose={vi.fn()}
        onSave={onSave}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText("Amazon Bedrock"));

    expect(screen.getByText("Uses system or cloud credentials configured on this computer.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "settings.providers.actions.save" })).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("normalizes a selected DSH API key for its runtime storage adapter", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onSaved = vi.fn();
    render(
      <ProviderCredentialDialog
        open
        mode="add"
        providers={[
          {
            id: "deepseek",
            displayName: "DeepSeek",
            authMode: "api-key",
            credentialRef: "DEEPSEEK_API_KEY",
          },
        ]}
        onClose={vi.fn()}
        onSave={onSave}
        onSaved={onSaved}
      />,
    );

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText("DeepSeek"));
    fireEvent.change(screen.getByPlaceholderText("settings.providers.dialog.keyPlaceholder"), {
      target: { value: "dsh-api-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "settings.providers.actions.save" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        provider: {
          id: "deepseek",
          displayName: "DeepSeek",
          authMode: "api-key",
          credentialRef: "DEEPSEEK_API_KEY",
        },
        key: "dsh-api-key",
        env: undefined,
      }),
    );
    expect(onSaved).toHaveBeenCalledWith("deepseek");
  });
});
