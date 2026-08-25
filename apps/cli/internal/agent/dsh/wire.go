package dsh

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

const expectedServerName = "deepseek-harness-sdk-runtime"

func sendInitialize(stdin io.Writer, initialize InitializeConfig) error {
	params := map[string]any{"cwd": initialize.CWD, "provider": initialize.Provider, "model": initialize.Model}
	if initialize.MaxTokens > 0 {
		params["maxTokens"] = initialize.MaxTokens
	}
	request := map[string]any{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": params}
	frame, err := json.Marshal(request)
	if err != nil {
		return fmt.Errorf("encode DSH initialize: %w", err)
	}
	if _, err := stdin.Write(append(frame, '\n')); err != nil {
		return fmt.Errorf("write DSH initialize: %w", err)
	}
	return nil
}

type initializeResult struct {
	version string
	err     error
}

func readInitializeResponse(ctx context.Context, output *bufio.Scanner) (string, error) {
	response := make(chan initializeResult, 1)
	go func() {
		version, err := scanInitializeResponse(output)
		response <- initializeResult{version: version, err: err}
	}()
	select {
	case result := <-response:
		return result.version, result.err
	case <-ctx.Done():
		return "", fmt.Errorf("wait for DSH initialize: %w", ctx.Err())
	}
}

func scanInitializeResponse(output *bufio.Scanner) (string, error) {
	if output.Scan() {
		return parseInitializeResponse(output.Bytes())
	}
	if err := output.Err(); err != nil {
		return "", fmt.Errorf("read DSH initialize response: %w", err)
	}
	return "", errors.New("DSH runtime closed before initialize response")
}

func sendShutdown(stdin io.Writer) error {
	frame := []byte(`{"jsonrpc":"2.0","id":2,"method":"shutdown"}` + "\n")
	if _, err := stdin.Write(frame); err != nil {
		return fmt.Errorf("write DSH shutdown: %w", err)
	}
	return nil
}

func parseInitializeResponse(line []byte) (string, error) {
	var response struct {
		JSONRPC string `json:"jsonrpc"`
		ID      int    `json:"id"`
		Result  struct {
			ServerInfo struct {
				Name    string `json:"name"`
				Version string `json:"version"`
			} `json:"serverInfo"`
		} `json:"result"`
		Error *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(line, &response); err != nil {
		return "", fmt.Errorf("decode DSH initialize response: %w", err)
	}
	if response.JSONRPC != "2.0" || response.ID != 1 {
		return "", errors.New("invalid DSH initialize response")
	}
	if response.Error != nil {
		return "", fmt.Errorf("DSH initialize error %d: %s", response.Error.Code, response.Error.Message)
	}
	if response.Result.ServerInfo.Name != expectedServerName {
		return "", fmt.Errorf("DSH server name = %q, want %q", response.Result.ServerInfo.Name, expectedServerName)
	}
	if response.Result.ServerInfo.Version == "" {
		return "", errors.New("DSH server version is missing")
	}
	return response.Result.ServerInfo.Version, nil
}

func parseShutdownResponse(line []byte) (error, bool) {
	var response struct {
		JSONRPC string `json:"jsonrpc"`
		ID      int    `json:"id"`
		Error   *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if json.Unmarshal(line, &response) != nil || response.JSONRPC != "2.0" || response.ID != 2 {
		return nil, false
	}
	if response.Error != nil {
		return fmt.Errorf("DSH shutdown error %d: %s", response.Error.Code, response.Error.Message), true
	}
	return nil, true
}
