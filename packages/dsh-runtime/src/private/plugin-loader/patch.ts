import { isAbsolute, relative, resolve } from "node:path";

import { type Node, type YAMLMap, isAlias, isMap, isNode, isScalar, isSeq, parseDocument } from "yaml";

/** A JSON-compatible value accepted as static plugin configuration. */
export type PluginPatchConfig =
  | null
  | boolean
  | number
  | string
  | PluginPatchConfig[]
  | { [key: string]: PluginPatchConfig };

/** A verified package file inventory used to resolve local plugin entrypoints. */
export interface PluginPatchParseOptions {
  /** Absolute package root verified by the caller. */
  packageRoot: string;
  /** Verified paths relative to `packageRoot`. */
  inventory: Iterable<string>;
}

/** Static Cordis service dependencies represented as data only. */
export type PluginPatchInject = string[] | { [service: string]: PluginPatchConfig };

/** A static plugin declaration that is safe to hand to runtime composition code. */
export interface PluginPatchEntry {
  /** Stable, unique plugin identifier. */
  id: string;
  /** Absolute entrypoint resolved inside the verified package root. */
  name: string;
  /** JSON-compatible, data-only plugin configuration. */
  config: PluginPatchConfig;
  /** Whether runtime composition must omit this plugin. */
  disabled: boolean;
  /** Static Cordis service dependencies. */
  inject: PluginPatchInject;
}

/** Raised when a patch is outside the supported, data-only compatibility subset. */
export class PluginPatchError extends Error {
  constructor(message: string) {
    super(`plugin patch: ${message}`);
    this.name = "PluginPatchError";
  }
}

const ROOT_FIELDS = new Set(["plugins"]);
const ENTRY_FIELDS = new Set(["id", "name", "config", "disabled", "inject"]);
const EXPRESSION_OPEN_DELIMITER = "{{";
const EXPRESSION_CLOSE_DELIMITER = "}}";
const ARROW_FUNCTION_DELIMITER = "=>";
const FUNCTION_KEYWORD = "function";

/**
 * Parses the data-only `cordis.patch.yml` compatibility subset.
 *
 * This parser does not invoke Cordis Loader or process includes. Entrypoints are
 * resolved only when they are package-local and present in the verified inventory.
 */
export function parsePluginPatch(source: string, options: PluginPatchParseOptions): PluginPatchEntry[] {
  if (typeof source !== "string" || options === null || typeof options !== "object") {
    throw new PluginPatchError("invalid parser input");
  }
  const packageRoot = getVerifiedPackageRoot(options.packageRoot);
  const inventory = getVerifiedInventory(options.inventory);
  const document = parseDocument(source, { prettyErrors: false, strict: true, uniqueKeys: true });
  if (document.errors.length > 0 || document.warnings.length > 0) throw new PluginPatchError("invalid YAML");

  const patch = getMap(document.contents, "root object");
  assertExactFields(patch, ROOT_FIELDS);
  const pluginsNode = getRequiredField(patch, "plugins");
  rejectUnsafeNode(pluginsNode);
  if (!isSeq(pluginsNode)) throw new PluginPatchError("plugins must be an array");

  const ids = new Set<string>();
  const entries = pluginsNode.items.map((pluginNode) => {
    const entry = parsePluginEntry(pluginNode, packageRoot, inventory);
    if (ids.has(entry.id)) throw new PluginPatchError("duplicate id");
    ids.add(entry.id);
    return entry;
  });
  return entries.sort((left, right) => compareStrings(left.id, right.id));
}

