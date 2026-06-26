import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";

export type WorkbenchBodyDensity = "flush" | "padded";

export type WorkbenchChromeLayout = {
  dividerTopGap: number;
  headerHorizontalInset: number;
  headerMinHeight: number;
  headerVerticalInset: number;
  panelBottomInset: number;
  panelHorizontalInset: number;
  panelSectionGap: number;
  panelTopInset: number;
};

export type WorkbenchFrameLayout = {
  bodyBottomInset: number;
  bodyHorizontalInset: number;
  bodyTopInset: number;
} & WorkbenchChromeLayout;

export function resolveWorkbenchChromeLayout(): WorkbenchChromeLayout {
  return {
    dividerTopGap: MOBILE_UI_TOKENS.shellChrome.dividerTopGap,
    headerHorizontalInset: MOBILE_UI_TOKENS.shellChrome.headerInsetX,
    headerMinHeight: MOBILE_UI_TOKENS.shellChrome.headerMinHeight,
    headerVerticalInset: MOBILE_UI_TOKENS.shellChrome.headerInsetY,
    panelBottomInset: MOBILE_UI_TOKENS.shellChrome.panelBottomInset,
    panelHorizontalInset: MOBILE_UI_TOKENS.shellChrome.headerInsetX,
    panelSectionGap: MOBILE_UI_TOKENS.pane.headerX,
    panelTopInset: MOBILE_UI_TOKENS.shellChrome.panelTopInset,
  };
}

export function resolveWorkbenchFrameLayout(density: WorkbenchBodyDensity = "flush"): WorkbenchFrameLayout {
  return {
    ...resolveWorkbenchChromeLayout(),
    bodyBottomInset: density === "padded" ? MOBILE_UI_TOKENS.pane.bodyBottom : 0,
    bodyHorizontalInset: density === "padded" ? MOBILE_UI_TOKENS.pane.insetX : 0,
    bodyTopInset: density === "padded" ? MOBILE_UI_TOKENS.pane.bodyTop : 0,
  };
}
