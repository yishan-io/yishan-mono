package main

import (
	"bufio"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

const smokeTimeout = 30 * time.Second

type smokeOptions struct {
	sourceRoot string
	workspace  string
	scenario   string
}

type runtimeProcess struct {
	command *exec.Cmd
	stdin   io.WriteCloser
	output  *bufio.Scanner
}

func main() {
	if err := runSmoke(); err != nil {
		fmt.Fprintf(os.Stderr, "dsh smoke: %v\n", err)
		os.Exit(1)
	}
}

func runSmoke() error {
	options, err := readSmokeOptions()
	if err != nil {
		return err
	}
	if err := verifySourceRevision(options.sourceRoot, pinnedDSHRevision); err != nil {
		return err
	}
	runtime, err := buildSourceRuntimeForScenario(options.sourceRoot, options.scenario)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), smokeTimeout)
	defer cancel()
	process, err := startRuntime(ctx, runtime)
	if err != nil {
		return err
	}
	stopped := false
	defer func() {
		if !stopped {
			_ = stopRuntime(process) // best-effort cleanup after a failed handshake.
		}
	}()
	version, sessionID, err := runHandshake(process, options.workspace)
	if err != nil {
		return err
	}
	stopReason, err := runScenario(process, sessionID, options.scenario)
	if err != nil {
		return err
	}
	if err := stopRuntime(process); err != nil {
		return err
	}
	stopped = true
	fmt.Printf("protocol_version=%d session_id=%s stop_reason=%s\n", version, sessionID, stopReason)
	return nil
}

func readSmokeOptions() (smokeOptions, error) {
	options := smokeOptions{}
	flag.StringVar(&options.sourceRoot, "dsh-source-root", os.Getenv("YISHAN_DSH_SOURCE_ROOT"), "absolute DSH source root")
	flag.StringVar(&options.workspace, "workspace", "", "absolute workspace path")
	flag.StringVar(&options.scenario, "scenario", handshakeScenario, "smoke scenario: handshake or text-turn")
	flag.Parse()
	if options.sourceRoot == "" {
		return smokeOptions{}, fmt.Errorf("--dsh-source-root or YISHAN_DSH_SOURCE_ROOT is required")
	}
	if options.workspace == "" {
		workingDirectory, err := os.Getwd()
		if err != nil {
			return smokeOptions{}, fmt.Errorf("get working directory: %w", err)
		}
		options.workspace = workingDirectory
	}
	if !filepath.IsAbs(options.workspace) {
		return smokeOptions{}, fmt.Errorf("workspace must be absolute")
	}
	return options, nil
}

func startRuntime(ctx context.Context, runtime sourceRuntime) (*runtimeProcess, error) {
	command := exec.CommandContext(ctx, runtime.command, runtime.args...)
	command.Dir = runtime.dir
	command.Env = append(os.Environ(), mapEnvironment(runtime.env)...)
	command.Stderr = os.Stderr
	stdin, err := command.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("open runtime stdin: %w", err)
	}
	stdout, err := command.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("open runtime stdout: %w", err)
	}
	if err := command.Start(); err != nil {
		return nil, fmt.Errorf("start runtime: %w", err)
	}
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	return &runtimeProcess{command: command, stdin: stdin, output: scanner}, nil
}

func runHandshake(process *runtimeProcess, workspace string) (int, string, error) {
	if err := writeRequest(process.stdin, 1, "initialize", initializeParams()); err != nil {
		return 0, "", err
	}
	initialize, err := readResponse(process.output, 1)
	if err != nil {
		return 0, "", err
	}
	version, err := parseInitializeResult(initialize.Result)
	if err != nil {
		return 0, "", err
	}
	if err := writeRequest(process.stdin, 2, "session/new", newSessionParams(workspace)); err != nil {
		return 0, "", err
	}
	created, err := readResponse(process.output, 2)
	if err != nil {
		return 0, "", err
	}
	sessionID, err := parseSessionID(created.Result)
	return version, sessionID, err
}

func runScenario(process *runtimeProcess, sessionID, scenario string) (string, error) {
	if scenario == handshakeScenario {
		return "not-requested", nil
	}
	if err := writeRequest(process.stdin, 3, "session/prompt", promptParams(sessionID)); err != nil {
		return "", err
	}
	if scenario != textTurnScenario {
		return "", fmt.Errorf("unsupported DSH smoke scenario %q", scenario)
	}
	response, assistantText, err := readPromptResponse(process.output, 3, sessionID)
	if err != nil {
		return "", err
	}
	if assistantText != "PONG" {
		return "", fmt.Errorf("assistant response = %q, want PONG", assistantText)
	}
	return parsePromptResult(response.Result)
}

func initializeParams() map[string]any {
	return map[string]any{
		"protocolVersion":    1,
		"clientInfo":         map[string]string{"name": "yishan-dsh-smoke", "version": "0.1.0"},
		"clientCapabilities": map[string]any{},
	}
}

func newSessionParams(workspace string) map[string]any {
	return map[string]any{"cwd": workspace, "mcpServers": []any{}}
}

func promptParams(sessionID string) map[string]any {
	prompt := "Reply with exactly the word: PONG. Do not use any tools."
	return map[string]any{
		"sessionId": sessionID,
		"prompt":    []map[string]string{{"type": "text", "text": prompt}},
	}
}

func writeRequest(writer io.Writer, id int, method string, params map[string]any) error {
	request := map[string]any{"jsonrpc": "2.0", "id": id, "method": method, "params": params}
	encoded, err := json.Marshal(request)
	if err != nil {
		return fmt.Errorf("encode %s request: %w", method, err)
	}
	if _, err := writer.Write(append(encoded, '\n')); err != nil {
		return fmt.Errorf("write %s request: %w", method, err)
	}
	return nil
}

func readPromptResponse(scanner *bufio.Scanner, expectedID int, sessionID string) (responseEnvelope, string, error) {
	assistantText := ""
	for scanner.Scan() {
		line := scanner.Bytes()
		assistantText += parseAssistantTextUpdate(line, sessionID)
		response, err := parseResponse(line)
		if response.ID != expectedID {
			continue
		}
		if err != nil {
			return responseEnvelope{}, "", err
		}
		return response, assistantText, nil
	}
	if err := scanner.Err(); err != nil {
		return responseEnvelope{}, "", fmt.Errorf("read runtime output: %w", err)
	}
	return responseEnvelope{}, "", fmt.Errorf("runtime closed before response %d", expectedID)
}

func readResponse(scanner *bufio.Scanner, expectedID int) (responseEnvelope, error) {
	for scanner.Scan() {
		response, err := parseResponse(scanner.Bytes())
		if response.ID != expectedID {
			continue
		}
		if err != nil {
			return responseEnvelope{}, err
		}
		return response, nil
	}
	if err := scanner.Err(); err != nil {
		return responseEnvelope{}, fmt.Errorf("read runtime output: %w", err)
	}
	return responseEnvelope{}, fmt.Errorf("runtime closed before response %d", expectedID)
}

func stopRuntime(process *runtimeProcess) error {
	if err := process.stdin.Close(); err != nil {
		return fmt.Errorf("close runtime stdin: %w", err)
	}
	if err := process.command.Wait(); err != nil {
		return fmt.Errorf("wait for runtime: %w", err)
	}
	return nil
}

func mapEnvironment(values map[string]string) []string {
	environment := make([]string, 0, len(values))
	for key, value := range values {
		environment = append(environment, key+"="+value)
	}
	return environment
}
