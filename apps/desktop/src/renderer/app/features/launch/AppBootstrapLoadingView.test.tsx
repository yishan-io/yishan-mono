// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppBootstrapLoadingView } from "./AppBootstrapLoadingView";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("AppBootstrapLoadingView", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a draggable topbar region for window dragging", () => {
    render(<AppBootstrapLoadingView hasError={false} onRetry={() => {}} />);

    const topbar = screen.getByTestId("bootstrap-loading-topbar");
    expect(topbar).toBeTruthy();
    expect(topbar.tagName).toBe("HEADER");
    expect(topbar.classList.contains("electron-webkit-app-region-drag")).toBe(true);
  });

  it("renders loading content below the topbar", () => {
    render(<AppBootstrapLoadingView hasError={false} onRetry={() => {}} />);

    expect(screen.getByText("app.bootstrap.badge")).toBeTruthy();
    expect(screen.getByText("app.bootstrap.title")).toBeTruthy();
  });

  it("renders retry button with no-drag class when hasError is true", () => {
    render(<AppBootstrapLoadingView hasError={true} onRetry={() => {}} />);

    const retryButton = screen.getByRole("button", { name: "app.bootstrap.retry" });
    expect(retryButton).toBeTruthy();
    expect(retryButton.classList.contains("electron-webkit-app-region-no-drag")).toBe(true);
  });

  it("does not render retry button when hasError is false", () => {
    render(<AppBootstrapLoadingView hasError={false} onRetry={() => {}} />);

    expect(screen.queryByRole("button", { name: "app.bootstrap.retry" })).toBeNull();
  });
});
