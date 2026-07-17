import { join } from "node:path";
import type { AuthLoginCallbacks, Provider } from "@earendil-works/pi-ai";
import type { AuthCredential, AuthStatus, AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import type {
  PiProviderAuthMethod,
  PiProviderAuthMethodKind,
  PiProviderAuthSource,
  PiProviderConfigSnapshot,
  PiProviderModelRecord,
  PiProviderRecord,
} from "../../shared/contracts/piProviderConfig";
import { PiProviderConfigError, createPiProviderConfigCancellationError } from "./piProviderConfigErrors";

type PiProviderConfigServiceOptions = {
  agentDir?: string;
  authStorage?: AuthStorage;
  modelRegistry?: ModelRegistry;
  moduleLoader?: PiRuntimeModuleLoader;
  providerCatalogLoader?: PiProviderCatalogLoader;
};

type PiRuntimeModule = Pick<
  typeof import("@earendil-works/pi-coding-agent"),
  "AuthStorage" | "ModelRegistry" | "getAgentDir"
>;

type PiRuntimeModuleLoader = () => Promise<PiRuntimeModule>;

type PiProviderCatalogModule = Pick<typeof import("@earendil-works/pi-ai/providers/all"), "builtinProviders">;

type PiProviderCatalogLoader = () => Promise<PiProviderCatalogModule>;

type PiRuntimeDependencies = {
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  builtInProviders: Provider[];
};

async function loadPiRuntimeModule(): Promise<PiRuntimeModule> {
  return await import("@earendil-works/pi-coding-agent");
}

async function loadPiProviderCatalog(): Promise<PiProviderCatalogModule> {
  return await import("@earendil-works/pi-ai/providers/all");
}

/** Owns Desktop access to Pi authentication storage, provider capabilities, and model snapshots. */
export class PiProviderConfigService {
  private readonly options: PiProviderConfigServiceOptions;
  private readonly moduleLoader: PiRuntimeModuleLoader;
  private readonly providerCatalogLoader: PiProviderCatalogLoader;
  private runtimePromise: Promise<PiRuntimeDependencies> | undefined;
  private snapshot: PiProviderConfigSnapshot | undefined;

  constructor(options: PiProviderConfigServiceOptions = {}) {
    this.options = options;
    this.moduleLoader = options.moduleLoader ?? loadPiRuntimeModule;
    this.providerCatalogLoader = options.providerCatalogLoader ?? loadPiProviderCatalog;
  }

  /** Returns the cached Pi provider/model inventory, loading it on first use. */
  async getSnapshot(): Promise<PiProviderConfigSnapshot> {
    if (this.snapshot) {
      return this.snapshot;
    }
    const { authStorage, modelRegistry, builtInProviders } = await this.getRuntime();
    const snapshot = buildPiProviderConfigSnapshot(authStorage, modelRegistry, builtInProviders);
    this.snapshot = snapshot;
    return snapshot;
  }

  /** Reloads Pi provider/model configuration from local runtime state and replaces the cached snapshot. */
  async refreshSnapshot(): Promise<PiProviderConfigSnapshot> {
    const { authStorage, modelRegistry, builtInProviders } = await this.getRuntime();
    authStorage.reload();
    modelRegistry.refresh();
    const snapshot = buildPiProviderConfigSnapshot(authStorage, modelRegistry, builtInProviders);
    this.snapshot = snapshot;
    return snapshot;
  }

  /** Runs one provider-owned authentication method and persists only its complete credential. */
  async authenticate(
    providerId: string,
    method: PiProviderAuthMethodKind,
    callbacks: AuthLoginCallbacks,
  ): Promise<void> {
    const { authStorage, builtInProviders } = await this.getRuntime();
    const provider = builtInProviders.find((entry) => entry.id === providerId);
    if (!provider) {
      throw new PiProviderConfigError(
        "unsupported_provider",
        `Provider authentication is not supported: ${providerId}`,
      );
    }

    if (method === "oauth") {
      const oauthLogin = provider.auth.oauth?.login;
      if (!oauthLogin) {
        throw new PiProviderConfigError("unsupported_method", `OAuth authentication is not supported: ${providerId}`);
      }
      const credential = await oauthLogin(callbacks);
      throwIfAuthenticationCancelled(callbacks.signal);
      storeCredential(authStorage, providerId, credential);
    } else if (method === "api_key") {
      const apiKeyLogin = provider.auth.apiKey?.login;
      if (!apiKeyLogin) {
        throw new PiProviderConfigError("unsupported_method", `API-key authentication is not supported: ${providerId}`);
      }
      const credential = await apiKeyLogin(callbacks);
      const key = credential.key?.trim();
      if (!key) {
        throw new PiProviderConfigError("invalid_credential", "API key is required.");
      }
      throwIfAuthenticationCancelled(callbacks.signal);
      storeCredential(authStorage, providerId, {
        type: "api_key",
        key,
        ...(credential.env ? { env: credential.env } : {}),
      });
    } else {
      throw new PiProviderConfigError(
        "unsupported_method",
        `Provider authentication method is not supported: ${method}`,
      );
    }
  }

  /** Removes one app-owned auth.json credential, leaving external sources untouched. */
  async removeCredential(providerId: string): Promise<void> {
    const { authStorage } = await this.getRuntime();
    let credential: AuthCredential | undefined;
    try {
      credential = authStorage.get(providerId);
    } catch {
      throw new PiProviderConfigError("storage_failure", "Could not read the stored provider credential.");
    }
    if (!credential) {
      throw new PiProviderConfigError(
        "credential_not_found",
        `No stored credential exists for provider: ${providerId}`,
      );
    }
    try {
      authStorage.remove(providerId);
    } catch {
      throw new PiProviderConfigError("storage_failure", "Could not remove the stored provider credential.");
    }
  }

  private async getRuntime(): Promise<PiRuntimeDependencies> {
    const runtimePromise = this.runtimePromise ?? this.createRuntime();
    this.runtimePromise = runtimePromise;
    try {
      return await runtimePromise;
    } catch (error) {
      if (this.runtimePromise === runtimePromise) {
        this.runtimePromise = undefined;
      }
      throw error;
    }
  }

  private async createRuntime(): Promise<PiRuntimeDependencies> {
    const [runtimeModule, providerCatalogModule] = await Promise.all([
      this.moduleLoader(),
      this.providerCatalogLoader(),
    ]);
    const agentDir = this.options.agentDir ?? runtimeModule.getAgentDir();
    const authStorage = this.options.authStorage ?? runtimeModule.AuthStorage.create(join(agentDir, "auth.json"));
    const modelRegistry =
      this.options.modelRegistry ?? runtimeModule.ModelRegistry.create(authStorage, join(agentDir, "models.json"));
    return {
      authStorage,
      modelRegistry,
      builtInProviders: providerCatalogModule.builtinProviders(),
    };
  }
}

function throwIfAuthenticationCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw createPiProviderConfigCancellationError();
  }
}

