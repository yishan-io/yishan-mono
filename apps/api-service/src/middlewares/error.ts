import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { StatusCodes } from "http-status-codes";

import { isBusinessError } from "@/errors";
import type { AppContext } from "@/hono";

export function handleAppError(error: unknown, c: AppContext) {
  if (isBusinessError(error)) {
    return c.json(
      {
        error: error.message,
        code: error.code,
        ...(error.details ?? {})
      },
      error.status as ContentfulStatusCode
    );
  }

  if (error instanceof HTTPException) {
    return c.json({ error: error.message }, error.status);
  }

  console.error("Unhandled API error", error);
  return c.json({ error: "Internal Server Error" }, StatusCodes.INTERNAL_SERVER_ERROR);
}
