import type { BlobBucket, BlobListResult, BlobPutOptions, BlobReadResult } from "@/store/blob/types";

export type S3BucketConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

const encoder = new TextEncoder();

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(data: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(data)));
}

async function hmac(key: ArrayBuffer | string, data: string): Promise<ArrayBuffer> {
  const raw = typeof key === "string" ? encoder.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function xmlUnescape(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * BlobBucket over the R2 S3-compatible endpoint (SigV4, no SDK dependency).
 * Intended for offline tooling such as the Postgres -> R2 migration script.
 */
export class S3BlobBucket implements BlobBucket {
  private readonly host: string;

  constructor(private readonly config: S3BucketConfig) {
    this.host = `${config.accountId}.r2.cloudflarestorage.com`;
  }

  async get(key: string): Promise<BlobReadResult | null> {
    const response = await this.request("GET", this.objectPath(key));
    if (response.status === 404) {
      return null;
    }
    await this.assertOk(response, `GET ${key}`);
    return { value: await response.json(), etag: this.cleanEtag(response.headers.get("etag")) };
  }

  async put(key: string, value: unknown, opts?: BlobPutOptions): Promise<{ etag: string } | null> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (opts?.ifMatch) {
      headers["if-match"] = `"${opts.ifMatch}"`;
    }
    if (opts?.ifNoneMatch) {
      headers["if-none-match"] = opts.ifNoneMatch;
    }
    const response = await this.request("PUT", this.objectPath(key), {}, JSON.stringify(value), headers);
    if (response.status === 412 || (opts?.ifMatch && response.status === 404)) {
      return null;
    }
    await this.assertOk(response, `PUT ${key}`);
    return { etag: this.cleanEtag(response.headers.get("etag")) };
  }

  async delete(keys: string[]): Promise<void> {
    for (const key of keys) {
      const response = await this.request("DELETE", this.objectPath(key));
      if (response.status !== 404) {
        await this.assertOk(response, `DELETE ${key}`);
      }
    }
  }

  async list(prefix: string, cursor?: string): Promise<BlobListResult> {
    const query: Record<string, string> = { "list-type": "2", prefix };
    if (cursor) {
      query["continuation-token"] = cursor;
    }
    const response = await this.request("GET", `/${this.config.bucket}`, query);
    await this.assertOk(response, `LIST ${prefix}`);
    const xml = await response.text();
    const keys = [...xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)].map((m) => xmlUnescape(m[1] ?? ""));
    const next = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1];
    return { keys, cursor: next ? xmlUnescape(next) : undefined };
  }

  private objectPath(key: string): string {
    return `/${this.config.bucket}/${key.split("/").map(rfc3986).join("/")}`;
  }

  private cleanEtag(etag: string | null): string {
    return (etag ?? "").replace(/"/g, "");
  }

  private async assertOk(response: Response, what: string): Promise<void> {
    if (!response.ok) {
      throw new Error(`R2 S3 ${what} failed: ${response.status} ${await response.text()}`);
    }
  }

  private async request(
    method: string,
    path: string,
    query: Record<string, string> = {},
    body = "",
    extraHeaders: Record<string, string> = {},
  ): Promise<Response> {
    const amzDate = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = await sha256Hex(body);
    const canonicalQuery = Object.entries(query)
      .map(([k, v]) => [rfc3986(k), rfc3986(v)] as const)
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = [
      method,
      path,
      canonicalQuery,
      `host:${this.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`,
      signedHeaders,
      payloadHash,
    ].join("\n");
    const scope = `${dateStamp}/auto/s3/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join("\n");
    const kDate = await hmac(`AWS4${this.config.secretAccessKey}`, dateStamp);
    const kRegion = await hmac(kDate, "auto");
    const kService = await hmac(kRegion, "s3");
    const kSigning = await hmac(kService, "aws4_request");
    const signature = hex(await hmac(kSigning, stringToSign));

    return fetch(`https://${this.host}${path}${canonicalQuery ? `?${canonicalQuery}` : ""}`, {
      method,
      body: body === "" ? undefined : body,
      headers: {
        ...extraHeaders,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
        authorization: `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
    });
  }
}