function storeCredential(authStorage: AuthStorage, providerId: string, credential: AuthCredential): void {
  try {
    authStorage.set(providerId, credential);
  } catch {
    throw new PiProviderConfigError("storage_failure", "Could not save the provider credential.");
  }
}

/** Builds one serializable provider/model snapshot from Pi runtime primitives. */
export function buildPiProviderConfigSnapshot(
  authStorage: AuthStorage,
  modelRegistry: ModelRegistry,
  builtInProviders: readonly Provider[],
): PiProviderConfigSnapshot {
  const availableModels = modelRegistry.getAvailable();
  const availableProviderIds = new Set(availableModels.map((model) => model.provider));
  const providers = buildPiProviderRecords(authStorage, modelRegistry, builtInProviders, availableProviderIds);
  const providerNameById = new Map(providers.map((provider) => [provider.id, provider.name]));
  const models = availableModels
    .map<PiProviderModelRecord>((model) => ({
      providerId: model.provider,
      providerName: providerNameById.get(model.provider) ?? modelRegistry.getProviderDisplayName(model.provider),
      modelId: model.id,
      label: model.name.trim() || model.id,
    }))
    .sort((left, right) =>
      left.providerId === right.providerId
        ? left.modelId.localeCompare(right.modelId)
        : left.providerId.localeCompare(right.providerId),
    );

  const modelsLoadError = modelRegistry.getError();

  return {
    providers,
    models,
    ...(modelsLoadError ? { modelsLoadError } : {}),
  };
}

function buildPiProviderRecords(
  authStorage: AuthStorage,
  modelRegistry: ModelRegistry,
  builtInProviders: readonly Provider[],
  availableProviderIds: ReadonlySet<string>,
): PiProviderRecord[] {
  const builtInProviderById = new Map(builtInProviders.map((provider) => [provider.id, provider]));
  const providerIds = new Set<string>([
    ...modelRegistry.getAll().map((model) => model.provider),
    ...authStorage.list(),
    ...builtInProviderById.keys(),
  ]);

  return [...providerIds]
    .sort((left, right) => left.localeCompare(right))
    .map<PiProviderRecord>((providerId) => {
      const credential = authStorage.get(providerId);
      const authStatus = modelRegistry.getProviderAuthStatus(providerId);
      const hasAuth = authStatus.configured || authStorage.hasAuth(providerId);
      const builtInProvider = builtInProviderById.get(providerId);
      return {
        id: providerId,
        name: modelRegistry.getProviderDisplayName(providerId),
        hasAuth,
        available: availableProviderIds.has(providerId),
        authSource: inferPiProviderAuthSource(credential, authStatus),
        authMethods: builtInProvider ? buildPiProviderAuthMethods(builtInProvider) : [],
      };
    });
}

function buildPiProviderAuthMethods(provider: Provider): PiProviderAuthMethod[] {
  const methods: PiProviderAuthMethod[] = [];
  if (provider.auth.oauth) {
    methods.push({ kind: "oauth", label: provider.auth.oauth.name });
  }
  if (provider.auth.apiKey?.login) {
    methods.push({ kind: "api_key", label: provider.auth.apiKey.name });
  } else if (provider.auth.apiKey) {
    methods.push({ kind: "external", label: provider.auth.apiKey.name });
  }
  return methods;
}

/** Maps Pi auth/runtime config state to the smaller desktop-facing auth source enum. */
export function inferPiProviderAuthSource(
  credential: AuthCredential | undefined,
  authStatus: AuthStatus,
): PiProviderAuthSource {
  if (credential?.type === "oauth") {
    return "oauth";
  }

  if (credential?.type === "api_key") {
    return "auth_file";
  }

  switch (authStatus.source) {
    case "stored":
      return "auth_file";
    case "environment":
      return "env";
    case "fallback":
    case "models_json_command":
    case "models_json_key":
    case "runtime":
      return "external";
    default:
      return "none";
  }
}
