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
  sdkModuleLoader?: PiSdkModuleLoader;
  providerCatalogLoader?: PiProviderCatalogLoader;
};

type PiSdkModule = Pick<
  typeof import("@earendil-works/pi-coding-agent"),
  "AuthStorage" | "ModelRegistry" | "getAgentDir"
>;

type PiSdkModuleLoader = () => Promise<PiSdkModule>;

type PiProviderCatalogModule = Pick<typeof import("@earendil-works/pi-ai/providers/all"), "builtinProviders">;

type PiProviderCatalogLoader = () => Promise<PiProviderCatalogModule>;

type PiProviderConfigDependencies = {
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  builtInProviders: Provider[];
};

async function loadPiSdkModule(): Promise<PiSdkModule> {
  return await import("@earendil-works/pi-coding-agent");
}

async function loadPiProviderCatalog(): Promise<PiProviderCatalogModule> {
  return await import("@earendil-works/pi-ai/providers/all");
}

/** Owns Desktop access to Pi authentication storage, provider capabilities, and model snapshots. */
export class PiProviderConfigService {
  private readonly options: PiProviderConfigServiceOptions;
  private readonly sdkModuleLoader: PiSdkModuleLoader;
  private readonly providerCatalogLoader: PiProviderCatalogLoader;
  private dependenciesPromise: Promise<PiProviderConfigDependencies> | undefined;
  private snapshot: PiProviderConfigSnapshot | undefined;

  constructor(options: PiProviderConfigServiceOptions = {}) {
    this.options = options;
    this.sdkModuleLoader = options.sdkModuleLoader ?? loadPiSdkModule;
    this.providerCatalogLoader = options.providerCatalogLoader ?? loadPiProviderCatalog;
  }

  /** Returns the cached Pi provider/model inventory, loading it on first use. */
  async getSnapshot(): Promise<PiProviderConfigSnapshot> {
    if (this.snapshot) {
      return this.snapshot;
    }
    const { authStorage, modelRegistry, builtInProviders } = await this.getDependencies();
    const snapshot = buildPiProviderConfigSnapshot(authStorage, modelRegistry, builtInProviders);
    this.snapshot = snapshot;
    return snapshot;
  }

  /** Reloads Pi provider/model configuration from local runtime state and replaces the cached snapshot. */
  async refreshSnapshot(): Promise<PiProviderConfigSnapshot> {
    const { authStorage, modelRegistry, builtInProviders } = await this.getDependencies();
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
    const { authStorage, builtInProviders } = await this.getDependencies();
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
    const { authStorage } = await this.getDependencies();
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

  private async getDependencies(): Promise<PiProviderConfigDependencies> {
    const dependenciesPromise = this.dependenciesPromise ?? this.createDependencies();
    this.dependenciesPromise = dependenciesPromise;
    try {
      return await dependenciesPromise;
    } catch (error) {
      if (this.dependenciesPromise === dependenciesPromise) {
        this.dependenciesPromise = undefined;
      }
      throw error;
    }
  }

  private async createDependencies(): Promise<PiProviderConfigDependencies> {
    const [sdkModule, providerCatalogModule] = await Promise.all([
      this.sdkModuleLoader(),
      this.providerCatalogLoader(),
    ]);
    const agentDir = this.options.agentDir ?? sdkModule.getAgentDir();
    const authStorage = this.options.authStorage ?? sdkModule.AuthStorage.create(join(agentDir, "auth.json"));
    const modelRegistry =
      this.options.modelRegistry ?? sdkModule.ModelRegistry.create(authStorage, join(agentDir, "models.json"));
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
