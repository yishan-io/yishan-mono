import { describe, expect, it } from "vitest";

import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";
import { resolveWorkbenchChromeLayout, resolveWorkbenchFrameLayout } from "./workbenchFrameDomain";

describe("workbenchFrameDomain", () => {
  it("keeps workbench chrome rhythm anchored to shared shell chrome tokens", () => {
    expect(resolveWorkbenchChromeLayout()).toMatchObject({
      dividerTopGap: MOBILE_UI_TOKENS.shellChrome.dividerTopGap,
      headerHorizontalInset: MOBILE_UI_TOKENS.shellChrome.headerInsetX,
      headerMinHeight: MOBILE_UI_TOKENS.shellChrome.headerMinHeight,
      headerVerticalInset: MOBILE_UI_TOKENS.shellChrome.headerInsetY,
      panelBottomInset: MOBILE_UI_TOKENS.shellChrome.panelBottomInset,
      panelHorizontalInset: MOBILE_UI_TOKENS.shellChrome.headerInsetX,
      panelTopInset: MOBILE_UI_TOKENS.shellChrome.panelTopInset,
    });
  });

  it("uses a flush body for pane-oriented workbench surfaces", () => {
    expect(resolveWorkbenchFrameLayout("flush")).toMatchObject({
      bodyBottomInset: 0,
      bodyHorizontalInset: 0,
      bodyTopInset: 0,
    });
  });

  it("uses pane insets for padded workbench body states", () => {
    expect(resolveWorkbenchFrameLayout("padded")).toMatchObject({
      bodyBottomInset: MOBILE_UI_TOKENS.pane.bodyBottom,
      bodyHorizontalInset: MOBILE_UI_TOKENS.pane.insetX,
      bodyTopInset: MOBILE_UI_TOKENS.pane.bodyTop,
    });
  });
});
