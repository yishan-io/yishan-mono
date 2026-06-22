const textDecoder = new TextDecoder();

type BlobLike = {
  text: () => Promise<string>;
};

type ArrayBufferLike = {
  arrayBuffer: () => Promise<ArrayBuffer>;
};

function isBlobLike(value: unknown): value is BlobLike {
  return typeof value === "object" && value !== null && typeof (value as BlobLike).text === "function";
}

function hasArrayBuffer(value: unknown): value is ArrayBufferLike {
  return typeof value === "object" && value !== null && typeof (value as ArrayBufferLike).arrayBuffer === "function";
}

export function describeWebSocketMessageData(data: unknown) {
  if (data === null) {
    return { type: "null" } as const;
  }

  if (data === undefined) {
    return { type: "undefined" } as const;
  }

  if (typeof data === "string") {
    return { length: data.length, type: "string" } as const;
  }

  if (data instanceof String) {
    return { length: data.valueOf().length, type: "boxed-string" } as const;
  }

  if (data instanceof ArrayBuffer) {
    return { byteLength: data.byteLength, type: "array-buffer" } as const;
  }

  if (ArrayBuffer.isView(data)) {
    return { byteLength: data.byteLength, type: "typed-array" } as const;
  }

  const record = data as Record<string, unknown>;

  return {
    hasArrayBuffer: hasArrayBuffer(data),
    hasText: isBlobLike(data),
    keys: Object.keys(record).sort(),
    type: data.constructor?.name ?? typeof data,
  } as const;
}

/**
 * Normalizes websocket event payloads across browser, Bun, and React Native runtimes.
 * React Native can surface text frames as Blob-like objects instead of plain strings.
 */
export async function readWebSocketTextMessage(data: unknown): Promise<string | null> {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof String) {
    return data.valueOf();
  }

  if (data instanceof ArrayBuffer) {
    return textDecoder.decode(data);
  }

  if (ArrayBuffer.isView(data)) {
    return textDecoder.decode(data);
  }

  if (isBlobLike(data)) {
    try {
      return await data.text();
    } catch {
      // Fall through to arrayBuffer() support below.
    }
  }

  if (hasArrayBuffer(data)) {
    return textDecoder.decode(await data.arrayBuffer());
  }

  return null;
}
