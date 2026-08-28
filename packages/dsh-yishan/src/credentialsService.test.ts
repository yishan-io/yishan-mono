import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CREDENTIALS_FILE_NAME, createCredentialsService } from "./credentialsService";

describe("Yishan credentials service", () => {
  it("uses only the DSH reference file and exposes no Pi auth.json record", async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), "yishan-dsh-credentials-"));
    await writeFile(
      join(dataDirectory, CREDENTIALS_FILE_NAME),
      "version: 1\nrefs:\n  AWS_ACCESS_KEY_ID: stored-secret\n",
    );
    await writeFile(join(dataDirectory, "auth.json"), '{"deepseek":{"type":"api_key","key":"pi-auth-secret"}}');
    const credentials = createCredentialsService(dataDirectory);

    await expect(credentials.resolve("AWS_ACCESS_KEY_ID")).resolves.toEqual({ value: "stored-secret" });
    await expect(credentials.resolve("DEEPSEEK_API_KEY")).resolves.toBeUndefined();
    await expect(credentials.readRecord("llm-pi-ai/amazon-bedrock")).resolves.toBeUndefined();
  });
});
