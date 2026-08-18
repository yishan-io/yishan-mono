import { SettingsView } from "@renderer/domains/settings";
import { HashRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "../features/app-menu/AppShell";
import { ApplicationRouterView, NotFoundRouteView } from "./ApplicationRouterView";
import { RouteOverlay } from "./RouteOverlay";

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
                <RouteOverlay>
                  <SettingsView />
                </RouteOverlay>
              }
            />
          </Route>
          <Route path="*" element={<NotFoundRouteView />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