function parsePluginEntry(node: unknown, packageRoot: string, inventory: ReadonlySet<string>): PluginPatchEntry {
  const entry = getMap(node, "plugin entry");
  assertExactFields(entry, ENTRY_FIELDS, ["id", "name"]);
  const id = getString(getRequiredField(entry, "id"), "id");
  const name = resolvePluginName(getString(getRequiredField(entry, "name"), "name"), packageRoot, inventory);
  const configNode = getOptionalField(entry, "config");
  const disabledNode = getOptionalField(entry, "disabled");
  const injectNode = getOptionalField(entry, "inject");
  return {
    id,
    name,
    config: configNode === undefined ? {} : parseConfig(configNode),
    disabled: disabledNode === undefined ? false : getBoolean(disabledNode, "disabled"),
    inject: injectNode === undefined ? [] : parseInject(injectNode),
  };
}

function getVerifiedPackageRoot(packageRoot: string): string {
  if (typeof packageRoot !== "string" || !isAbsolute(packageRoot)) throw new PluginPatchError("invalid package root");
  return resolve(packageRoot);
}

function getVerifiedInventory(inventoryInput: Iterable<string>): Set<string> {
  if (inventoryInput === null || typeof inventoryInput !== "object") {
    throw new PluginPatchError("invalid package inventory");
  }
  const inventory = new Set<string>();
  for (const fileName of inventoryInput) {
    if (typeof fileName !== "string" || !isSafeRelativePath(fileName) || inventory.has(fileName)) {
      throw new PluginPatchError("invalid package inventory");
    }
    inventory.add(fileName);
  }
  return inventory;
}

function resolvePluginName(name: string, packageRoot: string, inventory: ReadonlySet<string>): string {
  if (!name.startsWith("./") || !isSafeRelativePath(name.slice(2))) {
    throw new PluginPatchError("plugin name must be a package-local path");
  }
  const relativeName = name.slice(2);
  if (!inventory.has(relativeName)) throw new PluginPatchError("plugin entrypoint is not in the package inventory");
  const entrypoint = resolve(packageRoot, relativeName);
  if (relative(packageRoot, entrypoint).startsWith(".."))
    throw new PluginPatchError("plugin name escapes package root");
  return entrypoint;
}

function isSafeRelativePath(fileName: string): boolean {
  const segments = fileName.split("/");
  return (
    fileName.length > 0 &&
    !isAbsolute(fileName) &&
    !fileName.includes("\\") &&
    !segments.some((segment) => segment === "." || segment === "..")
  );
}

function parseInject(node: unknown): PluginPatchInject {
  const yamlNode = getNode(node);
  rejectUnsafeNode(yamlNode);
  if (isSeq(yamlNode)) {
    const names = yamlNode.items.map((injectNode) => getString(injectNode, "inject"));
    if (new Set(names).size !== names.length) throw new PluginPatchError("inject has duplicate service names");
    return names.sort(compareStrings);
  }
  if (!isMap(yamlNode)) throw new PluginPatchError("inject must be an array or object");
  const inject: { [service: string]: PluginPatchConfig } = Object.create(null);
  const services = yamlNode.items.map((pair) => ({
    name: getString(pair.key, "inject service"),
    config: parseConfig(getNode(pair.value)),
  }));
  services.sort((left, right) => compareStrings(left.name, right.name));
  for (const service of services) {
    if (Object.hasOwn(inject, service.name)) throw new PluginPatchError("inject has duplicate service names");
    inject[service.name] = service.config;
  }
  return inject;
}

function parseConfig(node: unknown): PluginPatchConfig {
  const yamlNode = getNode(node);
  rejectUnsafeNode(yamlNode);
  if (isScalar(yamlNode)) return parseConfigScalar(yamlNode.value);
  if (isSeq(yamlNode)) return yamlNode.items.map((itemNode) => parseConfig(itemNode));
  if (isMap(yamlNode)) {
    const config: { [key: string]: PluginPatchConfig } = Object.create(null);
    const fields = yamlNode.items.map((pair) => ({
      key: getString(pair.key, "config key"),
      value: parseConfig(getNode(pair.value)),
    }));
    fields.sort((left, right) => compareStrings(left.key, right.key));
    for (const field of fields) {
      if (Object.hasOwn(config, field.key)) throw new PluginPatchError("config has duplicate fields");
      config[field.key] = field.value;
    }
    return config;
  }
  throw new PluginPatchError("config must contain JSON-like data");
}

