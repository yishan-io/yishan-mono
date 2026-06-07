package modellist

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sort"
	"strings"
)

const copilotAgentKind = "copilot"

type copilotACPResult struct {
	ID     json.RawMessage `json:"id"`
	Result json.RawMessage `json:"result"`
}

type copilotModelEntry struct {
	ModelID  string `json:"modelId"`
	Name     string `json:"name"`
}

type copilotSessionNewResult struct {
	Models struct {
		AvailableModels []copilotModelEntry `json:"availableModels"`
		CurrentModelID  string              `json:"currentModelId"`
	} `json:"models"`
}

type copilotFetcher struct{}

func (f copilotFetcher) AgentKind() string { return copilotAgentKind }

func (f copilotFetcher) Fetch() ([]ModelInfo, error) {
	return discoverCopilotACP()
}

func discoverCopilotACP() ([]ModelInfo, error) {
	if _, err := exec.LookPath("copilot"); err != nil {
		return nil, fmt.Errorf("copilot not found: %w", err)
	}

	cmd := exec.Command("copilot", "--acp")
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("open stdin: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		stdin.Close()
		return nil, fmt.Errorf("open stdout: %w", err)
	}
	cmd.Stderr = io.Discard

	if err := cmd.Start(); err != nil {
		stdin.Close()
		return nil, fmt.Errorf("start copilot acp: %w", err)
	}
	defer func() {
		stdin.Close()
		cmd.Process.Kill()
		cmd.Process.Wait()
	}()

	if err := writeACPJSON(stdin, 1, "initialize", map[string]any{
		"protocolVersion":    1,
		"clientInfo":         map[string]any{"name": "yishan-model-discovery", "version": "0.1.0"},
		"clientCapabilities": map[string]any{},
	}); err != nil {
		return nil, fmt.Errorf("send initialize: %w", err)
	}

	tmpDir, err := os.MkdirTemp("", "yishan-copilot-discovery-")
	if err != nil {
		return nil, fmt.Errorf("create temp dir: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	if err := writeACPJSON(stdin, 2, "session/new", map[string]any{
		"cwd":        tmpDir,
		"mcpServers": []any{},
	}); err != nil {
		return nil, fmt.Errorf("send session/new: %w", err)
	}

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 1024*1024), 4*1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var envelope copilotACPResult
		if err := json.Unmarshal([]byte(line), &envelope); err != nil {
			continue
		}
		if string(envelope.ID) != "2" || len(envelope.Result) == 0 {
			continue
		}
		return parseCopilotSessionNewModels(envelope.Result), nil
	}
	return nil, fmt.Errorf("no session/new response from copilot acp")
}

func writeACPJSON(w io.Writer, id int, method string, params map[string]any) error {
	msg := map[string]any{
		"jsonrpc": "2.0",
		"id":      id,
		"method":  method,
		"params":  params,
	}
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	data = append(data, '\n')
	_, err = w.Write(data)
	return err
}

func parseCopilotSessionNewModels(raw json.RawMessage) []ModelInfo {
	var resp copilotSessionNewResult
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil
	}
	models := make([]ModelInfo, 0, len(resp.Models.AvailableModels))
	seen := make(map[string]struct{})
	for _, m := range resp.Models.AvailableModels {
		id := strings.TrimSpace(m.ModelID)
		if id == "" {
			continue
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		name := strings.TrimSpace(m.Name)
		if name == "" || strings.EqualFold(name, "unknown") {
			name = id
		}
		models = append(models, ModelInfo{ID: id, Name: name})
	}
	sort.Slice(models, func(i, j int) bool { return models[i].ID < models[j].ID })
	return models
}
