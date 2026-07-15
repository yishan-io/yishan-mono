import { join } from "node:path";
import type { AuthLoginCallbacks, Provider } from "@earendil-works/pi-ai";
import type { AuthCredential, AuthStatus, AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import type {
  PiProviderAuthMethod,
  PiProviderAuthMethodKind,
  PiRuntimeModelRecord,
  PiRuntimeProviderAuthSource,
  PiRuntimeProviderRecord,
  PiRuntimeSnapshot,
} from "../../shared/contracts/piRuntime";
import { PiRuntimeError, createPiRuntimeCancellationError } from "./piRuntimeErrors";

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

  constructor(options: PiProviderConfigServiceOptions = {}) {
    this.options = options;
    this.moduleLoader = options.moduleLoader ?? loadPiRuntimeModule;
    this.providerCatalogLoader = options.providerCatalogLoader ?? loadPiProviderCatalog;
  }

  /** Returns the current Pi provider/model inventory from disk-backed runtime state. */
  async getSnapshot(): Promise<PiRuntimeSnapshot> {
    const { authStorage, modelRegistry, builtInProviders } = await this.getRuntime();
    authStorage.reload();
    modelRegistry.refresh();
    return buildPiRuntimeSnapshot(authStorage, modelRegistry, builtInProviders);
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
      throw new PiRuntimeError("unsupported_provider", `Provider authentication is not supported: ${providerId}`);
    }

    if (method === "oauth") {
      const oauthLogin = provider.auth.oauth?.login;
      if (!oauthLogin) {
        throw new PiRuntimeError("unsupported_method", `OAuth authentication is not supported: ${providerId}`);
      }
      const credential = await oauthLogin(callbacks);
      throwIfAuthenticationCancelled(callbacks.signal);
      storeCredential(authStorage, providerId, credential);
    } else if (method === "api_key") {
      const apiKeyLogin = provider.auth.apiKey?.login;
      if (!apiKeyLogin) {
        throw new PiRuntimeError("unsupported_method", `API-key authentication is not supported: ${providerId}`);
      }
      const credential = await apiKeyLogin(callbacks);
      const key = credential.key?.trim();
      if (!key) {
        throw new PiRuntimeError("invalid_credential", "API key is required.");
      }
      throwIfAuthenticationCancelled(callbacks.signal);
      storeCredential(authStorage, providerId, {
        type: "api_key",
        key,
        ...(credential.env ? { env: credential.env } : {}),
      });
    } else {
      throw new PiRuntimeError("unsupported_method", `Provider authentication method is not supported: ${method}`);
    }
  }

  /** Removes one app-owned auth.json credential, leaving external sources untouched. */
  async removeCredential(providerId: string): Promise<void> {
    const { authStorage } = await this.getRuntime();
    let credential: AuthCredential | undefined;
    try {
      credential = authStorage.get(providerId);
    } catch {
      throw new PiRuntimeError("storage_failure", "Could not read the stored provider credential.");
    }
    if (!credential) {
      throw new PiRuntimeError("credential_not_found", `No stored credential exists for provider: ${providerId}`);
    }
    try {
      authStorage.remove(providerId);
    } catch {
      throw new PiRuntimeError("storage_failure", "Could not remove the stored provider credential.");
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
    throw createPiRuntimeCancellationError();
  }
}

function storeCredential(authStorage: AuthStorage, providerId: string, credential: AuthCredential): void {
  try {
    authStorage.set(providerId, credential);
  } catch {
    throw new PiRuntimeError("storage_failure", "Could not save the provider credential.");
  }
}

/** Builds one serializable provider/model snapshot from Pi runtime primitives. */
export function buildPiRuntimeSnapshot(
  authStorage: AuthStorage,
  modelRegistry: ModelRegistry,
  builtInProviders: readonly Provider[],
): PiRuntimeSnapshot {
  const availableModels = modelRegistry.getAvailable();
  const availableProviderIds = new Set(availableModels.map((model) => model.provider));
  const providers = buildPiRuntimeProviderRecords(authStorage, modelRegistry, builtInProviders, availableProviderIds);
  const providerNameById = new Map(providers.map((provider) => [provider.id, provider.name]));
  const availableModelKeys = new Set(availableModels.map((model) => `${model.provider}:${model.id}`));
  const models = modelRegistry
    .getAll()
    .map<PiRuntimeModelRecord>((model) => ({
      providerId: model.provider,
      providerName: providerNameById.get(model.provider) ?? modelRegistry.getProviderDisplayName(model.provider),
      modelId: model.id,
      label: model.name.trim() || model.id,
      available: availableModelKeys.has(`${model.provider}:${model.id}`),
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

function buildPiRuntimeProviderRecords(
  authStorage: AuthStorage,
  modelRegistry: ModelRegistry,
  builtInProviders: readonly Provider[],
  availableProviderIds: ReadonlySet<string>,
): PiRuntimeProviderRecord[] {
  const builtInProviderById = new Map(builtInProviders.map((provider) => [provider.id, provider]));
  const providerIds = new Set<string>([
    ...modelRegistry.getAll().map((model) => model.provider),
    ...authStorage.list(),
    ...builtInProviderById.keys(),
  ]);

  return [...providerIds]
    .sort((left, right) => left.localeCompare(right))
    .map<PiRuntimeProviderRecord>((providerId) => {
      const credential = authStorage.get(providerId);
      const authStatus = modelRegistry.getProviderAuthStatus(providerId);
      const hasAuth = authStatus.configured || authStorage.hasAuth(providerId);
      const builtInProvider = builtInProviderById.get(providerId);
      return {
        id: providerId,
        name: modelRegistry.getProviderDisplayName(providerId),
        hasAuth,
        available: availableProviderIds.has(providerId),
        authSource: inferPiRuntimeProviderAuthSource(credential, authStatus),
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
export function inferPiRuntimeProviderAuthSource(
  credential: AuthCredential | undefined,
  authStatus: AuthStatus,
): PiRuntimeProviderAuthSource {
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