function parseConfigScalar(value: unknown): null | boolean | number | string {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && isStaticString(value)) return value;
  throw new PluginPatchError("config must contain JSON-like data");
}

function getMap(node: unknown, description: string): YAMLMap<unknown, unknown> {
  const yamlNode = getNode(node);
  rejectUnsafeNode(yamlNode);
  if (!isMap(yamlNode)) throw new PluginPatchError(`${description} must be an object`);
  return yamlNode;
}

function assertExactFields(
  map: YAMLMap<unknown, unknown>,
  allowed: ReadonlySet<string>,
  required: string[] = [],
): void {
  const fields = new Set<string>();
  for (const pair of map.items) {
    const field = getString(pair.key, "field name");
    if (!allowed.has(field) || fields.has(field)) throw new PluginPatchError("unsupported fields");
    fields.add(field);
  }
  if (required.some((field) => !fields.has(field))) throw new PluginPatchError("missing required fields");
}

function getRequiredField(map: YAMLMap<unknown, unknown>, field: string): Node {
  const node = getOptionalField(map, field);
  if (node === undefined) throw new PluginPatchError("missing required fields");
  return node;
}

function getOptionalField(map: YAMLMap<unknown, unknown>, expectedField: string): Node | undefined {
  const pair = map.items.find((candidate) => isScalar(candidate.key) && candidate.key.value === expectedField);
  return pair === undefined ? undefined : getNode(pair.value);
}

function getString(node: unknown, description: string): string {
  const yamlNode = getNode(node);
  rejectUnsafeNode(yamlNode);
  if (
    !isScalar(yamlNode) ||
    typeof yamlNode.value !== "string" ||
    yamlNode.value.length === 0 ||
    !isStaticString(yamlNode.value)
  ) {
    throw new PluginPatchError(`${description} must be a non-empty string`);
  }
  return yamlNode.value;
}

function isStaticString(value: string): boolean {
  return !hasExpressionDelimiter(value) && !hasFunctionSyntax(value);
}

function hasExpressionDelimiter(value: string): boolean {
  return value.includes(EXPRESSION_OPEN_DELIMITER) || value.includes(EXPRESSION_CLOSE_DELIMITER);
}

function hasFunctionSyntax(value: string): boolean {
  if (value.includes(ARROW_FUNCTION_DELIMITER)) return true;

  let keywordIndex = value.indexOf(FUNCTION_KEYWORD);
  while (keywordIndex !== -1) {
    const previousCharacter = value[keywordIndex - 1];
    const nextCharacter = value[keywordIndex + FUNCTION_KEYWORD.length];
    if (!isJavaScriptIdentifierCharacter(previousCharacter) && !isJavaScriptIdentifierCharacter(nextCharacter))
      return true;
    keywordIndex = value.indexOf(FUNCTION_KEYWORD, keywordIndex + FUNCTION_KEYWORD.length);
  }
  return false;
}

function isJavaScriptIdentifierCharacter(character: string | undefined): boolean {
  if (character === undefined) return false;
  const code = character.charCodeAt(0);
  return (
    character === "$" ||
    character === "_" ||
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  );
}

function getBoolean(node: unknown, description: string): boolean {
  const yamlNode = getNode(node);
  rejectUnsafeNode(yamlNode);
  if (!isScalar(yamlNode) || typeof yamlNode.value !== "boolean")
    throw new PluginPatchError(`${description} must be a boolean`);
  return yamlNode.value;
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function getNode(node: unknown): Node {
  if (!isNode(node)) throw new PluginPatchError("invalid YAML node");
  return node;
}

function rejectUnsafeNode(node: Node): void {
  if (isAlias(node) || node.anchor || node.tag) throw new PluginPatchError("unsupported YAML feature");
}
