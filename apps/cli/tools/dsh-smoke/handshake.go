package main

import (
	"bytes"
	"encoding/json"
	"fmt"
)

const expectedACPProtocolVersion = 1

func parseInitializeResult(rawResult json.RawMessage) (int, error) {
	var result map[string]json.RawMessage
	if err := json.Unmarshal(rawResult, &result); err != nil {
		return 0, fmt.Errorf("decode initialize result: %w", err)
	}
	if err := requireJSONKeys(result, "initialize result", "protocolVersion", "agentInfo", "agentCapabilities", "authMethods"); err != nil {
		return 0, err
	}
	if err := validateACPAgentInfo(result["agentInfo"]); err != nil {
		return 0, err
	}
	if err := validateACPCapabilities(result["agentCapabilities"]); err != nil {
		return 0, err
	}
	var protocolVersion int
	if err := json.Unmarshal(result["protocolVersion"], &protocolVersion); err != nil {
		return 0, fmt.Errorf("decode ACP protocol version: %w", err)
	}
	if protocolVersion != expectedACPProtocolVersion {
		return 0, fmt.Errorf("ACP protocol version = %d, want %d", protocolVersion, expectedACPProtocolVersion)
	}
	if !bytes.Equal(bytes.TrimSpace(result["authMethods"]), []byte("[]")) {
		return 0, fmt.Errorf("ACP authMethods must be empty")
	}
	return protocolVersion, nil
}

func validateACPAgentInfo(raw json.RawMessage) error {
	var agentInfo map[string]json.RawMessage
	if err := json.Unmarshal(raw, &agentInfo); err != nil {
		return fmt.Errorf("decode ACP agent info: %w", err)
	}
	if err := requireJSONKeys(agentInfo, "ACP agent info", "name", "version"); err != nil {
		return err
	}
	var name, version string
	if err := json.Unmarshal(agentInfo["name"], &name); err != nil || name != "deepseek-harness-acp" {
		return fmt.Errorf("unexpected ACP agent name %q", name)
	}
	if err := json.Unmarshal(agentInfo["version"], &version); err != nil || version != "0.0.1" {
		return fmt.Errorf("unexpected ACP agent version %q", version)
	}
	return nil
}

func validateACPCapabilities(raw json.RawMessage) error {
	var capabilities map[string]json.RawMessage
	if err := json.Unmarshal(raw, &capabilities); err != nil {
		return fmt.Errorf("decode ACP capabilities: %w", err)
	}
	if err := requireJSONKeys(capabilities, "ACP capabilities", "promptCapabilities"); err != nil {
		return err
	}
	var prompt map[string]json.RawMessage
	if err := json.Unmarshal(capabilities["promptCapabilities"], &prompt); err != nil {
		return fmt.Errorf("decode ACP prompt capabilities: %w", err)
	}
	if err := requireJSONKeys(prompt, "ACP prompt capabilities", "image", "audio", "embeddedContext"); err != nil {
		return err
	}
	for _, capability := range prompt {
		if !bytes.Equal(bytes.TrimSpace(capability), []byte("false")) {
			return fmt.Errorf("unexpected ACP prompt capability")
		}
	}
	return nil
}

func requireJSONKeys(record map[string]json.RawMessage, name string, keys ...string) error {
	if len(record) != len(keys) {
		return fmt.Errorf("%s has unexpected fields", name)
	}
	for _, key := range keys {
		if _, exists := record[key]; !exists {
			return fmt.Errorf("%s is missing %s", name, key)
		}
	}
	return nil
}

func parsePromptResult(rawResult json.RawMessage) (string, error) {
	var result struct {
		StopReason string `json:"stopReason"`
	}
	if err := json.Unmarshal(rawResult, &result); err != nil {
		return "", fmt.Errorf("decode session/prompt result: %w", err)
	}
	if result.StopReason == "" {
		return "", fmt.Errorf("session/prompt result has no stop reason")
	}
	return result.StopReason, nil
}

func parseSessionID(rawResult json.RawMessage) (string, error) {
	var result struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.Unmarshal(rawResult, &result); err != nil {
		return "", fmt.Errorf("decode session/new result: %w", err)
	}
	if result.SessionID == "" {
		return "", fmt.Errorf("session/new result has no session ID")
	}
	return result.SessionID, nil
}
