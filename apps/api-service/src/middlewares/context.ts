import type { Next } from "hono";

import { getDb } from "../db/client";
import { getServiceConfig } from "../env";
import type { AppContext } from "../hono";
import { createServices } from "../services";

export async function injectRequestContext(c: AppContext, next: Next) {
  const config = getServiceConfig(c);
  const db = getDb(config.databaseUrl);
  const services = createServices({ db, config });

  c.set("config", config);
  c.set("services", services);

  await next();
}
