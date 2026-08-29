package app

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"testing"

	"yishan/apps/cli/internal/agent/dsh"
)

func appDSHRuntimeCommand(mode string) dsh.CommandFactory {
	return func(context.Context) (*exec.Cmd, error) {
		command := exec.Command(os.Args[0], "-test.run=TestAppDSHRuntimeHelperProcess", "--", mode)
		command.Env = append(os.Environ(), "GO_WANT_APP_DSH_RUNTIME=1")
		return command, nil
	}
}

// TestAppDSHRuntimeHelperProcess reads initialize before writing its response.
// Thus it cannot close stdin before the supervisor writes the request.
func TestAppDSHRuntimeHelperProcess(t *testing.T) {
	if os.Getenv("GO_WANT_APP_DSH_RUNTIME") != "1" {
		return
	}
	input := bufio.NewScanner(os.Stdin)
	if !input.Scan() {
		os.Exit(2)
	}
	if !writeAppDSHInitializeResponse(input.Bytes()) {
		os.Exit(3)
	}
	serveAppDSHShutdown(input)
	os.Exit(0)
}

func writeAppDSHInitializeResponse(request []byte) bool {
	var frame struct {
		Method string `json:"method"`
	}
	if json.Unmarshal(request, &frame) != nil || frame.Method != "initialize" {
		return false
	}
	_, _ = fmt.Fprintln(os.Stdout, `{"jsonrpc":"2.0","id":1,"result":{"serverInfo":{"name":"deepseek-harness-sdk-runtime","version":"0.0.1"}}}`)
	return true
}

func serveAppDSHShutdown(input *bufio.Scanner) {
	for input.Scan() {
		var frame struct {
			ID     uint64 `json:"id"`
			Method string `json:"method"`
		}
		if json.Unmarshal(input.Bytes(), &frame) == nil && frame.Method == "shutdown" {
			_, _ = fmt.Fprintf(os.Stdout, `{"jsonrpc":"2.0","id":%d,"result":{}}`+"\n", frame.ID)
			return
		}
	}
}
