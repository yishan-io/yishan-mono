import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import type { AppEnv } from "@/hono";
import { readAccessToken, readBearerToken } from "./auth";

describe("auth middleware helpers", () => {
  it("reads bearer tokens from the Authorization header", async () => {
    const app = new Hono<AppEnv>();
    app.get("/token", (c) => c.json({ token: readBearerToken(c), accessToken: readAccessToken(c) }));

    const response = await app.request("http://example.com/token", {
      headers: {
        Authorization: "Bearer token-from-header",
      },
    });

    await expect(response.json()).resolves.toEqual({
      accessToken: "token-from-header",
      token: "token-from-header",
    });
  });

  it("falls back to websocket query auth when the header is unavailable", async () => {
    const app = new Hono<AppEnv>();
    app.get("/orgs/:orgId/projects/:projectId/workspaces/:workspaceId/events/ws", (c) =>
      c.json({ accessToken: readAccessToken(c) }),
    );

    const response = await app.request(
      "http://example.com/orgs/org-1/projects/project-1/workspaces/workspace-1/events/ws?accessToken=token-from-query",
    );

    await expect(response.json()).resolves.toEqual({
      accessToken: "token-from-query",
    });
  });

  it("does not accept query access tokens on non-websocket routes", async () => {
    const app = new Hono<AppEnv>();
    app.get("/token", (c) => c.json({ accessToken: readAccessToken(c) }));

    const response = await app.request("http://example.com/token?accessToken=token-from-query");

    await expect(response.json()).resolves.toEqual({
      accessToken: null,
    });
  });
});
