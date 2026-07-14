import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { AuthLoginCallbacks, Provider } from "@earendil-works/pi-ai";
import type { AuthCredential, AuthStatus, AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { getErrorMessage } from "../../shared/helpers/errorHelpers";
import { PiRuntimeError, createPiRuntimeCancellationError } from "./piRuntimeErrors";
import type {
  PiProviderAuthMethod,
  PiProviderAuthMethodKind,
  PiRuntimeModelRecord,
  PiRuntimeProviderAuthSource,
  PiRuntimeProviderRecord,
  PiRuntimeSnapshot,
  PiRuntimeVersionStatus,
} from "./piRuntimeTypes";

const execFileAsync = promisify(execFile);
const PI_VERSION_PATTERN = /\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/;
const PI_VERSION_CHECK_TIMEOUT_MS = 5_000;
const PI_VERSION_CACHE_DURATION_MS = 5_000;
let installedPiVersionPromise: Promise<string | undefined> | undefined;
let installedPiVersionCheckedAt = 0;

type PiRuntimeServiceOptions = {
  agentDir?: string;
  authStorage?: AuthStorage;
  modelRegistry?: ModelRegistry;
  moduleLoader?: PiRuntimeModuleLoader;
  providerCatalogLoader?: PiProviderCatalogLoader;
  runtimeVersionLoader?: PiRuntimeVersionLoader;
};

type PiRuntimeModule = Pick<
  typeof import("@earendil-works/pi-coding-agent"),
  "AuthStorage" | "ModelRegistry" | "VERSION" | "getAgentDir"
>;

type PiRuntimeModuleLoader = () => Promise<PiRuntimeModule>;

type PiProviderCatalogModule = Pick<typeof import("@earendil-works/pi-ai/providers/all"), "builtinProviders">;

type PiProviderCatalogLoader = () => Promise<PiProviderCatalogModule>;

type PiRuntimeVersionLoader = () => Promise<string | undefined>;

type PiRuntimeDependencies = {
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  builtInProviders: Provider[];
  sdkVersion: string;
};

async function loadPiRuntimeModule(): Promise<PiRuntimeModule> {
  return await import("@earendil-works/pi-coding-agent");
}

async function loadPiProviderCatalog(): Promise<PiProviderCatalogModule> {
  return await import("@earendil-works/pi-ai/providers/all");
}

async function loadInstalledPiVersion(): Promise<string | undefined> {
  const now = Date.now();
  if (!installedPiVersionPromise || now - installedPiVersionCheckedAt >= PI_VERSION_CACHE_DURATION_MS) {
    installedPiVersionCheckedAt = now;
    installedPiVersionPromise = runInstalledPiVersionCheck();
  }
  return await installedPiVersionPromise;
}

async function runInstalledPiVersionCheck(): Promise<string | undefined> {
  try {
    const { stdout, stderr } = await execFileAsync("pi", ["--version"], {
      env: {
        ...process.env,
        PATH: buildPiRuntimeExecutablePath(process.env.PATH),
      },
      timeout: PI_VERSION_CHECK_TIMEOUT_MS,
      windowsHide: true,
    });
    return `${stdout}${stderr}`.match(PI_VERSION_PATTERN)?.[0];
  } catch (error) {
    console.warn("Could not determine installed Pi version", getErrorMessage(error));
    return undefined;
  }
}

/** Removes Yishan's notification wrapper so version checks inspect the executable used behind it. */
export function buildPiRuntimeExecutablePath(pathValue: string | undefined): string {
  const managedBinDir = resolve(homedir(), ".yishan", "bin");
  return (pathValue ?? "")
    .split(delimiter)
    .filter((entry) => entry && resolve(expandHomeDirectory(entry)) !== managedBinDir)
    .join(delimiter);
}

function expandHomeDirectory(pathValue: string): string {
  if (pathValue === "~") {
    return homedir();
  }
  if (pathValue.startsWith(`~${process.platform === "win32" ? "\\" : "/"}`)) {
    return join(homedir(), pathValue.slice(2));
  }
  return pathValue;
}

/** Builds one Pi runtime snapshot for desktop Agent connections UI. */
export class PiRuntimeService {
  private readonly options: PiRuntimeServiceOptions;
  private readonly moduleLoader: PiRuntimeModuleLoader;
  private readonly providerCatalogLoader: PiProviderCatalogLoader;
  private readonly runtimeVersionLoader: PiRuntimeVersionLoader;
  private runtimePromise: Promise<PiRuntimeDependencies> | undefined;

  constructor(options: PiRuntimeServiceOptions = {}) {
    this.options = options;
    this.moduleLoader = options.moduleLoader ?? loadPiRuntimeModule;
    this.providerCatalogLoader = options.providerCatalogLoader ?? loadPiProviderCatalog;
    this.runtimeVersionLoader = options.runtimeVersionLoader ?? loadInstalledPiVersion;
  }

  /** Returns the current Pi provider/model inventory from disk-backed runtime state. */
  async getSnapshot(): Promise<PiRuntimeSnapshot> {
    const [{ authStorage, modelRegistry, builtInProviders, sdkVersion }, runtimeVersion] = await Promise.all([
      this.getRuntime(),
      this.getRuntimeVersion(),
    ]);
    authStorage.reload();
    modelRegistry.refresh();
    return {
      ...buildPiRuntimeSnapshot(authStorage, modelRegistry, builtInProviders),
      version: {
        sdkVersion,
        ...(runtimeVersion ? { runtimeVersion } : {}),
        status: getPiRuntimeVersionStatus(sdkVersion, runtimeVersion),
      },
    };
  }

  /** Runs one provider-owned authentication method and persists only its complete credential. */
  async authenticate(
    providerId: string,
    method: PiProviderAuthMethodKind,
    callbacks: AuthLoginCallbacks,
  ): Promise<PiRuntimeSnapshot> {
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

    return await this.getSnapshot();
  }

  /** Removes one app-owned auth.json credential, leaving external sources untouched. */
  async removeCredential(providerId: string): Promise<PiRuntimeSnapshot> {
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
    return await this.getSnapshot();
  }

  private async getRuntime(): Promise<PiRuntimeDependencies> {
    this.runtimePromise ??= this.createRuntime();
    return await this.runtimePromise;
  }

  private async getRuntimeVersion(): Promise<string | undefined> {
    return await this.runtimeVersionLoader();
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
      sdkVersion: runtimeModule.VERSION,
    };
  }
}

function throwIfAuthenticationCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw createPiRuntimeCancellationError();
  }
}

/** Compares the SDK inventory version with the Pi executable used for AI Chat. */
export function getPiRuntimeVersionStatus(
  sdkVersion: string,
  runtimeVersion: string | undefined,
): PiRuntimeVersionStatus {
  if (!runtimeVersion) {
    return "unknown";
  }
  return runtimeVersion === sdkVersion ? "compatible" : "mismatch";
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
