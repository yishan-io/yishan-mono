import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CREDENTIALS_FILE_NAME, createCredentialsService } from "./credentialsService";

describe("Yishan credentials service", () => {
  it("returns no pi-ai credential record so ambient authentication can continue", async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), "yishan-dsh-credentials-"));
    await writeFile(join(dataDirectory, CREDENTIALS_FILE_NAME), "version: 1\nrefs:\n  AWS_ACCESS_KEY_ID: secret\n");
    const credentials = createCredentialsService(dataDirectory);

    await expect(credentials.readRecord("llm-pi-ai/amazon-bedrock")).resolves.toBeUndefined();
    await expect(credentials.resolve("AWS_ACCESS_KEY_ID")).resolves.toEqual({ value: "secret" });
  });
});
