import { HashRouter, Route, Routes } from "react-router-dom";
import { SettingsView } from "../../domains/settings/features/settings-shell/SettingsView";
import { AppShell } from "../../ui/layout/AppShell";
import { WorkspaceOverlay } from "../ui/WorkspaceOverlay";
import { ApplicationRouterView, NotFoundRouteView } from "./ApplicationRouterView";

/**
 * Application route tree — the single owner of route composition (Phase 11,
 * desktop5.md). Route files own route parameters, layout, and page-local
 * display state only; session and daemon bootstrap live in
 * `app/runtime/sessionBootstrap.ts`.
 */
export function AppRoutes() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<ApplicationRouterView />}>
            <Route index element={null} />
            <Route
              path="settings"
              element={
                <WorkspaceOverlay>
                  <SettingsView />
                </WorkspaceOverlay>
              }
            />
          </Route>
          <Route path="*" element={<NotFoundRouteView />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
