import { describe, expect, it } from "vitest";

import { parsePluginPatch } from "./patch";

const packageRoot = "/verified/plugins/example";
const inventory = ["dist/agent.js", "dist/disabled.js"];

function parsePatch(source: string) {
  return parsePluginPatch(source, { packageRoot, inventory });
}

describe("parsePluginPatch", () => {
  it("parses and deterministically orders package-local static plugins", () => {
    expect(
      parsePatch(`
plugins:
  - id: z-agent
    name: ./dist/agent.js
    config:
      retries: 2
      modes: [fast, safe]
    inject:
      logger:
        level: debug
      session: null
  - id: a-disabled
    name: ./dist/disabled.js
    disabled: true
`),
    ).toEqual([
      {
        id: "a-disabled",
        name: "/verified/plugins/example/dist/disabled.js",
        config: {},
        disabled: true,
        inject: [],
      },
      {
        id: "z-agent",
        name: "/verified/plugins/example/dist/agent.js",
        config: { retries: 2, modes: ["fast", "safe"] },
        disabled: false,
        inject: { logger: { level: "debug" }, session: null },
      },
    ]);
  });

  it.each([
    ["groups", "groups: []"],
    ["includes", "includes: [other.yml]"],
    ["builtins", "builtins: [fs]"],
    ["unknown field", "plugins: []\nwatch: true"],
    ["entry unknown field", "plugins:\n  - id: agent\n    name: ./dist/agent.js\n    enable: true"],
    ["anchor", "plugins:\n  - &agent\n    id: agent\n    name: ./dist/agent.js"],
    ["alias", "plugins:\n  - id: agent\n    name: *agent"],
    ["anchored plugin list", "plugins: &plugins []"],
    ["custom tag", "plugins:\n  - id: agent\n    name: !!js/function ./dist/agent.js"],
    ["expression", "plugins:\n  - id: agent\n    name: ./dist/agent.js\n    config: ${{ process.env.SECRET }}"],
    ["function", "plugins:\n  - id: agent\n    name: ./dist/agent.js\n    config: function () {}"],
  ])("rejects %s", (_description, source) => {
    expect(() => parsePatch(source)).toThrow(/plugin patch/i);
  });

  it.each([
    ["absolute imports", "/tmp/agent.js"],
    ["package escapes", "../agent.js"],
    ["bare imports", "agent"],
    ["unverified files", "./dist/missing.js"],
  ])("rejects %s", (_description, name) => {
    expect(() => parsePatch(`plugins:\n  - id: agent\n    name: ${name}`)).toThrow(/plugin patch/i);
  });

  it("requires an absolute root and verified relative inventory", () => {
    expect(() => parsePluginPatch("plugins: []", { packageRoot: "plugins", inventory })).toThrow(
      "invalid package root",
    );
    expect(() => parsePluginPatch("plugins: []", { packageRoot, inventory: ["../agent.js"] })).toThrow(
      "invalid package inventory",
    );
  });

  it("rejects duplicate IDs without disclosing the plugin ID", () => {
    const untrustedId = "untrusted-plugin-id";

    expect(() =>
      parsePatch(`plugins:
  - id: ${untrustedId}
    name: ./dist/agent.js
  - id: ${untrustedId}
    name: ./dist/disabled.js
`),
    ).toThrow("plugin patch: duplicate id");
    expect(() =>
      parsePatch(`plugins:
  - id: ${untrustedId}
    name: ./dist/agent.js
  - id: ${untrustedId}
    name: ./dist/disabled.js
`),
    ).not.toThrow(untrustedId);
  });

  it.each([
    ["object", "zebra: null\n      alpha: null", ["alpha", "zebra"]],
    ["array", "- zebra\n      - alpha", ["alpha", "zebra"]],
  ])("sorts %s-form inject services canonically", (_form, inject, expectedServices) => {
    const entries = parsePatch(`plugins:
  - id: agent
    name: ./dist/agent.js
    inject:
      ${inject}`);

    const injectServices = Array.isArray(entries[0]?.inject)
      ? entries[0].inject
      : Object.keys(entries[0]?.inject ?? {});
    expect(injectServices).toEqual(expectedServices);
  });

  it("produces the same inject array for every service ordering", () => {
    const permutations = [
      ["alpha", "mango", "zebra"],
      ["alpha", "zebra", "mango"],
      ["mango", "alpha", "zebra"],
      ["mango", "zebra", "alpha"],
      ["zebra", "alpha", "mango"],
      ["zebra", "mango", "alpha"],
    ];

    const parsedInjects = permutations.map(
      (services) =>
        parsePatch(`plugins:
  - id: agent
    name: ./dist/agent.js
    inject:
${services.map((service) => `      - ${service}`).join("\n")}`).at(0)?.inject,
    );

    expect(parsedInjects).toEqual(permutations.map(() => ["alpha", "mango", "zebra"]));
  });

  const unsafeStrings = [
    "prefix {{ suffix",
    "prefix }} suffix",
    "function* generator() {}",
    "function /* generator comment */ * generator() {}",
    "async /* comment */ function /* generator comment */ * generator() {}",
    "value /* comment */ => value",
  ];

  it.each([
    ["id", (unsafe: string) => `id: ${JSON.stringify(unsafe)}`],
    ["name", (unsafe: string) => `name: ${JSON.stringify(unsafe)}`],
    ["config key", (unsafe: string) => `config:\n      ${JSON.stringify(unsafe)}: value`],
    ["config scalar", (unsafe: string) => `config: ${JSON.stringify(unsafe)}`],
    ["inject array name", (unsafe: string) => `inject: [${JSON.stringify(unsafe)}]`],
    ["inject object name", (unsafe: string) => `inject:\n      ${JSON.stringify(unsafe)}: null`],
  ])("rejects unsafe strings in %s", (_description, buildField) => {
    for (const unsafe of unsafeStrings) {
      expect(() =>
        parsePatch(`plugins:
  - id: agent
    name: ./dist/agent.js
    ${buildField(unsafe)}`),
      ).toThrow(/plugin patch/i);
    }
  });
});
