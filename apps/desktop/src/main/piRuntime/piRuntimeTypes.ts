export type PiRuntimeProviderAuthSource = "none" | "oauth" | "auth_file" | "env" | "external";

export type PiProviderAuthMethodKind = "oauth" | "api_key";

export type PiAuthPromptRequest =
  | {
      type: "text" | "secret";
      message: string;
      placeholder?: string;
      allowEmpty?: boolean;
    }
  | {
      type: "select";
      message: string;
      options: ReadonlyArray<{ id: string; label: string; description?: string }>;
    };

export type PiAuthPromptRequestEvent = {
  requestId: string;
  prompt: PiAuthPromptRequest;
};

export type PiAuthPromptResponseInput =
  | { requestId: string; status: "submitted"; value: string }
  | { requestId: string; status: "cancelled" };

export type AuthenticatePiProviderInput = {
  providerId: string;
  method: PiProviderAuthMethodKind;
};

export type PiProviderAuthMethod =
  | { kind: "oauth"; label: string }
  | { kind: "api_key"; label: string }
  | { kind: "external"; label: string };

export type PiRuntimeProviderRecord = {
  id: string;
  name: string;
  hasAuth: boolean;
  available: boolean;
  authSource: PiRuntimeProviderAuthSource;
  authMethods: PiProviderAuthMethod[];
};

export type PiRuntimeModelRecord = {
  providerId: string;
  providerName: string;
  modelId: string;
  label: string;
  available: boolean;
};

export type PiRuntimeSnapshot = {
  providers: PiRuntimeProviderRecord[];
  models: PiRuntimeModelRecord[];
  modelsLoadError?: string;
};

/** Stable error categories returned by Pi runtime mutation IPC handlers. */
export type PiRuntimeErrorCode =
  | "cancelled"
  | "authentication_in_progress"
  | "unsupported_provider"
  | "unsupported_method"
  | "invalid_credential"
  | "credential_not_found"
  | "storage_failure"
  | "operation_failed";

/** Serializable Pi runtime error exposed to the renderer. */
export type PiRuntimeErrorPayload = {
  code: PiRuntimeErrorCode;
  message: string;
};

/** Result envelope for Pi runtime mutations crossing the Electron IPC boundary. */
export type PiRuntimeSnapshotResult =
  | { ok: true; snapshot: PiRuntimeSnapshot }
  | { ok: false; error: PiRuntimeErrorPayload };
