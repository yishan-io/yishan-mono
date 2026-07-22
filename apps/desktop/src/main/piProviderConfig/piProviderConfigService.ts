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

type PiProviderConfigDependencies = {
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  builtInProviders: Provider[];
};

type PiProviderConfigDependenciesFactory = () => Promise<PiProviderConfigDependencies>;

async function createPiProviderConfigDependencies(): Promise<PiProviderConfigDependencies> {
  const [sdkModule, providerCatalogModule] = await Promise.all([
    import("@earendil-works/pi-coding-agent"),
    import("@earendil-works/pi-ai/providers/all"),
  ]);
  const agentDir = sdkModule.getAgentDir();
  const authStorage = sdkModule.AuthStorage.create(join(agentDir, "auth.json"));
  return {
    authStorage,
    modelRegistry: sdkModule.ModelRegistry.create(authStorage, join(agentDir, "models.json")),
    builtInProviders: providerCatalogModule.builtinProviders(),
  };
}

/** Owns Desktop access to Pi authentication storage, provider capabilities, and model snapshots. */
export class PiProviderConfigService {
  private dependenciesPromise: Promise<PiProviderConfigDependencies> | undefined;
  private snapshot: PiProviderConfigSnapshot | undefined;

  constructor(
    private readonly createDependencies: PiProviderConfigDependenciesFactory = createPiProviderConfigDependencies,
  ) {}

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
    this.dependenciesPromise ??= this.createDependencies();
    return await this.dependenciesPromise;
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
      const builtInProvider = builtInProviderById.get(providerId);
      return {
        id: providerId,
        name: modelRegistry.getProviderDisplayName(providerId),
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
      return authStatus.configured ? "external" : "none";
  }
}
