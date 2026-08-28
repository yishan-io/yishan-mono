type JsonRecord = Record<string, unknown>;

export function validRecognizedData(type: string, data: JsonRecord): boolean {
  if (type === "turn/start") return exactNumbers(data, ["turn"]);
  if (type === "turn/end")
    return hasExactKeys(data, ["turn", "reason"]) && isNonNegativeInteger(data.turn) && validTurnEndReason(data.reason);
  if (type === "step/start" || type === "step/end") return exactNumbers(data, ["turn", "step"]);
  if (type === "user/message") return validMessage(data, "user");
  if (type === "assistant/chunk") return exactStepData(data, ["chunk"]) && validChunk(data.chunk);
  if (type === "assistant/message")
    return (
      exactStepData(data, ["message", "usage", "interrupted"]) &&
      validMessage(data.message, "assistant") &&
      validOptionalUsage(data.usage) &&
      (data.interrupted === undefined || data.interrupted === true)
    );
  if (type === "tool/call")
    return (
      exactStepData(data, ["callId", "name", "arguments"]) &&
      [data.callId, data.name, data.arguments].every((value) => typeof value === "string")
    );
  if (type === "tool/result")
    return (
      exactStepData(data, ["message", "error", "meta"]) &&
      validMessage(data.message, "tool") &&
      validOptionalToolError(data.error) &&
      (data.meta === undefined || isJsonValue(data.meta))
    );
  if (type === "todo/write") return hasExactKeys(data, ["todos"]) && validTodos(data.todos);
  if (type === "request/header")
    return (
      hasExactKeys(data, ["header", "reason"]) &&
      validHeader(data.header) &&
      (data.reason === "initial" || data.reason === "resume" || data.reason === "change")
    );
  if (type === "request/context") return validRequestContext(data);
  if (type === "session/end-seed") return Object.keys(data).length === 0;
  return validInboxSplice(data);
}
function exactStepData(data: JsonRecord, optionalKeys: string[]): boolean {
  return (
    hasOnlyKeys(data, ["turn", "step", ...optionalKeys]) &&
    isNonNegativeInteger(data.turn) &&
    isNonNegativeInteger(data.step)
  );
}
function exactNumbers(data: JsonRecord, keys: string[]): boolean {
  return hasExactKeys(data, keys) && keys.every((key) => isNonNegativeInteger(data[key]));
}
function validTurnEndReason(input: unknown): boolean {
  const reason = asRecord(input);
  if (!reason || typeof reason.kind !== "string") return false;
  if (["completed", "blocked", "max-tokens", "interrupted"].includes(reason.kind))
    return hasExactKeys(reason, ["kind"]);
  if (reason.kind === "aborted") return hasExactKeys(reason, ["kind", "reason"]) && validCancelReason(reason.reason);
  return reason.kind === "error" && hasExactKeys(reason, ["kind", "error"]) && validFailure(reason.error);
}
function validCancelReason(input: unknown): boolean {
  const reason = asRecord(input);
  if (!reason || typeof reason.kind !== "string") return false;
  if (["user", "parent", "disposed", "legacy"].includes(reason.kind)) return hasExactKeys(reason, ["kind"]);
  return reason.kind === "hook" && hasExactKeys(reason, ["kind", "reason"]) && typeof reason.reason === "string";
}
function validFailure(input: unknown): boolean {
  const failure = asRecord(input);
  return (
    !!failure &&
    hasOnlyKeys(failure, ["message", "code", "status", "providerRetryAfterMs", "requestId"]) &&
    typeof failure.message === "string" &&
    typeof failure.code === "string" &&
    [failure.status, failure.providerRetryAfterMs].every(
      (value) => value === undefined || finiteNumber(value) !== null,
    ) &&
    (failure.requestId === undefined || typeof failure.requestId === "string")
  );
}
function validMessage(input: unknown, kind: "user" | "assistant" | "tool"): boolean {
  const message = asRecord(input);
  if (!message || typeof message.id !== "string" || !Array.isArray(message.content)) return false;
  if (kind === "user")
    return (
      hasExactKeys(message, ["id", "role", "content", "source"]) &&
      message.role === "user" &&
      validContent(message.content) &&
      validMessageSource(message.source)
    );
  if (kind === "assistant")
    return (
      hasExactKeys(message, ["id", "role", "content", "source"]) &&
      message.role === "assistant" &&
      validContent(message.content) &&
      validModelSource(message.source)
    );
  return (
    hasExactKeys(message, ["id", "role", "content", "source"]) &&
    message.role === "user" &&
    validToolResultContent(message.content) &&
    validToolSource(message.source)
  );
}
function validContent(input: unknown): boolean {
  return Array.isArray(input) && input.every(validContentBlock);
}
function validContentBlock(input: unknown): boolean {
  const block = asRecord(input);
  if (!block || typeof block.type !== "string") return false;
  if (block.type === "text" || block.type === "reasoning")
    return hasExactKeys(block, ["type", "text"]) && typeof block.text === "string";
  if (block.type === "tool-call")
    return (
      hasExactKeys(block, ["type", "id", "name", "arguments"]) &&
      [block.id, block.name, block.arguments].every((value) => typeof value === "string")
    );
  if (block.type === "tool-result")
    return (
      hasOnlyKeys(block, ["type", "toolCallId", "content", "isError"]) &&
      typeof block.toolCallId === "string" &&
      validContent(block.content) &&
      (block.isError === undefined || typeof block.isError === "boolean")
    );
  return block.type === "image" && validImageBlock(block);
}
function validImageBlock(block: JsonRecord): boolean {
  const attachment = asRecord(block.attachment);
  return (
    hasExactKeys(block, ["type", "attachment"]) &&
    !!attachment &&
    hasOnlyKeys(attachment, ["attachmentId", "mediaType", "bytes", "width", "height", "name", "originalDimensions"]) &&
    typeof attachment.attachmentId === "string" &&
    ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(String(attachment.mediaType)) &&
    [attachment.bytes, attachment.width, attachment.height].every(isNonNegativeInteger) &&
    (attachment.name === undefined || typeof attachment.name === "string") &&
    validOptionalDimensions(attachment.originalDimensions)
  );
}
function validOptionalDimensions(input: unknown): boolean {
  if (input === undefined) return true;
  const dimensions = asRecord(input);
  return (
    !!dimensions &&
    hasExactKeys(dimensions, ["width", "height"]) &&
    isNonNegativeInteger(dimensions.width) &&
    isNonNegativeInteger(dimensions.height)
  );
}
function validToolResultContent(input: unknown): boolean {
  return (
    Array.isArray(input) &&
    input.length === 1 &&
    validContentBlock(input[0]) &&
    asRecord(input[0])?.type === "tool-result"
  );
}
function validMessageSource(input: unknown): boolean {
  return validUserSource(input) || validModelSource(input) || validToolSource(input);
}
function validUserSource(input: unknown): boolean {
  const source = asRecord(input);
  if (!source) return false;
  if (source.kind === "user") return hasExactKeys(source, ["kind"]);
  if (source.kind === "skill-catalog") {
    return (
      hasExactKeys(source, ["kind", "form", "entries"]) &&
      typeof source.form === "string" &&
      isJsonValue(source.entries)
    );
  }
  if (source.kind !== "plugin" || typeof source.plugin !== "string") return false;
  if (source.form === undefined) return hasExactKeys(source, ["kind", "plugin"]);
  if (["instructions", "catalog", "relay", "recall"].includes(String(source.form)))
    return hasExactKeys(source, ["kind", "plugin", "form"]);
  if (source.form === "notice")
    return hasExactKeys(source, ["kind", "plugin", "form", "summary"]) && typeof source.summary === "string";
  return (
    source.form === "snapshot" &&
    hasExactKeys(source, ["kind", "plugin", "form", "sections"]) &&
    Array.isArray(source.sections) &&
    source.sections.every((section) => {
      const record = asRecord(section);
      return (
        !!record &&
        hasExactKeys(record, ["name", "text"]) &&
        typeof record.name === "string" &&
        typeof record.text === "string"
      );
    })
  );
}
function validModelSource(input: unknown): boolean {
  const source = asRecord(input);
  return (
    !!source &&
    hasOnlyKeys(source, ["kind", "provider", "model", "replayState"]) &&
    source.kind === "model" &&
    typeof source.provider === "string" &&
    typeof source.model === "string" &&
    (source.replayState === undefined || isJsonValue(source.replayState))
  );
}
function validToolSource(input: unknown): boolean {
  const source = asRecord(input);
  return (
    !!source && hasExactKeys(source, ["kind", "callId"]) && source.kind === "tool" && typeof source.callId === "string"
  );
}
function validChunk(input: unknown): boolean {
  const chunk = asRecord(input);
  if (!chunk || typeof chunk.type !== "string") return false;
  if (chunk.type === "block-start")
    return (
      hasExactKeys(chunk, ["type", "index", "blockType"]) &&
      isNonNegativeInteger(chunk.index) &&
      ["text", "reasoning", "image", "tool-call", "tool-result"].includes(String(chunk.blockType))
    );
  if (chunk.type === "text-delta" || chunk.type === "reasoning-delta")
    return (
      hasExactKeys(chunk, ["type", "index", "text"]) &&
      isNonNegativeInteger(chunk.index) &&
      typeof chunk.text === "string"
    );
  if (chunk.type === "tool-call-delta")
    return (
      hasOnlyKeys(chunk, ["type", "index", "id", "name", "argumentsDelta"]) &&
      isNonNegativeInteger(chunk.index) &&
      typeof chunk.id === "string" &&
      typeof chunk.argumentsDelta === "string" &&
      (chunk.name === undefined || typeof chunk.name === "string")
    );
  if (chunk.type === "block-end")
    return (
      hasExactKeys(chunk, ["type", "index", "block"]) &&
      isNonNegativeInteger(chunk.index) &&
      validContentBlock(chunk.block)
    );
  if (chunk.type === "usage") return hasExactKeys(chunk, ["type", "usage"]) && validUsage(chunk.usage);
  return (
    chunk.type === "finish" &&
    hasOnlyKeys(chunk, ["type", "reason", "replayState"]) &&
    validFinishReason(chunk.reason) &&
    (chunk.replayState === undefined || validReplayState(chunk.replayState))
  );
}
function validFinishReason(input: unknown): boolean {
  const reason = asRecord(input);
  if (!reason || typeof reason.kind !== "string") return false;
  if (["stop", "tool-calls", "max-tokens"].includes(reason.kind)) return hasExactKeys(reason, ["kind"]);
  return (
    ["aborted", "error"].includes(reason.kind) &&
    hasExactKeys(reason, ["kind", "failure"]) &&
    validFailure(reason.failure)
  );
}
function validReplayState(input: unknown): boolean {
  const replay = asRecord(input);
  return (
    !!replay &&
    hasOnlyKeys(replay, ["response", "blocks"]) &&
    "response" in replay &&
    isJsonValue(replay.response) &&
    (replay.blocks === undefined || (Array.isArray(replay.blocks) && replay.blocks.every(isJsonValue)))
  );
}
function validOptionalUsage(input: unknown): boolean {
  return input === undefined || validUsage(input);
}
function validUsage(input: unknown): boolean {
  const usage = asRecord(input);
  return (
    !!usage &&
    hasOnlyKeys(usage, ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "reasoningTokens"]) &&
    isNonNegativeInteger(usage.inputTokens) &&
    isNonNegativeInteger(usage.outputTokens) &&
    [usage.cacheReadTokens, usage.cacheWriteTokens, usage.reasoningTokens].every(
      (value) => value === undefined || isNonNegativeInteger(value),
    )
  );
}
function validOptionalToolError(input: unknown): boolean {
  const error = asRecord(input);
  return (
    input === undefined ||
    (!!error &&
      hasExactKeys(error, ["name", "code"]) &&
      typeof error.name === "string" &&
      typeof error.code === "string")
  );
}
function validTodos(input: unknown): boolean {
  return (
    Array.isArray(input) &&
    input.every((todo) => {
      const record = asRecord(todo);
      return (
        !!record &&
        hasExactKeys(record, ["content", "status"]) &&
        typeof record.content === "string" &&
        ["pending", "in_progress", "completed"].includes(String(record.status))
      );
    })
  );
}
function validHeader(input: unknown): boolean {
  const header = asRecord(input);
  return (
    !!header &&
    hasOnlyKeys(header, ["config", "adapterDefaults", "system", "tools"]) &&
    validCallConfig(header.config) &&
    (header.adapterDefaults === undefined || validAdapterDefaults(header.adapterDefaults)) &&
    (header.system === undefined || typeof header.system === "string") &&
    (header.tools === undefined || validTools(header.tools))
  );
}
function validCallConfig(input: unknown): boolean {
  const config = asRecord(input);
  return (
    !!config &&
    hasOnlyKeys(config, ["provider", "model", "reasoningEffort", "temperature", "maxTokens", "stop"]) &&
    typeof config.provider === "string" &&
    typeof config.model === "string" &&
    (config.reasoningEffort === undefined || typeof config.reasoningEffort === "string") &&
    [config.temperature, config.maxTokens].every((value) => value === undefined || finiteNumber(value) !== null) &&
    (config.stop === undefined ||
      (Array.isArray(config.stop) && config.stop.every((value) => typeof value === "string")))
  );
}
function validAdapterDefaults(input: unknown): boolean {
  const defaults = asRecord(input);
  return (
    !!defaults &&
    hasOnlyKeys(defaults, ["reasoningEffort", "maxTokens"]) &&
    [defaults.reasoningEffort, defaults.maxTokens].every((value) => value === undefined || value === true)
  );
}
function validTools(input: unknown): boolean {
  return (
    Array.isArray(input) &&
    input.every((tool) => {
      const record = asRecord(tool);
      return (
        !!record &&
        hasExactKeys(record, ["name", "description", "parameters"]) &&
        typeof record.name === "string" &&
        typeof record.description === "string" &&
        asRecord(record.parameters) !== null &&
        isJsonValue(record.parameters)
      );
    })
  );
}
function validRequestContext(data: JsonRecord): boolean {
  return (
    hasOnlyKeys(data, ["provider", "model", "contextWindow"]) &&
    typeof data.provider === "string" &&
    typeof data.model === "string" &&
    (data.contextWindow === undefined || isNonNegativeInteger(data.contextWindow))
  );
}
function validInboxSplice(data: JsonRecord): boolean {
  return (
    hasOnlyKeys(data, ["target", "start", "removedCount", "inserted", "outcome"]) &&
    (data.target === "next-turn" || data.target === "next-step") &&
    isNonNegativeInteger(data.start) &&
    (data.removedCount === undefined || isNonNegativeInteger(data.removedCount)) &&
    Array.isArray(data.inserted) &&
    data.inserted.every((message) => validMessage(message, "user")) &&
    (data.outcome === undefined || data.outcome === "canceled")
  );
}
function isJsonValue(input: unknown): boolean {
  if (input === null || typeof input === "string" || typeof input === "boolean") return true;
  if (typeof input === "number") return Number.isFinite(input);
  if (Array.isArray(input)) return input.every(isJsonValue);
  const record = asRecord(input);
  return !!record && Object.values(record).every(isJsonValue);
}

function asRecord(input: unknown): JsonRecord | null {
  return typeof input === "object" && input !== null && !Array.isArray(input) ? (input as JsonRecord) : null;
}
function hasExactKeys(record: JsonRecord, keys: string[]): boolean {
  return Object.keys(record).length === keys.length && hasOnlyKeys(record, keys);
}
function hasOnlyKeys(record: JsonRecord, keys: string[]): boolean {
  return Object.keys(record).every((key) => keys.includes(key));
}
function isNonNegativeInteger(input: unknown): boolean {
  return typeof input === "number" && Number.isSafeInteger(input) && input >= 0;
}
function finiteNumber(input: unknown): number | null {
  return typeof input === "number" && Number.isFinite(input) ? input : null;
}
