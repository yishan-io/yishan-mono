import { describe, expect, it } from "vitest";

import { CODEGRAPH_TOOLS } from "./tools";

/** Converts frozen TypeBox definitions into a stable contract snapshot. */
function describeContract() {
  return CODEGRAPH_TOOLS.map(({ mcpMethod, name, parameters }) => ({
    name,
    mcpMethod,
    additionalProperties: "additionalProperties" in parameters ? parameters.additionalProperties : undefined,
    required: parameters.required ?? [],
    properties: Object.fromEntries(
      Object.entries(parameters.properties).map(([propertyName, property]) => [
        propertyName,
        {
          type: property.type,
          default: property.default,
          enum: property.enum,
          minLength: property.minLength,
          minimum: property.minimum,
        },
      ]),
    ),
  }));
}

describe("CODEGRAPH_TOOLS", () => {
  it("freezes the eight Pi and MCP tool contracts", () => {
    expect(describeContract()).toMatchInlineSnapshot(`
      [
        {
          "additionalProperties": undefined,
          "mcpMethod": "codegraph_search",
          "name": "codegraph_search",
          "properties": {
            "kind": {
              "default": undefined,
              "enum": [
                "function",
                "method",
                "class",
                "interface",
                "type",
                "variable",
                "route",
                "component",
              ],
              "minLength": undefined,
              "minimum": undefined,
              "type": "string",
            },
            "limit": {
              "default": 10,
              "enum": undefined,
              "minLength": undefined,
              "minimum": undefined,
              "type": "number",
            },
            "projectPath": {
              "default": undefined,
              "enum": undefined,
              "minLength": undefined,
              "minimum": undefined,
              "type": "string",
            },
            "query": {
              "default": undefined,
              "enum": undefined,
              "minLength": undefined,
              "minimum": undefined,
              "type": "string",
            },
          },
          "required": [
            "query",
          ],
        },
        {
          "additionalProperties": undefined,
          "mcpMethod": "codegraph_callers",
          "name": "codegraph_callers",
          "properties": {
            "limit": {
              "default": 20,
              "enum": undefined,
              "minLength": undefined,
              "minimum": undefined,
              "type": "number",
            },
            "projectPath": {
              "default": undefined,
              "enum": undefined,
              "minLength": undefined,
              "minimum": undefined,
              "type": "string",
            },
            "symbol": {
              "default": undefined,
              "enum": undefined,
              "minLength": undefined,
              "minimum": undefined,
              "type": "string",
            },
          },
          "required": [
            "symbol",
          ],
        },
        {
          "additionalProperties": undefined,
          "mcpMethod": "codegraph_callees",
          "name": "codegraph_callees",
          "properties": {
            "limit": {
              "default": 20,
              "enum": undefined,
              "minLength": undefined,
              "minimum": undefined,
              "type": "number",
            },
            "projectPath": {
              "default": undefined,
              "enum": undefined,
              "minLength": undefined,
              "minimum": undefined,
              "type": "string",
            },
            "symbol": {
              "default": undefined,
              "enum": undefined,
              "minLength": undefined,
              "minimum": undefined,
              "type": "string",
            },
          },
          "required": [
            "symbol",
          ],
        },
        {
          "additionalProperties": undefined,
          "mcpMethod": "codegraph_impact",
          "name": "codegraph_impact",
          "properties": {
            "depth": {
              "default": 2,
              "enum": undefined,
              "minLength": undefined,
              "minimum": undefined,
              "type": "number",
            },
            "projectPath": {
              "default": undefined,
              "enum": undefined,
              "minLength": undefined,
              "minimum": undefined,
              "type": "string",
            },
            "symbol": {
              "default": undefined,
              "enum": undefined,
              "minLength": undefined,
              "minimum": undefined,
              "type": "string",
            },
          },
          "required": [
            "symbol",
          ],
        },
        {
          "additionalProperties": undefined,
          "mcpMethod": "codegraph_explore",
          "name": "codegraph_explore",
          "properties": {
            "maxFiles": {
              "default": 12,
              "enum": undefined,
              "minLength": undefined,
              "minimum": undefined,
              "type": "number",
            },
            "projectPath": {
              "default": undefined,
              "enum": undefined,
              "minLength": undefined,
              "minimum": undefined,
              "type": "string",
            },
            "query": {
              "default": undefined,
              "enum": undefined,
              "minLength": undefined,
              "minimum": undefined,
              "type": "string",
            },
          },
          "required": [
            "query",
          ],
        },
        {
          "additionalProperties": undefined,
          "mcpMethod": "codegraph_node",
          "name": "codegraph_node",
          "properties": {
            "includeCode": {
              "default": false,
              "enum": undefined,
              "minLength": undefined,
              "minimum": undefined,
              "type": "boolean",
            },
            "projectPath": {
              "default": undefined,
              "enum": undefined,
              "minLength": undefined,
              "minimum": undefined,
              "type": "string",
            },
            "symbol": {
              "default": undefined,
              "enum": undefined,
              "minLength": undefined,
              "minimum": undefined,
              "type": "string",
            },
          },
          "required": [
            "symbol",
          ],
        },
        {
          "additionalProperties": undefined,
          "mcpMethod": "codegraph_status",
          "name": "codegraph_status",
          "properties": {
            "projectPath": {
              "default": undefined,
              "enum": undefined,
              "minLength": undefined,
              "minimum": undefined,
              "type": "string",
            },
          },
          "required": [],
        },
        {
          "additionalProperties": undefined,
          "mcpMethod": "codegraph_files",
          "name": "codegraph_files",
          "properties": {
            "format": {
              "default": "tree",
              "enum": [
                "tree",
                "flat",
                "grouped",
              ],
              "minLength": undefined,
              "minimum": undefined,
              "type": "string",
            },
            "includeMetadata": {
              "default": true,
              "enum": undefined,
              "minLength": undefined,
              "minimum": undefined,
              "type": "boolean",
            },
            "maxDepth": {
              "default": undefined,
              "enum": undefined,
              "minLength": undefined,
              "minimum": undefined,
              "type": "number",
            },
            "path": {
              "default": undefined,
              "enum": undefined,
              "minLength": undefined,
              "minimum": undefined,
              "type": "string",
            },
            "pattern": {
              "default": undefined,
              "enum": undefined,
              "minLength": undefined,
              "minimum": undefined,
              "type": "string",
            },
            "projectPath": {
              "default": undefined,
              "enum": undefined,
              "minLength": undefined,
              "minimum": undefined,
              "type": "string",
            },
          },
          "required": [],
        },
      ]
    `);
  });
});
