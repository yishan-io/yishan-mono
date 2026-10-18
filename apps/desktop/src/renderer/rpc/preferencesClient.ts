import { asRecord } from "@shared/validation/primitiveReaders";
import { request } from "./client";

const MAX_SCOPE_BYTES = 1024;
const MAX_KEY_BYTES = 256;
const MAX_VALUE_BYTES = 1024 * 1024;
const encoder = new TextEncoder();

/** A missing key has no value; JSON null is a present value. */
export type PreferenceResult = { found: false } | { found: true; value: unknown };
type InvokeFn = (method: string, params?: unknown) => Promise<unknown>;

function validateName(name: string, maximum: number): void {
  if (!name.length || encoder.encode(name).length > maximum) throw new TypeError("Invalid preference scope or key");
}

function isJson(payload: unknown, parents = new Set<object>()): boolean {
  if (payload === null || typeof payload === "string" || typeof payload === "boolean") return true;
  if (typeof payload === "number") return Number.isFinite(payload);
  if (typeof payload !== "object" || parents.has(payload)) return false;
  if (!Array.isArray(payload) && Object.getPrototypeOf(payload) !== Object.prototype) return false;
  parents.add(payload);
  const isValid = (Array.isArray(payload) ? Array.from(payload) : Object.values(payload)).every((entry) =>
    isJson(entry, parents),
  );
  parents.delete(payload);
  return isValid;
}

function validateValue(payload: unknown): void {
  if (!isJson(payload) || encoder.encode(JSON.stringify(payload)).length > MAX_VALUE_BYTES) {
    throw new TypeError("Invalid preference JSON value");
  }
}

function parseResult(payload: unknown): PreferenceResult {
  const response = asRecord(payload);
  if (response?.found === false && !Object.hasOwn(response, "value")) return { found: false };
  if (response?.found !== true || !Object.hasOwn(response, "value")) throw new TypeError("Invalid preference response");
  validateValue(response.value);
  return { found: true, value: response.value };
}

/** Shared syntax-only KV boundary; domain adapters own keys and payload interpretation. */
export class PreferencesClient {
  constructor(private readonly invoke: InvokeFn) {}

  /** Reads a scoped JSON value without substituting defaults. */
  async get(scope: string, key: string): Promise<PreferenceResult> {
    validateName(scope, MAX_SCOPE_BYTES);
    validateName(key, MAX_KEY_BYTES);
    return parseResult(await this.invoke("preferences.get", { scope, key }));
  }

  /** Returns the authoritative value, including a concurrent initialization winner. */
  async set(
    scope: string,
    key: string,
    value: unknown,
    initializeOnly = false,
  ): Promise<PreferenceResult & { found: true }> {
    validateName(scope, MAX_SCOPE_BYTES);
    validateName(key, MAX_KEY_BYTES);
    validateValue(value);
    const response = parseResult(
      await this.invoke("preferences.set", {
        scope,
        key,
        value,
        ...(initializeOnly ? { initializeOnly: true } : {}),
      }),
    );
    if (!response.found) throw new TypeError("Preference write was not acknowledged");
    return response;
  }
}

/** Renderer-wide preferences transport used only by concrete domain boundaries. */
export const preferencesClient = new PreferencesClient(request);
