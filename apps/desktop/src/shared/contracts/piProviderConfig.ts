/** Credential source resolved by the Pi runtime without exposing secret values. */
export type PiProviderAuthSource = "none" | "oauth" | "auth_file" | "env" | "external";

/** Interactive authentication methods that Desktop can start. */
export type PiProviderAuthMethodKind = "oauth" | "api_key";

/** Desktop RPC event methods emitted while a Pi provider authentication prompt is active. */
export const PI_PROVIDER_CONFIG_EVENT_METHODS = {
  authPrompt: "piProviderConfig.authPrompt",
  authPromptClosed: "piProviderConfig.authPromptClosed",
} as const;

/** Renderer prompt requested by one provider-owned authentication flow. */
export type PiAuthPromptRequest =
  | {
      type: "text" | "secret";
      message: string;
      placeholder?: string;
    }
  | {
      type: "select";
      message: string;
      options: ReadonlyArray<{ id: string; label: string }>;
    };

/** Event payload opening one provider authentication prompt. */
export type PiAuthPromptRequestEvent = {
  requestId: string;
  prompt: PiAuthPromptRequest;
};

/** Renderer response submitted to one active provider authentication prompt. */
export type PiAuthPromptResponseInput =
  | { requestId: string; status: "submitted"; value: string }
  | { requestId: string; status: "cancelled" };

/** Request to start one provider authentication capability. */
export type AuthenticatePiProviderInput = {
  providerId: string;
  method: PiProviderAuthMethodKind;
};

/** Authentication capability shown for one provider configuration entry. */
export type PiProviderAuthMethod =
  | { kind: "oauth"; label: string }
  | { kind: "api_key"; label: string }
  | { kind: "external"; label: string };

/** Serializable provider inventory record exposed to Desktop renderer. */
export type PiProviderRecord = {
  id: string;
  name: string;
  hasAuth: boolean;
  available: boolean;
  authSource: PiProviderAuthSource;
  authMethods: PiProviderAuthMethod[];
};

/** Serializable model inventory record exposed to Desktop renderer. */
export type PiProviderModelRecord = {
  providerId: string;
  providerName: string;
  modelId: string;
  label: string;
};

/** Current provider and model inventory returned by Electron main. */
export type PiProviderConfigSnapshot = {
  providers: PiProviderRecord[];
  models: PiProviderModelRecord[];
  modelsLoadError?: string;
};

/** Stable error categories returned by Pi provider configuration IPC handlers. */
export type PiProviderConfigErrorCode =
  | "cancelled"
  | "authentication_in_progress"
  | "unsupported_provider"
  | "unsupported_method"
  | "invalid_credential"
  | "credential_not_found"
  | "storage_failure"
  | "invalid_input"
  | "snapshot_refresh_failed"
  | "operation_failed";

/** Serializable Pi provider configuration error exposed to the renderer. */
export type PiProviderConfigErrorPayload = {
  code: PiProviderConfigErrorCode;
  message: string;
};

/** Snapshot refresh result following a successful credential mutation. */
export type PiProviderConfigMutationOutcome =
  | { snapshot: PiProviderConfigSnapshot }
  | { refreshError: PiProviderConfigErrorPayload };

/** Shared result envelope for Pi provider configuration operations crossing the Electron IPC boundary. */
export type PiProviderConfigResult<T> = { ok: true; value: T } | { ok: false; error: PiProviderConfigErrorPayload };

/** Provider snapshot operation result returned by Electron main. */
export type PiProviderConfigSnapshotResult = PiProviderConfigResult<PiProviderConfigSnapshot>;

/** Credential mutation result returned by Electron main. */
export type PiProviderConfigMutationResult = PiProviderConfigResult<PiProviderConfigMutationOutcome>;

/** Parses one untrusted provider authentication request. */
export function parseAuthenticatePiProviderInput(value: unknown): AuthenticatePiProviderInput | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const providerId = parseNonEmptyString(value.providerId);
  const method = value.method;
  if (!providerId || (method !== "oauth" && method !== "api_key")) {
    return undefined;
  }
  return { providerId, method };
}

/** Parses one untrusted provider identifier. */
export function parsePiProviderId(value: unknown): string | undefined {
  return parseNonEmptyString(value);
}

/** Parses one untrusted authentication prompt response. */
export function parsePiAuthPromptResponseInput(value: unknown): PiAuthPromptResponseInput | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const requestId = parseNonEmptyString(value.requestId);
  if (!requestId) {
    return undefined;
  }
  if (value.status === "cancelled") {
    return { requestId, status: "cancelled" };
  }
  if (value.status !== "submitted" || typeof value.value !== "string" || value.value.trim().length === 0) {
    return undefined;
  }
  return { requestId, status: "submitted", value: value.value };
}

/** Parses one untrusted provider prompt event payload. */
export function parsePiAuthPromptRequestEventPayload(value: unknown): PiAuthPromptRequestEvent | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const requestId = parseNonEmptyString(value.requestId);
  const prompt = parsePiAuthPromptRequest(value.prompt);
  return requestId && prompt ? { requestId, prompt } : undefined;
}

/** Parses one untrusted provider prompt-closed event payload. */
export function parsePiAuthPromptClosedEventPayload(value: unknown): string | undefined {
  return isRecord(value) ? parseNonEmptyString(value.requestId) : undefined;
}

function parsePiAuthPromptRequest(value: unknown): PiAuthPromptRequest | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const message = parseNonEmptyString(value.message);
  if (!message) {
    return undefined;
  }
  if (value.type === "text" || value.type === "secret") {
    if (!isOptionalString(value.placeholder)) {
      return undefined;
    }
    return {
      type: value.type,
      message,
      ...(value.placeholder === undefined ? {} : { placeholder: value.placeholder }),
    };
  }
  if (value.type !== "select" || !Array.isArray(value.options) || value.options.length === 0) {
    return undefined;
  }
  const options: Array<{ id: string; label: string }> = [];
  for (const option of value.options) {
    if (!isRecord(option)) {
      return undefined;
    }
    const id = parseNonEmptyString(option.id);
    const label = parseNonEmptyString(option.label);
    if (!id || !label) {
      return undefined;
    }
    options.push({ id, label });
  }
  return { type: "select", message, options };
}

function parseNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
